import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AudioLines,
  Check,
  Film,
  ImagePlus,
  Languages,
  Layers,
  Loader2,
  Mic,
  Move,
  Play,
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
  ClonedVoiceProfile,
  DigitalHumanActionId,
  DigitalHumanActionRecommendation,
  DigitalHumanCameraMotion,
  DigitalHumanCameraPresetId,
  DigitalHumanClipConfig,
  DigitalHumanEmotionAnalysis,
  DigitalHumanEmotionId,
  DigitalHumanFacialMuscles,
  DigitalHumanFrameShape,
  DigitalHumanMultilingualResult,
  DigitalHumanPhonemeAlignmentProfile,
  DigitalHumanPipPosition,
  DigitalHumanProfile,
  DigitalHumanTargetLanguage,
  MediaAsset,
  PlatformId,
  SubtitleSegment,
  TimelineClip,
  TransitionType,
  VoiceoverVoice,
} from '../types/studio';
import {
  analyzeAudioForPhonemeAlignment,
  analyzeAudioProsodyForEmotion,
  analyzeScriptForActionSuggestions,
  BUILTIN_DIGITAL_HUMAN_PRESETS,
  clampCameraMotion,
  clampFacialMuscles,
  createDigitalHumanPresetProfile,
  DIGITAL_HUMAN_ACTION_TEMPLATES,
  DIGITAL_HUMAN_CAMERA_PRESETS,
  DIGITAL_HUMAN_EMOTION_PRESETS,
  DIGITAL_HUMAN_LANGUAGES,
  estimateSpeechDurationSec,
  getDigitalHumanActionTemplate,
  getDigitalHumanCameraPreset,
  getDigitalHumanEmotionPreset,
  getDigitalHumanLanguageOption,
  getVisemeDisplayMeta,
  realignPhonemeProfileOffset,
  splitSpeechScriptIntoSegments,
} from '../utils/digitalHumanAssets';
import { renderDigitalHumanMiniStage } from '../utils/canvasRenderer';
import { apiFetch } from '../client/api/http';
import { blobToBase64 } from './digitalHuman/blobToBase64';
import { CloneSection } from './digitalHuman/CloneSection';
import { DriveSection } from './digitalHuman/DriveSection';
import { EmotionActionSection } from './digitalHuman/EmotionActionSection';
import { MultilingualSection } from './digitalHuman/MultilingualSection';

export type DigitalHumanInsertTarget = 'before' | 'after' | 'start' | 'end';

interface DigitalHumanTabProps {
  selectedClip: TimelineClip | null;
  selectedClipStartTime: number;
  clips: TimelineClip[];
  subtitles: SubtitleSegment[];
  assets: MediaAsset[];
  clonedVoices: ClonedVoiceProfile[];
  digitalHumans: DigitalHumanProfile[];
  platform: PlatformId;
  activeVoiceoverVoice: VoiceoverVoice;
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
      phonemeAlignment?: DigitalHumanPhonemeAlignmentProfile;
    }
  ) => void;
  onRemoveClipDigitalHuman: (clipId: string) => void;
  onUpdateClipDigitalHumanAction: (
    clipId: string,
    action: DigitalHumanActionId,
    actionIntensity?: number,
    options?: {
      actionBlendDuration?: number;
      blendFromAction?: DigitalHumanActionId;
    }
  ) => void;
  onBatchApplyDigitalHumanActions?: (
    updates: Array<{
      clipId: string;
      action: DigitalHumanActionId;
      actionIntensity?: number;
      actionBlendDuration?: number;
    }>
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
  onUpdateClipDigitalHumanCameraMotion?: (
    clipId: string,
    cameraMotion: DigitalHumanCameraMotion
  ) => void;
  onUpdateClipDigitalHumanPhonemeAlignment?: (
    clipId: string,
    phonemeAlignment: DigitalHumanPhonemeAlignmentProfile
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
      phonemeAlignment?: DigitalHumanPhonemeAlignmentProfile;
    };
  }) => void;
  brief?: string;
}


