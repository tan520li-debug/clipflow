const SOUND_RETRY = '再点「AI 音效库推荐并匹配节点」。';

export function packagedAudioNote(
  completedParts: readonly string[],
  soundEffectsLanded: boolean,
): string | null {
  if (completedParts.length === 0) return null;
  if (!soundEffectsLanded) {
    return `${completedParts.join('、')}已留下。音效这次没有写上，${SOUND_RETRY}`;
  }
  return `整片声音已配齐：${completedParts.join(' + ')} + 人声闪避。点击播放器即可试听成片效果！`;
}
