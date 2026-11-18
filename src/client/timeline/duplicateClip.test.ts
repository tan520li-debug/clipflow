import { describe, expect, it } from 'vitest';
import type { TimelineClip } from '../../types/studio';
import { duplicateClip } from './duplicateClip';

function clip(): TimelineClip {
  return {
    id: 'c1',
    assetId: 'a1',
    label: '开场黄金钩子',
    trimStart: 0.4,
    duration: 2.2,
    transition: 'whip-pan',
    motion: 'ken-burns-in',
    filter: 'warm-film',
    speed: 1,
    hookTag: '前3秒卡点钩子',
  };
}

describe('duplicateClip', () => {
  it('copies the shot and drops the opening hook', () => {
    const copy = duplicateClip(clip(), 'c1-copy');
    expect(copy).toMatchObject({
      id: 'c1-copy',
      label: '开场黄金钩子 副本',
      trimStart: 0.4,
      duration: 2.2,
      transition: 'whip-pan',
      motion: 'ken-burns-in',
      assetId: 'a1',
    });
    expect(copy.hookTag).toBeUndefined();
  });
});
