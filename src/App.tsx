import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BriefAndMediaPanel } from './components/BriefAndMediaPanel';
import { ExportModal } from './components/ExportModal';
import { InspectorPanel } from './components/InspectorPanel';
import { MediaLibraryView } from './components/MediaLibraryView';
import { MultiPlatformMatrixView } from './components/MultiPlatformMatrixView';
import { PreviewStage } from './components/PreviewStage';
import { TimelineDock } from './components/TimelineDock';
import { TopBar } from './components/TopBar';
import { useStudioCommands } from './components/studio/useStudioCommands';
import type {
  AspectRatio,
  ClonedVoiceProfile,
  DigitalHumanProfile,
  EditingStyle,
  MediaAsset,
  PlatformId,
  PlatformProjectState,
  WorkspaceView,
} from './types/studio';
import { StudioAudioEngine } from './utils/audioEngine';
import {
  alignProjectTimelineToVoiceover,
  BUILTIN_MEDIA_ASSETS,
  createInitialPlatformProjects,
  getTotalDuration,
} from './utils/autoEditEngine';
import {
  findClipAtTime,
  renderTimelineFrame,
  type LoadedMediaElement,
} from './utils/canvasRenderer';
import { primeVoiceEnvelopeCache } from './utils/digitalHumanAssets';
import { advanceStudioCursor, clipVideoSeekSec, digitalHumanSeekSec, shouldSeekMedia, shouldWhooshOnClipChange } from './client/playback/studioClock';
import {
  loadStudioLibrary,
  mergeHydratedAssets,
  preferSessionRecords,
  saveClonedVoices,
  saveDigitalHumanProfiles,
  saveStudioSession,
  saveUploadedAssets,
} from './client/storage/studioLibrary';
import type { StudioSessionSnapshot } from './client/storage/studioSession';

