import { type Dispatch, type SetStateAction } from 'react';
import { Languages, Loader2, Play, Square } from 'lucide-react';
import type {
  ClonedVoiceProfile,
  DigitalHumanMultilingualResult,
  DigitalHumanPhonemeAlignmentProfile,
  DigitalHumanProfile,
  DigitalHumanTargetLanguage,
  PlatformId,
  SubtitleSegment,
  TimelineClip,
  VoiceoverVoice,
} from '../../types/studio';
import {
  DIGITAL_HUMAN_LANGUAGES,
  getDigitalHumanLanguageOption,
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

interface MultilingualSectionProps {
  multilingualEnabled: boolean;
  setMultilingualEnabled: Dispatch<SetStateAction<boolean>>;
  targetLanguage: DigitalHumanTargetLanguage;
  setTargetLanguage: Dispatch<SetStateAction<DigitalHumanTargetLanguage>>;
  synthesizingMultilingual: boolean;
  setSynthesizingMultilingual: Dispatch<SetStateAction<boolean>>;
  multilingualResult: DigitalHumanMultilingualResult | null;
  setMultilingualResult: Dispatch<SetStateAction<DigitalHumanMultilingualResult | null>>;
  editableTranslatedScript: string;
  setEditableTranslatedScript: Dispatch<SetStateAction<string>>;
  applyTranslatedToCaption: boolean;
  setApplyTranslatedToCaption: Dispatch<SetStateAction<boolean>>;
  multilingualError: string | null;
  setMultilingualError: Dispatch<SetStateAction<string | null>>;
  scriptText: string;
  setScriptText: Dispatch<SetStateAction<string>>;
  drivenAudio: DrivenAudio;
  setDrivenAudio: Dispatch<SetStateAction<DrivenAudio>>;
  activeAnchor: DigitalHumanProfile;
  recordedVoice: RecordedVoice;
  clonedVoices: ClonedVoiceProfile[];
  selectedClip: TimelineClip | null;
  subtitles: SubtitleSegment[];
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
  selectedClipStartTime: number;
  setPhonemeAlignment: Dispatch<SetStateAction<DigitalHumanPhonemeAlignmentProfile | null>>;
  setPhonemeNotice: Dispatch<SetStateAction<string | null>>;
  syncPhonemeAlignmentToSelectedClip: (profile: DigitalHumanPhonemeAlignmentProfile) => void;
  isPreviewingMiniStage: boolean;
  stopPreviewAudio: () => void;
}

export function MultilingualSection({
  multilingualEnabled,
  setMultilingualEnabled,
  targetLanguage,
  setTargetLanguage,
  synthesizingMultilingual,
  setSynthesizingMultilingual,
  multilingualResult,
  setMultilingualResult,
  editableTranslatedScript,
  setEditableTranslatedScript,
  applyTranslatedToCaption,
  setApplyTranslatedToCaption,
  multilingualError,
  setMultilingualError,
  scriptText,
  setScriptText,
  drivenAudio,
  setDrivenAudio,
  activeAnchor,
  recordedVoice,
  clonedVoices,
  selectedClip,
  subtitles,
  platform,
  emotionMatchEnabled,
  phonemeAlignEnabled,
  phonemeOffsetMs,
  phonemeOnsetAdvanceMs,
  setFullClipDuration,
  handleAnalyzeVoiceEmotion,
  runClientPhonemeAnalysis,
  playAudioSnippet,
  selectedClipStartTime,
  setPhonemeAlignment,
  setPhonemeNotice,
  syncPhonemeAlignmentToSelectedClip,
  isPreviewingMiniStage,
  stopPreviewAudio,
}: MultilingualSectionProps) {
  const handleSynthesizeMultilingualDub = async (useEditedTranslation = false) => {
    if (!activeAnchor) return;

    let rawSource = scriptText.trim() || drivenAudio?.text || selectedClip?.digitalHuman?.spokenScript || '';
    if (!rawSource && selectedClip) {
      const end = selectedClipStartTime + selectedClip.duration;
      const matched = subtitles
        .filter((s) => {
          const mid = s.startTime + s.duration / 2;
          return mid >= selectedClipStartTime && mid <= end;
        })
        .map((s) => s.text.trim())
        .filter(Boolean);
      if (matched.length > 0) {
        rawSource = matched.join('，');
      }
    }
    if (!rawSource && subtitles[0]?.text) {
      rawSource = subtitles[0].text.trim();
    }

    if (!rawSource && !(useEditedTranslation && editableTranslatedScript.trim())) {
      setMultilingualError('请先输入或导入现有数字人语音脚本，再执行多语言翻译与声线克隆配音。');
      return;
    }

    setSynthesizingMultilingual(true);
    setMultilingualError(null);

    const boundClone = activeAnchor.clonedVoiceId
      ? clonedVoices.find((v) => v.id === activeAnchor.clonedVoiceId)
      : undefined;
    const referenceAudioBase64 =
      recordedVoice?.base64 ?? activeAnchor.sampleAudioBase64 ?? boundClone?.samplePreviewBase64;
    const referenceAudioMimeType =
      recordedVoice?.mimeType ??
      activeAnchor.sampleAudioMimeType ??
      boundClone?.samplePreviewMimeType ??
      'audio/wav';

    try {
      const res = await apiFetch('/api/digital-human/multilingual-dub', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          anchorName: activeAnchor.name,
          sourceScript: rawSource,
          preTranslatedScript: useEditedTranslation ? editableTranslatedScript.trim() : '',
          targetLanguage,
          baseVoice: boundClone ? boundClone.baseVoice : activeAnchor.baseVoice,
          voiceDesignPrompt: boundClone
            ? boundClone.voiceDesignPrompt
            : activeAnchor.voiceDesignPrompt,
          clonedVoice: boundClone ?? null,
          referenceAudioBase64,
          referenceAudioMimeType,
          expressiveness: boundClone?.expressiveness ?? 0.78,
          platform,
          phonemeAlignmentEnabled: phonemeAlignEnabled,
          phonemeKeyframeOffsetMs: phonemeOffsetMs,
          phonemeOnsetAdvanceMs: phonemeOnsetAdvanceMs,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.audioBase64) {
        throw new Error(data?.error || '多语言声线克隆配音合成失败，请重试。');
      }

      const alignedProfile =
        (data.phonemeAlignment as DigitalHumanPhonemeAlignmentProfile | undefined) ?? undefined;

      const result: DigitalHumanMultilingualResult = {
        sourceScript: data.sourceScript || rawSource,
        translatedScript: data.translatedScript || rawSource,
        targetLanguage: (data.targetLanguage || targetLanguage) as DigitalHumanTargetLanguage,
        targetLanguageLabel:
          data.targetLanguageLabel || getDigitalHumanLanguageOption(targetLanguage).label,
        voiceCloneSummary:
          data.voiceCloneSummary || `已保留「${activeAnchor.name}」声线特征并合成目标语种配音。`,
        baseVoice: (data.baseVoice || activeAnchor.baseVoice) as VoiceoverVoice,
        clonedStylePrompt: data.clonedStylePrompt || '',
        audioBase64: data.audioBase64,
        mimeType: data.mimeType || 'audio/wav',
        audioDurationSec: Number(data.audioDurationSec || 3.2),
        modelUsed: data.modelUsed,
        phonemeAlignment: alignedProfile,
      };

      setMultilingualEnabled(true);
      setMultilingualResult(result);
      setEditableTranslatedScript(result.translatedScript);
      setDrivenAudio({
        audioBase64: result.audioBase64,
        mimeType: result.mimeType,
        durationSec: result.audioDurationSec,
        text: applyTranslatedToCaption ? result.translatedScript : result.sourceScript,
      });
      setFullClipDuration(Number(Math.max(2, result.audioDurationSec + 0.2).toFixed(1)));
      if (alignedProfile) {
        setPhonemeAlignment(alignedProfile);
        setPhonemeNotice(alignedProfile.spectralSummary);
        syncPhonemeAlignmentToSelectedClip(alignedProfile);
      } else if (phonemeAlignEnabled) {
        void runClientPhonemeAnalysis(result.audioBase64, result.mimeType);
      }
      playAudioSnippet(result.audioBase64, result.mimeType);
      if (emotionMatchEnabled) {
        void handleAnalyzeVoiceEmotion(
          result.audioBase64,
          result.mimeType,
          result.translatedScript
        );
      }
    } catch (err: unknown) {
      setMultilingualError(
        err instanceof Error ? err.message : '多语言语音合成失败，请稍后重试。'
      );
    } finally {
      setSynthesizingMultilingual(false);
    }
  };

  return (
        <div className="rounded-lg border border-indigo-500/30 bg-[#11141B] p-2.5 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <span className="text-[11px] font-semibold text-indigo-200 flex items-center gap-1.5">
                <Languages className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                <span>多语言语音合成（声线克隆配音）</span>
              </span>
              <span className="block text-[10px] text-zinc-400 mt-0.5">
                AI 自动翻译现有脚本并克隆原声线特征生成目标语种配音
              </span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={multilingualEnabled}
              aria-label="多语言语音合成"
              onClick={() => setMultilingualEnabled((v) => !v)}
              className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors ${
                multilingualEnabled
                  ? 'bg-indigo-500 border-indigo-400'
                  : 'bg-zinc-800 border-zinc-700'
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                  multilingualEnabled ? 'translate-x-4' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>

          {multilingualEnabled && (() => {
            const boundClone = activeAnchor?.clonedVoiceId
              ? clonedVoices.find((v) => v.id === activeAnchor.clonedVoiceId)
              : undefined;
            const voiceRefLabel = recordedVoice
              ? '个人录制原声纹'
              : boundClone
                ? `克隆音色 · ${boundClone.name}`
                : activeAnchor?.sampleAudioBase64
                  ? `${activeAnchor.name} 原声采样`
                  : `${activeAnchor?.name || '主播'} (${activeAnchor?.baseVoice || 'Kore'})`;
            const selectedLangMeta = getDigitalHumanLanguageOption(targetLanguage);

            return (
              <div className="space-y-2.5 pt-1.5 border-t border-zinc-800/80">
                <div className="flex items-center justify-between gap-2 text-[10px]">
                  <span className="text-zinc-400">选择目标语种</span>
                  <span className="text-indigo-300 font-medium truncate max-w-[180px]" title={voiceRefLabel}>
                    声线克隆参考：{voiceRefLabel}
                  </span>
                </div>

                <div
                  className="grid grid-cols-3 gap-1"
                  role="radiogroup"
                  aria-label="目标语种"
                >
                  {DIGITAL_HUMAN_LANGUAGES.map((lang) => {
                    const isSel = targetLanguage === lang.id;
                    return (
                      <button
                        key={lang.id}
                        type="button"
                        role="radio"
                        aria-checked={isSel}
                        onClick={() => setTargetLanguage(lang.id)}
                        className={`px-2 py-1.5 rounded-md border text-left transition-colors ${
                          isSel
                            ? 'border-indigo-400 bg-indigo-500/20 text-indigo-100'
                            : 'border-zinc-800 bg-[#0B0D10] text-zinc-300 hover:border-zinc-600'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-[10px] font-semibold truncate">{lang.label}</span>
                          <span className="text-[8px] font-mono-nums text-indigo-300 shrink-0">
                            {lang.shortTag}
                          </span>
                        </div>
                        <span className="block text-[9px] text-zinc-400 truncate">
                          {lang.nativeName}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <label className="flex items-center gap-2 text-[10px] text-zinc-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={applyTranslatedToCaption}
                    onChange={(e) => setApplyTranslatedToCaption(e.target.checked)}
                    className="accent-indigo-500"
                  />
                  <span>将「{selectedLangMeta.label}」译文同步设为数字人驱动字幕文案</span>
                </label>

                <button
                  type="button"
                  disabled={synthesizingMultilingual}
                  onClick={() => void handleSynthesizeMultilingualDub(false)}
                  className="w-full py-2 px-3 rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-xs font-semibold text-white flex items-center justify-center gap-1.5 transition-colors"
                >
                  {synthesizingMultilingual ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>正在翻译并克隆声线合成{selectedLangMeta.label}配音...</span>
                    </>
                  ) : (
                    <>
                      <Languages className="w-3.5 h-3.5" />
                      <span>AI 翻译脚本并克隆声线合成 ({selectedLangMeta.label})</span>
                    </>
                  )}
                </button>

                {multilingualError && (
                  <div className="rounded border border-red-500/40 bg-red-950/30 p-2 text-[10px] text-red-200 leading-snug">
                    {multilingualError}
                  </div>
                )}

                {multilingualResult && (
                  <div className="rounded-md border border-indigo-500/40 bg-indigo-950/25 p-2.5 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-semibold text-indigo-200 truncate">
                        {multilingualResult.targetLanguageLabel}克隆配音就绪 ·{' '}
                        {multilingualResult.audioDurationSec.toFixed(1)}s
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          isPreviewingMiniStage
                            ? stopPreviewAudio()
                            : playAudioSnippet(
                                multilingualResult.audioBase64,
                                multilingualResult.mimeType
                              )
                        }
                        className="px-2 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-[10px] font-semibold text-white flex items-center gap-1 shrink-0"
                      >
                        {isPreviewingMiniStage ? (
                          <>
                            <Square className="w-2.5 h-2.5 fill-current" />
                            <span>停止</span>
                          </>
                        ) : (
                          <>
                            <Play className="w-2.5 h-2.5" />
                            <span>试听多语言配音</span>
                          </>
                        )}
                      </button>
                    </div>

                    <p className="text-[10px] text-indigo-200/85 leading-snug">
                      声线特征继承：{multilingualResult.voiceCloneSummary}
                    </p>

                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[10px] text-zinc-400">
                        <span>译文台词预览（支持微调重合成）</span>
                        <span className="font-mono-nums text-indigo-300">
                          {multilingualResult.baseVoice}
                        </span>
                      </div>
                      <textarea
                        rows={2}
                        value={editableTranslatedScript}
                        onChange={(e) => setEditableTranslatedScript(e.target.value)}
                        className="w-full rounded bg-[#0B0D10] border border-zinc-800 px-2 py-1.5 text-[11px] text-zinc-100 focus:outline-none focus:border-indigo-400 resize-none"
                      />
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={synthesizingMultilingual || !editableTranslatedScript.trim()}
                          onClick={() => void handleSynthesizeMultilingualDub(true)}
                          className="flex-1 py-1 px-2 rounded border border-indigo-500/45 bg-indigo-500/15 hover:bg-indigo-500/25 disabled:opacity-45 text-[10px] font-medium text-indigo-200 transition-colors"
                        >
                          按修改后译文重合成
                        </button>
                        <button
                          type="button"
                          disabled={!editableTranslatedScript.trim()}
                          onClick={() => {
                            setScriptText(editableTranslatedScript.trim());
                            if (drivenAudio) {
                              setDrivenAudio({
                                ...drivenAudio,
                                text: editableTranslatedScript.trim(),
                              });
                            }
                          }}
                          className="py-1 px-2 rounded border border-zinc-700 bg-[#0B0D10] hover:bg-zinc-800 disabled:opacity-45 text-[10px] text-zinc-300 transition-colors"
                        >
                          填入台词框
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
  );
}
