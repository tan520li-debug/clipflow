import { useEffect, useRef, useState } from 'react';
import {
  Check,
  Loader2,
  Mic,
  Play,
  RotateCcw,
  Sparkles,
  Square,
  Upload,
  Volume2,
  X,
} from 'lucide-react';
import type { ClonedVoiceProfile } from '../types/studio';
import { apiFetch } from '../client/api/http';

interface VoiceCloneModalProps {
  onClose: () => void;
  onSaveProfile: (profile: ClonedVoiceProfile, activateNow: boolean) => void;
}

const TARGET_RECORD_SEC = 30;
const MIN_RECORD_SEC = 5;

const READING_SCRIPTS = [
  {
    id: 'casual',
    label: '日常种草口播稿',
    text: '嗨大家好！今天想跟你们分享一个我最近每天早上都会坚持的三分钟小习惯。其实很多时候，把生活过得有质感并不需要多复杂的设备，关键在于找到真正顺手、舒服的节奏。你看这杯刚萃好的浓缩，加上冰燕麦奶，香气一下子就出来了。如果你也喜欢这种安静又高效的早晨，记得点个赞收藏一下，明天早上咱们一起试试看！',
  },
  {
    id: 'narrative',
    label: '情感叙事旁白稿',
    text: '在忙碌的城市节奏里，我们总是在追赶下一个节点，却很少停下来听听自己内心的声音。清晨七点的阳光斜斜洒在桌面上，咖啡壶里升起的第一缕热气，像是给这一天按下了温柔的启动键。不用急着解释所有选择，把每一个微小的当下认真对待，时间自然会给出最好的答案。',
  },
];

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      resolve(result.includes(',') ? result.split(',')[1] : result);
    };
    reader.onerror = () => reject(new Error('音频文件读取失败'));
    reader.readAsDataURL(blob);
  });
}

