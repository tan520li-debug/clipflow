import { type Dispatch, type RefObject, type SetStateAction, useState } from 'react';
import { ImagePlus, Loader2, Mic, Sparkles, Square, Upload, UserCheck } from 'lucide-react';
import type {
  ClonedVoiceProfile,
  DigitalHumanActionId,
  DigitalHumanCameraMotion,
  DigitalHumanEmotionId,
  DigitalHumanFacialMuscles,
  DigitalHumanProfile,
  MediaAsset,
  VoiceoverVoice,
} from '../../types/studio';
import {
  BUILTIN_DIGITAL_HUMAN_PRESETS,
  createDigitalHumanPresetProfile,
} from '../../utils/digitalHumanAssets';
import { apiFetch } from '../../client/api/http';

type RecordedVoice = { base64: string; mimeType: string; durationSec: number } | null;
type DrivenAudio = {
  audioBase64: string;
  mimeType: string;
  durationSec: number;
  text: string;
  segmentCount?: number;
} | null;

interface CloneSectionProps {
  anchorName: string;
  setAnchorName: Dispatch<SetStateAction<string>>;
  styleHint: string;
  setStyleHint: Dispatch<SetStateAction<string>>;
  selectedAssetForClone: MediaAsset | null;
  setSelectedAssetForClone: Dispatch<SetStateAction<MediaAsset | null>>;
  uploadedPreviewUrl: string;
  setUploadedPreviewUrl: Dispatch<SetStateAction<string>>;
  uploadedMediaType: 'image' | 'video';
  setUploadedMediaType: Dispatch<SetStateAction<'image' | 'video'>>;
  selectedVoiceBinding: string;
  setSelectedVoiceBinding: Dispatch<SetStateAction<string>>;
  cloningAnchor: boolean;
  setCloningAnchor: Dispatch<SetStateAction<boolean>>;
  cloneMessage: string | null;
  setCloneMessage: Dispatch<SetStateAction<string | null>>;
  recordedVoice: RecordedVoice;
  isRecordingVoice: boolean;
  recordElapsedSec: number;
  voiceRecordError: string | null;
  anchorMediaInputRef: RefObject<HTMLInputElement | null>;
  voiceAudioInputRef: RefObject<HTMLInputElement | null>;
  handleToggleMicRecord: () => void | Promise<void>;
  handleUploadDriveAudioFile: (file: File) => void | Promise<void>;
  assets: MediaAsset[];
  clonedVoices: ClonedVoiceProfile[];
  activeVoiceoverVoice: VoiceoverVoice;
  onUploadMediaAssetForAnchor: (file: File) => Promise<MediaAsset | null>;
  scriptText: string;
  setScriptText: Dispatch<SetStateAction<string>>;
  selectedAction: DigitalHumanActionId;
  actionBlendDuration: number;
  selectedEmotion: DigitalHumanEmotionId;
  facialMuscles: DigitalHumanFacialMuscles;
  cameraMotion: DigitalHumanCameraMotion;
  phonemeAlignEnabled: boolean;
  phonemeOffsetMs: number;
  onSaveDigitalHuman: (profile: DigitalHumanProfile) => void;
  setActiveAnchorId: Dispatch<SetStateAction<string>>;
  setDrivenAudio: Dispatch<SetStateAction<DrivenAudio>>;
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

export function CloneSection({
  anchorName,
  setAnchorName,
  styleHint,
  setStyleHint,
  selectedAssetForClone,
  setSelectedAssetForClone,
  uploadedPreviewUrl,
  setUploadedPreviewUrl,
  uploadedMediaType,
  setUploadedMediaType,
  selectedVoiceBinding,
  setSelectedVoiceBinding,
  cloningAnchor,
  setCloningAnchor,
  cloneMessage,
  setCloneMessage,
  recordedVoice,
  isRecordingVoice,
  recordElapsedSec,
  voiceRecordError,
  anchorMediaInputRef,
  voiceAudioInputRef,
  handleToggleMicRecord,
  handleUploadDriveAudioFile,
  assets,
  clonedVoices,
  activeVoiceoverVoice,
  onUploadMediaAssetForAnchor,
  scriptText,
  setScriptText,
  selectedAction,
  actionBlendDuration,
  selectedEmotion,
  facialMuscles,
  cameraMotion,
  phonemeAlignEnabled,
  phonemeOffsetMs,
  onSaveDigitalHuman,
  setActiveAnchorId,
  setDrivenAudio,
}: CloneSectionProps) {
  const [cloneFailed, setCloneFailed] = useState(false);

  const handleUploadAnchorMaterial = async (file: File) => {
    setCloneFailed(false);
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

  const handleCloneDigitalHuman = async () => {
    setCloningAnchor(true);
    setCloneFailed(false);
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

    let serverError = '';
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
      const res = await apiFetch('/api/digital-human/clone', {
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
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: unknown } | null;
        serverError =
          typeof data?.error === 'string' && data.error.trim()
            ? data.error.trim()
            : '数字人克隆失败，形象没有保存。';
      } else {
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
      serverError = '数字人克隆没有完成，请检查访问令牌后重试。';
    }

    if (serverError) {
      setCloneFailed(true);
      setCloneMessage(serverError);
      setCloningAnchor(false);
      return;
    }

    const persistentAvatarUrl =
      uploadedPreviewUrl.startsWith('blob:') && imageBase64
        ? `data:${imageMimeType};base64,${imageBase64}`
        : uploadedPreviewUrl.startsWith('blob:')
          ? BUILTIN_DIGITAL_HUMAN_PRESETS[0].avatarUrl
          : uploadedPreviewUrl;
    const persistentAvatarType: 'image' | 'video' =
      persistentAvatarUrl.startsWith('data:video/') ||
      (uploadedMediaType === 'video' && !uploadedPreviewUrl.startsWith('blob:'))
        ? uploadedMediaType
        : 'image';

    const newProfile: DigitalHumanProfile = {
      id: `dh-${Date.now()}`,
      name: anchorName.trim() || '我的虚拟主播',
      createdAt: new Date().toISOString(),
      avatarAssetId: selectedAssetForClone?.id,
      avatarUrl: persistentAvatarUrl,
      avatarMediaType: persistentAvatarType,
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
      defaultActionBlendDuration: actionBlendDuration,
      defaultEmotion: selectedEmotion,
      defaultFacialMuscles: facialMuscles,
      defaultCameraMotion: cameraMotion,
      defaultPhonemeAlignmentEnabled: phonemeAlignEnabled,
      defaultPhonemeOffsetMs: phonemeOffsetMs,
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
    setCloneFailed(false);
    setCloneMessage(
      `虚拟主播「${newProfile.name}」已保存，合成音色匹配为 ${aiBaseVoice}。可以在下方直接驱动。`,
    );
    setCloningAnchor(false);
  };

  return (
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
              <span>正在匹配形象和合成音色...</span>
            </>
          ) : (
            <>
              <Sparkles className="w-3.5 h-3.5" />
              <span>克隆生成虚拟主播分身</span>
            </>
          )}
        </button>

        {cloneMessage && (
          <div
            className={`rounded-md border px-2.5 py-2 text-[11px] leading-snug ${
              cloneFailed
                ? 'border-rose-500/40 bg-rose-950/30 text-rose-200'
                : 'border-emerald-500/35 bg-emerald-950/25 text-emerald-200'
            }`}
          >
            {cloneMessage}
          </div>
        )}
      </div>
  );
}
