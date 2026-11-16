import type { TransitionType } from '../types/studio';

interface TransitionMiniPreviewProps {
  type: TransitionType;
  active?: boolean;
  motionBlurPx?: number;
}

export function TransitionMiniPreview({
  type,
  active = false,
  motionBlurPx = 0,
}: TransitionMiniPreviewProps) {
  const borderClass = active ? 'border-rose-500/60' : 'border-zinc-800';
  const cssFilterStyle =
    active && motionBlurPx > 0
      ? { filter: `blur(${Math.min(3.5, motionBlurPx * 0.14).toFixed(2)}px)` }
      : undefined;

  if (type === 'iris-wipe') {
    return (
      <div
        aria-hidden="true"
        className={`relative w-full h-8 rounded overflow-hidden border bg-[#080A0D] ${borderClass}`}
        style={cssFilterStyle}
      >
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-zinc-700 via-zinc-800 to-zinc-900">
          <div className="w-3.5 h-3.5 rounded-sm bg-amber-400/80 rotate-6" />
        </div>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-rose-700 via-rose-900 to-zinc-950 flex items-center justify-center anim-tr-iris-b">
            <div className="w-3 h-3 rounded-full bg-rose-300/90" />
          </div>
        </div>
      </div>
    );
  }

  if (type === 'curtain-split') {
    return (
      <div
        aria-hidden="true"
        className={`relative w-full h-8 rounded overflow-hidden border bg-[#080A0D] ${borderClass}`}
        style={cssFilterStyle}
      >
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-rose-900/80 via-zinc-900 to-zinc-950">
          <div className="w-4 h-4 rounded-full bg-rose-400/90" />
        </div>
        <div className="absolute inset-y-0 left-0 w-1/2 bg-zinc-700 border-r border-zinc-600/60 anim-tr-curtain-left" />
        <div className="absolute inset-y-0 right-0 w-1/2 bg-zinc-800 border-l border-zinc-600/60 anim-tr-curtain-right" />
      </div>
    );
  }

  const animClasses: Record<
    Exclude<TransitionType, 'iris-wipe' | 'curtain-split'>,
    { a: string; b: string }
  > = {
    cut: { a: 'anim-tr-cut-a', b: 'anim-tr-cut-b' },
    crossfade: { a: 'anim-tr-fade-a', b: 'anim-tr-fade-b' },
    'zoom-punch': { a: 'anim-tr-zoom-a', b: 'anim-tr-zoom-b' },
    'spin-switch': { a: 'anim-tr-spin-a', b: 'anim-tr-spin-b' },
    'whip-pan': { a: 'anim-tr-whip-a', b: 'anim-tr-whip-b' },
    flash: { a: 'anim-tr-cut-a', b: 'anim-tr-cut-b' },
    'blur-dissolve': { a: 'anim-tr-blur-a', b: 'anim-tr-blur-b' },
    'push-pull': { a: 'anim-tr-push-a', b: 'anim-tr-push-b' },
    'page-flip': { a: 'anim-tr-flip-a', b: 'anim-tr-flip-b' },
    'glitch-slice': { a: 'anim-tr-cut-a', b: 'anim-tr-cut-b' },
  };

  const cls = animClasses[type];

  return (
    <div
      aria-hidden="true"
      className={`relative w-full h-8 rounded overflow-hidden border bg-[#080A0D] ${borderClass}`}
      style={cssFilterStyle}
    >
      {/* Outgoing Scene A */}
      <div
        className={`absolute inset-0 flex items-center justify-center bg-gradient-to-br from-zinc-700 via-zinc-800 to-zinc-900 ${cls.a}`}
      >
        <div className="w-3.5 h-3.5 rounded-sm bg-amber-400/80 rotate-6" />
      </div>

      {/* Incoming Scene B */}
      <div
        className={`absolute inset-0 flex items-center justify-center bg-gradient-to-br from-rose-900/80 via-zinc-900 to-zinc-950 ${cls.b}`}
      >
        <div className="w-4 h-4 rounded-full bg-rose-400/90" />
      </div>

      {/* Flash burst overlay */}
      {type === 'flash' && (
        <div className="absolute inset-0 bg-white pointer-events-none anim-tr-flash-overlay" />
      )}

      {/* Glitch slice bars */}
      {type === 'glitch-slice' && (
        <div className="absolute inset-x-0 top-2.5 h-2.5 bg-cyan-400/60 mix-blend-screen pointer-events-none anim-tr-glitch-slice" />
      )}
    </div>
  );
}