export function DigitalHumanTab({
  selectedClip,
  selectedClipStartTime,
  clips,
  subtitles,
  assets,
  clonedVoices,
  digitalHumans,
  platform,
  activeVoiceoverVoice,
  onSaveDigitalHuman,
  onDeleteDigitalHuman,
  onUploadMediaAssetForAnchor,
  onEmbedDigitalHumanPip,
  onRemoveClipDigitalHuman,
  onUpdateClipDigitalHumanAction,
  onBatchApplyDigitalHumanActions,
  onUpdateClipDigitalHumanEmotion,
  onUpdateClipDigitalHumanCameraMotion,
  onUpdateClipDigitalHumanPhonemeAlignment,
  onInsertDigitalHumanClip,
  brief = '',
}: DigitalHumanTabProps) {
  // Clone Creation Form State
  const [anchorName, setAnchorName] = useState('我的虚拟主播');
  const [styleHint, setStyleHint] = useState('亲和力短视频口播主播');
  const [selectedAssetForClone, setSelectedAssetForClone] = useState<MediaAsset | null>(null);
  const [uploadedPreviewUrl, setUploadedPreviewUrl] = useState<string>(
    BUILTIN_DIGITAL_HUMAN_PRESETS[0].avatarUrl
  );
  const [uploadedMediaType, setUploadedMediaType] = useState<'image' | 'video'>('image');
  const [selectedVoiceBinding, setSelectedVoiceBinding] = useState<string>(activeVoiceoverVoice);

  // Voice Recording inside Digital Human Tab (shared for clone or direct drive)
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [recordElapsedSec, setRecordElapsedSec] = useState(0);
  const [recordedVoice, setRecordedVoice] = useState<{
    base64: string;
    mimeType: string;
    durationSec: number;
  } | null>(null);
  const [voiceRecordError, setVoiceRecordError] = useState<string | null>(null);

  // Clone Generation State
  const [cloningAnchor, setCloningAnchor] = useState(false);
  const [cloneMessage, setCloneMessage] = useState<string | null>(null);

  // Active Digital Human Roster Selection
  const [activeAnchorId, setActiveAnchorId] = useState<string>(
    digitalHumans[0]?.id ?? BUILTIN_DIGITAL_HUMAN_PRESETS[0].id
  );

  // Speech Driving State
  const [driveMode, setDriveMode] = useState<'ai-script' | 'recorded-audio'>('ai-script');
  const [scriptText, setScriptText] = useState(
    '大家好！先看这个实拍细节，30秒带你搞定同款质感体验，记得看到最后！'
  );
  const [drivingSpeech, setDrivingSpeech] = useState(false);
  const [driveError, setDriveError] = useState<string | null>(null);
  const [drivenAudio, setDrivenAudio] = useState<{
    audioBase64: string;
    mimeType: string;
    durationSec: number;
    text: string;
    segmentCount?: number;
  } | null>(null);
  const [isPreviewingMiniStage, setIsPreviewingMiniStage] = useState(false);

  const speechEstimate = useMemo(() => {
    const clean = scriptText.trim();
    const segments = splitSpeechScriptIntoSegments(clean, 160);
    return {
      charCount: clean.length,
      segmentCount: segments.length,
      durationSec: estimateSpeechDurationSec(clean),
    };
  }, [scriptText]);

  // Multilingual Voice Synthesis & Voice Cloning State
  const [multilingualEnabled, setMultilingualEnabled] = useState<boolean>(
    Boolean(selectedClip?.digitalHuman?.targetLanguage)
  );
  const [targetLanguage, setTargetLanguage] = useState<DigitalHumanTargetLanguage>(
    selectedClip?.digitalHuman?.targetLanguage ?? 'en-US'
  );
  const [synthesizingMultilingual, setSynthesizingMultilingual] = useState(false);
  const [multilingualResult, setMultilingualResult] =
    useState<DigitalHumanMultilingualResult | null>(null);
  const [editableTranslatedScript, setEditableTranslatedScript] = useState<string>(
    selectedClip?.digitalHuman?.translatedScript ?? ''
  );
  const [applyTranslatedToCaption, setApplyTranslatedToCaption] = useState<boolean>(true);
  const [multilingualError, setMultilingualError] = useState<string | null>(null);

  // Action Template Library & Auto Action Suggestion State
  const [selectedAction, setSelectedAction] = useState<DigitalHumanActionId>(
    selectedClip?.digitalHuman?.action ?? digitalHumans[0]?.defaultAction ?? 'explain'
  );
  const [previousAction, setPreviousAction] = useState<DigitalHumanActionId | null>(
    selectedClip?.digitalHuman?.blendFromAction ?? null
  );
  const [actionIntensity, setActionIntensity] = useState<number>(
    selectedClip?.digitalHuman?.actionIntensity ?? 1.0
  );
  const [actionBlendDuration, setActionBlendDuration] = useState<number>(
    selectedClip?.digitalHuman?.actionBlendDuration ??
      digitalHumans[0]?.defaultActionBlendDuration ??
      0.45
  );
  const [actionSyncNotice, setActionSyncNotice] = useState<string | null>(null);
  const [autoActionSuggestEnabled, setAutoActionSuggestEnabled] = useState<boolean>(true);
  const [aiActionSuggestion, setAiActionSuggestion] =
    useState<DigitalHumanActionRecommendation | null>(null);
  const [analyzingActionSuggestion, setAnalyzingActionSuggestion] = useState(false);
  const [actionSuggestNote, setActionSuggestNote] = useState<string | null>(null);

  // Voice Emotion Matching & Facial Muscle Drive State
  const [emotionMatchEnabled, setEmotionMatchEnabled] = useState<boolean>(
    selectedClip?.digitalHuman?.emotionMatchEnabled ?? true
  );
  const [selectedEmotion, setSelectedEmotion] = useState<DigitalHumanEmotionId>(
    selectedClip?.digitalHuman?.emotion ?? digitalHumans[0]?.defaultEmotion ?? 'neutral'
  );
  const [facialMuscles, setFacialMuscles] = useState<DigitalHumanFacialMuscles>(
    clampFacialMuscles(
      selectedClip?.digitalHuman?.facialMuscles ??
        digitalHumans[0]?.defaultFacialMuscles ??
        getDigitalHumanEmotionPreset(selectedClip?.digitalHuman?.emotion ?? 'neutral').muscles
    )
  );
  const [analyzingEmotion, setAnalyzingEmotion] = useState(false);
  const [emotionAnalysis, setEmotionAnalysis] = useState<DigitalHumanEmotionAnalysis | null>(null);
  const [emotionNote, setEmotionNote] = useState<string | null>(null);

  // Camera Motion Enhancement State
  const [cameraMotion, setCameraMotion] = useState<DigitalHumanCameraMotion>(
    clampCameraMotion(
      selectedClip?.digitalHuman?.cameraMotion ??
        digitalHumans[0]?.defaultCameraMotion ??
        getDigitalHumanCameraPreset('none').motion
    )
  );
  const [cameraNotice, setCameraNotice] = useState<string | null>(null);

  // Precise Mel-Spectrum Phoneme Alignment State
  const [phonemeAlignEnabled, setPhonemeAlignEnabled] = useState<boolean>(
    selectedClip?.digitalHuman?.phonemeAlignment?.enabled ??
      digitalHumans[0]?.defaultPhonemeAlignmentEnabled ??
      true
  );
  const [phonemeOffsetMs, setPhonemeOffsetMs] = useState<number>(
    selectedClip?.digitalHuman?.phonemeAlignment?.keyframeOffsetMs ??
      digitalHumans[0]?.defaultPhonemeOffsetMs ??
      -12
  );
  const [phonemeOnsetAdvanceMs, setPhonemeOnsetAdvanceMs] = useState<number>(
    selectedClip?.digitalHuman?.phonemeAlignment?.onsetAdvanceMs ?? 20
  );
  const [phonemeAlignment, setPhonemeAlignment] =
    useState<DigitalHumanPhonemeAlignmentProfile | null>(
      selectedClip?.digitalHuman?.phonemeAlignment ?? null
    );
  const [analyzingPhonemes, setAnalyzingPhonemes] = useState<boolean>(false);
  const [phonemeNotice, setPhonemeNotice] = useState<string | null>(null);

  // Video Track Embedding State
  const [embedMode, setEmbedMode] = useState<'pip-overlay' | 'full-scene'>(
    selectedClip?.digitalHuman?.mode ?? 'pip-overlay'
  );
  const [pipPosition, setPipPosition] = useState<DigitalHumanPipPosition>(
    selectedClip?.digitalHuman?.pipPosition ?? 'bottom-right'
  );
  const [frameShape, setFrameShape] = useState<DigitalHumanFrameShape>(
    selectedClip?.digitalHuman?.frameShape ?? 'rounded-card'
  );
  const [pipScale, setPipScale] = useState<number>(
    selectedClip?.digitalHuman?.pipScale ?? 0.3
  );
  const [showLiveWaveRing, setShowLiveWaveRing] = useState<boolean>(
    selectedClip?.digitalHuman?.showLiveWaveRing ?? true
  );
  const [insertTarget, setInsertTarget] = useState<DigitalHumanInsertTarget>('after');
  const [insertTransition, setInsertTransition] = useState<TransitionType>('crossfade');
  const [fullClipDuration, setFullClipDuration] = useState<number>(3.5);
  const [syncDrivenVoiceOnEmbed, setSyncDrivenVoiceOnEmbed] = useState<boolean>(true);
  const [embedNotice, setEmbedNotice] = useState<string | null>(null);

  const anchorMediaInputRef = useRef<HTMLInputElement | null>(null);
  const voiceAudioInputRef = useRef<HTMLInputElement | null>(null);
  const miniCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const poseBlendRef = useRef<{
    from: DigitalHumanActionId;
    to: DigitalHumanActionId;
    startPerf: number;
    durationSec: number;
  } | null>(null);

  const availableAnchors: DigitalHumanProfile[] = [
    ...digitalHumans,
    ...BUILTIN_DIGITAL_HUMAN_PRESETS.filter(
      (p) => !digitalHumans.some((d) => d.id === p.id)
    ).map(createDigitalHumanPresetProfile),
  ];

  const activeAnchor =
    availableAnchors.find((a) => a.id === activeAnchorId) ?? availableAnchors[0];

  const selectedClipIndex = selectedClip ? clips.findIndex((c) => c.id === selectedClip.id) : -1;
  const prevTimelineAction =
    selectedClipIndex > 0 ? clips[selectedClipIndex - 1]?.digitalHuman?.action ?? null : null;

  useEffect(() => {
    if (selectedClip?.digitalHuman) {
      setPipPosition(selectedClip.digitalHuman.pipPosition);
      setFrameShape(selectedClip.digitalHuman.frameShape);
      setPipScale(selectedClip.digitalHuman.pipScale);
      setShowLiveWaveRing(selectedClip.digitalHuman.showLiveWaveRing);
      if (selectedClip.digitalHuman.action) {
        setSelectedAction(selectedClip.digitalHuman.action);
      }
      if (selectedClip.digitalHuman.blendFromAction) {
        setPreviousAction(selectedClip.digitalHuman.blendFromAction);
      }
      if (typeof selectedClip.digitalHuman.actionIntensity === 'number') {
        setActionIntensity(selectedClip.digitalHuman.actionIntensity);
      }
      if (typeof selectedClip.digitalHuman.actionBlendDuration === 'number') {
        setActionBlendDuration(selectedClip.digitalHuman.actionBlendDuration);
      }
      if (typeof selectedClip.digitalHuman.emotionMatchEnabled === 'boolean') {
        setEmotionMatchEnabled(selectedClip.digitalHuman.emotionMatchEnabled);
      }
      if (selectedClip.digitalHuman.emotion) {
        setSelectedEmotion(selectedClip.digitalHuman.emotion);
      }
      if (selectedClip.digitalHuman.facialMuscles) {
        setFacialMuscles(clampFacialMuscles(selectedClip.digitalHuman.facialMuscles));
      }
      if (selectedClip.digitalHuman.cameraMotion) {
        setCameraMotion(clampCameraMotion(selectedClip.digitalHuman.cameraMotion));
      } else {
        setCameraMotion(getDigitalHumanCameraPreset('none').motion);
      }
      if (selectedClip.digitalHuman.targetLanguage) {
        setMultilingualEnabled(true);
        setTargetLanguage(selectedClip.digitalHuman.targetLanguage);
      }
      if (selectedClip.digitalHuman.translatedScript) {
        setEditableTranslatedScript(selectedClip.digitalHuman.translatedScript);
      }
      if (selectedClip.digitalHuman.phonemeAlignment) {
        setPhonemeAlignment(selectedClip.digitalHuman.phonemeAlignment);
        setPhonemeAlignEnabled(selectedClip.digitalHuman.phonemeAlignment.enabled);
        setPhonemeOffsetMs(selectedClip.digitalHuman.phonemeAlignment.keyframeOffsetMs);
        setPhonemeOnsetAdvanceMs(selectedClip.digitalHuman.phonemeAlignment.onsetAdvanceMs);
      }
    }
  }, [selectedClip?.id, selectedClip?.digitalHuman]);

  // Instant script/context action recommendation (tracks brief, subtitles, scriptText, and selected clip)
  const heuristicActionSuggestion = useMemo(
    () =>
      analyzeScriptForActionSuggestions({
        brief,
        scriptText,
        clips,
        subtitles,
        selectedClipId: selectedClip?.id ?? null,
      }),
    [brief, scriptText, clips, subtitles, selectedClip?.id]
  );

  // Clear stale AI override when user edits scriptText or brief substantially
  useEffect(() => {
    setAiActionSuggestion(null);
    setActionSuggestNote(null);
  }, [brief, scriptText, platform]);

  const activeActionRecommendation = useMemo<DigitalHumanActionRecommendation>(() => {
    if (!aiActionSuggestion) return heuristicActionSuggestion;
    if (selectedClip?.id) {
      const clipRec = aiActionSuggestion.clipSuggestions.find(
        (s) => s.clipId === selectedClip.id
      );
      if (clipRec) {
        return {
          ...aiActionSuggestion,
          primaryAction: clipRec.recommendedAction,
          contextStage: clipRec.contextStage,
          reason: clipRec.reason,
        };
      }
    }
    return aiActionSuggestion;
  }, [aiActionSuggestion, heuristicActionSuggestion, selectedClip?.id]);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearInterval(timerRef.current);
      if (recorderRef.current && recorderRef.current.state === 'recording') {
        try {
          recorderRef.current.stop();
        } catch {
          // ignore
        }
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
        previewAudioRef.current = null;
      }
    };
  }, []);

  // Mini Stage Live Animation Loop (responds in real time to selectedAction + emotion facial muscles + audio)
  useEffect(() => {
    let rafId = 0;
    const startPerf = performance.now();
    const renderLoop = (now: number) => {
      const canvas = miniCanvasRef.current;
      if (canvas && activeAnchor) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const t = (now - startPerf) / 1000;
          const act = isPreviewingMiniStage
            ? 0.48 + 0.45 * Math.abs(Math.sin(t * 11.5) * Math.cos(t * 4.3))
            : 0.24 + 0.14 * Math.abs(Math.sin(t * 3.6));

          let blendFrom: DigitalHumanActionId | undefined;
          let blendW = 1;
          const activeTransition = poseBlendRef.current;
          if (
            activeTransition &&
            activeTransition.to === selectedAction &&
            activeTransition.from !== selectedAction &&
            activeTransition.durationSec > 0.02
          ) {
            const elapsed = (now - activeTransition.startPerf) / 1000;
            if (elapsed < activeTransition.durationSec) {
              const rawT = Math.max(0, Math.min(1, elapsed / activeTransition.durationSec));
              blendFrom = activeTransition.from;
              blendW = rawT * rawT * (3 - 2 * rawT);
            } else {
              poseBlendRef.current = null;
            }
          }

          const activeAudioSampleTime =
            isPreviewingMiniStage &&
            previewAudioRef.current &&
            !previewAudioRef.current.paused
              ? previewAudioRef.current.currentTime
              : undefined;

          renderDigitalHumanMiniStage(
            ctx,
            canvas.width,
            canvas.height,
            activeAnchor.avatarUrl,
            activeAnchor.accentColor || '#fb7185',
            t,
            act,
            selectedAction,
            emotionMatchEnabled ? selectedEmotion : 'neutral',
            emotionMatchEnabled ? facialMuscles : undefined,
            cameraMotion,
            blendFrom,
            blendW,
            phonemeAlignEnabled ? phonemeAlignment ?? undefined : undefined,
            activeAudioSampleTime
          );
        }
      }
      rafId = requestAnimationFrame(renderLoop);
    };
    rafId = requestAnimationFrame(renderLoop);
    return () => cancelAnimationFrame(rafId);
  }, [
    activeAnchor,
    isPreviewingMiniStage,
    selectedAction,
    emotionMatchEnabled,
    selectedEmotion,
    facialMuscles,
    cameraMotion,
    phonemeAlignEnabled,
    phonemeAlignment,
  ]);


  const handleToggleMicRecord = async () => {
    setVoiceRecordError(null);
    if (isRecordingVoice) {
      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
      if (recorderRef.current && recorderRef.current.state === 'recording') {
        recorderRef.current.stop();
      }
      setIsRecordingVoice(false);
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setVoiceRecordError('当前浏览器不支持麦克风录制，请点击右侧上传本地音频文件。');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;

      const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((m) =>
        MediaRecorder.isTypeSupported(m)
      );
      const recorder = mime
        ? new MediaRecorder(stream, { mimeType: mime })
        : new MediaRecorder(stream);

      const chunks: BlobPart[] = [];
      const startedAt = performance.now();
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        const dur = Math.max(0.8, Number(((performance.now() - startedAt) / 1000).toFixed(2)));
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        if (blob.size < 250) {
          setVoiceRecordError('录音时长过短，请靠近麦克风重试。');
          return;
        }
        try {
          const b64 = await blobToBase64(blob);
          const payload = {
            base64: b64,
            mimeType: blob.type || 'audio/webm',
            durationSec: dur,
          };
          setRecordedVoice(payload);
          setDrivenAudio({
            audioBase64: b64,
            mimeType: payload.mimeType,
            durationSec: dur,
            text: scriptText.trim() || `主播原声口播 (${dur.toFixed(1)}s)`,
          });
          setFullClipDuration(Number(Math.max(2, dur + 0.2).toFixed(1)));
          setDriveMode('recorded-audio');
          if (emotionMatchEnabled) {
            void handleAnalyzeVoiceEmotion(b64, payload.mimeType, scriptText.trim());
          }
          if (phonemeAlignEnabled) {
            void runClientPhonemeAnalysis(b64, payload.mimeType);
          }
        } catch {
          setVoiceRecordError('录音保存失败，请重试。');
        }
      };

      recorderRef.current = recorder;
      setRecordElapsedSec(0);
      setIsRecordingVoice(true);
      recorder.start(120);
      timerRef.current = window.setInterval(() => {
        setRecordElapsedSec((performance.now() - startedAt) / 1000);
      }, 100);
    } catch {
      setVoiceRecordError('未能获取麦克风权限，请允许浏览器访问麦克风或导入音频文件。');
    }
  };

  const handleUploadDriveAudioFile = async (file: File) => {
    setVoiceRecordError(null);
    try {
      const b64 = await blobToBase64(file);
      const probeUrl = URL.createObjectURL(file);
      const probe = new Audio(probeUrl);
      const dur = await new Promise<number>((resolve) => {
        probe.onloadedmetadata = () => {
          const d = Number((probe.duration || 3.5).toFixed(2));
          URL.revokeObjectURL(probeUrl);
          resolve(d);
        };
        probe.onerror = () => {
          URL.revokeObjectURL(probeUrl);
          resolve(3.5);
        };
      });
      const payload = {
        base64: b64,
        mimeType: file.type || 'audio/wav',
        durationSec: dur,
      };
      setRecordedVoice(payload);
      setDrivenAudio({
        audioBase64: b64,
        mimeType: payload.mimeType,
        durationSec: dur,
        text: scriptText.trim() || file.name.replace(/\.[^.]+$/, ''),
      });
      setFullClipDuration(Number(Math.max(2, dur + 0.2).toFixed(1)));
      setDriveMode('recorded-audio');
      if (emotionMatchEnabled) {
        void handleAnalyzeVoiceEmotion(b64, payload.mimeType, scriptText.trim());
      }
      if (phonemeAlignEnabled) {
        void runClientPhonemeAnalysis(b64, payload.mimeType);
      }
    } catch {
      setVoiceRecordError('音频文件读取失败，请检查文件格式。');
    }
  };


  const playAudioSnippet = (b64: string, mime = 'audio/wav') => {
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current = null;
    }
    const clean = b64.includes(',') ? b64.split(',')[1] : b64;
    const el = new Audio(`data:${mime};base64,${clean}`);
    previewAudioRef.current = el;
    setIsPreviewingMiniStage(true);
    el.onended = () => setIsPreviewingMiniStage(false);
    el.onerror = () => setIsPreviewingMiniStage(false);
    void el.play().catch(() => setIsPreviewingMiniStage(false));
  };

  const stopPreviewAudio = () => {
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current = null;
    }
    setIsPreviewingMiniStage(false);
  };

  const syncPhonemeAlignmentToSelectedClip = (
    nextProfile: DigitalHumanPhonemeAlignmentProfile
  ) => {
    if (selectedClip?.digitalHuman && onUpdateClipDigitalHumanPhonemeAlignment) {
      onUpdateClipDigitalHumanPhonemeAlignment(selectedClip.id, nextProfile);
    }
  };

  const runClientPhonemeAnalysis = async (
    audioBase64: string,
    mimeType = 'audio/wav',
    overrideOffsetMs = phonemeOffsetMs,
    overrideOnsetMs = phonemeOnsetAdvanceMs,
    overrideEnabled = phonemeAlignEnabled
  ) => {
    setAnalyzingPhonemes(true);
    try {
      const profile = await analyzeAudioForPhonemeAlignment(audioBase64, mimeType, {
        enabled: overrideEnabled,
        keyframeOffsetMs: overrideOffsetMs,
        onsetAdvanceMs: overrideOnsetMs,
      });
      if (profile) {
        setPhonemeAlignment(profile);
        setPhonemeNotice(profile.spectralSummary);
        syncPhonemeAlignmentToSelectedClip(profile);
      }
      return profile;
    } catch {
      return null;
    } finally {
      setAnalyzingPhonemes(false);
    }
  };



  const buildDigitalHumanClipConfig = (
    mode: 'pip-overlay' | 'full-scene'
  ): DigitalHumanClipConfig => ({
    profileId: activeAnchor.id,
    profileName: activeAnchor.name,
    avatarAssetId: activeAnchor.avatarAssetId,
    avatarUrl: activeAnchor.avatarUrl,
    avatarMediaType: activeAnchor.avatarMediaType,
    mode,
    pipPosition,
    pipScale,
    frameShape,
    speechIntensity: 1.1,
    showLiveWaveRing,
    action: selectedAction,
    actionIntensity,
    actionBlendDuration,
    blendFromAction:
      prevTimelineAction ??
      (previousAction && previousAction !== selectedAction ? previousAction : undefined),
    emotionMatchEnabled,
    emotion: selectedEmotion,
    facialMuscles,
    emotionSummary: emotionAnalysis?.toneSummary,
    cameraMotion,
    spokenScript: scriptText.trim() || undefined,
    targetLanguage: multilingualEnabled ? targetLanguage : undefined,
    translatedScript: multilingualEnabled
      ? editableTranslatedScript.trim() || multilingualResult?.translatedScript || undefined
      : undefined,
    phonemeAlignment: phonemeAlignment
      ? { ...phonemeAlignment, enabled: phonemeAlignEnabled }
      : phonemeAlignEnabled
        ? {
            enabled: true,
            fps: 30,
            melBands: 24,
            keyframeOffsetMs: phonemeOffsetMs,
            onsetAdvanceMs: phonemeOnsetAdvanceMs,
            dominantVisemes: ['aa', 'eh', 'iy'],
            spectralSummary: '已开启精准音素对齐，将在下次语音合成或重分析时生成完整梅尔频谱关键帧。',
            formantCentroidHz: 1120,
            frames: [],
            analyzedAt: new Date().toISOString(),
          }
        : undefined,
    accentColor: activeAnchor.accentColor || '#fb7185',
  });

  const handleTogglePhonemeAlign = () => {
    const nextEnabled = !phonemeAlignEnabled;
    setPhonemeAlignEnabled(nextEnabled);
    if (phonemeAlignment) {
      const updated = realignPhonemeProfileOffset(
        phonemeAlignment,
        phonemeOffsetMs,
        phonemeOnsetAdvanceMs,
        nextEnabled
      );
      setPhonemeAlignment(updated);
      setPhonemeNotice(
        nextEnabled
          ? `已启用精准音素对齐（关键帧偏移 ${phonemeOffsetMs >= 0 ? '+' : ''}${phonemeOffsetMs}ms）。`
          : '已切换为标准声能脉冲口型驱动。'
      );
      syncPhonemeAlignmentToSelectedClip(updated);
    } else if (nextEnabled && drivenAudio?.audioBase64) {
      void runClientPhonemeAnalysis(
        drivenAudio.audioBase64,
        drivenAudio.mimeType,
        phonemeOffsetMs,
        phonemeOnsetAdvanceMs,
        true
      );
    } else {
      setPhonemeNotice(
        nextEnabled
          ? '已启用精准音素对齐：语音合成与录音时将自动提取 24-band 梅尔频谱口型关键帧。'
          : '已切换为标准声能脉冲口型驱动。'
      );
    }
  };

  const handlePhonemeOffsetChange = (nextOffsetMs: number) => {
    const clamped = Math.max(-45, Math.min(45, Math.round(nextOffsetMs)));
    setPhonemeOffsetMs(clamped);
    if (phonemeAlignment) {
      const updated = realignPhonemeProfileOffset(
        phonemeAlignment,
        clamped,
        phonemeOnsetAdvanceMs,
        phonemeAlignEnabled
      );
      setPhonemeAlignment(updated);
      syncPhonemeAlignmentToSelectedClip(updated);
    }
  };

  const handlePhonemeOnsetAdvanceChange = (nextOnsetMs: number) => {
    const clamped = Math.max(0, Math.min(35, Math.round(nextOnsetMs)));
    setPhonemeOnsetAdvanceMs(clamped);
    if (phonemeAlignment) {
      const updated = realignPhonemeProfileOffset(
        phonemeAlignment,
        phonemeOffsetMs,
        clamped,
        phonemeAlignEnabled
      );
      setPhonemeAlignment(updated);
      syncPhonemeAlignmentToSelectedClip(updated);
    }
  };

  const handleCalibratePhonemesFromCurrentAudio = async () => {
    const b64 =
      drivenAudio?.audioBase64 ??
      recordedVoice?.base64 ??
      activeAnchor?.sampleAudioBase64;
    const mime =
      drivenAudio?.mimeType ??
      recordedVoice?.mimeType ??
      activeAnchor?.sampleAudioMimeType ??
      'audio/wav';
    if (!b64) {
      setPhonemeNotice('请先合成数字人台词、多语言配音或录制/导入音频，再执行梅尔频谱音素对齐分析。');
      return;
    }
    setPhonemeAlignEnabled(true);
    await runClientPhonemeAnalysis(b64, mime, phonemeOffsetMs, phonemeOnsetAdvanceMs, true);
  };

  const syncCameraMotionToSelectedClip = (next: DigitalHumanCameraMotion) => {
    if (selectedClip?.digitalHuman && onUpdateClipDigitalHumanCameraMotion) {
      onUpdateClipDigitalHumanCameraMotion(selectedClip.id, next);
    }
  };

  const handleToggleCameraMotion = () => {
    const nextEnabled = !cameraMotion.enabled;
    const basePreset =
      nextEnabled && cameraMotion.preset === 'none'
        ? getDigitalHumanCameraPreset('push-in').motion
        : { ...cameraMotion, enabled: nextEnabled };
    const clamped = clampCameraMotion(basePreset);
    setCameraMotion(clamped);
    setCameraNotice(
      clamped.enabled
        ? `已开启「${getDigitalHumanCameraPreset(clamped.preset).label}」运镜增强，将实时应用至数字人视频层。`
        : '已切换为固定机位渲染。'
    );
    syncCameraMotionToSelectedClip(clamped);
  };

  const handleSelectCameraPreset = (presetId: DigitalHumanCameraPresetId) => {
    const preset = getDigitalHumanCameraPreset(presetId);
    const next = clampCameraMotion(preset.motion);
    setCameraMotion(next);
    setCameraNotice(
      next.enabled
        ? `已应用「${preset.label}」运镜预设${selectedClip?.digitalHuman ? `至片段「${selectedClip.label}」` : ''}。`
        : '已恢复固定机位，不附加推拉抖动变换。'
    );
    syncCameraMotionToSelectedClip(next);
  };

  const handleCameraParamChange = (
    key: 'dollyAmount' | 'panSpeed' | 'shakeIntensity' | 'shakeFrequency',
    value: number
  ) => {
    const next = clampCameraMotion({
      ...cameraMotion,
      enabled: true,
      [key]: value,
    });
    setCameraMotion(next);
    syncCameraMotionToSelectedClip(next);
  };

  const syncEmotionToSelectedClip = (
    enabled: boolean,
    emotion: DigitalHumanEmotionId,
    muscles: DigitalHumanFacialMuscles,
    summary?: string
  ) => {
    if (selectedClip?.digitalHuman) {
      onUpdateClipDigitalHumanEmotion(selectedClip.id, {
        emotionMatchEnabled: enabled,
        emotion,
        facialMuscles: muscles,
        emotionSummary: summary,
      });
    }
  };

  const handleAnalyzeVoiceEmotion = async (
    overrideAudioB64?: string,
    overrideMimeType?: string,
    overrideScript?: string
  ) => {
    const audioB64 =
      overrideAudioB64 ??
      drivenAudio?.audioBase64 ??
      recordedVoice?.base64 ??
      activeAnchor?.sampleAudioBase64;
    const audioMime =
      overrideMimeType ??
      drivenAudio?.mimeType ??
      recordedVoice?.mimeType ??
      activeAnchor?.sampleAudioMimeType ??
      'audio/wav';
    const text = overrideScript ?? drivenAudio?.text ?? scriptText.trim();

    setAnalyzingEmotion(true);
    setEmotionNote(null);

    const localBaseline = await analyzeAudioProsodyForEmotion(audioB64, audioMime, text);
    let finalResult: DigitalHumanEmotionAnalysis = localBaseline;

    try {
      const res = await apiFetch('/api/digital-human/analyze-emotion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioBase64: audioB64,
          mimeType: audioMime,
          scriptText: text,
          prosodyMetrics: localBaseline.prosodyMetrics,
          anchorName: activeAnchor?.name,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.emotion && data?.muscles) {
          finalResult = {
            emotion: data.emotion as DigitalHumanEmotionId,
            emotionLabel:
              data.emotionLabel ||
              getDigitalHumanEmotionPreset(data.emotion as DigitalHumanEmotionId).label,
            confidence: Number(data.confidence ?? localBaseline.confidence),
            toneSummary: data.toneSummary || localBaseline.toneSummary,
            prosodyMetrics: localBaseline.prosodyMetrics,
            muscles: clampFacialMuscles(data.muscles),
            analyzedAt: data.analyzedAt || new Date().toISOString(),
          };
        }
      } else {
        const errData = await res.json().catch(() => null);
        if (errData?.error) {
          setEmotionNote(String(errData.error));
        }
      }
    } catch {
      // Keep localBaseline cleanly
    }

    setEmotionMatchEnabled(true);
    setSelectedEmotion(finalResult.emotion);
    setFacialMuscles(finalResult.muscles);
    setEmotionAnalysis(finalResult);
    syncEmotionToSelectedClip(true, finalResult.emotion, finalResult.muscles, finalResult.toneSummary);
    setAnalyzingEmotion(false);
  };


  const resolvedAudioPayload =
    syncDrivenVoiceOnEmbed && drivenAudio
      ? {
          audioBase64: drivenAudio.audioBase64,
          mimeType: drivenAudio.mimeType,
          durationSec: drivenAudio.durationSec,
          text: drivenAudio.text || scriptText.trim() || activeAnchor.name,
          baseVoice: activeAnchor.baseVoice,
          clonedVoiceId: activeAnchor.clonedVoiceId,
          phonemeAlignment: phonemeAlignment
            ? { ...phonemeAlignment, enabled: phonemeAlignEnabled }
            : undefined,
        }
      : undefined;

  const handleEmbedPip = () => {
    if (!selectedClip || !activeAnchor) return;
    const cfg = buildDigitalHumanClipConfig('pip-overlay');
    onEmbedDigitalHumanPip(selectedClip.id, cfg, resolvedAudioPayload);
    setEmbedNotice(
      `已将「${activeAnchor.name}」以画中画模式嵌入实拍片段「${selectedClip.label}」，实时播放与导出均生效！`
    );
  };

  const handleInsertFullScene = () => {
    if (!activeAnchor) return;
    const cfg = buildDigitalHumanClipConfig('full-scene');
    const dur = Math.max(
      1.5,
      Math.min(
        18,
        syncDrivenVoiceOnEmbed && drivenAudio
          ? Number((drivenAudio.durationSec + 0.2).toFixed(2))
          : fullClipDuration
      )
    );
    onInsertDigitalHumanClip({
      insertAt: insertTarget,
      config: cfg,
      duration: dur,
      transition: insertTransition,
      drivenAudio: resolvedAudioPayload,
    });
    setEmbedNotice(
      `已插入 ${dur.toFixed(1)}s 独立数字人主播镜头至视频轨道，实现与实拍素材无缝混剪！`
    );
  };


  return (
    <div className="space-y-4">
      {/* Engine Capability Notice */}
      <div className="rounded-lg border border-sky-500/35 bg-sky-950/20 px-3 py-2.5 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-semibold text-sky-200 flex items-center gap-1.5">
            <Film className="w-3.5 h-3.5 text-sky-400 shrink-0" />
            <span>当前引擎：照片/视频形象 + 画布口型动作</span>
          </span>
          <span className="px-1.5 py-0.5 rounded bg-sky-500/15 border border-sky-400/30 text-[9px] text-sky-200 shrink-0">
            实时画布驱动
          </span>
        </div>
        <p className="text-[10px] text-zinc-300/90 leading-relaxed">
          通过画布实时叠加嘴部音素开合、表情肌肉与姿态手势实现口播同步，并非 Veo 生成的写实口播视频；上传的形象会自动压缩转为持久数据，刷新页面仍会保留。
        </p>
      </div>

      <CloneSection
        anchorName={anchorName}
        setAnchorName={setAnchorName}
        styleHint={styleHint}
        setStyleHint={setStyleHint}
        selectedAssetForClone={selectedAssetForClone}
        setSelectedAssetForClone={setSelectedAssetForClone}
        uploadedPreviewUrl={uploadedPreviewUrl}
        setUploadedPreviewUrl={setUploadedPreviewUrl}
        uploadedMediaType={uploadedMediaType}
        setUploadedMediaType={setUploadedMediaType}
        selectedVoiceBinding={selectedVoiceBinding}
        setSelectedVoiceBinding={setSelectedVoiceBinding}
        cloningAnchor={cloningAnchor}
        setCloningAnchor={setCloningAnchor}
        cloneMessage={cloneMessage}
        setCloneMessage={setCloneMessage}
        recordedVoice={recordedVoice}
        isRecordingVoice={isRecordingVoice}
        recordElapsedSec={recordElapsedSec}
        voiceRecordError={voiceRecordError}
        anchorMediaInputRef={anchorMediaInputRef}
        voiceAudioInputRef={voiceAudioInputRef}
        handleToggleMicRecord={handleToggleMicRecord}
        handleUploadDriveAudioFile={handleUploadDriveAudioFile}
        assets={assets}
        clonedVoices={clonedVoices}
        activeVoiceoverVoice={activeVoiceoverVoice}
        onUploadMediaAssetForAnchor={onUploadMediaAssetForAnchor}
        scriptText={scriptText}
        setScriptText={setScriptText}
        selectedAction={selectedAction}
        actionBlendDuration={actionBlendDuration}
        selectedEmotion={selectedEmotion}
        facialMuscles={facialMuscles}
        cameraMotion={cameraMotion}
        phonemeAlignEnabled={phonemeAlignEnabled}
        phonemeOffsetMs={phonemeOffsetMs}
        onSaveDigitalHuman={onSaveDigitalHuman}
        setActiveAnchorId={setActiveAnchorId}
        setDrivenAudio={setDrivenAudio}
      />

      {/* 2. Digital Human Roster + Speech Driving */}
      <div className="rounded-lg border border-zinc-800/90 bg-[#0B0D10] p-3 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
            <Volume2 className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            <span>2. 虚拟主播库与口播驱动</span>
          </span>
          <span className="text-[10px] font-mono-nums text-zinc-500">
            {availableAnchors.length} 个主播
          </span>
        </div>

        {/* Saved & Preset Anchor Selector */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {availableAnchors.map((anchor) => {
            const isSel = activeAnchor?.id === anchor.id;
            const isCustom = digitalHumans.some((d) => d.id === anchor.id);
            return (
              <div key={anchor.id} className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => setActiveAnchorId(anchor.id)}
                  className={`px-2 py-1.5 rounded-lg border flex items-center gap-1.5 text-[11px] transition-colors ${
                    isSel
                      ? 'border-cyan-400 bg-cyan-950/35 text-cyan-100'
                      : 'border-zinc-800 bg-[#11141B] text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <img
                    src={anchor.avatarUrl}
                    alt={anchor.name}
                    className="w-5 h-5 rounded-full object-cover shrink-0 border border-zinc-700"
                  />
                  <span className="max-w-[78px] truncate font-medium">{anchor.name}</span>
                </button>
                {isCustom && (
                  <button
                    type="button"
                    aria-label={`删除虚拟主播 ${anchor.name}`}
                    onClick={() => onDeleteDigitalHuman(anchor.id)}
                    className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-zinc-800 hover:bg-red-600 text-zinc-400 hover:text-white flex items-center justify-center border border-zinc-700"
                  >
                    <Trash2 className="w-2.5 h-2.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Live Mini Stage + Active Anchor Persona Card */}
        {activeAnchor && (
          <div className="rounded-lg border border-zinc-800 bg-[#11141B] p-2.5 space-y-2">
            <div className="flex items-center gap-2.5">
              <canvas
                ref={miniCanvasRef}
                width={96}
                height={120}
                className="w-16 h-20 rounded-md border border-zinc-700/80 shrink-0 bg-black"
              />
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-xs font-semibold text-zinc-100 truncate">
                    {activeAnchor.name}
                  </span>
                  <span className="text-[9px] font-mono-nums text-cyan-300 shrink-0">
                    {activeAnchor.baseVoice}
                  </span>
                </div>
                <p className="text-[10px] text-zinc-400 leading-snug line-clamp-2">
                  {activeAnchor.personaSummary}
                </p>
                <div className="flex flex-wrap gap-1 pt-0.5">
                  {activeAnchor.anchorStyleTags.slice(0, 3).map((tag) => (
                    <span
                      key={tag}
                      className="px-1.5 py-0.5 rounded bg-zinc-800 text-[9px] text-zinc-300"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Disabled Veo Photorealistic Talking Video Action */}
            <div className="pt-1.5 border-t border-zinc-800/80 flex items-center justify-between gap-2">
              <span className="text-[10px] text-zinc-500 leading-tight">
                Veo 写实口播视频模型适配中
              </span>
              <button
                type="button"
                disabled
                aria-disabled="true"
                title="Veo 写实口播视频生成即将接入，当前请使用下方画布口型与动作驱动"
                className="px-2.5 py-1 rounded-md border border-zinc-700/80 bg-zinc-900/80 text-[11px] font-medium text-zinc-400 cursor-not-allowed opacity-75 flex items-center gap-1.5 shrink-0"
              >
                <Film className="w-3 h-3 text-zinc-500" />
                <span>生成说话视频</span>
                <span className="px-1 py-0.2 rounded bg-zinc-800 border border-zinc-700 text-[9px] text-amber-300/90">
                  即将接入
                </span>
              </button>
            </div>
          </div>
        )}

        <EmotionActionSection
          selectedClip={selectedClip}
          clips={clips}
          subtitles={subtitles}
          platform={platform}
          brief={brief}
          scriptText={scriptText}
          selectedAction={selectedAction}
          setSelectedAction={setSelectedAction}
          previousAction={previousAction}
          setPreviousAction={setPreviousAction}
          actionIntensity={actionIntensity}
          setActionIntensity={setActionIntensity}
          actionBlendDuration={actionBlendDuration}
          setActionBlendDuration={setActionBlendDuration}
          actionSyncNotice={actionSyncNotice}
          setActionSyncNotice={setActionSyncNotice}
          autoActionSuggestEnabled={autoActionSuggestEnabled}
          setAutoActionSuggestEnabled={setAutoActionSuggestEnabled}
          setAiActionSuggestion={setAiActionSuggestion}
          analyzingActionSuggestion={analyzingActionSuggestion}
          setAnalyzingActionSuggestion={setAnalyzingActionSuggestion}
          actionSuggestNote={actionSuggestNote}
          setActionSuggestNote={setActionSuggestNote}
          activeActionRecommendation={activeActionRecommendation}
          prevTimelineAction={prevTimelineAction}
          emotionMatchEnabled={emotionMatchEnabled}
          setEmotionMatchEnabled={setEmotionMatchEnabled}
          selectedEmotion={selectedEmotion}
          setSelectedEmotion={setSelectedEmotion}
          facialMuscles={facialMuscles}
          setFacialMuscles={setFacialMuscles}
          analyzingEmotion={analyzingEmotion}
          emotionAnalysis={emotionAnalysis}
          emotionNote={emotionNote}
          setEmotionNote={setEmotionNote}
          poseBlendRef={poseBlendRef}
          syncEmotionToSelectedClip={syncEmotionToSelectedClip}
          handleAnalyzeVoiceEmotion={handleAnalyzeVoiceEmotion}
          onUpdateClipDigitalHumanAction={onUpdateClipDigitalHumanAction}
          onBatchApplyDigitalHumanActions={onBatchApplyDigitalHumanActions}
        />

        {/* Camera Motion Enhancement (Dolly Push/Pull, Pan Sweep, Handheld Shake) */}
        <div className="rounded-lg border border-sky-500/30 bg-[#11141B] p-2.5 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <span className="text-[11px] font-semibold text-sky-200 flex items-center gap-1.5">
                <Move className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                <span>运镜增强（数字人视频层）</span>
              </span>
              <span className="block text-[10px] text-zinc-400 mt-0.5">
                配置推拉、平移或手持抖动参数并自动渲染至视频层
              </span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={cameraMotion.enabled}
              aria-label="运镜增强"
              onClick={handleToggleCameraMotion}
              className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors ${
                cameraMotion.enabled
                  ? 'bg-sky-500 border-sky-400'
                  : 'bg-zinc-800 border-zinc-700'
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                  cameraMotion.enabled ? 'translate-x-4' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-1">
            {DIGITAL_HUMAN_CAMERA_PRESETS.map((preset) => {
              const isSel =
                cameraMotion.preset === preset.id &&
                (preset.id === 'none' ? !cameraMotion.enabled : cameraMotion.enabled);
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handleSelectCameraPreset(preset.id)}
                  title={preset.summary}
                  className={`py-1.5 px-1.5 rounded border text-left transition-colors ${
                    isSel
                      ? 'border-sky-400 bg-sky-500/20 text-sky-100'
                      : 'border-zinc-800 bg-[#0B0D10] text-zinc-300 hover:border-zinc-600'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[10px] font-semibold truncate">{preset.label}</span>
                    <span
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ backgroundColor: preset.badgeColor }}
                    />
                  </div>
                  <span className="block text-[8px] font-mono-nums text-zinc-400 mt-0.5 truncate">
                    {preset.englishTag}
                  </span>
                </button>
              );
            })}
          </div>

          <p className="text-[10px] text-zinc-400 leading-snug">
            {getDigitalHumanCameraPreset(cameraMotion.preset).summary}
          </p>

          {cameraMotion.enabled && (
            <div className="space-y-1.5 pt-1.5 border-t border-zinc-800/80">
              <div className="grid grid-cols-2 gap-x-2.5 gap-y-1.5">
                <div>
                  <div className="flex justify-between text-[9px] text-zinc-400">
                    <span>相机推拉 (Dolly)</span>
                    <span className="font-mono-nums text-sky-300">
                      {cameraMotion.dollyAmount > 0
                        ? `推进 +${Math.round(cameraMotion.dollyAmount * 100)}%`
                        : cameraMotion.dollyAmount < 0
                          ? `拉远 ${Math.round(cameraMotion.dollyAmount * 100)}%`
                          : '0%'}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={-0.25}
                    max={0.35}
                    step={0.02}
                    value={cameraMotion.dollyAmount}
                    onChange={(e) => handleCameraParamChange('dollyAmount', Number(e.target.value))}
                    className="w-full accent-sky-400"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-[9px] text-zinc-400">
                    <span>横向平移 (Pan)</span>
                    <span className="font-mono-nums text-sky-300">
                      {cameraMotion.panSpeed > 0
                        ? `右移 +${cameraMotion.panSpeed.toFixed(2)}`
                        : cameraMotion.panSpeed < 0
                          ? `左移 ${cameraMotion.panSpeed.toFixed(2)}`
                          : '0.00'}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={-1.0}
                    max={1.0}
                    step={0.05}
                    value={cameraMotion.panSpeed}
                    onChange={(e) => handleCameraParamChange('panSpeed', Number(e.target.value))}
                    className="w-full accent-sky-400"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-[9px] text-zinc-400">
                    <span>抖动幅度 (Shake)</span>
                    <span className="font-mono-nums text-sky-300">
                      {Math.round(cameraMotion.shakeIntensity * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1.0}
                    step={0.04}
                    value={cameraMotion.shakeIntensity}
                    onChange={(e) => handleCameraParamChange('shakeIntensity', Number(e.target.value))}
                    className="w-full accent-sky-400"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-[9px] text-zinc-400">
                    <span>抖动节奏频率</span>
                    <span className="font-mono-nums text-sky-300">
                      {cameraMotion.shakeFrequency.toFixed(1)}x
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.5}
                    max={3.0}
                    step={0.1}
                    value={cameraMotion.shakeFrequency}
                    onChange={(e) => handleCameraParamChange('shakeFrequency', Number(e.target.value))}
                    className="w-full accent-sky-400"
                  />
                </div>
              </div>
            </div>
          )}

          {cameraNotice && (
            <div className="rounded border border-sky-500/35 bg-sky-950/25 px-2 py-1 text-[10px] text-sky-200 leading-snug">
              {cameraNotice}
            </div>
          )}
        </div>

        {/* Precise Mel-Spectrum Phoneme Alignment Card */}
        <div
          id="dh-phoneme-alignment-card"
          className="rounded-lg border border-emerald-500/25 bg-[#12171D] p-2.5 space-y-2"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <AudioLines className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="text-[11px] font-medium text-emerald-200">
                精准音素对齐（梅尔频谱口型增强）
              </span>
            </div>
            <button
              id="dh-phoneme-align-toggle"
              type="button"
              role="switch"
              aria-label="精准音素对齐"
              aria-checked={phonemeAlignEnabled}
              onClick={handleTogglePhonemeAlign}
              className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors ${
                phonemeAlignEnabled ? 'bg-emerald-500' : 'bg-zinc-700'
              }`}
            >
              <span
                className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                  phonemeAlignEnabled ? 'translate-x-3.5' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>

          <p className="text-[10px] text-zinc-400 leading-relaxed">
            在语音合成与配音时分析音频 24-band 梅尔频谱能量与质心特征，自动识别 <span className="text-emerald-300">AA / IY / OO / SZ</span> 音素视位并微调嘴部开合关键帧偏移。
          </p>

          {phonemeAlignEnabled && (
            <div className="space-y-2 pt-0.5">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded border border-zinc-800 bg-[#0D1016] px-2 py-1.5 space-y-1">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-zinc-300">关键帧时间偏移</span>
                    <span className="font-mono text-emerald-300">
                      {phonemeOffsetMs >= 0 ? `+${phonemeOffsetMs}` : phonemeOffsetMs} ms
                    </span>
                  </div>
                  <input
                    id="dh-phoneme-offset-slider"
                    type="range"
                    min={-45}
                    max={45}
                    step={1}
                    value={phonemeOffsetMs}
                    onChange={(e) => handlePhonemeOffsetChange(Number(e.target.value))}
                    className="w-full accent-emerald-400"
                  />
                  <div className="flex items-center justify-between text-[9px] text-zinc-500">
                    <span>超前 -45ms</span>
                    <span>滞后 +45ms</span>
                  </div>
                </div>

                <div className="rounded border border-zinc-800 bg-[#0D1016] px-2 py-1.5 space-y-1">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-zinc-300">协同提前张口</span>
                    <span className="font-mono text-emerald-300">+{phonemeOnsetAdvanceMs} ms</span>
                  </div>
                  <input
                    id="dh-phoneme-onset-slider"
                    type="range"
                    min={0}
                    max={35}
                    step={1}
                    value={phonemeOnsetAdvanceMs}
                    onChange={(e) => handlePhonemeOnsetAdvanceChange(Number(e.target.value))}
                    className="w-full accent-emerald-400"
                  />
                  <div className="flex items-center justify-between text-[9px] text-zinc-500">
                    <span>0ms 零提前</span>
                    <span>35ms 强协同</span>
                  </div>
                </div>
              </div>

              <button
                id="dh-phoneme-reanalyze-btn"
                type="button"
                disabled={analyzingPhonemes}
                onClick={handleCalibratePhonemesFromCurrentAudio}
                className="w-full py-1.5 px-2.5 rounded border border-emerald-500/40 bg-emerald-500/15 hover:bg-emerald-500/25 disabled:opacity-50 text-[10px] font-medium text-emerald-100 flex items-center justify-center gap-1.5 transition-colors"
              >
                {analyzingPhonemes ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin" />
                    正在分析音频梅尔频谱特征...
                  </>
                ) : (
                  <>
                    <Sliders className="w-3 h-3" />
                    重新分析音轨梅尔频谱并校准关键帧
                  </>
                )}
              </button>

              {phonemeAlignment && phonemeAlignment.frames.length > 0 && (
                <div className="rounded border border-emerald-500/30 bg-emerald-950/20 p-2 space-y-1.5">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="font-medium text-emerald-200">
                      梅尔频谱音素曲线 · {phonemeAlignment.frames.length} 关键帧
                    </span>
                    <span className="font-mono text-[9px] text-emerald-300">
                      {phonemeAlignment.melBands} Mel-Bands / {phonemeAlignment.fps}fps
                    </span>
                  </div>

                  {/* Dominant Viseme Badges */}
                  <div className="flex flex-wrap gap-1">
                    {phonemeAlignment.dominantVisemes.map((v) => {
                      const meta = getVisemeDisplayMeta(v);
                      return (
                        <span
                          key={v}
                          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-mono border border-emerald-500/30 bg-[#0D1016] text-emerald-100"
                        >
                          <span
                            className="w-1.5 h-1.5 rounded-full"
                            style={{ backgroundColor: meta.badgeColor }}
                          />
                          {meta.shortTag} · {meta.label}
                        </span>
                      );
                    })}
                  </div>

                  {/* Compact Jaw-Open Envelope Visualizer */}
                  <div
                    className="h-7 rounded bg-[#0B0E14] border border-zinc-800/80 px-1 py-0.5 flex items-end gap-[1.5px] overflow-hidden"
                    title="梅尔频谱口型开合与音素关键帧波形"
                  >
                    {(() => {
                      const frames = phonemeAlignment.frames;
                      const step = Math.max(1, Math.floor(frames.length / 48));
                      const sampled = frames.filter((_, idx) => idx % step === 0).slice(0, 48);
                      return sampled.map((frame, idx) => {
                        const meta = getVisemeDisplayMeta(frame.viseme);
                        const hPct = Math.max(12, Math.round(frame.jawOpen * 100));
                        return (
                          <div
                            key={`${idx}-${frame.t}`}
                            className="flex-1 rounded-t-[1px] transition-all"
                            style={{
                              height: `${hPct}%`,
                              backgroundColor: meta.badgeColor,
                              opacity: 0.55 + Math.min(0.45, frame.jawOpen * 0.45),
                            }}
                            title={`${frame.t.toFixed(2)}s · ${meta.shortTag}(${meta.label}) · 张口 ${Math.round(frame.jawOpen * 100)}% · 偏移 ${frame.keyframeOffsetMs >= 0 ? '+' : ''}${frame.keyframeOffsetMs}ms`}
                          />
                        );
                      });
                    })()}
                  </div>
                </div>
              )}

              {phonemeNotice && (
                <div className="rounded border border-emerald-500/30 bg-emerald-950/20 px-2 py-1 text-[10px] text-emerald-200 leading-snug">
                  {phonemeNotice}
                </div>
              )}
            </div>
          )}
        </div>

        <DriveSection
          driveMode={driveMode}
          setDriveMode={setDriveMode}
          scriptText={scriptText}
          setScriptText={setScriptText}
          drivingSpeech={drivingSpeech}
          setDrivingSpeech={setDrivingSpeech}
          driveError={driveError}
          setDriveError={setDriveError}
          drivenAudio={drivenAudio}
          setDrivenAudio={setDrivenAudio}
          speechEstimate={speechEstimate}
          isRecordingVoice={isRecordingVoice}
          recordElapsedSec={recordElapsedSec}
          voiceRecordError={voiceRecordError}
          voiceAudioInputRef={voiceAudioInputRef}
          handleToggleMicRecord={handleToggleMicRecord}
          activeAnchor={activeAnchor}
          clonedVoices={clonedVoices}
          platform={platform}
          emotionMatchEnabled={emotionMatchEnabled}
          phonemeAlignEnabled={phonemeAlignEnabled}
          phonemeOffsetMs={phonemeOffsetMs}
          phonemeOnsetAdvanceMs={phonemeOnsetAdvanceMs}
          setFullClipDuration={setFullClipDuration}
          handleAnalyzeVoiceEmotion={handleAnalyzeVoiceEmotion}
          runClientPhonemeAnalysis={runClientPhonemeAnalysis}
          playAudioSnippet={playAudioSnippet}
          setPhonemeAlignment={setPhonemeAlignment}
          setPhonemeNotice={setPhonemeNotice}
          syncPhonemeAlignmentToSelectedClip={syncPhonemeAlignmentToSelectedClip}
          isPreviewingMiniStage={isPreviewingMiniStage}
          stopPreviewAudio={stopPreviewAudio}
          selectedClip={selectedClip}
          selectedClipStartTime={selectedClipStartTime}
          subtitles={subtitles}
        />

        <MultilingualSection
          multilingualEnabled={multilingualEnabled}
          setMultilingualEnabled={setMultilingualEnabled}
          targetLanguage={targetLanguage}
          setTargetLanguage={setTargetLanguage}
          synthesizingMultilingual={synthesizingMultilingual}
          setSynthesizingMultilingual={setSynthesizingMultilingual}
          multilingualResult={multilingualResult}
          setMultilingualResult={setMultilingualResult}
          editableTranslatedScript={editableTranslatedScript}
          setEditableTranslatedScript={setEditableTranslatedScript}
          applyTranslatedToCaption={applyTranslatedToCaption}
          setApplyTranslatedToCaption={setApplyTranslatedToCaption}
          multilingualError={multilingualError}
          setMultilingualError={setMultilingualError}
          scriptText={scriptText}
          setScriptText={setScriptText}
          drivenAudio={drivenAudio}
          setDrivenAudio={setDrivenAudio}
          activeAnchor={activeAnchor}
          recordedVoice={recordedVoice}
          clonedVoices={clonedVoices}
          selectedClip={selectedClip}
          subtitles={subtitles}
          platform={platform}
          emotionMatchEnabled={emotionMatchEnabled}
          phonemeAlignEnabled={phonemeAlignEnabled}
          phonemeOffsetMs={phonemeOffsetMs}
          phonemeOnsetAdvanceMs={phonemeOnsetAdvanceMs}
          setFullClipDuration={setFullClipDuration}
          handleAnalyzeVoiceEmotion={handleAnalyzeVoiceEmotion}
          runClientPhonemeAnalysis={runClientPhonemeAnalysis}
          playAudioSnippet={playAudioSnippet}
          selectedClipStartTime={selectedClipStartTime}
          setPhonemeAlignment={setPhonemeAlignment}
          setPhonemeNotice={setPhonemeNotice}
          syncPhonemeAlignmentToSelectedClip={syncPhonemeAlignmentToSelectedClip}
          isPreviewingMiniStage={isPreviewingMiniStage}
          stopPreviewAudio={stopPreviewAudio}
        />
      </div>

      {/* 3. Embed into Video Track for Seamless Mixed Editing */}
      <div className="rounded-lg border border-rose-500/35 bg-[#0B0D10] p-3 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-rose-200 flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-rose-400 shrink-0" />
            <span>3. 嵌入视频轨 · 实拍混剪</span>
          </span>
          <span className="text-[10px] font-mono-nums text-zinc-500">
            {clips.length} 镜头
          </span>
        </div>

        {/* Mode Tabs: PiP Overlay vs Standalone Full-Scene Cut */}
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={() => setEmbedMode('pip-overlay')}
            className={`py-1.5 px-2 rounded-md border text-[11px] font-medium transition-colors ${
              embedMode === 'pip-overlay'
                ? 'border-rose-500/80 bg-rose-500/15 text-rose-100'
                : 'border-zinc-800 bg-[#11141B] text-zinc-400 hover:text-zinc-200'
            }`}
          >
            画中画叠加实拍
          </button>
          <button
            type="button"
            onClick={() => setEmbedMode('full-scene')}
            className={`py-1.5 px-2 rounded-md border text-[11px] font-medium transition-colors ${
              embedMode === 'full-scene'
                ? 'border-rose-500/80 bg-rose-500/15 text-rose-100'
                : 'border-zinc-800 bg-[#11141B] text-zinc-400 hover:text-zinc-200'
            }`}
          >
            独立镜头切入混剪
          </button>
        </div>

        <label className="flex items-center gap-2 text-[11px] text-zinc-300 cursor-pointer">
          <input
            type="checkbox"
            checked={syncDrivenVoiceOnEmbed}
            onChange={(e) => setSyncDrivenVoiceOnEmbed(e.target.checked)}
            className="accent-rose-500"
          />
          <span>嵌入时自动同步口播音轨与对应字幕</span>
        </label>

        {embedMode === 'pip-overlay' ? (
          <div className="space-y-2.5">
            <p className="text-[10px] text-zinc-400 leading-relaxed">
              将虚拟主播以画中画形式嵌入实拍片段{selectedClip ? `「${selectedClip.label}」` : ''}，边展示实拍画面边同步出镜讲解。
            </p>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="dh-pip-pos" className="block text-[10px] text-zinc-400 mb-1">
                  画中画位置
                </label>
                <select
                  id="dh-pip-pos"
                  value={pipPosition}
                  onChange={(e) => setPipPosition(e.target.value as DigitalHumanPipPosition)}
                  className="w-full rounded bg-[#11141B] border border-zinc-800 px-2 py-1 text-[11px] text-zinc-200"
                >
                  <option value="bottom-right">右下角（推荐）</option>
                  <option value="bottom-left">左下角</option>
                  <option value="top-right">右上角</option>
                  <option value="top-left">左上角</option>
                </select>
              </div>
              <div>
                <label htmlFor="dh-pip-shape" className="block text-[10px] text-zinc-400 mb-1">
                  主播边框形态
                </label>
                <select
                  id="dh-pip-shape"
                  value={frameShape}
                  onChange={(e) => setFrameShape(e.target.value as DigitalHumanFrameShape)}
                  className="w-full rounded bg-[#11141B] border border-zinc-800 px-2 py-1 text-[11px] text-zinc-200"
                >
                  <option value="rounded-card">圆角演播卡</option>
                  <option value="circle">圆形口播框</option>
                  <option value="portrait-badge">竖屏半身框</option>
                </select>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between text-[10px] text-zinc-400 mb-1">
                <span>画中画占画面比例</span>
                <span className="font-mono-nums text-rose-300">{Math.round(pipScale * 100)}%</span>
              </div>
              <input
                type="range"
                min={0.22}
                max={0.44}
                step={0.02}
                value={pipScale}
                onChange={(e) => setPipScale(Number(e.target.value))}
                className="w-full accent-rose-500"
              />
            </div>

            <label className="flex items-center gap-2 text-[11px] text-zinc-300 cursor-pointer">
              <input
                type="checkbox"
                checked={showLiveWaveRing}
                onChange={(e) => setShowLiveWaveRing(e.target.checked)}
                className="accent-rose-500"
              />
              <span>说话时激活实时声浪光环动效</span>
            </label>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={!selectedClip}
                onClick={handleEmbedPip}
                className="flex-1 py-2 px-3 rounded-lg bg-rose-600 hover:bg-rose-500 disabled:opacity-45 text-xs font-semibold text-white flex items-center justify-center gap-1.5 transition-colors"
              >
                <Check className="w-3.5 h-3.5" />
                <span>
                  {selectedClip?.digitalHuman?.mode === 'pip-overlay'
                    ? '更新当前片段画中画'
                    : '嵌入当前实拍片段'}
                </span>
              </button>

              {selectedClip?.digitalHuman && (
                <button
                  type="button"
                  onClick={() => onRemoveClipDigitalHuman(selectedClip.id)}
                  className="py-2 px-2.5 rounded-lg border border-zinc-700 bg-[#11141B] hover:bg-red-950/50 hover:border-red-500/50 text-[11px] text-zinc-300 hover:text-red-200 transition-colors"
                >
                  移除
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-2.5">
            <p className="text-[10px] text-zinc-400 leading-relaxed">
              将虚拟主播作为独立主画面片段插入视频轨，与实拍镜头交替切镜，打造“主播开场/总结 + 实拍展示”混剪结构。
            </p>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="dh-insert-pos" className="block text-[10px] text-zinc-400 mb-1">
                  插入时间线位置
                </label>
                <select
                  id="dh-insert-pos"
                  value={insertTarget}
                  onChange={(e) => setInsertTarget(e.target.value as DigitalHumanInsertTarget)}
                  className="w-full rounded bg-[#11141B] border border-zinc-800 px-2 py-1 text-[11px] text-zinc-200"
                >
                  <option value="start">开头黄金3秒</option>
                  <option value="before">当前选中片段之前</option>
                  <option value="after">当前选中片段之后</option>
                  <option value="end">时间线末尾 (CTA)</option>
                </select>
              </div>
              <div>
                <label htmlFor="dh-insert-tr" className="block text-[10px] text-zinc-400 mb-1">
                  混剪入场转场
                </label>
                <select
                  id="dh-insert-tr"
                  value={insertTransition}
                  onChange={(e) => setInsertTransition(e.target.value as TransitionType)}
                  className="w-full rounded bg-[#11141B] border border-zinc-800 px-2 py-1 text-[11px] text-zinc-200"
                >
                  <option value="crossfade">平滑叠化 (Crossfade)</option>
                  <option value="zoom-punch">动感缩放切 (Zoom)</option>
                  <option value="whip-pan">横甩转场 (Whip Pan)</option>
                  <option value="cut">硬切 (Cut)</option>
                </select>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between text-[10px] text-zinc-400 mb-1">
                <span>数字人镜头时长 (秒)</span>
                <span className="font-mono-nums text-rose-300">
                  {syncDrivenVoiceOnEmbed && drivenAudio
                    ? `${(drivenAudio.durationSec + 0.2).toFixed(1)}s（自动匹配语音）`
                    : `${fullClipDuration.toFixed(1)}s`}
                </span>
              </div>
              <input
                type="range"
                min={1.5}
                max={12}
                step={0.2}
                disabled={Boolean(syncDrivenVoiceOnEmbed && drivenAudio)}
                value={
                  syncDrivenVoiceOnEmbed && drivenAudio
                    ? Math.min(12, Number((drivenAudio.durationSec + 0.2).toFixed(1)))
                    : fullClipDuration
                }
                onChange={(e) => setFullClipDuration(Number(e.target.value))}
                className="w-full accent-rose-500 disabled:opacity-50"
              />
            </div>

            <button
              type="button"
              onClick={handleInsertFullScene}
              className="w-full py-2 px-3 rounded-lg bg-rose-600 hover:bg-rose-500 text-xs font-semibold text-white flex items-center justify-center gap-1.5 transition-colors"
            >
              <Film className="w-3.5 h-3.5" />
              <span>插入视频轨道实现无缝混剪</span>
            </button>
          </div>
        )}

        {embedNotice && (
          <div className="rounded-md border border-emerald-500/40 bg-emerald-950/25 px-2.5 py-2 text-[11px] text-emerald-200 leading-snug">
            {embedNotice}
          </div>
        )}
      </div>
    </div>
  );
}
