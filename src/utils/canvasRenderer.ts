import type {
  ColorAdjustments,
  ColorFilter,
  MediaAsset,
  MotionType,
  SubtitleSegment,
  TimelineClip,
} from '../types/studio';

export type LoadedMediaElement = HTMLImageElement | HTMLVideoElement;

interface TemporalFrameBuffer {
  prevCanvas: HTMLCanvasElement;
  currCanvas: HTMLCanvasElement;
  lastMediaTime: number;
  lastUpdatePerf: number;
  initialized: boolean;
}

const opticalFlowBuffers = new Map<string, TemporalFrameBuffer>();

function getCanvasFilterString(filter: ColorFilter, adj?: ColorAdjustments): string {
  let contrast = 1;
  let saturate = 1;
  let brightness = 1;
  let sepia = 0;
  let hueDeg = 0;

  switch (filter) {
    case 'cinematic':
      contrast = 1.12;
      saturate = 0.92;
      brightness = 0.96;
      break;
    case 'vibrant':
      contrast = 1.08;
      saturate = 1.28;
      brightness = 1.03;
      break;
    case 'warm-film':
      contrast = 1.06;
      sepia = 0.18;
      saturate = 1.12;
      brightness = 1.01;
      break;
    case 'cool-clean':
      contrast = 1.05;
      saturate = 0.95;
      hueDeg = -6;
      brightness = 1.04;
      break;
    case 'natural':
    default:
      break;
  }

  if (adj) {
    contrast *= adj.contrast;
    saturate *= adj.saturation;
    brightness *= adj.brightness;
  }

  const parts: string[] = [];
  if (Math.abs(contrast - 1) > 0.01) parts.push(`contrast(${contrast.toFixed(2)})`);
  if (Math.abs(saturate - 1) > 0.01) parts.push(`saturate(${saturate.toFixed(2)})`);
  if (Math.abs(brightness - 1) > 0.01) parts.push(`brightness(${brightness.toFixed(2)})`);
  if (sepia > 0.01) parts.push(`sepia(${sepia.toFixed(2)})`);
  if (Math.abs(hueDeg) > 0.1) parts.push(`hue-rotate(${hueDeg}deg)`);

  return parts.length > 0 ? parts.join(' ') : 'none';
}

function drawCoverMedia(
  ctx: CanvasRenderingContext2D,
  el: LoadedMediaElement,
  width: number,
  height: number,
  motion: MotionType,
  progress: number,
  filter: ColorFilter,
  extraScale = 1,
  offsetX = 0,
  alpha = 1,
  rotationRad = 0,
  offsetY = 0,
  scaleX = 1,
  extraBlurPx = 0,
  colorAdj?: ColorAdjustments
) {
  const naturalW = el instanceof HTMLVideoElement ? el.videoWidth || 1080 : el.naturalWidth || 1080;
  const naturalH = el instanceof HTMLVideoElement ? el.videoHeight || 1920 : el.naturalHeight || 1920;

  if (!naturalW || !naturalH) return;

  ctx.save();
  ctx.globalAlpha = alpha;
  const baseFilter = getCanvasFilterString(filter, colorAdj);
  ctx.filter =
    extraBlurPx > 0.2
      ? `${baseFilter === 'none' ? '' : `${baseFilter} `}blur(${extraBlurPx.toFixed(1)}px)`.trim()
      : baseFilter;

  // Base cover scale
  const coverScale = Math.max(width / naturalW, height / naturalH);

  let zoom = 1;
  let panX = 0;
  let panY = 0;

  switch (motion) {
    case 'ken-burns-in':
      zoom = 1 + 0.08 * progress;
      break;
    case 'ken-burns-out':
      zoom = 1.09 - 0.08 * progress;
      break;
    case 'pan-left':
      zoom = 1.08;
      panX = (0.5 - progress) * width * 0.05;
      break;
    case 'pan-right':
      zoom = 1.08;
      panX = (progress - 0.5) * width * 0.05;
      break;
    case 'static':
    default:
      zoom = 1.01;
      break;
  }

  const finalScale = coverScale * zoom * extraScale;
  const drawW = naturalW * finalScale;
  const drawH = naturalH * finalScale;

  ctx.translate(width / 2 + panX + offsetX, height / 2 + panY + offsetY);
  if (rotationRad !== 0) {
    ctx.rotate(rotationRad);
  }
  if (scaleX !== 1) {
    ctx.scale(scaleX, 1);
  }
  ctx.drawImage(el, -drawW / 2, -drawH / 2, drawW, drawH);
  ctx.restore();
}

