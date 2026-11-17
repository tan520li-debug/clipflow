import type { ClonedVoiceProfile, DigitalHumanProfile, MediaAsset } from '../../types/studio';
import { BUILTIN_MEDIA_ASSETS } from '../../utils/autoEditEngine';
import { BUILTIN_DIGITAL_HUMAN_PRESETS } from '../../utils/digitalHumanAssets';
import { readRecord, writeRecord } from './recordsDb';
import {
  compactStudioSession,
  normalizeStudioSession,
  restoreSpilledCueAudio,
  spillOversizedCueAudio,
  spilledCueAudioKeys,
  STUDIO_SESSION_STORAGE_KEY,
  type StudioSessionSnapshot,
} from './studioSession';

export const DH_PROFILES_STORAGE_KEY = 'clipflow_digital_humans_v1';
export const DH_UPLOADED_ASSETS_STORAGE_KEY = 'clipflow_dh_uploaded_assets_v1';
export const CLONED_VOICES_STORAGE_KEY = 'clipflow_cloned_voices_v1';

const MAX_STORED_PROFILES = 6;
const MAX_STORED_VOICES = 6;
const MAX_STORED_UPLOADS = 6;
const SAMPLE_AUDIO_KEEP_CHARS = 350_000;
const UPLOADED_DATA_URL_MAX_CHARS = 2_800_000;

export interface StudioLibrarySnapshot {
  digitalHumans: DigitalHumanProfile[];
  clonedVoices: ClonedVoiceProfile[];
  assets: MediaAsset[];
  session: StudioSessionSnapshot | null;
}

const pendingMigrations = new Map<string, Promise<unknown>>();
const saveQueues = new Map<string, Promise<void>>();

function enqueueSave(key: string, run: () => Promise<void>): Promise<void> {
  const previous = saveQueues.get(key) ?? Promise.resolve();
  const finished = previous.then(run, run);
  saveQueues.set(
    key,
    finished.then(
      () => undefined,
      () => undefined,
    ),
  );
  return finished;
}

function readLocalJson(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw == null) return undefined;
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

function clearLegacyLocalStorage(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // IndexedDB already holds the record.
  }
}

async function migrateLocalStorageRecord(key: string): Promise<unknown> {
  const existing = await readRecord(key);
  if (existing !== undefined) return existing;
  const fromLocal = readLocalJson(key);
  if (fromLocal === undefined) return undefined;
  await enqueueSave(key, async () => {
    try {
      await writeRecord(key, fromLocal);
      clearLegacyLocalStorage(key);
    } catch {
      // Keep localStorage so a later open can migrate it.
    }
  });
  return fromLocal;
}

function readMigratedRecord(key: string): Promise<unknown> {
  const pending = pendingMigrations.get(key);
  if (pending) return pending;
  const next = migrateLocalStorageRecord(key).finally(() => {
    pendingMigrations.delete(key);
  });
  pendingMigrations.set(key, next);
  return next;
}

export function normalizeStoredDigitalHumans(raw: unknown): DigitalHumanProfile[] {
  try {
    if (!Array.isArray(raw)) return [];
    return (raw as DigitalHumanProfile[]).map((profile) => {
      const hasValidUrl =
        typeof profile.avatarUrl === 'string' &&
        profile.avatarUrl.length > 0 &&
        !profile.avatarUrl.startsWith('blob:');
      return {
        ...profile,
        avatarUrl: hasValidUrl ? profile.avatarUrl : BUILTIN_DIGITAL_HUMAN_PRESETS[0].avatarUrl,
        avatarMediaType: hasValidUrl ? profile.avatarMediaType : 'image',
      };
    });
  } catch {
    return [];
  }
}

export function normalizeStoredClonedVoices(raw: unknown): ClonedVoiceProfile[] {
  return Array.isArray(raw) ? (raw as ClonedVoiceProfile[]) : [];
}

/** Rebuild the asset list the way the editor used to on startup. */
export function assembleLibraryAssets(uploadedRaw: unknown, profilesRaw: unknown): MediaAsset[] {
  const persistedAssets: MediaAsset[] = [];
  const seenIds = new Set<string>(BUILTIN_MEDIA_ASSETS.map((asset) => asset.id));
  const seenUrls = new Set<string>(BUILTIN_MEDIA_ASSETS.map((asset) => asset.url));
  try {
    if (Array.isArray(uploadedRaw)) {
      for (const item of uploadedRaw as MediaAsset[]) {
        if (
          item &&
          typeof item.id === 'string' &&
          typeof item.url === 'string' &&
          !item.url.startsWith('blob:') &&
          !seenIds.has(item.id)
        ) {
          seenIds.add(item.id);
          seenUrls.add(item.url);
          persistedAssets.push(item);
        }
      }
    }
    if (Array.isArray(profilesRaw)) {
      for (const prof of profilesRaw as DigitalHumanProfile[]) {
        if (
          prof &&
          typeof prof.avatarUrl === 'string' &&
          prof.avatarUrl.startsWith('data:') &&
          !prof.avatarUrl.startsWith('data:image/svg+xml') &&
          !seenUrls.has(prof.avatarUrl)
        ) {
          const assetId = prof.avatarAssetId || `dh-upload-${prof.id}`;
          if (!seenIds.has(assetId)) {
            seenIds.add(assetId);
            seenUrls.add(prof.avatarUrl);
            persistedAssets.push({
              id: assetId,
              name: `${prof.name}-形象`,
              type: prof.avatarMediaType === 'video' ? 'video' : 'image',
              url: prof.avatarUrl,
              duration: 5,
              width: 540,
              height: 720,
              source: 'upload',
            });
          }
        }
      }
    }
  } catch {
    // ignore storage errors
  }
  return [...persistedAssets, ...BUILTIN_MEDIA_ASSETS];
}