export default function App() {
  const [activeView, setActiveView] = useState<WorkspaceView>('editor');
  const [activePlatform, setActivePlatform] = useState<PlatformId>('douyin');
  // Library records and the project timeline hydrate from IndexedDB.
  const [storageHydrated, setStorageHydrated] = useState(false);
  const [digitalHumans, setDigitalHumans] = useState<DigitalHumanProfile[]>([]);
  const [assets, setAssets] = useState<MediaAsset[]>(() => [...BUILTIN_MEDIA_ASSETS]);
  const [projects, setProjects] = useState<Record<PlatformId, PlatformProjectState>>(() =>
    createInitialPlatformProjects()
  );

  // AI Auto-Edit Controls
  const [brief, setBrief] = useState(
    '早八人3分钟居家手冲冰拿铁教程：展示磨豆、V60注水蒸汽、浓缩液倒入燕麦奶，最后呈现窗边极简办公桌面。'
  );
  const [editingStyle, setEditingStyle] = useState<EditingStyle>('beat-sync');
  const [targetPlatforms, setTargetPlatforms] = useState<PlatformId[]>([
    'douyin',
    'tiktok',
    'facebook',
  ]);
  const [targetDuration, setTargetDuration] = useState<number>(15);
  const [bpm, setBpm] = useState<number>(128);
  const [autoSoundOnEdit, setAutoSoundOnEdit] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // Playback & Selection State
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [selectedClipId, setSelectedClipId] = useState<string | null>('dy-c1');
  const [selectedSubtitleId, setSelectedSubtitleId] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [mediaVersion, setMediaVersion] = useState(0);
  const [clonedVoices, setClonedVoices] = useState<ClonedVoiceProfile[]>([]);

  useEffect(() => {
    let cancelled = false;
    void loadStudioLibrary()
      .then((stored) => {
        if (cancelled) return;
        setDigitalHumans((current) => preferSessionRecords(current, stored.digitalHumans));
        setClonedVoices((current) => preferSessionRecords(current, stored.clonedVoices));
        setAssets((current) => mergeHydratedAssets(current, stored.assets));
        if (stored.session) {
          const session = stored.session;
          setProjects((current) => ({ ...current, ...session.projects }));
          setActivePlatform(session.activePlatform);
          setBrief(session.brief);
          setEditingStyle(session.editingStyle);
          setTargetPlatforms(session.targetPlatforms);
          setTargetDuration(session.targetDuration);
          setBpm(session.bpm);
          setAutoSoundOnEdit(session.autoSoundOnEdit);
          setSelectedClipId(session.selectedClipId);
          setSelectedSubtitleId(session.selectedSubtitleId);
        }
        setStorageHydrated(true);
      })
      .catch(() => {
        // Leave storageHydrated false so empty arrays are not written over saved records.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!storageHydrated) return;
    void saveClonedVoices(clonedVoices);
  }, [clonedVoices, storageHydrated]);

  useEffect(() => {
    if (!storageHydrated) return;
    void saveDigitalHumanProfiles(digitalHumans);
  }, [digitalHumans, storageHydrated]);

  useEffect(() => {
    if (!storageHydrated) return;
    void saveUploadedAssets(assets);
  }, [assets, storageHydrated]);

  useEffect(() => {
    if (!storageHydrated) return;
    const session: StudioSessionSnapshot = {
      activePlatform,
      projects,
      brief,
      editingStyle,
      targetPlatforms,
      targetDuration,
      bpm,
      autoSoundOnEdit,
      selectedClipId,
      selectedSubtitleId,
    };
    const handle = window.setTimeout(() => {
      void saveStudioSession(session);
    }, 400);
    return () => window.clearTimeout(handle);
  }, [
    activePlatform,
    projects,
    brief,
    editingStyle,
    targetPlatforms,
    targetDuration,
    bpm,
    autoSoundOnEdit,
    selectedClipId,
    selectedSubtitleId,
    storageHydrated,
  ]);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mediaCacheRef = useRef<Map<string, LoadedMediaElement>>(new Map());
  const audioEngineRef = useRef<StudioAudioEngine | null>(null);
  const lastClipIdRef = useRef<string | null>(null);
  const currentTimeRef = useRef<number>(currentTime);
  currentTimeRef.current = currentTime;

  const currentProject = projects[activePlatform];
  const totalDuration = useMemo(
    () => getTotalDuration(currentProject.clips),
    [currentProject.clips]
  );

  const assetsMap = useMemo(() => {
    const map = new Map<string, MediaAsset>();
    assets.forEach((a) => map.set(a.id, a));
    return map;
  }, [assets]);

  // Preload media elements into mediaCacheRef
  useEffect(() => {
    assets.forEach((asset) => {
      if (mediaCacheRef.current.has(asset.id)) return;

      if (asset.type === 'image') {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => setMediaVersion((v) => v + 1);
        img.src = asset.url;
        mediaCacheRef.current.set(asset.id, img);
      } else {
        const vid = document.createElement('video');
        vid.crossOrigin = 'anonymous';
        vid.muted = true;
        vid.playsInline = true;
        vid.preload = 'auto';
        vid.onloadeddata = () => setMediaVersion((v) => v + 1);
        vid.src = asset.url;
        mediaCacheRef.current.set(asset.id, vid);
      }
    });
  }, [assets]);

  // Sync audio engine config, timeline SFX events, and voiceover cues
  useEffect(() => {
    if (!audioEngineRef.current) {
      audioEngineRef.current = new StudioAudioEngine();
    }
    audioEngineRef.current.setConfig({
      preset: currentProject.audio.bgmPreset,
      bpm: currentProject.audio.bpm,
      volume: currentProject.audio.volume,
      muted: isMuted,
      customAudioUrl: currentProject.audio.customAudioUrl,
    });
    audioEngineRef.current.setSfxEvents(currentProject.sfxEvents ?? []);
    audioEngineRef.current.setVoiceoverConfig({
      cues: currentProject.voiceoverCues ?? [],
      enabled: Boolean(currentProject.audio.voiceoverEnabled),
      volume: currentProject.audio.voiceoverVolume ?? 0.95,
      autoDucking: currentProject.audio.bgmAutoDucking ?? true,
      denoiseEnabled: Boolean(currentProject.audio.voiceDenoiseEnabled),
      denoiseStrength: currentProject.audio.voiceDenoiseStrength ?? 0.72,
      denoiseProfile: currentProject.audio.voiceDenoiseProfile,
    });
  }, [
    currentProject.audio,
    currentProject.sfxEvents,
    currentProject.voiceoverCues,
    isMuted,
  ]);

  // Measure real AudioBuffer durations for any cues lacking audioDurationSec and align timeline
  useEffect(() => {
    const cues = currentProject.voiceoverCues ?? [];
    if (cues.length === 0) return;
    const missing = cues.some((c) => !(typeof c.audioDurationSec === 'number' && c.audioDurationSec > 0));
    if (!missing) return;
    let cancelled = false;
    if (!audioEngineRef.current) {
      audioEngineRef.current = new StudioAudioEngine();
    }
    void audioEngineRef.current.measureVoiceoverCues(cues).then((durations) => {
      if (cancelled || Object.keys(durations).length === 0) return;
      setProjects((prev) => {
        const current = prev[activePlatform];
        const curCues = current.voiceoverCues ?? [];
        if (curCues.length === 0) return prev;
        const enriched = curCues.map((cue) => {
          const measured = durations[cue.id];
          return measured ? { ...cue, audioDurationSec: measured } : cue;
        });
        return {
          ...prev,
          [activePlatform]: alignProjectTimelineToVoiceover(current, enriched),
        };
      });
    });
    return () => {
      cancelled = true;
    };
  }, [activePlatform, currentProject.voiceoverCues]);

  useEffect(() => {
    primeVoiceEnvelopeCache(currentProject.voiceoverCues ?? []);
  }, [currentProject.voiceoverCues]);

  // Render single frame whenever paused / state changes
  const drawFrameAt = useCallback(
    (timeSec: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const activeInfo = findClipAtTime(currentProject.clips, timeSec);
      if (activeInfo) {
        const el = mediaCacheRef.current.get(activeInfo.clip.assetId);
        if (el instanceof HTMLVideoElement) {
          const targetVidTime = clipVideoSeekSec(
            activeInfo.clip.trimStart,
            activeInfo.localTime,
            el.duration,
          );
          if (shouldSeekMedia(el.currentTime, targetVidTime, !isPlaying)) {
            el.currentTime = targetVidTime;
          }
          if (isPlaying && el.paused) {
            void el.play().catch(() => undefined);
          } else if (!isPlaying && !el.paused) {
            el.pause();
          }
        }
        if (activeInfo.clip.digitalHuman?.avatarAssetId) {
          const dhEl = mediaCacheRef.current.get(activeInfo.clip.digitalHuman.avatarAssetId);
          if (dhEl instanceof HTMLVideoElement) {
            const targetDhTime = digitalHumanSeekSec(activeInfo.localTime, dhEl.duration);
            if (shouldSeekMedia(dhEl.currentTime, targetDhTime, !isPlaying)) {
              dhEl.currentTime = targetDhTime;
            }
            if (isPlaying && dhEl.paused) {
              void dhEl.play().catch(() => undefined);
            } else if (!isPlaying && !dhEl.paused) {
              dhEl.pause();
            }
          }
        }
      }

      renderTimelineFrame({
        ctx,
        width: canvas.width,
        height: canvas.height,
        timeSec,
        clips: currentProject.clips,
        subtitles: currentProject.subtitles,
        assetsMap,
        mediaCache: mediaCacheRef.current,
        voiceoverCues: currentProject.voiceoverCues,
        voiceoverEnabled: Boolean(currentProject.audio.voiceoverEnabled),
      });
    },
    [
      currentProject.clips,
      currentProject.subtitles,
      currentProject.voiceoverCues,
      currentProject.audio.voiceoverEnabled,
      assetsMap,
      isPlaying,
    ]
  );

  useEffect(() => {
    if (!isPlaying) {
      drawFrameAt(currentTime);
    }
  }, [currentTime, isPlaying, drawFrameAt, mediaVersion, activeView, currentProject.aspectRatio]);

  // Playback loop
  useEffect(() => {
    if (!isPlaying) {
      audioEngineRef.current?.stop();
      mediaCacheRef.current.forEach((el) => {
        if (el instanceof HTMLVideoElement && !el.paused) el.pause();
      });
      return;
    }

    if (!audioEngineRef.current) {
      audioEngineRef.current = new StudioAudioEngine();
    }
    const resumeAt = currentTimeRef.current;
    audioEngineRef.current.start(resumeAt);

    let rafId = 0;
    let lastPerfMs = performance.now();
    let localCursor = resumeAt;

    const tick = (now: number) => {
      const step = advanceStudioCursor({
        cursorSec: localCursor,
        lastPerfMs,
        nowMs: now,
        durationSec: totalDuration,
        loop: true,
      });
      lastPerfMs = step.lastPerfMs;
      localCursor = step.cursorSec;
      if (step.reachedEnd) {
        lastClipIdRef.current = null;
      }

      const activeInfo = findClipAtTime(currentProject.clips, localCursor);
      if (activeInfo) {
        if (
          shouldWhooshOnClipChange({
            previousClipId: lastClipIdRef.current,
            clipId: activeInfo.clip.id,
            transition: activeInfo.clip.transition,
            cursorSec: localCursor,
            sfxTimes: (currentProject.sfxEvents ?? []).map((ev) => ev.time),
          })
        ) {
          audioEngineRef.current?.triggerTransitionWhoosh();
        }
        lastClipIdRef.current = activeInfo.clip.id;
      }

      audioEngineRef.current?.syncStep(localCursor);
      drawFrameAt(localCursor);
      setCurrentTime(localCursor);

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafId);
      audioEngineRef.current?.stop();
    };
  }, [isPlaying, totalDuration, currentProject.clips, currentProject.sfxEvents, drawFrameAt]);

  // Spacebar shortcut for play/pause
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.code === 'Space' && activeView === 'editor' && !exportOpen) {
        e.preventDefault();
        setIsPlaying((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeView, exportOpen]);

  const {
    updateCurrentProject,
    handleChangePlatform,
    handleUploadFiles,
    handleInsertClipToTimeline,
    handleRunAiAutoEdit,
    handleRunLocalBeatSync,
    handleSplitAtPlayhead,
    handleSnapToBeat,
    handleUpdateClip,
    handleApplyTransitionSequence,
    handleMoveClip,
    handleDuplicateClip,
    handleDeleteClip,
    handleAddSubtitle,
    handleUpdateSubtitle,
    handleDeleteSubtitle,
    handleUpdateAudio,
    handleUploadAudio,
    selectedClip,
    selectedClipStartTime,
    nextClip,
    selectedAsset,
    selectedSubtitle,
    handlePreviewSfx,
    handleSetSfxEvents,
    handleAddSfxEvent,
    handleRemoveSfxEvent,
    handleSetVoiceoverCues,
    handleUpsertVoiceoverCue,
    handleRemoveVoiceoverCue,
    handlePreviewVoiceoverCue,
    handleSaveClonedVoice,
    handleUpdateClonedVoice,
    handleDeleteClonedVoice,
    handleApplyClipSubtitles,
    handlePreviewTransitionAtCut,
    handleSaveDigitalHuman,
    handleDeleteDigitalHuman,
    handleUploadMediaAssetForAnchor,
    handleEmbedDigitalHumanPip,
    handleRemoveClipDigitalHuman,
    handleUpdateClipDigitalHumanAction,
    handleBatchApplyDigitalHumanActions,
    handleUpdateClipDigitalHumanEmotion,
    handleUpdateClipDigitalHumanCameraMotion,
    handleUpdateClipDigitalHumanPhonemeAlignment,
    handleInsertDigitalHumanClip,
  } = useStudioCommands({
    activePlatform,
    setActivePlatform,
    setIsPlaying,
    currentTime,
    setCurrentTime,
    selectedClipId,
    setSelectedClipId,
    selectedSubtitleId,
    setSelectedSubtitleId,
    assets,
    setAssets,
    projects,
    setProjects,
    currentProject,
    assetsMap,
    totalDuration,
    brief,
    editingStyle,
    targetPlatforms,
    targetDuration,
    bpm,
    autoSoundOnEdit,
    setIsGenerating,
    setAiError,
    clonedVoices,
    setClonedVoices,
    setDigitalHumans,
    mediaCacheRef,
    audioEngineRef,
  });

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-[#0B0D10] text-zinc-100">
      <TopBar
        activeView={activeView}
        onChangeView={(view) => {
          setIsPlaying(false);
          setActiveView(view);
        }}
        onOpenExport={() => {
          setIsPlaying(false);
          setExportOpen(true);
        }}
      />

      {activeView === 'editor' && (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 flex min-h-0 overflow-x-auto overflow-y-hidden">
            <BriefAndMediaPanel
              brief={brief}
              onChangeBrief={setBrief}
              editingStyle={editingStyle}
              onChangeEditingStyle={setEditingStyle}
              targetPlatforms={targetPlatforms}
              onToggleTargetPlatform={(pid) => {
                setTargetPlatforms((prev) =>
                  prev.includes(pid)
                    ? prev.length > 1
                      ? prev.filter((x) => x !== pid)
                      : prev
                    : [...prev, pid]
                );
              }}
              targetDuration={targetDuration}
              onChangeTargetDuration={setTargetDuration}
              bpm={bpm}
              onChangeBpm={setBpm}
              isGenerating={isGenerating}
              aiError={aiError}
              autoSoundOnEdit={autoSoundOnEdit}
              onToggleAutoSound={setAutoSoundOnEdit}
              onRunAiAutoEdit={handleRunAiAutoEdit}
              onRunLocalBeatSync={handleRunLocalBeatSync}
              assets={assets}
              onUploadFiles={handleUploadFiles}
              onInsertClipToTimeline={handleInsertClipToTimeline}
            />

            <PreviewStage
              activePlatform={activePlatform}
              onChangePlatform={handleChangePlatform}
              project={currentProject}
              onChangeAspectRatio={(ratio: AspectRatio) =>
                updateCurrentProject((prev) => ({ ...prev, aspectRatio: ratio }))
              }
              canvasRef={canvasRef}
              isPlaying={isPlaying}
              onTogglePlay={() => setIsPlaying((p) => !p)}
              onSeekStart={() => {
                setIsPlaying(false);
                setCurrentTime(0);
              }}
              onSplitAtPlayhead={handleSplitAtPlayhead}
              currentTime={currentTime}
              isMuted={isMuted}
              onToggleMute={() => setIsMuted((m) => !m)}
            />

            <InspectorPanel
              selectedClip={selectedClip}
              selectedAsset={selectedAsset}
              selectedClipStartTime={selectedClipStartTime}
              nextClip={nextClip}
              clips={currentProject.clips}
              subtitles={currentProject.subtitles}
              voiceoverCues={currentProject.voiceoverCues ?? []}
              sfxEvents={currentProject.sfxEvents ?? []}
              currentTime={currentTime}
              platform={activePlatform}
              mediaCache={mediaCacheRef.current}
              selectedSubtitle={selectedSubtitle}
              audio={currentProject.audio}
              clonedVoices={clonedVoices}
              onSaveClonedVoice={handleSaveClonedVoice}
              onUpdateClonedVoice={handleUpdateClonedVoice}
              onDeleteClonedVoice={handleDeleteClonedVoice}
              onUpdateClip={handleUpdateClip}
              onApplyTransitionSequence={handleApplyTransitionSequence}
              onMoveClip={handleMoveClip}
              onDuplicateClip={handleDuplicateClip}
              onDeleteClip={handleDeleteClip}
              onPreviewTransitionAtCut={handlePreviewTransitionAtCut}
              onApplyClipSubtitles={handleApplyClipSubtitles}
              onUpdateSubtitle={handleUpdateSubtitle}
              onDeleteSubtitle={handleDeleteSubtitle}
              onAddSubtitle={handleAddSubtitle}
              onUpdateAudio={handleUpdateAudio}
              onUploadAudio={handleUploadAudio}
              onPreviewSfx={handlePreviewSfx}
              onSetSfxEvents={handleSetSfxEvents}
              onAddSfxEvent={handleAddSfxEvent}
              onRemoveSfxEvent={handleRemoveSfxEvent}
              onSetVoiceoverCues={handleSetVoiceoverCues}
              onUpsertVoiceoverCue={handleUpsertVoiceoverCue}
              onRemoveVoiceoverCue={handleRemoveVoiceoverCue}
              onPreviewVoiceoverCue={handlePreviewVoiceoverCue}
              onSeek={(t) => {
                setIsPlaying(false);
                setCurrentTime(t);
              }}
              assets={assets}
              digitalHumans={digitalHumans}
              onSaveDigitalHuman={handleSaveDigitalHuman}
              onDeleteDigitalHuman={handleDeleteDigitalHuman}
              onUploadMediaAssetForAnchor={handleUploadMediaAssetForAnchor}
              onEmbedDigitalHumanPip={handleEmbedDigitalHumanPip}
              onRemoveClipDigitalHuman={handleRemoveClipDigitalHuman}
              onUpdateClipDigitalHumanAction={handleUpdateClipDigitalHumanAction}
              onBatchApplyDigitalHumanActions={handleBatchApplyDigitalHumanActions}
              onUpdateClipDigitalHumanEmotion={handleUpdateClipDigitalHumanEmotion}
              onUpdateClipDigitalHumanCameraMotion={handleUpdateClipDigitalHumanCameraMotion}
              onUpdateClipDigitalHumanPhonemeAlignment={handleUpdateClipDigitalHumanPhonemeAlignment}
              onInsertDigitalHumanClip={handleInsertDigitalHumanClip}
              brief={brief}
            />
          </div>

          <TimelineDock
            clips={currentProject.clips}
            subtitles={currentProject.subtitles}
            voiceoverCues={currentProject.voiceoverCues ?? []}
            sfxEvents={currentProject.sfxEvents ?? []}
            assetsMap={assetsMap}
            bpm={currentProject.audio.bpm}
            currentTime={currentTime}
            selectedClipId={selectedClip?.id ?? null}
            selectedSubtitleId={selectedSubtitleId}
            onSelectClip={(id) => {
              setSelectedClipId(id);
              setSelectedSubtitleId(null);
            }}
            onSelectSubtitle={(id) => {
              setSelectedSubtitleId(id);
            }}
            onPreviewSfx={handlePreviewSfx}
            onPreviewVoiceoverCue={handlePreviewVoiceoverCue}
            onSeek={(t) => {
              setIsPlaying(false);
              setCurrentTime(t);
            }}
            onAddSubtitle={handleAddSubtitle}
            onSnapToBeat={handleSnapToBeat}
          />
        </div>
      )}

      {activeView === 'matrix' && (
        <MultiPlatformMatrixView
          projects={projects}
          assetsMap={assetsMap}
          mediaCache={mediaCacheRef.current}
          onEditPlatform={(pid) => {
            setActivePlatform(pid);
            setActiveView('editor');
          }}
          onExportPlatform={(pid) => {
            setActivePlatform(pid);
            setExportOpen(true);
          }}
        />
      )}

      {activeView === 'media' && (
        <MediaLibraryView
          assets={assets}
          activePlatform={activePlatform}
          mediaCache={mediaCacheRef.current}
          onUploadFiles={handleUploadFiles}
          onInsertAndOpenEditor={(asset) => {
            handleInsertClipToTimeline(asset);
            setActiveView('editor');
          }}
          onDeleteAsset={(assetId) => {
            setAssets((prev) => prev.filter((a) => a.id !== assetId));
          }}
          onUpdateAssetTags={(assetId, aiTags) => {
            setAssets((prev) => prev.map((a) => (a.id === assetId ? { ...a, aiTags } : a)));
          }}
        />
      )}

      {exportOpen && (
        <ExportModal
          project={currentProject}
          assetsMap={assetsMap}
          mediaCache={mediaCacheRef.current}
          onClose={() => setExportOpen(false)}
        />
      )}
    </div>
  );
}