function drawWithOpticalFlowSmoothing(
  ctx: CanvasRenderingContext2D,
  clip: TimelineClip,
  el: LoadedMediaElement,
  width: number,
  height: number,
  progress: number
) {
  const key = `${clip.id}_${width}x${height}`;
  let buf = opticalFlowBuffers.get(key);
  if (!buf) {
    const prevCanvas = document.createElement('canvas');
    prevCanvas.width = width;
    prevCanvas.height = height;
    const currCanvas = document.createElement('canvas');
    currCanvas.width = width;
    currCanvas.height = height;
    buf = {
      prevCanvas,
      currCanvas,
      lastMediaTime: -1,
      lastUpdatePerf: performance.now(),
      initialized: false,
    };
    opticalFlowBuffers.set(key, buf);
  }

  const prevCtx = buf.prevCanvas.getContext('2d');
  const currCtx = buf.currCanvas.getContext('2d');
  if (!prevCtx || !currCtx) {
    drawCoverMedia(ctx, el, width, height, clip.motion, progress, clip.filter, 1, 0, 1);
    return;
  }

  const mediaTime = el instanceof HTMLVideoElement ? el.currentTime : progress * clip.duration;
  const nowPerf = performance.now();

  if (!buf.initialized) {
    currCtx.clearRect(0, 0, width, height);
    drawCoverMedia(currCtx, el, width, height, clip.motion, progress, clip.filter, 1, 0, 1, 0, 0, 1, 0, clip.colorAdjustments);
    prevCtx.clearRect(0, 0, width, height);
    prevCtx.drawImage(buf.currCanvas, 0, 0);
    buf.lastMediaTime = mediaTime;
    buf.lastUpdatePerf = nowPerf;
    buf.initialized = true;
    ctx.drawImage(buf.currCanvas, 0, 0);
    return;
  }

  // Detect new source frame from low-fps video or significant progress jump
  const timeDelta = Math.abs(mediaTime - buf.lastMediaTime);
  if (timeDelta > 0.018) {
    prevCtx.clearRect(0, 0, width, height);
    prevCtx.drawImage(buf.currCanvas, 0, 0);
    currCtx.clearRect(0, 0, width, height);
    drawCoverMedia(currCtx, el, width, height, clip.motion, progress, clip.filter, 1, 0, 1, 0, 0, 1, 0, clip.colorAdjustments);
    buf.lastMediaTime = mediaTime;
    buf.lastUpdatePerf = nowPerf;
  } else if (!(el instanceof HTMLVideoElement)) {
    // Smooth sub-pixel update for image clips
    currCtx.clearRect(0, 0, width, height);
    drawCoverMedia(currCtx, el, width, height, clip.motion, progress, clip.filter, 1, 0, 1, 0, 0, 1, 0, clip.colorAdjustments);
  }

  // Simulated optical-flow temporal interpolation over ~55ms sub-frame window
  const elapsedMs = nowPerf - buf.lastUpdatePerf;
  const blend = Math.min(1, Math.max(0.32, elapsedMs / 65));
  const microShift = (1 - blend) * 1.8;

  ctx.save();
  ctx.globalAlpha = 1;
  ctx.drawImage(buf.prevCanvas, -microShift, 0, width, height);
  ctx.globalAlpha = blend;
  ctx.drawImage(buf.currCanvas, microShift * 0.5, 0, width, height);
  ctx.restore();
}

function wrapTextLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const chars = Array.from(text);
  const lines: string[] = [];
  let current = '';

  for (const ch of chars) {
    const test = current + ch;
    if (ctx.measureText(test).width > maxWidth && current.length > 0) {
      // Avoid breaking inside ASCII words if possible
      const lastSpace = current.lastIndexOf(' ');
      if (lastSpace > current.length * 0.5 && ch !== ' ') {
        lines.push(current.slice(0, lastSpace));
        current = current.slice(lastSpace + 1) + ch;
      } else {
        lines.push(current);
        current = ch;
      }
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawSubtitle(
  ctx: CanvasRenderingContext2D,
  sub: SubtitleSegment,
  width: number,
  height: number,
  elapsedInSub: number
) {
  const animIn = Math.min(1, elapsedInSub / 0.14);
  const scalePop = 0.94 + 0.06 * animIn;

  ctx.save();
  ctx.globalAlpha = animIn;

  const baseFontSize = Math.round(width * 0.052);
  ctx.font = `700 ${baseFontSize}px "Plus Jakarta Sans", "Noto Sans SC", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const maxWidth = width * 0.78;
  const lines = wrapTextLines(ctx, sub.text, maxWidth);
  const lineHeight = baseFontSize * 1.32;
  const totalBlockH = lines.length * lineHeight;

  let centerY = height * 0.73;
  if (sub.position === 'center') centerY = height * 0.52;
  if (sub.position === 'upper') centerY = height * 0.24;

  ctx.translate(width / 2, centerY);
  ctx.scale(scalePop, scalePop);

  if (sub.style === 'douyin-yellow') {
    lines.forEach((line, idx) => {
      const y = (idx - (lines.length - 1) / 2) * lineHeight;
      ctx.lineWidth = Math.max(5, baseFontSize * 0.2);
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(10, 10, 12, 0.94)';
      ctx.strokeText(line, 0, y);
      ctx.fillStyle = idx === 0 ? '#FACC15' : '#FFFFFF';
      ctx.fillText(line, 0, y);
    });
  } else if (sub.style === 'tiktok-pill') {
    const padX = baseFontSize * 0.7;
    const padY = baseFontSize * 0.36;
    const maxLineW = Math.max(...lines.map((l) => ctx.measureText(l).width));
    const boxW = maxLineW + padX * 2;
    const boxH = totalBlockH + padY * 1.6;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.96)';
    drawRoundedRect(ctx, -boxW / 2, -boxH / 2, boxW, boxH, Math.round(baseFontSize * 0.35));
    ctx.fill();

    ctx.fillStyle = '#09090B';
    lines.forEach((line, idx) => {
      const y = (idx - (lines.length - 1) / 2) * lineHeight;
      ctx.fillText(line, 0, y);
    });
  } else if (sub.style === 'facebook-cinema') {
    const padX = baseFontSize * 0.65;
    const padY = baseFontSize * 0.35;
    const maxLineW = Math.max(...lines.map((l) => ctx.measureText(l).width));
    const boxW = maxLineW + padX * 2;
    const boxH = totalBlockH + padY * 1.5;
    ctx.fillStyle = 'rgba(9, 11, 15, 0.76)';
    drawRoundedRect(ctx, -boxW / 2, -boxH / 2, boxW, boxH, 10);
    ctx.fill();

    ctx.fillStyle = '#F4F4F5';
    lines.forEach((line, idx) => {
      const y = (idx - (lines.length - 1) / 2) * lineHeight;
      ctx.fillText(line, 0, y);
    });
  } else {
    lines.forEach((line, idx) => {
      const y = (idx - (lines.length - 1) / 2) * lineHeight;
      ctx.shadowColor = 'rgba(0,0,0,0.75)';
      ctx.shadowBlur = 10;
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(line, 0, y);
    });
  }

  ctx.restore();
}

export interface RenderFrameParams {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  timeSec: number;
  clips: TimelineClip[];
  subtitles: SubtitleSegment[];
  assetsMap: Map<string, MediaAsset>;
  mediaCache: Map<string, LoadedMediaElement>;
  applyTransitionBlurToCanvas?: boolean;
}

export function findClipAtTime(clips: TimelineClip[], timeSec: number) {
  let cursor = 0;
  for (let i = 0; i < clips.length; i++) {
    const clip = clips[i];
    const start = cursor;
    const end = cursor + clip.duration;
    if (timeSec >= start && (timeSec < end || i === clips.length - 1)) {
      return {
        index: i,
        clip,
        prevClip: i > 0 ? clips[i - 1] : null,
        clipStart: start,
        localTime: Math.max(0, Math.min(clip.duration, timeSec - start)),
      };
    }
    cursor = end;
  }
  return null;
}

export function computeTransitionBlurPx(clips: TimelineClip[], timeSec: number): number {
  const found = findClipAtTime(clips, timeSec);
  if (!found) return 0;
  const { clip, prevClip, localTime } = found;
  const transWindow = 0.28;
  if (!prevClip || !clip.transitionMotionBlur || clip.transition === 'cut' || localTime >= transWindow) {
    return 0;
  }
  const tRatio = Math.max(0, Math.min(1, localTime / transWindow));
  const intensity = Math.max(0, Math.min(24, clip.transitionBlurIntensity ?? 8));
  return Number((intensity * Math.sin(tRatio * Math.PI)).toFixed(2));
}

export function renderTimelineFrame({
  ctx,
  width,
  height,
  timeSec,
  clips,
  subtitles,
  mediaCache,
  applyTransitionBlurToCanvas = false,
}: RenderFrameParams): { activeClipId: string | null } {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#090B0E';
  ctx.fillRect(0, 0, width, height);

  if (clips.length === 0) {
    return { activeClipId: null };
  }

  const found = findClipAtTime(clips, timeSec);
  if (!found) {
    return { activeClipId: null };
  }

  const { clip, prevClip, localTime } = found;
  const progress = clip.duration > 0 ? localTime / clip.duration : 0;
  const el = mediaCache.get(clip.assetId);
  const prevEl = prevClip ? mediaCache.get(prevClip.assetId) : undefined;

  const transWindow = 0.28;
  const inTransition = prevClip && clip.transition !== 'cut' && localTime < transWindow;
  const tRatio = inTransition ? localTime / transWindow : 1;
  const canvasExtraBlur = applyTransitionBlurToCanvas ? computeTransitionBlurPx(clips, timeSec) : 0;

  if (el) {
    const drawLayer = (
      targetEl: LoadedMediaElement,
      motion: MotionType,
      prog: number,
      filter: ColorFilter,
      extraScale = 1,
      offsetX = 0,
      alpha = 1,
      rotationRad = 0,
      offsetY = 0,
      scaleX = 1,
      extraBlurPx = 0,
      colorAdj?: ColorAdjustments
    ) =>
      drawCoverMedia(
        ctx,
        targetEl,
        width,
        height,
        motion,
        prog,
        filter,
        extraScale,
        offsetX,
        alpha,
        rotationRad,
        offsetY,
        scaleX,
        extraBlurPx + canvasExtraBlur,
        colorAdj
      );

    if (inTransition && prevEl && clip.transition === 'crossfade') {
      drawLayer(prevEl, prevClip.motion, 1, prevClip.filter, 1, 0, 1 - tRatio, 0, 0, 1, 0, prevClip.colorAdjustments);
      drawLayer(el, clip.motion, progress, clip.filter, 1, 0, tRatio, 0, 0, 1, 0, clip.colorAdjustments);
    } else if (inTransition && prevEl && clip.transition === 'whip-pan') {
      const ease = 1 - Math.pow(1 - tRatio, 3);
      drawLayer(prevEl, prevClip.motion, 1, prevClip.filter, 1, -width * ease, 1, 0, 0, 1, 0, prevClip.colorAdjustments);
      drawLayer(el, clip.motion, progress, clip.filter, 1, width * (1 - ease), 1, 0, 0, 1, 0, clip.colorAdjustments);
    } else if (inTransition && clip.transition === 'zoom-punch') {
      const punch = 1 + (1 - tRatio) * 0.16;
      drawLayer(el, clip.motion, progress, clip.filter, punch, 0, 1, 0, 0, 1, 0, clip.colorAdjustments);
    } else if (inTransition && prevEl && clip.transition === 'spin-switch') {
      const ease = 1 - Math.pow(1 - tRatio, 3);
      drawLayer(
        prevEl,
        prevClip.motion,
        1,
        prevClip.filter,
        1 + ease * 0.22,
        0,
        1 - ease,
        -ease * 0.38,
        0,
        1,
        0,
        prevClip.colorAdjustments
      );
      drawLayer(
        el,
        clip.motion,
        progress,
        clip.filter,
        1.26 - ease * 0.26,
        0,
        ease,
        (1 - ease) * 0.38,
        0,
        1,
        0,
        clip.colorAdjustments
      );
    } else if (inTransition && prevEl && clip.transition === 'blur-dissolve') {
      const ease = 1 - Math.pow(1 - tRatio, 2);
      drawLayer(
        prevEl,
        prevClip.motion,
        1,
        prevClip.filter,
        1 + ease * 0.04,
        0,
        1 - ease,
        0,
        0,
        1,
        ease * 12,
        prevClip.colorAdjustments
      );
      drawLayer(
        el,
        clip.motion,
        progress,
        clip.filter,
        1.04 - ease * 0.04,
        0,
        ease,
        0,
        0,
        1,
        (1 - ease) * 12,
        clip.colorAdjustments
      );
    } else if (inTransition && prevEl && clip.transition === 'push-pull') {
      const ease = 1 - Math.pow(1 - tRatio, 3);
      drawLayer(
        prevEl,
        prevClip.motion,
        1,
        prevClip.filter,
        1 - ease * 0.08,
        0,
        1,
        0,
        -height * ease,
        1,
        0,
        prevClip.colorAdjustments
      );
      drawLayer(
        el,
        clip.motion,
        progress,
        clip.filter,
        1.08 - ease * 0.08,
        0,
        1,
        0,
        height * (1 - ease),
        1,
        0,
        clip.colorAdjustments
      );
    } else if (inTransition && prevEl && clip.transition === 'page-flip') {
      if (tRatio < 0.5) {
        const fold = 1 - tRatio * 2;
        drawLayer(prevEl, prevClip.motion, 1, prevClip.filter, 1, 0, 1, 0, 0, Math.max(0.02, fold), 0, prevClip.colorAdjustments);
      } else {
        const unfold = (tRatio - 0.5) * 2;
        drawLayer(el, clip.motion, progress, clip.filter, 1, 0, 1, 0, 0, Math.max(0.02, unfold), 0, clip.colorAdjustments);
      }
    } else if (inTransition && prevEl && clip.transition === 'iris-wipe') {
      const ease = 1 - Math.pow(1 - tRatio, 2);
      drawLayer(prevEl, prevClip.motion, 1, prevClip.filter, 1, 0, 1, 0, 0, 1, 0, prevClip.colorAdjustments);
      ctx.save();
      ctx.beginPath();
      const maxR = Math.hypot(width, height) * 0.55;
      ctx.arc(width / 2, height / 2, Math.max(2, maxR * ease), 0, Math.PI * 2);
      ctx.clip();
      drawLayer(el, clip.motion, progress, clip.filter, 1, 0, 1, 0, 0, 1, 0, clip.colorAdjustments);
      ctx.restore();
    } else if (inTransition && prevEl && clip.transition === 'curtain-split') {
      const ease = 1 - Math.pow(1 - tRatio, 3);
      drawLayer(prevEl, prevClip.motion, 1, prevClip.filter, 1, 0, 1, 0, 0, 1, 0, prevClip.colorAdjustments);
      ctx.save();
      const openW = width * ease;
      ctx.beginPath();
      ctx.rect((width - openW) / 2, 0, openW, height);
      ctx.clip();
      drawLayer(el, clip.motion, progress, clip.filter, 1, 0, 1, 0, 0, 1, 0, clip.colorAdjustments);
      ctx.restore();
    } else if (inTransition && clip.transition === 'glitch-slice') {
      const jitter = (1 - tRatio) * 26 * (Math.sin(tRatio * 42) >= 0 ? 1 : -1);
      drawLayer(el, clip.motion, progress, clip.filter, 1, 0, 1, 0, 0, 1, 0, clip.colorAdjustments);
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, height * 0.25, width, height * 0.16);
      ctx.rect(0, height * 0.62, width, height * 0.14);
      ctx.clip();
      drawLayer(el, clip.motion, progress, clip.filter, 1.03, jitter, 0.85, 0, 0, 1, 0, clip.colorAdjustments);
      ctx.restore();
    } else {
      if (clip.motionSmoothing && canvasExtraBlur <= 0.2) {
        drawWithOpticalFlowSmoothing(ctx, clip, el, width, height, progress);
      } else {
        drawLayer(
          el,
          clip.motion,
          progress,
          clip.filter,
          1,
          0,
          1,
          0,
          0,
          1,
          0,
          clip.colorAdjustments
        );
      }
      if (inTransition && clip.transition === 'flash') {
        ctx.save();
        ctx.fillStyle = `rgba(255, 255, 255, ${(1 - tRatio) * 0.72})`;
        ctx.fillRect(0, 0, width, height);
        ctx.restore();
      }
    }
  }

  // Subtle bottom contrast gradient scrim so captions remain legible at 4.5:1+
  const scrim = ctx.createLinearGradient(0, height * 0.52, 0, height);
  scrim.addColorStop(0, 'rgba(0,0,0,0)');
  scrim.addColorStop(0.55, 'rgba(0,0,0,0.22)');
  scrim.addColorStop(1, 'rgba(0,0,0,0.68)');
  ctx.fillStyle = scrim;
  ctx.fillRect(0, height * 0.52, width, height * 0.48);

  // Active subtitle
  const activeSub = subtitles.find(
    (s) => timeSec >= s.startTime && timeSec <= s.startTime + s.duration
  );
  if (activeSub) {
    drawSubtitle(ctx, activeSub, width, height, timeSec - activeSub.startTime);
  }

  return { activeClipId: clip.id };
}

export function captureClipSnapshotBase64(
  el: LoadedMediaElement | undefined,
  filter: ColorFilter,
  colorAdj?: ColorAdjustments
): string | null {
  if (!el) return null;
  try {
    const w = 270;
    const h = 480;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    drawCoverMedia(ctx, el, w, h, 'static', 0.5, filter, 1, 0, 1, 0, 0, 1, 0, colorAdj);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.78);
    const commaIdx = dataUrl.indexOf(',');
    return commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : null;
  } catch {
    return null;
  }
}

export function renderColorComparisonThumbnail(
  el: LoadedMediaElement | undefined,
  filter: ColorFilter,
  colorAdj?: ColorAdjustments
): string | null {
  if (!el) return null;
  try {
    const w = 180;
    const h = 240;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    drawCoverMedia(ctx, el, w, h, 'static', 0.5, filter, 1, 0, 1, 0, 0, 1, 0, colorAdj);
    return canvas.toDataURL('image/jpeg', 0.85);
  } catch {
    return null;
  }
}
