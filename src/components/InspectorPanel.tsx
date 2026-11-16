import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  AudioLines,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  GitCommitHorizontal,
  Loader2,
  Mic,
  Music,
  Palette,
  Play,
  Plus,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Sparkles,
  Square,
  Trash2,
  Upload,
  UserCheck,
  Volume2,
  Wand2,
} from 'lucide-react';
import type {
  AudioConfig,
  AudioCopyrightScanResult,
  BgmPreset,
  BgmSuggestion,
  ClonedVoiceProfile,
  ColorAdjustments,
  ColorFilter,
  CopyrightAlternativeTrack,
  DigitalHumanActionId,
  DigitalHumanClipConfig,
  DigitalHumanEmotionId,
  DigitalHumanFacialMuscles,
  DigitalHumanProfile,
  MediaAsset,
  MotionType,
  PlatformId,
  SfxEvent,
  SfxLibrarySuggestion,
  SfxTriggerCategory,
  SfxType,
  SubtitleSegment,
  SubtitleStyle,
  TimelineClip,
  TransitionSequenceSuggestion,
  TransitionSuggestion,
  TransitionType,
  VoiceDenoiseProfile,
  VoiceoverCue,
  VoiceoverVoice,
} from '../types/studio';
import { analyzeVoiceoverCuesAcousticMetrics } from '../utils/audioEngine';
import { extractAudioSliceAsWavBase64 } from '../utils/audioExtractor';
import { PLATFORM_META } from '../utils/autoEditEngine';
import {
  captureClipSnapshotBase64,
  renderColorComparisonThumbnail,
  type LoadedMediaElement,
} from '../utils/canvasRenderer';
import { DigitalHumanTab, type DigitalHumanInsertTarget } from './DigitalHumanTab';
import {
  getDigitalHumanActionTemplate,
  getDigitalHumanEmotionPreset,
} from '../utils/digitalHumanAssets';
import { TransitionMiniPreview } from './TransitionMiniPreview';
import { VoiceCloneModal } from './VoiceCloneModal';

interface InspectorPanelProps {
  selectedClip: TimelineClip | null;
  selectedAsset: MediaAsset | null;
  selectedClipStartTime: number;
  nextClip: TimelineClip | null;
  clips: TimelineClip[];
  subtitles: SubtitleSegment[];
  voiceoverCues: VoiceoverCue[];
  sfxEvents: SfxEvent[];
  currentTime: number;
  platform: PlatformId;
  mediaCache: Map<string, LoadedMediaElement>;
  selectedSubtitle: SubtitleSegment | null;
  audio: AudioConfig;
  clonedVoices: ClonedVoiceProfile[];
  onSaveClonedVoice: (profile: ClonedVoiceProfile, activateNow: boolean) => void;
  onUpdateClonedVoice: (profileId: string, patch: Partial<ClonedVoiceProfile>) => void;
  onDeleteClonedVoice: (profileId: string) => void;
  onUpdateClip: (clipId: string, patch: Partial<TimelineClip>) => void;
  onApplyTransitionSequence: (
    updates: Array<{ clipId: string; transition: TransitionType }>
  ) => void;
  onMoveClip: (clipId: string, direction: -1 | 1) => void;
  onDuplicateClip: (clipId: string) => void;
  onDeleteClip: (clipId: string) => void;
  onPreviewTransitionAtCut: (targetClipId: string) => void;
  onApplyClipSubtitles: (
    clipStartTime: number,
    clipDuration: number,
    newSubs: SubtitleSegment[]
  ) => void;
  onUpdateSubtitle: (subId: string, patch: Partial<SubtitleSegment>) => void;
  onDeleteSubtitle: (subId: string) => void;
  onAddSubtitle: () => void;
  onUpdateAudio: (patch: Partial<AudioConfig>) => void;
  onUploadAudio: (file: File) => void;
  onPreviewSfx: (type: SfxType, volume?: number) => void;
  onSetSfxEvents: (events: SfxEvent[]) => void;
  onAddSfxEvent: (event: SfxEvent) => void;
  onRemoveSfxEvent: (eventId: string) => void;
  onSetVoiceoverCues: (cues: VoiceoverCue[]) => void;
  onUpsertVoiceoverCue: (cue: VoiceoverCue) => void;
  onRemoveVoiceoverCue: (cueId: string) => void;
  onPreviewVoiceoverCue: (cue: VoiceoverCue) => void;
  onSeek: (timeSec: number) => void;
  assets: MediaAsset[];
  digitalHumans: DigitalHumanProfile[];
  onSaveDigitalHuman: (profile: DigitalHumanProfile) => void;
  onDeleteDigitalHuman: (profileId: string) => void;
  onUploadMediaAssetForAnchor: (file: File) => Promise<MediaAsset | null>;
  onEmbedDigitalHumanPip: (
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
  ) => void;
  onRemoveClipDigitalHuman: (clipId: string) => void;
  onUpdateClipDigitalHumanAction: (
    clipId: string,
    action: DigitalHumanActionId,
    actionIntensity?: number
  ) => void;
  onUpdateClipDigitalHumanEmotion: (
    clipId: string,
    payload: {
      emotionMatchEnabled: boolean;
      emotion: DigitalHumanEmotionId;
      facialMuscles: DigitalHumanFacialMuscles;
      emotionSummary?: string;
    }
  ) => void;
  onInsertDigitalHumanClip: (params: {
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
  }) => void;
}

const PRESET_TRANSITIONS: TransitionType[] = [
  'cut',
  'crossfade',
  'zoom-punch',
  'spin-switch',
  'whip-pan',
  'flash',
];

const EXTENDED_TRANSITIONS: TransitionType[] = [
  'blur-dissolve',
  'push-pull',
  'page-flip',
  'iris-wipe',
  'curtain-split',
  'glitch-slice',
];

const ALL_TRANSITIONS: TransitionType[] = [...PRESET_TRANSITIONS, ...EXTENDED_TRANSITIONS];

const TRANSITION_DISPLAY_NAMES: Record<TransitionType, string> = {
  cut: '硬切',
  crossfade: '淡入淡出',
  'whip-pan': '横甩转场',
  'zoom-punch': '缩放跳转',
  'spin-switch': '旋转切换',
  flash: '闪白节奏切',
  'blur-dissolve': '模糊渐变',
  'push-pull': '纵深推拉',
  'page-flip': '翻页切换',
  'iris-wipe': '圆形光圈',
  'curtain-split': '双开门帘',
  'glitch-slice': '故障切片',
};

const BGM_PRESET_BPM: Record<BgmPreset, number> = {
  'upbeat-128': 128,
  'tech-118': 118,
  'fresh-112': 112,
  'suspense-104': 104,
  'lofi-95': 95,
  'narrative-92': 92,
  none: 120,
};

const SFX_LIBRARY_CATALOG: Array<{
  type: SfxType;
  label: string;
  shortTag: string;
  defaultCategory: SfxTriggerCategory;
  duration: number;
}> = [
  { type: 'whoosh', label: '咻声转场', shortTag: '咻 Whoosh', defaultCategory: 'transition', duration: 0.25 },
  { type: 'ding', label: '叮声高亮', shortTag: '叮 Ding', defaultCategory: 'subtitle', duration: 0.42 },
  { type: 'click', label: '咔哒点击', shortTag: '咔哒 Click', defaultCategory: 'action', duration: 0.08 },
  { type: 'pop', label: '气泡弹出', shortTag: '啵 Pop', defaultCategory: 'action', duration: 0.12 },
  { type: 'swoosh-impact', label: '重击扫响', shortTag: '爆点 Hit', defaultCategory: 'transition', duration: 0.35 },
  { type: 'shimmer', label: '星芒闪烁', shortTag: '星芒 Swell', defaultCategory: 'hook', duration: 0.45 },
];

const SFX_CATEGORY_LABELS: Record<SfxTriggerCategory, string> = {
  transition: '转场',
  action: '动作',
  subtitle: '字幕',
  hook: '钩子',
};

const VOICEOVER_ACTORS: Array<{ id: VoiceoverVoice; label: string }> = [
  { id: 'Kore', label: 'Kore · 温暖自然女声' },
  { id: 'Zephyr', label: 'Zephyr · 轻快活力青年' },
  { id: 'Puck', label: 'Puck · 元气种草声线' },
  { id: 'Charon', label: 'Charon · 沉稳电影旁白' },
  { id: 'Fenrir', label: 'Fenrir · 低沉磁性男声' },
];

const VOICE_PERSONA_PRESETS: Array<{ label: string; prompt: string }> = [
  {
    label: '邻家闲聊',
    prompt: '像朋友面对面分享日常一样松弛自然，带轻微气声与口语停顿，不要播音腔',
  },
  {
    label: '活力种草',
    prompt: '富有感染力的短视频博主语态，关键卖点处语气上扬、节奏轻快',
  },
  {
    label: '电影旁白',
    prompt: '低沉克制的纪录片与剧情旁白感，句尾有呼吸留白与情绪张力',
  },
  {
    label: '干货解说',
    prompt: '清晰利落、条理分明的知识科普口播，重点词微重音强调',
  },
];

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const b64 = result.includes(',') ? result.split(',')[1] : result;
      resolve(b64);
    };
    reader.onerror = () => reject(new Error('音频读取失败'));
    reader.readAsDataURL(blob);
  });
}

