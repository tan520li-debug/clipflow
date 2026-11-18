import type {
  EditingStyle,
  PlatformId,
  PlatformProjectState,
  VoiceoverCue,
} from '../../types/studio';

export const STUDIO_SESSION_STORAGE_KEY = 'clipflow_studio_session_v1';

const PLATFORM_IDS: readonly PlatformId[] = [
  'douyin',
  'xiaohongshu',
  'tiktok',
  'instagram',
  'facebook',
];
const EDITION_IDS: readonly PlatformId[] = ['douyin', 'tiktok'];
const EDITING_STYLES: readonly EditingStyle[] = [
  'beat-sync',
  'talking-head',
  'cinematic-story',
  'product-showcase',
];

export interface StudioSessionSnapshot {
  activePlatform: PlatformId;
  projects: Partial<Record<PlatformId, PlatformProjectState>>;
  brief: string;
  editingStyle: EditingStyle;
  targetPlatforms: PlatformId[];
  targetDuration: number;
  bpm: number;
  autoSoundOnEdit: boolean;
  selectedClipId: string | null;
  selectedSubtitleId: string | null;
  playheadSec: number;
}

function isPlatformId(value: unknown): value is PlatformId {
  return typeof value === 'string' && PLATFORM_IDS.includes(value as PlatformId);
}

function isProject(value: unknown): value is PlatformProjectState {
  if (!value || typeof value !== 'object') return false;
  const project = value as PlatformProjectState;
  return (
    isPlatformId(project.platform) &&
    Array.isArray(project.clips) &&
    Array.isArray(project.subtitles) &&
    project.copy != null &&
    typeof project.copy === 'object' &&
    project.audio != null &&
    typeof project.audio === 'object'
  );
}

export function normalizeStudioSession(raw: unknown): StudioSessionSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const session = raw as Partial<StudioSessionSnapshot>;
  if (!session.projects || typeof session.projects !== 'object') return null;

  const projects: Partial<Record<PlatformId, PlatformProjectState>> = {};
  for (const platform of PLATFORM_IDS) {
    const project = session.projects[platform];
    if (isProject(project) && project.platform === platform) projects[platform] = project;
  }
  if (Object.keys(projects).length === 0) return null;

  const savedPlatform = isPlatformId(session.activePlatform) ? session.activePlatform : 'douyin';
  const activePlatform = EDITION_IDS.includes(savedPlatform) ? savedPlatform : 'douyin';
  const brief = typeof session.brief === 'string' ? session.brief.slice(0, 4000) : '';
  const editingStyle = EDITING_STYLES.includes(session.editingStyle as EditingStyle)
    ? (session.editingStyle as EditingStyle)
    : 'beat-sync';
  const targetPlatforms: PlatformId[] = Array.isArray(session.targetPlatforms)
    ? session.targetPlatforms.filter((id): id is PlatformId => EDITION_IDS.includes(id as PlatformId))
    : ['douyin'];
  const duration = Number(session.targetDuration);
  const bpm = Number(session.bpm);
  const playhead = Number(session.playheadSec);

  return {
    activePlatform: projects[activePlatform] ? activePlatform : (Object.keys(projects)[0] as PlatformId),
    projects,
    brief,
    editingStyle,
    targetPlatforms: targetPlatforms.length > 0 ? targetPlatforms : (['douyin'] as PlatformId[]),
    targetDuration: Number.isFinite(duration) ? Math.min(120, Math.max(5, duration)) : 15,
    bpm: Number.isFinite(bpm) ? Math.min(240, Math.max(40, Math.round(bpm))) : 128,
    autoSoundOnEdit: session.autoSoundOnEdit === true,
    selectedClipId: typeof session.selectedClipId === 'string' ? session.selectedClipId : null,
    selectedSubtitleId:
      typeof session.selectedSubtitleId === 'string' ? session.selectedSubtitleId : null,
    playheadSec: Number.isFinite(playhead) ? Math.min(3600, Math.max(0, playhead)) : 0,
  };
}

