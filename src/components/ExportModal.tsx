import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  Copy,
  Download,
  Eye,
  FileText,
  Film,
  HardDrive,
  Loader2,
  Maximize2,
  SlidersHorizontal,
  Sparkles,
  Video,
  X,
} from 'lucide-react';
import type { AspectRatio, MediaAsset, PlatformId, PlatformProjectState } from '../types/studio';
import { editionLabel, exportSrtSubtitles, formatTimecode, getTotalDuration } from '../utils/autoEditEngine';
import { StudioAudioEngine } from '../utils/audioEngine';
import { findClipAtTime, renderTimelineFrame, type LoadedMediaElement } from '../utils/canvasRenderer';
import { apiFetch } from '../client/api/http';
import { advanceStudioCursor, clipVideoSeekSec, digitalHumanSeekSec, shouldSeekMedia, shouldWhooshOnClipChange } from '../client/playback/studioClock';

interface ExportModalProps {
  project: PlatformProjectState;
  assetsMap: Map<string, MediaAsset>;
  mediaCache: Map<string, LoadedMediaElement>;
  onClose: () => void;
}

type ResolutionTier = '720p' | '1080p';
type CodecPreference = 'auto' | 'vp9' | 'vp8' | 'h264';
type ExportStep = 'config' | 'preview';

interface PlatformExportProfile {
  platform: PlatformId;
  label: string;
  aspectRatio: AspectRatio;
  resolutionTier: ResolutionTier;
  codec: CodecPreference;
  videoBitrateMbps: number;
  audioBitrateKbps: number;
  fps: 30 | 60;
  badgeText: string;
  encodingLabel: string;
  optimizationNote: string;
}

const PLATFORM_EXPORT_PROFILES: Record<PlatformId, PlatformExportProfile> = {
  douyin: {
    platform: 'douyin',
    label: '中文版',
    aspectRatio: '9:16',
    resolutionTier: '1080p',
    codec: 'vp9',
    videoBitrateMbps: 8.0,
    audioBitrateKbps: 192,
    fps: 30,
    badgeText: '1080×1920 · 高锐度',
    encodingLabel: 'VP9 + Opus · 8.0 Mbps',
    optimizationNote: '针对抖音竖屏信息流与首帧清晰度优化，提高码率冗余以减少平台二压引起的字幕锯齿与暗部色块。',
  },
  xiaohongshu: {
    platform: 'xiaohongshu',
    label: '小红书',
    aspectRatio: '9:16',
    resolutionTier: '1080p',
    codec: 'vp9',
    videoBitrateMbps: 7.0,
    audioBitrateKbps: 192,
    fps: 30,
    badgeText: '1080×1920 · 质感',
    encodingLabel: 'VP9 + Opus · 7.0 Mbps',
    optimizationNote: '贴合小红书竖屏种草画幅，保留肤色和静物细节，减少平台压缩后的色块和字幕发虚。',
  },
  tiktok: {
    platform: 'tiktok',
    label: '英文版',
    aspectRatio: '9:16',
    resolutionTier: '1080p',
    codec: 'vp9',
    videoBitrateMbps: 6.5,
    audioBitrateKbps: 160,
    fps: 30,
    badgeText: '1080×1920 · 低延迟',
    encodingLabel: 'VP9 + Opus · 6.5 Mbps',
    optimizationNote: '贴合 TikTok 全球分发码率区间，兼顾高频卡点转场运动细节与海外端秒开缓冲速度。',
  },
  instagram: {
    platform: 'instagram',
    label: 'Instagram Reels',
    aspectRatio: '9:16',
    resolutionTier: '1080p',
    codec: 'vp9',
    videoBitrateMbps: 6.5,
    audioBitrateKbps: 160,
    fps: 30,
    badgeText: '1080×1920 · Reels',
    encodingLabel: 'VP9 + Opus · 6.5 Mbps',
    optimizationNote: '按 Instagram Reels 竖屏分发，保留构图留白和字幕边缘，避免二次压缩后高光溢出。',
  },
  facebook: {
    platform: 'facebook',
    label: 'Facebook',
    aspectRatio: '4:5',
    resolutionTier: '1080p',
    codec: 'h264',
    videoBitrateMbps: 5.5,
    audioBitrateKbps: 160,
    fps: 30,
    badgeText: '1080×1350 (4:5)',
    encodingLabel: 'H.264 / 高兼容 · 5.5 Mbps',
    optimizationNote: '自动采用 4:5 信息流高占屏比例并优先高兼容编码配置，匹配 Meta 移动端信息流转码标准。',
  },
};

