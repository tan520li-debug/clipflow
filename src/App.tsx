import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BriefAndMediaPanel } from './components/BriefAndMediaPanel';
import { ExportModal } from './components/ExportModal';
import type { DigitalHumanInsertTarget } from './components/DigitalHumanTab';
import { InspectorPanel } from './components/InspectorPanel';
import { MediaLibraryView } from './components/MediaLibraryView';
import { MultiPlatformMatrixView } from './components/MultiPlatformMatrixView';
import { PreviewStage } from './components/PreviewStage';
import { TimelineDock } from './components/TimelineDock';
import { TopBar } from './components/TopBar';
import type {
  AspectRatio,
  AudioConfig,
  AutoEditApiResponse,
  BgmPreset,
  ClonedVoiceProfile,
  DigitalHumanActionId,
  DigitalHumanClipConfig,
  DigitalHumanEmotionId,
  DigitalHumanFacialMuscles,
  DigitalHumanProfile,
  EditingStyle,
  MediaAiTags,
  MediaAsset,
  PlatformId,
  PlatformProjectState,
  SfxEvent,
  SfxType,
  SubtitleSegment,
  TimelineClip,
  TransitionType,
  VoiceoverCue,
  VoiceoverVoice,
  WorkspaceView,
} from './types/studio';
import { StudioAudioEngine } from './utils/audioEngine';
import {
  alignProjectTimelineToVoiceover,
  applyAiPlanToProjects,
  buildLocalBeatSyncTimeline,
  BUILTIN_MEDIA_ASSETS,
  createInitialPlatformProjects,
  getTotalDuration,
  PLATFORM_META,
} from './utils/autoEditEngine';
import {
  captureClipSnapshotBase64,
  findClipAtTime,
  renderTimelineFrame,
  type LoadedMediaElement,
} from './utils/canvasRenderer';
import { primeVoiceEnvelopeCache } from './utils/digitalHumanAssets';