export function preferSessionRecords<T extends { id: string }>(current: T[], stored: T[]): T[] {
  if (current.length === 0) return stored;
  const ids = new Set(current.map((item) => item.id));
  const rest = stored.filter((item) => !ids.has(item.id));
  return rest.length === 0 ? current : [...current, ...rest];
}

export function mergeHydratedAssets(current: MediaAsset[], hydrated: MediaAsset[]): MediaAsset[] {
  const hydratedIds = new Set(hydrated.map((asset) => asset.id));
  const addedDuringLoad = current.filter((asset) => !hydratedIds.has(asset.id));
  return addedDuringLoad.length === 0 ? hydrated : [...addedDuringLoad, ...hydrated];
}

export async function loadStudioLibrary(): Promise<StudioLibrarySnapshot> {
  const [profilesRaw, uploadedRaw, voicesRaw, sessionRaw] = await Promise.all([
    readMigratedRecord(DH_PROFILES_STORAGE_KEY),
    readMigratedRecord(DH_UPLOADED_ASSETS_STORAGE_KEY),
    readMigratedRecord(CLONED_VOICES_STORAGE_KEY),
    readMigratedRecord(STUDIO_SESSION_STORAGE_KEY),
  ]);
  return {
    digitalHumans: normalizeStoredDigitalHumans(profilesRaw),
    clonedVoices: normalizeStoredClonedVoices(voicesRaw),
    assets: assembleLibraryAssets(uploadedRaw, profilesRaw),
    session: await hydrateStudioSession(normalizeStudioSession(sessionRaw)),
  };
}

async function hydrateStudioSession(
  session: StudioSessionSnapshot | null,
): Promise<StudioSessionSnapshot | null> {
  if (!session) return null;
  const keys = spilledCueAudioKeys(session);
  if (keys.length === 0) return session;
  const audioByKey = new Map<string, string>();
  await Promise.all(
    keys.map(async (key) => {
      const stored = await readRecord(key);
      if (typeof stored === 'string' && stored.length > 0) audioByKey.set(key, stored);
    }),
  );
  return restoreSpilledCueAudio(session, audioByKey);
}

function compactDigitalHumanProfiles(profiles: DigitalHumanProfile[]): DigitalHumanProfile[] {
  return profiles.map((profile, index) =>
    index === 0
      ? {
          ...profile,
          sampleAudioBase64:
            profile.sampleAudioBase64 && profile.sampleAudioBase64.length < SAMPLE_AUDIO_KEEP_CHARS
              ? profile.sampleAudioBase64
              : undefined,
        }
      : { ...profile, sampleAudioBase64: undefined, sampleAudioMimeType: undefined },
  );
}

export function saveDigitalHumanProfiles(profiles: DigitalHumanProfile[]): Promise<void> {
  const trimmed = profiles.slice(0, MAX_STORED_PROFILES);
  return enqueueSave(DH_PROFILES_STORAGE_KEY, async () => {
    try {
      await writeRecord(DH_PROFILES_STORAGE_KEY, trimmed);
      clearLegacyLocalStorage(DH_PROFILES_STORAGE_KEY);
    } catch {
      // If the audio payload exceeds the storage quota, keep compact profiles and avatarUrl.
      try {
        await writeRecord(DH_PROFILES_STORAGE_KEY, compactDigitalHumanProfiles(trimmed));
        clearLegacyLocalStorage(DH_PROFILES_STORAGE_KEY);
      } catch {
        // ignore storage quota errors
      }
    }
  });
}

export function saveClonedVoices(voices: ClonedVoiceProfile[]): Promise<void> {
  const trimmed = voices.slice(0, MAX_STORED_VOICES);
  return enqueueSave(CLONED_VOICES_STORAGE_KEY, async () => {
    try {
      await writeRecord(CLONED_VOICES_STORAGE_KEY, trimmed);
      clearLegacyLocalStorage(CLONED_VOICES_STORAGE_KEY);
    } catch {
      // ignore storage quota errors
    }
  });
}

export function saveStudioSession(session: StudioSessionSnapshot): Promise<void> {
  return enqueueSave(STUDIO_SESSION_STORAGE_KEY, async () => {
    try {
      await writeRecord(STUDIO_SESSION_STORAGE_KEY, session);
    } catch {
      const spilled = spillOversizedCueAudio(session);
      try {
        for (const item of spilled.spilled) {
          await writeRecord(item.key, item.audioBase64);
        }
        await writeRecord(STUDIO_SESSION_STORAGE_KEY, compactStudioSession(spilled.session));
      } catch {
        try {
          await writeRecord(STUDIO_SESSION_STORAGE_KEY, compactStudioSession(session));
        } catch {
          // ignore storage quota errors
        }
      }
    }
  });
}

export function saveUploadedAssets(assets: MediaAsset[]): Promise<void> {
  const dhUploaded = assets
    .filter(
      (asset) =>
        asset.source === 'upload' &&
        (asset.id.startsWith('dh-upload-') || asset.id.startsWith('dh-asset-')) &&
        asset.url.startsWith('data:') &&
        asset.url.length < UPLOADED_DATA_URL_MAX_CHARS,
    )
    .slice(0, MAX_STORED_UPLOADS);
  return enqueueSave(DH_UPLOADED_ASSETS_STORAGE_KEY, async () => {
    try {
      await writeRecord(DH_UPLOADED_ASSETS_STORAGE_KEY, dhUploaded);
      clearLegacyLocalStorage(DH_UPLOADED_ASSETS_STORAGE_KEY);
    } catch {
      // ignore storage quota errors
    }
  });
}
