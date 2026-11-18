import { describe, expect, it } from 'vitest';
import { packagedAudioNote } from './packagedAudioNote';

describe('packagedAudioNote', () => {
  it('says the film is ready only after sound effects land', () => {
    expect(
      packagedAudioNote(['配乐（科技律动）', '4 段真人感配音', '6 处节点音效'], true),
    ).toBe(
      '整片声音已配齐：配乐（科技律动） + 4 段真人感配音 + 6 处节点音效 + 人声闪避。点击播放器即可试听成片效果！',
    );
  });

  it('keeps the finished parts and points at the sound button when effects time out', () => {
    const note = packagedAudioNote(['配乐（清新）', '4 段真人感配音'], false);
    expect(note).toContain('配乐（清新）、4 段真人感配音已留下');
    expect(note).toContain('AI 音效库推荐并匹配节点');
    expect(note).not.toContain('整片声音已配齐');
  });

  it('stays quiet when nothing landed', () => {
    expect(packagedAudioNote([], false)).toBeNull();
  });
});
