import { describe, expect, it } from 'vitest';
import { compactStudioSession, normalizeStudioSession } from './studioSession';

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
});
