import type {
  ColorAdjustments,
  ColorFilter,
  DigitalHumanActionId,
  DigitalHumanCameraMotion,
  DigitalHumanClipConfig,
  DigitalHumanEmotionId,
  DigitalHumanFacialMuscles,
  MediaAsset,
  MotionType,
  SubtitleSegment,
  TimelineClip,
  VoiceoverCue,
} from '../types/studio';
import {
  clampFacialMuscles,
  computeDigitalHumanCameraTransform,
  getDigitalHumanActionTemplate,
  getDigitalHumanCameraPreset,
  getDigitalHumanEmotionPreset,
  getVoiceActivityAtTime,
} from './digitalHumanAssets';

export type LoadedMediaElement = HTMLImageElement | HTMLVideoElement;

const digitalHumanElementCache = new Map<string, HTMLImageElement>();

function resolveDigitalHumanElement(
  dh: DigitalHumanClipConfig,
  mediaCache: Map<string, LoadedMediaElement>
): LoadedMediaElement | null {
  if (dh.avatarAssetId) {
    const cached = mediaCache.get(dh.avatarAssetId);
    if (cached) return cached;
  }
  if (!dh.avatarUrl) return null;
  let img = digitalHumanElementCache.get(dh.avatarUrl);
  if (!img) {
    img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = dh.avatarUrl;
    digitalHumanElementCache.set(dh.avatarUrl, img);
  }
  return img.complete && img.naturalWidth > 0 ? img : null;
}

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
  voiceoverCues?: VoiceoverCue[];
  voiceoverEnabled?: boolean;
  voiceActivityOverride?: number;
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
  voiceoverCues,
  voiceoverEnabled = true,
  voiceActivityOverride,
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
  const voiceActivity =
    typeof voiceActivityOverride === 'number'
      ? Math.max(0, Math.min(1, voiceActivityOverride))
      : getVoiceActivityAtTime(voiceoverCues, timeSec, voiceoverEnabled);

  const transWindow = 0.28;
  const inTransition = prevClip && clip.transition !== 'cut' && localTime < transWindow;
  const tRatio = inTransition ? localTime / transWindow : 1;
  const canvasExtraBlur = applyTransitionBlurToCanvas ? computeTransitionBlurPx(clips, timeSec) : 0;

  const blendState = clip.digitalHuman
    ? computeClipPoseBlendState(clip, prevClip, localTime)
    : undefined;

  if (clip.digitalHuman?.mode === 'full-scene') {
    drawDigitalHumanFullScene(
      ctx,
      clip.digitalHuman,
      resolveDigitalHumanElement(clip.digitalHuman, mediaCache) ?? el ?? null,
      width,
      height,
      timeSec,
      progress,
      clip.filter,
      voiceActivity,
      clip.colorAdjustments,
      blendState
    );
    if (inTransition && clip.transition === 'flash') {
      ctx.save();
      ctx.fillStyle = `rgba(255, 255, 255, ${(1 - tRatio) * 0.72})`;
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
    }
  } else if (el) {
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

  // Picture-in-Picture Digital Human Anchor Overlay on Real-Shot Clips
  if (clip.digitalHuman && clip.digitalHuman.mode === 'pip-overlay') {
    const dhEl = resolveDigitalHumanElement(clip.digitalHuman, mediaCache);
    drawDigitalHumanPipOverlay(
      ctx,
      clip.digitalHuman,
      dhEl,
      width,
      height,
      timeSec,
      voiceActivity,
      progress,
      blendState
    );
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

interface ActionPoseKinematics {
  poseScale: number;
  poseScaleY: number;
  microTilt: number;
  shiftX: number;
  bobY: number;
}

interface DigitalHumanPoseBlendState {
  blendFromAction?: DigitalHumanActionId;
  blendWeight: number;
}

function computeClipPoseBlendState(
  clip: TimelineClip,
  prevClip: TimelineClip | null,
  localTime: number
): DigitalHumanPoseBlendState {
  const dh = clip.digitalHuman;
  if (!dh) return { blendWeight: 1 };
  const targetAction: DigitalHumanActionId = dh.action ?? 'explain';
  const sourceAction = prevClip?.digitalHuman?.action ?? dh.blendFromAction;
  const rawDuration = Math.max(0, Math.min(1.5, dh.actionBlendDuration ?? 0.45));
  const effectiveDuration = Math.min(rawDuration, Math.max(0, clip.duration * 0.75));
  if (
    sourceAction &&
    sourceAction !== targetAction &&
    effectiveDuration > 0.02 &&
    localTime < effectiveDuration
  ) {
    const t = Math.max(0, Math.min(1, localTime / effectiveDuration));
    const smoothWeight = t * t * (3 - 2 * t);
    return { blendFromAction: sourceAction, blendWeight: smoothWeight };
  }
  return { blendWeight: 1 };
}

function computeActionPoseKinematics(
  action: DigitalHumanActionId,
  timeSec: number,
  speechPulse: number,
  jawDrive: number,
  tension: number,
  dw: number,
  dh: number,
  pointDir: -1 | 1
): ActionPoseKinematics {
  let poseScale = 1 + Math.sin(timeSec * 2.2) * 0.012 + speechPulse * 0.025;
  let poseScaleY = 1 + jawDrive * 0.022;
  let microTilt = Math.sin(timeSec * (2.6 + tension * 0.8)) * (0.008 + speechPulse * 0.014) * tension;
  let shiftX = 0;
  let bobY = -jawDrive * (dh * 0.014) + Math.sin(timeSec * 2.4) * (dh * 0.006 * tension);

  switch (action) {
    case 'point': {
      const pulse = 0.5 + 0.5 * Math.sin(timeSec * 4.2);
      poseScale = 1.035 + speechPulse * 0.024 + pulse * 0.015;
      shiftX = pointDir * dw * (0.018 + pulse * 0.016);
      microTilt = pointDir * (0.036 + pulse * 0.018) * (0.75 + 0.25 * tension);
      bobY = -jawDrive * (dh * 0.01) - pulse * (dh * 0.008);
      break;
    }
    case 'wave': {
      const sway = Math.sin(timeSec * 5.4);
      poseScale = 1.02 + Math.abs(sway) * 0.018 + speechPulse * 0.02;
      microTilt = sway * 0.042 * tension;
      shiftX = Math.cos(timeSec * 2.7) * (dw * 0.016);
      bobY = -Math.abs(sway) * (dh * 0.02) - jawDrive * (dh * 0.01);
      break;
    }
    case 'amaze': {
      const burst = Math.abs(Math.sin(timeSec * 6.8));
      poseScale = 1.055 + burst * 0.045 + jawDrive * 0.032;
      microTilt = Math.sin(timeSec * 9.5) * 0.028 * tension;
      bobY = -(0.022 + burst * 0.012) * dh + Math.sin(timeSec * 14) * (dh * 0.005);
      break;
    }
    case 'nod': {
      const nodCycle = Math.pow(Math.max(0, Math.sin(timeSec * 5.2)), 1.5);
      poseScale = 1.015 + speechPulse * 0.018;
      poseScaleY = 1 - nodCycle * 0.026 + jawDrive * 0.014;
      microTilt = Math.sin(timeSec * 2.6) * 0.012 * tension;
      bobY = nodCycle * (dh * 0.034) - jawDrive * (dh * 0.006);
      break;
    }
    case 'thumbs-up': {
      const lift = 0.5 + 0.5 * Math.sin(timeSec * 4.6);
      poseScale = 1.03 + lift * 0.024 + speechPulse * 0.022;
      microTilt = (-0.022 + lift * 0.018) * tension;
      bobY = -lift * (dh * 0.016) - jawDrive * (dh * 0.01);
      break;
    }
    case 'explain':
    default: {
      const cadence = Math.sin(timeSec * (3.2 + tension * 0.9));
      poseScale = 1.015 + Math.sin(timeSec * 2.2) * 0.012 + jawDrive * 0.024;
      microTilt = cadence * (0.014 + speechPulse * 0.018) * tension;
      bobY = -jawDrive * (dh * 0.015) + Math.sin(timeSec * 2.6) * (dh * 0.008 * tension);
      break;
    }
  }

  return { poseScale, poseScaleY, microTilt, shiftX, bobY };
}

function drawAnchorPortraitCover(
  ctx: CanvasRenderingContext2D,
  el: LoadedMediaElement,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
  speechPulse: number,
  timeSec: number,
  filter: ColorFilter,
  colorAdj?: ColorAdjustments,
  action: DigitalHumanActionId = 'explain',
  pointDir: -1 | 1 = 1,
  emotion: DigitalHumanEmotionId = 'neutral',
  muscles?: DigitalHumanFacialMuscles,
  cameraMotion?: DigitalHumanCameraMotion,
  progress = 0.5,
  blendFromAction?: DigitalHumanActionId,
  blendWeight = 1
) {
  const natW = el instanceof HTMLVideoElement ? el.videoWidth || 540 : el.naturalWidth || 540;
  const natH = el instanceof HTMLVideoElement ? el.videoHeight || 720 : el.naturalHeight || 720;
  if (!natW || !natH) return;

  const m = muscles ? clampFacialMuscles(muscles) : getDigitalHumanEmotionPreset(emotion).muscles;
  const jawDrive = speechPulse * m.jawOpenness * (0.7 + 0.3 * m.lipSyncSharpness);
  const tension = m.headTension;

  const baseFilter = getCanvasFilterString(filter, colorAdj);
  ctx.save();
  if (emotion === 'serious' || emotion === 'suspense') {
    const moodFilter =
      emotion === 'suspense'
        ? 'contrast(1.12) saturate(0.88) brightness(0.94)'
        : 'contrast(1.08) saturate(0.92)';
    ctx.filter = baseFilter === 'none' ? moodFilter : `${baseFilter} ${moodFilter}`;
  } else if (emotion === 'excited') {
    const moodFilter = 'contrast(1.06) saturate(1.14) brightness(1.04)';
    ctx.filter = baseFilter === 'none' ? moodFilter : `${baseFilter} ${moodFilter}`;
  } else {
    ctx.filter = baseFilter;
  }

  const coverScale = Math.max(dw / natW, dh / natH);
  const targetPose = computeActionPoseKinematics(
    action,
    timeSec,
    speechPulse,
    jawDrive,
    tension,
    dw,
    dh,
    pointDir
  );

  let poseScale = targetPose.poseScale;
  let poseScaleY = targetPose.poseScaleY;
  let microTilt = targetPose.microTilt;
  let shiftX = targetPose.shiftX;
  let bobY = targetPose.bobY;

  if (blendFromAction && blendFromAction !== action && blendWeight < 1) {
    const w = Math.max(0, Math.min(1, blendWeight));
    const fromPose = computeActionPoseKinematics(
      blendFromAction,
      timeSec,
      speechPulse,
      jawDrive,
      tension,
      dw,
      dh,
      pointDir
    );
    const lerp = (a: number, b: number) => a + (b - a) * w;
    poseScale = lerp(fromPose.poseScale, targetPose.poseScale);
    poseScaleY = lerp(fromPose.poseScaleY, targetPose.poseScaleY);
    microTilt = lerp(fromPose.microTilt, targetPose.microTilt);
    shiftX = lerp(fromPose.shiftX, targetPose.shiftX);
    bobY = lerp(fromPose.bobY, targetPose.bobY);
  }

  // Emotion-specific head expression offset (browLift pushes subtly upward; serious tightens vertical anchor)
  const emotionLiftY = -m.browLift * (dh * 0.008);
  const emotionZoom = emotion === 'suspense' ? 1.02 + Math.sin(timeSec * 1.8) * 0.01 : 1;

  // Camera Motion Enhancement (Dolly push/pull, Pan sweep, Handheld shake)
  const cam = computeDigitalHumanCameraTransform(cameraMotion, timeSec, progress, dw, dh);

  const finalW = natW * coverScale * poseScale * emotionZoom * cam.zoom;
  const finalH = natH * coverScale * poseScale * poseScaleY * emotionZoom * cam.zoom;

  ctx.translate(
    dx + dw / 2 + shiftX + cam.offsetX,
    dy + dh * 0.44 + bobY + emotionLiftY + cam.offsetY
  );
  ctx.rotate(microTilt + cam.rotationRad);
  // Bias vertical alignment slightly upward to preserve head & face framing
  ctx.drawImage(el, -finalW / 2, -finalH * 0.42, finalW, finalH);
  ctx.restore();
}

function drawDigitalHumanFacialMuscleRig(
  ctx: CanvasRenderingContext2D,
  emotion: DigitalHumanEmotionId,
  muscles: DigitalHumanFacialMuscles,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
  timeSec: number,
  speechPulse: number
) {
  const m = clampFacialMuscles(muscles);
  const preset = getDigitalHumanEmotionPreset(emotion);
  const unit = Math.min(dw, dh);
  const jawOpen = Math.min(1, speechPulse * m.jawOpenness);

  ctx.save();

  // 1. Mood lighting & brow/eye facial muscle atmosphere
  if (emotion === 'suspense' || m.eyeSquint >= 0.55) {
    // Dramatic chiaroscuro side vignette + tension focus pulse
    const vig = ctx.createRadialGradient(
      dx + dw * 0.5,
      dy + dh * 0.36,
      unit * 0.14,
      dx + dw * 0.5,
      dy + dh * 0.44,
      Math.max(dw, dh) * 0.62
    );
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, `rgba(18, 8, 32, ${(0.34 + 0.14 * m.eyeSquint).toFixed(2)})`);
    ctx.fillStyle = vig;
    ctx.fillRect(dx, dy, dw, dh);
  } else if (emotion === 'serious' || m.browLift <= -0.2) {
    // Cool authoritative brow-focus top shading
    const topShade = ctx.createLinearGradient(dx, dy, dx, dy + dh * 0.42);
    topShade.addColorStop(0, 'rgba(10, 22, 38, 0.38)');
    topShade.addColorStop(1, 'rgba(10, 22, 38, 0)');
    ctx.fillStyle = topShade;
    ctx.fillRect(dx, dy, dw, dh * 0.42);
  } else if (emotion === 'excited' || m.smileCurve >= 0.45) {
    // Warm energetic facial keylight flare synced with speech
    const glow = ctx.createRadialGradient(
      dx + dw * 0.5,
      dy + dh * 0.38,
      unit * 0.05,
      dx + dw * 0.5,
      dy + dh * 0.4,
      unit * 0.48
    );
    glow.addColorStop(0, `rgba(251, 191, 36, ${(0.08 + jawOpen * 0.14).toFixed(2)})`);
    glow.addColorStop(1, 'rgba(251, 191, 36, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(dx, dy, dw, dh);
  }

  // 2. Subtle articulated jaw / lip-sync muscle cadence arc at bottom collar zone
  if (speechPulse > 0.04) {
    const lipSharp = m.lipSyncSharpness;
    const mouthW = unit * (0.14 + 0.05 * Math.max(0, m.smileCurve));
    const mouthH = Math.max(
      2.5,
      unit * (0.015 + jawOpen * 0.058) * (0.75 + 0.25 * Math.abs(Math.sin(timeSec * (11 + lipSharp * 5))))
    );
    const mx = dx + dw * 0.5;
    const my = dy + dh * 0.86;

    ctx.strokeStyle = preset.badgeColor;
    ctx.lineWidth = Math.max(1.5, unit * 0.014);
    ctx.globalAlpha = 0.45 + jawOpen * 0.45;
    ctx.beginPath();
    ctx.ellipse(mx, my, mouthW * 0.5, mouthH * 0.5, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}

function drawDigitalHumanPoseOverlay(
  ctx: CanvasRenderingContext2D,
  action: DigitalHumanActionId,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
  timeSec: number,
  speechPulse: number,
  accentColor: string,
  pointDir: -1 | 1 = 1,
  alphaScale = 1
) {
  const tmpl = getDigitalHumanActionTemplate(action);
  const tone = tmpl.badgeColor || accentColor;
  const unit = Math.min(dw, dh);
  const pulse = 0.45 + 0.55 * speechPulse;
  const aScale = Math.max(0, Math.min(1, alphaScale));
  if (aScale <= 0.01) return;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.globalAlpha = aScale;

  switch (action) {
    case 'point': {
      // Animated pointing hand + directional reticle radiating into scene
      const extend = Math.sin(timeSec * 6.5) * (unit * 0.025);
      const baseX = dx + (pointDir > 0 ? dw * 0.64 : dw * 0.36);
      const baseY = dy + dh * 0.68;
      const tipX = dx + (pointDir > 0 ? dw * 0.86 : dw * 0.14) + pointDir * extend;
      const tipY = dy + dh * 0.52;

      ctx.strokeStyle = tone;
      ctx.lineWidth = Math.max(2.5, unit * 0.032);
      ctx.globalAlpha = 0.88 * aScale;
      ctx.beginPath();
      ctx.moveTo(baseX, baseY);
      ctx.lineTo(tipX, tipY);
      ctx.stroke();

      // Finger tip glow & pulse rings
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(tipX, tipY, Math.max(3, unit * 0.036), 0, Math.PI * 2);
      ctx.fill();

      const ringR = unit * (0.075 + 0.04 * (0.5 + 0.5 * Math.sin(timeSec * 7)));
      ctx.strokeStyle = tone;
      ctx.lineWidth = Math.max(1.5, unit * 0.016);
      ctx.globalAlpha = 0.65 * aScale;
      ctx.beginPath();
      ctx.arc(tipX, tipY, ringR, 0, Math.PI * 2);
      ctx.stroke();

      // Guiding chevron
      const chevX = tipX + pointDir * unit * 0.09;
      ctx.beginPath();
      ctx.moveTo(chevX - pointDir * unit * 0.035, tipY - unit * 0.045);
      ctx.lineTo(chevX + pointDir * unit * 0.02, tipY);
      ctx.lineTo(chevX - pointDir * unit * 0.035, tipY + unit * 0.045);
      ctx.stroke();
      break;
    }

    case 'wave': {
      // Animated raised waving palm + motion trail arcs
      const swing = Math.sin(timeSec * 9.5);
      const pivotX = dx + dw * 0.77;
      const pivotY = dy + dh * 0.66;
      const handX = pivotX + swing * (unit * 0.06);
      const handY = dy + dh * 0.44 - Math.abs(swing) * (unit * 0.02);

      ctx.strokeStyle = tone;
      ctx.lineWidth = Math.max(2.5, unit * 0.03);
      ctx.globalAlpha = 0.85 * aScale;
      ctx.beginPath();
      ctx.moveTo(pivotX, pivotY);
      ctx.quadraticCurveTo(pivotX + unit * 0.05, dy + dh * 0.56, handX, handY);
      ctx.stroke();

      ctx.save();
      ctx.translate(handX, handY);
      ctx.rotate(swing * 0.38);
      ctx.fillStyle = tone;
      ctx.beginPath();
      ctx.ellipse(0, 0, Math.max(4, unit * 0.045), Math.max(5.5, unit * 0.062), 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Motion arcs around waving hand
      ctx.strokeStyle = '#a7f3d0';
      ctx.lineWidth = Math.max(1.5, unit * 0.015);
      ctx.globalAlpha = (0.45 + 0.45 * Math.abs(swing)) * aScale;
      ctx.beginPath();
      ctx.arc(handX, handY, unit * 0.1, -0.8, 0.5);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(handX, handY, unit * 0.14, -0.65, 0.35);
      ctx.stroke();
      break;
    }

    case 'amaze': {
      // Comic variety burst rays + raised hands + exclamation badge
      const cx = dx + dw * 0.5;
      const headY = dy + dh * 0.25;
      const flash = 0.55 + 0.45 * Math.abs(Math.sin(timeSec * 8.5));
      ctx.strokeStyle = tone;
      ctx.lineWidth = Math.max(1.8, unit * 0.02);
      ctx.globalAlpha = flash * 0.85 * aScale;

      const angles = [-2.55, -2.15, -1.57, -0.99, -0.59];
      for (const a of angles) {
        const r1 = unit * 0.25;
        const r2 = unit * (0.33 + 0.04 * flash);
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * r1, headY + Math.sin(a) * r1);
        ctx.lineTo(cx + Math.cos(a) * r2, headY + Math.sin(a) * r2);
        ctx.stroke();
      }

      // Twin raised startled gesture cues
      const lift = Math.abs(Math.sin(timeSec * 7.2)) * unit * 0.03;
      ctx.lineWidth = Math.max(2.5, unit * 0.028);
      for (const side of [-1, 1] as const) {
        const hx = dx + dw * (0.5 + side * 0.27);
        const hy = dy + dh * 0.58 - lift;
        ctx.beginPath();
        ctx.moveTo(dx + dw * (0.5 + side * 0.2), dy + dh * 0.76);
        ctx.quadraticCurveTo(hx + side * unit * 0.03, dy + dh * 0.67, hx, hy);
        ctx.stroke();
        ctx.fillStyle = '#fde68a';
        ctx.beginPath();
        ctx.arc(hx, hy, Math.max(3, unit * 0.032), 0, Math.PI * 2);
        ctx.fill();
      }

      // Exclamation mark pill on upper right
      const ex = dx + dw * 0.82;
      const ey = dy + dh * 0.28;
      ctx.fillStyle = tone;
      drawRoundedRect(ctx, ex - unit * 0.055, ey - unit * 0.09, unit * 0.11, unit * 0.18, unit * 0.04);
      ctx.fill();
      ctx.fillStyle = '#090b0f';
      ctx.font = `800 ${Math.max(10, Math.round(unit * 0.12))}px "Plus Jakarta Sans", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('!', ex, ey + 0.5);
      break;
    }

    case 'nod': {
      // Rhythmic affirmative nod guide & endorsement checkmark ring
      const nodPhase = Math.max(0, Math.sin(timeSec * 5.2));
      const bx = dx + dw * 0.2;
      const by = dy + dh * 0.34 + nodPhase * unit * 0.03;
      ctx.globalAlpha = (0.72 + nodPhase * 0.25) * aScale;
      ctx.fillStyle = 'rgba(139, 92, 246, 0.28)';
      ctx.strokeStyle = tone;
      ctx.lineWidth = Math.max(1.5, unit * 0.018);
      ctx.beginPath();
      ctx.arc(bx, by, Math.max(7, unit * 0.075), 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.strokeStyle = '#ede9fe';
      ctx.lineWidth = Math.max(1.8, unit * 0.022);
      ctx.beginPath();
      ctx.moveTo(bx - unit * 0.032, by);
      ctx.lineTo(bx - unit * 0.008, by + unit * 0.028);
      ctx.lineTo(bx + unit * 0.038, by - unit * 0.028);
      ctx.stroke();
      break;
    }

    case 'thumbs-up': {
      // Animated thumbs-up badge & rising sparkles
      const bounce = Math.abs(Math.sin(timeSec * 5.2)) * (unit * 0.03);
      const tx = dx + dw * 0.78;
      const ty = dy + dh * 0.54 - bounce;
      ctx.globalAlpha = 0.92 * aScale;
      ctx.fillStyle = tone;
      drawRoundedRect(ctx, tx - unit * 0.06, ty - unit * 0.03, unit * 0.12, unit * 0.1, unit * 0.03);
      ctx.fill();
      // Thumb
      ctx.beginPath();
      ctx.moveTo(tx - unit * 0.02, ty - unit * 0.03);
      ctx.quadraticCurveTo(tx - unit * 0.01, ty - unit * 0.13, tx + unit * 0.03, ty - unit * 0.11);
      ctx.lineTo(tx + unit * 0.035, ty - unit * 0.03);
      ctx.closePath();
      ctx.fill();

      // Sparkle star
      const spY = ty - unit * 0.16 - bounce * 0.5;
      ctx.fillStyle = '#fde68a';
      ctx.beginPath();
      ctx.arc(tx + unit * 0.05, spY, Math.max(2, unit * 0.022), 0, Math.PI * 2);
      ctx.fill();
      break;
    }

    case 'explain':
    default: {
      // Rhythmic twin presenter hand cadence arcs near lower torso
      const wave = Math.sin(timeSec * 4.5) * (0.5 + pulse * 0.5);
      ctx.strokeStyle = tone;
      ctx.lineWidth = Math.max(2, unit * 0.024);
      ctx.globalAlpha = (0.52 + pulse * 0.35) * aScale;
      for (const side of [-1, 1] as const) {
        const startX = dx + dw * (0.5 + side * 0.16);
        const startY = dy + dh * 0.78;
        const endX = dx + dw * (0.5 + side * 0.28);
        const endY = dy + dh * 0.65 - Math.abs(wave) * unit * 0.035;
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.quadraticCurveTo(endX + side * unit * 0.02, dy + dh * 0.72, endX, endY);
        ctx.stroke();
        ctx.fillStyle = '#bae6fd';
        ctx.beginPath();
        ctx.arc(endX, endY, Math.max(2.4, unit * 0.024), 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
  }

  ctx.restore();
}

function drawBlendedDigitalHumanPoseOverlay(
  ctx: CanvasRenderingContext2D,
  action: DigitalHumanActionId,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
  timeSec: number,
  speechPulse: number,
  accentColor: string,
  pointDir: -1 | 1 = 1,
  blendState?: DigitalHumanPoseBlendState
) {
  const fromAction = blendState?.blendFromAction;
  const weight = blendState?.blendWeight ?? 1;
  if (fromAction && fromAction !== action && weight < 1) {
    const w = Math.max(0, Math.min(1, weight));
    drawDigitalHumanPoseOverlay(
      ctx,
      fromAction,
      dx,
      dy,
      dw,
      dh,
      timeSec,
      speechPulse,
      accentColor,
      pointDir,
      1 - w
    );
    drawDigitalHumanPoseOverlay(
      ctx,
      action,
      dx,
      dy,
      dw,
      dh,
      timeSec,
      speechPulse,
      accentColor,
      pointDir,
      w
    );
    return;
  }
  drawDigitalHumanPoseOverlay(
    ctx,
    action,
    dx,
    dy,
    dw,
    dh,
    timeSec,
    speechPulse,
    accentColor,
    pointDir,
    1
  );
}

function drawVoiceWaveBars(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  barCount: number,
  maxH: number,
  barW: number,
  gap: number,
  color: string,
  speechPulse: number,
  timeSec: number
) {
  const totalW = barCount * barW + (barCount - 1) * gap;
  const startX = cx - totalW / 2;
  ctx.save();
  ctx.fillStyle = color;
  for (let i = 0; i < barCount; i++) {
    const wave =
      0.35 + 0.65 * Math.abs(Math.sin(timeSec * 14 + i * 1.15));
    const h = Math.max(3, maxH * (0.18 + speechPulse * 0.82 * wave));
    const x = startX + i * (barW + gap);
    drawRoundedRect(ctx, x, cy - h / 2, barW, h, barW / 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawDigitalHumanFullScene(
  ctx: CanvasRenderingContext2D,
  dh: DigitalHumanClipConfig,
  el: LoadedMediaElement | null,
  width: number,
  height: number,
  timeSec: number,
  progress: number,
  filter: ColorFilter,
  voiceActivity: number,
  colorAdj?: ColorAdjustments,
  blendState?: DigitalHumanPoseBlendState
) {
  const accent = dh.accentColor || '#fb7185';
  const action = dh.action ?? 'explain';
  const actionTmpl = getDigitalHumanActionTemplate(action);
  const isBlendingPose = Boolean(
    blendState?.blendFromAction && blendState.blendFromAction !== action && blendState.blendWeight < 1
  );
  const fromActionTmpl = isBlendingPose && blendState?.blendFromAction
    ? getDigitalHumanActionTemplate(blendState.blendFromAction)
    : null;
  const emotionEnabled = dh.emotionMatchEnabled !== false;
  const emotion: DigitalHumanEmotionId = emotionEnabled ? dh.emotion ?? 'neutral' : 'neutral';
  const emotionPreset = getDigitalHumanEmotionPreset(emotion);
  const muscles = clampFacialMuscles(dh.facialMuscles ?? emotionPreset.muscles);

  const intensity = dh.actionIntensity ?? actionTmpl.recommendedIntensity ?? 1;
  const speechPulse = Math.min(1, voiceActivity * (dh.speechIntensity ?? 1) * intensity);

  // Studio Backdrop (subtle emotion mood tint)
  const bg = ctx.createRadialGradient(
    width * 0.5,
    height * 0.32,
    width * 0.08,
    width * 0.5,
    height * 0.45,
    height * 0.78
  );
  bg.addColorStop(0, emotion === 'suspense' ? '#241736' : emotion === 'excited' ? '#2c2219' : '#1e2230');
  bg.addColorStop(0.58, '#10131c');
  bg.addColorStop(1, '#08090d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  // Studio Audio-Reactive Ambient Halo
  if (dh.showLiveWaveRing) {
    ctx.save();
    ctx.globalAlpha = 0.14 + speechPulse * 0.22;
    ctx.fillStyle = emotionEnabled && emotion !== 'neutral' ? emotionPreset.badgeColor : actionTmpl.badgeColor || accent;
    ctx.beginPath();
    ctx.arc(width * 0.5, height * 0.34, width * (0.34 + speechPulse * 0.06), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Main Digital Human Portrait / Video with Pose + Facial Muscle Kinematics + Camera Motion
  if (el) {
    const baseZoom = dh.cameraMotion?.enabled ? 1 : 1 + 0.03 * progress;
    const padW = width * baseZoom;
    const padH = height * baseZoom;
    drawAnchorPortraitCover(
      ctx,
      el,
      (width - padW) / 2,
      (height - padH) / 2,
      padW,
      padH,
      speechPulse,
      timeSec,
      filter,
      colorAdj,
      action,
      1,
      emotion,
      muscles,
      dh.cameraMotion,
      progress,
      blendState?.blendFromAction,
      blendState?.blendWeight ?? 1
    );
  }

  // Facial Muscle Expression & Lip-Sync Rig Overlay
  if (emotionEnabled) {
    drawDigitalHumanFacialMuscleRig(
      ctx,
      emotion,
      muscles,
      0,
      0,
      width,
      height,
      timeSec,
      speechPulse
    );
  }

  // Pose-Driven Foreground Gesture Overlay (supports cross-fade blending between consecutive actions)
  drawBlendedDigitalHumanPoseOverlay(
    ctx,
    action,
    0,
    height * 0.08,
    width,
    height * 0.74,
    timeSec,
    speechPulse,
    accent,
    1,
    blendState
  );

  // Lower-third / Header Anchor Studio Badge (above safe bottom caption zone)
  const camActive = dh.cameraMotion?.enabled && dh.cameraMotion.preset !== 'none';
  const camPreset = camActive ? getDigitalHumanCameraPreset(dh.cameraMotion?.preset) : null;
  const badgeW = Math.min(width * 0.85, camPreset || fromActionTmpl ? 410 : 355);
  const badgeH = 34;
  const badgeX = width * 0.06;
  const badgeY = height * 0.12;
  ctx.save();
  ctx.fillStyle = 'rgba(11, 13, 18, 0.76)';
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
  ctx.lineWidth = 1;
  drawRoundedRect(ctx, badgeX, badgeY, badgeW, badgeH, 10);
  ctx.fill();
  ctx.stroke();

  // Live speaking pulse dot + name + active pose + emotion + camera tag
  ctx.fillStyle = speechPulse > 0.12 ? emotionPreset.badgeColor || accent : '#34d399';
  ctx.beginPath();
  ctx.arc(badgeX + 14, badgeY + badgeH / 2, 4 + speechPulse * 1.6, 0, Math.PI * 2);
  ctx.fill();

  ctx.font = '600 12px "Plus Jakarta Sans", "Noto Sans SC", sans-serif';
  ctx.fillStyle = '#F4F4F5';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  const poseText = fromActionTmpl ? `${fromActionTmpl.label}→${actionTmpl.label}` : actionTmpl.label;
  const emotionTag = emotionEnabled && emotion !== 'neutral' ? ` · ${emotionPreset.label}` : '';
  const camTag = camPreset ? ` · ${camPreset.label}` : '';
  ctx.fillText(`虚拟主播 · ${dh.profileName} · ${poseText}${emotionTag}${camTag}`, badgeX + 26, badgeY + badgeH / 2);

  if (dh.showLiveWaveRing) {
    drawVoiceWaveBars(
      ctx,
      badgeX + badgeW - 24,
      badgeY + badgeH / 2,
      5,
      14,
      2.5,
      2,
      emotionEnabled && emotion !== 'neutral' ? emotionPreset.badgeColor : actionTmpl.badgeColor || accent,
      speechPulse * (0.85 + 0.25 * muscles.jawOpenness),
      timeSec
    );
  }
  ctx.restore();
}

export function drawDigitalHumanPipOverlay(
  ctx: CanvasRenderingContext2D,
  dh: DigitalHumanClipConfig,
  el: LoadedMediaElement | null,
  width: number,
  height: number,
  timeSec: number,
  voiceActivity: number,
  progress = 0.5,
  blendState?: DigitalHumanPoseBlendState
) {
  const accent = dh.accentColor || '#fb7185';
  const action = dh.action ?? 'explain';
  const actionTmpl = getDigitalHumanActionTemplate(action);
  const isBlendingPose = Boolean(
    blendState?.blendFromAction && blendState.blendFromAction !== action && blendState.blendWeight < 1
  );
  const fromActionTmpl = isBlendingPose && blendState?.blendFromAction
    ? getDigitalHumanActionTemplate(blendState.blendFromAction)
    : null;
  const emotionEnabled = dh.emotionMatchEnabled !== false;
  const emotion: DigitalHumanEmotionId = emotionEnabled ? dh.emotion ?? 'neutral' : 'neutral';
  const emotionPreset = getDigitalHumanEmotionPreset(emotion);
  const muscles = clampFacialMuscles(dh.facialMuscles ?? emotionPreset.muscles);

  const intensity = dh.actionIntensity ?? actionTmpl.recommendedIntensity ?? 1;
  const speechPulse = Math.min(1, voiceActivity * (dh.speechIntensity ?? 1) * intensity);
  const pointDir: -1 | 1 = dh.pipPosition.includes('right') ? -1 : 1;

  const scale = Math.max(0.2, Math.min(0.45, dh.pipScale || 0.3));
  const pipW = Math.round(width * scale);
  const pipH =
    dh.frameShape === 'circle'
      ? pipW
      : dh.frameShape === 'portrait-badge'
        ? Math.round(pipW * 1.28)
        : Math.round(pipW * 1.15);

  const marginX = Math.round(width * 0.05);
  const marginTop = Math.round(height * 0.1);
  const marginBottom = Math.round(height * 0.14);

  let x = width - pipW - marginX;
  let y = height - pipH - marginBottom;
  if (dh.pipPosition === 'bottom-left') {
    x = marginX;
    y = height - pipH - marginBottom;
  } else if (dh.pipPosition === 'top-right') {
    x = width - pipW - marginX;
    y = marginTop;
  } else if (dh.pipPosition === 'top-left') {
    x = marginX;
    y = marginTop;
  }

  const radius = dh.frameShape === 'circle' ? pipW / 2 : 16;
  const activeBorderTone =
    emotionEnabled && emotion !== 'neutral'
      ? emotionPreset.badgeColor
      : actionTmpl.badgeColor || accent;

  ctx.save();

  // Outer speaking audio-reactive halo
  if (dh.showLiveWaveRing && speechPulse > 0.06) {
    ctx.save();
    ctx.strokeStyle = activeBorderTone;
    ctx.globalAlpha = 0.35 + speechPulse * 0.55;
    ctx.lineWidth = 2.5 + speechPulse * 3;
    const expand = 3 + speechPulse * 5;
    if (dh.frameShape === 'circle') {
      ctx.beginPath();
      ctx.arc(x + pipW / 2, y + pipH / 2, pipW / 2 + expand, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      drawRoundedRect(ctx, x - expand, y - expand, pipW + expand * 2, pipH + expand * 2, radius + 3);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Soft shadow behind PiP frame
  ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 6;
  ctx.fillStyle = '#12151E';
  if (dh.frameShape === 'circle') {
    ctx.beginPath();
    ctx.arc(x + pipW / 2, y + pipH / 2, pipW / 2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    drawRoundedRect(ctx, x, y, pipW, pipH, radius);
    ctx.fill();
  }
  ctx.shadowColor = 'transparent';

  // Clip portrait inside shape
  ctx.save();
  if (dh.frameShape === 'circle') {
    ctx.beginPath();
    ctx.arc(x + pipW / 2, y + pipH / 2, pipW / 2, 0, Math.PI * 2);
    ctx.clip();
  } else {
    drawRoundedRect(ctx, x, y, pipW, pipH, radius);
    ctx.clip();
  }

  // Subtle dark studio gradient behind anchor
  const bg = ctx.createLinearGradient(x, y, x, y + pipH);
  bg.addColorStop(0, '#1e2433');
  bg.addColorStop(1, '#0b0e15');
  ctx.fillStyle = bg;
  ctx.fillRect(x, y, pipW, pipH);

  if (el) {
    drawAnchorPortraitCover(
      ctx,
      el,
      x,
      y,
      pipW,
      pipH,
      speechPulse,
      timeSec,
      'natural',
      undefined,
      action,
      pointDir,
      emotion,
      muscles,
      dh.cameraMotion,
      progress,
      blendState?.blendFromAction,
      blendState?.blendWeight ?? 1
    );
  }

  if (emotionEnabled) {
    drawDigitalHumanFacialMuscleRig(
      ctx,
      emotion,
      muscles,
      x,
      y,
      pipW,
      pipH - (dh.showLiveWaveRing ? 18 : 0),
      timeSec,
      speechPulse
    );
  }

  // Pose-driven foreground gesture overlay inside PiP (cross-fades when action blends)
  drawBlendedDigitalHumanPoseOverlay(
    ctx,
    action,
    x,
    y,
    pipW,
    pipH - (dh.showLiveWaveRing ? 18 : 0),
    timeSec,
    speechPulse,
    accent,
    pointDir,
    blendState
  );

  // Mini live wave bar strip inside bottom of PiP
  if (dh.showLiveWaveRing) {
    ctx.fillStyle = 'rgba(9, 11, 16, 0.68)';
    ctx.fillRect(x, y + pipH - 22, pipW, 22);
    drawVoiceWaveBars(
      ctx,
      x + pipW / 2,
      y + pipH - 11,
      7,
      12,
      2.5,
      2.5,
      activeBorderTone,
      speechPulse * (0.85 + 0.25 * muscles.jawOpenness),
      timeSec
    );
  }
  ctx.restore();

  // Crisp inner border
  ctx.strokeStyle = speechPulse > 0.15 ? activeBorderTone : 'rgba(255,255,255,0.28)';
  ctx.lineWidth = 2;
  if (dh.frameShape === 'circle') {
    ctx.beginPath();
    ctx.arc(x + pipW / 2, y + pipH / 2, pipW / 2, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    drawRoundedRect(ctx, x, y, pipW, pipH, radius);
    ctx.stroke();
  }

  // Top action + emotion tag badge on PiP frame
  ctx.save();
  const poseTag = fromActionTmpl ? `${fromActionTmpl.label}→${actionTmpl.label}` : actionTmpl.label;
  const tagText =
    emotionEnabled && emotion !== 'neutral'
      ? `${poseTag}·${emotionPreset.label}`
      : poseTag;
  const pillW = Math.max(38, Math.round(tagText.length * 10 + 14));
  const pillH = 16;
  const pillX = dh.frameShape === 'circle' ? x + (pipW - pillW) / 2 : x + 8;
  const pillY = dh.frameShape === 'circle' ? y - 6 : y + 7;
  ctx.fillStyle = 'rgba(9, 11, 16, 0.84)';
  ctx.strokeStyle = activeBorderTone;
  ctx.lineWidth = 1;
  drawRoundedRect(ctx, pillX, pillY, pillW, pillH, 6);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#f4f4f5';
  ctx.font = '700 9px "Plus Jakarta Sans", "Noto Sans SC", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(tagText, pillX + pillW / 2, pillY + pillH / 2 + 0.5);
  ctx.restore();

  ctx.restore();
}

export function renderDigitalHumanMiniStage(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  avatarUrl: string,
  accentColor: string,
  timeSec: number,
  voiceActivity: number,
  action: DigitalHumanActionId = 'explain',
  emotion: DigitalHumanEmotionId = 'neutral',
  muscles?: DigitalHumanFacialMuscles,
  cameraMotion?: DigitalHumanCameraMotion,
  blendFromAction?: DigitalHumanActionId,
  blendWeight = 1
) {
  const actionTmpl = getDigitalHumanActionTemplate(action);
  const isBlendingPose = Boolean(blendFromAction && blendFromAction !== action && blendWeight < 1);
  const fromActionTmpl = isBlendingPose && blendFromAction
    ? getDigitalHumanActionTemplate(blendFromAction)
    : null;
  const emotionPreset = getDigitalHumanEmotionPreset(emotion);
  const resolvedMuscles = clampFacialMuscles(muscles ?? emotionPreset.muscles);
  const activeTone =
    emotion !== 'neutral'
      ? emotionPreset.badgeColor
      : actionTmpl.badgeColor || accentColor;

  ctx.clearRect(0, 0, width, height);
  const bg = ctx.createRadialGradient(
    width * 0.5,
    height * 0.36,
    12,
    width * 0.5,
    height * 0.5,
    height * 0.72
  );
  bg.addColorStop(0, emotion === 'suspense' ? '#2a1a3d' : emotion === 'excited' ? '#332516' : '#222838');
  bg.addColorStop(1, '#0b0d12');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  const img = digitalHumanElementCache.get(avatarUrl) ?? (() => {
    const i = new Image();
    i.crossOrigin = 'anonymous';
    i.src = avatarUrl;
    digitalHumanElementCache.set(avatarUrl, i);
    return i;
  })();

  if (voiceActivity > 0.05) {
    ctx.save();
    ctx.globalAlpha = 0.18 + voiceActivity * 0.28;
    ctx.fillStyle = activeTone;
    ctx.beginPath();
    ctx.arc(width * 0.5, height * 0.42, width * (0.34 + voiceActivity * 0.07), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  if (img.complete && img.naturalWidth > 0) {
    const loopProgress = (timeSec % 3.2) / 3.2;
    drawAnchorPortraitCover(
      ctx,
      img,
      0,
      0,
      width,
      height,
      voiceActivity,
      timeSec,
      'natural',
      undefined,
      action,
      1,
      emotion,
      resolvedMuscles,
      cameraMotion,
      loopProgress,
      blendFromAction,
      blendWeight
    );
  }

  // Facial muscle & mood shading overlay
  drawDigitalHumanFacialMuscleRig(
    ctx,
    emotion,
    resolvedMuscles,
    0,
    0,
    width,
    height - 24,
    timeSec,
    voiceActivity
  );

  // Live Pose Gesture Overlay on Mini Stage (with smooth Motion Blending cross-fade)
  drawBlendedDigitalHumanPoseOverlay(
    ctx,
    action,
    0,
    0,
    width,
    height - 24,
    timeSec,
    voiceActivity,
    activeTone,
    1,
    { blendFromAction, blendWeight }
  );

  // Action + Emotion pill badge top-left
  ctx.save();
  const poseLabel = fromActionTmpl ? `${fromActionTmpl.label}→${actionTmpl.label}` : actionTmpl.label;
  const label = emotion !== 'neutral' ? `${poseLabel}·${emotionPreset.label}` : poseLabel;
  const badgeW = Math.max(34, label.length * 9 + 12);
  ctx.fillStyle = 'rgba(9, 11, 16, 0.8)';
  ctx.strokeStyle = activeTone;
  ctx.lineWidth = 1;
  drawRoundedRect(ctx, 5, 5, badgeW, 15, 4);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#f4f4f5';
  ctx.font = '700 8px "Plus Jakarta Sans", "Noto Sans SC", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 5 + badgeW / 2, 13);
  ctx.restore();

  // Voice wave strip at bottom
  ctx.save();
  ctx.fillStyle = 'rgba(9, 11, 15, 0.72)';
  ctx.fillRect(0, height - 24, width, 24);
  drawVoiceWaveBars(
    ctx,
    width / 2,
    height - 12,
    11,
    14,
    3,
    3,
    activeTone,
    voiceActivity * (0.85 + 0.25 * resolvedMuscles.jawOpenness),
    timeSec
  );
  ctx.restore();
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