function resolveSupportedMimeType(codecPref: CodecPreference): {
  mimeType: string | undefined;
  codecDisplayLabel: string;
  isFallback: boolean;
} {
  if (typeof MediaRecorder === 'undefined') {
    return { mimeType: undefined, codecDisplayLabel: '不支持 MediaRecorder', isFallback: true };
  }

  const candidatesByPref: Record<CodecPreference, Array<{ mime: string; label: string }>> = {
    vp9: [
      { mime: 'video/webm;codecs=vp9,opus', label: 'VP9 + Opus (WebM)' },
      { mime: 'video/webm;codecs=vp8,opus', label: 'VP8 + Opus (WebM 兼容回退)' },
      { mime: 'video/webm', label: 'WebM 默认编码' },
    ],
    vp8: [
      { mime: 'video/webm;codecs=vp8,opus', label: 'VP8 + Opus (WebM)' },
      { mime: 'video/webm;codecs=vp9,opus', label: 'VP9 + Opus (WebM 回退)' },
      { mime: 'video/webm', label: 'WebM 默认编码' },
    ],
    h264: [
      { mime: 'video/webm;codecs=h264,opus', label: 'H.264 + Opus (WebM)' },
      { mime: 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', label: 'H.264 + AAC (MP4)' },
      { mime: 'video/webm;codecs=vp9,opus', label: 'VP9 + Opus (浏览器回退)' },
      { mime: 'video/webm;codecs=vp8,opus', label: 'VP8 + Opus (浏览器回退)' },
      { mime: 'video/webm', label: 'WebM 默认编码' },
    ],
    auto: [
      { mime: 'video/webm;codecs=vp9,opus', label: 'VP9 + Opus (WebM 优选)' },
      { mime: 'video/webm;codecs=h264,opus', label: 'H.264 + Opus (WebM)' },
      { mime: 'video/webm;codecs=vp8,opus', label: 'VP8 + Opus (WebM)' },
      { mime: 'video/webm', label: 'WebM 默认编码' },
    ],
  };

  const list = candidatesByPref[codecPref];
  const matchedIdx = list.findIndex((item) => MediaRecorder.isTypeSupported(item.mime));
  if (matchedIdx === -1) {
    return { mimeType: undefined, codecDisplayLabel: '浏览器默认 WebM', isFallback: true };
  }
  return {
    mimeType: list[matchedIdx].mime,
    codecDisplayLabel: list[matchedIdx].label,
    isFallback: codecPref !== 'auto' && matchedIdx > 0,
  };
}

function formatFileSize(bytes: number): string {
  if (bytes <= 0) return '0 KB';
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(mb >= 100 ? 0 : 1)} MB`;
}

function isNativeH264Mp4Mime(mimeType?: string): boolean {
  if (!mimeType) return false;
  const low = mimeType.toLowerCase();
  return low.includes('mp4') && (low.includes('avc1') || low.includes('h264'));
}

export function ExportModal({
  project,
  assetsMap,
  mediaCache,
  onClose,
}: ExportModalProps) {
  const initialProfile = PLATFORM_EXPORT_PROFILES[project.platform];

  const [step, setStep] = useState<ExportStep>('config');
  const [multiPlatformOptimize, setMultiPlatformOptimize] = useState<boolean>(true);
  const [targetPlatform, setTargetPlatform] = useState<PlatformId>(project.platform);
  const [exportAspectRatio, setExportAspectRatio] = useState<AspectRatio>(
    initialProfile.aspectRatio ?? project.aspectRatio
  );
  const [resolutionTier, setResolutionTier] = useState<ResolutionTier>(
    initialProfile.resolutionTier
  );
  const [codecPref, setCodecPref] = useState<CodecPreference>(initialProfile.codec);
  const [videoBitrateMbps, setVideoBitrateMbps] = useState<number>(initialProfile.videoBitrateMbps);
  const [audioBitrateKbps, setAudioBitrateKbps] = useState<number>(initialProfile.audioBitrateKbps);
  const [fps, setFps] = useState<30 | 60>(initialProfile.fps);

  const [previewTime, setPreviewTime] = useState<number>(0.2);
  const [showSafeZone, setShowSafeZone] = useState<boolean>(true);
  const [burnAiWatermark, setBurnAiWatermark] = useState<boolean>(true);
  const [transcodeToH264Mp4, setTranscodeToH264Mp4] = useState<boolean>(true);
  const [generatingPreview, setGeneratingPreview] = useState<boolean>(false);
  const [previewSnapshots, setPreviewSnapshots] = useState<
    Array<{ label: string; time: number; dataUrl: string }>
  >([]);

  const [rendering, setRendering] = useState(false);
  const [transcodingMp4, setTranscodingMp4] = useState(false);
  const [transcodeNote, setTranscodeNote] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [outputExt, setOutputExt] = useState<'mp4' | 'webm'>('mp4');
  const [actualBlobSize, setActualBlobSize] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedCopy, setCopiedCopy] = useState(false);

  const exportAudioRef = useRef<StudioAudioEngine | null>(null);
  const rafRef = useRef<number | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const totalDuration = getTotalDuration(project.clips);
  const activeProfile = PLATFORM_EXPORT_PROFILES[targetPlatform];

  const { outWidth, outHeight } = useMemo(() => {
    const baseW = resolutionTier === '1080p' ? 1080 : 720;
    const h =
      exportAspectRatio === '9:16'
        ? Math.round((baseW * 16) / 9)
        : Math.round((baseW * 5) / 4);
    return { outWidth: baseW, outHeight: h };
  }, [resolutionTier, exportAspectRatio]);

  const codecInfo = useMemo(() => resolveSupportedMimeType(codecPref), [codecPref]);

  const sizeEstimate = useMemo(() => {
    const totalBps = videoBitrateMbps * 1_000_000 + audioBitrateKbps * 1_000;
    const rawBytes = (totalBps * Math.max(0.5, totalDuration)) / 8;
    const estimatedBytes = rawBytes * 1.025; // WebM/container overhead
    const minBytes = estimatedBytes * 0.82;
    const maxBytes = estimatedBytes * 1.15;
    return {
      estimatedBytes,
      estimatedLabel: formatFileSize(estimatedBytes),
      rangeLabel: `${formatFileSize(minBytes)} – ${formatFileSize(maxBytes)}`,
    };
  }, [videoBitrateMbps, audioBitrateKbps, totalDuration]);

  const applyPlatformProfile = useCallback((pid: PlatformId) => {
    const profile = PLATFORM_EXPORT_PROFILES[pid];
    setTargetPlatform(pid);
    setExportAspectRatio(profile.aspectRatio);
    setResolutionTier(profile.resolutionTier);
    setCodecPref(profile.codec);
    setVideoBitrateMbps(profile.videoBitrateMbps);
    setAudioBitrateKbps(profile.audioBitrateKbps);
    setFps(profile.fps);
  }, []);

  const handleToggleMultiPlatformOptimize = (enabled: boolean) => {
    setMultiPlatformOptimize(enabled);
    if (enabled) {
      applyPlatformProfile(targetPlatform);
    }
  };

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (recorderRef.current && recorderRef.current.state === 'recording') {
        recorderRef.current.stop();
      }
      exportAudioRef.current?.stop();
    };
  }, []);

  useEffect(() => {
    return () => {
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    };
  }, [downloadUrl]);

  const drawPreviewFrame = useCallback(
    (timeSec: number) => {
      const canvas = previewCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const activeInfo = findClipAtTime(project.clips, timeSec);
      if (activeInfo) {
        const el = mediaCache.get(activeInfo.clip.assetId);
        if (el instanceof HTMLVideoElement) {
          const targetVidTime = clipVideoSeekSec(
            activeInfo.clip.trimStart,
            activeInfo.localTime,
            el.duration,
          );
          if (shouldSeekMedia(el.currentTime, targetVidTime, true)) {
            try {
              el.currentTime = targetVidTime;
            } catch {
              // ignore seek errors
            }
          }
        }
        if (activeInfo.clip.digitalHuman?.avatarAssetId) {
          const dhVid = mediaCache.get(activeInfo.clip.digitalHuman.avatarAssetId);
          if (dhVid instanceof HTMLVideoElement) {
            const targetDhTime = digitalHumanSeekSec(activeInfo.localTime, dhVid.duration);
            if (shouldSeekMedia(dhVid.currentTime, targetDhTime, true)) {
              try {
                dhVid.currentTime = targetDhTime;
              } catch {
                // ignore seek errors
              }
            }
          }
        }
      }

      renderTimelineFrame({
        ctx,
        width: outWidth,
        height: outHeight,
        timeSec,
        clips: project.clips,
        subtitles: project.subtitles,
        assetsMap,
        mediaCache,
        applyTransitionBlurToCanvas: true,
        voiceoverCues: project.voiceoverCues,
        voiceoverEnabled: Boolean(project.audio.voiceoverEnabled),
        showAiWatermark: burnAiWatermark,
      });
    },
    [
      project.clips,
      project.subtitles,
      project.voiceoverCues,
      project.audio.voiceoverEnabled,
      assetsMap,
      mediaCache,
      outWidth,
      outHeight,
      burnAiWatermark,
    ]
  );

  useEffect(() => {
    if (step === 'preview') {
      drawPreviewFrame(previewTime);
    }
  }, [step, previewTime, drawPreviewFrame]);

  const handleGeneratePreview = () => {
    if (project.clips.length === 0) return;
    setError(null);
    setProgress(0);
    setActualBlobSize(null);
    if (downloadUrl) {
      URL.revokeObjectURL(downloadUrl);
      setDownloadUrl(null);
    }
    setGeneratingPreview(true);

    const samplePoints = [
      { label: '开场画面', time: Math.min(totalDuration * 0.08, 0.35) },
      { label: '中段节奏', time: Number((totalDuration * 0.45).toFixed(2)) },
      { label: '高潮结尾', time: Number((totalDuration * 0.8).toFixed(2)) },
    ];

    window.setTimeout(() => {
      const offscreen = document.createElement('canvas');
      offscreen.width = Math.round(outWidth / 3);
      offscreen.height = Math.round(outHeight / 3);
      const octx = offscreen.getContext('2d');

      const snapshots: Array<{ label: string; time: number; dataUrl: string }> = [];
      if (octx) {
        samplePoints.forEach((pt) => {
          try {
            renderTimelineFrame({
              ctx: octx,
              width: offscreen.width,
              height: offscreen.height,
              timeSec: pt.time,
              clips: project.clips,
              subtitles: project.subtitles,
              assetsMap,
              mediaCache,
              applyTransitionBlurToCanvas: true,
              voiceoverCues: project.voiceoverCues,
              voiceoverEnabled: Boolean(project.audio.voiceoverEnabled),
              showAiWatermark: burnAiWatermark,
            });
            snapshots.push({
              label: pt.label,
              time: pt.time,
              dataUrl: offscreen.toDataURL('image/jpeg', 0.82),
            });
          } catch {
            // ignore tainted canvas fallback
          }
        });
      }

      setPreviewSnapshots(snapshots);
      setPreviewTime(samplePoints[0].time);
      setGeneratingPreview(false);
      setStep('preview');
    }, 140);
  };

  const handleStartRender = async () => {
    if (rendering || totalDuration <= 0) return;

    if (typeof MediaRecorder === 'undefined') {
      setError('当前浏览器不支持 MediaRecorder 视频录制，请使用最新版 Chrome 或 Edge。');
      return;
    }

    setError(null);
    setTranscodeNote(null);
    setProgress(0);
    setActualBlobSize(null);
    if (downloadUrl) {
      URL.revokeObjectURL(downloadUrl);
      setDownloadUrl(null);
    }

    const canvas = document.createElement('canvas');
    canvas.width = outWidth;
    canvas.height = outHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setError('无法初始化画布渲染上下文。');
      return;
    }

    const canvasStream = canvas.captureStream(fps);
    const audioEngine = new StudioAudioEngine();
    exportAudioRef.current = audioEngine;
    audioEngine.setConfig({
      preset: project.audio.bgmPreset,
      bpm: project.audio.bpm,
      volume: project.audio.volume,
      muted: false,
      customAudioUrl: project.audio.customAudioUrl,
    });
    audioEngine.setSfxEvents(project.sfxEvents ?? []);
    audioEngine.setVoiceoverConfig({
      cues: project.voiceoverCues ?? [],
      enabled: Boolean(project.audio.voiceoverEnabled),
      volume: project.audio.voiceoverVolume ?? 0.95,
      autoDucking: project.audio.bgmAutoDucking ?? true,
      denoiseEnabled: Boolean(project.audio.voiceDenoiseEnabled),
      denoiseStrength: project.audio.voiceDenoiseStrength ?? 0.72,
      denoiseProfile: project.audio.voiceDenoiseProfile,
    });

    await audioEngine.preloadVoiceoverCues();

    const audioStream = audioEngine.getExportAudioStream();
    const combinedTracks = [...canvasStream.getVideoTracks()];
    if (audioStream) {
      audioStream.getAudioTracks().forEach((t) => combinedTracks.push(t));
    }
    const combinedStream = new MediaStream(combinedTracks);

    const videoBitsPerSecond = Math.round(videoBitrateMbps * 1_000_000);
    const audioBitsPerSecond = Math.round(audioBitrateKbps * 1_000);

    try {
      let recorder: MediaRecorder;
      try {
        recorder = codecInfo.mimeType
          ? new MediaRecorder(combinedStream, {
              mimeType: codecInfo.mimeType,
              videoBitsPerSecond,
              audioBitsPerSecond,
            })
          : new MediaRecorder(combinedStream, { videoBitsPerSecond });
      } catch {
        recorder = codecInfo.mimeType
          ? new MediaRecorder(combinedStream, { mimeType: codecInfo.mimeType, videoBitsPerSecond })
          : new MediaRecorder(combinedStream);
      }

      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };
      recorder.onstop = () => {
        void (async () => {
          audioEngine.stop();
          const isNativeMp4 = isNativeH264Mp4Mime(codecInfo.mimeType);
          const outType = codecInfo.mimeType?.includes('mp4') ? 'video/mp4' : 'video/webm';
          const recordedBlob = new Blob(chunks, { type: outType });

          if (transcodeToH264Mp4 && !isNativeMp4 && recordedBlob.size > 0) {
            setTranscodingMp4(true);
            setTranscodeNote('浏览器录制格式非 H.264 MP4，正在服务端通过 FFmpeg 转码...');
            try {
              const headers: Record<string, string> = {
                'Content-Type': outType || 'video/webm',
              };
              const resp = await apiFetch(
                `/api/export/transcode-mp4?sourceExt=${outType.includes('mp4') ? 'mp4' : 'webm'}`,
                {
                  method: 'POST',
                  headers,
                  body: recordedBlob,
                }
              );
              if (!resp.ok) {
                const errJson = (await resp.json().catch(() => null)) as { error?: string } | null;
                throw new Error(errJson?.error || `转码服务返回 ${resp.status}`);
              }
              const mp4Blob = await resp.blob();
              if (mp4Blob.size > 0) {
                const mp4Url = URL.createObjectURL(mp4Blob);
                setActualBlobSize(mp4Blob.size);
                setOutputExt('mp4');
                setDownloadUrl(mp4Url);
                setTranscodeNote('已通过服务端 FFmpeg 转码为高兼容 H.264 MP4');
                setTranscodingMp4(false);
                setRendering(false);
                setProgress(100);
                return;
              }
            } catch (err: unknown) {
              const reason = err instanceof Error ? err.message : '服务端 FFmpeg 转码失败';
              setTranscodeNote(
                `${reason}（已为您保留原始 ${outType.includes('mp4') ? 'MP4' : 'WebM'} 成片供直接下载）`
              );
            } finally {
              setTranscodingMp4(false);
            }
          }

          const fallbackExt: 'mp4' | 'webm' = outType.includes('mp4') ? 'mp4' : 'webm';
          const url = URL.createObjectURL(recordedBlob);
          setActualBlobSize(recordedBlob.size);
          setOutputExt(fallbackExt);
          setDownloadUrl(url);
          setRendering(false);
          setProgress(100);
        })();
      };

      recorderRef.current = recorder;
      setRendering(true);
      recorder.start(200);
      audioEngine.start(0);

      let cursorSec = 0;
      let lastPerfMs = performance.now();
      let lastClipId: string | null = null;

      const stepFrame = (now: number) => {
        const step = advanceStudioCursor({
          cursorSec,
          lastPerfMs,
          nowMs: now,
          durationSec: totalDuration,
          loop: false,
        });
        cursorSec = step.cursorSec;
        lastPerfMs = step.lastPerfMs;
        const clamped = step.cursorSec;

        const activeInfo = findClipAtTime(project.clips, clamped);
        if (activeInfo) {
          const el = mediaCache.get(activeInfo.clip.assetId);
          if (el instanceof HTMLVideoElement) {
            const targetVidTime = clipVideoSeekSec(
              activeInfo.clip.trimStart,
              activeInfo.localTime,
              el.duration,
            );
            if (shouldSeekMedia(el.currentTime, targetVidTime, false)) {
              el.currentTime = targetVidTime;
            }
            if (el.paused) void el.play().catch(() => undefined);
          }
          if (activeInfo.clip.digitalHuman?.avatarAssetId) {
            const dhVid = mediaCache.get(activeInfo.clip.digitalHuman.avatarAssetId);
            if (dhVid instanceof HTMLVideoElement) {
              const targetDhTime = digitalHumanSeekSec(activeInfo.localTime, dhVid.duration);
              if (shouldSeekMedia(dhVid.currentTime, targetDhTime, false)) {
                dhVid.currentTime = targetDhTime;
              }
              if (dhVid.paused) void dhVid.play().catch(() => undefined);
            }
          }
          if (
            shouldWhooshOnClipChange({
              previousClipId: lastClipId,
              clipId: activeInfo.clip.id,
              transition: activeInfo.clip.transition,
              cursorSec: clamped,
              sfxTimes: (project.sfxEvents ?? []).map((ev) => ev.time),
            })
          ) {
            audioEngine.triggerTransitionWhoosh();
          }
          lastClipId = activeInfo.clip.id;
        }

        audioEngine.syncStep(clamped);

        renderTimelineFrame({
          ctx,
          width: outWidth,
          height: outHeight,
          timeSec: clamped,
          clips: project.clips,
          subtitles: project.subtitles,
          assetsMap,
          mediaCache,
          applyTransitionBlurToCanvas: true,
          voiceoverCues: project.voiceoverCues,
          voiceoverEnabled: Boolean(project.audio.voiceoverEnabled),
          showAiWatermark: burnAiWatermark,
        });

        setProgress(Math.min(99, Math.round((clamped / totalDuration) * 100)));

        if (!step.reachedEnd) {
          rafRef.current = requestAnimationFrame(stepFrame);
        } else if (recorder.state === 'recording') {
          recorder.stop();
        }
      };

      rafRef.current = requestAnimationFrame(stepFrame);
    } catch (err: unknown) {
      setRendering(false);
      setError(err instanceof Error ? err.message : '视频导出失败，请重试。');
    }
  };

  const handleDownloadSrt = () => {
    const srt = exportSrtSubtitles(project.subtitles);
    const blob = new Blob([srt], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${targetPlatform}_subtitles.srt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyPack = async () => {
    const pack = `${project.copy.title}\n\n${project.copy.caption}\n\n${project.copy.hashtags
      .map((h) => `#${h}`)
      .join(' ')}`;
    try {
      await navigator.clipboard.writeText(pack);
      setCopiedCopy(true);
      window.setTimeout(() => setCopiedCopy(false), 1800);
    } catch {
      // ignore
    }
  };

  const isNativeH264Mp4 = isNativeH264Mp4Mime(codecInfo.mimeType);
  const downloadExt = downloadUrl
    ? outputExt
    : transcodeToH264Mp4 || isNativeH264Mp4
      ? 'mp4'
      : 'webm';

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-modal-title"
    >
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl border border-zinc-800 bg-[#11141B] p-6 space-y-5 shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h2 id="export-modal-title" className="text-base font-bold text-zinc-100 font-display">
                导出成片 · {editionLabel(targetPlatform)}
              </h2>
              {multiPlatformOptimize && (
                <span className="px-2 py-0.5 rounded bg-rose-500/15 border border-rose-500/30 text-[10px] font-semibold text-rose-300">
                  平台优化已启用
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-zinc-400 font-mono-nums">
              {outWidth}×{outHeight} ({exportAspectRatio}) · {fps} fps · {videoBitrateMbps.toFixed(1)} Mbps ·{' '}
              {formatTimecode(totalDuration)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭导出窗口"
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 2-Step Bar */}
        <div className="grid grid-cols-2 gap-2 rounded-lg bg-[#0B0D10] p-1 border border-zinc-800">
          <button
            type="button"
            disabled={rendering}
            onClick={() => setStep('config')}
            className={`py-2 px-3 rounded-md text-xs font-semibold flex items-center justify-center gap-2 transition-colors ${
              step === 'config'
                ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-rose-400" />
            <span>1. 画幅与编码</span>
          </button>
          <button
            type="button"
            disabled={project.clips.length === 0 || rendering}
            onClick={() => {
              if (step === 'config') {
                handleGeneratePreview();
              }
            }}
            className={`py-2 px-3 rounded-md text-xs font-semibold flex items-center justify-center gap-2 transition-colors ${
              step === 'preview'
                ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Eye className="w-3.5 h-3.5 text-emerald-400" />
            <span>2. 导出预览与成片合成</span>
          </button>
        </div>

        {error && (
          <div className="rounded-lg border border-red-500/40 bg-red-950/30 p-3 text-xs text-red-200">
            {error}
          </div>
        )}

        {/* STEP 1: Multi-Platform Export Optimization & Encoding Config */}
        {step === 'config' && (
          <div className="space-y-4">
            {/* Multi-Platform Optimization Toggle */}
            <div className="rounded-lg border border-zinc-800 bg-[#0B0D10] p-4 space-y-3.5">
              <div className="flex items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="text-xs font-semibold text-zinc-100 flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-rose-400" />
                    <span>按这一版套用推荐编码</span>
                  </div>
                  <p className="text-[11px] text-zinc-400">
                    中文版和英文版各用一套竖屏画幅、码率和分辨率。导出的文件可以发到多个平台。
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={multiPlatformOptimize}
                  onClick={() => handleToggleMultiPlatformOptimize(!multiPlatformOptimize)}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                    multiPlatformOptimize ? 'bg-rose-600' : 'bg-zinc-700'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                      multiPlatformOptimize ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Platform Selection Cards */}
              <div className="grid grid-cols-2 gap-2.5">
                {(['douyin', 'tiktok'] as PlatformId[]).map((pid) => {
                  const prof = PLATFORM_EXPORT_PROFILES[pid];
                  const isSelected = targetPlatform === pid;
                  return (
                    <button
                      key={pid}
                      type="button"
                      onClick={() => {
                        if (multiPlatformOptimize) {
                          applyPlatformProfile(pid);
                        } else {
                          setTargetPlatform(pid);
                        }
                      }}
                      className={`p-3 rounded-lg border text-left transition-all ${
                        isSelected
                          ? 'border-rose-500/80 bg-rose-500/10 text-zinc-100'
                          : 'border-zinc-800 bg-[#11141B] text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-semibold">{prof.label}</span>
                        {isSelected && <Check className="w-3.5 h-3.5 text-rose-400 shrink-0" />}
                      </div>
                      <div className="mt-1.5 text-[10px] font-mono-nums text-zinc-300">
                        {prof.badgeText}
                      </div>
                      <div className="mt-0.5 text-[10px] text-zinc-500">{prof.encodingLabel}</div>
                    </button>
                  );
                })}
              </div>

              {multiPlatformOptimize && (
                <div className="rounded-md border border-zinc-800/80 bg-[#11141B] px-3 py-2 text-[11px] text-zinc-300 leading-relaxed">
                  <span className="text-rose-400 font-semibold mr-1.5">优化策略:</span>
                  {activeProfile.optimizationNote}
                </div>
              )}
            </div>

            {/* Detailed Encoding, Bitrate & Resolution Controls */}
            <div className="rounded-lg border border-zinc-800 bg-[#0B0D10] p-4 space-y-3.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-200">
                  编码参数 · 码率 · 分辨率配置
                </span>
                <span className="text-[11px] text-zinc-400 font-mono-nums">
                  {multiPlatformOptimize ? '平台自动预设（可微调）' : '手动自定义模式'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* Aspect Ratio */}
                <div className="space-y-1.5">
                  <label className="text-[11px] text-zinc-400 block">导出画面比例</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(['9:16', '4:5'] as AspectRatio[]).map((ratio) => (
                      <button
                        key={ratio}
                        type="button"
                        onClick={() => setExportAspectRatio(ratio)}
                        className={`py-1.5 px-2.5 rounded-md border text-xs font-mono-nums transition-colors ${
                          exportAspectRatio === ratio
                            ? 'border-rose-500 bg-rose-500/15 text-zinc-100 font-semibold'
                            : 'border-zinc-800 bg-[#11141B] text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        {ratio === '9:16' ? '9:16 竖屏' : '4:5 信息流'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Resolution Tier */}
                <div className="space-y-1.5">
                  <label className="text-[11px] text-zinc-400 block">导出分辨率</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(['1080p', '720p'] as ResolutionTier[]).map((tier) => (
                      <button
                        key={tier}
                        type="button"
                        onClick={() => setResolutionTier(tier)}
                        className={`py-1.5 px-2.5 rounded-md border text-xs font-mono-nums transition-colors ${
                          resolutionTier === tier
                            ? 'border-rose-500 bg-rose-500/15 text-zinc-100 font-semibold'
                            : 'border-zinc-800 bg-[#11141B] text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        {tier === '1080p' ? '1080p 超清' : '720p 极速'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Codec Preference */}
                <div className="space-y-1.5">
                  <label className="text-[11px] text-zinc-400 block">视频编码格式</label>
                  <select
                    value={codecPref}
                    onChange={(e) => setCodecPref(e.target.value as CodecPreference)}
                    className="w-full py-1.5 px-2.5 rounded-md border border-zinc-800 bg-[#11141B] text-xs text-zinc-200 focus:outline-none focus:border-rose-500"
                  >
                    <option value="vp9">VP9 + Opus (高清推荐)</option>
                    <option value="h264">H.264 / 高兼容优先</option>
                    <option value="vp8">VP8 + Opus (快速合成)</option>
                    <option value="auto">自动选择最佳支持编码</option>
                  </select>
                </div>

                {/* FPS */}
                <div className="space-y-1.5">
                  <label className="text-[11px] text-zinc-400 block">导出帧率</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {([30, 60] as const).map((f) => (
                      <button
                        key={f}
                        type="button"
                        onClick={() => setFps(f)}
                        className={`py-1.5 px-2.5 rounded-md border text-xs font-mono-nums transition-colors ${
                          fps === f
                            ? 'border-rose-500 bg-rose-500/15 text-zinc-100 font-semibold'
                            : 'border-zinc-800 bg-[#11141B] text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        {f} fps
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Bitrate Slider */}
              <div className="pt-1 space-y-1.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-zinc-400">目标视频码率</span>
                  <span className="font-mono-nums text-zinc-200 font-semibold">
                    {videoBitrateMbps.toFixed(1)} Mbps · 音频 {audioBitrateKbps} kbps
                  </span>
                </div>
                <input
                  type="range"
                  min={2.5}
                  max={12.0}
                  step={0.5}
                  value={videoBitrateMbps}
                  onChange={(e) => setVideoBitrateMbps(Number(e.target.value))}
                  className="w-full accent-rose-500 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-zinc-500 font-mono-nums">
                  <span>2.5 Mbps (轻量)</span>
                  <span>6.5 Mbps (均衡)</span>
                  <span>12.0 Mbps (母带级)</span>
                </div>
              </div>

              {/* AI Watermark & Server H.264 MP4 Transcode Options */}
              <div className="pt-2.5 border-t border-zinc-800/80 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="rounded-md border border-zinc-800 bg-[#11141B] p-2.5 flex items-center justify-between gap-2.5">
                  <div className="min-w-0">
                    <div className="text-[11px] font-semibold text-zinc-100">
                      「AI 生成」标识水印
                    </div>
                    <p className="text-[10px] text-zinc-400 mt-0.5 leading-snug">
                      默认开启，直接烧录至成片右上角
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={burnAiWatermark}
                    aria-label="AI 生成标识开关"
                    onClick={() => setBurnAiWatermark((v) => !v)}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                      burnAiWatermark ? 'bg-rose-600' : 'bg-zinc-700'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                        burnAiWatermark ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                <div className="rounded-md border border-zinc-800 bg-[#11141B] p-2.5 flex items-center justify-between gap-2.5">
                  <div className="min-w-0">
                    <div className="text-[11px] font-semibold text-zinc-100">
                      自动转码 H.264 MP4
                    </div>
                    <p className="text-[10px] text-zinc-400 mt-0.5 leading-snug">
                      {isNativeH264Mp4
                        ? '浏览器已原生支持 H.264 MP4'
                        : '非 H.264 MP4 时服务端 FFmpeg 转码'}
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={transcodeToH264Mp4}
                    aria-label="自动转码 H.264 MP4"
                    onClick={() => setTranscodeToH264Mp4((v) => !v)}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                      transcodeToH264Mp4 ? 'bg-emerald-600' : 'bg-zinc-700'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                        transcodeToH264Mp4 ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>

            {/* Live Pre-Preview Estimate Bar + CTA */}
            <div className="rounded-lg border border-zinc-800 bg-[#0E1015] p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <div className="text-xs font-semibold text-zinc-200 font-mono-nums">
                  预计导出：{outWidth}×{outHeight} ({exportAspectRatio}) · 约 {sizeEstimate.estimatedLabel}
                </div>
                <div className="text-[11px] text-zinc-400">
                  实际编码：{codecInfo.codecDisplayLabel}
                </div>
              </div>
              <button
                type="button"
                disabled={project.clips.length === 0 || generatingPreview}
                onClick={handleGeneratePreview}
                className="py-2.5 px-4 rounded-lg bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-xs font-semibold text-white flex items-center justify-center gap-2 transition-colors shrink-0"
              >
                {generatingPreview ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>正在生成预览...</span>
                  </>
                ) : (
                  <>
                    <Eye className="w-4 h-4" />
                    <span>生成导出预览</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: Export Preview & Final Render */}
        {step === 'preview' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
              {/* Left: Real Aspect Ratio Frame Preview */}
              <div className="md:col-span-5 rounded-lg border border-zinc-800 bg-[#0B0D10] p-3 flex flex-col items-center justify-between gap-3">
                <div className="w-full flex items-center justify-between text-[11px] text-zinc-400">
                  <span className="font-medium text-zinc-200">成片画面预览</span>
                  <button
                    type="button"
                    onClick={() => setShowSafeZone((v) => !v)}
                    className={`px-2 py-0.5 rounded border text-[10px] transition-colors ${
                      showSafeZone
                        ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300'
                        : 'border-zinc-700 bg-zinc-900 text-zinc-400'
                    }`}
                  >
                    {showSafeZone ? '隐藏安全区' : '显示安全区'}
                  </button>
                </div>

                {/* Aspect-matched preview frame */}
                <div
                  className="relative w-full max-w-[210px] rounded-md overflow-hidden border border-zinc-700 bg-black shadow-lg"
                  style={{
                    aspectRatio: exportAspectRatio === '9:16' ? '9 / 16' : '4 / 5',
                  }}
                >
                  <canvas
                    ref={previewCanvasRef}
                    width={outWidth}
                    height={outHeight}
                    className="w-full h-full object-contain block"
                  />

                  {/* Platform UI Safe-Zone Overlay */}
                  {showSafeZone && (
                    <div className="pointer-events-none absolute inset-0">
                      <div className="absolute inset-x-2 top-2 bottom-2 border border-dashed border-emerald-400/50 rounded-sm" />
                      {exportAspectRatio === '9:16' && (
                        <>
                          <div className="absolute right-1.5 bottom-16 w-6 h-24 rounded bg-rose-500/20 border border-rose-400/40 flex items-center justify-center">
                            <span className="text-[8px] text-rose-200 -rotate-90 whitespace-nowrap">
                              互动区
                            </span>
                          </div>
                          <div className="absolute left-2 right-10 bottom-2 h-10 rounded bg-amber-500/15 border border-amber-400/40 flex items-center px-1.5">
                            <span className="text-[8px] text-amber-200 truncate">
                              文案与话题避让区
                            </span>
                          </div>
                        </>
                      )}
                      {exportAspectRatio === '4:5' && (
                        <div className="absolute inset-x-2 bottom-2 h-8 rounded bg-sky-500/15 border border-sky-400/40 flex items-center justify-center">
                          <span className="text-[8px] text-sky-200">Feed 信息流底部安全边</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Scrubber + Keyframe Snapshots */}
                <div className="w-full space-y-2">
                  <div className="flex items-center justify-between text-[10px] text-zinc-400 font-mono-nums">
                    <span>预览时间点</span>
                    <span>
                      {formatTimecode(previewTime)} / {formatTimecode(totalDuration)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={Math.max(0.1, totalDuration)}
                    step={0.05}
                    value={previewTime}
                    onChange={(e) => setPreviewTime(Number(e.target.value))}
                    className="w-full accent-emerald-500 cursor-pointer"
                  />
                  {previewSnapshots.length > 0 && (
                    <div className="grid grid-cols-3 gap-1.5">
                      {previewSnapshots.map((snap) => (
                        <button
                          key={snap.label}
                          type="button"
                          onClick={() => setPreviewTime(snap.time)}
                          className={`group rounded border overflow-hidden text-left transition-colors ${
                            Math.abs(previewTime - snap.time) < 0.15
                              ? 'border-emerald-500'
                              : 'border-zinc-800 hover:border-zinc-600'
                          }`}
                        >
                          <img
                            src={snap.dataUrl}
                            alt={snap.label}
                            className="w-full h-11 object-cover bg-black"
                          />
                          <div className="px-1 py-0.5 text-[9px] text-zinc-300 bg-[#11141B] truncate text-center">
                            {snap.label}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Right: Aspect Ratio, Size Estimate & Render Box */}
              <div className="md:col-span-7 flex flex-col justify-between gap-3">
                <div className="rounded-lg border border-zinc-800 bg-[#0B0D10] p-4 space-y-3">
                  <div className="text-xs font-semibold text-zinc-200">导出预检与文件估算</div>

                  {/* Key Metrics Grid */}
                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="rounded-md border border-zinc-800 bg-[#11141B] p-3 space-y-1">
                      <div className="text-[10px] text-zinc-400 flex items-center gap-1.5">
                        <Maximize2 className="w-3 h-3 text-rose-400" />
                        <span>最终画面比例</span>
                      </div>
                      <div className="text-sm font-bold text-zinc-100 font-mono-nums">
                        {exportAspectRatio} · {outWidth}×{outHeight}
                      </div>
                      <div className="text-[10px] text-zinc-500">
                        {exportAspectRatio === '9:16' ? '竖屏全屏比例' : 'Feed 信息流比例'} · {fps} fps
                      </div>
                    </div>

                    <div className="rounded-md border border-zinc-800 bg-[#11141B] p-3 space-y-1">
                      <div className="text-[10px] text-zinc-400 flex items-center gap-1.5">
                        <HardDrive className="w-3 h-3 text-emerald-400" />
                        <span>预计文件大小</span>
                      </div>
                      <div className="text-sm font-bold text-emerald-300 font-mono-nums">
                        ≈ {sizeEstimate.estimatedLabel}
                      </div>
                      <div className="text-[10px] text-zinc-500 font-mono-nums">
                        VBR 区间：{sizeEstimate.rangeLabel}
                      </div>
                    </div>
                  </div>

                  {/* Encoding & Track Checklist */}
                  <div className="rounded-md border border-zinc-800/80 bg-[#11141B] p-3 space-y-1.5 text-[11px]">
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-400">目标平台优化</span>
                      <span className="text-zinc-200 font-medium">
                        {multiPlatformOptimize ? `${activeProfile.label} 自动预设` : '自定义配置'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-400">编码与封装</span>
                      <span className="text-zinc-200 font-mono-nums">
                        {codecInfo.codecDisplayLabel}
                        {!isNativeH264Mp4 && transcodeToH264Mp4 ? ' → H.264 MP4' : ''}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-400">AI 生成角标</span>
                      <button
                        type="button"
                        onClick={() => setBurnAiWatermark((v) => !v)}
                        className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                          burnAiWatermark
                            ? 'border-rose-500/50 bg-rose-500/15 text-rose-200'
                            : 'border-zinc-700 bg-zinc-900 text-zinc-400'
                        }`}
                      >
                        {burnAiWatermark ? '已开启 · 烧录右上角' : '已关闭'}
                      </button>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-400">目标码率</span>
                      <span className="text-zinc-200 font-mono-nums">
                        视频 {videoBitrateMbps.toFixed(1)} Mbps + 音频 {audioBitrateKbps} kbps
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-400">合成轨道</span>
                      <span className="text-zinc-300">
                        {project.clips.length} 镜头 · {project.subtitles.length} 字幕 ·{' '}
                        {project.audio.voiceoverEnabled ? '含AI配音' : '配乐音轨'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Render Progress & Action */}
                <div className="rounded-lg border border-zinc-800 bg-[#0B0D10] p-4 space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-zinc-300 font-medium flex items-center gap-2">
                      <Film className="w-4 h-4 text-rose-400" />
                      <span>
                        {actualBlobSize !== null
                          ? `渲染完成 · 实际大小 ${formatFileSize(actualBlobSize)}`
                          : '视频渲染合成 (画面 + 音轨)'}
                      </span>
                    </span>
                    <span className="font-mono-nums text-zinc-400">{progress}%</span>
                  </div>

                  <div className="h-2 w-full rounded-full bg-zinc-800 overflow-hidden">
                    <div
                      className="h-full bg-rose-500 transition-all duration-150"
                      style={{ width: `${progress}%` }}
                    />
                  </div>

                  {transcodeNote && (
                    <div className="rounded-md border border-zinc-800 bg-[#11141B] px-2.5 py-1.5 text-[11px] text-zinc-300 leading-snug">
                      {transcodeNote}
                    </div>
                  )}

                  <div className="flex items-center gap-2 pt-1">
                    {!rendering && (
                      <button
                        type="button"
                        onClick={() => setStep('config')}
                        className="py-2.5 px-3 rounded-lg border border-zinc-800 bg-[#11141B] hover:bg-zinc-800 text-xs font-medium text-zinc-300 flex items-center gap-1.5 transition-colors shrink-0"
                      >
                        <ArrowLeft className="w-3.5 h-3.5" />
                        <span>调整参数</span>
                      </button>
                    )}

                    {!downloadUrl ? (
                      <button
                        type="button"
                        disabled={rendering || project.clips.length === 0}
                        onClick={handleStartRender}
                        className="w-full py-2.5 px-4 rounded-lg bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-xs font-semibold text-white flex items-center justify-center gap-2 transition-colors"
                      >
                        {rendering ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>
                              {transcodingMp4
                                ? '正在服务端 FFmpeg 转码 H.264 MP4...'
                                : `正在实时合成视频帧 (${progress}%)...`}
                            </span>
                          </>
                        ) : (
                          <>
                            <Video className="w-4 h-4" />
                            <span>开始合成并导出视频</span>
                          </>
                        )}
                      </button>
                    ) : (
                      <a
                        href={downloadUrl}
                        download={`clipflow_${targetPlatform}_${exportAspectRatio.replace(':', 'x')}_${resolutionTier}.${downloadExt}`}
                        className="w-full py-2.5 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white flex items-center justify-center gap-2 transition-colors"
                      >
                        <Download className="w-4 h-4" />
                        <span>
                          下载成片 (.{downloadExt} · {actualBlobSize ? formatFileSize(actualBlobSize) : sizeEstimate.estimatedLabel})
                        </span>
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Footer quick exports: SRT + Copy */}
        <div className="grid grid-cols-2 gap-3 pt-1 border-t border-zinc-800/70">
          <button
            type="button"
            onClick={handleDownloadSrt}
            className="py-2.5 px-3 rounded-lg border border-zinc-800 bg-[#0E1015] hover:bg-zinc-800 text-xs font-medium text-zinc-200 flex items-center justify-center gap-2 transition-colors"
          >
            <FileText className="w-3.5 h-3.5 text-zinc-400" />
            <span>导出字幕 (.srt)</span>
          </button>

          <button
            type="button"
            onClick={handleCopyPack}
            className="py-2.5 px-3 rounded-lg border border-zinc-800 bg-[#0E1015] hover:bg-zinc-800 text-xs font-medium text-zinc-200 flex items-center justify-center gap-2 transition-colors"
          >
            {copiedCopy ? (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Copy className="w-3.5 h-3.5 text-zinc-400" />
            )}
            <span>{copiedCopy ? '已复制发布文案' : '复制标题与标签'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
