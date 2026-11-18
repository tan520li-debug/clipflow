import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { DigitalHumanInsertTarget } from '../DigitalHumanTab';
import type {
  AudioConfig,
  AutoEditApiResponse,
  BgmPreset,
  ClonedVoiceProfile,
  DigitalHumanActionId,
  DigitalHumanCameraMotion,
  DigitalHumanClipConfig,
  DigitalHumanEmotionId,
  DigitalHumanFacialMuscles,
  DigitalHumanPhonemeAlignmentProfile,
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
} from '../../types/studio';
import { apiFetch } from '../../client/api/http';
import { placeSuggestedSfxEvents, boundsForClips } from '../../domain/timeline/placeSfx';
import { duplicateClip } from '../../client/timeline/duplicateClip';
import { snapClipsToBeat } from '../../client/timeline/snapBeat';
import {
  assignPointsToSplitClip,
  clipStart,
  duplicatePointSpan,
  duplicateTimeSpan,
  followSubtitleTimes,
  cuesAfterSubtitleEdit,
  insertPointSpan,
  insertTimeSpan,
  movePointSpan,
  moveTimeSpan,
  remapPointsToDurations,
  remapRangesToDurations,
  removePointSpan,
  removeTimeSpan,
  scalePoints,
} from '../../client/timeline/shiftTracks';
import { splitClipAtLocalTime } from '../../client/timeline/splitClip';
import { StudioAudioEngine } from '../../utils/audioEngine';
import {
  alignProjectTimelineToVoiceover,
  applyAiPlanToProjects,
  buildLocalBeatSyncTimeline,
  PLATFORM_META,
} from '../../utils/autoEditEngine';
import {
  captureClipSnapshotBase64,
  findClipAtTime,
  type LoadedMediaElement,
} from '../../utils/canvasRenderer';
import { fileToPersistentAvatarDataUrl } from '../../utils/digitalHumanAssets';

function retimedForDurations<
  T extends {
    clips: { duration: number }[];
    subtitles: SubtitleSegment[];
    voiceoverCues?: VoiceoverCue[];
    sfxEvents?: SfxEvent[];
  },
>(prev: T, clips: T['clips']): T {
  const oldDurations = prev.clips.map((clip) => clip.duration);
  const newDurations = clips.map((clip) => clip.duration);
  if (
    oldDurations.length !== newDurations.length ||
    oldDurations.every((duration, index) => duration === newDurations[index])
  ) {
    return { ...prev, clips };
  }
  return {
    ...prev,
    clips,
    subtitles: remapRangesToDurations(prev.subtitles, oldDurations, newDurations),
    voiceoverCues: prev.voiceoverCues
      ? remapRangesToDurations(prev.voiceoverCues, oldDurations, newDurations)
      : prev.voiceoverCues,
    sfxEvents: prev.sfxEvents
      ? remapPointsToDurations(prev.sfxEvents, oldDurations, newDurations)
      : prev.sfxEvents,
  };
}

export interface StudioCommandInput {
  activePlatform: PlatformId;
  setActivePlatform: Dispatch<SetStateAction<PlatformId>>;
  setIsPlaying: Dispatch<SetStateAction<boolean>>;
  currentTime: number;
  setCurrentTime: Dispatch<SetStateAction<number>>;
  selectedClipId: string | null;
  setSelectedClipId: Dispatch<SetStateAction<string | null>>;
  selectedSubtitleId: string | null;
  setSelectedSubtitleId: Dispatch<SetStateAction<string | null>>;
  assets: MediaAsset[];
  setAssets: Dispatch<SetStateAction<MediaAsset[]>>;
  projects: Record<PlatformId, PlatformProjectState>;
  setProjects: Dispatch<SetStateAction<Record<PlatformId, PlatformProjectState>>>;
  currentProject: PlatformProjectState;
  assetsMap: Map<string, MediaAsset>;
  totalDuration: number;
  brief: string;
  editingStyle: EditingStyle;
  targetPlatforms: PlatformId[];
  targetDuration: number;
  bpm: number;
  autoSoundOnEdit: boolean;
  setIsGenerating: Dispatch<SetStateAction<boolean>>;
  setAiError: Dispatch<SetStateAction<string | null>>;
  clonedVoices: ClonedVoiceProfile[];
  setClonedVoices: Dispatch<SetStateAction<ClonedVoiceProfile[]>>;
  setDigitalHumans: Dispatch<SetStateAction<DigitalHumanProfile[]>>;
  mediaCacheRef: MutableRefObject<Map<string, LoadedMediaElement>>;
  audioEngineRef: MutableRefObject<StudioAudioEngine | null>;
}

