import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import {
  AudioLines,
  Check,
  Loader2,
  Mic,
  RotateCcw,
  ShieldCheck,
  Sliders,
  Sparkles,
  Square,
  Trash2,
  Upload,
  Volume2,
  Wand2,
} from 'lucide-react';
import type {
  AudioConfig,
  BgmPreset,
  ClonedVoiceProfile,
  MediaAsset,
  PlatformId,
  SfxEvent,
  SubtitleSegment,
  SubtitleStyle,
  TimelineClip,
  VoiceDenoiseProfile,
  VoiceoverCue,
  VoiceoverVoice,
} from '../../types/studio';
import { analyzeVoiceoverCuesAcousticMetrics } from '../../utils/audioEngine';
import { extractAudioSliceAsWavBase64 } from '../../utils/audioExtractor';
import { PLATFORM_META } from '../../utils/autoEditEngine';
import { captureClipSnapshotBase64, type LoadedMediaElement } from '../../utils/canvasRenderer';
import { apiFetch } from '../../client/api/http';
import { BGM_PRESET_BPM } from './bgmPresets';
import { blobToBase64 } from './blobToBase64';
import type { BgmCopyrightHandle } from './BgmCopyrightSection';
import type { SfxSectionHandle } from './SfxSection';

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

interface SubtitleVoiceSectionProps {
  selectedClip: TimelineClip | null;
  selectedClipStartTime: number;
  selectedAsset: MediaAsset | null;
  selectedSubtitle: SubtitleSegment | null;
  clips: TimelineClip[];
  subtitles: SubtitleSegment[];
  voiceoverCues: VoiceoverCue[];
  currentTime: number;
  platform: PlatformId;
  mediaCache: Map<string, LoadedMediaElement>;
  audio: AudioConfig;
  clonedVoices: ClonedVoiceProfile[];
  onApplyClipSubtitles: (
    clipStartTime: number,
    clipDuration: number,
    newSubs: SubtitleSegment[]
  ) => void;
  onUpdateSubtitle: (subId: string, patch: Partial<SubtitleSegment>) => void;
  onDeleteSubtitle: (subId: string) => void;
  onUpdateAudio: (patch: Partial<AudioConfig>) => void;
  onUpdateClonedVoice: (profileId: string, patch: Partial<ClonedVoiceProfile>) => void;
  onDeleteClonedVoice: (profileId: string) => void;
  onSetVoiceoverCues: (cues: VoiceoverCue[]) => void;
  onUpsertVoiceoverCue: (cue: VoiceoverCue) => void;
  onRemoveVoiceoverCue: (cueId: string) => void;
  onPreviewVoiceoverCue: (cue: VoiceoverCue) => void;
  onSeek: (timeSec: number) => void;
  onSetSfxEvents: (events: SfxEvent[]) => void;
  onOpenVoiceClone: () => void;
  bgmRef: RefObject<BgmCopyrightHandle | null>;
  sfxRef: RefObject<SfxSectionHandle | null>;
  children: ReactNode;
}

export function SubtitleVoiceSection({
  selectedClip,
  selectedClipStartTime,
  selectedAsset,
  selectedSubtitle,
  clips,
  subtitles,
  voiceoverCues,
  currentTime,
  platform,
  mediaCache,
  audio,
  clonedVoices,
  onApplyClipSubtitles,
  onUpdateSubtitle,
  onDeleteSubtitle,
  onUpdateAudio,
  onUpdateClonedVoice,
  onDeleteClonedVoice,
  onSetVoiceoverCues,
  onUpsertVoiceoverCue,
  onRemoveVoiceoverCue,
  onPreviewVoiceoverCue,
  onSeek,
  onSetSfxEvents,
  onOpenVoiceClone,
  bgmRef,
  sfxRef,
  children,
}: SubtitleVoiceSectionProps) {
  const speechFileInputRef = useRef<HTMLInputElement | null>(null);
  const voiceUploadInputRef = useRef<HTMLInputElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordStreamRef = useRef<MediaStream | null>(null);
  const recordTimerRef = useRef<number | null>(null);
  const [transcribingSpeech, setTranscribingSpeech] = useState(false);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [speechResultNote, setSpeechResultNote] = useState<string | null>(null);
  const [generatingVoiceover, setGeneratingVoiceover] = useState(false);
  const [voiceoverError, setVoiceoverError] = useState<string | null>(null);
  const [voiceoverNote, setVoiceoverNote] = useState<string | null>(null);
  const [packagingFullAudio, setPackagingFullAudio] = useState(false);
  const [fullAudioNote, setFullAudioNote] = useState<string | null>(null);
  const [recordTargetSubId, setRecordTargetSubId] = useState<string>('__playhead__');
  const [isRecordingMic, setIsRecordingMic] = useState(false);
  const [recordElapsedSec, setRecordElapsedSec] = useState(0);
  const [micError, setMicError] = useState<string | null>(null);
  const [resynthesizingClonePreview, setResynthesizingClonePreview] = useState(false);
  const [cloneTuneError, setCloneTuneError] = useState<string | null>(null);
  const [analyzingNoise, setAnalyzingNoise] = useState(false);
  const [noiseError, setNoiseError] = useState<string | null>(null);
  const activeClonedVoice =
    clonedVoices.find((v) => v.id === audio.activeClonedVoiceId) ?? null;

  useEffect(() => {
    setSpeechError(null);
    setSpeechResultNote(null);
  }, [selectedClip?.id]);

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

      const res = await apiFetch('/api/transcribe-subtitles', {
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
      const res = await apiFetch('/api/generate-voiceover', {
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
    bgmRef.current?.clearError();
    setVoiceoverError(null);
    sfxRef.current?.clearError();

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
        apiFetch('/api/suggest-bgm', {
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
          ? apiFetch('/api/generate-voiceover', {
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
        apiFetch('/api/suggest-sfx', {
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
        bgmRef.current?.applyPackaged({
          recommendedPreset: preset,
          moodLabel: d.moodLabel || '推荐情绪',
          presetName: d.presetName || '智能配乐',
          recommendedBpm: bpmNum,
          recommendedVolume: Number(volNum.toFixed(2)),
          reason: d.reason || '已匹配整片画面情绪节奏。',
          soundDesignNote: d.soundDesignNote || '已开启说话时 BGM 自动闪避。',
        });
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
        sfxRef.current?.applyPackaged({
          librarySummary: sfxResult.value.librarySummary || '已自动匹配转场与动作音效。',
          events,
        });
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

      const res = await apiFetch('/api/voiceover/analyze-noise', {
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
    <>
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
                onClick={onOpenVoiceClone}
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
                    const res = await apiFetch('/api/voice-clone/preview', {
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
          {children}
        </div>
    </>
  );
}
