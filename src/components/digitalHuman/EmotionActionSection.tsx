import { type Dispatch, type RefObject, type SetStateAction } from 'react';
import { AudioLines, Check, Loader2, Sliders, Sparkles, Wand2 } from 'lucide-react';
import type {
  DigitalHumanActionId,
  DigitalHumanActionRecommendation,
  DigitalHumanEmotionAnalysis,
  DigitalHumanEmotionId,
  DigitalHumanFacialMuscles,
  PlatformId,
  SubtitleSegment,
  TimelineClip,
} from '../../types/studio';
import {
  clampFacialMuscles,
  DIGITAL_HUMAN_ACTION_TEMPLATES,
  DIGITAL_HUMAN_EMOTION_PRESETS,
  getDigitalHumanActionTemplate,
  getDigitalHumanEmotionPreset,
} from '../../utils/digitalHumanAssets';
import { apiFetch } from '../../client/api/http';

type PoseBlend = {
  from: DigitalHumanActionId;
  to: DigitalHumanActionId;
  startPerf: number;
  durationSec: number;
} | null;

interface EmotionActionSectionProps {
  selectedClip: TimelineClip | null;
  clips: TimelineClip[];
  subtitles: SubtitleSegment[];
  platform: PlatformId;
  brief: string;
  scriptText: string;
  selectedAction: DigitalHumanActionId;
  setSelectedAction: Dispatch<SetStateAction<DigitalHumanActionId>>;
  previousAction: DigitalHumanActionId | null;
  setPreviousAction: Dispatch<SetStateAction<DigitalHumanActionId | null>>;
  actionIntensity: number;
  setActionIntensity: Dispatch<SetStateAction<number>>;
  actionBlendDuration: number;
  setActionBlendDuration: Dispatch<SetStateAction<number>>;
  actionSyncNotice: string | null;
  setActionSyncNotice: Dispatch<SetStateAction<string | null>>;
  autoActionSuggestEnabled: boolean;
  setAutoActionSuggestEnabled: Dispatch<SetStateAction<boolean>>;
  setAiActionSuggestion: Dispatch<SetStateAction<DigitalHumanActionRecommendation | null>>;
  analyzingActionSuggestion: boolean;
  setAnalyzingActionSuggestion: Dispatch<SetStateAction<boolean>>;
  actionSuggestNote: string | null;
  setActionSuggestNote: Dispatch<SetStateAction<string | null>>;
  activeActionRecommendation: DigitalHumanActionRecommendation;
  prevTimelineAction: DigitalHumanActionId | null;
  emotionMatchEnabled: boolean;
  setEmotionMatchEnabled: Dispatch<SetStateAction<boolean>>;
  selectedEmotion: DigitalHumanEmotionId;
  setSelectedEmotion: Dispatch<SetStateAction<DigitalHumanEmotionId>>;
  facialMuscles: DigitalHumanFacialMuscles;
  setFacialMuscles: Dispatch<SetStateAction<DigitalHumanFacialMuscles>>;
  analyzingEmotion: boolean;
  emotionAnalysis: DigitalHumanEmotionAnalysis | null;
  emotionNote: string | null;
  setEmotionNote: Dispatch<SetStateAction<string | null>>;
  poseBlendRef: RefObject<PoseBlend>;
  syncEmotionToSelectedClip: (
    enabled: boolean,
    emotion: DigitalHumanEmotionId,
    muscles: DigitalHumanFacialMuscles,
    summary?: string
  ) => void;
  handleAnalyzeVoiceEmotion: (
    overrideAudioB64?: string,
    overrideMimeType?: string,
    overrideScript?: string
  ) => void | Promise<void>;
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
}