export function InspectorPanel({
  selectedClip,
  selectedAsset,
  selectedClipStartTime,
  nextClip,
  clips,
  subtitles,
  voiceoverCues,
  sfxEvents,
  currentTime,
  platform,
  mediaCache,
  selectedSubtitle,
  audio,
  clonedVoices,
  onSaveClonedVoice,
  onUpdateClonedVoice,
  onDeleteClonedVoice,
  onUpdateClip,
  onApplyTransitionSequence,
  onMoveClip,
  onDuplicateClip,
  onDeleteClip,
  onPreviewTransitionAtCut,
  onApplyClipSubtitles,
  onUpdateSubtitle,
  onDeleteSubtitle,
  onAddSubtitle,
  onUpdateAudio,
  onUploadAudio,
  onPreviewSfx,
  onSetSfxEvents,
  onAddSfxEvent,
  onRemoveSfxEvent,
  onSetVoiceoverCues,
  onUpsertVoiceoverCue,
  onRemoveVoiceoverCue,
  onPreviewVoiceoverCue,
  onSeek,
  assets,
  digitalHumans,
  onSaveDigitalHuman,
  onDeleteDigitalHuman,
  onUploadMediaAssetForAnchor,
  onEmbedDigitalHumanPip,
  onRemoveClipDigitalHuman,
  onUpdateClipDigitalHumanAction,
  onUpdateClipDigitalHumanEmotion,
  onInsertDigitalHumanClip,
}: InspectorPanelProps) {
  const audioInputRef = useRef<HTMLInputElement | null>(null);
  const speechFileInputRef = useRef<HTMLInputElement | null>(null);
  const voiceUploadInputRef = useRef<HTMLInputElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordStreamRef = useRef<MediaStream | null>(null);
  const recordTimerRef = useRef<number | null>(null);
  const [analyzingTransition, setAnalyzingTransition] = useState(false);
  const [transitionError, setTransitionError] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<TransitionSuggestion | null>(null);
  const [appliedForPair, setAppliedForPair] = useState<string | null>(null);
  const [showAllTransitions, setShowAllTransitions] = useState(false);
  const [analyzingSequence, setAnalyzingSequence] = useState(false);
  const [sequenceError, setSequenceError] = useState<string | null>(null);
  const [sequenceSuggestion, setSequenceSuggestion] = useState<TransitionSequenceSuggestion | null>(
    null
  );
  const [sequenceApplied, setSequenceApplied] = useState(false);
  const [currentSeqApplied, setCurrentSeqApplied] = useState(false);
  const [matchingColor, setMatchingColor] = useState(false);
  const [colorError, setColorError] = useState<string | null>(null);
  const [analyzingBgm, setAnalyzingBgm] = useState(false);
  const [bgmError, setBgmError] = useState<string | null>(null);
  const [bgmSuggestion, setBgmSuggestion] = useState<BgmSuggestion | null>(null);
  const [bgmApplied, setBgmApplied] = useState(false);
  const [transcribingSpeech, setTranscribingSpeech] = useState(false);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [speechResultNote, setSpeechResultNote] = useState<string | null>(null);
  const [analyzingSfx, setAnalyzingSfx] = useState(false);
  const [sfxError, setSfxError] = useState<string | null>(null);
  const [sfxSuggestion, setSfxSuggestion] = useState<SfxLibrarySuggestion | null>(null);
  const [sfxAppliedAll, setSfxAppliedAll] = useState(false);
  const [generatingVoiceover, setGeneratingVoiceover] = useState(false);
  const [voiceoverError, setVoiceoverError] = useState<string | null>(null);
  const [voiceoverNote, setVoiceoverNote] = useState<string | null>(null);
  const [packagingFullAudio, setPackagingFullAudio] = useState(false);
  const [fullAudioNote, setFullAudioNote] = useState<string | null>(null);
  const [recordTargetSubId, setRecordTargetSubId] = useState<string>('__playhead__');
  const [isRecordingMic, setIsRecordingMic] = useState(false);
  const [recordElapsedSec, setRecordElapsedSec] = useState(0);
  const [micError, setMicError] = useState<string | null>(null);
  const [voiceCloneModalOpen, setVoiceCloneModalOpen] = useState(false);
  const [resynthesizingClonePreview, setResynthesizingClonePreview] = useState(false);
  const [cloneTuneError, setCloneTuneError] = useState<string | null>(null);
  const [analyzingNoise, setAnalyzingNoise] = useState(false);
  const [noiseError, setNoiseError] = useState<string | null>(null);
  const [scanningCopyright, setScanningCopyright] = useState(false);
  const [copyrightError, setCopyrightError] = useState<string | null>(null);
  const [copyrightScan, setCopyrightScan] = useState<AudioCopyrightScanResult | null>(null);
  const [appliedAlternativeTitle, setAppliedAlternativeTitle] = useState<string | null>(null);
  const [inspectorTab, setInspectorTab] = useState<'controls' | 'digital-human'>('controls');
  const activeClonedVoice =
    clonedVoices.find((v) => v.id === audio.activeClonedVoiceId) ?? null;
  const hasAnyDigitalHumanOnTrack = clips.some((c) => Boolean(c.digitalHuman));

  const pairKey = selectedClip && nextClip ? `${selectedClip.id}->${nextClip.id}` : null;
  const selectedClipIndex = selectedClip ? clips.findIndex((c) => c.id === selectedClip.id) : -1;

  // Auto-expand drawer if the selected clip already uses an extended transition
  useEffect(() => {
    if (selectedClip && EXTENDED_TRANSITIONS.includes(selectedClip.transition)) {
      setShowAllTransitions(true);
    }
  }, [selectedClip]);

  // Reset transient error/suggestion when switching to a different clip pair
  useEffect(() => {
    setSuggestion(null);
    setTransitionError(null);
  }, [pairKey]);

  useEffect(() => {
    setColorError(null);
    setSpeechError(null);
    setSpeechResultNote(null);
    setSequenceError(null);
    setSequenceSuggestion(null);
    setSequenceApplied(false);
    setCurrentSeqApplied(false);
  }, [selectedClip?.id]);

  const handleAnalyzeTransition = async () => {
    if (!selectedClip || !nextClip) return;
    setAnalyzingTransition(true);
    setTransitionError(null);

    try {
      const currentEl = mediaCache.get(selectedClip.assetId);
      const nextEl = mediaCache.get(nextClip.assetId);
      const currentFrameBase64 = captureClipSnapshotBase64(currentEl, selectedClip.filter);
      const nextFrameBase64 = captureClipSnapshotBase64(nextEl, nextClip.filter);

      const res = await fetch('/api/suggest-transition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform,
          bpm: audio.bpm,
          currentClip: {
            label: selectedClip.label,
            motion: selectedClip.motion,
            filter: selectedClip.filter,
            duration: selectedClip.duration,
          },
          nextClip: {
            label: nextClip.label,
            motion: nextClip.motion,
            filter: nextClip.filter,
            duration: nextClip.duration,
          },
          currentFrameBase64,
          nextFrameBase64,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'AI 转场分析失败，请稍后重试。');
      }

      const rawType = data?.recommendedTransition as TransitionType;
      const safeType: TransitionType = ALL_TRANSITIONS.includes(rawType)
        ? rawType
        : 'crossfade';

      setSuggestion({
        recommendedTransition: safeType,
        transitionName: data?.transitionName || TRANSITION_DISPLAY_NAMES[safeType],
        reason: data?.reason || '两段画面构图与光影存在变化，建议采用平滑衔接转场。',
        visualBridgeNote: data?.visualBridgeNote || '建议配合节拍点自然切入下一镜头。',
      });
    } catch (err: unknown) {
      setTransitionError(
        err instanceof Error ? err.message : '分析请求失败，请检查网络后重试。'
      );
    } finally {
      setAnalyzingTransition(false);
    }
  };

  const handleApplySuggestedTransition = () => {
    if (!nextClip || !suggestion) return;
    onUpdateClip(nextClip.id, { transition: suggestion.recommendedTransition });
    if (pairKey) setAppliedForPair(pairKey);
    onPreviewTransitionAtCut(nextClip.id);
  };

  const handleAnalyzeTransitionSequence = async () => {
    if (!selectedClip || clips.length === 0) return;
    setAnalyzingSequence(true);
    setSequenceError(null);
    setSequenceApplied(false);
    setCurrentSeqApplied(false);

    try {
      let cursor = 0;
      const timelineClips = clips.map((c, idx) => {
        const startTime = Number(cursor.toFixed(2));
        cursor += c.duration;
        const el = mediaCache.get(c.assetId);
        const frameBase64 = captureClipSnapshotBase64(el, c.filter, c.colorAdjustments);
        return {
          clipId: c.id,
          index: idx,
          label: c.label,
          startTime,
          duration: c.duration,
          motion: c.motion,
          filter: c.filter,
          currentTransition: c.transition,
          hookTag: c.hookTag,
          frameBase64,
        };
      });

      const res = await fetch('/api/suggest-transition-sequence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform,
          bpm: audio.bpm,
          selectedClipIndex: Math.max(0, selectedClipIndex),
          timelineClips,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || '智能转场序列分析失败，请稍后重试。');
      }

      const rawCurrent = data?.currentRecommendedTransition as TransitionType;
      const safeCurrent = ALL_TRANSITIONS.includes(rawCurrent) ? rawCurrent : 'zoom-punch';
      const steps = Array.isArray(data?.steps)
        ? data.steps.map(
            (s: {
              clipId: string;
              clipIndex: number;
              clipLabel: string;
              positionRole: string;
              recommendedTransition: TransitionType;
              transitionName: string;
              retentionReason: string;
            }) => ({
              ...s,
              recommendedTransition: ALL_TRANSITIONS.includes(s.recommendedTransition)
                ? s.recommendedTransition
                : 'crossfade',
            })
          )
        : [];

      setSequenceSuggestion({
        timelineVisualOverview:
          data?.timelineVisualOverview || '已完成全时间线多镜头视觉特征与光影节奏分析。',
        retentionStrategy:
          data?.retentionStrategy || '依据黄金前3秒与中段反差打断原则优化整条转场逻辑。',
        currentPositionSummary:
          data?.currentPositionSummary ||
          `建议当前第 ${selectedClipIndex + 1} 段采用「${TRANSITION_DISPLAY_NAMES[safeCurrent]}」以提升完播留存。`,
        currentRecommendedTransition: safeCurrent,
        steps,
      });
    } catch (err: unknown) {
      setSequenceError(
        err instanceof Error ? err.message : '智能转场序列规划失败，请检查网络后重试。'
      );
    } finally {
      setAnalyzingSequence(false);
    }
  };

  const handleApplyCurrentClipSequenceStep = () => {
    if (!selectedClip || !sequenceSuggestion) return;
    const tr = sequenceSuggestion.currentRecommendedTransition;
    onUpdateClip(selectedClip.id, { transition: tr });
    setCurrentSeqApplied(true);
    if (EXTENDED_TRANSITIONS.includes(tr)) setShowAllTransitions(true);
    onPreviewTransitionAtCut(selectedClip.id);
  };

  const handleApplyFullTransitionSequence = () => {
    if (!sequenceSuggestion || sequenceSuggestion.steps.length === 0) return;
    const updates = sequenceSuggestion.steps.map((s) => ({
      clipId: s.clipId,
      transition: s.recommendedTransition,
    }));
    onApplyTransitionSequence(updates);
    setSequenceApplied(true);
    setCurrentSeqApplied(true);
    if (selectedClip) {
      onPreviewTransitionAtCut(selectedClip.id);
    }
  };

  const handleAiMatchColor = async () => {
    if (!selectedClip) return;
    const el = mediaCache.get(selectedClip.assetId);
    const frameBase64 = captureClipSnapshotBase64(el, 'natural');
    if (!frameBase64) {
      setColorError('当前片段尚未加载完成，请稍候再试。');
      return;
    }

    const refEl = nextClip ? mediaCache.get(nextClip.assetId) : undefined;
    const referenceFrameBase64 = refEl ? captureClipSnapshotBase64(refEl, nextClip?.filter ?? 'natural') : null;

    setMatchingColor(true);
    setColorError(null);

    try {
      const res = await fetch('/api/match-color', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform,
          clipLabel: selectedClip.label,
          currentFilter: selectedClip.filter,
          frameBase64,
          referenceFrameBase64,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'AI 色调匹配失败，请稍后重试。');
      }

      const validFilters: ColorFilter[] = ['natural', 'cinematic', 'vibrant', 'warm-film', 'cool-clean'];
      const matchedFilter = validFilters.includes(data?.recommendedFilter)
        ? (data.recommendedFilter as ColorFilter)
        : selectedClip.filter;

      const clamp = (val: unknown, min: number, max: number, fallback: number) => {
        const n = Number(val);
        return Number.isFinite(n) ? Number(Math.max(min, Math.min(max, n)).toFixed(2)) : fallback;
      };

      const nextAdj: ColorAdjustments = {
        contrast: clamp(data?.contrast, 0.85, 1.35, 1.08),
        saturation: clamp(data?.saturation, 0.78, 1.45, 1.12),
        brightness: clamp(data?.brightness, 0.85, 1.2, 1.02),
        colorTempLabel: data?.colorTempLabel || '智能平衡色温',
        analysisNote: data?.analysisNote || '已依据画面高光与饱和度分布自动校准。',
      };

      onUpdateClip(selectedClip.id, {
        filter: matchedFilter,
        colorAdjustments: nextAdj,
      });
    } catch (err: unknown) {
      setColorError(err instanceof Error ? err.message : 'AI 色调分析失败，请重试。');
    } finally {
      setMatchingColor(false);
    }
  };

  const handleUpdateColorAdj = (patch: Partial<ColorAdjustments>) => {
    if (!selectedClip) return;
    const base: ColorAdjustments = selectedClip.colorAdjustments ?? {
      contrast: 1,
      saturation: 1,
      brightness: 1,
    };
    onUpdateClip(selectedClip.id, {
      colorAdjustments: { ...base, ...patch },
    });
  };

  const handleAnalyzeBgm = async () => {
    if (clips.length === 0) return;
    setAnalyzingBgm(true);
    setBgmError(null);
    setBgmApplied(false);

    try {
      const sampleIndices = Array.from(
        new Set([0, Math.floor(clips.length / 2), clips.length - 1])
      ).slice(0, 3);
      const sampleFramesBase64 = sampleIndices
        .map((idx) => {
          const c = clips[idx];
          const el = mediaCache.get(c.assetId);
          return captureClipSnapshotBase64(el, c.filter, c.colorAdjustments);
        })
        .filter((f): f is string => Boolean(f));

      const totalDuration = clips.reduce((sum, c) => sum + c.duration, 0);

      const res = await fetch('/api/suggest-bgm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform,
          totalDuration,
          currentBpm: audio.bpm,
          clipsSummary: clips.map((c) => ({
            label: c.label,
            duration: c.duration,
            transition: c.transition,
            filter: c.filter,
          })),
          sampleFramesBase64,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'AI 背景乐风格推荐失败，请稍后重试。');
      }

      const validPresets: BgmPreset[] = [
        'upbeat-128',
        'tech-118',
        'fresh-112',
        'suspense-104',
        'lofi-95',
        'narrative-92',
      ];
      const preset: BgmPreset = validPresets.includes(data?.recommendedPreset)
        ? (data.recommendedPreset as BgmPreset)
        : 'upbeat-128';

      const bpmNum = Math.max(80, Math.min(145, Math.round(Number(data?.recommendedBpm) || BGM_PRESET_BPM[preset])));
      const volNum = Math.max(0.35, Math.min(0.9, Number(data?.recommendedVolume) || 0.65));

      setBgmSuggestion({
        recommendedPreset: preset,
        moodLabel: data?.moodLabel || '律动感',
        presetName: data?.presetName || '推荐节拍音效',
        recommendedBpm: bpmNum,
        recommendedVolume: Number(volNum.toFixed(2)),
        reason: data?.reason || '根据当前镜头剪辑节奏与画面光影氛围匹配最佳配乐。',
        soundDesignNote: data?.soundDesignNote || '建议配合节拍点进行转场切换。',
      });
    } catch (err: unknown) {
      setBgmError(err instanceof Error ? err.message : '分析失败，请检查网络后重试。');
    } finally {
      setAnalyzingBgm(false);
    }
  };

  const handleApplyBgmSuggestion = () => {
    if (!bgmSuggestion) return;
    onUpdateAudio({
      bgmPreset: bgmSuggestion.recommendedPreset,
      bpm: bgmSuggestion.recommendedBpm,
      volume: bgmSuggestion.recommendedVolume,
      customAudioUrl: undefined,
      customAudioName: undefined,
    });
    setBgmApplied(true);
  };

  const handleScanAudioCopyright = async () => {
    setScanningCopyright(true);
    setCopyrightError(null);
    setAppliedAlternativeTitle(null);

    try {
      const res = await fetch('/api/audio/copyright-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform,
          bgmPreset: audio.bgmPreset,
          bpm: audio.bpm,
          customAudioName: audio.customAudioName || '',
          sfxCount: sfxEvents.length,
          sfxNames: sfxEvents.map((ev) => ev.name),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'AI 版权风险扫描失败，请稍后重试。');
      }
      setCopyrightScan(data as AudioCopyrightScanResult);
    } catch (err: unknown) {
      setCopyrightError(
        err instanceof Error ? err.message : 'AI 版权风险扫描失败，请检查网络后重试。'
      );
    } finally {
      setScanningCopyright(false);
    }
  };

  const handleApplyCopyrightAlternative = (alt: CopyrightAlternativeTrack) => {
    onUpdateAudio({
      bgmPreset: alt.recommendedPreset,
      bpm: alt.recommendedBpm,
      customAudioUrl: undefined,
      customAudioName: undefined,
    });
    setAppliedAlternativeTitle(alt.title);
  };

  const handleAnalyzeSfx = async () => {
    if (clips.length === 0) return;
    setAnalyzingSfx(true);
    setSfxError(null);
    setSfxAppliedAll(false);

    try {
      let cursor = 0;
      const timelineNodes = clips.map((c, index) => {
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

      const sampleIndices = Array.from(
        new Set([0, Math.floor(clips.length / 2), clips.length - 1])
      ).slice(0, 3);
      const sampleFramesBase64 = sampleIndices
        .map((idx) => {
          const c = clips[idx];
          const el = mediaCache.get(c.assetId);
          return captureClipSnapshotBase64(el, c.filter, c.colorAdjustments);
        })
        .filter((f): f is string => Boolean(f));

      const res = await fetch('/api/suggest-sfx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform,
          bpm: audio.bpm,
          totalDuration: cursor,
          timelineNodes,
          subtitleNodes: subtitles.map((s) => ({
            startTime: s.startTime,
            text: s.text,
            position: s.position,
          })),
          sampleFramesBase64,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'AI 音效库推荐失败，请稍后重试。');
      }

      const events = Array.isArray(data?.events) ? (data.events as SfxEvent[]) : [];
      if (events.length === 0) {
        throw new Error('未能分析出匹配的节点音效，请重试。');
      }

      setSfxSuggestion({
        librarySummary: data?.librarySummary || '已分析时间轴转场与动作节点并匹配微型音效。',
        events,
      });
    } catch (err: unknown) {
      setSfxError(err instanceof Error ? err.message : 'AI 音效分析失败，请检查网络后重试。');
    } finally {
      setAnalyzingSfx(false);
    }
  };

  const handleApplyAllSfx = () => {
    if (!sfxSuggestion || sfxSuggestion.events.length === 0) return;
    onSetSfxEvents(sfxSuggestion.events);
    setSfxAppliedAll(true);
    const first = sfxSuggestion.events[0];
    if (first) {
      onPreviewSfx(first.type, first.volume);
    }
  };

  const handleInsertManualSfx = (item: (typeof SFX_LIBRARY_CATALOG)[number]) => {
    const newEvent: SfxEvent = {
      id: `sfx-manual-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      type: item.type,
      name: item.label,
      time: Number(Math.max(0, currentTime).toFixed(2)),
      duration: item.duration,
      volume: 0.8,
      category: item.defaultCategory,
      reason: `手动插入于 ${currentTime.toFixed(1)}s`,
    };
    onAddSfxEvent(newEvent);
    onPreviewSfx(item.type, 0.8);
  };

  const runTranscribeRequest = async (
    targetClip: TimelineClip,
    clipStart: number,
    overrideAudioUrl?: string
  ) => {
    setTranscribingSpeech(true);
    setSpeechError(null);
    setSpeechResultNote(null);

    try {
      let audioBase64: string | undefined;
      let mimeType = 'audio/wav';

      if (overrideAudioUrl) {
        const extracted = await extractAudioSliceAsWavBase64(
          overrideAudioUrl,
          0,
          targetClip.duration
        );
        if (extracted.hasAudio && extracted.base64) {
          audioBase64 = extracted.base64;
          mimeType = extracted.mimeType || 'audio/wav';
        }
      } else if (selectedAsset?.type === 'video') {
        const extracted = await extractAudioSliceAsWavBase64(
          selectedAsset.url,
          targetClip.trimStart,
          targetClip.duration
        );
        if (extracted.hasAudio && extracted.base64) {
          audioBase64 = extracted.base64;
          mimeType = extracted.mimeType || 'audio/wav';
        }
      }

      if (!audioBase64 && audio.customAudioUrl && !overrideAudioUrl) {
        const extracted = await extractAudioSliceAsWavBase64(
          audio.customAudioUrl,
          clipStart,
          targetClip.duration
        );
        if (extracted.hasAudio && extracted.base64) {
          audioBase64 = extracted.base64;
          mimeType = extracted.mimeType || 'audio/wav';
        }
      }

      const el = mediaCache.get(targetClip.assetId);
      const frameBase64 = !audioBase64
        ? captureClipSnapshotBase64(el, targetClip.filter, targetClip.colorAdjustments)
        : null;

      if (!audioBase64 && !frameBase64) {
        throw new Error('当前片段无可识别的语音音轨或画面帧，请导入含人声的视频或音频文件。');
      }

      const res = await fetch('/api/transcribe-subtitles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform,
          clipLabel: targetClip.label,
          clipDuration: targetClip.duration,
          audioBase64,
          mimeType,
          frameBase64,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'AI 语音识别字幕失败，请稍后重试。');
      }

      if (data?.emptySpeech) {
        setSpeechError('未在音轨中检测到清晰人声，请导入含语音的片段或上传配音文件。');
        return;
      }

      const rawSegs = Array.isArray(data?.segments) ? data.segments : [];
      if (rawSegs.length === 0) {
        setSpeechError('未能切分出有效字幕段，请重试。');
        return;
      }

      const defaultStyle = PLATFORM_META[platform].defaultSubtitleStyle;
      const newSubs: SubtitleSegment[] = rawSegs.map(
        (seg: { offsetStart: number; duration: number; text: string }, idx: number) => ({
          id: `${platform}-asr-${Date.now()}-${idx}`,
          startTime: Number((clipStart + seg.offsetStart).toFixed(2)),
          duration: Number(seg.duration.toFixed(2)),
          text: seg.text,
          style: selectedSubtitle?.style ?? defaultStyle,
          position: selectedSubtitle?.position ?? 'bottom',
        })
      );

      onApplyClipSubtitles(clipStart, targetClip.duration, newSubs);
      setSpeechResultNote(
        data?.sourceMode === 'speech'
          ? `已识别语音并对齐生成 ${newSubs.length} 条字幕：「${String(data.transcript || '').slice(0, 28)}」`
          : `片段无语音轨，已结合画面智能生成 ${newSubs.length} 条对齐旁白字幕`
      );
    } catch (err: unknown) {
      setSpeechError(err instanceof Error ? err.message : '语音识别失败，请稍后重试。');
    } finally {
      setTranscribingSpeech(false);
    }
  };

  useEffect(() => {
    if (subtitles.length > 0 && recordTargetSubId === '__playhead__') {
      setRecordTargetSubId(subtitles[0].id);
    }
  }, [subtitles, recordTargetSubId]);

  useEffect(() => {
    return () => {
      if (recordTimerRef.current !== null) window.clearInterval(recordTimerRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
      recordStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const handleGenerateAiVoiceover = async () => {
    if (subtitles.length === 0) {
      setVoiceoverError('当前时间线暂无字幕文案，请先生成或添加字幕后再合成配音。');
      return;
    }
    setGeneratingVoiceover(true);
    setVoiceoverError(null);
    setVoiceoverNote(null);

    try {
      const res = await fetch('/api/generate-voiceover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform,
          voiceName: activeClonedVoice ? activeClonedVoice.baseVoice : (audio.voiceoverVoice ?? 'Kore'),
          naturalMode: audio.naturalMode ?? 'expressive',
          voicePersonaPrompt: audio.voicePersonaPrompt ?? '',
          clonedVoice: activeClonedVoice
            ? {
                id: activeClonedVoice.id,
                name: activeClonedVoice.name,
                baseVoice: activeClonedVoice.baseVoice,
                voiceDesignPrompt: activeClonedVoice.voiceDesignPrompt,
                playbackRate: activeClonedVoice.playbackRate,
                eqLowGainDb: activeClonedVoice.eqLowGainDb,
                eqMidGainDb: activeClonedVoice.eqMidGainDb ?? 0,
                eqHighGainDb: activeClonedVoice.eqHighGainDb,
                expressiveness: activeClonedVoice.expressiveness ?? 0.75,
              }
            : null,
          cues: subtitles.map((s) => ({
            id: s.id,
            subtitleId: s.id,
            startTime: s.startTime,
            duration: s.duration,
            text: s.text,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'AI 配音合成失败，请稍后重试。');
      }
      const generated = Array.isArray(data?.cues) ? (data.cues as VoiceoverCue[]) : [];
      if (generated.length === 0) {
        throw new Error('未能生成有效的配音片段，请检查字幕内容。');
      }
      onSetVoiceoverCues(generated);
      onUpdateAudio({
        voiceoverEnabled: true,
        bgmAutoDucking: audio.bgmAutoDucking ?? true,
      });
      setVoiceoverNote(
        `已用「${data.voiceName || audio.voiceoverVoice || 'Kore'}」(${data.modelUsed || 'Flash TTS'}) 生成 ${generated.length} 段真人感口播并开启人声闪避。`
      );
      if (generated[0]) {
        onPreviewVoiceoverCue(generated[0]);
      }
    } catch (err: unknown) {
      setVoiceoverError(err instanceof Error ? err.message : 'AI 配音生成失败，请重试。');
    } finally {
      setGeneratingVoiceover(false);
    }
  };

  const handlePackageFullAudio = async () => {
    if (clips.length === 0) return;
    setPackagingFullAudio(true);
    setFullAudioNote(null);
    setBgmError(null);
    setVoiceoverError(null);
    setSfxError(null);

    try {
      let cursor = 0;
      const timelineNodes = clips.map((c, index) => {
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

      const sampleIndices = Array.from(
        new Set([0, Math.floor(clips.length / 2), clips.length - 1])
      ).slice(0, 3);
      const sampleFramesBase64 = sampleIndices
        .map((idx) => {
          const c = clips[idx];
          const el = mediaCache.get(c.assetId);
          return captureClipSnapshotBase64(el, c.filter, c.colorAdjustments);
        })
        .filter((f): f is string => Boolean(f));

      const [bgmResult, voResult, sfxResult] = await Promise.allSettled([
        fetch('/api/suggest-bgm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            platform,
            totalDuration: cursor,
            currentBpm: audio.bpm,
            clipsSummary: clips.map((c) => ({
              label: c.label,
              duration: c.duration,
              transition: c.transition,
              filter: c.filter,
            })),
            sampleFramesBase64,
          }),
        }).then(async (r) => {
          const d = await r.json();
          if (!r.ok) throw new Error(d?.error || 'BGM 推荐失败');
          return d;
        }),
        subtitles.length > 0
          ? fetch('/api/generate-voiceover', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                platform,
                voiceName: activeClonedVoice ? activeClonedVoice.baseVoice : (audio.voiceoverVoice ?? 'Kore'),
                naturalMode: audio.naturalMode ?? 'expressive',
                voicePersonaPrompt: audio.voicePersonaPrompt ?? '',
                clonedVoice: activeClonedVoice
                  ? {
                      id: activeClonedVoice.id,
                      name: activeClonedVoice.name,
                      baseVoice: activeClonedVoice.baseVoice,
                      voiceDesignPrompt: activeClonedVoice.voiceDesignPrompt,
                      playbackRate: activeClonedVoice.playbackRate,
                      eqLowGainDb: activeClonedVoice.eqLowGainDb,
                      eqMidGainDb: activeClonedVoice.eqMidGainDb ?? 0,
                      eqHighGainDb: activeClonedVoice.eqHighGainDb,
                      expressiveness: activeClonedVoice.expressiveness ?? 0.75,
                    }
                  : null,
                cues: subtitles.map((s) => ({
                  id: s.id,
                  subtitleId: s.id,
                  startTime: s.startTime,
                  duration: s.duration,
                  text: s.text,
                })),
              }),
            }).then(async (r) => {
              const d = await r.json();
              if (!r.ok) throw new Error(d?.error || 'AI 配音失败');
              return d;
            })
          : Promise.resolve(null),
        fetch('/api/suggest-sfx', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            platform,
            bpm: audio.bpm,
            totalDuration: cursor,
            timelineNodes,
            subtitleNodes: subtitles.map((s) => ({
              startTime: s.startTime,
              text: s.text,
              position: s.position,
            })),
            sampleFramesBase64,
          }),
        }).then(async (r) => {
          const d = await r.json();
          if (!r.ok) throw new Error(d?.error || 'SFX 推荐失败');
          return d;
        }),
      ]);

      const completedParts: string[] = [];

      if (bgmResult.status === 'fulfilled' && bgmResult.value) {
        const d = bgmResult.value;
        const validPresets: BgmPreset[] = [
          'upbeat-128',
          'tech-118',
          'fresh-112',
          'suspense-104',
          'lofi-95',
          'narrative-92',
        ];
        const preset: BgmPreset = validPresets.includes(d.recommendedPreset)
          ? d.recommendedPreset
          : audio.bgmPreset;
        const bpmNum = Math.max(80, Math.min(145, Math.round(Number(d.recommendedBpm) || BGM_PRESET_BPM[preset])));
        const volNum = Math.max(0.35, Math.min(0.9, Number(d.recommendedVolume) || 0.6));
        onUpdateAudio({
          bgmPreset: preset,
          bpm: bpmNum,
          volume: Number(volNum.toFixed(2)),
          voiceoverEnabled: true,
          bgmAutoDucking: true,
        });
        setBgmSuggestion({
          recommendedPreset: preset,
          moodLabel: d.moodLabel || '推荐情绪',
          presetName: d.presetName || '智能配乐',
          recommendedBpm: bpmNum,
          recommendedVolume: Number(volNum.toFixed(2)),
          reason: d.reason || '已匹配整片画面情绪节奏。',
          soundDesignNote: d.soundDesignNote || '已开启说话时 BGM 自动闪避。',
        });
        setBgmApplied(true);
        completedParts.push(`配乐（${d.moodLabel || preset}）`);
      }

      if (voResult.status === 'fulfilled' && voResult.value && Array.isArray(voResult.value.cues)) {
        const cues = voResult.value.cues as VoiceoverCue[];
        onSetVoiceoverCues(cues);
        completedParts.push(`${cues.length} 段真人感配音`);
      } else if (voResult.status === 'rejected') {
        setVoiceoverError(voResult.reason instanceof Error ? voResult.reason.message : '配音生成失败');
      }

      if (sfxResult.status === 'fulfilled' && sfxResult.value && Array.isArray(sfxResult.value.events)) {
        const events = sfxResult.value.events as SfxEvent[];
        onSetSfxEvents(events);
        setSfxSuggestion({
          librarySummary: sfxResult.value.librarySummary || '已自动匹配转场与动作音效。',
          events,
        });
        setSfxAppliedAll(true);
        completedParts.push(`${events.length} 处节点音效`);
      }

      if (completedParts.length > 0) {
        setFullAudioNote(`整片声音已配齐：${completedParts.join(' + ')} + 人声闪避。点击播放器即可试听成片效果！`);
      }
    } finally {
      setPackagingFullAudio(false);
    }
  };

  const handleToggleMicRecording = async () => {
    setMicError(null);
    if (isRecordingMic) {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
      if (recordTimerRef.current !== null) {
        window.clearInterval(recordTimerRef.current);
        recordTimerRef.current = null;
      }
      setIsRecordingMic(false);
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setMicError('当前浏览器不支持麦克风直录，可使用下方「导入录音文件」按钮。');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordStreamRef.current = stream;

      const mimeCandidate = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((m) =>
        MediaRecorder.isTypeSupported(m)
      );
      const recorder = mimeCandidate
        ? new MediaRecorder(stream, { mimeType: mimeCandidate })
        : new MediaRecorder(stream);

      const chunks: BlobPart[] = [];
      const startedAt = performance.now();
      const targetSub = subtitles.find((s) => s.id === recordTargetSubId);

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        recordStreamRef.current = null;
        const elapsedSec = Math.max(0.5, Number(((performance.now() - startedAt) / 1000).toFixed(2)));
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        if (blob.size < 200) {
          setMicError('录音时间过短或未采集到声音，请再试一次。');
          return;
        }
        try {
          const b64 = await blobToBase64(blob);
          const cue: VoiceoverCue = {
            id: `mic-${Date.now()}`,
            subtitleId: targetSub?.id,
            startTime: targetSub ? targetSub.startTime : Number(currentTime.toFixed(2)),
            duration: targetSub ? Math.max(targetSub.duration, elapsedSec) : elapsedSec,
            text: targetSub ? targetSub.text : `真人原声录音 (${elapsedSec.toFixed(1)}s)`,
            audioBase64: b64,
            mimeType: blob.type || 'audio/webm',
            voiceName: audio.voiceoverVoice ?? 'Kore',
            source: 'mic-record',
          };
          onUpsertVoiceoverCue(cue);
          onUpdateAudio({
            voiceoverEnabled: true,
            bgmAutoDucking: audio.bgmAutoDucking ?? true,
          });
          onPreviewVoiceoverCue(cue);
        } catch {
          setMicError('录音编码保存失败，请重试。');
        }
      };

      mediaRecorderRef.current = recorder;
      setRecordElapsedSec(0);
      setIsRecordingMic(true);
      recorder.start(120);
      recordTimerRef.current = window.setInterval(() => {
        setRecordElapsedSec((performance.now() - startedAt) / 1000);
      }, 100);
    } catch {
      setMicError('未能获取麦克风权限，请在浏览器地址栏允许访问麦克风后重试。');
    }
  };

  const handleUploadVoiceFile = async (file: File) => {
    setMicError(null);
    try {
      const b64 = await blobToBase64(file);
      const targetSub = subtitles.find((s) => s.id === recordTargetSubId);
      const cue: VoiceoverCue = {
        id: `upload-vo-${Date.now()}`,
        subtitleId: targetSub?.id,
        startTime: targetSub ? targetSub.startTime : Number(currentTime.toFixed(2)),
        duration: targetSub ? targetSub.duration : 3.0,
        text: targetSub ? targetSub.text : file.name.replace(/\.[^.]+$/, ''),
        audioBase64: b64,
        mimeType: file.type || 'audio/wav',
        voiceName: audio.voiceoverVoice ?? 'Kore',
        source: 'upload',
      };
      onUpsertVoiceoverCue(cue);
      onUpdateAudio({ voiceoverEnabled: true, bgmAutoDucking: audio.bgmAutoDucking ?? true });
      onPreviewVoiceoverCue(cue);
    } catch {
      setMicError('导入本地语音失败，请确认文件格式有效。');
    }
  };

  const getAuditionSampleCue = (): VoiceoverCue | null => {
    const personalCue = voiceoverCues.find(
      (c) => (c.source === 'mic-record' || c.source === 'upload') && Boolean(c.audioBase64)
    );
    if (personalCue) return personalCue;
    const firstCue = voiceoverCues.find((c) => Boolean(c.audioBase64));
    if (firstCue) return firstCue;
    if (activeClonedVoice?.samplePreviewBase64) {
      return {
        id: `denoise-audition-${activeClonedVoice.id}`,
        startTime: 0,
        duration: 4.5,
        text: activeClonedVoice.name,
        audioBase64: activeClonedVoice.samplePreviewBase64,
        mimeType: activeClonedVoice.samplePreviewMimeType || 'audio/wav',
        voiceName: activeClonedVoice.baseVoice,
        clonedVoiceId: activeClonedVoice.id,
        playbackRate: activeClonedVoice.playbackRate ?? 1,
        eqLowGainDb: activeClonedVoice.eqLowGainDb ?? 0,
        eqMidGainDb: activeClonedVoice.eqMidGainDb ?? 0,
        eqHighGainDb: activeClonedVoice.eqHighGainDb ?? 0,
      };
    }
    return null;
  };

  const handleAnalyzeAndDenoiseVoiceover = async () => {
    const sampleCue = getAuditionSampleCue();
    if (!sampleCue) {
      setNoiseError('当前配音轨暂无可分析的音频片段，请先生成 AI 配音、录制原声或选中克隆音色。');
      return;
    }

    setAnalyzingNoise(true);
    setNoiseError(null);
    try {
      const metrics = await analyzeVoiceoverCuesAcousticMetrics([sampleCue]);
      const sourceLabel =
        sampleCue.source === 'mic-record'
          ? '麦克风录制原声'
          : sampleCue.source === 'upload'
            ? '导入人声音频'
            : activeClonedVoice
              ? `克隆音色「${activeClonedVoice.name}」`
              : 'AI 口播配音轨';

      const res = await fetch('/api/voiceover/analyze-noise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioBase64: sampleCue.audioBase64,
          mimeType: sampleCue.mimeType || 'audio/wav',
          metrics: { ...metrics, sourceLabel },
          hasClonedVoice: Boolean(activeClonedVoice),
          clonedVoiceName: activeClonedVoice?.name || '',
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'AI 环境音分析失败，请稍后重试。');
      }
      const profile = data?.profile as VoiceDenoiseProfile | undefined;
      if (!profile) {
        throw new Error('未返回有效降噪参数，请重试。');
      }

      onUpdateAudio({
        voiceDenoiseEnabled: true,
        voiceDenoiseStrength: profile.recommendedStrength ?? 0.72,
        voiceDenoiseProfile: profile,
      });

      window.setTimeout(() => {
        onPreviewVoiceoverCue(sampleCue);
      }, 60);
    } catch (err: unknown) {
      setNoiseError(err instanceof Error ? err.message : 'AI 环境音分析失败，请重试。');
    } finally {
      setAnalyzingNoise(false);
    }
  };

  return (
    <aside className="w-[318px] shrink-0 border-l border-zinc-800/90 bg-[#11141B] flex flex-col min-h-0">
      {/* Top Tab Switcher */}
      <div className="px-2.5 pt-2.5 pb-2 border-b border-zinc-800/90 space-y-2">
        <div
          role="tablist"
          aria-label="属性面板切换"
          className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-[#0B0D10] border border-zinc-800/90"
        >
          <button
            type="button"
            role="tab"
            aria-selected={inspectorTab === 'controls'}
            onClick={() => setInspectorTab('controls')}
            className={`py-1.5 px-2 rounded-md text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap ${
              inspectorTab === 'controls'
                ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Sliders className="w-3 h-3 shrink-0" />
            <span>剪辑与音频</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={inspectorTab === 'digital-human'}
            onClick={() => setInspectorTab('digital-human')}
            className={`py-1.5 px-2 rounded-md text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap ${
              inspectorTab === 'digital-human'
                ? 'bg-violet-600 text-white shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <UserCheck className="w-3 h-3 shrink-0" />
            <span>数字人克隆与驱动</span>
            {hasAnyDigitalHumanOnTrack && inspectorTab !== 'digital-human' && (
              <span className="w-1.5 h-1.5 rounded-full bg-violet-400 shrink-0" />
            )}
          </button>
        </div>

        {inspectorTab === 'controls' && (
          <div className="px-1.5 flex items-center justify-between">
            <h2 className="text-xs font-semibold text-zinc-300">
              {selectedSubtitle ? '字幕参数调节' : selectedClip ? '片段剪辑参数' : '音频与节奏参数'}
            </h2>
            {selectedSubtitle ? (
              <button
                type="button"
                onClick={onAddSubtitle}
                className="text-[11px] font-medium text-rose-400 hover:text-rose-300 flex items-center gap-1"
              >
                <Plus className="w-3 h-3" />
                <span>新增字幕</span>
              </button>
            ) : null}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {inspectorTab === 'digital-human' ? (
          <DigitalHumanTab
            selectedClip={selectedClip}
            selectedClipStartTime={selectedClipStartTime}
            clips={clips}
            subtitles={subtitles}
            assets={assets}
            clonedVoices={clonedVoices}
            digitalHumans={digitalHumans}
            platform={platform}
            activeVoiceoverVoice={audio.voiceoverVoice ?? 'Kore'}
            onSaveDigitalHuman={onSaveDigitalHuman}
            onDeleteDigitalHuman={onDeleteDigitalHuman}
            onUploadMediaAssetForAnchor={onUploadMediaAssetForAnchor}
            onEmbedDigitalHumanPip={onEmbedDigitalHumanPip}
            onRemoveClipDigitalHuman={onRemoveClipDigitalHuman}
            onUpdateClipDigitalHumanAction={onUpdateClipDigitalHumanAction}
            onUpdateClipDigitalHumanEmotion={onUpdateClipDigitalHumanEmotion}
            onInsertDigitalHumanClip={onInsertDigitalHumanClip}
          />
        ) : (
          <>
        {selectedClip && !selectedSubtitle ? (
          <div className="space-y-4">
            {selectedClip.digitalHuman && (
              <div className="rounded-lg border border-violet-500/40 bg-violet-950/25 px-3 py-2 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold text-violet-200 truncate">
                    {selectedClip.digitalHuman.mode === 'full-scene'
                      ? `数字人主播镜头 · ${selectedClip.digitalHuman.profileName}`
                      : `已嵌入画中画数字人 · ${selectedClip.digitalHuman.profileName}`}
                  </div>
                  <div className="text-[10px] text-cyan-300 truncate mt-0.5">
                    姿态：{getDigitalHumanActionTemplate(selectedClip.digitalHuman.action).label}
                    {selectedClip.digitalHuman.emotionMatchEnabled !== false &&
                    selectedClip.digitalHuman.emotion
                      ? ` · 情感：${getDigitalHumanEmotionPreset(selectedClip.digitalHuman.emotion).label}`
                      : ''}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setInspectorTab('digital-human')}
                  className="text-[10px] font-medium text-violet-300 hover:text-white shrink-0"
                >
                  调节参数 →
                </button>
              </div>
            )}
            <div>
              <label htmlFor="clip-label" className="block text-[11px] text-zinc-400 mb-1">
                片段名称
              </label>
              <input
                id="clip-label"
                type="text"
                value={selectedClip.label}
                onChange={(e) => onUpdateClip(selectedClip.id, { label: e.target.value })}
                className="w-full rounded-lg bg-[#0B0D10] border border-zinc-800 px-3 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-rose-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="clip-duration" className="block text-[11px] text-zinc-400 mb-1">
                  片段时长 (秒)
                </label>
                <input
                  id="clip-duration"
                  type="number"
                  step={0.1}
                  min={0.8}
                  max={12}
                  value={selectedClip.duration}
                  onChange={(e) =>
                    onUpdateClip(selectedClip.id, {
                      duration: Math.max(0.8, Math.min(12, Number(e.target.value) || 2)),
                    })
                  }
                  className="w-full rounded-lg bg-[#0B0D10] border border-zinc-800 px-2.5 py-1.5 text-xs text-zinc-100 font-mono-nums focus:outline-none focus:border-rose-500"
                />
              </div>

              <div>
                <label htmlFor="clip-trim" className="block text-[11px] text-zinc-400 mb-1">
                  入点偏移 (秒)
                </label>
                <input
                  id="clip-trim"
                  type="number"
                  step={0.1}
                  min={0}
                  max={selectedAsset ? Math.max(0, selectedAsset.duration - 0.5) : 30}
                  disabled={selectedAsset?.type !== 'video'}
                  value={selectedClip.trimStart}
                  onChange={(e) =>
                    onUpdateClip(selectedClip.id, {
                      trimStart: Math.max(0, Number(e.target.value) || 0),
                    })
                  }
                  className="w-full rounded-lg bg-[#0B0D10] border border-zinc-800 px-2.5 py-1.5 text-xs text-zinc-100 font-mono-nums disabled:opacity-40 focus:outline-none focus:border-rose-500"
                />
              </div>
            </div>

            <div>
              <label htmlFor="clip-motion" className="block text-[11px] text-zinc-400 mb-1">
                动态运镜 (Ken Burns)
              </label>
              <select
                id="clip-motion"
                value={selectedClip.motion}
                onChange={(e) =>
                  onUpdateClip(selectedClip.id, { motion: e.target.value as MotionType })
                }
                className="w-full rounded-lg bg-[#0B0D10] border border-zinc-800 px-3 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-rose-500"
              >
                <option value="ken-burns-in">缓慢推进 (Zoom In)</option>
                <option value="ken-burns-out">缓慢拉远 (Zoom Out)</option>
                <option value="pan-left">横向左移 (Pan Left)</option>
                <option value="pan-right">横向右移 (Pan Right)</option>
                <option value="static">静止锁定 (Static)</option>
              </select>
            </div>

            <div className="rounded-lg border border-zinc-800/90 bg-[#0B0D10] p-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <span className="block text-xs font-medium text-zinc-200">
                  动态平滑（光流补帧）
                </span>
                <span className="mt-0.5 block text-[11px] text-zinc-500 leading-snug">
                  {selectedAsset?.type === 'video'
                    ? '对低帧率视频开启帧间混合插值，消除抽帧顿挫感'
                    : '启用亚像素运动平滑插值，提升运镜顺滑度'}
                </span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={Boolean(selectedClip.motionSmoothing)}
                aria-label="动态平滑（光流补帧）"
                onClick={() =>
                  onUpdateClip(selectedClip.id, {
                    motionSmoothing: !selectedClip.motionSmoothing,
                  })
                }
                className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 ${
                  selectedClip.motionSmoothing
                    ? 'bg-rose-600 border-rose-500'
                    : 'bg-zinc-800 border-zinc-700'
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                    selectedClip.motionSmoothing ? 'translate-x-4' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] text-zinc-400">入场转场效果（实时动态预览）</span>
                <span className="text-[11px] text-zinc-300 font-medium">
                  {TRANSITION_DISPLAY_NAMES[selectedClip.transition]}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="入场转场效果">
                {PRESET_TRANSITIONS.map((tr) => {
                  const isActive = selectedClip.transition === tr;
                  return (
                    <button
                      key={tr}
                      type="button"
                      role="radio"
                      aria-checked={isActive}
                      onClick={() => onUpdateClip(selectedClip.id, { transition: tr })}
                      className={`p-1.5 rounded-lg border text-center transition-colors flex flex-col items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 ${
                        isActive
                          ? 'border-rose-500 bg-rose-500/12 text-rose-100'
                          : 'border-zinc-800 bg-[#0B0D10] text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                      }`}
                    >
                      <TransitionMiniPreview
                        type={tr}
                        active={isActive}
                        motionBlurPx={
                          isActive && selectedClip.transitionMotionBlur
                            ? selectedClip.transitionBlurIntensity ?? 8
                            : 0
                        }
                      />
                      <span className="text-[10px] font-medium whitespace-nowrap">
                        {TRANSITION_DISPLAY_NAMES[tr]}
                      </span>
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                aria-expanded={showAllTransitions}
                onClick={() => setShowAllTransitions((prev) => !prev)}
                className="mt-2 w-full py-1.5 px-2.5 rounded-lg border border-zinc-800/90 bg-[#0B0D10] hover:bg-zinc-900/70 text-[11px] font-medium text-zinc-300 flex items-center justify-between transition-colors"
              >
                <span>{showAllTransitions ? '收起扩展转场' : '展开全部转场（模糊 / 推拉 / 翻页等）'}</span>
                {showAllTransitions ? (
                  <ChevronUp className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                )}
              </button>

              {showAllTransitions && (
                <div
                  className="mt-2 grid grid-cols-3 gap-1.5 pt-2 border-t border-zinc-800/70"
                  role="radiogroup"
                  aria-label="更多扩展转场效果"
                >
                  {EXTENDED_TRANSITIONS.map((tr) => {
                    const isActive = selectedClip.transition === tr;
                    return (
                      <button
                        key={tr}
                        type="button"
                        role="radio"
                        aria-checked={isActive}
                        onClick={() => onUpdateClip(selectedClip.id, { transition: tr })}
                        className={`p-1.5 rounded-lg border text-center transition-colors flex flex-col items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 ${
                          isActive
                            ? 'border-rose-500 bg-rose-500/12 text-rose-100'
                            : 'border-zinc-800 bg-[#0B0D10] text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                        }`}
                      >
                        <TransitionMiniPreview
                          type={tr}
                          active={isActive}
                          motionBlurPx={
                            isActive && selectedClip.transitionMotionBlur
                              ? selectedClip.transitionBlurIntensity ?? 8
                              : 0
                          }
                        />
                        <span className="text-[10px] font-medium whitespace-nowrap">
                          {TRANSITION_DISPLAY_NAMES[tr]}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Transition Motion Blur (CSS filter) */}
              <div className="mt-2.5 rounded-lg border border-zinc-800/90 bg-[#0B0D10] p-3 space-y-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <span className="block text-xs font-medium text-zinc-200">
                      添加动态模糊（转场平滑）
                    </span>
                    <span className="mt-0.5 block text-[11px] text-zinc-500 leading-snug">
                      在转场窗口叠加 CSS 动态模糊滤镜，柔化高速切换时的视觉冲击
                    </span>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={Boolean(selectedClip.transitionMotionBlur)}
                    aria-label="添加动态模糊"
                    onClick={() =>
                      onUpdateClip(selectedClip.id, {
                        transitionMotionBlur: !selectedClip.transitionMotionBlur,
                        transitionBlurIntensity: selectedClip.transitionBlurIntensity ?? 8,
                      })
                    }
                    className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 ${
                      selectedClip.transitionMotionBlur
                        ? 'bg-rose-600 border-rose-500'
                        : 'bg-zinc-800 border-zinc-700'
                    }`}
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                        selectedClip.transitionMotionBlur ? 'translate-x-4' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>

                {selectedClip.transitionMotionBlur && (
                  <div className="pt-2 border-t border-zinc-800/70 space-y-2">
                    <div className="flex items-center justify-between text-[11px]">
                      <label htmlFor="tr-motion-blur-intensity" className="text-zinc-400">
                        运动模糊强度 (CSS filter)
                      </label>
                      <span className="font-mono-nums text-rose-300">
                        {selectedClip.transitionBlurIntensity ?? 8}px
                      </span>
                    </div>

                    <input
                      id="tr-motion-blur-intensity"
                      type="range"
                      min={2}
                      max={24}
                      step={1}
                      value={selectedClip.transitionBlurIntensity ?? 8}
                      onChange={(e) =>
                        onUpdateClip(selectedClip.id, {
                          transitionBlurIntensity: Number(e.target.value),
                        })
                      }
                      className="w-full accent-rose-500"
                    />

                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-mono-nums text-zinc-500">
                        {selectedClip.transition === 'cut'
                          ? '提示：硬切无转场窗口，请先选择非硬切转场'
                          : `filter: blur(${selectedClip.transitionBlurIntensity ?? 8}px)`}
                      </span>
                      <button
                        type="button"
                        disabled={selectedClip.transition === 'cut'}
                        onClick={() => onPreviewTransitionAtCut(selectedClip.id)}
                        className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-[10px] font-medium text-zinc-200 flex items-center gap-1 transition-colors shrink-0"
                      >
                        <Play className="w-2.5 h-2.5" />
                        <span>预览转场模糊</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Intelligent Full-Timeline Transition Sequence Advisor */}
              <div className="mt-3 rounded-lg border border-zinc-800/90 bg-[#0B0D10] p-3 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold text-zinc-200 flex items-center gap-1.5">
                    <GitCommitHorizontal className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span>智能转场序列建议</span>
                  </span>
                  <span className="text-[10px] font-mono-nums text-zinc-500">
                    第 {Math.max(1, selectedClipIndex + 1)}/{clips.length} 段
                  </span>
                </div>

                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  分析整条时间线所有素材的景别、色温与明暗节奏，为当前位置制定提升完播与观众粘性的转场序列方案。
                </p>

                <button
                  type="button"
                  disabled={analyzingSequence || clips.length === 0}
                  onClick={handleAnalyzeTransitionSequence}
                  className="w-full py-2 px-3 rounded-lg border border-zinc-700/90 bg-[#11141B] hover:border-amber-500/70 hover:bg-zinc-900 disabled:opacity-50 text-xs font-medium text-zinc-100 flex items-center justify-center gap-2 transition-colors"
                >
                  {analyzingSequence ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
                      <span>正在分析全局素材视觉特征...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                      <span>生成全局转场逻辑方案</span>
                    </>
                  )}
                </button>

                {sequenceError && (
                  <div className="rounded-md border border-red-500/40 bg-red-950/30 p-2 text-[11px] text-red-200 leading-relaxed">
                    {sequenceError}
                  </div>
                )}

                {sequenceSuggestion && (
                  <div className="space-y-2.5 pt-1 border-t border-zinc-800/80">
                    <div className="space-y-1">
                      <p className="text-[11px] text-zinc-300 leading-relaxed">
                        <span className="text-amber-300 font-semibold">全局视觉特征：</span>
                        {sequenceSuggestion.timelineVisualOverview}
                      </p>
                      <p className="text-[11px] text-zinc-400 leading-relaxed">
                        <span className="text-zinc-200 font-medium">粘性策略：</span>
                        {sequenceSuggestion.retentionStrategy}
                      </p>
                    </div>

                    {/* Highlighted recommendation for the current selected clip position */}
                    <div className="rounded-md border border-amber-500/40 bg-amber-500/8 p-2.5 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-semibold text-amber-200">
                          当前片段位推荐：{TRANSITION_DISPLAY_NAMES[sequenceSuggestion.currentRecommendedTransition]}
                        </span>
                        <TransitionMiniPreview
                          type={sequenceSuggestion.currentRecommendedTransition}
                          active
                        />
                      </div>
                      <p className="text-[11px] text-zinc-300 leading-relaxed">
                        {sequenceSuggestion.currentPositionSummary}
                      </p>
                      <button
                        type="button"
                        onClick={handleApplyCurrentClipSequenceStep}
                        className={`w-full py-1.5 px-2.5 rounded text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                          currentSeqApplied &&
                          selectedClip.transition === sequenceSuggestion.currentRecommendedTransition
                            ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                            : 'bg-amber-600 hover:bg-amber-500 text-white'
                        }`}
                      >
                        {currentSeqApplied &&
                        selectedClip.transition === sequenceSuggestion.currentRecommendedTransition ? (
                          <>
                            <Check className="w-3 h-3" />
                            <span>已应用到第 {Math.max(1, selectedClipIndex + 1)} 段并预览</span>
                          </>
                        ) : (
                          <>
                            <Play className="w-3 h-3" />
                            <span>应用推荐转场到当前片段</span>
                          </>
                        )}
                      </button>
                    </div>

                    {/* Full sequence breakdown */}
                    <div className="space-y-1 max-h-40 overflow-y-auto pr-0.5">
                      {sequenceSuggestion.steps.map((step) => {
                        const isCurrent = step.clipId === selectedClip.id;
                        return (
                          <div
                            key={step.clipId}
                            className={`rounded border px-2 py-1.5 space-y-0.5 ${
                              isCurrent
                                ? 'border-amber-500/50 bg-[#171B24]'
                                : 'border-zinc-800/80 bg-[#11141B]'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-1.5 text-[10px]">
                              <span className="font-medium text-zinc-200 truncate">
                                {step.clipIndex + 1}. {step.positionRole}
                                {isCurrent ? '（当前）' : ''}
                              </span>
                              <span className="font-semibold text-amber-300 shrink-0">
                                {TRANSITION_DISPLAY_NAMES[step.recommendedTransition] ||
                                  step.transitionName}
                              </span>
                            </div>
                            <p className="text-[10px] text-zinc-500 leading-snug">
                              {step.retentionReason}
                            </p>
                          </div>
                        );
                      })}
                    </div>

                    <button
                      type="button"
                      onClick={handleApplyFullTransitionSequence}
                      className={`w-full py-2 px-3 rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                        sequenceApplied
                          ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                          : 'bg-rose-600 hover:bg-rose-500 text-white'
                      }`}
                    >
                      {sequenceApplied ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>已一键应用整条时间线转场序列</span>
                        </>
                      ) : (
                        <>
                          <GitCommitHorizontal className="w-3.5 h-3.5" />
                          <span>一键应用整条转场序列方案</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <label htmlFor="clip-filter" className="text-[11px] text-zinc-400">
                  画面调色与视觉调节
                </label>
                {selectedClip.colorAdjustments && (
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateClip(selectedClip.id, {
                        filter: 'natural',
                        colorAdjustments: undefined,
                      })
                    }
                    className="text-[11px] text-zinc-400 hover:text-zinc-200 flex items-center gap-1 transition-colors"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>还原默认</span>
                  </button>
                )}
              </div>

              <select
                id="clip-filter"
                value={selectedClip.filter}
                onChange={(e) =>
                  onUpdateClip(selectedClip.id, { filter: e.target.value as ColorFilter })
                }
                className="w-full rounded-lg bg-[#0B0D10] border border-zinc-800 px-3 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-rose-500"
              >
                <option value="natural">原色质感 (Natural)</option>
                <option value="cinematic">电影青橙调 (Cinematic)</option>
                <option value="vibrant">高饱和通透 (Vibrant)</option>
                <option value="warm-film">暖调胶片 (Warm Film)</option>
                <option value="cool-clean">冷调极简 (Cool Clean)</option>
              </select>

              <button
                type="button"
                disabled={matchingColor}
                onClick={handleAiMatchColor}
                className="w-full py-2 px-3 rounded-lg border border-zinc-700/90 bg-[#0B0D10] hover:border-rose-500/70 hover:bg-zinc-900/70 disabled:opacity-50 text-xs font-medium text-zinc-100 flex items-center justify-center gap-2 transition-colors"
              >
                {matchingColor ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-rose-400" />
                    <span>正在分析色温与饱和度...</span>
                  </>
                ) : (
                  <>
                    <Palette className="w-3.5 h-3.5 text-rose-400" />
                    <span>AI 智能色调匹配</span>
                  </>
                )}
              </button>

              {colorError && (
                <div className="rounded-lg border border-red-500/40 bg-red-950/30 p-2.5 text-[11px] text-red-200 leading-relaxed">
                  {colorError}
                </div>
              )}

              {(selectedClip.colorAdjustments || selectedClip.filter !== 'natural') && (() => {
                const el = mediaCache.get(selectedClip.assetId);
                const beforeThumb = renderColorComparisonThumbnail(el, 'natural');
                const afterThumb = renderColorComparisonThumbnail(
                  el,
                  selectedClip.filter,
                  selectedClip.colorAdjustments
                );
                const adj = selectedClip.colorAdjustments ?? {
                  contrast: 1,
                  saturation: 1,
                  brightness: 1,
                };

                return (
                  <div className="rounded-lg border border-zinc-800 bg-[#0B0D10] p-3 space-y-3">
                    {adj.colorTempLabel && (
                      <div className="space-y-1">
                        <span className="block text-[11px] font-semibold text-rose-300">
                          {adj.colorTempLabel}
                        </span>
                        {adj.analysisNote && (
                          <p className="text-[11px] text-zinc-400 leading-relaxed">
                            {adj.analysisNote}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Before / After Comparison Preview */}
                    {beforeThumb && afterThumb && (
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <div className="aspect-[3/4] rounded overflow-hidden border border-zinc-800 bg-black">
                            <img
                              src={beforeThumb}
                              alt="调色前原片预览"
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <span className="block text-center text-[10px] text-zinc-500">
                            原片
                          </span>
                        </div>
                        <div className="space-y-1">
                          <div className="aspect-[3/4] rounded overflow-hidden border border-rose-500/50 bg-black">
                            <img
                              src={afterThumb}
                              alt="AI 色调匹配后预览"
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <span className="block text-center text-[10px] text-rose-300 font-medium">
                            匹配后
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Fine-tune Contrast / Saturation / Brightness */}
                    <div className="space-y-2 pt-1 border-t border-zinc-800/70">
                      <div>
                        <div className="flex items-center justify-between text-[11px] text-zinc-400 mb-0.5">
                          <label htmlFor="adj-contrast">对比度</label>
                          <span className="font-mono-nums">{adj.contrast.toFixed(2)}x</span>
                        </div>
                        <input
                          id="adj-contrast"
                          type="range"
                          min={0.75}
                          max={1.45}
                          step={0.02}
                          value={adj.contrast}
                          onChange={(e) =>
                            handleUpdateColorAdj({ contrast: Number(e.target.value) })
                          }
                          className="w-full accent-rose-500"
                        />
                      </div>

                      <div>
                        <div className="flex items-center justify-between text-[11px] text-zinc-400 mb-0.5">
                          <label htmlFor="adj-saturation">饱和度</label>
                          <span className="font-mono-nums">{adj.saturation.toFixed(2)}x</span>
                        </div>
                        <input
                          id="adj-saturation"
                          type="range"
                          min={0.6}
                          max={1.6}
                          step={0.02}
                          value={adj.saturation}
                          onChange={(e) =>
                            handleUpdateColorAdj({ saturation: Number(e.target.value) })
                          }
                          className="w-full accent-rose-500"
                        />
                      </div>

                      <div>
                        <div className="flex items-center justify-between text-[11px] text-zinc-400 mb-0.5">
                          <label htmlFor="adj-brightness">亮度</label>
                          <span className="font-mono-nums">{adj.brightness.toFixed(2)}x</span>
                        </div>
                        <input
                          id="adj-brightness"
                          type="range"
                          min={0.75}
                          max={1.3}
                          step={0.02}
                          value={adj.brightness}
                          onChange={(e) =>
                            handleUpdateColorAdj({ brightness: Number(e.target.value) })
                          }
                          className="w-full accent-rose-500"
                        />
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>

            <div className="pt-1 flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => onMoveClip(selectedClip.id, -1)}
                className="flex-1 py-1.5 px-2 rounded-md bg-zinc-800/80 hover:bg-zinc-700 text-xs text-zinc-200 flex items-center justify-center gap-1"
                title="向左前移"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>前移</span>
              </button>
              <button
                type="button"
                onClick={() => onMoveClip(selectedClip.id, 1)}
                className="flex-1 py-1.5 px-2 rounded-md bg-zinc-800/80 hover:bg-zinc-700 text-xs text-zinc-200 flex items-center justify-center gap-1"
                title="向右后移"
              >
                <span>后移</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onDuplicateClip(selectedClip.id)}
                className="p-1.5 rounded-md bg-zinc-800/80 hover:bg-zinc-700 text-zinc-200"
                title="复制片段"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onDeleteClip(selectedClip.id)}
                className="p-1.5 rounded-md bg-zinc-800/80 hover:bg-red-600/80 text-zinc-300 hover:text-white"
                title="删除片段"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* AI Smart Transition Advisor */}
            <div className="border-t border-zinc-800/80 pt-4 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-rose-400" />
                  <span>AI 智能转场建议</span>
                </span>
                {nextClip && (
                  <span className="text-[11px] text-zinc-500 truncate max-w-[130px]">
                    下一段：{nextClip.label}
                  </span>
                )}
              </div>

              {!nextClip ? (
                <p className="text-[11px] text-zinc-500 leading-relaxed">
                  当前为时间线末尾片段，插入或选择后续片段即可分析衔接转场。
                </p>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={analyzingTransition}
                    onClick={handleAnalyzeTransition}
                    className="w-full py-2 px-3 rounded-lg border border-zinc-700/90 bg-[#0B0D10] hover:border-rose-500/70 hover:bg-zinc-900/70 disabled:opacity-50 text-xs font-medium text-zinc-100 flex items-center justify-center gap-2 transition-colors"
                  >
                    {analyzingTransition ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-rose-400" />
                        <span>正在分析上下镜头画面...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5 text-rose-400" />
                        <span>分析画面并推荐转场</span>
                      </>
                    )}
                  </button>

                  {transitionError && (
                    <div className="rounded-lg border border-red-500/40 bg-red-950/30 p-2.5 text-[11px] text-red-200 leading-relaxed">
                      {transitionError}
                    </div>
                  )}

                  {suggestion && (
                    <div className="rounded-lg border border-zinc-800 bg-[#0B0D10] p-3 space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-rose-300">
                          推荐：{suggestion.transitionName}
                        </span>
                        <span className="text-[11px] text-zinc-500 font-mono-nums">
                          {TRANSITION_DISPLAY_NAMES[suggestion.recommendedTransition]}
                        </span>
                      </div>

                      <p className="text-[11px] text-zinc-300 leading-relaxed">
                        {suggestion.reason}
                      </p>

                      <p className="text-[11px] text-zinc-500 leading-relaxed">
                        {suggestion.visualBridgeNote}
                      </p>

                      <button
                        type="button"
                        onClick={handleApplySuggestedTransition}
                        className={`w-full py-2 px-3 rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                          appliedForPair === pairKey &&
                          nextClip.transition === suggestion.recommendedTransition
                            ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                            : 'bg-rose-600 hover:bg-rose-500 text-white'
                        }`}
                      >
                        {appliedForPair === pairKey &&
                        nextClip.transition === suggestion.recommendedTransition ? (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            <span>已应用并预览转场</span>
                          </>
                        ) : (
                          <>
                            <Play className="w-3.5 h-3.5" />
                            <span>一键应用到衔接处</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        ) : null}

        {selectedSubtitle ? (
          <div className="space-y-4">
            <div>
              <label htmlFor="sub-text" className="block text-[11px] text-zinc-400 mb-1">
                字幕文案内容
              </label>
              <textarea
                id="sub-text"
                rows={3}
                value={selectedSubtitle.text}
                onChange={(e) => onUpdateSubtitle(selectedSubtitle.id, { text: e.target.value })}
                className="w-full rounded-lg bg-[#0B0D10] border border-zinc-800 px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-rose-500 resize-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="sub-start" className="block text-[11px] text-zinc-400 mb-1">
                  出现时间 (秒)
                </label>
                <input
                  id="sub-start"
                  type="number"
                  step={0.1}
                  min={0}
                  value={selectedSubtitle.startTime}
                  onChange={(e) =>
                    onUpdateSubtitle(selectedSubtitle.id, {
                      startTime: Math.max(0, Number(e.target.value) || 0),
                    })
                  }
                  className="w-full rounded-lg bg-[#0B0D10] border border-zinc-800 px-2.5 py-1.5 text-xs text-zinc-100 font-mono-nums focus:outline-none focus:border-rose-500"
                />
              </div>
              <div>
                <label htmlFor="sub-dur" className="block text-[11px] text-zinc-400 mb-1">
                  持续时长 (秒)
                </label>
                <input
                  id="sub-dur"
                  type="number"
                  step={0.1}
                  min={0.5}
                  max={10}
                  value={selectedSubtitle.duration}
                  onChange={(e) =>
                    onUpdateSubtitle(selectedSubtitle.id, {
                      duration: Math.max(0.5, Number(e.target.value) || 1.5),
                    })
                  }
                  className="w-full rounded-lg bg-[#0B0D10] border border-zinc-800 px-2.5 py-1.5 text-xs text-zinc-100 font-mono-nums focus:outline-none focus:border-rose-500"
                />
              </div>
            </div>

            <div>
              <label htmlFor="sub-style" className="block text-[11px] text-zinc-400 mb-1">
                平台动效字幕样式
              </label>
              <select
                id="sub-style"
                value={selectedSubtitle.style}
                onChange={(e) =>
                  onUpdateSubtitle(selectedSubtitle.id, { style: e.target.value as SubtitleStyle })
                }
                className="w-full rounded-lg bg-[#0B0D10] border border-zinc-800 px-3 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-rose-500"
              >
                <option value="douyin-yellow">抖音爆款黄字黑边</option>
                <option value="tiktok-pill">TikTok 白底黑字胶囊</option>
                <option value="facebook-cinema">Facebook 电影半透明底</option>
                <option value="minimal-clean">极简纯净白字</option>
              </select>
            </div>

            <div>
              <span className="block text-[11px] text-zinc-400 mb-1.5">安全区垂直位置</span>
              <div className="grid grid-cols-3 gap-1.5">
                {(
                  [
                    { id: 'upper', label: '顶部' },
                    { id: 'center', label: '居中' },
                    { id: 'bottom', label: '底部' },
                  ] as const
                ).map((pos) => (
                  <button
                    key={pos.id}
                    type="button"
                    onClick={() => onUpdateSubtitle(selectedSubtitle.id, { position: pos.id })}
                    className={`py-1.5 text-xs rounded-md border transition-colors ${
                      selectedSubtitle.position === pos.id
                        ? 'bg-rose-500/15 border-rose-500/60 text-rose-200'
                        : 'bg-[#0B0D10] border-zinc-800 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {pos.label}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={() => onDeleteSubtitle(selectedSubtitle.id)}
              className="w-full py-2 px-3 rounded-lg border border-red-500/30 text-red-300 hover:bg-red-950/40 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>删除当前字幕条</span>
            </button>
          </div>
        ) : null}

        {/* Subtitle Settings & AI Speech-to-Text Alignment Section */}
        <div className="border-t border-zinc-800/80 pt-4 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
              <Mic className="w-3.5 h-3.5 text-rose-400" />
              <span>字幕设置 · AI 语音识别生成</span>
            </span>
            {selectedClip && (
              <span className="text-[11px] font-mono-nums text-zinc-500">
                {selectedClip.duration.toFixed(1)}s
              </span>
            )}
          </div>

          {selectedClip ? (
            <>
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                识别片段「{selectedClip.label}」的语音内容，并自动切分为与 {selectedClip.duration.toFixed(1)}s 时长对齐的字幕段。
              </p>

              <input
                ref={speechFileInputRef}
                type="file"
                accept="audio/*,video/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f && selectedClip) {
                    const url = URL.createObjectURL(f);
                    void runTranscribeRequest(selectedClip, selectedClipStartTime, url);
                  }
                  e.target.value = '';
                }}
              />

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={transcribingSpeech}
                  onClick={() => void runTranscribeRequest(selectedClip, selectedClipStartTime)}
                  className="flex-1 py-2 px-3 rounded-lg border border-zinc-700/90 bg-[#0B0D10] hover:border-rose-500/70 hover:bg-zinc-900/70 disabled:opacity-50 text-xs font-medium text-zinc-100 flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
                >
                  {transcribingSpeech ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-rose-400" />
                      <span>正在识别并对齐字幕...</span>
                    </>
                  ) : (
                    <>
                      <Mic className="w-3.5 h-3.5 text-rose-400" />
                      <span>AI 语音识别生成</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  disabled={transcribingSpeech}
                  onClick={() => speechFileInputRef.current?.click()}
                  title="导入人声配音或带语音的视频文件进行识别"
                  className="py-2 px-2.5 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 disabled:opacity-50 text-[11px] font-medium text-zinc-200 flex items-center gap-1 transition-colors whitespace-nowrap"
                >
                  <Upload className="w-3 h-3" />
                  <span>导入语音</span>
                </button>
              </div>

              {speechError && (
                <div className="rounded-lg border border-red-500/40 bg-red-950/30 p-2.5 text-[11px] text-red-200 leading-relaxed">
                  {speechError}
                </div>
              )}

              {speechResultNote && (
                <div className="rounded-lg border border-emerald-500/35 bg-emerald-950/25 p-2.5 text-[11px] text-emerald-200 leading-relaxed">
                  {speechResultNote}
                </div>
              )}
            </>
          ) : (
            <p className="text-[11px] text-zinc-500">请先在时间线选中一个视频片段。</p>
          )}
        </div>

        <div className="border-t border-zinc-800/80 pt-4 space-y-3">
          {/* One-Click Full 3-Track Audio Packaging */}
          <div className="rounded-lg border border-emerald-500/35 bg-[#0B0D10] p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-emerald-300 flex items-center gap-1.5">
                <Wand2 className="w-3.5 h-3.5 shrink-0" />
                <span>一键配齐整片声音</span>
              </span>
              <span className="text-[10px] font-mono-nums text-zinc-500">
                配音 · 配乐 · 音效
              </span>
            </div>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              无需手动反复调音：自动生成 AI 真人感口播、匹配 BGM 与转场节点音效，并开启说话时配乐自动闪避。
            </p>
            <button
              type="button"
              disabled={packagingFullAudio || clips.length === 0}
              onClick={handlePackageFullAudio}
              className="w-full py-2 px-3 rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-xs font-semibold text-white flex items-center justify-center gap-1.5 transition-colors"
            >
              {packagingFullAudio ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>正在合成配音并编排音轨...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>一键配齐（配音 + 配乐 + 音效）</span>
                </>
              )}
            </button>
            {fullAudioNote && (
              <p className="text-[11px] text-emerald-200 leading-relaxed">{fullAudioNote}</p>
            )}
          </div>

          {/* AI Voiceover & Direct Personal Voice Recording */}
          <div className="rounded-lg border border-zinc-800/90 bg-[#0B0D10] p-3 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
                <Mic className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>真人感口播与原声录制</span>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={audio.voiceoverEnabled}
                aria-label="启用口播配音轨"
                onClick={() => onUpdateAudio({ voiceoverEnabled: !audio.voiceoverEnabled })}
                className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors ${
                  audio.voiceoverEnabled
                    ? 'bg-emerald-600 border-emerald-500'
                    : 'bg-zinc-800 border-zinc-700'
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                    audio.voiceoverEnabled ? 'translate-x-4' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>

            {/* Naturalness Mode & Voice Actor */}
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => onUpdateAudio({ naturalMode: 'expressive' })}
                className={`py-1.5 px-2 rounded border text-[11px] font-medium transition-colors ${
                  (audio.naturalMode ?? 'expressive') === 'expressive'
                    ? 'border-emerald-500/70 bg-emerald-500/15 text-emerald-200'
                    : 'border-zinc-800 bg-[#11141B] text-zinc-400 hover:text-zinc-200'
                }`}
              >
                AI 真人演绎(含气声)
              </button>
              <button
                type="button"
                onClick={() => onUpdateAudio({ naturalMode: 'standard' })}
                className={`py-1.5 px-2 rounded border text-[11px] font-medium transition-colors ${
                  audio.naturalMode === 'standard'
                    ? 'border-emerald-500/70 bg-emerald-500/15 text-emerald-200'
                    : 'border-zinc-800 bg-[#11141B] text-zinc-400 hover:text-zinc-200'
                }`}
              >
                标准极速合成
              </button>
            </div>

            {/* AI Voice Cloning Guided Wizard Block */}
            <div className="rounded-lg border border-emerald-500/30 bg-[#11141B] p-2.5 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold text-emerald-300 flex items-center gap-1.5">
                  <Sparkles className="w-3 h-3 shrink-0" />
                  <span>AI 声音克隆（30s 个人建模）</span>
                </span>
                {clonedVoices.length > 0 && (
                  <span className="text-[10px] font-mono-nums text-zinc-400">
                    {clonedVoices.length} 个音色
                  </span>
                )}
              </div>

              <p className="text-[10px] text-zinc-400 leading-relaxed">
                录制 30 秒个人朗读，上传分析音调、气声与语速特征，生成专属于你的个性化合成音色。
              </p>

              <button
                type="button"
                onClick={() => setVoiceCloneModalOpen(true)}
                className="w-full py-1.5 px-2.5 rounded-md bg-emerald-600/90 hover:bg-emerald-500 text-[11px] font-semibold text-white flex items-center justify-center gap-1.5 transition-colors"
              >
                <Mic className="w-3 h-3" />
                <span>{clonedVoices.length > 0 ? '新增克隆音色（30s 向导）' : '启动 AI 声音克隆向导'}</span>
              </button>

              {clonedVoices.length > 0 && (
                <div className="space-y-1 pt-1">
                  {clonedVoices.map((cv) => {
                    const isSelected = audio.activeClonedVoiceId === cv.id;
                    return (
                      <div
                        key={cv.id}
                        className={`rounded border px-2 py-1.5 flex items-center justify-between gap-1.5 transition-colors ${
                          isSelected
                            ? 'border-emerald-500 bg-emerald-950/35'
                            : 'border-zinc-800 bg-[#0B0D10]'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateAudio({
                              activeClonedVoiceId: isSelected ? undefined : cv.id,
                              voiceoverVoice: cv.baseVoice,
                              voicePersonaPrompt: cv.voiceDesignPrompt,
                              naturalMode: 'expressive',
                            })
                          }
                          className="min-w-0 flex-1 text-left"
                        >
                          <div className="flex items-center gap-1.5 text-[11px]">
                            {isSelected && (
                              <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                            )}
                            <span
                              className={`font-medium truncate ${
                                isSelected ? 'text-emerald-200' : 'text-zinc-200'
                              }`}
                            >
                              {cv.name}
                            </span>
                          </div>
                          <p className="text-[10px] text-zinc-500 truncate mt-0.5">
                            {cv.timbreSummary}
                          </p>
                        </button>

                        <div className="flex items-center gap-1 shrink-0">
                          {cv.samplePreviewBase64 && (
                            <button
                              type="button"
                              title="试听该克隆音色"
                              onClick={() =>
                                onPreviewVoiceoverCue({
                                  id: `sample-${cv.id}`,
                                  startTime: 0,
                                  duration: 4,
                                  text: cv.name,
                                  audioBase64: cv.samplePreviewBase64!,
                                  mimeType: cv.samplePreviewMimeType || 'audio/wav',
                                  voiceName: cv.baseVoice,
                                  playbackRate: cv.playbackRate,
                                  eqLowGainDb: cv.eqLowGainDb,
                                  eqMidGainDb: cv.eqMidGainDb ?? 0,
                                  eqHighGainDb: cv.eqHighGainDb,
                                })
                              }
                              className="p-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-emerald-300"
                            >
                              <Volume2 className="w-3 h-3" />
                            </button>
                          )}
                          <button
                            type="button"
                            title="删除该克隆音色"
                            onClick={() => onDeleteClonedVoice(cv.id)}
                            className="p-1 rounded bg-zinc-800 hover:bg-red-950/60 text-zinc-400 hover:text-red-300"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {clonedVoices.length > 0 && !activeClonedVoice && (
                <p className="text-[10px] text-zinc-500 pt-0.5">
                  点击选中上方任意克隆音色，即可展开 3 段 EQ 均衡器、语速与语气强度微调面板。
                </p>
              )}

              {activeClonedVoice && (() => {
                const lowDb = activeClonedVoice.eqLowGainDb ?? 0;
                const midDb = activeClonedVoice.eqMidGainDb ?? 0;
                const highDb = activeClonedVoice.eqHighGainDb ?? 0;
                const speed = activeClonedVoice.playbackRate ?? 1;
                const exp = activeClonedVoice.expressiveness ?? 0.75;
                const expDescriptor =
                  exp >= 0.8 ? '富有感染力' : exp >= 0.45 ? '自然口语' : '克制平稳';

                const mapDbToY = (db: number) => 22 - (db / 6) * 14;
                const yLow = mapDbToY(lowDb);
                const yMid = mapDbToY(midDb);
                const yHigh = mapDbToY(highDb);
                const eqPath = `M 8 ${yLow} C 42 ${yLow}, 66 ${yMid}, 100 ${yMid} C 134 ${yMid}, 158 ${yHigh}, 192 ${yHigh}`;

                const handleResynthesizeClonePreview = async () => {
                  setResynthesizingClonePreview(true);
                  setCloneTuneError(null);
                  try {
                    const res = await fetch('/api/voice-clone/preview', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        baseVoice: activeClonedVoice.baseVoice,
                        voiceDesignPrompt: activeClonedVoice.voiceDesignPrompt,
                        expressiveness: exp,
                        text: `大家好，这是${activeClonedVoice.name}微调后的配音效果，低频扎实、人声清晰、情绪表达更自然。`,
                      }),
                    });
                    const data = await res.json();
                    if (!res.ok) {
                      throw new Error(data?.error || '按新语气重合成试听失败');
                    }
                    const nextBase64 = data.audioBase64 as string;
                    const nextMime = (data.mimeType as string) || 'audio/wav';
                    onUpdateClonedVoice(activeClonedVoice.id, {
                      samplePreviewBase64: nextBase64,
                      samplePreviewMimeType: nextMime,
                    });
                    onPreviewVoiceoverCue({
                      id: `tuned-preview-${activeClonedVoice.id}`,
                      startTime: 0,
                      duration: 4.5,
                      text: activeClonedVoice.name,
                      audioBase64: nextBase64,
                      mimeType: nextMime,
                      voiceName: activeClonedVoice.baseVoice,
                      clonedVoiceId: activeClonedVoice.id,
                      playbackRate: speed,
                      eqLowGainDb: lowDb,
                      eqMidGainDb: midDb,
                      eqHighGainDb: highDb,
                    });
                  } catch (err: unknown) {
                    setCloneTuneError(
                      err instanceof Error ? err.message : '语气重合成试听失败，请重试。'
                    );
                  } finally {
                    setResynthesizingClonePreview(false);
                  }
                };

                return (
                  <div className="mt-1.5 rounded-md border border-emerald-900/60 bg-[#0B0D10] p-2.5 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-medium text-emerald-300 flex items-center gap-1.5">
                        <Sliders className="w-3 h-3" />
                        <span>EQ 均衡与声学微调 · {activeClonedVoice.name}</span>
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateClonedVoice(activeClonedVoice.id, {
                            eqLowGainDb: 0,
                            eqMidGainDb: 0,
                            eqHighGainDb: 0,
                            playbackRate: 1.0,
                            expressiveness: 0.75,
                          })
                        }
                        className="text-[10px] text-zinc-400 hover:text-zinc-200 flex items-center gap-1"
                        title="重置为默认均衡与参数"
                      >
                        <RotateCcw className="w-2.5 h-2.5" />
                        <span>还原</span>
                      </button>
                    </div>

                    <div className="rounded border border-zinc-800/80 bg-[#11141B] px-2 py-1.5">
                      <svg
                        viewBox="0 0 200 44"
                        className="w-full h-10 overflow-visible"
                        aria-label="3段EQ频率响应曲线"
                      >
                        <line
                          x1="4"
                          y1="22"
                          x2="196"
                          y2="22"
                          stroke="#27272a"
                          strokeWidth="1"
                          strokeDasharray="3 3"
                        />
                        <path
                          d={`${eqPath} L 192 42 L 8 42 Z`}
                          fill="rgba(16, 185, 129, 0.12)"
                        />
                        <path
                          d={eqPath}
                          fill="none"
                          stroke="#34d399"
                          strokeWidth="1.75"
                          strokeLinecap="round"
                        />
                        <circle cx="8" cy={yLow} r="3" fill="#34d399" />
                        <circle cx="100" cy={yMid} r="3" fill="#34d399" />
                        <circle cx="192" cy={yHigh} r="3" fill="#34d399" />
                      </svg>
                      <div className="flex items-center justify-between text-[9px] font-mono-nums text-zinc-500 px-0.5">
                        <span>220Hz 低频</span>
                        <span>1.4kHz 人声</span>
                        <span>3.6kHz 高频</span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div>
                        <div className="flex items-center justify-between text-[10px] mb-0.5">
                          <span className="text-zinc-400">低音增益（温暖厚度 · 220Hz）</span>
                          <span className="font-mono-nums text-zinc-200">
                            {lowDb >= 0 ? '+' : ''}
                            {lowDb.toFixed(1)} dB
                          </span>
                        </div>
                        <input
                          type="range"
                          min={-6}
                          max={6}
                          step={0.5}
                          value={lowDb}
                          onChange={(e) =>
                            onUpdateClonedVoice(activeClonedVoice.id, {
                              eqLowGainDb: Number(e.target.value),
                            })
                          }
                          className="w-full accent-emerald-500 h-1.5 cursor-pointer"
                        />
                      </div>

                      <div>
                        <div className="flex items-center justify-between text-[10px] mb-0.5">
                          <span className="text-zinc-400">中频人声（贴耳清晰 · 1.4kHz）</span>
                          <span className="font-mono-nums text-zinc-200">
                            {midDb >= 0 ? '+' : ''}
                            {midDb.toFixed(1)} dB
                          </span>
                        </div>
                        <input
                          type="range"
                          min={-6}
                          max={6}
                          step={0.5}
                          value={midDb}
                          onChange={(e) =>
                            onUpdateClonedVoice(activeClonedVoice.id, {
                              eqMidGainDb: Number(e.target.value),
                            })
                          }
                          className="w-full accent-emerald-500 h-1.5 cursor-pointer"
                        />
                      </div>

                      <div>
                        <div className="flex items-center justify-between text-[10px] mb-0.5">
                          <span className="text-zinc-400">高音增益（通透气感 · 3.6kHz）</span>
                          <span className="font-mono-nums text-zinc-200">
                            {highDb >= 0 ? '+' : ''}
                            {highDb.toFixed(1)} dB
                          </span>
                        </div>
                        <input
                          type="range"
                          min={-6}
                          max={6}
                          step={0.5}
                          value={highDb}
                          onChange={(e) =>
                            onUpdateClonedVoice(activeClonedVoice.id, {
                              eqHighGainDb: Number(e.target.value),
                            })
                          }
                          className="w-full accent-emerald-500 h-1.5 cursor-pointer"
                        />
                      </div>
                    </div>

                    <div className="pt-1.5 border-t border-zinc-800/80 space-y-2">
                      <div>
                        <div className="flex items-center justify-between text-[10px] mb-0.5">
                          <span className="text-zinc-400">语速控制</span>
                          <span className="font-mono-nums text-zinc-200">
                            {speed.toFixed(2)}x
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0.8}
                          max={1.25}
                          step={0.02}
                          value={speed}
                          onChange={(e) =>
                            onUpdateClonedVoice(activeClonedVoice.id, {
                              playbackRate: Number(e.target.value),
                            })
                          }
                          className="w-full accent-emerald-500 h-1.5 cursor-pointer"
                        />
                      </div>

                      <div>
                        <div className="flex items-center justify-between text-[10px] mb-0.5">
                          <span className="text-zinc-400">语气强度（表达力）</span>
                          <span className="font-mono-nums text-emerald-300">
                            {Math.round(exp * 100)}% · {expDescriptor}
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0.2}
                          max={1.0}
                          step={0.05}
                          value={exp}
                          onChange={(e) =>
                            onUpdateClonedVoice(activeClonedVoice.id, {
                              expressiveness: Number(e.target.value),
                            })
                          }
                          className="w-full accent-emerald-500 h-1.5 cursor-pointer"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-1.5 pt-0.5">
                      <button
                        type="button"
                        disabled={!activeClonedVoice.samplePreviewBase64}
                        onClick={() => {
                          if (!activeClonedVoice.samplePreviewBase64) return;
                          onPreviewVoiceoverCue({
                            id: `eq-audition-${activeClonedVoice.id}`,
                            startTime: 0,
                            duration: 4.5,
                            text: activeClonedVoice.name,
                            audioBase64: activeClonedVoice.samplePreviewBase64,
                            mimeType: activeClonedVoice.samplePreviewMimeType || 'audio/wav',
                            voiceName: activeClonedVoice.baseVoice,
                            clonedVoiceId: activeClonedVoice.id,
                            playbackRate: speed,
                            eqLowGainDb: lowDb,
                            eqMidGainDb: midDb,
                            eqHighGainDb: highDb,
                          });
                        }}
                        className="py-1.5 px-2 rounded border border-zinc-700 bg-[#151A22] hover:bg-zinc-800 disabled:opacity-40 text-[10px] font-medium text-zinc-200 flex items-center justify-center gap-1 transition-colors"
                      >
                        <Volume2 className="w-3 h-3 text-emerald-400" />
                        <span>试听 EQ 音效</span>
                      </button>
                      <button
                        type="button"
                        disabled={resynthesizingClonePreview}
                        onClick={handleResynthesizeClonePreview}
                        className="py-1.5 px-2 rounded border border-emerald-700/70 bg-emerald-950/40 hover:bg-emerald-900/50 disabled:opacity-50 text-[10px] font-medium text-emerald-200 flex items-center justify-center gap-1 transition-colors"
                      >
                        {resynthesizingClonePreview ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Sparkles className="w-3 h-3" />
                        )}
                        <span>{resynthesizingClonePreview ? '合成中...' : '按语气重合成'}</span>
                      </button>
                    </div>

                    {cloneTuneError && (
                      <p className="text-[10px] text-red-400">{cloneTuneError}</p>
                    )}
                  </div>
                );
              })()}
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="voice-actor-select" className="text-[11px] text-zinc-400">
                  {activeClonedVoice
                    ? `当前已启用克隆音色：${activeClonedVoice.name}`
                    : 'AI 声音角色（无需自己录音即可发声）'}
                </label>
                {activeClonedVoice && (
                  <button
                    type="button"
                    onClick={() => onUpdateAudio({ activeClonedVoiceId: undefined })}
                    className="text-[10px] text-zinc-400 hover:text-zinc-200"
                  >
                    切回预设
                  </button>
                )}
              </div>
              <select
                id="voice-actor-select"
                disabled={Boolean(activeClonedVoice)}
                value={audio.voiceoverVoice ?? 'Kore'}
                onChange={(e) =>
                  onUpdateAudio({ voiceoverVoice: e.target.value as VoiceoverVoice })
                }
                className="w-full rounded-lg bg-[#11141B] border border-zinc-800 px-2.5 py-1.5 text-xs text-zinc-100 disabled:opacity-50 focus:outline-none focus:border-emerald-500"
              >
                {VOICEOVER_ACTORS.map((actor) => (
                  <option key={actor.id} value={actor.id}>
                    {actor.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] text-zinc-400">
                <label htmlFor="voice-persona-input">说话语气与人设指令</label>
                <span className="text-[10px] text-zinc-500">消除机械感</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {VOICE_PERSONA_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => onUpdateAudio({ voicePersonaPrompt: p.prompt })}
                    className={`px-2 py-0.5 rounded text-[10px] border transition-colors ${
                      audio.voicePersonaPrompt === p.prompt
                        ? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-200'
                        : 'border-zinc-800 bg-[#11141B] text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <input
                id="voice-persona-input"
                type="text"
                value={audio.voicePersonaPrompt ?? ''}
                onChange={(e) => onUpdateAudio({ voicePersonaPrompt: e.target.value })}
                placeholder="例如：语速轻快、像跟老朋友安利好物、句尾带微笑..."
                className="w-full rounded-lg bg-[#11141B] border border-zinc-800 px-2.5 py-1.5 text-[11px] text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <button
              type="button"
              disabled={generatingVoiceover || subtitles.length === 0}
              onClick={handleGenerateAiVoiceover}
              className="w-full py-2 px-3 rounded-lg border border-zinc-700/90 bg-[#11141B] hover:border-emerald-500/70 hover:bg-zinc-900 disabled:opacity-50 text-xs font-medium text-zinc-100 flex items-center justify-center gap-2 transition-colors"
            >
              {generatingVoiceover ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                  <span>正在逐句合成自然口播...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                  <span>AI 生成全片真人感配音（{subtitles.length} 句）</span>
                </>
              )}
            </button>

            {voiceoverError && (
              <div className="rounded border border-red-500/40 bg-red-950/30 p-2 text-[11px] text-red-200 leading-relaxed">
                {voiceoverError}
              </div>
            )}
            {voiceoverNote && (
              <div className="rounded border border-emerald-500/35 bg-emerald-950/25 p-2 text-[11px] text-emerald-200 leading-relaxed">
                {voiceoverNote}
              </div>
            )}

            {/* Direct Personal Mic Recorder & Voice Upload */}
            <div className="pt-2.5 border-t border-zinc-800/80 space-y-2">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-medium text-amber-200">录入自己原声（或替换单句）</span>
                <span className="text-[10px] text-zinc-500">支持麦克风直录</span>
              </div>

              <select
                aria-label="选择要录制的字幕段落"
                value={recordTargetSubId}
                onChange={(e) => setRecordTargetSubId(e.target.value)}
                className="w-full rounded-lg bg-[#11141B] border border-zinc-800 px-2.5 py-1.5 text-[11px] text-zinc-200 focus:outline-none focus:border-amber-500"
              >
                {subtitles.map((s, idx) => (
                  <option key={s.id} value={s.id}>
                    第 {idx + 1} 句 ({s.startTime.toFixed(1)}s) · {s.text.slice(0, 16)}
                  </option>
                ))}
                <option value="__playhead__">
                  在播放头位置插入 ({currentTime.toFixed(1)}s)
                </option>
              </select>

              <input
                ref={voiceUploadInputRef}
                type="file"
                accept="audio/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleUploadVoiceFile(f);
                  e.target.value = '';
                }}
              />

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => void handleToggleMicRecording()}
                  className={`flex-1 py-1.5 px-2.5 rounded-md text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                    isRecordingMic
                      ? 'bg-red-600 hover:bg-red-500 text-white'
                      : 'bg-amber-600/90 hover:bg-amber-500 text-white'
                  }`}
                >
                  {isRecordingMic ? (
                    <>
                      <Square className="w-3 h-3 fill-current" />
                      <span className="font-mono-nums">
                        停止录音 ({recordElapsedSec.toFixed(1)}s)
                      </span>
                    </>
                  ) : (
                    <>
                      <Mic className="w-3.5 h-3.5" />
                      <span>麦克风录自己声音</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => voiceUploadInputRef.current?.click()}
                  title="导入手机/录音笔录制的人声文件替换该句"
                  className="py-1.5 px-2.5 rounded-md bg-zinc-800 hover:bg-zinc-700 text-[11px] text-zinc-200 flex items-center gap-1 transition-colors shrink-0"
                >
                  <Upload className="w-3 h-3" />
                  <span>导入原声</span>
                </button>
              </div>

              {micError && (
                <p className="text-[11px] text-red-300 leading-relaxed">{micError}</p>
              )}
            </div>

            {/* AI Smart Background Noise Reduction */}
            <div className="pt-2.5 border-t border-zinc-800/80 space-y-2">
              <div className="rounded-lg border border-cyan-500/30 bg-[#0B0D10] p-2.5 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold text-cyan-300 flex items-center gap-1.5">
                    <AudioLines className="w-3.5 h-3.5 shrink-0" />
                    <span>AI 智能背景降噪</span>
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={Boolean(audio.voiceDenoiseEnabled)}
                    aria-label="开启 AI 智能背景降噪"
                    onClick={() =>
                      onUpdateAudio({
                        voiceDenoiseEnabled: !audio.voiceDenoiseEnabled,
                        voiceDenoiseStrength: audio.voiceDenoiseStrength ?? 0.72,
                      })
                    }
                    className={`relative inline-flex h-4 w-8 shrink-0 items-center rounded-full border transition-colors ${
                      audio.voiceDenoiseEnabled
                        ? 'bg-cyan-600 border-cyan-500'
                        : 'bg-zinc-800 border-zinc-700'
                    }`}
                  >
                    <span
                      className={`inline-block h-3 w-3 rounded-full bg-white transition-transform ${
                        audio.voiceDenoiseEnabled ? 'translate-x-4' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>

                <p className="text-[10px] text-zinc-400 leading-relaxed">
                  自动分析配音轨与克隆音色中的环境底噪、低频嗡鸣与高频嘶声，精准过滤杂音并增强人声清晰度。
                </p>

                <button
                  type="button"
                  disabled={analyzingNoise || (voiceoverCues.length === 0 && !activeClonedVoice?.samplePreviewBase64)}
                  onClick={() => void handleAnalyzeAndDenoiseVoiceover()}
                  className="w-full py-1.5 px-2.5 rounded-md border border-cyan-600/60 bg-cyan-950/35 hover:bg-cyan-900/45 disabled:opacity-45 text-[11px] font-semibold text-cyan-200 flex items-center justify-center gap-1.5 transition-colors"
                >
                  {analyzingNoise ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin" />
                      <span>正在检测环境噪声频谱...</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>
                        {audio.voiceDenoiseProfile ? '重新分析环境音并校准降噪' : 'AI 分析环境音并一键降噪'}
                      </span>
                    </>
                  )}
                </button>

                {noiseError && (
                  <p className="text-[10px] text-red-300 leading-relaxed">{noiseError}</p>
                )}

                {(audio.voiceDenoiseEnabled || audio.voiceDenoiseProfile) && (
                  <div className="space-y-2 pt-1 border-t border-zinc-800/80">
                    {audio.voiceDenoiseProfile && (
                      <div className="rounded border border-zinc-800 bg-[#11141B] p-2 space-y-1.5">
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="text-zinc-400">人声清晰度提升</span>
                          <span className="font-mono-nums text-emerald-300 font-semibold">
                            {audio.voiceDenoiseProfile.clarityScoreBefore} →{' '}
                            {audio.voiceDenoiseProfile.clarityScoreAfter} 分
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[10px] font-mono-nums text-zinc-400">
                          <span>环境底噪 {audio.voiceDenoiseProfile.ambientNoiseLevelDb} dB</span>
                          <span>信噪比 {audio.voiceDenoiseProfile.snrDb} dB</span>
                        </div>
                        <div className="flex flex-wrap gap-1 pt-0.5">
                          {audio.voiceDenoiseProfile.detectedNoiseTypes.map((tag) => (
                            <span
                              key={tag}
                              className="px-1.5 py-0.5 rounded bg-cyan-950/60 border border-cyan-800/50 text-[9px] text-cyan-200"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                        <p className="text-[10px] text-zinc-300 leading-relaxed">
                          {audio.voiceDenoiseProfile.summary}
                        </p>
                        <div className="text-[9px] font-mono-nums text-zinc-500">
                          高通切除 {audio.voiceDenoiseProfile.highpassHz}Hz · 门限{' '}
                          {audio.voiceDenoiseProfile.noiseGateDb}dB · 清晰提亮 +
                          {audio.voiceDenoiseProfile.presenceBoostDb.toFixed(1)}dB
                        </div>
                      </div>
                    )}

                    <div>
                      <div className="flex items-center justify-between text-[10px] mb-0.5">
                        <span className="text-zinc-400">降噪滤除强度</span>
                        <span className="font-mono-nums text-cyan-300">
                          {Math.round((audio.voiceDenoiseStrength ?? 0.72) * 100)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0.15}
                        max={1.0}
                        step={0.05}
                        value={audio.voiceDenoiseStrength ?? 0.72}
                        onChange={(e) =>
                          onUpdateAudio({
                            voiceDenoiseEnabled: true,
                            voiceDenoiseStrength: Number(e.target.value),
                          })
                        }
                        className="w-full accent-cyan-500 h-1.5 cursor-pointer"
                      />
                    </div>

                    {getAuditionSampleCue() && (
                      <button
                        type="button"
                        onClick={() => {
                          const cue = getAuditionSampleCue();
                          if (cue) onPreviewVoiceoverCue(cue);
                        }}
                        className="w-full py-1 px-2 rounded border border-zinc-700 bg-[#151A22] hover:bg-zinc-800 text-[10px] font-medium text-zinc-200 flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <Volume2 className="w-3 h-3 text-cyan-400" />
                        <span>
                          {audio.voiceDenoiseEnabled ? '试听降噪后清晰人声' : '试听降噪前原始人声'}
                        </span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Auto-ducking + Voiceover volume */}
            <div className="pt-2 border-t border-zinc-800/80 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-zinc-300">人声自动闪避 BGM（说话自动降噪）</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={audio.bgmAutoDucking ?? true}
                  aria-label="人声自动闪避 BGM"
                  onClick={() =>
                    onUpdateAudio({ bgmAutoDucking: !(audio.bgmAutoDucking ?? true) })
                  }
                  className={`relative inline-flex h-4 w-8 shrink-0 items-center rounded-full border transition-colors ${
                    (audio.bgmAutoDucking ?? true)
                      ? 'bg-emerald-600 border-emerald-500'
                      : 'bg-zinc-800 border-zinc-700'
                  }`}
                >
                  <span
                    className={`inline-block h-3 w-3 rounded-full bg-white transition-transform ${
                      (audio.bgmAutoDucking ?? true) ? 'translate-x-4' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>

              <div>
                <div className="flex items-center justify-between text-[11px] text-zinc-400 mb-0.5">
                  <label htmlFor="vo-vol">人声配音音量</label>
                  <span className="font-mono-nums">
                    {Math.round((audio.voiceoverVolume ?? 0.95) * 100)}%
                  </span>
                </div>
                <input
                  id="vo-vol"
                  type="range"
                  min={0.2}
                  max={1.2}
                  step={0.05}
                  value={audio.voiceoverVolume ?? 0.95}
                  onChange={(e) => onUpdateAudio({ voiceoverVolume: Number(e.target.value) })}
                  className="w-full accent-emerald-500"
                />
              </div>
            </div>

            {/* Generated / Recorded Cues List */}
            {voiceoverCues.length > 0 && (
              <div className="pt-2 border-t border-zinc-800/80 space-y-1.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-zinc-400">配音片段 ({voiceoverCues.length})</span>
                  <button
                    type="button"
                    onClick={() => onSetVoiceoverCues([])}
                    className="text-zinc-500 hover:text-red-300 transition-colors"
                  >
                    全部清空
                  </button>
                </div>
                <div className="space-y-1 max-h-36 overflow-y-auto pr-0.5">
                  {voiceoverCues.map((cue) => {
                    const isPersonal = cue.source === 'mic-record' || cue.source === 'upload';
                    return (
                      <div
                        key={cue.id}
                        className="rounded border border-zinc-800/80 bg-[#11141B] px-2 py-1 flex items-center justify-between gap-2 text-[11px]"
                      >
                        <button
                          type="button"
                          onClick={() => {
                            onSeek(cue.startTime);
                            onPreviewVoiceoverCue(cue);
                          }}
                          className="flex items-center gap-1.5 min-w-0 flex-1 text-left hover:text-emerald-300 transition-colors"
                        >
                          <span className="font-mono-nums text-emerald-400 shrink-0">
                            {cue.startTime.toFixed(1)}s
                          </span>
                          <span
                            className={`text-[10px] shrink-0 ${
                              isPersonal ? 'text-amber-300' : 'text-zinc-500'
                            }`}
                          >
                            {isPersonal ? '原声' : cue.voiceName}
                          </span>
                          <span className="text-zinc-200 truncate">{cue.text}</span>
                        </button>
                        <button
                          type="button"
                          aria-label={`删除配音 ${cue.text}`}
                          onClick={() => onRemoveVoiceoverCue(cue.id)}
                          className="text-zinc-500 hover:text-red-400 transition-colors shrink-0"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Music className="w-3.5 h-3.5 text-zinc-400" />
              <span className="text-xs font-semibold text-zinc-200">背景配乐与卡点节拍</span>
            </div>
            <span className="text-[11px] font-mono-nums text-zinc-400">{audio.bpm} BPM</span>
          </div>

          <div>
            <label htmlFor="bgm-preset" className="block text-[11px] text-zinc-400 mb-1">
              内置风格化节奏音轨
            </label>
            <select
              id="bgm-preset"
              value={audio.bgmPreset}
              onChange={(e) => {
                const preset = e.target.value as BgmPreset;
                const nextBpm = preset === 'none' ? audio.bpm : BGM_PRESET_BPM[preset];
                onUpdateAudio({ bgmPreset: preset, bpm: nextBpm });
              }}
              className="w-full rounded-lg bg-[#0B0D10] border border-zinc-800 px-3 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-rose-500"
            >
              <option value="upbeat-128">律动感 · 高燃电音鼓点 (128 BPM)</option>
              <option value="tech-118">科技感 · 都市律动节拍 (118 BPM)</option>
              <option value="fresh-112">清新感 · 明快轻拨弦律 (112 BPM)</option>
              <option value="suspense-104">悬疑感 · 深沉脉冲张力 (104 BPM)</option>
              <option value="lofi-95">松弛感 · Lo-Fi 暖调和弦 (95 BPM)</option>
              <option value="narrative-92">叙事感 · 电影钢琴弦乐 (92 BPM)</option>
              <option value="none">静音无背景音</option>
            </select>
          </div>

          <div className="space-y-2">
            <button
              type="button"
              disabled={analyzingBgm || clips.length === 0}
              onClick={handleAnalyzeBgm}
              className="w-full py-2 px-3 rounded-lg border border-zinc-700/90 bg-[#0B0D10] hover:border-rose-500/70 hover:bg-zinc-900/70 disabled:opacity-50 text-xs font-medium text-zinc-100 flex items-center justify-center gap-2 transition-colors"
            >
              {analyzingBgm ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-rose-400" />
                  <span>正在分析剪辑节奏与情绪...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5 text-rose-400" />
                  <span>AI 风格化背景乐推荐</span>
                </>
              )}
            </button>

            {bgmError && (
              <div className="rounded-lg border border-red-500/40 bg-red-950/30 p-2.5 text-[11px] text-red-200 leading-relaxed">
                {bgmError}
              </div>
            )}

            {bgmSuggestion && (
              <div className="rounded-lg border border-zinc-800 bg-[#0B0D10] p-3 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-rose-300">
                    推荐风格：{bgmSuggestion.moodLabel}
                  </span>
                  <span className="text-[11px] text-zinc-400 font-mono-nums">
                    {bgmSuggestion.recommendedBpm} BPM · {Math.round(bgmSuggestion.recommendedVolume * 100)}%
                  </span>
                </div>

                <p className="text-[11px] font-medium text-zinc-200">
                  {bgmSuggestion.presetName}
                </p>

                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  {bgmSuggestion.reason}
                </p>

                <p className="text-[11px] text-zinc-500 leading-relaxed">
                  {bgmSuggestion.soundDesignNote}
                </p>

                <button
                  type="button"
                  onClick={handleApplyBgmSuggestion}
                  className={`w-full py-2 px-3 rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                    bgmApplied && audio.bgmPreset === bgmSuggestion.recommendedPreset
                      ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                      : 'bg-rose-600 hover:bg-rose-500 text-white'
                  }`}
                >
                  {bgmApplied && audio.bgmPreset === bgmSuggestion.recommendedPreset ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>已应用预设音效配置</span>
                    </>
                  ) : (
                    <>
                      <Music className="w-3.5 h-3.5" />
                      <span>一键应用预设音效</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between text-[11px] text-zinc-400 mb-1">
              <label htmlFor="audio-vol">配乐音量</label>
              <span className="font-mono-nums">{Math.round(audio.volume * 100)}%</span>
            </div>
            <input
              id="audio-vol"
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={audio.volume}
              onChange={(e) => onUpdateAudio({ volume: Number(e.target.value) })}
              className="w-full accent-rose-500"
            />
          </div>

          <input
            ref={audioInputRef}
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onUploadAudio(f);
              e.target.value = '';
            }}
          />

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => audioInputRef.current?.click()}
              className="flex-1 py-1.5 px-2.5 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 text-[11px] font-medium text-zinc-200 flex items-center justify-center gap-1.5 transition-colors"
            >
              <Upload className="w-3 h-3" />
              <span>{audio.customAudioName ? '更换本地音频' : '导入本地配乐'}</span>
            </button>
            {audio.customAudioUrl && (
              <button
                type="button"
                onClick={() => onUpdateAudio({ customAudioUrl: undefined, customAudioName: undefined })}
                className="py-1.5 px-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-[11px] text-zinc-300"
              >
                清除
              </button>
            )}
          </div>
          {audio.customAudioName && (
            <p className="text-[11px] text-zinc-400 truncate">已加载：{audio.customAudioName}</p>
          )}

          {/* AI Copyright Risk Scanner & Royalty-Free Alternatives */}
          <div className="border-t border-zinc-800/80 pt-3.5 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
                <ShieldAlert className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>AI 版权风险扫描</span>
              </span>
              <span className="text-[10px] text-zinc-500">检索公开版权库</span>
            </div>

            <p className="text-[11px] text-zinc-400 leading-relaxed">
              分析当前 BGM{audio.customAudioName ? `（${audio.customAudioName}）` : ''}与 {sfxEvents.length} 处音效，自动检索公开商用曲库标注版权风险并推荐同风格免版税替代音乐。
            </p>

            <button
              type="button"
              disabled={scanningCopyright}
              onClick={() => void handleScanAudioCopyright()}
              className="w-full py-2 px-3 rounded-lg border border-amber-500/40 bg-[#0B0D10] hover:border-amber-400 hover:bg-amber-950/20 disabled:opacity-50 text-xs font-medium text-amber-200 flex items-center justify-center gap-2 transition-colors"
            >
              {scanningCopyright ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
                  <span>正在检索公开版权数据库...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                  <span>{copyrightScan ? '重新扫描配乐与音效版权' : '扫描版权风险并检索替代音乐'}</span>
                </>
              )}
            </button>

            {copyrightError && (
              <div className="rounded-lg border border-red-500/40 bg-red-950/30 p-2.5 text-[11px] text-red-200 leading-relaxed">
                {copyrightError}
              </div>
            )}

            {copyrightScan && (
              <div className="rounded-lg border border-zinc-800 bg-[#0B0D10] p-3 space-y-2.5">
                {/* Overall Risk Banner */}
                <div
                  className={`rounded-md border px-2.5 py-2 flex items-start gap-2 ${
                    copyrightScan.overallRisk === 'high'
                      ? 'border-red-500/45 bg-red-950/30 text-red-200'
                      : copyrightScan.overallRisk === 'medium'
                        ? 'border-amber-500/45 bg-amber-950/25 text-amber-200'
                        : 'border-emerald-500/40 bg-emerald-950/25 text-emerald-200'
                  }`}
                >
                  {copyrightScan.overallRisk === 'low' ? (
                    <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle
                      className={`w-4 h-4 shrink-0 mt-0.5 ${
                        copyrightScan.overallRisk === 'high' ? 'text-red-400' : 'text-amber-400'
                      }`}
                    />
                  )}
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold">
                      <span>
                        {copyrightScan.overallRisk === 'high'
                          ? '高版权风险'
                          : copyrightScan.overallRisk === 'medium'
                            ? '待核验风险'
                            : '无版权风险 · 安全过审'}
                      </span>
                    </div>
                    <p className="text-[11px] leading-snug">{copyrightScan.riskHeadline}</p>
                  </div>
                </div>

                {/* BGM & SFX Breakdown */}
                <div className="rounded border border-zinc-800/80 bg-[#11141B] p-2 space-y-1.5 text-[10px]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-zinc-400 shrink-0">配乐轨道</span>
                    <span className="text-zinc-200 font-medium truncate">
                      {copyrightScan.bgmAssessment.trackName}
                    </span>
                  </div>
                  <p className="text-zinc-300 leading-relaxed">
                    {copyrightScan.bgmAssessment.analysisNote}
                  </p>
                  {copyrightScan.bgmAssessment.platformWarnings.length > 0 && (
                    <ul className="space-y-0.5 text-zinc-400 list-disc pl-3.5">
                      {copyrightScan.bgmAssessment.platformWarnings.map((warn, i) => (
                        <li key={i} className="leading-snug">
                          {warn}
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="pt-1 border-t border-zinc-800/70 flex items-center justify-between gap-2">
                    <span className="text-zinc-400">音效评估 ({copyrightScan.sfxAssessment.count} 处)</span>
                    <span
                      className={
                        copyrightScan.sfxAssessment.riskLevel === 'low'
                          ? 'text-emerald-300'
                          : 'text-amber-300'
                      }
                    >
                      {copyrightScan.sfxAssessment.riskLevel === 'low' ? '免版税安全' : '建议核验'}
                    </span>
                  </div>
                  <p className="text-zinc-400 leading-snug">{copyrightScan.sfxAssessment.note}</p>
                </div>

                {/* Royalty-free Same-Style Alternatives */}
                {copyrightScan.alternatives.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="text-[11px] font-semibold text-zinc-200">
                      同风格无版权替代音乐推荐
                    </div>
                    <div className="space-y-1.5 max-h-52 overflow-y-auto pr-0.5">
                      {copyrightScan.alternatives.map((alt) => {
                        const isApplied =
                          appliedAlternativeTitle === alt.title &&
                          !audio.customAudioName &&
                          audio.bgmPreset === alt.recommendedPreset;
                        return (
                          <div
                            key={`${alt.title}-${alt.artistOrSource}`}
                            className="rounded-md border border-zinc-800 bg-[#11141B] p-2 space-y-1.5"
                          >
                            <div className="flex items-start justify-between gap-1.5">
                              <div className="min-w-0">
                                <div className="text-[11px] font-semibold text-zinc-100 truncate">
                                  {alt.title}
                                </div>
                                <div className="text-[10px] text-zinc-400 truncate">
                                  {alt.artistOrSource} · {alt.moodAndBpm}
                                </div>
                              </div>
                              <span className="px-1.5 py-0.5 rounded bg-emerald-950/60 border border-emerald-700/50 text-[9px] text-emerald-300 shrink-0">
                                {alt.licenseType}
                              </span>
                            </div>

                            <p className="text-[10px] text-zinc-400 leading-snug">{alt.reason}</p>

                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleApplyCopyrightAlternative(alt)}
                                className={`flex-1 py-1 px-2 rounded text-[10px] font-semibold flex items-center justify-center gap-1 transition-colors ${
                                  isApplied
                                    ? 'bg-emerald-600 text-white'
                                    : 'bg-zinc-800 hover:bg-emerald-600 text-zinc-200 hover:text-white'
                                }`}
                              >
                                {isApplied ? (
                                  <>
                                    <Check className="w-3 h-3" />
                                    <span>已切换至该无版权音轨</span>
                                  </>
                                ) : (
                                  <>
                                    <Music className="w-3 h-3" />
                                    <span>一键替换同风格无版权音乐</span>
                                  </>
                                )}
                              </button>
                              {alt.referenceUrl && (
                                <a
                                  href={alt.referenceUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title="查看公开曲库授权详情"
                                  className="p-1 rounded border border-zinc-700 bg-[#0B0D10] text-zinc-400 hover:text-zinc-200 transition-colors shrink-0"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Grounding Database Citations */}
                {copyrightScan.groundingSources.length > 0 && (
                  <div className="pt-1.5 border-t border-zinc-800/80 space-y-1">
                    <div className="text-[10px] text-zinc-500">检索参考来源</div>
                    <div className="flex flex-wrap gap-1.5">
                      {copyrightScan.groundingSources.map((src) => (
                        <a
                          key={src.uri}
                          href={src.uri}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 hover:border-zinc-600 text-[9px] text-zinc-400 hover:text-zinc-200 max-w-[190px] truncate transition-colors"
                        >
                          <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                          <span className="truncate">{src.title}</span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* AI Micro SFX Library Recommendation */}
          <div className="border-t border-zinc-800/80 pt-3.5 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
                <Volume2 className="w-3.5 h-3.5 text-cyan-400" />
                <span>AI 音效库推荐（微型音效 SFX）</span>
              </span>
              {sfxEvents.length > 0 && (
                <span className="text-[11px] font-mono-nums text-cyan-300">
                  已插 {sfxEvents.length} 处
                </span>
              )}
            </div>

            <p className="text-[11px] text-zinc-400 leading-relaxed">
              分析时间轴转场、字幕高亮与画面动作节点，自动匹配「咻」声、「叮」声、「咔哒」点击等微型音效。
            </p>

            <button
              type="button"
              disabled={analyzingSfx || clips.length === 0}
              onClick={handleAnalyzeSfx}
              className="w-full py-2 px-3 rounded-lg border border-zinc-700/90 bg-[#0B0D10] hover:border-cyan-500/70 hover:bg-zinc-900/70 disabled:opacity-50 text-xs font-medium text-zinc-100 flex items-center justify-center gap-2 transition-colors"
            >
              {analyzingSfx ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                  <span>正在分析时间轴动作节点...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                  <span>AI 音效库推荐并匹配节点</span>
                </>
              )}
            </button>

            {sfxError && (
              <div className="rounded-lg border border-red-500/40 bg-red-950/30 p-2.5 text-[11px] text-red-200 leading-relaxed">
                {sfxError}
              </div>
            )}

            {sfxSuggestion && (
              <div className="rounded-lg border border-zinc-800 bg-[#0B0D10] p-3 space-y-2.5">
                <p className="text-[11px] text-zinc-300 leading-relaxed">
                  {sfxSuggestion.librarySummary}
                </p>

                <div className="space-y-1.5 max-h-44 overflow-y-auto pr-0.5">
                  {sfxSuggestion.events.map((ev) => {
                    const alreadyAdded = sfxEvents.some((s) => s.id === ev.id);
                    return (
                      <div
                        key={ev.id}
                        className="rounded-md border border-zinc-800/90 bg-[#11141B] px-2 py-1.5 flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 text-[11px]">
                            <span className="font-mono-nums text-cyan-300 shrink-0">
                              {ev.time.toFixed(1)}s
                            </span>
                            <span className="text-zinc-500">·</span>
                            <span className="font-medium text-zinc-100 truncate">
                              {ev.name}
                            </span>
                            <span className="text-[10px] text-zinc-500 shrink-0">
                              {SFX_CATEGORY_LABELS[ev.category]}
                            </span>
                          </div>
                          {ev.reason && (
                            <p className="text-[10px] text-zinc-500 truncate mt-0.5">
                              {ev.reason}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            title="试听该音效"
                            onClick={() => onPreviewSfx(ev.type, ev.volume)}
                            className="p-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors"
                          >
                            <Volume2 className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            title={alreadyAdded ? '已在时间线中' : '插入到该时间点'}
                            onClick={() => {
                              onAddSfxEvent(ev);
                              onSeek(ev.time);
                              onPreviewSfx(ev.type, ev.volume);
                            }}
                            className={`p-1 rounded transition-colors ${
                              alreadyAdded
                                ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/40'
                                : 'bg-zinc-800 hover:bg-cyan-600 text-zinc-200 hover:text-white'
                            }`}
                          >
                            {alreadyAdded ? (
                              <Check className="w-3 h-3" />
                            ) : (
                              <Plus className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={handleApplyAllSfx}
                  className={`w-full py-2 px-3 rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                    sfxAppliedAll && sfxEvents.length > 0
                      ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                      : 'bg-cyan-600 hover:bg-cyan-500 text-white'
                  }`}
                >
                  {sfxAppliedAll && sfxEvents.length > 0 ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>已自动插入 {sfxEvents.length} 个节点音效</span>
                    </>
                  ) : (
                    <>
                      <Volume2 className="w-3.5 h-3.5" />
                      <span>一键自动插入全部推荐音效</span>
                    </>
                  )}
                </button>
              </div>
            )}

            {/* Quick Built-in Micro SFX Catalog */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] text-zinc-400">
                <span>微型音效库（点击试听 / + 插入当前帧）</span>
                <span className="font-mono-nums text-zinc-500">{currentTime.toFixed(1)}s</span>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {SFX_LIBRARY_CATALOG.map((item) => (
                  <div
                    key={item.type}
                    className="rounded-md border border-zinc-800 bg-[#0B0D10] flex items-center justify-between overflow-hidden"
                  >
                    <button
                      type="button"
                      onClick={() => onPreviewSfx(item.type, 0.8)}
                      className="flex-1 px-2 py-1.5 text-left text-[11px] text-zinc-300 hover:text-white hover:bg-zinc-900 flex items-center gap-1.5 min-w-0 transition-colors"
                      title={`试听 ${item.label}`}
                    >
                      <Volume2 className="w-3 h-3 text-cyan-400 shrink-0" />
                      <span className="truncate">{item.shortTag}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleInsertManualSfx(item)}
                      className="px-2 py-1.5 border-l border-zinc-800 text-zinc-400 hover:text-cyan-300 hover:bg-zinc-900 transition-colors"
                      title={`在 ${currentTime.toFixed(1)}s 插入 ${item.label}`}
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {sfxEvents.length > 0 && (
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-zinc-400">时间线已插入音效</span>
                  <button
                    type="button"
                    onClick={() => {
                      onSetSfxEvents([]);
                      setSfxAppliedAll(false);
                    }}
                    className="text-zinc-500 hover:text-red-300 transition-colors"
                  >
                    全部清空
                  </button>
                </div>
                <div className="space-y-1 max-h-32 overflow-y-auto pr-0.5">
                  {sfxEvents.map((ev) => (
                    <div
                      key={ev.id}
                      className="rounded border border-zinc-800/80 bg-[#0B0D10] px-2 py-1 flex items-center justify-between gap-2 text-[11px]"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          onSeek(ev.time);
                          onPreviewSfx(ev.type, ev.volume);
                        }}
                        className="flex items-center gap-1.5 min-w-0 flex-1 text-left hover:text-cyan-300 transition-colors"
                      >
                        <span className="font-mono-nums text-cyan-400 shrink-0">
                          {ev.time.toFixed(1)}s
                        </span>
                        <span className="text-zinc-200 truncate">{ev.name}</span>
                      </button>
                      <button
                        type="button"
                        aria-label={`移除音效 ${ev.name}`}
                        onClick={() => onRemoveSfxEvent(ev.id)}
                        className="text-zinc-500 hover:text-red-400 transition-colors shrink-0"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
          </>
        )}
      </div>
      {voiceCloneModalOpen && (
        <VoiceCloneModal
          onClose={() => setVoiceCloneModalOpen(false)}
          onSaveProfile={onSaveClonedVoice}
        />
      )}
    </aside>
  );
}
