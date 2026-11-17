import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';

const spawn = vi.hoisted(() => vi.fn());

vi.mock('child_process', () => ({
  spawn,
}));

import { transcodeVideoFileToH264Mp4 } from './transcode.ts';

class FakeProc extends EventEmitter {
  stderr = new EventEmitter();
  kill = vi.fn(() => {
    this.emit('close', 1);
    return true;
  });
}

afterEach(() => {
  spawn.mockReset();
});

describe('transcodeVideoFileToH264Mp4', () => {
  it('kills ffmpeg when the job signal aborts', async () => {
    const proc = new FakeProc();
    spawn.mockReturnValue(proc);
    const controller = new AbortController();
    const pending = transcodeVideoFileToH264Mp4('in.webm', 'out.mp4', controller.signal);
    await Promise.resolve();
    controller.abort();
    await expect(pending).rejects.toThrow('JOB_DEADLINE');
    expect(proc.kill).toHaveBeenCalledWith('SIGKILL');
  });

  it('does not start ffmpeg when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      transcodeVideoFileToH264Mp4('in.webm', 'out.mp4', controller.signal),
    ).rejects.toThrow('JOB_DEADLINE');
    expect(spawn).not.toHaveBeenCalled();
  });
});
