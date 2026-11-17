import { useState } from 'react';
import {
  Check,
  Copy,
  Eye,
  EyeOff,
  Pause,
  Play,
  RotateCcw,
  Scissors,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { AspectRatio, PlatformId, PlatformProjectState } from '../types/studio';
import { formatTimecode, getTotalDuration } from '../utils/autoEditEngine';
import { computeTransitionBlurPx } from '../utils/canvasRenderer';

interface PreviewStageProps {
  activePlatform: PlatformId;
  onChangePlatform: (pid: PlatformId) => void;
  project: PlatformProjectState;
  onChangeAspectRatio: (ratio: AspectRatio) => void;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onSeekStart: () => void;
  onSplitAtPlayhead: () => void;
  currentTime: number;
  isMuted: boolean;
  onToggleMute: () => void;
}

export function PreviewStage({
  activePlatform,
  onChangePlatform,
  project,
  onChangeAspectRatio,
  canvasRef,
  isPlaying,
  onTogglePlay,
  onSeekStart,
  onSplitAtPlayhead,
  currentTime,
  isMuted,
  onToggleMute,
}: PreviewStageProps) {
  const [showSafeZones, setShowSafeZones] = useState(true);
  const [copied, setCopied] = useState(false);

  const totalDuration = getTotalDuration(project.clips);
  const isVertical916 = project.aspectRatio === '9:16';
  const activeTransitionBlurPx = computeTransitionBlurPx(project.clips, currentTime);

  const handleCopyMetadata = async () => {
    const tags = project.copy.hashtags.map((t) => `#${t}`).join(' ');
    const payload = `${project.copy.title}\n\n${project.copy.caption}\n\n${tags}`;
    try {
      await navigator.clipboard.writeText(payload);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore clipboard restrictions
    }
  };

  return (
    <section className="flex-1 min-w-[420px] bg-[#0B0D10] flex flex-col min-h-0">
      {/* Stage Top Toolbar */}
      <div className="px-5 py-2.5 border-b border-zinc-800/80 bg-[#0E1015]/80 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 bg-[#0B0D10] rounded-lg border border-zinc-800/90">
          {(
            [
              { id: 'douyin', label: '抖音 Douyin' },
              { id: 'tiktok', label: 'TikTok' },
              { id: 'facebook', label: 'Facebook Reels' },
            ] as const
          ).map((item) => {
            const active = activePlatform === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onChangePlatform(item.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-rose-600 text-white'
                    : 'text-zinc-400 hover:text-zinc-100'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 p-1 bg-[#0B0D10] rounded-lg border border-zinc-800/90">
            {(['9:16', '4:5'] as const).map((ratio) => (
              <button
                key={ratio}
                type="button"
                onClick={() => onChangeAspectRatio(ratio)}
                className={`px-2.5 py-1 text-[11px] font-mono-nums font-medium rounded transition-colors whitespace-nowrap ${
                  project.aspectRatio === ratio
                    ? 'bg-zinc-800 text-zinc-100'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {ratio}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setShowSafeZones((prev) => !prev)}
            className={`px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors flex items-center gap-1.5 whitespace-nowrap ${
              showSafeZones
                ? 'border-zinc-700 bg-zinc-800/80 text-zinc-100'
                : 'border-zinc-800 bg-[#0B0D10] text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {showSafeZones ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            <span>平台安全区</span>
          </button>
        </div>
      </div>

      {/* Main Canvas Stage */}
      <div className="flex-1 min-h-0 flex items-center justify-center gap-6 px-5 py-4 overflow-hidden">
        <div className="flex flex-col items-center justify-center h-full max-h-full">
          <div
            className="relative bg-black rounded-xl overflow-hidden border border-zinc-800 shadow-2xl flex items-center justify-center"
            style={{
              aspectRatio: isVertical916 ? '9 / 16' : '4 / 5',
              height: 'min(100%, 440px)',
              maxHeight: '100%',
            }}
          >
            <canvas
              ref={canvasRef}
              width={isVertical916 ? 540 : 540}
              height={isVertical916 ? 960 : 675}
              onClick={onTogglePlay}
              style={{
                filter:
                  activeTransitionBlurPx > 0.1
                    ? `blur(${activeTransitionBlurPx.toFixed(1)}px)`
                    : undefined,
                transition: 'filter 45ms linear',
              }}
              className="w-full h-full object-contain cursor-pointer block"
            />

            {/* Platform Safe Zone Guides */}
            {showSafeZones && (
              <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-3 text-[10px] text-white/75">
                <div className="flex items-center justify-between border-b border-dashed border-white/25 pb-1.5">
                  <span className="font-mono-nums">
                    {activePlatform === 'douyin'
                      ? '抖音安全顶栏'
                      : activePlatform === 'tiktok'
                        ? 'Following · For You'
                        : 'Reels Safe Top'}
                  </span>
                  <span className="font-mono-nums">{project.aspectRatio}</span>
                </div>

                {/* Right interactive rail safe zone */}
                <div className="flex-1 relative">
                  <div className="absolute right-0 bottom-4 w-10 h-36 border border-dashed border-rose-400/50 rounded flex flex-col items-center justify-end pb-1.5 gap-2 bg-black/15">
                    <div className="w-4 h-4 rounded-full border border-white/40" />
                    <div className="w-4 h-4 rounded-full border border-white/40" />
                    <div className="w-4 h-4 rounded-full border border-white/40" />
                  </div>
                </div>

                <div className="border-t border-dashed border-amber-300/45 pt-1.5 pr-12">
                  <p className="truncate font-medium text-white/80">
                    {activePlatform === 'douyin'
                      ? `@创作者 · ${project.copy.title}`
                      : project.copy.title}
                  </p>
                  <p className="truncate text-[9px] text-white/55">
                    {project.copy.hashtags.slice(0, 3).map((h) => `#${h}`).join(' ')}
                  </p>
                </div>
              </div>
            )}

            {!isPlaying && (
              <button
                type="button"
                onClick={onTogglePlay}
                aria-label="播放预览"
                className="absolute inset-0 flex items-center justify-center bg-black/20 hover:bg-black/10 transition-colors group"
              >
                <span className="w-12 h-12 rounded-full bg-black/70 border border-white/20 flex items-center justify-center text-white group-hover:scale-105 transition-transform">
                  <Play className="w-5 h-5 translate-x-0.5" />
                </span>
              </button>
            )}
          </div>

          {/* Transport Bar */}
          <div className="mt-3 flex items-center gap-2 bg-[#12151C] border border-zinc-800/90 rounded-lg px-3 py-1.5">
            <button
              type="button"
              onClick={onSeekStart}
              title="回到开头"
              className="p-1.5 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={onTogglePlay}
              className="px-3 py-1 rounded bg-zinc-100 hover:bg-white text-zinc-950 text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap"
            >
              {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              <span>{isPlaying ? '暂停' : '播放'}</span>
            </button>

            <button
              type="button"
              onClick={onSplitAtPlayhead}
              title="在当前播放头位置分割片段"
              className="px-2.5 py-1 rounded bg-zinc-800/80 hover:bg-zinc-700 text-zinc-200 text-xs font-medium flex items-center gap-1 transition-colors whitespace-nowrap"
            >
              <Scissors className="w-3.5 h-3.5" />
              <span>分割</span>
            </button>

            <button
              type="button"
              onClick={onToggleMute}
              title={isMuted ? '取消静音' : '静音'}
              className="p-1.5 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
            >
              {isMuted ? <VolumeX className="w-3.5 h-3.5 text-rose-400" /> : <Volume2 className="w-3.5 h-3.5" />}
            </button>

            <div className="pl-2 border-l border-zinc-800 text-xs font-mono-nums text-zinc-300 whitespace-nowrap">
              {formatTimecode(currentTime)}{' '}
              <span className="text-zinc-500">/ {formatTimecode(totalDuration)}</span>
            </div>
          </div>
        </div>

        {/* Platform Publishing Copy Card (Right of monitor on wide desktop) */}
        <div className="hidden xl:flex flex-col w-[260px] shrink-0 border border-zinc-800/80 bg-[#11141B] rounded-xl p-4 space-y-3 self-center">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-zinc-200">
              {activePlatform === 'douyin'
                ? '抖音发布文案'
                : activePlatform === 'tiktok'
                  ? 'TikTok 发布文案'
                  : 'Facebook 文案'}
            </span>
            <button
              type="button"
              onClick={handleCopyMetadata}
              className="text-[11px] font-medium text-zinc-300 hover:text-white flex items-center gap-1 px-2 py-1 rounded bg-zinc-800/80 hover:bg-zinc-700 transition-colors"
            >
              {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              <span>{copied ? '已复制' : '复制'}</span>
            </button>
          </div>

          <div className="space-y-1">
            <span className="text-[11px] text-zinc-500">开场黄金钩子</span>
            <p className="text-xs font-medium text-rose-300 leading-snug">
              {project.copy.hookOpening}
            </p>
          </div>

          <div className="border-t border-zinc-800/80 pt-2.5 space-y-1">
            <span className="text-[11px] text-zinc-500">推荐标题</span>
            <p className="text-xs font-semibold text-zinc-100 leading-snug">{project.copy.title}</p>
          </div>

          <div className="space-y-1">
            <span className="text-[11px] text-zinc-500">正文引导与标签</span>
            <p className="text-[11px] text-zinc-400 leading-relaxed line-clamp-4">
              {project.copy.caption}
            </p>
            <p className="text-[11px] text-zinc-300 leading-relaxed pt-1">
              {project.copy.hashtags.map((h) => `#${h}`).join(' ')}
            </p>
          </div>

          <div className="border-t border-zinc-800/80 pt-2.5 text-[11px] text-zinc-500 font-mono-nums flex items-center gap-1.5">
            <span>{project.clips.length} 镜头</span>
            <span aria-hidden="true">·</span>
            <span>{project.subtitles.length} 字幕</span>
            <span aria-hidden="true">·</span>
            <span>{project.audio.bpm} BPM</span>
          </div>
        </div>
      </div>
    </section>
  );
}
