import { type Dispatch, type RefObject, type SetStateAction, useState } from 'react';
import { Loader2, Mic, Play, Sparkles, Square, Upload } from 'lucide-react';
import type {
  ClonedVoiceProfile,
  DigitalHumanPhonemeAlignmentProfile,
  DigitalHumanProfile,
  PlatformId,
  SubtitleSegment,
  TimelineClip,
} from '../../types/studio';
import { apiFetch } from '../../client/api/http';

type DrivenAudio = {
  audioBase64: string;
  mimeType: string;
  durationSec: number;
  text: string;
  segmentCount?: number;
} | null;

interface DriveSectionProps {
  driveMode: 'ai-script' | 'recorded-audio';
  setDriveMode: Dispatch<SetStateAction<'ai-script' | 'recorded-audio'>>;
  scriptText: string;
  setScriptText: Dispatch<SetStateAction<string>>;
  drivingSpeech: boolean;
  setDrivingSpeech: Dispatch<SetStateAction<boolean>>;
  driveError: string | null;
  setDriveError: Dispatch<SetStateAction<string | null>>;
  drivenAudio: DrivenAudio;
  setDrivenAudio: Dispatch<SetStateAction<DrivenAudio>>;
  speechEstimate: { charCount: number; segmentCount: number; durationSec: number };
  isRecordingVoice: boolean;
  recordElapsedSec: number;
  voiceRecordError: string | null;
  voiceAudioInputRef: RefObject<HTMLInputElement | null>;
  handleToggleMicRecord: () => void | Promise<void>;
  activeAnchor: DigitalHumanProfile;
  clonedVoices: ClonedVoiceProfile[];
  platform: PlatformId;
  emotionMatchEnabled: boolean;
  phonemeAlignEnabled: boolean;
  phonemeOffsetMs: number;
  phonemeOnsetAdvanceMs: number;
  setFullClipDuration: Dispatch<SetStateAction<number>>;
  handleAnalyzeVoiceEmotion: (
    overrideAudioB64?: string,
    overrideMimeType?: string,
    overrideScript?: string
  ) => void | Promise<void>;
  runClientPhonemeAnalysis: (
    audioBase64: string,
    mimeType?: string,
    overrideOffsetMs?: number,
    overrideOnsetMs?: number,
    overrideEnabled?: boolean
  ) => void | Promise<unknown>;
  playAudioSnippet: (b64: string, mime?: string) => void;
  setPhonemeAlignment: Dispatch<SetStateAction<DigitalHumanPhonemeAlignmentProfile | null>>;
  setPhonemeNotice: Dispatch<SetStateAction<string | null>>;
  syncPhonemeAlignmentToSelectedClip: (profile: DigitalHumanPhonemeAlignmentProfile) => void;
  isPreviewingMiniStage: boolean;
  stopPreviewAudio: () => void;
  selectedClip: TimelineClip | null;
  selectedClipStartTime: number;
  subtitles: SubtitleSegment[];
}

