import { forwardRef, useImperativeHandle, useState } from 'react';
import { Check, Loader2, Plus, Sparkles, Trash2, Volume2 } from 'lucide-react';
import type {
  AudioConfig,
  PlatformId,
  SfxEvent,
  SfxLibrarySuggestion,
  SfxTriggerCategory,
  SfxType,
  SubtitleSegment,
  TimelineClip,
} from '../../types/studio';
import { formatEditSeconds } from '../../client/timeline/editSeconds';
import { placeSuggestedSfxEvents } from '../../domain/timeline/placeSfx';
import { captureClipSnapshotBase64, type LoadedMediaElement } from '../../utils/canvasRenderer';
import { apiFetch } from '../../client/api/http';

const SFX_LIBRARY_CATALOG: Array<{
  type: SfxType;
  label: string;
  shortTag: string;
  defaultCategory: SfxTriggerCategory;
  duration: number;
}> = [
  { type: 'whoosh', label: '咻声转场', shortTag: '咻 Whoosh', defaultCategory: 'transition', duration: 0.25 },
  { type: 'ding', label: '叮声高亮', shortTag: '叮 Ding', defaultCategory: 'subtitle', duration: 0.42 },
  { type: 'click', label: '咔哒点击', shortTag: '咔哒 Click', defaultCategory: 'action', duration: 0.08 },
  { type: 'pop', label: '气泡弹出', shortTag: '啵 Pop', defaultCategory: 'action', duration: 0.12 },
  { type: 'swoosh-impact', label: '重击扫响', shortTag: '爆点 Hit', defaultCategory: 'transition', duration: 0.35 },
  { type: 'shimmer', label: '星芒闪烁', shortTag: '星芒 Swell', defaultCategory: 'hook', duration: 0.45 },
];

const SFX_CATEGORY_LABELS: Record<SfxTriggerCategory, string> = {
  transition: '转场',
  action: '动作',
  subtitle: '字幕',
  hook: '钩子',
};

export type SfxSectionHandle = {
  clearError: () => void;
  applyPackaged: (suggestion: SfxLibrarySuggestion) => void;
};

interface SfxSectionProps {
  clips: TimelineClip[];
  subtitles: SubtitleSegment[];
  sfxEvents: SfxEvent[];
  platform: PlatformId;
  audio: AudioConfig;
  mediaCache: Map<string, LoadedMediaElement>;
  currentTime: number;
  onPreviewSfx: (type: SfxType, volume?: number) => void;
  onSetSfxEvents: (events: SfxEvent[]) => void;
  onAddSfxEvent: (event: SfxEvent) => void;
  onRemoveSfxEvent: (eventId: string) => void;
  onSeek: (timeSec: number) => void;
}

