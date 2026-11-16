import { useEffect, useState, type ReactNode } from 'react';
import { Loader2, Palette, RotateCcw } from 'lucide-react';
import type { ColorAdjustments, ColorFilter, PlatformId, TimelineClip } from '../../types/studio';
import {
  captureClipSnapshotBase64,
  renderColorComparisonThumbnail,
  type LoadedMediaElement,
} from '../../utils/canvasRenderer';
import { apiFetch } from '../../client/api/http';

interface ColorSectionProps {
  selectedClip: TimelineClip | null;
  nextClip: TimelineClip | null;
  platform: PlatformId;
  mediaCache: Map<string, LoadedMediaElement>;
  onUpdateClip: (clipId: string, patch: Partial<TimelineClip>) => void;
  children: (colorNode: ReactNode) => ReactNode;
}

export function ColorSection({
  selectedClip,
  nextClip,
  platform,
  mediaCache,
  onUpdateClip,
  children,
}: ColorSectionProps) {
  const [matchingColor, setMatchingColor] = useState(false);
  const [colorError, setColorError] = useState<string | null>(null);

  useEffect(() => {
    setColorError(null);
  }, [selectedClip?.id]);

  const handleAiMatchColor = async () => {
    if (!selectedClip) return;
    const el = mediaCache.get(selectedClip.assetId);
    const frameBase64 = captureClipSnapshotBase64(el, 'natural');
    if (!frameBase64) {
      setColorError('当前片段尚未加载完成，请稍候再试。');
      return;
    }

    const refEl = nextClip ? mediaCache.get(nextClip.assetId) : undefined;
    const referenceFrameBase64 = refEl ? captureClipSnapshotBase64(refEl, nextClip?.filter ?? 'natural') : null;

    setMatchingColor(true);
    setColorError(null);

    try {
      const res = await apiFetch('/api/match-color', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform,
          clipLabel: selectedClip.label,
          currentFilter: selectedClip.filter,
          frameBase64,
          referenceFrameBase64,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'AI 色调匹配失败，请稍后重试。');
      }

      const validFilters: ColorFilter[] = ['natural', 'cinematic', 'vibrant', 'warm-film', 'cool-clean'];
      const matchedFilter = validFilters.includes(data?.recommendedFilter)
        ? (data.recommendedFilter as ColorFilter)
        : selectedClip.filter;

      const clamp = (val: unknown, min: number, max: number, fallback: number) => {
        const n = Number(val);
        return Number.isFinite(n) ? Number(Math.max(min, Math.min(max, n)).toFixed(2)) : fallback;
      };

      const nextAdj: ColorAdjustments = {
        contrast: clamp(data?.contrast, 0.85, 1.35, 1.08),
        saturation: clamp(data?.saturation, 0.78, 1.45, 1.12),
        brightness: clamp(data?.brightness, 0.85, 1.2, 1.02),
        colorTempLabel: data?.colorTempLabel || '智能平衡色温',
        analysisNote: data?.analysisNote || '已依据画面高光与饱和度分布自动校准。',
      };

      onUpdateClip(selectedClip.id, {
        filter: matchedFilter,
        colorAdjustments: nextAdj,
      });
    } catch (err: unknown) {
      setColorError(err instanceof Error ? err.message : 'AI 色调分析失败，请重试。');
    } finally {
      setMatchingColor(false);
    }
  };

  const handleUpdateColorAdj = (patch: Partial<ColorAdjustments>) => {
    if (!selectedClip) return;
    const base: ColorAdjustments = selectedClip.colorAdjustments ?? {
      contrast: 1,
      saturation: 1,
      brightness: 1,
    };
    onUpdateClip(selectedClip.id, {
      colorAdjustments: { ...base, ...patch },
    });
  };

  const colorNode = selectedClip ? (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <label htmlFor="clip-filter" className="text-[11px] text-zinc-400">
                  画面调色与视觉调节
                </label>
                {selectedClip.colorAdjustments && (
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateClip(selectedClip.id, {
                        filter: 'natural',
                        colorAdjustments: undefined,
                      })
                    }
                    className="text-[11px] text-zinc-400 hover:text-zinc-200 flex items-center gap-1 transition-colors"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>还原默认</span>
                  </button>
                )}
              </div>

              <select
                id="clip-filter"
                value={selectedClip.filter}
                onChange={(e) =>
                  onUpdateClip(selectedClip.id, { filter: e.target.value as ColorFilter })
                }
                className="w-full rounded-lg bg-[#0B0D10] border border-zinc-800 px-3 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-rose-500"
              >
                <option value="natural">原色质感 (Natural)</option>
                <option value="cinematic">电影青橙调 (Cinematic)</option>
                <option value="vibrant">高饱和通透 (Vibrant)</option>
                <option value="warm-film">暖调胶片 (Warm Film)</option>
                <option value="cool-clean">冷调极简 (Cool Clean)</option>
              </select>

              <button
                type="button"
                disabled={matchingColor}
                onClick={handleAiMatchColor}
                className="w-full py-2 px-3 rounded-lg border border-zinc-700/90 bg-[#0B0D10] hover:border-rose-500/70 hover:bg-zinc-900/70 disabled:opacity-50 text-xs font-medium text-zinc-100 flex items-center justify-center gap-2 transition-colors"
              >
                {matchingColor ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-rose-400" />
                    <span>正在分析色温与饱和度...</span>
                  </>
                ) : (
                  <>
                    <Palette className="w-3.5 h-3.5 text-rose-400" />
                    <span>AI 智能色调匹配</span>
                  </>
                )}
              </button>

              {colorError && (
                <div className="rounded-lg border border-red-500/40 bg-red-950/30 p-2.5 text-[11px] text-red-200 leading-relaxed">
                  {colorError}
                </div>
              )}

              {(selectedClip.colorAdjustments || selectedClip.filter !== 'natural') && (() => {
                const el = mediaCache.get(selectedClip.assetId);
                const beforeThumb = renderColorComparisonThumbnail(el, 'natural');
                const afterThumb = renderColorComparisonThumbnail(
                  el,
                  selectedClip.filter,
                  selectedClip.colorAdjustments
                );
                const adj = selectedClip.colorAdjustments ?? {
                  contrast: 1,
                  saturation: 1,
                  brightness: 1,
                };

                return (
                  <div className="rounded-lg border border-zinc-800 bg-[#0B0D10] p-3 space-y-3">
                    {adj.colorTempLabel && (
                      <div className="space-y-1">
                        <span className="block text-[11px] font-semibold text-rose-300">
                          {adj.colorTempLabel}
                        </span>
                        {adj.analysisNote && (
                          <p className="text-[11px] text-zinc-400 leading-relaxed">
                            {adj.analysisNote}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Before / After Comparison Preview */}
                    {beforeThumb && afterThumb && (
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <div className="aspect-[3/4] rounded overflow-hidden border border-zinc-800 bg-black">
                            <img
                              src={beforeThumb}
                              alt="调色前原片预览"
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <span className="block text-center text-[10px] text-zinc-500">
                            原片
                          </span>
                        </div>
                        <div className="space-y-1">
                          <div className="aspect-[3/4] rounded overflow-hidden border border-rose-500/50 bg-black">
                            <img
                              src={afterThumb}
                              alt="AI 色调匹配后预览"
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <span className="block text-center text-[10px] text-rose-300 font-medium">
                            匹配后
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Fine-tune Contrast / Saturation / Brightness */}
                    <div className="space-y-2 pt-1 border-t border-zinc-800/70">
                      <div>
                        <div className="flex items-center justify-between text-[11px] text-zinc-400 mb-0.5">
                          <label htmlFor="adj-contrast">对比度</label>
                          <span className="font-mono-nums">{adj.contrast.toFixed(2)}x</span>
                        </div>
                        <input
                          id="adj-contrast"
                          type="range"
                          min={0.75}
                          max={1.45}
                          step={0.02}
                          value={adj.contrast}
                          onChange={(e) =>
                            handleUpdateColorAdj({ contrast: Number(e.target.value) })
                          }
                          className="w-full accent-rose-500"
                        />
                      </div>

                      <div>
                        <div className="flex items-center justify-between text-[11px] text-zinc-400 mb-0.5">
                          <label htmlFor="adj-saturation">饱和度</label>
                          <span className="font-mono-nums">{adj.saturation.toFixed(2)}x</span>
                        </div>
                        <input
                          id="adj-saturation"
                          type="range"
                          min={0.6}
                          max={1.6}
                          step={0.02}
                          value={adj.saturation}
                          onChange={(e) =>
                            handleUpdateColorAdj({ saturation: Number(e.target.value) })
                          }
                          className="w-full accent-rose-500"
                        />
                      </div>

                      <div>
                        <div className="flex items-center justify-between text-[11px] text-zinc-400 mb-0.5">
                          <label htmlFor="adj-brightness">亮度</label>
                          <span className="font-mono-nums">{adj.brightness.toFixed(2)}x</span>
                        </div>
                        <input
                          id="adj-brightness"
                          type="range"
                          min={0.75}
                          max={1.3}
                          step={0.02}
                          value={adj.brightness}
                          onChange={(e) =>
                            handleUpdateColorAdj({ brightness: Number(e.target.value) })
                          }
                          className="w-full accent-rose-500"
                        />
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
  ) : null;

  return children(colorNode);
}