export function EmotionActionSection({
  selectedClip,
  clips,
  subtitles,
  platform,
  brief,
  scriptText,
  selectedAction,
  setSelectedAction,
  previousAction,
  setPreviousAction,
  actionIntensity,
  setActionIntensity,
  actionBlendDuration,
  setActionBlendDuration,
  actionSyncNotice,
  setActionSyncNotice,
  autoActionSuggestEnabled,
  setAutoActionSuggestEnabled,
  setAiActionSuggestion,
  analyzingActionSuggestion,
  setAnalyzingActionSuggestion,
  actionSuggestNote,
  setActionSuggestNote,
  activeActionRecommendation,
  prevTimelineAction,
  emotionMatchEnabled,
  setEmotionMatchEnabled,
  selectedEmotion,
  setSelectedEmotion,
  facialMuscles,
  setFacialMuscles,
  analyzingEmotion,
  emotionAnalysis,
  emotionNote,
  setEmotionNote,
  poseBlendRef,
  syncEmotionToSelectedClip,
  handleAnalyzeVoiceEmotion,
  onUpdateClipDigitalHumanAction,
  onBatchApplyDigitalHumanActions,
}: EmotionActionSectionProps) {
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

  const triggerMiniStageBlendPreview = (
    fromAct: DigitalHumanActionId,
    toAct: DigitalHumanActionId,
    durationSec: number
  ) => {
    if (fromAct !== toAct && durationSec > 0.02) {
      poseBlendRef.current = {
        from: fromAct,
        to: toAct,
        startPerf: performance.now(),
        durationSec,
      };
    } else {
      poseBlendRef.current = null;
    }
  };

  const handleSelectActionTemplate = (actionId: DigitalHumanActionId) => {
    const tmpl = getDigitalHumanActionTemplate(actionId);
    const prevAct = selectedAction;
    if (prevAct !== actionId) {
      setPreviousAction(prevAct);
      triggerMiniStageBlendPreview(prevAct, actionId, actionBlendDuration);
    }
    setSelectedAction(actionId);
    setActionIntensity(tmpl.recommendedIntensity);
    const blendSource = prevTimelineAction ?? (prevAct !== actionId ? prevAct : previousAction ?? undefined);
    if (selectedClip?.digitalHuman) {
      onUpdateClipDigitalHumanAction(selectedClip.id, actionId, tmpl.recommendedIntensity, {
        actionBlendDuration,
        blendFromAction: blendSource,
      });
      if (prevAct !== actionId && actionBlendDuration > 0.02) {
        const fromTmpl = getDigitalHumanActionTemplate(prevAct);
        setActionSyncNotice(
          `已为片段「${selectedClip.label}」分配「${tmpl.label}」姿态，并开启 ${actionBlendDuration.toFixed(2)}s 自动动作插值（${fromTmpl.label} → ${tmpl.label}）。`
        );
      } else {
        setActionSyncNotice(`已为当前片段「${selectedClip.label}」分配「${tmpl.label}」姿态，播放与导出将自动调用对应动作驱动。`);
      }
    } else {
      setActionSyncNotice(`已选定「${tmpl.label}」动作模板，嵌入或插入视频轨时将自动绑定该姿态与动作混合过渡。`);
    }
  };

  const handleAnalyzeScriptActions = async () => {
    setAnalyzingActionSuggestion(true);
    setActionSuggestNote(null);

    let cursor = 0;
    const serializedClips = clips.map((c, idx) => {
      const start = cursor;
      const end = cursor + c.duration;
      cursor = end;
      const matchedSubs = subtitles
        .filter((s) => {
          const mid = s.startTime + s.duration / 2;
          return mid >= start && mid <= end;
        })
        .map((s) => s.text.trim())
        .filter(Boolean)
        .join(' ');
      return {
        id: c.id,
        index: idx,
        label: c.label,
        duration: c.duration,
        hookTag: c.hookTag,
        subtitleText: matchedSubs,
      };
    });

    try {
      const res = await apiFetch('/api/digital-human/suggest-actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brief,
          scriptText: scriptText.trim(),
          platform,
          selectedClipId: selectedClip?.id ?? '',
          clips: serializedClips,
          subtitles: subtitles.map((s) => ({ startTime: s.startTime, text: s.text })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'AI 脚本动作分析失败');
      }
      setAiActionSuggestion(data as DigitalHumanActionRecommendation);
      const recTmpl = getDigitalHumanActionTemplate(
        data.primaryAction as DigitalHumanActionId
      );
      setActionSuggestNote(
        `AI 已结合剧本语境高亮推荐「${recTmpl.label}」（${data.contextStage || '语境匹配'}）。`
      );
    } catch (err: unknown) {
      setActionSuggestNote(
        err instanceof Error
          ? err.message
          : '已启用本地脚本语境实时分析并高亮推荐动作。'
      );
    } finally {
      setAnalyzingActionSuggestion(false);
    }
  };

  const handleBatchApplyRecommendedActions = () => {
    if (!onBatchApplyDigitalHumanActions) return;
    const updates = activeActionRecommendation.clipSuggestions.map((s) => ({
      clipId: s.clipId,
      action: s.recommendedAction,
      actionIntensity: s.recommendedIntensity,
      actionBlendDuration,
    }));
    onBatchApplyDigitalHumanActions(updates);
    if (selectedClip) {
      const matched = updates.find((u) => u.clipId === selectedClip.id);
      if (matched) {
        if (selectedAction !== matched.action) {
          setPreviousAction(selectedAction);
          triggerMiniStageBlendPreview(selectedAction, matched.action, actionBlendDuration);
        }
        setSelectedAction(matched.action);
        if (typeof matched.actionIntensity === 'number') {
          setActionIntensity(matched.actionIntensity);
        }
      }
    }
    const dhCount = clips.filter((c) => Boolean(c.digitalHuman)).length;
    setActionSyncNotice(
      `已根据脚本分镜语境，一键为时间线上 ${dhCount} 个数字人镜头匹配对应动作姿态及 ${actionBlendDuration.toFixed(2)}s 平滑过渡！`
    );
  };

  return (
    <>
        <div className="rounded-lg border border-zinc-800 bg-[#11141B] p-2.5 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <span className="text-[11px] font-semibold text-zinc-200 flex items-center gap-1.5">
                <span>数字人动作模板库</span>
                {autoActionSuggestEnabled && (
                  <span className="px-1.5 py-0.2 rounded bg-amber-500/20 border border-amber-400/50 text-[9px] font-semibold text-amber-200">
                    自动推荐高亮
                  </span>
                )}
              </span>
              <span className="block text-[10px] font-medium text-cyan-300 mt-0.5">
                当前姿态：{getDigitalHumanActionTemplate(selectedAction).label}
              </span>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                disabled={analyzingActionSuggestion}
                onClick={() => void handleAnalyzeScriptActions()}
                className="px-2 py-1 rounded border border-amber-500/50 bg-amber-500/15 hover:bg-amber-500/25 disabled:opacity-50 text-[10px] font-semibold text-amber-200 flex items-center gap-1 transition-colors"
                title="调用 AI 深度分析视频脚本并自动高亮推荐动作"
              >
                {analyzingActionSuggestion ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Wand2 className="w-3 h-3" />
                )}
                <span>{analyzingActionSuggestion ? '分析中' : 'AI 分析脚本'}</span>
              </button>
              <button
                type="button"
                role="switch"
                aria-checked={autoActionSuggestEnabled}
                aria-label="自动动作建议"
                onClick={() => setAutoActionSuggestEnabled((v) => !v)}
                className={`relative inline-flex h-4.5 w-8 shrink-0 items-center rounded-full border transition-colors ${
                  autoActionSuggestEnabled
                    ? 'bg-amber-500 border-amber-400'
                    : 'bg-zinc-800 border-zinc-700'
                }`}
              >
                <span
                  className={`inline-block h-3 w-3 rounded-full bg-white transition-transform ${
                    autoActionSuggestEnabled ? 'translate-x-4' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Context-aware Auto Action Recommendation Banner */}
          {autoActionSuggestEnabled && (() => {
            const primaryTmpl = getDigitalHumanActionTemplate(
              activeActionRecommendation.primaryAction
            );
            const isAdopted = selectedAction === activeActionRecommendation.primaryAction;
            const dhClipsCount = clips.filter((c) => Boolean(c.digitalHuman)).length;

            return (
              <div className="rounded-md border border-amber-400/50 bg-amber-500/10 p-2 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                    <span className="text-[10px] font-semibold text-amber-100 truncate">
                      语境【{activeActionRecommendation.contextStage}】→ 推荐「{primaryTmpl.label}」
                    </span>
                  </div>
                  {isAdopted ? (
                    <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 border border-emerald-400/40 text-[9px] font-semibold text-emerald-200 shrink-0">
                      已采纳推荐
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() =>
                        handleSelectActionTemplate(activeActionRecommendation.primaryAction)
                      }
                      className="px-2 py-0.5 rounded bg-amber-400 hover:bg-amber-300 text-zinc-950 text-[10px] font-bold shrink-0 transition-colors"
                    >
                      采纳「{primaryTmpl.label}」
                    </button>
                  )}
                </div>

                <p className="text-[10px] text-amber-100/85 leading-snug">
                  {activeActionRecommendation.reason}
                </p>

                {actionSuggestNote && (
                  <p className="text-[9px] text-amber-300/90 leading-snug">
                    {actionSuggestNote}
                  </p>
                )}

                {activeActionRecommendation.clipSuggestions.length > 0 && (
                  <div className="pt-1 border-t border-amber-400/20 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[9px] text-amber-200/80">
                        分镜脚本语境动作映射（点击高亮应用）：
                      </span>
                      {dhClipsCount > 0 && onBatchApplyDigitalHumanActions && (
                        <button
                          type="button"
                          onClick={handleBatchApplyRecommendedActions}
                          className="text-[9px] font-semibold text-amber-300 hover:text-amber-100 underline underline-offset-2 shrink-0"
                        >
                          一键同步全部数字人镜头
                        </button>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {activeActionRecommendation.clipSuggestions.map((cs, idx) => {
                        const actTmpl = getDigitalHumanActionTemplate(cs.recommendedAction);
                        const isCurClip = selectedClip?.id === cs.clipId;
                        return (
                          <button
                            key={cs.clipId}
                            type="button"
                            onClick={() => handleSelectActionTemplate(cs.recommendedAction)}
                            title={`${cs.clipLabel}（${cs.contextStage}）：${cs.reason}`}
                            className={`px-1.5 py-0.5 rounded border text-[9px] flex items-center gap-1 transition-colors ${
                              isCurClip
                                ? 'border-amber-300 bg-amber-400/25 text-amber-100 font-semibold'
                                : 'border-zinc-700/80 bg-[#0B0D10]/80 text-zinc-300 hover:border-amber-400/60'
                            }`}
                          >
                            <span className="truncate max-w-[64px]">
                              {idx + 1}.{cs.clipLabel}
                            </span>
                            <span className="text-amber-300 font-semibold">
                              · {actTmpl.label}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          <div
            className="grid grid-cols-3 gap-1.5"
            role="radiogroup"
            aria-label="数字人动作模板库"
          >
            {DIGITAL_HUMAN_ACTION_TEMPLATES.map((tmpl) => {
              const isSelected = selectedAction === tmpl.id;
              const isPrimaryRec =
                autoActionSuggestEnabled &&
                activeActionRecommendation.primaryAction === tmpl.id;
              const isSecondaryRec =
                autoActionSuggestEnabled &&
                !isPrimaryRec &&
                activeActionRecommendation.secondaryAction === tmpl.id;

              return (
                <button
                  key={tmpl.id}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => handleSelectActionTemplate(tmpl.id)}
                  title={
                    isPrimaryRec
                      ? `AI 脚本语境主推：${activeActionRecommendation.reason}`
                      : tmpl.summary
                  }
                  className={`group rounded-lg border p-1 text-left transition-all flex flex-col gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
                    isSelected && isPrimaryRec
                      ? 'border-cyan-400 bg-cyan-950/35 ring-2 ring-amber-400/75 shadow-[0_0_14px_rgba(251,191,36,0.3)]'
                      : isSelected
                        ? 'border-cyan-400 bg-cyan-950/35 ring-1 ring-cyan-400/35'
                        : isPrimaryRec
                          ? 'border-amber-400 bg-amber-500/15 ring-2 ring-amber-400/55 shadow-[0_0_14px_rgba(251,191,36,0.28)]'
                          : isSecondaryRec
                            ? 'border-amber-500/45 bg-amber-950/15 hover:border-amber-400/80'
                            : 'border-zinc-800 bg-[#0B0D10] hover:border-zinc-600'
                  }`}
                >
                  <div className="relative w-full h-11 rounded overflow-hidden bg-zinc-900">
                    <img
                      src={tmpl.thumbnailUrl}
                      alt={`${tmpl.label}动作缩略图`}
                      className="w-full h-full object-cover"
                    />
                    {isPrimaryRec && (
                      <span className="absolute top-0.5 left-0.5 px-1 py-0.2 rounded bg-amber-400 text-[8px] font-bold text-zinc-950 shadow">
                        推荐
                      </span>
                    )}
                    {isSecondaryRec && (
                      <span className="absolute top-0.5 left-0.5 px-1 py-0.2 rounded bg-amber-950/90 border border-amber-400/50 text-[8px] font-semibold text-amber-200">
                        备选
                      </span>
                    )}
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
                        isSelected
                          ? 'text-cyan-100'
                          : isPrimaryRec
                            ? 'text-amber-200'
                            : 'text-zinc-300'
                      }`}
                    >
                      {tmpl.label}
                    </span>
                    {isSelected ? (
                      <Check className="w-3 h-3 text-cyan-300 shrink-0" />
                    ) : isPrimaryRec ? (
                      <Sparkles className="w-3 h-3 text-amber-300 shrink-0" />
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>

          <p className="text-[10px] text-zinc-400 leading-snug">
            {getDigitalHumanActionTemplate(selectedAction).summary}
          </p>

          <div className="pt-1 border-t border-zinc-800/80 space-y-2.5">
            <div>
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
                    onUpdateClipDigitalHumanAction(selectedClip.id, selectedAction, nextVal, {
                      actionBlendDuration,
                    });
                  }
                }}
                className="w-full accent-cyan-400"
              />
            </div>

            {/* Motion Blending Slider */}
            <div className="pt-1.5 border-t border-zinc-800/70 space-y-1">
              <div className="flex items-center justify-between text-[10px]">
                <label htmlFor="dh-motion-blend-slider" className="text-zinc-300 font-medium">
                  动作混合 (Motion Blending)
                </label>
                <span className="font-mono-nums text-cyan-300">
                  {actionBlendDuration <= 0.02
                    ? '关闭 (硬切)'
                    : `${actionBlendDuration.toFixed(2)}s 自动插值`}
                </span>
              </div>
              <input
                id="dh-motion-blend-slider"
                type="range"
                min={0}
                max={1.5}
                step={0.05}
                value={actionBlendDuration}
                onChange={(e) => {
                  const nextBlend = Number(e.target.value);
                  setActionBlendDuration(nextBlend);
                  if (selectedClip?.digitalHuman) {
                    onUpdateClipDigitalHumanAction(
                      selectedClip.id,
                      selectedAction,
                      actionIntensity,
                      {
                        actionBlendDuration: nextBlend,
                        blendFromAction:
                          prevTimelineAction ??
                          (previousAction && previousAction !== selectedAction
                            ? previousAction
                            : undefined),
                      }
                    );
                  }
                }}
                className="w-full accent-cyan-400"
              />
              {(() => {
                const rawPrev =
                  prevTimelineAction && prevTimelineAction !== selectedAction
                    ? prevTimelineAction
                    : previousAction && previousAction !== selectedAction
                      ? previousAction
                      : null;
                const demoFrom: DigitalHumanActionId =
                  rawPrev ?? (selectedAction === 'wave' ? 'point' : selectedAction === 'point' ? 'wave' : 'point');
                const demoTo: DigitalHumanActionId =
                  rawPrev ? selectedAction : selectedAction === 'point' ? 'wave' : selectedAction;
                return (
                  <div className="flex items-center justify-between gap-2 text-[9px] text-zinc-400">
                    <span className="truncate">
                      {rawPrev
                        ? `过渡：${getDigitalHumanActionTemplate(rawPrev).label} → ${getDigitalHumanActionTemplate(selectedAction).label}`
                        : '连续动作切换时自动平滑插值（如 指引 → 挥手）'}
                    </span>
                    <button
                      type="button"
                      disabled={actionBlendDuration <= 0.02}
                      onClick={() => {
                        if (demoTo !== selectedAction) {
                          setSelectedAction(demoTo);
                        }
                        setPreviousAction(demoFrom);
                        triggerMiniStageBlendPreview(demoFrom, demoTo, actionBlendDuration);
                      }}
                      className="px-1.5 py-0.5 rounded border border-cyan-500/45 bg-cyan-950/35 hover:bg-cyan-900/45 disabled:opacity-40 text-[9px] font-semibold text-cyan-200 shrink-0 transition-colors"
                    >
                      预览过渡
                    </button>
                  </div>
                );
              })()}
            </div>
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
    </>
  );
}