const AUDIO_KEEP_CHARS = 180_000;

export const CUE_AUDIO_REF_PREFIX = 'clipflow-cue-audio:';

export interface SpilledCueAudio {
  key: string;
  audioBase64: string;
}

function compactCue(cue: VoiceoverCue): VoiceoverCue {
  if (typeof cue.audioBase64 === 'string' && cue.audioBase64.length > AUDIO_KEEP_CHARS) {
    return { ...cue, audioBase64: '' };
  }
  return cue;
}

/** Drop blob URLs and oversized voice payloads so a quota failure can still keep the timeline. */
export function compactStudioSession(session: StudioSessionSnapshot): StudioSessionSnapshot {
  const projects: Partial<Record<PlatformId, PlatformProjectState>> = {};
  for (const [platform, project] of Object.entries(session.projects) as Array<
    [PlatformId, PlatformProjectState | undefined]
  >) {
    if (!project) continue;
    const customAudioUrl = project.audio.customAudioUrl?.startsWith('blob:')
      ? undefined
      : project.audio.customAudioUrl;
    projects[platform] = {
      ...project,
      audio: { ...project.audio, customAudioUrl },
      voiceoverCues: project.voiceoverCues?.map(compactCue),
    };
  }
  return { ...session, projects };
}

function cueAudioKey(platform: string, cueId: string): string {
  return `${CUE_AUDIO_REF_PREFIX}${platform}:${cueId}`;
}

/** Move oversized cue audio out of the session document. The bytes are written beside it. */
export function spillOversizedCueAudio(session: StudioSessionSnapshot): {
  session: StudioSessionSnapshot;
  spilled: SpilledCueAudio[];
} {
  const spilled: SpilledCueAudio[] = [];
  const projects: Partial<Record<PlatformId, PlatformProjectState>> = {};
  for (const [platform, project] of Object.entries(session.projects) as Array<
    [PlatformId, PlatformProjectState | undefined]
  >) {
    if (!project) continue;
    projects[platform] = {
      ...project,
      voiceoverCues: project.voiceoverCues?.map((cue) => {
        if (typeof cue.audioBase64 !== 'string' || cue.audioBase64.length <= AUDIO_KEEP_CHARS) return cue;
        if (cue.audioBase64.startsWith(CUE_AUDIO_REF_PREFIX)) return cue;
        const key = cueAudioKey(platform, cue.id);
        spilled.push({ key, audioBase64: cue.audioBase64 });
        return { ...cue, audioBase64: key };
      }),
    };
  }
  return { session: { ...session, projects }, spilled };
}

/** Put spilled cue audio back. A missing side record keeps the cue text and drops the bytes. */
export function restoreSpilledCueAudio(
  session: StudioSessionSnapshot,
  audioByKey: ReadonlyMap<string, string>,
): StudioSessionSnapshot {
  const projects: Partial<Record<PlatformId, PlatformProjectState>> = {};
  for (const [platform, project] of Object.entries(session.projects) as Array<
    [PlatformId, PlatformProjectState | undefined]
  >) {
    if (!project) continue;
    projects[platform] = {
      ...project,
      voiceoverCues: project.voiceoverCues?.map((cue) => {
        if (typeof cue.audioBase64 !== 'string' || !cue.audioBase64.startsWith(CUE_AUDIO_REF_PREFIX)) {
          return cue;
        }
        const audioBase64 = audioByKey.get(cue.audioBase64);
        return { ...cue, audioBase64: audioBase64 ?? '' };
      }),
    };
  }
  return { ...session, projects };
}

export function spilledCueAudioKeys(session: StudioSessionSnapshot): string[] {
  const keys: string[] = [];
  for (const project of Object.values(session.projects)) {
    for (const cue of project?.voiceoverCues ?? []) {
      if (cue.audioBase64.startsWith(CUE_AUDIO_REF_PREFIX)) keys.push(cue.audioBase64);
    }
  }
  return keys;
}
