import { useEffect, useState, type ReactNode } from 'react';
import { Check, ChevronDown, ChevronUp, GitCommitHorizontal, Loader2, Play, Sparkles } from 'lucide-react';
import type {
  AudioConfig,
  PlatformId,
  TimelineClip,
  TransitionSequenceSuggestion,
  TransitionSuggestion,
  TransitionType,
} from '../../types/studio';
import { captureClipSnapshotBase64, type LoadedMediaElement } from '../../utils/canvasRenderer';
import { apiFetch } from '../../client/api/http';
import { TransitionMiniPreview } from '../TransitionMiniPreview';

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

interface TransitionSectionProps {
  selectedClip: TimelineClip | null;
  nextClip: TimelineClip | null;
  clips: TimelineClip[];
  platform: PlatformId;
  audio: AudioConfig;
  mediaCache: Map<string, LoadedMediaElement>;
  onUpdateClip: (clipId: string, patch: Partial<TimelineClip>) => void;
  onApplyTransitionSequence: (
    updates: Array<{ clipId: string; transition: TransitionType }>
  ) => void;
  onPreviewTransitionAtCut: (targetClipId: string) => void;
  children: (picker: ReactNode, advisor: ReactNode) => ReactNode;
}

export function TransitionSection({
  selectedClip,
  nextClip,
  clips,
  platform,
  audio,
  mediaCache,
  onUpdateClip,
  onApplyTransitionSequence,
  onPreviewTransitionAtCut,
  children,
}: TransitionSectionProps) {
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

      const res = await apiFetch('/api/suggest-transition', {
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

      const res = await apiFetch('/api/suggest-transition-sequence', {
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

  const picker = selectedClip ? (
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
  ) : null;

  const advisor = selectedClip ? (
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
  ) : null;

  return children(picker, advisor);
}