export function DriveSection({
  driveMode,
  setDriveMode,
  scriptText,
  setScriptText,
  drivingSpeech,
  setDrivingSpeech,
  driveError,
  setDriveError,
  drivenAudio,
  setDrivenAudio,
  speechEstimate,
  isRecordingVoice,
  recordElapsedSec,
  voiceRecordError,
  voiceAudioInputRef,
  handleToggleMicRecord,
  activeAnchor,
  clonedVoices,
  platform,
  emotionMatchEnabled,
  phonemeAlignEnabled,
  phonemeOffsetMs,
  phonemeOnsetAdvanceMs,
  setFullClipDuration,
  handleAnalyzeVoiceEmotion,
  runClientPhonemeAnalysis,
  playAudioSnippet,
  setPhonemeAlignment,
  setPhonemeNotice,
  syncPhonemeAlignmentToSelectedClip,
  isPreviewingMiniStage,
  stopPreviewAudio,
  selectedClip,
  selectedClipStartTime,
  subtitles,
}: DriveSectionProps) {
  const handleSynthesizeAnchorSpeech = async (spoken?: string) => {
    const line = (spoken ?? scriptText).trim();
    if (!activeAnchor || !line) return;
    if (spoken) setScriptText(spoken);
    setDrivingSpeech(true);
    setDriveError(null);
    const boundClone = activeAnchor.clonedVoiceId
      ? clonedVoices.find((v) => v.id === activeAnchor.clonedVoiceId)
      : undefined;

    try {
      const res = await apiFetch('/api/digital-human/drive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          anchorName: activeAnchor.name,
          scriptText: line,
          baseVoice: boundClone ? boundClone.baseVoice : activeAnchor.baseVoice,
          voiceDesignPrompt: boundClone
            ? boundClone.voiceDesignPrompt
            : activeAnchor.voiceDesignPrompt,
          expressiveness: boundClone?.expressiveness ?? 0.78,
          platform,
          phonemeAlignmentEnabled: phonemeAlignEnabled,
          phonemeKeyframeOffsetMs: phonemeOffsetMs,
          phonemeOnsetAdvanceMs: phonemeOnsetAdvanceMs,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.audioBase64) {
        throw new Error(data?.error || '数字人语音驱动失败，请重试。');
      }

      const dur = Number(data.audioDurationSec || speechEstimate.durationSec || 3.2);
      const mime = data.mimeType || 'audio/wav';
      const segCount = Number(data.segmentCount || speechEstimate.segmentCount || 1);
      setDrivenAudio({
        audioBase64: data.audioBase64,
        mimeType: mime,
        durationSec: dur,
        text: line,
        segmentCount: segCount,
      });
      setFullClipDuration(Number(Math.max(2, dur + 0.2).toFixed(1)));
      if (data.phonemeAlignment) {
        const aligned = data.phonemeAlignment as DigitalHumanPhonemeAlignmentProfile;
        setPhonemeAlignment(aligned);
        setPhonemeNotice(aligned.spectralSummary);
        syncPhonemeAlignmentToSelectedClip(aligned);
      } else if (phonemeAlignEnabled) {
        void runClientPhonemeAnalysis(data.audioBase64, mime);
      }
      playAudioSnippet(data.audioBase64, mime);
      if (emotionMatchEnabled) {
        void handleAnalyzeVoiceEmotion(data.audioBase64, mime, line);
      }
    } catch (err: unknown) {
      setDriveError(err instanceof Error ? err.message : '数字人语音驱动失败。');
    } finally {
      setDrivingSpeech(false);
    }
  };

  const [dialogueLine, setDialogueLine] = useState('');
  const [dialogueTurns, setDialogueTurns] = useState<Array<{ role: 'user' | 'anchor'; text: string }>>([]);
  const [replying, setReplying] = useState(false);

  const handleAnchorReply = async () => {
    const line = dialogueLine.trim();
    if (!line || replying || drivingSpeech) return;
    setReplying(true);
    setDriveError(null);
    try {
      const res = await apiFetch('/api/digital-human/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          anchorName: activeAnchor.name,
          personaSummary: activeAnchor.personaSummary,
          history: dialogueTurns,
          userLine: line,
        }),
      });
      const data = await res.json();
      if (!res.ok || typeof data?.reply !== 'string' || !data.reply.trim()) {
        throw new Error(data?.error || '主播这次没有答上话。');
      }
      const reply = data.reply.trim();
      setDialogueTurns((current) =>
        [...current, { role: 'user' as const, text: line }, { role: 'anchor' as const, text: reply }].slice(-8),
      );
      setDialogueLine('');
      await handleSynthesizeAnchorSpeech(reply);
    } catch (err: unknown) {
      setDriveError(err instanceof Error ? err.message : '主播回答失败。');
    } finally {
      setReplying(false);
    }
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
    <>
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
              placeholder="输入想让虚拟主播说的话（支持长台词，自动分段合成并拼接）..."
              className="w-full rounded-md bg-[#11141B] border border-zinc-800 px-2.5 py-2 text-xs text-zinc-100 focus:outline-none focus:border-cyan-500 resize-y"
            />
            <div className="flex items-center justify-between gap-2 text-[10px] text-zinc-400 font-mono-nums px-0.5">
              <span>
                {speechEstimate.charCount > 0
                  ? `约 ${speechEstimate.charCount} 字 · ${
                      speechEstimate.segmentCount > 1
                        ? `自动分 ${speechEstimate.segmentCount} 段合成并拼接`
                        : '单段合成'
                    }`
                  : '支持长台词自动分段拼接'}
              </span>
              <span className="text-cyan-300 font-semibold">
                {speechEstimate.charCount > 0
                  ? `预估时长 ≈ ${speechEstimate.durationSec.toFixed(1)}s`
                  : '预估时长 0.0s'}
              </span>
            </div>
            <div className="rounded-md border border-zinc-800 bg-[#0E1116] p-2 space-y-1.5">
              <label htmlFor="dh-dialogue-input" className="block text-[11px] text-zinc-400">
                对主播说一句，让主播回答并开口
              </label>
              {dialogueTurns.length > 0 && (
                <div className="space-y-1 max-h-24 overflow-y-auto">
                  {dialogueTurns.map((turn, index) => (
                    <p
                      key={`${turn.role}-${index}`}
                      className={`text-[10px] leading-snug ${turn.role === 'anchor' ? 'text-cyan-200' : 'text-zinc-400'}`}
                    >
                      {turn.role === 'anchor' ? '主播' : '你'}：{turn.text}
                    </p>
                  ))}
                </div>
              )}
              <div className="flex gap-1.5">
                <input
                  id="dh-dialogue-input"
                  value={dialogueLine}
                  onChange={(e) => setDialogueLine(e.target.value)}
                  placeholder="例如：这杯要几克豆子？"
                  className="min-w-0 flex-1 rounded-md bg-[#11141B] border border-zinc-800 px-2 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-cyan-500"
                />
                <button
                  type="button"
                  disabled={replying || drivingSpeech || !dialogueLine.trim()}
                  onClick={() => void handleAnchorReply()}
                  className="shrink-0 px-2 py-1.5 rounded-md bg-cyan-700 hover:bg-cyan-600 disabled:opacity-50 text-[11px] font-semibold text-white"
                >
                  {replying ? '回答中' : '让主播回答'}
                </button>
              </div>
            </div>
            <button
              type="button"
              disabled={drivingSpeech || !scriptText.trim()}
              onClick={() => void handleSynthesizeAnchorSpeech()}
              className="w-full py-2 px-3 rounded-md bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-xs font-semibold text-white flex items-center justify-center gap-1.5 transition-colors"
            >
              {drivingSpeech ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>
                    {speechEstimate.segmentCount > 1
                      ? `正在分段合成并拼接 (${speechEstimate.segmentCount} 段)...`
                      : '正在合成主播语音驱动...'}
                  </span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>
                    AI 合成语音并驱动主播
                    {speechEstimate.charCount > 0
                      ? `（预估 ${speechEstimate.durationSec.toFixed(1)}s）`
                      : ''}
                  </span>
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
                {drivenAudio.segmentCount && drivenAudio.segmentCount > 1
                  ? `（已拼接 ${drivenAudio.segmentCount} 段）`
                  : ''}
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
    </>
  );
}
