import { useEffect, useRef, useState } from 'react';
import {
  AudioLines,
  Check,
  Film,
  ImagePlus,
  Layers,
  Loader2,
  Mic,
  Play,
  Sliders,
  Sparkles,
  Square,
  Trash2,
  Upload,
  UserCheck,
  Volume2,
} from 'lucide-react';
import type {
  ClonedVoiceProfile,
  DigitalHumanActionId,
  DigitalHumanClipConfig,
  DigitalHumanEmotionAnalysis,
  DigitalHumanEmotionId,
  DigitalHumanFacialMuscles,
  DigitalHumanFrameShape,
  DigitalHumanPipPosition,
  DigitalHumanProfile,
  MediaAsset,
  PlatformId,
  SubtitleSegment,
  TimelineClip,
  TransitionType,
  VoiceoverVoice,
} from '../types/studio';
import {
  analyzeAudioProsodyForEmotion,
  BUILTIN_DIGITAL_HUMAN_PRESETS,
  clampFacialMuscles,
  createDigitalHumanPresetProfile,
  DIGITAL_HUMAN_ACTION_TEMPLATES,
  DIGITAL_HUMAN_EMOTION_PRESETS,
  getDigitalHumanActionTemplate,
  getDigitalHumanEmotionPreset,
} from '../utils/digitalHumanAssets';
import { renderDigitalHumanMiniStage } from '../utils/canvasRenderer';

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

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      resolve(result.includes(',') ? result.split(',')[1] : result);
    };
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsDataURL(blob);
  });
}

async function captureVideoFrameBase64(videoUrl: string): Promise<string | null> {
  return new Promise((resolve) => {
    const vid = document.createElement('video');
    vid.crossOrigin = 'anonymous';
    vid.muted = true;
    vid.playsInline = true;
    const cleanup = () => {
      vid.src = '';
    };
    vid.onloadeddata = () => {
      try {
        vid.currentTime = Math.min(0.4, (vid.duration || 2) * 0.2);
      } catch {
        // ignore seek
      }
    };
    vid.onseeked = () => {
      try {
        const c = document.createElement('canvas');
        c.width = 360;
        c.height = 480;
        const ctx = c.getContext('2d');
        if (!ctx) {
          cleanup();
          resolve(null);
          return;
        }
        const vw = vid.videoWidth || 360;
        const vh = vid.videoHeight || 480;
        const scale = Math.max(c.width / vw, c.height / vh);
        const dw = vw * scale;
        const dh = vh * scale;
        ctx.drawImage(vid, (c.width - dw) / 2, (c.height - dh) / 2, dw, dh);
        const url = c.toDataURL('image/jpeg', 0.8);
        cleanup();
        resolve(url.includes(',') ? url.split(',')[1] : url);
      } catch {
        cleanup();
        resolve(null);
      }
    };
    vid.onerror = () => {
      cleanup();
      resolve(null);
    };
    vid.src = videoUrl;
  });
}

