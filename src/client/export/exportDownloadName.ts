import type { PlatformId } from '../../types/studio';

/** Chinese and English cuts are not tied to one posting platform. */
export function exportEditionStem(platform: PlatformId): string {
  if (platform === 'douyin') return 'zh';
  if (platform === 'tiktok') return 'en';
  return platform;
}

export function exportVideoDownloadName(
  platform: PlatformId,
  aspectRatio: string,
  resolutionTier: string,
  ext: string,
): string {
  const ratio = aspectRatio.replace(':', 'x');
  return `clipflow_${exportEditionStem(platform)}_${ratio}_${resolutionTier}.${ext}`;
}

export function exportSubtitleDownloadName(platform: PlatformId): string {
  return `clipflow_${exportEditionStem(platform)}_subtitles.srt`;
}
