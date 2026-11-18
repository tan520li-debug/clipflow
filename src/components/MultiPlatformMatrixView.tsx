import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Check, Copy, Download } from 'lucide-react';
import type { MediaAsset, PlatformId, PlatformProjectState } from '../types/studio';
import { editionLabel, EDITION_IDS, exportSrtSubtitles, formatTimecode, getTotalDuration } from '../utils/autoEditEngine';
import { renderTimelineFrame, type LoadedMediaElement } from '../utils/canvasRenderer';

interface MultiPlatformMatrixViewProps {
  projects: Record<PlatformId, PlatformProjectState>;
  assetsMap: Map<string, MediaAsset>;
  mediaCache: Map<string, LoadedMediaElement>;
  onEditPlatform: (pid: PlatformId) => void;
  onExportPlatform: (pid: PlatformId) => void;
}

function MiniCanvasSnapshot({
  project,
  assetsMap,
  mediaCache,
}: {
  project: PlatformProjectState;
  assetsMap: Map<string, MediaAsset>;
  mediaCache: Map<string, LoadedMediaElement>;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const isVertical = project.aspectRatio === '9:16';

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const previewTime = Math.min(0.6, Math.max(0.1, getTotalDuration(project.clips) * 0.12));
    renderTimelineFrame({
      ctx,
      width: canvas.width,
      height: canvas.height,
      timeSec: previewTime,
      clips: project.clips,
      subtitles: project.subtitles,
      assetsMap,
      mediaCache,
      voiceoverCues: project.voiceoverCues,
      voiceoverEnabled: Boolean(project.audio.voiceoverEnabled),
    });
  }, [project, assetsMap, mediaCache]);

  return (
    <canvas
      ref={ref}
      width={360}
      height={isVertical ? 640 : 450}
      className="w-full h-full object-cover block"
    />
  );
}

export function MultiPlatformMatrixView({
  projects,
  assetsMap,
  mediaCache,
  onEditPlatform,
  onExportPlatform,
}: MultiPlatformMatrixViewProps) {
  const [copiedId, setCopiedId] = useState<PlatformId | null>(null);

  const handleCopy = async (project: PlatformProjectState) => {
    const text = `${project.copy.title}\n\n${project.copy.caption}\n\n${project.copy.hashtags
      .map((h) => `#${h}`)
      .join(' ')}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(project.platform);
      window.setTimeout(() => setCopiedId(null), 1800);
    } catch {
      // ignore
    }
  };

  const handleDownloadSrt = (project: PlatformProjectState) => {
    const srt = exportSrtSubtitles(project.subtitles);
    const blob = new Blob([srt], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.platform}_subtitles.srt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const order: PlatformId[] = [...EDITION_IDS];

  return (
    <main className="flex-1 overflow-y-auto bg-[#0B0D10] p-6">
      <div className="max-w-[1320px] mx-auto space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-zinc-800/80 pb-4">
          <div>
            <h1 className="text-xl font-bold text-zinc-100 font-display">
              中文版与英文版
            </h1>
            <p className="mt-1 text-xs text-zinc-400">
              同一条片子剪一版中文、一版英文。成片可以发到抖音、小红书、TikTok、Instagram 或 Facebook，不用按平台各剪一条。
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
          {order.map((pid) => {
            const project = projects[pid];
            const totalDur = getTotalDuration(project.clips);

            return (
              <article
                key={pid}
                className="border border-zinc-800 bg-[#11141B] rounded-xl p-5 flex flex-col justify-between gap-5"
              >
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-base font-bold text-zinc-100 font-display">
                        {editionLabel(pid)}
                      </h2>
                      <p className="mt-0.5 text-[11px] text-zinc-400 font-mono-nums">
                        {project.aspectRatio} · {formatTimecode(totalDur)} · {project.clips.length} 镜头 ·{' '}
                        {project.audio.bpm} BPM
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onEditPlatform(pid)}
                      className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-200 flex items-center gap-1 whitespace-nowrap shrink-0 transition-colors"
                    >
                      <span>精修时间线</span>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Frame Preview */}
                  <div className="w-full h-[300px] rounded-lg bg-black border border-zinc-800 overflow-hidden flex items-center justify-center">
                    <div
                      className="h-full overflow-hidden"
                      style={{
                        aspectRatio: project.aspectRatio === '9:16' ? '9 / 16' : '4 / 5',
                      }}
                    >
                      <MiniCanvasSnapshot
                        project={project}
                        assetsMap={assetsMap}
                        mediaCache={mediaCache}
                      />
                    </div>
                  </div>

                  {/* Platform Copy */}
                  <div className="space-y-2.5 pt-1">
                    <div>
                      <span className="text-[11px] text-zinc-500">开场钩子</span>
                      <p className="text-xs font-medium text-rose-300 mt-0.5">
                        {project.copy.hookOpening}
                      </p>
                    </div>

                    <div>
                      <span className="text-[11px] text-zinc-500">推荐发布标题</span>
                      <p className="text-sm font-semibold text-zinc-100 mt-0.5 leading-snug">
                        {project.copy.title}
                      </p>
                    </div>

                    <p className="text-xs text-zinc-400 leading-relaxed">{project.copy.caption}</p>

                    <p className="text-xs text-zinc-300">
                      {project.copy.hashtags.map((h) => `#${h}`).join(' ')}
                    </p>
                  </div>
                </div>

                <div className="border-t border-zinc-800/80 pt-4 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onExportPlatform(pid)}
                    className="flex-1 py-2 px-3 rounded-lg bg-rose-600 hover:bg-rose-500 text-xs font-semibold text-white flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>导出这一版</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCopy(project)}
                    className="py-2 px-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-200 flex items-center gap-1.5 transition-colors whitespace-nowrap"
                  >
                    {copiedId === pid ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    <span>{copiedId === pid ? '已复制' : '复制文案'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDownloadSrt(project)}
                    className="py-2 px-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-mono-nums text-zinc-300 transition-colors whitespace-nowrap"
                  >
                    .SRT
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </main>
  );
}
