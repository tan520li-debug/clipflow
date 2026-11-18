import { describe, expect, it } from 'vitest';
import {
  compactStudioSession,
  normalizeStudioSession,
  restoreSpilledCueAudio,
  spillOversizedCueAudio,
} from './studioSession';

describe('normalizeStudioSession', () => {
  it('keeps a saved timeline and drops an empty record', () => {
    const saved = normalizeStudioSession({
      activePlatform: 'douyin',
      brief: '刷新后还在',
      editingStyle: 'talking-head',
      targetPlatforms: ['douyin', 'nope'],
      targetDuration: 24,
      bpm: 96,
      autoSoundOnEdit: true,
      selectedClipId: 'clip-a',
      selectedSubtitleId: null,
      projects: {
        douyin: {
          platform: 'douyin',
          aspectRatio: '9:16',
          clips: [{ id: 'clip-a', label: '保留的镜头' }],
          subtitles: [],
          copy: { title: '标题' },
          audio: { bgmPreset: 'none', bpm: 96, volume: 1 },
        },
      },
    });

    expect(saved?.projects.douyin?.clips[0]?.label).toBe('保留的镜头');
    expect(saved?.brief).toBe('刷新后还在');
    expect(saved?.targetPlatforms).toEqual(['douyin']);
    expect(saved?.selectedClipId).toBe('clip-a');
    expect(normalizeStudioSession({ projects: {} })).toBeNull();
    expect(normalizeStudioSession(null)).toBeNull();
  });

  it('opens the Chinese cut when the saved platform is not Chinese or English', () => {
    const session = normalizeStudioSession({
      activePlatform: 'xiaohongshu',
      targetPlatforms: ['douyin', 'facebook', 'xiaohongshu'],
      projects: {
        douyin: {
          platform: 'douyin',
          aspectRatio: '9:16',
          clips: [{ id: 'zh', label: '中文' }],
          subtitles: [],
          copy: {},
          audio: { bpm: 96, volume: 1, bgmPreset: 'none' },
        },
        xiaohongshu: {
          platform: 'xiaohongshu',
          aspectRatio: '9:16',
          clips: [{ id: 'xhs', label: '仍保留' }],
          subtitles: [],
          copy: {},
          audio: { bpm: 112, volume: 1, bgmPreset: 'none' },
        },
      },
    });

    expect(session?.activePlatform).toBe('douyin');
    expect(session?.targetPlatforms).toEqual(['douyin']);
    expect(session?.projects.xiaohongshu?.clips[0]?.label).toBe('仍保留');
  });

  it('strips oversized voice payloads while keeping the cue text', () => {
    const session = normalizeStudioSession({
      projects: {
        tiktok: {
          platform: 'tiktok',
          aspectRatio: '9:16',
          clips: [],
          subtitles: [],
          copy: {},
          audio: { customAudioUrl: 'blob:http://local/1', bpm: 120, volume: 1, bgmPreset: 'none' },
          voiceoverCues: [{ id: 'v1', text: '口播', audioBase64: 'a'.repeat(180_001) }],
        },
      },
    });
    expect(session).not.toBeNull();
    const compact = compactStudioSession(session!);
    expect(compact.projects.tiktok?.voiceoverCues?.[0]?.text).toBe('口播');
    expect(compact.projects.tiktok?.voiceoverCues?.[0]?.audioBase64).toBe('');
    expect(compact.projects.tiktok?.audio.customAudioUrl).toBeUndefined();
  });

  it('moves oversized cue audio beside the session and restores it', () => {
    const session = normalizeStudioSession({
      projects: {
        douyin: {
          platform: 'douyin',
          aspectRatio: '9:16',
          clips: [],
          subtitles: [],
          copy: {},
          audio: { bpm: 96, volume: 1, bgmPreset: 'none' },
          voiceoverCues: [
            { id: 'keep', text: '短', audioBase64: 'abc', mimeType: 'audio/wav' },
            { id: 'big', text: '长', audioBase64: 'b'.repeat(180_001), mimeType: 'audio/wav' },
          ],
        },
      },
    });
    const spilled = spillOversizedCueAudio(session!);
    const stored = spilled.session.projects.douyin?.voiceoverCues ?? [];
    expect(stored[0]?.audioBase64).toBe('abc');
    expect(stored[1]?.audioBase64).toBe('clipflow-cue-audio:douyin:big');
    expect(spilled.spilled).toEqual([
      { key: 'clipflow-cue-audio:douyin:big', audioBase64: 'b'.repeat(180_001) },
    ]);

    const restored = restoreSpilledCueAudio(
      spilled.session,
      new Map([['clipflow-cue-audio:douyin:big', 'b'.repeat(180_001)]]),
    );
    expect(restored.projects.douyin?.voiceoverCues?.[1]?.audioBase64).toBe('b'.repeat(180_001));
    expect(restored.projects.douyin?.voiceoverCues?.[1]?.text).toBe('长');

    const missing = restoreSpilledCueAudio(spilled.session, new Map());
    expect(missing.projects.douyin?.voiceoverCues?.[1]?.audioBase64).toBe('');
    expect(missing.projects.douyin?.voiceoverCues?.[1]?.text).toBe('长');
  });
});
