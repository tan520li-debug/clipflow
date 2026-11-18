import { describe, expect, it } from 'vitest';
import { exportSubtitleDownloadName, exportVideoDownloadName } from './exportDownloadName';

describe('exportVideoDownloadName', () => {
  it('names the two editions without a posting platform', () => {
    expect(exportVideoDownloadName('douyin', '9:16', '1080p', 'mp4')).toBe('clipflow_zh_9x16_1080p.mp4');
    expect(exportVideoDownloadName('tiktok', '9:16', '1080p', 'mp4')).toBe('clipflow_en_9x16_1080p.mp4');
  });

  it('keeps a hidden platform id when that cut is exported', () => {
    expect(exportVideoDownloadName('instagram', '4:5', '720p', 'webm')).toBe(
      'clipflow_instagram_4x5_720p.webm',
    );
  });
});

describe('exportSubtitleDownloadName', () => {
  it('uses the same edition stem as the video', () => {
    expect(exportSubtitleDownloadName('douyin')).toBe('clipflow_zh_subtitles.srt');
    expect(exportSubtitleDownloadName('tiktok')).toBe('clipflow_en_subtitles.srt');
  });
});