export default function App() {
  const [activeView, setActiveView] = useState<WorkspaceView>('editor');
  const [activePlatform, setActivePlatform] = useState<PlatformId>('douyin');
  const [assets, setAssets] = useState<MediaAsset[]>(BUILTIN_MEDIA_ASSETS);
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
  const [clonedVoices, setClonedVoices] = useState<ClonedVoiceProfile[]>(() => {
    try {
      const raw = window.localStorage.getItem('clipflow_cloned_voices_v1');
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as ClonedVoiceProfile[]) : [];
    } catch {
      return [];
    }
  });

  const [digitalHumans, setDigitalHumans] = useState<DigitalHumanProfile[]>(() => {
    try {
      const raw = window.localStorage.getItem('clipflow_digital_humans_v1');
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as DigitalHumanProfile[]) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(
        'clipflow_cloned_voices_v1',
        JSON.stringify(clonedVoices.slice(0, 6))
      );
    } catch {
      // ignore storage quota errors
    }
  }, [clonedVoices]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        'clipflow_digital_humans_v1',
        JSON.stringify(digitalHumans.slice(0, 6))
      );
    } catch {
      // ignore storage quota errors
    }
  }, [digitalHumans]);

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
      updateCurrentProject((prev) => {
        const curCues = prev.voiceoverCues ?? [];
        if (curCues.length === 0) return prev;
        const enriched = curCues.map((c) => {
          const measured = durations[c.id];
          return measured ? { ...c, audioDurationSec: measured } : c;
        });
        return alignProjectTimelineToVoiceover(prev, enriched);
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
          const targetVidTime = activeInfo.clip.trimStart + activeInfo.localTime;
          if (!isPlaying || Math.abs(el.currentTime - targetVidTime) > 0.25) {
            el.currentTime = Math.min(Math.max(0, el.duration || 10), targetVidTime);
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
            const targetDhTime = activeInfo.localTime % Math.max(1, dhEl.duration || 5);
            if (!isPlaying || Math.abs(dhEl.currentTime - targetDhTime) > 0.25) {
              dhEl.currentTime = Math.min(Math.max(0, dhEl.duration || 10), targetDhTime);
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
    let lastPerf = performance.now();
    let localCursor = resumeAt;

    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - lastPerf) / 1000);
      lastPerf = now;
      localCursor += dt;

      if (localCursor >= totalDuration) {
        localCursor = 0;
        lastClipIdRef.current = null;
      }

      const activeInfo = findClipAtTime(currentProject.clips, localCursor);
      if (activeInfo) {
        if (
          lastClipIdRef.current &&
          lastClipIdRef.current !== activeInfo.clip.id &&
          activeInfo.clip.transition !== 'cut'
        ) {
          const hasNearbyCustomSfx = (currentProject.sfxEvents ?? []).some(
            (ev) => Math.abs(ev.time - localCursor) < 0.35
          );
          if (!hasNearbyCustomSfx) {
            audioEngineRef.current?.triggerTransitionWhoosh();
          }
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

  const handleChangePlatform = (pid: PlatformId) => {
    setIsPlaying(false);
    setActivePlatform(pid);
    setCurrentTime(0);
    setSelectedClipId(projects[pid].clips[0]?.id ?? null);
    setSelectedSubtitleId(null);
  };

  const updateCurrentProject = (updater: (prev: PlatformProjectState) => PlatformProjectState) => {
    setProjects((prev) => ({
      ...prev,
      [activePlatform]: updater(prev[activePlatform]),
    }));
  };

  const autoTagUploadedAsset = async (asset: MediaAsset, el: LoadedMediaElement) => {
    const frameBase64 = captureClipSnapshotBase64(el, 'natural');
    if (!frameBase64) return;
    try {
      const res = await fetch('/api/tag-media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: asset.name,
          type: asset.type,
          frameBase64,
        }),
      });
      if (!res.ok) return;
      const data = await res.json();
      const aiTags: MediaAiTags = {
        subjects: Array.isArray(data.subjects) ? data.subjects : [],
        visuals: Array.isArray(data.visuals) ? data.visuals : [],
        sceneSummary: typeof data.sceneSummary === 'string' ? data.sceneSummary : undefined,
      };
      setAssets((prev) => prev.map((a) => (a.id === asset.id ? { ...a, aiTags } : a)));
    } catch {
      // Background auto-tagging is best-effort; user can also trigger manually in MediaLibraryView
    }
  };

  const handleUploadFiles = (files: FileList) => {
    Array.from(files).forEach((file) => {
      const url = URL.createObjectURL(file);
      const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
      const isVideo = file.type.startsWith('video/');

      if (isVideo) {
        const probe = document.createElement('video');
        probe.preload = 'auto';
        probe.muted = true;
        probe.onloadeddata = () => {
          const asset: MediaAsset = {
            id: `upload-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            name: file.name,
            type: 'video',
            url,
            duration: Math.max(1.5, probe.duration || 5),
            width: probe.videoWidth || 1080,
            height: probe.videoHeight || 1920,
            source: 'upload',
            fileSizeLabel: `${sizeMb}MB`,
          };
          setAssets((prev) => [asset, ...prev]);
          void autoTagUploadedAsset(asset, probe);
        };
        probe.src = url;
      } else {
        const img = new Image();
        img.onload = () => {
          const asset: MediaAsset = {
            id: `upload-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            name: file.name,
            type: 'image',
            url,
            duration: 5,
            width: img.naturalWidth || 1080,
            height: img.naturalHeight || 1920,
            source: 'upload',
            fileSizeLabel: `${sizeMb}MB`,
          };
          setAssets((prev) => [asset, ...prev]);
          void autoTagUploadedAsset(asset, img);
        };
        img.src = url;
      }
    });
  };

  const handleInsertClipToTimeline = (asset: MediaAsset) => {
    const newClip: TimelineClip = {
      id: `${activePlatform}-clip-${Date.now()}`,
      assetId: asset.id,
      label: asset.name.replace(/\.[^.]+$/, ''),
      trimStart: 0,
      duration: asset.type === 'video' ? Math.min(4, Math.max(1.5, asset.duration)) : 2.5,
      transition: currentProject.clips.length === 0 ? 'cut' : 'zoom-punch',
      motion: 'ken-burns-in',
      filter: 'cinematic',
      speed: 1,
    };
    updateCurrentProject((prev) => ({
      ...prev,
      clips: [...prev.clips, newClip],
    }));
    setSelectedClipId(newClip.id);
    setSelectedSubtitleId(null);
  };

  const handleRunAiAutoEdit = async () => {
    if (!brief.trim() || targetPlatforms.length === 0) return;
    setIsPlaying(false);
    setIsGenerating(true);
    setAiError(null);

    try {
      const res = await fetch('/api/auto-edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brief,
          style: editingStyle,
          targetPlatforms,
          bpm,
          durationTarget: targetDuration,
          mediaSummary: assets.map((a, index) => ({
            index,
            name: a.name,
            type: a.type,
            duration: a.duration,
          })),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'AI 自动剪辑生成失败，请稍后重试。');
      }

      const nextProjects = applyAiPlanToProjects(
        data as AutoEditApiResponse,
        assets,
        projects
      );
      setProjects(nextProjects);
      setCurrentTime(0);
      setSelectedClipId(nextProjects[activePlatform].clips[0]?.id ?? null);
      setSelectedSubtitleId(null);

      if (autoSoundOnEdit) {
        const activeState = nextProjects[activePlatform];
        let cursor = 0;
        const timelineNodes = activeState.clips.map((c, index) => {
          const startTime = Number(cursor.toFixed(2));
          const endTime = Number((cursor + c.duration).toFixed(2));
          cursor += c.duration;
          return {
            clipId: c.id,
            index,
            label: c.label,
            startTime,
            endTime,
            transition: c.transition,
            motion: c.motion,
            hookTag: c.hookTag,
          };
        });
        const sampleFramesBase64 = [0, Math.floor(activeState.clips.length / 2), activeState.clips.length - 1]
          .filter((idx, i, arr) => arr.indexOf(idx) === i && activeState.clips[idx])
          .map((idx) => {
            const c = activeState.clips[idx];
            return captureClipSnapshotBase64(mediaCacheRef.current.get(c.assetId), c.filter, c.colorAdjustments);
          })
          .filter((f): f is string => Boolean(f));

        const [bgmRes, voRes, sfxRes] = await Promise.allSettled([
          fetch('/api/suggest-bgm', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              platform: activePlatform,
              totalDuration: cursor,
              currentBpm: activeState.audio.bpm,
              clipsSummary: activeState.clips.map((c) => ({
                label: c.label,
                duration: c.duration,
                transition: c.transition,
                filter: c.filter,
              })),
              sampleFramesBase64,
            }),
          }).then((r) => (r.ok ? r.json() : null)),
          activeState.subtitles.length > 0
            ? (() => {
                const activeClone = clonedVoices.find(
                  (v) => v.id === activeState.audio.activeClonedVoiceId
                );
                return fetch('/api/generate-voiceover', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    platform: activePlatform,
                    voiceName: activeClone ? activeClone.baseVoice : (activeState.audio.voiceoverVoice ?? 'Kore'),
                    naturalMode: activeState.audio.naturalMode ?? 'expressive',
                    voicePersonaPrompt: activeState.audio.voicePersonaPrompt ?? '',
                    clonedVoice: activeClone
                      ? {
                          id: activeClone.id,
                          name: activeClone.name,
                          baseVoice: activeClone.baseVoice,
                          voiceDesignPrompt: activeClone.voiceDesignPrompt,
                          playbackRate: activeClone.playbackRate,
                          eqLowGainDb: activeClone.eqLowGainDb,
                          eqMidGainDb: activeClone.eqMidGainDb ?? 0,
                          eqHighGainDb: activeClone.eqHighGainDb,
                          expressiveness: activeClone.expressiveness ?? 0.75,
                        }
                      : null,
                    cues: activeState.subtitles.map((s) => ({
                      id: s.id,
                      subtitleId: s.id,
                      startTime: s.startTime,
                      duration: s.duration,
                      text: s.text,
                    })),
                  }),
                }).then((r) => (r.ok ? r.json() : null));
              })()
            : Promise.resolve(null),
          fetch('/api/suggest-sfx', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              platform: activePlatform,
              bpm: activeState.audio.bpm,
              totalDuration: cursor,
              timelineNodes,
              subtitleNodes: activeState.subtitles.map((s) => ({
                startTime: s.startTime,
                text: s.text,
                position: s.position,
              })),
              sampleFramesBase64,
            }),
          }).then((r) => (r.ok ? r.json() : null)),
        ]);

        const bgmData = bgmRes.status === 'fulfilled' ? bgmRes.value : null;
        const voData = voRes.status === 'fulfilled' ? voRes.value : null;
        const sfxData = sfxRes.status === 'fulfilled' ? sfxRes.value : null;

        let adjustedVoiceoverCues: VoiceoverCue[] = Array.isArray(voData?.cues)
          ? (voData.cues as VoiceoverCue[])
          : [];

        if (adjustedVoiceoverCues.length > 0) {
          // Ensure every synthesized voiceover cue has an accurate decoded audio duration
          const hasMissingAudioDur = adjustedVoiceoverCues.some(
            (c) => !(typeof c.audioDurationSec === 'number' && c.audioDurationSec > 0)
          );
          if (hasMissingAudioDur) {
            if (!audioEngineRef.current) {
              audioEngineRef.current = new StudioAudioEngine();
            }
            try {
              const measuredDurations =
                await audioEngineRef.current.measureVoiceoverCues(adjustedVoiceoverCues);
              adjustedVoiceoverCues = adjustedVoiceoverCues.map((cue) => {
                const measured = measuredDurations[cue.id];
                return measured && measured > 0
                  ? { ...cue, audioDurationSec: measured }
                  : cue;
              });
            } catch {
              // Fall back to server-provided WAV duration if WebAudio decode is unavailable
            }
          }

          // Check whether any synthesized voiceover cue exceeds its corresponding video clip duration
          let origClipCursor = 0;
          const origClipBounds = activeState.clips.map((c) => {
            const bound = { start: origClipCursor, end: origClipCursor + c.duration, duration: c.duration };
            origClipCursor += c.duration;
            return bound;
          });

          const sortedVoiceCues = [...adjustedVoiceoverCues].sort((a, b) => a.startTime - b.startTime);
          const hasExceededClipDuration = sortedVoiceCues.some((cue, idx) => {
            const rate = cue.playbackRate && cue.playbackRate > 0 ? cue.playbackRate : 1.0;
            const effectiveAudioSec = (cue.audioDurationSec ?? cue.duration) / rate;
            let clipIdx = origClipBounds.findIndex(
              (b) => cue.startTime + 0.05 >= b.start && cue.startTime + 0.05 < b.end
            );
            if (clipIdx === -1 && origClipBounds.length === sortedVoiceCues.length) {
              clipIdx = idx;
            }
            if (clipIdx < 0 || clipIdx >= origClipBounds.length) return false;
            const localStart = Math.max(0, cue.startTime - origClipBounds[clipIdx].start);
            const tailBuffer = clipIdx === origClipBounds.length - 1 ? 0.25 : 0.08;
            return localStart + effectiveAudioSec + tailBuffer > origClipBounds[clipIdx].duration;
          });

          // Normalize order cleanly before aligning clips, subsequent start times, subtitles, and SFX
          if (hasExceededClipDuration) {
            adjustedVoiceoverCues = sortedVoiceCues;
          }
        }

        setProjects((prev) => {
          const cur = prev[activePlatform];
          const validBgm: BgmPreset[] = [
            'upbeat-128',
            'tech-118',
            'fresh-112',
            'suspense-104',
            'lofi-95',
            'narrative-92',
          ];

          const nextPreset: BgmPreset =
            bgmData && validBgm.includes(bgmData.recommendedPreset)
              ? bgmData.recommendedPreset
              : cur.audio.bgmPreset;

          const nextProjectBase: PlatformProjectState = {
            ...cur,
            audio: {
              ...cur.audio,
              bgmPreset: nextPreset,
              bpm: Number(bgmData?.recommendedBpm) || cur.audio.bpm,
              volume: Number(bgmData?.recommendedVolume) || cur.audio.volume,
              voiceoverEnabled: adjustedVoiceoverCues.length > 0,
              bgmAutoDucking: true,
            },
            sfxEvents: Array.isArray(sfxData?.events) ? (sfxData.events as SfxEvent[]) : cur.sfxEvents,
          };

          // Dynamically expand overflowing clip durations and shift all subsequent clip/subtitle/cue/SFX start times
          return {
            ...prev,
            [activePlatform]:
              adjustedVoiceoverCues.length > 0
                ? alignProjectTimelineToVoiceover(nextProjectBase, adjustedVoiceoverCues)
                : nextProjectBase,
          };
        });
      }
    } catch (err: unknown) {
      setAiError(
        err instanceof Error ? err.message : '请求失败，请检查网络连接后重试。'
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRunLocalBeatSync = () => {
    setIsPlaying(false);
    const result = buildLocalBeatSyncTimeline(
      activePlatform,
      assets,
      bpm,
      currentProject.subtitles
    );
    updateCurrentProject((prev) => ({
      ...prev,
      clips: result.clips,
      subtitles: result.subtitles,
      audio: { ...prev.audio, bpm },
    }));
    setCurrentTime(0);
    setSelectedClipId(result.clips[0]?.id ?? null);
    setSelectedSubtitleId(null);
  };

  const handleSplitAtPlayhead = () => {
    const info = findClipAtTime(currentProject.clips, currentTime);
    if (!info) return;
    const { index, clip, localTime } = info;
    if (localTime < 0.45 || clip.duration - localTime < 0.45) return;

    const firstHalf: TimelineClip = {
      ...clip,
      duration: Number(localTime.toFixed(2)),
    };
    const secondHalf: TimelineClip = {
      ...clip,
      id: `${clip.id}-split-${Date.now()}`,
      label: `${clip.label} (2)`,
      trimStart: Number((clip.trimStart + localTime).toFixed(2)),
      duration: Number((clip.duration - localTime).toFixed(2)),
      transition: 'zoom-punch',
    };

    updateCurrentProject((prev) => {
      const nextClips = [...prev.clips];
      nextClips.splice(index, 1, firstHalf, secondHalf);
      return { ...prev, clips: nextClips };
    });
    setSelectedClipId(secondHalf.id);
    setSelectedSubtitleId(null);
  };

  const handleSnapToBeat = () => {
    const beatSec = (60 / Math.max(70, currentProject.audio.bpm)) * 2;
    updateCurrentProject((prev) => ({
      ...prev,
      clips: prev.clips.map((c) => {
        const beats = Math.max(1, Math.round(c.duration / beatSec));
        return {
          ...c,
          duration: Number(Math.max(1.0, beats * beatSec).toFixed(2)),
        };
      }),
    }));
  };

  const handleUpdateClip = (clipId: string, patch: Partial<TimelineClip>) => {
    updateCurrentProject((prev) => ({
      ...prev,
      clips: prev.clips.map((c) => (c.id === clipId ? { ...c, ...patch } : c)),
    }));
  };

  const handleApplyTransitionSequence = (
    updates: Array<{ clipId: string; transition: TransitionType }>
  ) => {
    const map = new Map(updates.map((u) => [u.clipId, u.transition]));
    updateCurrentProject((prev) => ({
      ...prev,
      clips: prev.clips.map((c) => {
        const nextTr = map.get(c.id);
        return nextTr ? { ...c, transition: nextTr } : c;
      }),
    }));
  };

  const handleMoveClip = (clipId: string, direction: -1 | 1) => {
    updateCurrentProject((prev) => {
      const idx = prev.clips.findIndex((c) => c.id === clipId);
      if (idx === -1) return prev;
      const targetIdx = idx + direction;
      if (targetIdx < 0 || targetIdx >= prev.clips.length) return prev;
      const next = [...prev.clips];
      const [item] = next.splice(idx, 1);
      next.splice(targetIdx, 0, item);
      return { ...prev, clips: next };
    });
  };

  const handleDuplicateClip = (clipId: string) => {
    updateCurrentProject((prev) => {
      const idx = prev.clips.findIndex((c) => c.id === clipId);
      if (idx === -1) return prev;
      const orig = prev.clips[idx];
      const copy: TimelineClip = {
        ...orig,
        id: `${orig.id}-copy-${Date.now()}`,
        label: `${orig.label} 副本`,
      };
      const next = [...prev.clips];
      next.splice(idx + 1, 0, copy);
      return { ...prev, clips: next };
    });
  };

  const handleDeleteClip = (clipId: string) => {
    if (currentProject.clips.length <= 1) return;
    updateCurrentProject((prev) => {
      const next = prev.clips.filter((c) => c.id !== clipId);
      return { ...prev, clips: next };
    });
    setSelectedClipId(null);
  };

  const handleAddSubtitle = () => {
    const style = PLATFORM_META[activePlatform].defaultSubtitleStyle;
    const newSub: SubtitleSegment = {
      id: `${activePlatform}-sub-${Date.now()}`,
      startTime: Number(Math.min(Math.max(0, totalDuration - 1.5), currentTime).toFixed(2)),
      duration: 2.0,
      text: activePlatform === 'douyin' ? '重点亮点字幕提示' : 'New Key Highlight Caption',
      style,
      position: 'bottom',
    };
    updateCurrentProject((prev) => ({
      ...prev,
      subtitles: [...prev.subtitles, newSub],
    }));
    setSelectedSubtitleId(newSub.id);
    setSelectedClipId(null);
  };

  const handleUpdateSubtitle = (subId: string, patch: Partial<SubtitleSegment>) => {
    updateCurrentProject((prev) => ({
      ...prev,
      subtitles: prev.subtitles.map((s) => (s.id === subId ? { ...s, ...patch } : s)),
    }));
  };

  const handleDeleteSubtitle = (subId: string) => {
    updateCurrentProject((prev) => ({
      ...prev,
      subtitles: prev.subtitles.filter((s) => s.id !== subId),
    }));
    setSelectedSubtitleId(null);
  };

  const handleUpdateAudio = (patch: Partial<AudioConfig>) => {
    updateCurrentProject((prev) => ({
      ...prev,
      audio: { ...prev.audio, ...patch },
    }));
  };

  const handleUploadAudio = (file: File) => {
    const url = URL.createObjectURL(file);
    handleUpdateAudio({ customAudioUrl: url, customAudioName: file.name });
  };

  const selectedClipIndex = currentProject.clips.findIndex((c) => c.id === selectedClipId);
  const resolvedClipIndex = selectedClipIndex >= 0 ? selectedClipIndex : 0;
  const selectedClip = currentProject.clips[resolvedClipIndex] ?? null;
  const selectedClipStartTime = currentProject.clips
    .slice(0, resolvedClipIndex)
    .reduce((sum, c) => sum + c.duration, 0);
  const nextClip =
    selectedClip && resolvedClipIndex < currentProject.clips.length - 1
      ? currentProject.clips[resolvedClipIndex + 1]
      : null;
  const selectedAsset = selectedClip ? assetsMap.get(selectedClip.assetId) ?? null : null;
  const selectedSubtitle =
    currentProject.subtitles.find((s) => s.id === selectedSubtitleId) ?? null;

  const handlePreviewSfx = (type: SfxType, volume = 0.8) => {
    if (!audioEngineRef.current) {
      audioEngineRef.current = new StudioAudioEngine();
    }
    audioEngineRef.current.previewSfx(type, volume);
  };

  const handleSetSfxEvents = (events: SfxEvent[]) => {
    const sorted = [...events].sort((a, b) => a.time - b.time);
    updateCurrentProject((prev) => ({
      ...prev,
      sfxEvents: sorted,
    }));
  };

  const handleAddSfxEvent = (event: SfxEvent) => {
    updateCurrentProject((prev) => {
      const existing = prev.sfxEvents ?? [];
      const filtered = existing.filter((e) => e.id !== event.id);
      return {
        ...prev,
        sfxEvents: [...filtered, event].sort((a, b) => a.time - b.time),
      };
    });
  };

  const handleRemoveSfxEvent = (eventId: string) => {
    updateCurrentProject((prev) => ({
      ...prev,
      sfxEvents: (prev.sfxEvents ?? []).filter((e) => e.id !== eventId),
    }));
  };

  const handleSetVoiceoverCues = (cues: VoiceoverCue[]) => {
    updateCurrentProject((prev) => alignProjectTimelineToVoiceover(prev, cues));
  };

  const handleUpsertVoiceoverCue = (cue: VoiceoverCue) => {
    updateCurrentProject((prev) => {
      const existing = prev.voiceoverCues ?? [];
      const filtered = existing.filter((c) => {
        if (c.id === cue.id) return false;
        if (cue.subtitleId && c.subtitleId === cue.subtitleId) return false;
        return true;
      });
      const nextCues = [...filtered, cue].sort((a, b) => a.startTime - b.startTime);
      const aligned = alignProjectTimelineToVoiceover(prev, nextCues);
      return {
        ...aligned,
        audio: {
          ...aligned.audio,
          voiceoverEnabled: true,
        },
      };
    });
  };

  const handleRemoveVoiceoverCue = (cueId: string) => {
    updateCurrentProject((prev) => ({
      ...prev,
      voiceoverCues: (prev.voiceoverCues ?? []).filter((c) => c.id !== cueId),
    }));
  };

  const handlePreviewVoiceoverCue = (cue: VoiceoverCue) => {
    setIsPlaying(false);
    if (!audioEngineRef.current) {
      audioEngineRef.current = new StudioAudioEngine();
    }
    void audioEngineRef.current.previewVoiceoverCue(cue);
  };

  const handleSaveClonedVoice = (profile: ClonedVoiceProfile, activateNow: boolean) => {
    setClonedVoices((prev) => [profile, ...prev.filter((p) => p.id !== profile.id)]);
    if (activateNow) {
      handleUpdateAudio({
        activeClonedVoiceId: profile.id,
        voiceoverVoice: profile.baseVoice,
        voicePersonaPrompt: profile.voiceDesignPrompt,
        naturalMode: 'expressive',
        voiceoverEnabled: true,
      });
    }
  };

  const handleUpdateClonedVoice = (
    profileId: string,
    patch: Partial<ClonedVoiceProfile>
  ) => {
    setClonedVoices((prev) =>
      prev.map((p) => (p.id === profileId ? { ...p, ...patch } : p))
    );
    const shouldSyncCueAudio =
      patch.playbackRate !== undefined ||
      patch.eqLowGainDb !== undefined ||
      patch.eqMidGainDb !== undefined ||
      patch.eqHighGainDb !== undefined;
    if (shouldSyncCueAudio) {
      setProjects((prev) => {
        const next = { ...prev };
        (['douyin', 'tiktok', 'facebook'] as PlatformId[]).forEach((pid) => {
          const cues = next[pid].voiceoverCues ?? [];
          let changed = false;
          const updatedCues = cues.map((cue) => {
            if (cue.clonedVoiceId !== profileId) return cue;
            changed = true;
            return {
              ...cue,
              ...(patch.playbackRate !== undefined ? { playbackRate: patch.playbackRate } : {}),
              ...(patch.eqLowGainDb !== undefined ? { eqLowGainDb: patch.eqLowGainDb } : {}),
              ...(patch.eqMidGainDb !== undefined ? { eqMidGainDb: patch.eqMidGainDb } : {}),
              ...(patch.eqHighGainDb !== undefined ? { eqHighGainDb: patch.eqHighGainDb } : {}),
            };
          });
          if (changed) {
            next[pid] =
              patch.playbackRate !== undefined
                ? alignProjectTimelineToVoiceover(next[pid], updatedCues)
                : { ...next[pid], voiceoverCues: updatedCues };
          }
        });
        return next;
      });
    }
  };

  const handleDeleteClonedVoice = (profileId: string) => {
    setClonedVoices((prev) => prev.filter((p) => p.id !== profileId));
    setProjects((prev) => {
      const next = { ...prev };
      (['douyin', 'tiktok', 'facebook'] as PlatformId[]).forEach((pid) => {
        if (next[pid].audio.activeClonedVoiceId === profileId) {
          next[pid] = {
            ...next[pid],
            audio: {
              ...next[pid].audio,
              activeClonedVoiceId: undefined,
            },
          };
        }
      });
      return next;
    });
  };

  const handleApplyClipSubtitles = (
    clipStartTime: number,
    clipDuration: number,
    newSubs: SubtitleSegment[]
  ) => {
    const clipEnd = clipStartTime + clipDuration;
    updateCurrentProject((prev) => {
      const kept = prev.subtitles.filter((s) => {
        const mid = s.startTime + s.duration / 2;
        return mid < clipStartTime || mid > clipEnd;
      });
      const merged = [...kept, ...newSubs].sort((a, b) => a.startTime - b.startTime);
      return { ...prev, subtitles: merged };
    });
    if (newSubs[0]) {
      setSelectedSubtitleId(newSubs[0].id);
      setCurrentTime(newSubs[0].startTime + 0.05);
    }
  };

  const handlePreviewTransitionAtCut = (targetClipId: string) => {
    let cursor = 0;
    for (const c of currentProject.clips) {
      if (c.id === targetClipId) {
        const previewStart = Math.max(0, cursor - 0.35);
        setCurrentTime(previewStart);
        setIsPlaying(true);
        return;
      }
      cursor += c.duration;
    }
  };

  const handleSaveDigitalHuman = (profile: DigitalHumanProfile) => {
    setDigitalHumans((prev) => [profile, ...prev.filter((p) => p.id !== profile.id)]);
  };

  const handleDeleteDigitalHuman = (profileId: string) => {
    setDigitalHumans((prev) => prev.filter((p) => p.id !== profileId));
  };

  const handleUploadMediaAssetForAnchor = (file: File): Promise<MediaAsset | null> => {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
      const isVideo = file.type.startsWith('video/');

      if (isVideo) {
        const probe = document.createElement('video');
        probe.preload = 'auto';
        probe.muted = true;
        probe.onloadeddata = () => {
          const asset: MediaAsset = {
            id: `dh-upload-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            name: file.name,
            type: 'video',
            url,
            duration: Math.max(1.5, probe.duration || 5),
            width: probe.videoWidth || 1080,
            height: probe.videoHeight || 1920,
            source: 'upload',
            fileSizeLabel: `${sizeMb}MB`,
          };
          setAssets((prev) => [asset, ...prev]);
          void autoTagUploadedAsset(asset, probe);
          resolve(asset);
        };
        probe.onerror = () => resolve(null);
        probe.src = url;
      } else {
        const img = new Image();
        img.onload = () => {
          const asset: MediaAsset = {
            id: `dh-upload-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            name: file.name,
            type: 'image',
            url,
            duration: 5,
            width: img.naturalWidth || 1080,
            height: img.naturalHeight || 1920,
            source: 'upload',
            fileSizeLabel: `${sizeMb}MB`,
          };
          setAssets((prev) => [asset, ...prev]);
          void autoTagUploadedAsset(asset, img);
          resolve(asset);
        };
        img.onerror = () => resolve(null);
        img.src = url;
      }
    });
  };

  const handleEmbedDigitalHumanPip = (
    clipId: string,
    config: DigitalHumanClipConfig,
    drivenAudio?: {
      audioBase64: string;
      mimeType: string;
      durationSec: number;
      text: string;
      baseVoice: VoiceoverVoice;
      clonedVoiceId?: string;
    }
  ) => {
    let targetStart = 0;
    let targetDuration = 3;
    for (const c of currentProject.clips) {
      if (c.id === clipId) {
        targetDuration = c.duration;
        break;
      }
      targetStart += c.duration;
    }

    const linkedCueId = drivenAudio ? `dh-cue-${Date.now()}` : config.linkedCueId;
    const finalConfig: DigitalHumanClipConfig = {
      ...config,
      mode: 'pip-overlay',
      linkedCueId,
    };

    updateCurrentProject((prev) => {
      const updatedClips = prev.clips.map((c) =>
        c.id === clipId ? { ...c, digitalHuman: finalConfig } : c
      );

      let nextSubtitles = prev.subtitles;
      let nextCues = prev.voiceoverCues ?? [];
      let nextAudio = prev.audio;

      if (drivenAudio && linkedCueId) {
        const subId = `dh-sub-${Date.now()}`;
        const cueDuration = Math.max(0.8, drivenAudio.durationSec);
        const clipEnd = targetStart + targetDuration;

        // Replace overlapping cue/sub inside this clip window to keep speech clean
        nextCues = nextCues.filter((cue) => {
          const mid = cue.startTime + cue.duration / 2;
          return mid < targetStart || mid > clipEnd;
        });
        nextCues = [
          ...nextCues,
          {
            id: linkedCueId,
            subtitleId: subId,
            startTime: Number(targetStart.toFixed(2)),
            duration: cueDuration,
            text: drivenAudio.text,
            audioBase64: drivenAudio.audioBase64,
            mimeType: drivenAudio.mimeType,
            voiceName: drivenAudio.baseVoice,
            source: 'ai-tts' as const,
            clonedVoiceId: drivenAudio.clonedVoiceId,
            audioDurationSec: cueDuration,
          },
        ].sort((a, b) => a.startTime - b.startTime);

        nextSubtitles = nextSubtitles.filter((s) => {
          const mid = s.startTime + s.duration / 2;
          return mid < targetStart || mid > clipEnd;
        });
        nextSubtitles = [
          ...nextSubtitles,
          {
            id: subId,
            startTime: Number(targetStart.toFixed(2)),
            duration: cueDuration,
            text: drivenAudio.text,
            style: PLATFORM_META[prev.platform].defaultSubtitleStyle,
            position: 'bottom' as const,
          },
        ].sort((a, b) => a.startTime - b.startTime);

        nextAudio = {
          ...prev.audio,
          voiceoverEnabled: true,
          bgmAutoDucking: true,
        };
      }

      const nextState: PlatformProjectState = {
        ...prev,
        clips: updatedClips,
        subtitles: nextSubtitles,
        voiceoverCues: nextCues,
        audio: nextAudio,
      };
      return drivenAudio ? alignProjectTimelineToVoiceover(nextState, nextCues) : nextState;
    });

    setCurrentTime(targetStart + 0.05);
  };

  const handleRemoveClipDigitalHuman = (clipId: string) => {
    updateCurrentProject((prev) => ({
      ...prev,
      clips: prev.clips.map((c) => (c.id === clipId ? { ...c, digitalHuman: undefined } : c)),
    }));
  };

  const handleUpdateClipDigitalHumanAction = (
    clipId: string,
    action: DigitalHumanActionId,
    actionIntensity?: number
  ) => {
    updateCurrentProject((prev) => ({
      ...prev,
      clips: prev.clips.map((c) =>
        c.id === clipId && c.digitalHuman
          ? {
              ...c,
              digitalHuman: {
                ...c.digitalHuman,
                action,
                actionIntensity: actionIntensity ?? c.digitalHuman.actionIntensity ?? 1,
              },
            }
          : c
      ),
    }));
  };

  const handleUpdateClipDigitalHumanEmotion = (
    clipId: string,
    payload: {
      emotionMatchEnabled: boolean;
      emotion: DigitalHumanEmotionId;
      facialMuscles: DigitalHumanFacialMuscles;
      emotionSummary?: string;
    }
  ) => {
    updateCurrentProject((prev) => ({
      ...prev,
      clips: prev.clips.map((c) =>
        c.id === clipId && c.digitalHuman
          ? {
              ...c,
              digitalHuman: {
                ...c.digitalHuman,
                emotionMatchEnabled: payload.emotionMatchEnabled,
                emotion: payload.emotion,
                facialMuscles: payload.facialMuscles,
                emotionSummary: payload.emotionSummary,
              },
            }
          : c
      ),
    }));
  };

  const handleInsertDigitalHumanClip = ({
    insertAt,
    config,
    duration,
    transition,
    drivenAudio,
  }: {
    insertAt: DigitalHumanInsertTarget;
    config: DigitalHumanClipConfig;
    duration: number;
    transition: TransitionType;
    drivenAudio?: {
      audioBase64: string;
      mimeType: string;
      durationSec: number;
      text: string;
      baseVoice: VoiceoverVoice;
      clonedVoiceId?: string;
    };
  }) => {
    // Ensure a MediaAsset exists for the digital human anchor so asset lookup & timeline thumbnails work
    let anchorAssetId = config.avatarAssetId;
    if (!anchorAssetId || !assetsMap.has(anchorAssetId)) {
      const existing = assets.find((a) => a.url === config.avatarUrl);
      if (existing) {
        anchorAssetId = existing.id;
      } else {
        const newAsset: MediaAsset = {
          id: `dh-asset-${Date.now()}`,
          name: `数字人-${config.profileName}`,
          type: config.avatarMediaType,
          url: config.avatarUrl,
          duration: Math.max(duration, 5),
          width: 540,
          height: 960,
          source: 'upload',
        };
        anchorAssetId = newAsset.id;
        setAssets((prev) => [newAsset, ...prev]);
      }
    }

    const newClipId = `${activePlatform}-dh-${Date.now()}`;
    const linkedCueId = drivenAudio ? `dh-cue-${Date.now()}` : undefined;
    const finalConfig: DigitalHumanClipConfig = {
      ...config,
      avatarAssetId: anchorAssetId,
      mode: 'full-scene',
      linkedCueId,
    };

    const newClip: TimelineClip = {
      id: newClipId,
      assetId: anchorAssetId,
      label: `数字人·${config.profileName}`,
      trimStart: 0,
      duration: Number(duration.toFixed(2)),
      transition,
      motion: 'static',
      filter: 'natural',
      speed: 1,
      hookTag: insertAt === 'start' ? '数字人开场钩子' : undefined,
      digitalHuman: finalConfig,
    };

    let insertedStartTime = 0;

    updateCurrentProject((prev) => {
      let insertIdx = prev.clips.length;
      if (insertAt === 'start') {
        insertIdx = 0;
      } else if (insertAt === 'before') {
        insertIdx = Math.max(0, selectedClipIndex >= 0 ? selectedClipIndex : 0);
      } else if (insertAt === 'after') {
        insertIdx =
          selectedClipIndex >= 0 ? Math.min(prev.clips.length, selectedClipIndex + 1) : prev.clips.length;
      }

      insertedStartTime = prev.clips
        .slice(0, insertIdx)
        .reduce((sum, c) => sum + c.duration, 0);

      const nextClips = [...prev.clips];
      nextClips.splice(insertIdx, 0, newClip);

      // Shift all subtitles, voiceover cues, and SFX at or after insertedStartTime forward by duration
      let nextSubtitles = prev.subtitles.map((s) =>
        s.startTime >= insertedStartTime - 0.05
          ? { ...s, startTime: Number((s.startTime + duration).toFixed(2)) }
          : s
      );
      let nextCues = (prev.voiceoverCues ?? []).map((cue) =>
        cue.startTime >= insertedStartTime - 0.05
          ? { ...cue, startTime: Number((cue.startTime + duration).toFixed(2)) }
          : cue
      );
      const nextSfx = (prev.sfxEvents ?? []).map((ev) =>
        ev.time >= insertedStartTime - 0.05
          ? { ...ev, time: Number((ev.time + duration).toFixed(2)) }
          : ev
      );

      let nextAudio = prev.audio;
      if (drivenAudio && linkedCueId) {
        const subId = `dh-sub-${Date.now()}`;
        const cueDur = Math.min(duration, Math.max(0.8, drivenAudio.durationSec));
        nextCues = [
          ...nextCues,
          {
            id: linkedCueId,
            subtitleId: subId,
            startTime: Number(insertedStartTime.toFixed(2)),
            duration: cueDur,
            text: drivenAudio.text,
            audioBase64: drivenAudio.audioBase64,
            mimeType: drivenAudio.mimeType,
            voiceName: drivenAudio.baseVoice,
            source: 'ai-tts' as const,
            clonedVoiceId: drivenAudio.clonedVoiceId,
            audioDurationSec: cueDur,
          },
        ].sort((a, b) => a.startTime - b.startTime);

        nextSubtitles = [
          ...nextSubtitles,
          {
            id: subId,
            startTime: Number(insertedStartTime.toFixed(2)),
            duration: cueDur,
            text: drivenAudio.text,
            style: PLATFORM_META[prev.platform].defaultSubtitleStyle,
            position: 'bottom' as const,
          },
        ].sort((a, b) => a.startTime - b.startTime);

        nextAudio = {
          ...prev.audio,
          voiceoverEnabled: true,
          bgmAutoDucking: true,
        };
      }

      return {
        ...prev,
        clips: nextClips,
        subtitles: nextSubtitles,
        voiceoverCues: nextCues,
        sfxEvents: nextSfx,
        audio: nextAudio,
      };
    });

    setSelectedClipId(newClipId);
    setSelectedSubtitleId(null);
    setCurrentTime(Number((insertedStartTime + 0.05).toFixed(2)));
  };

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
          <div className="flex-1 flex min-h-0">
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
              onUpdateClipDigitalHumanEmotion={handleUpdateClipDigitalHumanEmotion}
              onInsertDigitalHumanClip={handleInsertDigitalHumanClip}
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