export function VoiceCloneModal({ onClose, onSaveProfile }: VoiceCloneModalProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [voiceName, setVoiceName] = useState('我的专属口播音色');
  const [scriptId, setScriptId] = useState<string>('casual');

  // Step 1: 30s Mic Recording / Upload State
  const [isRecording, setIsRecording] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [recordedDuration, setRecordedDuration] = useState(0);
  const [micLevel, setMicLevel] = useState(0);
  const [recordError, setMicError] = useState<string | null>(null);

  // Step 2: Training Progress State
  const [trainingStage, setTrainingStage] = useState(0);
  const [trainError, setTrainError] = useState<string | null>(null);

  // Step 3: Trained Cloned Voice Profile & Live Audition
  const [trainedProfile, setTrainedProfile] = useState<ClonedVoiceProfile | null>(null);
  const [testSentence, setTestSentence] = useState(
    '大家好，这是我刚刚训练完成的个人专属音色，以后剪视频再也不用反复重录啦！'
  );
  const [auditionLoading, setAuditionLoading] = useState(false);
  const [auditionError, setAuditionError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafMeterRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const autoStopTriggeredRef = useRef(false);
  const fileUploadRef = useRef<HTMLInputElement | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const waveCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const activeScript = READING_SCRIPTS.find((s) => s.id === scriptId) ?? READING_SCRIPTS[0];

  useEffect(() => {
    return () => {
      stopStreamsAndTimers();
      if (recordedUrl) URL.revokeObjectURL(recordedUrl);
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
        previewAudioRef.current = null;
      }
    };
  }, [recordedUrl]);

  const stopStreamsAndTimers = () => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (rafMeterRef.current !== null) {
      cancelAnimationFrame(rafMeterRef.current);
      rafMeterRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        // ignore
      }
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      void audioCtxRef.current.close().catch(() => undefined);
      audioCtxRef.current = null;
    }
    setMicLevel(0);
  };

  const resetRecording = () => {
    stopStreamsAndTimers();
    setIsRecording(false);
    setElapsedSec(0);
    setRecordedBlob(null);
    setRecordedDuration(0);
    if (recordedUrl) {
      URL.revokeObjectURL(recordedUrl);
      setRecordedUrl(null);
    }
    setMicError(null);
  };

  const handleToggleRecording = async () => {
    setMicError(null);
    if (isRecording) {
      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
      setIsRecording(false);
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setMicError('当前浏览器不支持麦克风录制，请点击右下方「导入本地朗读音频」上传干声。');
      return;
    }

    resetRecording();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;
      autoStopTriggeredRef.current = false;

      // Setup Web Audio live waveform & volume meter
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);
      const freqData = new Uint8Array(analyser.frequencyBinCount);

      const drawMeter = () => {
        analyser.getByteFrequencyData(freqData);
        let sum = 0;
        for (let i = 0; i < freqData.length; i++) sum += freqData[i];
        const avg = sum / Math.max(1, freqData.length);
        setMicLevel(Math.min(1, avg / 110));

        const canvas = waveCanvasRef.current;
        if (canvas) {
          const c2d = canvas.getContext('2d');
          if (c2d) {
            const w = canvas.width;
            const h = canvas.height;
            c2d.clearRect(0, 0, w, h);
            const barCount = 32;
            const gap = 3;
            const barW = (w - gap * (barCount - 1)) / barCount;
            for (let i = 0; i < barCount; i++) {
              const val = freqData[i % freqData.length] / 255;
              const barH = Math.max(4, val * (h - 6));
              const x = i * (barW + gap);
              const y = (h - barH) / 2;
              c2d.fillStyle = val > 0.45 ? '#34d399' : '#fb7185';
              c2d.fillRect(x, y, barW, barH);
            }
          }
        }
        rafMeterRef.current = requestAnimationFrame(drawMeter);
      };
      rafMeterRef.current = requestAnimationFrame(drawMeter);

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

      recorder.onstop = () => {
        const finalSec = Number(((performance.now() - startedAt) / 1000).toFixed(1));
        stopStreamsAndTimers();
        setIsRecording(false);

        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        if (blob.size < 400 || finalSec < 1.2) {
          setMicError('录音过短或未检测到语音信号，请靠近麦克风重试。');
          return;
        }
        setRecordedBlob(blob);
        setRecordedDuration(finalSec);
        setElapsedSec(finalSec);
        const url = URL.createObjectURL(blob);
        setRecordedUrl(url);
      };

      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      recorder.start(150);

      timerRef.current = window.setInterval(() => {
        const sec = (performance.now() - startedAt) / 1000;
        setElapsedSec(Math.min(TARGET_RECORD_SEC, sec));
        if (sec >= TARGET_RECORD_SEC && !autoStopTriggeredRef.current) {
          autoStopTriggeredRef.current = true;
          if (recorder.state === 'recording') {
            recorder.stop();
          }
        }
      }, 100);
    } catch {
      stopStreamsAndTimers();
      setIsRecording(false);
      setMicError('未能开启麦克风，请在浏览器地址栏允许麦克风权限或导入本地音频文件。');
    }
  };

  const handleUploadSampleFile = (file: File) => {
    resetRecording();
    const url = URL.createObjectURL(file);
    const probe = new Audio(url);
    probe.onloadedmetadata = () => {
      const dur = Number((probe.duration || 30).toFixed(1));
      setRecordedBlob(file);
      setRecordedUrl(url);
      setRecordedDuration(dur);
      setElapsedSec(Math.min(TARGET_RECORD_SEC, dur));
    };
    probe.onerror = () => {
      setRecordedBlob(file);
      setRecordedUrl(url);
      setRecordedDuration(30);
      setElapsedSec(30);
    };
  };

  const handleStartTraining = async () => {
    if (!recordedBlob) return;
    setStep(2);
    setTrainError(null);
    setTrainingStage(1);

    const stageTimer1 = window.setTimeout(() => setTrainingStage(2), 1100);
    const stageTimer2 = window.setTimeout(() => setTrainingStage(3), 2400);

    try {
      const audioBase64 = await blobToBase64(recordedBlob);
      const res = await apiFetch('/api/voice-clone/train', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          voiceName: voiceName.trim() || '我的专属音色',
          audioBase64,
          mimeType: recordedBlob.type || 'audio/webm',
          durationSec: recordedDuration || elapsedSec || 30,
          previewSentence: testSentence,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data?.profile) {
        throw new Error(data?.error || 'AI 声音克隆建模失败，请重试。');
      }

      const profile = data.profile as ClonedVoiceProfile;
      setTrainedProfile(profile);
      setStep(3);
      if (profile.samplePreviewBase64) {
        playBase64Audio(
          profile.samplePreviewBase64,
          profile.samplePreviewMimeType || 'audio/wav'
        );
      }
    } catch (err: unknown) {
      setTrainError(err instanceof Error ? err.message : '模型训练请求失败，请检查网络后重试。');
    } finally {
      window.clearTimeout(stageTimer1);
      window.clearTimeout(stageTimer2);
    }
  };

  const playBase64Audio = (b64: string, mime = 'audio/wav') => {
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current = null;
    }
    const clean = b64.includes(',') ? b64.split(',')[1] : b64;
    const audioEl = new Audio(`data:${mime};base64,${clean}`);
    previewAudioRef.current = audioEl;
    void audioEl.play().catch(() => undefined);
  };

  const handleSynthesizeTestSentence = async () => {
    if (!trainedProfile || !testSentence.trim()) return;
    setAuditionLoading(true);
    setAuditionError(null);

    try {
      const res = await apiFetch('/api/voice-clone/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baseVoice: trainedProfile.baseVoice,
          voiceDesignPrompt: trainedProfile.voiceDesignPrompt,
          text: testSentence.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.audioBase64) {
        throw new Error(data?.error || '试听生成失败，请重试。');
      }
      playBase64Audio(data.audioBase64, data.mimeType || 'audio/wav');
    } catch (err: unknown) {
      setAuditionError(err instanceof Error ? err.message : '试听生成失败，请重试。');
    } finally {
      setAuditionLoading(false);
    }
  };

  const progressPct = Math.min(100, Math.round((elapsedSec / TARGET_RECORD_SEC) * 100));

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="voice-clone-modal-title"
    >
      <div className="w-full max-w-xl rounded-xl border border-zinc-800 bg-[#11141B] p-6 space-y-5 shadow-2xl">
        {/* Modal Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2
              id="voice-clone-modal-title"
              className="text-base font-bold text-zinc-100 flex items-center gap-2 font-display"
            >
              <Sparkles className="w-4 h-4 text-emerald-400" />
              <span>AI 声音克隆 · 专属音色引导向导</span>
            </h2>
            <p className="mt-1 text-xs text-zinc-400">
              录制 30 秒个人朗读音频，自动提取声纹音调、气声质感与语速节奏，生成个性化语音合成音色
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              stopStreamsAndTimers();
              onClose();
            }}
            aria-label="关闭声音克隆向导"
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 3-Step Indicator */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { num: 1, title: '1. 录制 30s 个人朗读' },
            { num: 2, title: '2. 上传训练声学模型' },
            { num: 3, title: '3. 试听并启用音色' },
          ].map((item) => {
            const active = step === item.num;
            const done = step > item.num;
            return (
              <div
                key={item.num}
                className={`rounded-lg border px-3 py-2 text-[11px] font-medium flex items-center gap-1.5 transition-colors ${
                  active
                    ? 'border-emerald-500/70 bg-emerald-500/12 text-emerald-200'
                    : done
                      ? 'border-emerald-500/30 bg-emerald-950/30 text-emerald-300'
                      : 'border-zinc-800 bg-[#0B0D10] text-zinc-500'
                }`}
              >
                {done ? <Check className="w-3.5 h-3.5 shrink-0" /> : null}
                <span className="truncate">{item.title}</span>
              </div>
            );
          })}
        </div>

        {/* STEP 1: Guided 30s Recording */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="clone-voice-name" className="block text-[11px] text-zinc-400 mb-1">
                  自定义音色名称
                </label>
                <input
                  id="clone-voice-name"
                  type="text"
                  value={voiceName}
                  onChange={(e) => setVoiceName(e.target.value)}
                  maxLength={24}
                  placeholder="例如：阿泽自然口播"
                  className="w-full rounded-lg bg-[#0B0D10] border border-zinc-800 px-3 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <span className="block text-[11px] text-zinc-400 mb-1">朗读引导词风格</span>
                <div className="grid grid-cols-2 gap-1.5">
                  {READING_SCRIPTS.map((sc) => (
                    <button
                      key={sc.id}
                      type="button"
                      onClick={() => setScriptId(sc.id)}
                      className={`py-1.5 px-2 rounded-lg border text-[11px] font-medium transition-colors truncate ${
                        scriptId === sc.id
                          ? 'border-emerald-500/70 bg-emerald-500/15 text-emerald-200'
                          : 'border-zinc-800 bg-[#0B0D10] text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      {sc.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Teleprompter Card */}
            <div className="rounded-lg border border-zinc-800 bg-[#0B0D10] p-4 space-y-2">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-semibold text-emerald-300">
                  朗读提词器（请用平时拍视频的自然语速朗读以下段落）
                </span>
                <span className="text-zinc-500">建议保持安静环境 · 距麦 15cm</span>
              </div>
              <p className="text-sm leading-relaxed text-zinc-100 font-medium tracking-wide">
                “{activeScript.text}”
              </p>
            </div>

            {/* Live Progress & Waveform Visualizer */}
            <div className="rounded-lg border border-zinc-800 bg-[#0B0D10] p-3.5 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-300 font-medium flex items-center gap-2">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      isRecording
                        ? 'bg-red-500 animate-pulse'
                        : recordedBlob
                          ? 'bg-emerald-400'
                          : 'bg-zinc-600'
                    }`}
                  />
                  <span>
                    {isRecording
                      ? '正在采集中 · 请自然朗读上方文字'
                      : recordedBlob
                        ? `已完成录制 (${recordedDuration.toFixed(1)} 秒)`
                        : '准备就绪 · 点击下方按钮开始 30 秒录制'}
                  </span>
                </span>
                <span className="font-mono-nums text-emerald-300 font-semibold">
                  {elapsedSec.toFixed(1)}s / {TARGET_RECORD_SEC}s
                </span>
              </div>

              <div className="h-2 w-full rounded-full bg-zinc-800 overflow-hidden">
                <div
                  className={`h-full transition-all duration-100 ${
                    elapsedSec >= TARGET_RECORD_SEC
                      ? 'bg-emerald-500'
                      : isRecording
                        ? 'bg-rose-500'
                        : 'bg-emerald-500/80'
                  }`}
                  style={{ width: `${progressPct}%` }}
                />
              </div>

              {isRecording ? (
                <div className="flex items-center gap-3 pt-1">
                  <canvas
                    ref={waveCanvasRef}
                    width={420}
                    height={36}
                    className="flex-1 h-9 rounded bg-[#11141B] border border-zinc-800/80"
                  />
                  <span className="text-[10px] font-mono-nums text-zinc-400 w-16 text-right">
                    电平 {Math.round(micLevel * 100)}%
                  </span>
                </div>
              ) : null}

              {recordedUrl && !isRecording && (
                <div className="pt-1 flex items-center gap-2">
                  <audio controls src={recordedUrl} className="w-full h-8" />
                </div>
              )}

              {recordError && (
                <div className="rounded border border-red-500/40 bg-red-950/30 p-2 text-[11px] text-red-200">
                  {recordError}
                </div>
              )}

              <input
                ref={fileUploadRef}
                type="file"
                accept="audio/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleUploadSampleFile(f);
                  e.target.value = '';
                }}
              />

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => void handleToggleRecording()}
                  className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                    isRecording
                      ? 'bg-red-600 hover:bg-red-500 text-white'
                      : 'bg-rose-600 hover:bg-rose-500 text-white'
                  }`}
                >
                  {isRecording ? (
                    <>
                      <Square className="w-3.5 h-3.5 fill-current" />
                      <span>
                        {elapsedSec < MIN_RECORD_SEC
                          ? `录制中 (建议至少 ${MIN_RECORD_SEC}s，推荐满 30s)...`
                          : '提前结束录制并预览'}
                      </span>
                    </>
                  ) : (
                    <>
                      <Mic className="w-3.5 h-3.5" />
                      <span>{recordedBlob ? '重新录制 30 秒样本' : '开始 30 秒麦克风录制'}</span>
                    </>
                  )}
                </button>

                {!isRecording && (
                  <button
                    type="button"
                    onClick={() => fileUploadRef.current?.click()}
                    className="py-2 px-3 rounded-lg border border-zinc-700 bg-[#11141B] hover:bg-zinc-800 text-xs text-zinc-200 flex items-center gap-1.5 transition-colors"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>上传本地干声</span>
                  </button>
                )}

                {recordedBlob && !isRecording && (
                  <button
                    type="button"
                    onClick={resetRecording}
                    title="清空当前录音"
                    className="p-2 rounded-lg border border-zinc-800 bg-[#11141B] hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 pt-1">
              <span className="text-[11px] text-zinc-500">
                {recordedBlob
                  ? recordedDuration < 15
                    ? `当前时长 ${recordedDuration.toFixed(1)}s（可训练，但录制接近 30s 音色还原更稳）`
                    : `样本时长 ${recordedDuration.toFixed(1)}s 充足，可开始上传训练`
                  : '点击开始录制后，按上方提词器正常朗读 30 秒即可'}
              </span>

              <button
                type="button"
                disabled={!recordedBlob || isRecording || recordedDuration < 2}
                onClick={() => void handleStartTraining()}
                className="py-2.5 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-45 disabled:cursor-not-allowed text-xs font-semibold text-white flex items-center gap-1.5 transition-colors shrink-0"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>上传音频并训练音色</span>
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: Training Progress */}
        {step === 2 && (
          <div className="rounded-lg border border-zinc-800 bg-[#0B0D10] p-5 space-y-4">
            {!trainError ? (
              <>
                <div className="flex items-center gap-3">
                  <Loader2 className="w-5 h-5 animate-spin text-emerald-400 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-zinc-100">
                      正在为「{voiceName || '我的专属音色'}」进行声纹特征建模...
                    </p>
                    <p className="text-xs text-zinc-400 mt-0.5">
                      基于上传的 {recordedDuration.toFixed(1)} 秒原声样本提取个人音高、语速节奏与呼吸质感
                    </p>
                  </div>
                </div>

                <div className="space-y-2 pt-2">
                  {[
                    { id: 1, label: '上传 30s 个人朗读样本并完成降噪解析' },
                    { id: 2, label: '提取基频音域、共振峰暖度、停顿习惯与气声特征' },
                    { id: 3, label: '构建 Voice Design 专属声线参数并合成首条试听样音' },
                  ].map((s) => {
                    const done = trainingStage > s.id;
                    const active = trainingStage === s.id;
                    return (
                      <div
                        key={s.id}
                        className={`flex items-center gap-2.5 text-xs rounded-md px-3 py-2 border ${
                          done
                            ? 'border-emerald-500/35 bg-emerald-950/25 text-emerald-200'
                            : active
                              ? 'border-zinc-700 bg-[#11141B] text-zinc-100'
                              : 'border-zinc-800/60 bg-[#0E1015] text-zinc-500'
                        }`}
                      >
                        {done ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        ) : active ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400 shrink-0" />
                        ) : (
                          <span className="w-3.5 h-3.5 inline-block text-center font-mono-nums">
                            {s.id}
                          </span>
                        )}
                        <span>{s.label}</span>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-red-200 bg-red-950/30 border border-red-500/40 rounded-lg p-3 leading-relaxed">
                  {trainError}
                </p>
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="py-2 px-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-200"
                  >
                    返回重录
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleStartTraining()}
                    className="py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white"
                  >
                    重试训练
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* STEP 3: Trained Profile Preview & Save */}
        {step === 3 && trainedProfile && (
          <div className="space-y-4">
            <div className="rounded-lg border border-emerald-500/40 bg-emerald-950/20 p-4 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="text-sm font-bold text-zinc-100">{trainedProfile.name}</span>
                </div>
                <span className="text-[11px] font-mono-nums text-emerald-300">
                  基底声学：{trainedProfile.baseVoice} · {trainedProfile.speakingPace}
                </span>
              </div>

              <p className="text-xs text-zinc-300 leading-relaxed">
                {trainedProfile.timbreSummary}
              </p>

              <div className="flex flex-wrap gap-1.5 text-[11px] text-emerald-200">
                {trainedProfile.vocalTags.map((tag, i) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1"
                  >
                    {i > 0 && <span className="text-zinc-600">·</span>}
                    <span>{tag}</span>
                  </span>
                ))}
              </div>
            </div>

            {/* Live Audition Tester */}
            <div className="rounded-lg border border-zinc-800 bg-[#0B0D10] p-3.5 space-y-2.5">
              <div className="flex items-center justify-between text-[11px]">
                <label htmlFor="clone-test-text" className="text-zinc-300 font-medium">
                  输入任意文本测试你的克隆音色合成效果
                </label>
                {trainedProfile.samplePreviewBase64 && (
                  <button
                    type="button"
                    onClick={() =>
                      playBase64Audio(
                        trainedProfile.samplePreviewBase64!,
                        trainedProfile.samplePreviewMimeType || 'audio/wav'
                      )
                    }
                    className="text-emerald-300 hover:text-emerald-200 flex items-center gap-1"
                  >
                    <Volume2 className="w-3 h-3" />
                    <span>重播首句样音</span>
                  </button>
                )}
              </div>

              <textarea
                id="clone-test-text"
                rows={2}
                value={testSentence}
                onChange={(e) => setTestSentence(e.target.value)}
                className="w-full rounded-lg bg-[#11141B] border border-zinc-800 px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-emerald-500 resize-none"
              />

              {auditionError && (
                <p className="text-[11px] text-red-300">{auditionError}</p>
              )}

              <button
                type="button"
                disabled={auditionLoading || !testSentence.trim()}
                onClick={() => void handleSynthesizeTestSentence()}
                className="w-full py-2 px-3 rounded-lg border border-zinc-700 bg-[#11141B] hover:border-emerald-500/70 hover:bg-zinc-900 disabled:opacity-50 text-xs font-medium text-zinc-100 flex items-center justify-center gap-1.5 transition-colors"
              >
                {auditionLoading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                    <span>正在用你的专属音色实时合成...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 text-emerald-400" />
                    <span>试听新文案合成效果</span>
                  </>
                )}
              </button>
            </div>

            <div className="flex items-center justify-between gap-2 pt-1">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="py-2 px-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-200"
              >
                重新采样训练
              </button>
              <button
                type="button"
                onClick={() => {
                  onSaveProfile(trainedProfile, true);
                  onClose();
                }}
                className="py-2.5 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white flex items-center gap-1.5 transition-colors"
              >
                <Check className="w-3.5 h-3.5" />
                <span>保存并设为当前配音音色</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