export const SfxSection = forwardRef<SfxSectionHandle, SfxSectionProps>(function SfxSection(
  {
    clips,
    subtitles,
    sfxEvents,
    platform,
    audio,
    mediaCache,
    currentTime,
    onPreviewSfx,
    onSetSfxEvents,
    onAddSfxEvent,
    onRemoveSfxEvent,
    onSeek,
  },
  ref
) {
  const [analyzingSfx, setAnalyzingSfx] = useState(false);
  const [sfxError, setSfxError] = useState<string | null>(null);
  const [sfxSuggestion, setSfxSuggestion] = useState<SfxLibrarySuggestion | null>(null);
  const [sfxAppliedAll, setSfxAppliedAll] = useState(false);

  useImperativeHandle(
    ref,
    () => ({
      clearError: () => setSfxError(null),
      applyPackaged: (suggestion) => {
        const placed = placeSuggestedSfxEvents(suggestion.events, {
          totalDuration: clips.reduce((sum, clip) => sum + clip.duration, 0),
          clips: clips.reduce<{ startTime: number; endTime: number }[]>((bounds, clip) => {
            const startTime = bounds.length === 0 ? 0 : bounds[bounds.length - 1].endTime;
            bounds.push({
              startTime: Number(startTime.toFixed(2)),
              endTime: Number((startTime + clip.duration).toFixed(2)),
            });
            return bounds;
          }, []),
          subtitles,
        });
        setSfxSuggestion({ ...suggestion, events: placed });
        setSfxAppliedAll(true);
      },
    }),
    [clips, subtitles],
  );

  const handleAnalyzeSfx = async () => {
    if (clips.length === 0) return;
    setAnalyzingSfx(true);
    setSfxError(null);
    setSfxAppliedAll(false);

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

      const res = await apiFetch('/api/suggest-sfx', {
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
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'AI 音效库推荐失败，请稍后重试。');
      }

      const events = placeSuggestedSfxEvents(
        Array.isArray(data?.events) ? (data.events as SfxEvent[]) : [],
        {
          totalDuration: cursor,
          clips: timelineNodes.map((node) => ({
            startTime: node.startTime,
            endTime: node.endTime,
          })),
          subtitles,
        },
      );
      if (events.length === 0) {
        throw new Error('未能分析出匹配的节点音效，请重试。');
      }

      setSfxSuggestion({
        librarySummary: data?.librarySummary || '已分析时间轴转场与动作节点并匹配微型音效。',
        events,
      });
    } catch (err: unknown) {
      setSfxError(err instanceof Error ? err.message : 'AI 音效分析失败，请检查网络后重试。');
    } finally {
      setAnalyzingSfx(false);
    }
  };

  const handleApplyAllSfx = () => {
    if (!sfxSuggestion || sfxSuggestion.events.length === 0) return;
    onSetSfxEvents(sfxSuggestion.events);
    setSfxAppliedAll(true);
    const first = sfxSuggestion.events[0];
    if (first) {
      onPreviewSfx(first.type, first.volume);
    }
  };

  const handleInsertManualSfx = (item: (typeof SFX_LIBRARY_CATALOG)[number]) => {
    const newEvent: SfxEvent = {
      id: `sfx-manual-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      type: item.type,
      name: item.label,
      time: Number(Math.max(0, currentTime).toFixed(2)),
      duration: item.duration,
      volume: 0.8,
      category: item.defaultCategory,
      reason: `手动插入于 ${currentTime.toFixed(1)}s`,
    };
    onAddSfxEvent(newEvent);
    onPreviewSfx(item.type, 0.8);
  };

  return (
          <div className="border-t border-zinc-800/80 pt-3.5 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
                <Volume2 className="w-3.5 h-3.5 text-cyan-400" />
                <span>AI 音效库推荐（微型音效 SFX）</span>
              </span>
              {sfxEvents.length > 0 && (
                <span className="text-[11px] font-mono-nums text-cyan-300">
                  已插 {sfxEvents.length} 处
                </span>
              )}
            </div>

            <p className="text-[11px] text-zinc-400 leading-relaxed">
              分析时间轴转场、字幕高亮与画面动作节点，自动匹配「咻」声、「叮」声、「咔哒」点击等微型音效。
            </p>

            <button
              type="button"
              disabled={analyzingSfx || clips.length === 0}
              onClick={handleAnalyzeSfx}
              className="w-full py-2 px-3 rounded-lg border border-zinc-700/90 bg-[#0B0D10] hover:border-cyan-500/70 hover:bg-zinc-900/70 disabled:opacity-50 text-xs font-medium text-zinc-100 flex items-center justify-center gap-2 transition-colors"
            >
              {analyzingSfx ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                  <span>正在分析时间轴动作节点...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                  <span>AI 音效库推荐并匹配节点</span>
                </>
              )}
            </button>

            {sfxError && (
              <div className="rounded-lg border border-red-500/40 bg-red-950/30 p-2.5 text-[11px] text-red-200 leading-relaxed">
                {sfxError}
              </div>
            )}

            {sfxSuggestion && (
              <div className="rounded-lg border border-zinc-800 bg-[#0B0D10] p-3 space-y-2.5">
                <p className="text-[11px] text-zinc-300 leading-relaxed">
                  {sfxSuggestion.librarySummary}
                </p>

                <div className="space-y-1.5 max-h-44 overflow-y-auto pr-0.5">
                  {sfxSuggestion.events.map((ev) => {
                    const alreadyAdded = sfxEvents.some((s) => s.id === ev.id);
                    return (
                      <div
                        key={ev.id}
                        className="rounded-md border border-zinc-800/90 bg-[#11141B] px-2 py-1.5 flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 text-[11px]">
                            <span className="font-mono-nums text-cyan-300 shrink-0">
                              {formatEditSeconds(ev.time)}s
                            </span>
                            <span className="text-zinc-500">·</span>
                            <span className="font-medium text-zinc-100 truncate">
                              {ev.name}
                            </span>
                            <span className="text-[10px] text-zinc-500 shrink-0">
                              {SFX_CATEGORY_LABELS[ev.category]}
                            </span>
                          </div>
                          {ev.reason && (
                            <p className="text-[10px] text-zinc-500 truncate mt-0.5">
                              {ev.reason}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            title="试听该音效"
                            onClick={() => onPreviewSfx(ev.type, ev.volume)}
                            className="p-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors"
                          >
                            <Volume2 className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            title={alreadyAdded ? '已在时间线中' : '插入到该时间点'}
                            onClick={() => {
                              onAddSfxEvent(ev);
                              onSeek(ev.time);
                              onPreviewSfx(ev.type, ev.volume);
                            }}
                            className={`p-1 rounded transition-colors ${
                              alreadyAdded
                                ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/40'
                                : 'bg-zinc-800 hover:bg-cyan-600 text-zinc-200 hover:text-white'
                            }`}
                          >
                            {alreadyAdded ? (
                              <Check className="w-3 h-3" />
                            ) : (
                              <Plus className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={handleApplyAllSfx}
                  className={`w-full py-2 px-3 rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                    sfxAppliedAll && sfxEvents.length > 0
                      ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                      : 'bg-cyan-600 hover:bg-cyan-500 text-white'
                  }`}
                >
                  {sfxAppliedAll && sfxEvents.length > 0 ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>已自动插入 {sfxEvents.length} 个节点音效</span>
                    </>
                  ) : (
                    <>
                      <Volume2 className="w-3.5 h-3.5" />
                      <span>一键自动插入全部推荐音效</span>
                    </>
                  )}
                </button>
              </div>
            )}

            {/* Quick Built-in Micro SFX Catalog */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] text-zinc-400">
                <span>微型音效库（点击试听 / + 插入当前帧）</span>
                <span className="font-mono-nums text-zinc-500">{currentTime.toFixed(1)}s</span>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {SFX_LIBRARY_CATALOG.map((item) => (
                  <div
                    key={item.type}
                    className="rounded-md border border-zinc-800 bg-[#0B0D10] flex items-center justify-between overflow-hidden"
                  >
                    <button
                      type="button"
                      onClick={() => onPreviewSfx(item.type, 0.8)}
                      className="flex-1 px-2 py-1.5 text-left text-[11px] text-zinc-300 hover:text-white hover:bg-zinc-900 flex items-center gap-1.5 min-w-0 transition-colors"
                      title={`试听 ${item.label}`}
                    >
                      <Volume2 className="w-3 h-3 text-cyan-400 shrink-0" />
                      <span className="truncate">{item.shortTag}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleInsertManualSfx(item)}
                      className="px-2 py-1.5 border-l border-zinc-800 text-zinc-400 hover:text-cyan-300 hover:bg-zinc-900 transition-colors"
                      title={`在 ${currentTime.toFixed(1)}s 插入 ${item.label}`}
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {sfxEvents.length > 0 && (
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-zinc-400">时间线已插入音效</span>
                  <button
                    type="button"
                    onClick={() => {
                      onSetSfxEvents([]);
                      setSfxAppliedAll(false);
                    }}
                    className="text-zinc-500 hover:text-red-300 transition-colors"
                  >
                    全部清空
                  </button>
                </div>
                <div className="space-y-1 max-h-32 overflow-y-auto pr-0.5">
                  {sfxEvents.map((ev) => (
                    <div
                      key={ev.id}
                      className="rounded border border-zinc-800/80 bg-[#0B0D10] px-2 py-1 flex items-center justify-between gap-2 text-[11px]"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          onSeek(ev.time);
                          onPreviewSfx(ev.type, ev.volume);
                        }}
                        className="flex items-center gap-1.5 min-w-0 flex-1 text-left hover:text-cyan-300 transition-colors"
                      >
                        <span className="font-mono-nums text-cyan-400 shrink-0">
                          {formatEditSeconds(ev.time)}s
                        </span>
                        <span className="text-zinc-200 truncate">{ev.name}</span>
                      </button>
                      <button
                        type="button"
                        aria-label={`移除音效 ${ev.name}`}
                        onClick={() => onRemoveSfxEvent(ev.id)}
                        className="text-zinc-500 hover:text-red-400 transition-colors shrink-0"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
  );
});