export function useStudioCommands(input: StudioCommandInput) {
  const {
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
  } = input;

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
      const res = await apiFetch('/api/tag-media', {
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
      const res = await apiFetch('/api/auto-edit', {
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
          apiFetch('/api/suggest-bgm', {
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
                return apiFetch('/api/generate-voiceover', {
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
          apiFetch('/api/suggest-sfx', {
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
            sfxEvents: Array.isArray(sfxData?.events)
              ? placeSuggestedSfxEvents(sfxData.events as SfxEvent[], {
                  totalDuration: cursor,
                  clips: timelineNodes.map((node) => ({
                    startTime: node.startTime,
                    endTime: node.endTime,
                  })),
                  subtitles: cur.subtitles,
                })
              : cur.sfxEvents,
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
    updateCurrentProject((prev) => {
      const oldTotal = prev.clips.reduce((sum, clip) => sum + clip.duration, 0);
      const newTotal = result.clips.reduce((sum, clip) => sum + clip.duration, 0);
      const factor = oldTotal > 0 ? newTotal / oldTotal : 1;
      return {
        ...prev,
        clips: result.clips,
        subtitles: result.subtitles,
        audio: { ...prev.audio, bpm },
        voiceoverCues: prev.voiceoverCues
          ? followSubtitleTimes(prev.voiceoverCues, result.subtitles, factor)
          : prev.voiceoverCues,
        sfxEvents: prev.sfxEvents ? scalePoints(prev.sfxEvents, factor) : prev.sfxEvents,
      };
    });
    setCurrentTime(0);
    setSelectedClipId(result.clips[0]?.id ?? null);
    setSelectedSubtitleId(null);
  };

  const handleSplitAtPlayhead = () => {
    const info = findClipAtTime(currentProject.clips, currentTime);
    if (!info) return;
    const { index, clip, localTime } = info;
    const split = splitClipAtLocalTime(clip, localTime, `${clip.id}-split-${Date.now()}`);
    if (!split) return;

    updateCurrentProject((prev) => {
      const nextClips = [...prev.clips];
      nextClips.splice(index, 1, split.first, split.second);
      const splitAt = clipStart(prev.clips, index) + split.first.duration;
      return {
        ...prev,
        clips: nextClips,
        sfxEvents: prev.sfxEvents
          ? assignPointsToSplitClip(prev.sfxEvents, splitAt, clip.id, split.second.id)
          : prev.sfxEvents,
      };
    });
    setSelectedClipId(split.second.id);
    setSelectedSubtitleId(null);
  };

  const handleSnapToBeat = () => {
    updateCurrentProject((prev) => {
      const clips = snapClipsToBeat(prev.clips, prev.audio.bpm, assetsMap);
      return retimedForDurations(prev, clips);
    });
  };

  const handleUpdateClip = (clipId: string, patch: Partial<TimelineClip>) => {
    updateCurrentProject((prev) => {
      const clips = prev.clips.map((c) => (c.id === clipId ? { ...c, ...patch } : c));
      if (!Number.isFinite(patch.duration)) return { ...prev, clips };
      return retimedForDurations(prev, clips);
    });
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
      const from = { start: clipStart(prev.clips, idx), duration: prev.clips[idx].duration };
      const next = [...prev.clips];
      const [item] = next.splice(idx, 1);
      next.splice(targetIdx, 0, item);
      const toStart = clipStart(next, next.findIndex((clip) => clip.id === clipId));
      return {
        ...prev,
        clips: next,
        subtitles: moveTimeSpan(prev.subtitles, from, toStart),
        voiceoverCues: prev.voiceoverCues
          ? moveTimeSpan(prev.voiceoverCues, from, toStart)
          : prev.voiceoverCues,
        sfxEvents: prev.sfxEvents ? movePointSpan(prev.sfxEvents, from, toStart) : prev.sfxEvents,
      };
    });
  };

  const handleDuplicateClip = (clipId: string) => {
    updateCurrentProject((prev) => {
      const idx = prev.clips.findIndex((c) => c.id === clipId);
      if (idx === -1) return prev;
      const orig = prev.clips[idx];
      const stamp = Date.now();
      const copy = duplicateClip(orig, `${orig.id}-copy-${stamp}`);
      const source = { start: clipStart(prev.clips, idx), duration: orig.duration };
      const copyId = (id: string) => `${id}-copy-${stamp}`;
      const next = [...prev.clips];
      next.splice(idx + 1, 0, copy);
      return {
        ...prev,
        clips: next,
        subtitles: duplicateTimeSpan(prev.subtitles, source, copyId),
        voiceoverCues: prev.voiceoverCues
          ? duplicateTimeSpan(prev.voiceoverCues, source, copyId)
          : prev.voiceoverCues,
        sfxEvents: prev.sfxEvents
          ? duplicatePointSpan(prev.sfxEvents, source, copyId).map((event) =>
              event.linkedClipId === orig.id && event.id.endsWith(`-copy-${stamp}`)
                ? { ...event, linkedClipId: copy.id }
                : event,
            )
          : prev.sfxEvents,
      };
    });
  };

  const handleDeleteClip = (clipId: string) => {
    if (currentProject.clips.length <= 1) return;
    updateCurrentProject((prev) => {
      if (prev.clips.length <= 1) return prev;
      const idx = prev.clips.findIndex((c) => c.id === clipId);
      if (idx === -1) return prev;
      const span = { start: clipStart(prev.clips, idx), duration: prev.clips[idx].duration };
      return {
        ...prev,
        clips: prev.clips.filter((c) => c.id !== clipId),
        subtitles: removeTimeSpan(prev.subtitles, span),
        voiceoverCues: prev.voiceoverCues
          ? removeTimeSpan(prev.voiceoverCues, span)
          : prev.voiceoverCues,
        sfxEvents: prev.sfxEvents
          ? removePointSpan(prev.sfxEvents, span).filter((event) => event.linkedClipId !== clipId)
          : prev.sfxEvents,
      };
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
    updateCurrentProject((prev) => {
      const subtitles = prev.subtitles.map((s) => (s.id === subId ? { ...s, ...patch } : s));
      const subtitle = subtitles.find((s) => s.id === subId);
      const retimed = patch.startTime !== undefined || patch.duration !== undefined;
      return {
        ...prev,
        subtitles,
        voiceoverCues:
          subtitle && prev.voiceoverCues && (retimed || patch.text !== undefined)
            ? cuesAfterSubtitleEdit(prev.voiceoverCues, subId, {
                startTime: subtitle.startTime,
                duration: subtitle.duration,
                ...(patch.text !== undefined ? { text: patch.text } : {}),
              })
            : prev.voiceoverCues,
      };
    });
  };

  const handleDeleteSubtitle = (subId: string) => {
    updateCurrentProject((prev) => ({
      ...prev,
      subtitles: prev.subtitles.filter((s) => s.id !== subId),
      voiceoverCues: prev.voiceoverCues
        ? cuesAfterSubtitleEdit(prev.voiceoverCues, subId, null)
        : prev.voiceoverCues,
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

  const handleSetSfxEvents = (events: SfxEvent[]): SfxEvent[] => {
    let placed: SfxEvent[] = [];
    updateCurrentProject((prev) => {
      const clips = boundsForClips(prev.clips);
      const totalDuration = clips.length > 0 ? clips[clips.length - 1].endTime : 0;
      placed = placeSuggestedSfxEvents(events, {
        totalDuration,
        clips,
        subtitles: prev.subtitles,
      }).sort((a, b) => a.time - b.time);
      return {
        ...prev,
        sfxEvents: placed,
      };
    });
    return placed;
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

  const handleSetVoiceoverCues = (cues: VoiceoverCue[], sfxEvents?: SfxEvent[]): SfxEvent[] | undefined => {
    let placed: SfxEvent[] | undefined;
    updateCurrentProject((prev) => {
      const aligned = alignProjectTimelineToVoiceover(prev, cues);
      if (!sfxEvents) return aligned;
      const clips = boundsForClips(aligned.clips);
      const totalDuration = clips.length > 0 ? clips[clips.length - 1].endTime : 0;
      placed = placeSuggestedSfxEvents(sfxEvents, {
        totalDuration,
        clips,
        subtitles: aligned.subtitles,
      }).sort((a, b) => a.time - b.time);
      return { ...aligned, sfxEvents: placed };
    });
    return placed;
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

  const handleUploadMediaAssetForAnchor = async (file: File): Promise<MediaAsset | null> => {
    const converted = await fileToPersistentAvatarDataUrl(file);
    if (!converted) return null;

    const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
    const asset: MediaAsset = {
      id: `dh-upload-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: file.name,
      type: converted.mediaType,
      url: converted.url,
      duration: converted.duration,
      width: converted.width,
      height: converted.height,
      source: 'upload',
      fileSizeLabel: `${sizeMb}MB`,
    };
    setAssets((prev) => [asset, ...prev]);

    if (converted.mediaType === 'video') {
      const probe = document.createElement('video');
      probe.preload = 'auto';
      probe.muted = true;
      probe.onloadeddata = () => {
        void autoTagUploadedAsset(asset, probe);
      };
      probe.src = converted.url;
    } else {
      const img = new Image();
      img.onload = () => {
        void autoTagUploadedAsset(asset, img);
      };
      img.src = converted.url;
    }

    return asset;
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
      phonemeAlignment?: DigitalHumanPhonemeAlignmentProfile;
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
            phonemeAlignment: drivenAudio.phonemeAlignment ?? config.phonemeAlignment,
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
    actionIntensity?: number,
    options?: {
      actionBlendDuration?: number;
      blendFromAction?: DigitalHumanActionId;
    }
  ) => {
    updateCurrentProject((prev) => ({
      ...prev,
      clips: prev.clips.map((c) => {
        if (c.id !== clipId || !c.digitalHuman) return c;
        const prevAction = c.digitalHuman.action ?? 'explain';
        const resolvedBlendFrom =
          options?.blendFromAction ??
          (prevAction !== action ? prevAction : c.digitalHuman.blendFromAction);
        return {
          ...c,
          digitalHuman: {
            ...c.digitalHuman,
            action,
            actionIntensity: actionIntensity ?? c.digitalHuman.actionIntensity ?? 1,
            actionBlendDuration:
              options?.actionBlendDuration ?? c.digitalHuman.actionBlendDuration ?? 0.45,
            blendFromAction: resolvedBlendFrom,
          },
        };
      }),
    }));
  };

  const handleBatchApplyDigitalHumanActions = (
    updates: Array<{
      clipId: string;
      action: DigitalHumanActionId;
      actionIntensity?: number;
      actionBlendDuration?: number;
    }>
  ) => {
    const map = new Map(updates.map((u) => [u.clipId, u]));
    updateCurrentProject((prev) => ({
      ...prev,
      clips: prev.clips.map((c, idx) => {
        const match = map.get(c.id);
        if (!match || !c.digitalHuman) return c;
        const prevClipAction = idx > 0 ? prev.clips[idx - 1]?.digitalHuman?.action : undefined;
        return {
          ...c,
          digitalHuman: {
            ...c.digitalHuman,
            action: match.action,
            actionIntensity: match.actionIntensity ?? c.digitalHuman.actionIntensity ?? 1,
            actionBlendDuration:
              match.actionBlendDuration ?? c.digitalHuman.actionBlendDuration ?? 0.45,
            blendFromAction:
              prevClipAction ??
              (c.digitalHuman.action && c.digitalHuman.action !== match.action
                ? c.digitalHuman.action
                : c.digitalHuman.blendFromAction),
          },
        };
      }),
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

  const handleUpdateClipDigitalHumanCameraMotion = (
    clipId: string,
    cameraMotion: DigitalHumanCameraMotion
  ) => {
    updateCurrentProject((prev) => ({
      ...prev,
      clips: prev.clips.map((c) =>
        c.id === clipId && c.digitalHuman
          ? {
              ...c,
              digitalHuman: {
                ...c.digitalHuman,
                cameraMotion,
              },
            }
          : c
      ),
    }));
  };

  const handleUpdateClipDigitalHumanPhonemeAlignment = (
    clipId: string,
    phonemeAlignment: DigitalHumanPhonemeAlignmentProfile
  ) => {
    updateCurrentProject((prev) => {
      const targetClip = prev.clips.find((c) => c.id === clipId);
      const linkedCueId = targetClip?.digitalHuman?.linkedCueId;
      return {
        ...prev,
        clips: prev.clips.map((c) =>
          c.id === clipId && c.digitalHuman
            ? {
                ...c,
                digitalHuman: {
                  ...c.digitalHuman,
                  phonemeAlignment,
                },
              }
            : c
        ),
        voiceoverCues:
          linkedCueId && prev.voiceoverCues
            ? prev.voiceoverCues.map((cue) =>
                cue.id === linkedCueId ? { ...cue, phonemeAlignment } : cue
              )
            : prev.voiceoverCues,
      };
    });
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
      phonemeAlignment?: DigitalHumanPhonemeAlignmentProfile;
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

      let nextSubtitles = insertTimeSpan(prev.subtitles, insertedStartTime, duration);
      let nextCues = insertTimeSpan(prev.voiceoverCues ?? [], insertedStartTime, duration);
      const nextSfx = insertPointSpan(prev.sfxEvents ?? [], insertedStartTime, duration);

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
            phonemeAlignment: drivenAudio.phonemeAlignment ?? config.phonemeAlignment,
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

  return {
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
  };
}