async function imageUrlToBase64(url: string): Promise<{ base64: string; mimeType: string } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = 360;
        c.height = 480;
        const ctx = c.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }
        const scale = Math.max(c.width / (img.naturalWidth || 360), c.height / (img.naturalHeight || 480));
        const dw = (img.naturalWidth || 360) * scale;
        const dh = (img.naturalHeight || 480) * scale;
        ctx.drawImage(img, (c.width - dw) / 2, (c.height - dh) / 2, dw, dh);
        const dataUrl = c.toDataURL('image/jpeg', 0.82);
        resolve({
          base64: dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl,
          mimeType: 'image/jpeg',
        });
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
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
  onUpdateClipDigitalHumanEmotion,
  onInsertDigitalHumanClip,
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
  } | null>(null);
  const [isPreviewingMiniStage, setIsPreviewingMiniStage] = useState(false);

  // Action Template Library State
  const [selectedAction, setSelectedAction] = useState<DigitalHumanActionId>(
    selectedClip?.digitalHuman?.action ?? digitalHumans[0]?.defaultAction ?? 'explain'
  );
  const [actionIntensity, setActionIntensity] = useState<number>(
    selectedClip?.digitalHuman?.actionIntensity ?? 1.0
  );
  const [actionSyncNotice, setActionSyncNotice] = useState<string | null>(null);

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

  const availableAnchors: DigitalHumanProfile[] = [
    ...digitalHumans,
    ...BUILTIN_DIGITAL_HUMAN_PRESETS.filter(
      (p) => !digitalHumans.some((d) => d.id === p.id)
    ).map(createDigitalHumanPresetProfile),
  ];

  const activeAnchor =
    availableAnchors.find((a) => a.id === activeAnchorId) ?? availableAnchors[0];

  useEffect(() => {
    if (selectedClip?.digitalHuman) {
      setPipPosition(selectedClip.digitalHuman.pipPosition);
      setFrameShape(selectedClip.digitalHuman.frameShape);
      setPipScale(selectedClip.digitalHuman.pipScale);
      setShowLiveWaveRing(selectedClip.digitalHuman.showLiveWaveRing);
      if (selectedClip.digitalHuman.action) {
        setSelectedAction(selectedClip.digitalHuman.action);
      }
      if (typeof selectedClip.digitalHuman.actionIntensity === 'number') {
        setActionIntensity(selectedClip.digitalHuman.actionIntensity);
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
    }
  }, [selectedClip?.id, selectedClip?.digitalHuman]);

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
            emotionMatchEnabled ? facialMuscles : undefined
          );
        }
      }
      rafId = requestAnimationFrame(renderLoop);
    };
    rafId = requestAnimationFrame(renderLoop);
    return () => cancelAnimationFrame(rafId);
  }, [activeAnchor, isPreviewingMiniStage, selectedAction, emotionMatchEnabled, selectedEmotion, facialMuscles]);

  const handleUploadAnchorMaterial = async (file: File) => {
    setCloneMessage(null);
    const created = await onUploadMediaAssetForAnchor(file);
    if (created) {
      setSelectedAssetForClone(created);
      setUploadedPreviewUrl(created.url);
      setUploadedMediaType(created.type);
      if (!anchorName || anchorName === '我的虚拟主播') {
        setAnchorName(file.name.replace(/\.[^.]+$/, '').slice(0, 16) || '我的虚拟主播');
      }
    }
  };

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
    } catch {
      setVoiceRecordError('音频文件读取失败，请检查文件格式。');
    }
  };

  const handleCloneDigitalHuman = async () => {
    setCloningAnchor(true);
    setCloneMessage(null);

    const boundClone = clonedVoices.find((v) => v.id === selectedVoiceBinding);
    const chosenVoice: VoiceoverVoice = boundClone
      ? boundClone.baseVoice
      : (['Kore', 'Zephyr', 'Puck', 'Charon', 'Fenrir'].includes(selectedVoiceBinding)
          ? (selectedVoiceBinding as VoiceoverVoice)
          : 'Kore');

    let imageBase64: string | undefined;
    let imageMimeType = 'image/jpeg';
    if (uploadedMediaType === 'video') {
      const frame = await captureVideoFrameBase64(uploadedPreviewUrl);
      if (frame) imageBase64 = frame;
    } else if (uploadedPreviewUrl && !uploadedPreviewUrl.startsWith('data:image/svg+xml')) {
      const converted = await imageUrlToBase64(uploadedPreviewUrl);
      if (converted) {
        imageBase64 = converted.base64;
        imageMimeType = converted.mimeType;
      }
    }

    let aiPersonaSummary = `${styleHint || '短视频虚拟主播'}，形象自然清晰`;
    let aiTags = ['专属分身', '实拍混剪', '口播驱动'];
    let aiVoicePrompt =
      boundClone?.voiceDesignPrompt ||
      'Natural conversational short-video digital human presenter with warm breathing and clear diction.';
    let aiBaseVoice: VoiceoverVoice = chosenVoice;
    let aiAccent = '#fb7185';
    let sampleAudioBase64 = recordedVoice?.base64;
    let sampleAudioMimeType = recordedVoice?.mimeType;
    let sampleAudioDurationSec = recordedVoice?.durationSec;

    try {
      const res = await fetch('/api/digital-human/clone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          anchorName: anchorName.trim() || '我的虚拟主播',
          imageBase64,
          imageMimeType,
          audioBase64: recordedVoice?.base64,
          audioMimeType: recordedVoice?.mimeType,
          styleHint,
          generateGreeting: !recordedVoice && !boundClone,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.personaSummary) aiPersonaSummary = data.personaSummary;
        if (Array.isArray(data?.anchorStyleTags) && data.anchorStyleTags.length > 0) {
          aiTags = data.anchorStyleTags;
        }
        if (data?.voiceDesignPrompt && !boundClone) aiVoicePrompt = data.voiceDesignPrompt;
        if (data?.baseVoice && !boundClone) aiBaseVoice = data.baseVoice as VoiceoverVoice;
        if (data?.accentColor) aiAccent = data.accentColor;
        if (data?.sampleAudioBase64 && !sampleAudioBase64) {
          sampleAudioBase64 = data.sampleAudioBase64;
          sampleAudioMimeType = data.sampleAudioMimeType || 'audio/wav';
          sampleAudioDurationSec = data.sampleAudioDurationSec;
        }
        if (data?.recommendedSampleLine && !scriptText.trim()) {
          setScriptText(data.recommendedSampleLine);
        }
      }
    } catch {
      // Fallback cleanly to local profile creation using uploaded asset + recorded audio
    }

    const newProfile: DigitalHumanProfile = {
      id: `dh-${Date.now()}`,
      name: anchorName.trim() || '我的虚拟主播',
      createdAt: new Date().toISOString(),
      avatarAssetId: selectedAssetForClone?.id,
      avatarUrl: uploadedPreviewUrl,
      avatarMediaType: uploadedMediaType,
      personaSummary: aiPersonaSummary,
      anchorStyleTags: aiTags,
      baseVoice: aiBaseVoice,
      voiceDesignPrompt: aiVoicePrompt,
      clonedVoiceId: boundClone?.id,
      sampleAudioBase64,
      sampleAudioMimeType,
      sampleAudioDurationSec,
      accentColor: aiAccent,
      defaultAction: selectedAction,
      defaultEmotion: selectedEmotion,
      defaultFacialMuscles: facialMuscles,
    };

    onSaveDigitalHuman(newProfile);
    setActiveAnchorId(newProfile.id);
    if (sampleAudioBase64 && sampleAudioMimeType) {
      setDrivenAudio({
        audioBase64: sampleAudioBase64,
        mimeType: sampleAudioMimeType,
        durationSec: sampleAudioDurationSec ?? 3.2,
        text: scriptText.trim() || newProfile.name,
      });
    }
    setCloneMessage(`虚拟主播「${newProfile.name}」克隆完成！已在下方激活，可直接驱动并嵌入时间线。`);
    setCloningAnchor(false);
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

  const handleSynthesizeAnchorSpeech = async () => {
    if (!activeAnchor || !scriptText.trim()) return;
    setDrivingSpeech(true);
    setDriveError(null);
    const boundClone = activeAnchor.clonedVoiceId
      ? clonedVoices.find((v) => v.id === activeAnchor.clonedVoiceId)
      : undefined;

    try {
      const res = await fetch('/api/digital-human/drive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          anchorName: activeAnchor.name,
          scriptText: scriptText.trim(),
          baseVoice: boundClone ? boundClone.baseVoice : activeAnchor.baseVoice,
          voiceDesignPrompt: boundClone
            ? boundClone.voiceDesignPrompt
            : activeAnchor.voiceDesignPrompt,
          expressiveness: boundClone?.expressiveness ?? 0.78,
          platform,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.audioBase64) {
        throw new Error(data?.error || '数字人语音驱动失败，请重试。');
      }

      const dur = Number(data.audioDurationSec || 3.2);
      const mime = data.mimeType || 'audio/wav';
      setDrivenAudio({
        audioBase64: data.audioBase64,
        mimeType: mime,
        durationSec: dur,
        text: scriptText.trim(),
      });
      setFullClipDuration(Number(Math.max(2, dur + 0.2).toFixed(1)));
      playAudioSnippet(data.audioBase64, mime);
      if (emotionMatchEnabled) {
        void handleAnalyzeVoiceEmotion(data.audioBase64, mime, scriptText.trim());
      }
    } catch (err: unknown) {
      setDriveError(err instanceof Error ? err.message : '数字人语音驱动失败。');
    } finally {
      setDrivingSpeech(false);
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
    emotionMatchEnabled,
    emotion: selectedEmotion,
    facialMuscles,
    emotionSummary: emotionAnalysis?.toneSummary,
    spokenScript: scriptText.trim() || undefined,
    accentColor: activeAnchor.accentColor || '#fb7185',
  });

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
      const res = await fetch('/api/digital-human/analyze-emotion', {
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

  const handleSelectEmotionPreset = (emotionId: DigitalHumanEmotionId) => {
    const preset = getDigitalHumanEmotionPreset(emotionId);
    setEmotionMatchEnabled(true);
    setSelectedEmotion(emotionId);
    setFacialMuscles(preset.muscles);
    setEmotionNote(`已切换为「${preset.label}」情感基调，面部肌肉驱动参数已同步刷新。`);
    syncEmotionToSelectedClip(true, emotionId, preset.muscles, preset.description);
  };

  const handleMuscleChange = (
    key: keyof DigitalHumanFacialMuscles,
    value: number
  ) => {
    const next = clampFacialMuscles({ ...facialMuscles, [key]: value });
    setFacialMuscles(next);
    if (emotionMatchEnabled) {
      syncEmotionToSelectedClip(true, selectedEmotion, next, emotionAnalysis?.toneSummary);
    }
  };

  const handleSelectActionTemplate = (actionId: DigitalHumanActionId) => {
    const tmpl = getDigitalHumanActionTemplate(actionId);
    setSelectedAction(actionId);
    setActionIntensity(tmpl.recommendedIntensity);
    if (selectedClip?.digitalHuman) {
      onUpdateClipDigitalHumanAction(selectedClip.id, actionId, tmpl.recommendedIntensity);
      setActionSyncNotice(`已为当前片段「${selectedClip.label}」分配「${tmpl.label}」姿态，播放与导出将自动调用对应动作驱动。`);
    } else {
      setActionSyncNotice(`已选定「${tmpl.label}」动作模板，嵌入或插入视频轨时将自动绑定该姿态驱动。`);
    }
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

  // Helper to import subtitle text from current clip range
  const handleFillSubtitlesFromClip = () => {
    if (!selectedClip) return;
    const end = selectedClipStartTime + selectedClip.duration;
    const matched = subtitles
      .filter((s) => {
        const mid = s.startTime + s.duration / 2;
        return mid >= selectedClipStartTime && mid <= end;
      })
      .map((s) => s.text.trim())
      .filter(Boolean);
    if (matched.length > 0) {
      setScriptText(matched.join('，'));
    } else if (subtitles[0]?.text) {
      setScriptText(subtitles[0].text);
    }
  };

  return (
    <div className="space-y-4">
      {/* 1. Digital Human Clone Creator */}
      <div className="rounded-lg border border-violet-500/35 bg-[#0B0D10] p-3 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-violet-200 flex items-center gap-1.5">
            <UserCheck className="w-3.5 h-3.5 text-violet-400 shrink-0" />
            <span>1. 数字人形象与语音克隆</span>
          </span>
          <span className="text-[10px] text-zinc-500">图/视频 + 语音</span>
        </div>

        <div>
          <label htmlFor="dh-anchor-name" className="block text-[11px] text-zinc-400 mb-1">
            虚拟主播名称
          </label>
          <input
            id="dh-anchor-name"
            type="text"
            maxLength={20}
            value={anchorName}
            onChange={(e) => setAnchorName(e.target.value)}
            placeholder="例如：小陈口播分身"
            className="w-full rounded-md bg-[#11141B] border border-zinc-800 px-2.5 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-violet-500"
          />
        </div>

        {/* Upload Avatar Photo / Video or Pick Preset */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[11px] text-zinc-400">
            <span>主播形象素材</span>
            <button
              type="button"
              onClick={() => anchorMediaInputRef.current?.click()}
              className="text-violet-300 hover:text-violet-200 font-medium flex items-center gap-1"
            >
              <Upload className="w-3 h-3" />
              <span>上传人像照片/视频</span>
            </button>
          </div>

          <input
            ref={anchorMediaInputRef}
            type="file"
            accept="image/*,video/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleUploadAnchorMaterial(f);
              e.target.value = '';
            }}
          />

          <div className="flex items-center gap-2.5">
            <div className="w-12 h-14 rounded-lg border border-zinc-700 bg-[#11141B] overflow-hidden shrink-0 flex items-center justify-center">
              {uploadedMediaType === 'video' ? (
                <video
                  src={uploadedPreviewUrl}
                  muted
                  playsInline
                  className="w-full h-full object-cover"
                />
              ) : (
                <img
                  src={uploadedPreviewUrl}
                  alt="数字人形象预览"
                  className="w-full h-full object-cover"
                />
              )}
            </div>

            <div className="flex-1 min-w-0 space-y-1.5">
              <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                {BUILTIN_DIGITAL_HUMAN_PRESETS.map((preset) => {
                  const selected = uploadedPreviewUrl === preset.avatarUrl;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      title={preset.name}
                      onClick={() => {
                        setSelectedAssetForClone(null);
                        setUploadedPreviewUrl(preset.avatarUrl);
                        setUploadedMediaType('image');
                        setAnchorName(preset.name.split(' · ')[0]);
                        setSelectedVoiceBinding(preset.baseVoice);
                      }}
                      className={`w-8 h-8 rounded-md overflow-hidden border shrink-0 transition-colors ${
                        selected
                          ? 'border-violet-400 ring-1 ring-violet-400/50'
                          : 'border-zinc-700 opacity-75 hover:opacity-100'
                      }`}
                    >
                      <img src={preset.avatarUrl} alt={preset.name} className="w-full h-full object-cover" />
                    </button>
                  );
                })}
                {assets.slice(0, 3).map((asset) => {
                  const selected = selectedAssetForClone?.id === asset.id;
                  return (
                    <button
                      key={asset.id}
                      type="button"
                      title={`使用素材：${asset.name}`}
                      onClick={() => {
                        setSelectedAssetForClone(asset);
                        setUploadedPreviewUrl(asset.url);
                        setUploadedMediaType(asset.type);
                      }}
                      className={`px-1.5 h-8 rounded-md border text-[10px] shrink-0 flex items-center gap-1 transition-colors ${
                        selected
                          ? 'border-violet-400 bg-violet-500/20 text-violet-100'
                          : 'border-zinc-700 bg-[#11141B] text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      <ImagePlus className="w-3 h-3 shrink-0" />
                      <span className="max-w-[52px] truncate">{asset.name}</span>
                    </button>
                  );
                })}
              </div>
              <input
                type="text"
                value={styleHint}
                onChange={(e) => setStyleHint(e.target.value)}
                placeholder="人设补充：如科技干货主播 / 种草达人"
                className="w-full rounded bg-[#11141B] border border-zinc-800 px-2 py-1 text-[10px] text-zinc-300 focus:outline-none focus:border-violet-500"
              />
            </div>
          </div>
        </div>

        {/* Voice Recording / Audio Upload / Voice Binding */}
        <div className="space-y-2 border-t border-zinc-800/80 pt-2.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-zinc-400">声音来源（录制或绑定音色）</span>
            {recordedVoice && (
              <span className="font-mono-nums text-emerald-300">
                已录 {recordedVoice.durationSec.toFixed(1)}s
              </span>
            )}
          </div>

          <input
            ref={voiceAudioInputRef}
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleUploadDriveAudioFile(f);
              e.target.value = '';
            }}
          />

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => void handleToggleMicRecord()}
              className={`flex-1 py-1.5 px-2.5 rounded-md text-[11px] font-medium flex items-center justify-center gap-1.5 transition-colors ${
                isRecordingVoice
                  ? 'bg-red-600 hover:bg-red-500 text-white'
                  : 'bg-[#11141B] border border-zinc-700 hover:border-violet-500/70 text-zinc-200'
              }`}
            >
              {isRecordingVoice ? (
                <>
                  <Square className="w-3 h-3 fill-current" />
                  <span className="font-mono-nums">
                    停止录音 {recordElapsedSec.toFixed(1)}s
                  </span>
                </>
              ) : (
                <>
                  <Mic className="w-3 h-3 text-rose-400" />
                  <span>{recordedVoice ? '重录主播语音' : '录制个人语音'}</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => voiceAudioInputRef.current?.click()}
              className="py-1.5 px-2.5 rounded-md border border-zinc-700 bg-[#11141B] hover:bg-zinc-800 text-[11px] text-zinc-300 flex items-center gap-1 shrink-0"
              title="上传本地音频文件"
            >
              <Upload className="w-3 h-3" />
              <span>上传音频</span>
            </button>
          </div>

          <select
            value={selectedVoiceBinding}
            onChange={(e) => setSelectedVoiceBinding(e.target.value)}
            aria-label="绑定基底音色或克隆声纹"
            className="w-full rounded-md bg-[#11141B] border border-zinc-800 px-2.5 py-1.5 text-[11px] text-zinc-200 focus:outline-none focus:border-violet-500"
          >
            {clonedVoices.length > 0 && (
              <optgroup label="已训练专属克隆音色">
                {clonedVoices.map((cv) => (
                  <option key={cv.id} value={cv.id}>
                    ★ {cv.name} ({cv.baseVoice})
                  </option>
                ))}
              </optgroup>
            )}
            <optgroup label="AI 预设演播室声线">
              <option value="Kore">Kore · 温暖自然女主播</option>
              <option value="Zephyr">Zephyr · 轻快青年口播</option>
              <option value="Puck">Puck · 元气种草达人</option>
              <option value="Charon">Charon · 沉稳科技男声</option>
              <option value="Fenrir">Fenrir · 低沉磁性解说</option>
            </optgroup>
          </select>

          {voiceRecordError && (
            <p className="text-[10px] text-red-300 leading-snug">{voiceRecordError}</p>
          )}
        </div>

        <button
          type="button"
          disabled={cloningAnchor}
          onClick={() => void handleCloneDigitalHuman()}
          className="w-full py-2 px-3 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-xs font-semibold text-white flex items-center justify-center gap-1.5 transition-colors"
        >
          {cloningAnchor ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>正在分析形象与声纹建模...</span>
            </>
          ) : (
            <>
              <Sparkles className="w-3.5 h-3.5" />
              <span>克隆生成虚拟主播分身</span>
            </>
          )}
        </button>

        {cloneMessage && (
          <div className="rounded-md border border-emerald-500/35 bg-emerald-950/25 px-2.5 py-2 text-[11px] text-emerald-200 leading-snug">
            {cloneMessage}
          </div>
        )}
      </div>

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
          <div className="rounded-lg border border-zinc-800 bg-[#11141B] p-2.5 flex items-center gap-2.5">
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
        )}

        {/* Digital Human Action Template Library */}
        <div className="rounded-lg border border-zinc-800 bg-[#11141B] p-2.5 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold text-zinc-200">
              数字人动作模板库
            </span>
            <span className="text-[10px] font-medium text-cyan-300">
              当前姿态：{getDigitalHumanActionTemplate(selectedAction).label}
            </span>
          </div>

          <div
            className="grid grid-cols-3 gap-1.5"
            role="radiogroup"
            aria-label="数字人动作模板库"
          >
            {DIGITAL_HUMAN_ACTION_TEMPLATES.map((tmpl) => {
              const isSelected = selectedAction === tmpl.id;
              return (
                <button
                  key={tmpl.id}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => handleSelectActionTemplate(tmpl.id)}
                  title={tmpl.summary}
                  className={`group rounded-lg border p-1 text-left transition-all flex flex-col gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
                    isSelected
                      ? 'border-cyan-400 bg-cyan-950/35 ring-1 ring-cyan-400/35'
                      : 'border-zinc-800 bg-[#0B0D10] hover:border-zinc-600'
                  }`}
                >
                  <div className="relative w-full h-11 rounded overflow-hidden bg-zinc-900">
                    <img
                      src={tmpl.thumbnailUrl}
                      alt={`${tmpl.label}动作缩略图`}
                      className="w-full h-full object-cover"
                    />
                    <span
                      className="absolute top-0.5 right-0.5 px-1 py-0.2 rounded text-[8px] font-mono-nums font-bold text-zinc-950"
                      style={{ backgroundColor: tmpl.badgeColor }}
                    >
                      {tmpl.englishTag}
                    </span>
                  </div>
                  <div className="flex items-center justify-between px-0.5">
                    <span
                      className={`text-[11px] font-semibold ${
                        isSelected ? 'text-cyan-100' : 'text-zinc-300'
                      }`}
                    >
                      {tmpl.label}
                    </span>
                    {isSelected && <Check className="w-3 h-3 text-cyan-300 shrink-0" />}
                  </div>
                </button>
              );
            })}
          </div>

          <p className="text-[10px] text-zinc-400 leading-snug">
            {getDigitalHumanActionTemplate(selectedAction).summary}
          </p>

          <div className="pt-1 border-t border-zinc-800/80">
            <div className="flex items-center justify-between text-[10px] text-zinc-400 mb-1">
              <span>动作姿态幅度</span>
              <span className="font-mono-nums text-cyan-300">{actionIntensity.toFixed(2)}x</span>
            </div>
            <input
              type="range"
              min={0.6}
              max={1.4}
              step={0.05}
              value={actionIntensity}
              onChange={(e) => {
                const nextVal = Number(e.target.value);
                setActionIntensity(nextVal);
                if (selectedClip?.digitalHuman) {
                  onUpdateClipDigitalHumanAction(selectedClip.id, selectedAction, nextVal);
                }
              }}
              className="w-full accent-cyan-400"
            />
          </div>

          {actionSyncNotice && (
            <div className="rounded border border-cyan-500/35 bg-cyan-950/25 px-2 py-1.5 text-[10px] text-cyan-200 leading-snug">
              {actionSyncNotice}
            </div>
          )}
        </div>

        {/* Voice Emotion Matching & Facial Muscle Tuning */}
        <div className="rounded-lg border border-amber-500/30 bg-[#11141B] p-2.5 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <span className="text-[11px] font-semibold text-amber-200 flex items-center gap-1.5">
                <AudioLines className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>语音情感匹配（面部肌肉驱动）</span>
              </span>
              <span className="block text-[10px] text-zinc-400 mt-0.5">
                分析语调自动调整张口、眉弓、眼神与唇肌张力
              </span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={emotionMatchEnabled}
              aria-label="语音情感匹配"
              onClick={() => {
                const next = !emotionMatchEnabled;
                setEmotionMatchEnabled(next);
                syncEmotionToSelectedClip(
                  next,
                  selectedEmotion,
                  facialMuscles,
                  emotionAnalysis?.toneSummary
                );
              }}
              className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors ${
                emotionMatchEnabled
                  ? 'bg-amber-500 border-amber-400'
                  : 'bg-zinc-800 border-zinc-700'
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                  emotionMatchEnabled ? 'translate-x-4' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>

          {emotionMatchEnabled && (
            <div className="space-y-2.5 pt-1 border-t border-zinc-800/80">
              <button
                type="button"
                disabled={analyzingEmotion}
                onClick={() => void handleAnalyzeVoiceEmotion()}
                className="w-full py-1.5 px-2.5 rounded-md bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/50 disabled:opacity-50 text-[11px] font-semibold text-amber-100 flex items-center justify-center gap-1.5 transition-colors"
              >
                {analyzingEmotion ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>正在分析音频语调与情感基调...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                    <span>分析音频语调并自动匹配面部肌肉</span>
                  </>
                )}
              </button>

              {/* Emotion Baselines */}
              <div className="grid grid-cols-5 gap-1">
                {DIGITAL_HUMAN_EMOTION_PRESETS.map((preset) => {
                  const active = selectedEmotion === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => handleSelectEmotionPreset(preset.id)}
                      title={preset.description}
                      className={`py-1 px-1 rounded border text-[10px] font-semibold text-center transition-colors ${
                        active
                          ? 'text-zinc-950 border-transparent'
                          : 'bg-[#0B0D10] border-zinc-800 text-zinc-300 hover:border-zinc-600'
                      }`}
                      style={
                        active
                          ? { backgroundColor: preset.badgeColor }
                          : undefined
                      }
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>

              {emotionAnalysis && (
                <div className="rounded border border-amber-500/35 bg-amber-950/20 p-2 space-y-1">
                  <div className="flex items-center justify-between gap-2 text-[10px]">
                    <span className="font-semibold text-amber-200">
                      识别情感：{emotionAnalysis.emotionLabel}
                    </span>
                    <span className="font-mono-nums text-amber-300">
                      匹配度 {Math.round(emotionAnalysis.confidence * 100)}%
                    </span>
                  </div>
                  <p className="text-[10px] text-zinc-300 leading-snug">
                    {emotionAnalysis.toneSummary}
                  </p>
                  {emotionAnalysis.prosodyMetrics && (
                    <div className="grid grid-cols-3 gap-1 pt-1 text-[9px] font-mono-nums text-zinc-400">
                      <span>能量 {(emotionAnalysis.prosodyMetrics.energyRms * 100).toFixed(0)}%</span>
                      <span>音高波动 {emotionAnalysis.prosodyMetrics.pitchVariance.toFixed(2)}</span>
                      <span>节奏 {emotionAnalysis.prosodyMetrics.tempoBurstRate.toFixed(1)}/s</span>
                    </div>
                  )}
                </div>
              )}

              {emotionNote && !emotionAnalysis && (
                <div className="rounded border border-zinc-700 bg-[#0B0D10] px-2 py-1 text-[10px] text-zinc-300">
                  {emotionNote}
                </div>
              )}

              {/* Facial Muscle Drive Fine-tuning Sliders */}
              <div className="space-y-1.5 pt-1 border-t border-zinc-800/70">
                <div className="flex items-center justify-between text-[10px] text-zinc-400">
                  <span className="flex items-center gap-1">
                    <Sliders className="w-3 h-3 text-amber-400" />
                    <span>面部肌肉驱动微调参数</span>
                  </span>
                  <span className="font-mono-nums text-amber-300">
                    {getDigitalHumanEmotionPreset(selectedEmotion).englishTag}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-x-2.5 gap-y-1.5">
                  <div>
                    <div className="flex justify-between text-[9px] text-zinc-400">
                      <span>张口幅度</span>
                      <span className="font-mono-nums text-zinc-200">
                        {facialMuscles.jawOpenness.toFixed(2)}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0.5}
                      max={1.6}
                      step={0.02}
                      value={facialMuscles.jawOpenness}
                      onChange={(e) => handleMuscleChange('jawOpenness', Number(e.target.value))}
                      className="w-full accent-amber-400"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-[9px] text-zinc-400">
                      <span>眉弓张力</span>
                      <span className="font-mono-nums text-zinc-200">
                        {facialMuscles.browLift >= 0 ? `+${facialMuscles.browLift.toFixed(2)}` : facialMuscles.browLift.toFixed(2)}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={-1.0}
                      max={1.0}
                      step={0.05}
                      value={facialMuscles.browLift}
                      onChange={(e) => handleMuscleChange('browLift', Number(e.target.value))}
                      className="w-full accent-amber-400"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-[9px] text-zinc-400">
                      <span>眼神聚焦</span>
                      <span className="font-mono-nums text-zinc-200">
                        {facialMuscles.eyeSquint.toFixed(2)}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.04}
                      value={facialMuscles.eyeSquint}
                      onChange={(e) => handleMuscleChange('eyeSquint', Number(e.target.value))}
                      className="w-full accent-amber-400"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-[9px] text-zinc-400">
                      <span>嘴角微笑</span>
                      <span className="font-mono-nums text-zinc-200">
                        {facialMuscles.smileCurve >= 0 ? `+${facialMuscles.smileCurve.toFixed(2)}` : facialMuscles.smileCurve.toFixed(2)}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={-0.6}
                      max={1.0}
                      step={0.05}
                      value={facialMuscles.smileCurve}
                      onChange={(e) => handleMuscleChange('smileCurve', Number(e.target.value))}
                      className="w-full accent-amber-400"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-[9px] text-zinc-400">
                      <span>头部张力</span>
                      <span className="font-mono-nums text-zinc-200">
                        {facialMuscles.headTension.toFixed(2)}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0.4}
                      max={1.5}
                      step={0.04}
                      value={facialMuscles.headTension}
                      onChange={(e) => handleMuscleChange('headTension', Number(e.target.value))}
                      className="w-full accent-amber-400"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-[9px] text-zinc-400">
                      <span>唇肌锐度</span>
                      <span className="font-mono-nums text-zinc-200">
                        {facialMuscles.lipSyncSharpness.toFixed(2)}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0.6}
                      max={1.6}
                      step={0.04}
                      value={facialMuscles.lipSyncSharpness}
                      onChange={(e) => handleMuscleChange('lipSyncSharpness', Number(e.target.value))}
                      className="w-full accent-amber-400"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Drive Mode Switch */}
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={() => setDriveMode('ai-script')}
            className={`py-1.5 px-2 rounded-md border text-[11px] font-medium transition-colors ${
              driveMode === 'ai-script'
                ? 'border-cyan-500/70 bg-cyan-500/15 text-cyan-100'
                : 'border-zinc-800 bg-[#11141B] text-zinc-400 hover:text-zinc-200'
            }`}
          >
            AI 台词合成驱动
          </button>
          <button
            type="button"
            onClick={() => setDriveMode('recorded-audio')}
            className={`py-1.5 px-2 rounded-md border text-[11px] font-medium transition-colors ${
              driveMode === 'recorded-audio'
                ? 'border-cyan-500/70 bg-cyan-500/15 text-cyan-100'
                : 'border-zinc-800 bg-[#11141B] text-zinc-400 hover:text-zinc-200'
            }`}
          >
            录制 / 原声直驱
          </button>
        </div>

        {driveMode === 'ai-script' ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[11px]">
              <label htmlFor="dh-script-input" className="text-zinc-400">
                数字人口播台词
              </label>
              <button
                type="button"
                onClick={handleFillSubtitlesFromClip}
                className="text-[10px] text-cyan-300 hover:text-cyan-200"
              >
                导入当前片段字幕
              </button>
            </div>
            <textarea
              id="dh-script-input"
              rows={3}
              value={scriptText}
              onChange={(e) => setScriptText(e.target.value)}
              placeholder="输入想让虚拟主播说的话..."
              className="w-full rounded-md bg-[#11141B] border border-zinc-800 px-2.5 py-2 text-xs text-zinc-100 focus:outline-none focus:border-cyan-500 resize-none"
            />
            <button
              type="button"
              disabled={drivingSpeech || !scriptText.trim()}
              onClick={() => void handleSynthesizeAnchorSpeech()}
              className="w-full py-2 px-3 rounded-md bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-xs font-semibold text-white flex items-center justify-center gap-1.5 transition-colors"
            >
              {drivingSpeech ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>正在合成主播语音驱动...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>AI 合成语音并驱动主播</span>
                </>
              )}
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-[10px] text-zinc-400 leading-relaxed">
              用真人麦克风录音或导入干声直接驱动虚拟主播呼吸动效与声浪口播，零等待、免 AI 额度消耗。
            </p>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => void handleToggleMicRecord()}
                className={`flex-1 py-2 px-2.5 rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                  isRecordingVoice
                    ? 'bg-red-600 hover:bg-red-500 text-white'
                    : 'bg-cyan-600 hover:bg-cyan-500 text-white'
                }`}
              >
                {isRecordingVoice ? (
                  <>
                    <Square className="w-3.5 h-3.5 fill-current" />
                    <span className="font-mono-nums">结束录制 {recordElapsedSec.toFixed(1)}s</span>
                  </>
                ) : (
                  <>
                    <Mic className="w-3.5 h-3.5" />
                    <span>录制驱动语音</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => voiceAudioInputRef.current?.click()}
                className="py-2 px-2.5 rounded-md border border-zinc-700 bg-[#11141B] hover:bg-zinc-800 text-xs text-zinc-200 shrink-0"
              >
                导入音频
              </button>
            </div>
          </div>
        )}

        {driveError && (
          <div className="rounded-md border border-red-500/40 bg-red-950/30 p-2 text-[11px] text-red-200 leading-snug">
            {driveError}
          </div>
        )}

        {drivenAudio && (
          <div className="rounded-md border border-emerald-500/35 bg-emerald-950/20 px-2.5 py-2 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[11px] font-medium text-emerald-200 truncate">
                驱动音轨就绪 · {drivenAudio.durationSec.toFixed(1)}s
              </div>
              <div className="text-[10px] text-zinc-400 truncate">{drivenAudio.text}</div>
            </div>
            <button
              type="button"
              onClick={() =>
                isPreviewingMiniStage
                  ? stopPreviewAudio()
                  : playAudioSnippet(drivenAudio.audioBase64, drivenAudio.mimeType)
              }
              className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-[11px] font-semibold text-white flex items-center gap-1 shrink-0"
            >
              {isPreviewingMiniStage ? (
                <>
                  <Square className="w-3 h-3 fill-current" />
                  <span>停止</span>
                </>
              ) : (
                <>
                  <Play className="w-3 h-3" />
                  <span>试听驱动</span>
                </>
              )}
            </button>
          </div>
        )}
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
