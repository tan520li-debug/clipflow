import { spawn } from 'child_process';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { ensureStudioTmpDir } from './workDir.ts';

export async function transcodeVideoFileToH264Mp4(
  inputPath: string,
  outputPath: string
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const args = [
      '-y',
      '-i',
      inputPath,
      '-map',
      '0:v:0',
      '-map',
      '0:a:0?',
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '21',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      '-c:a',
      'aac',
      '-b:a',
      '160k',
      '-ac',
      '2',
      '-f',
      'mp4',
      outputPath,
    ];

    const ffmpegBin = (process.env.FFMPEG_PATH || '').trim() || 'ffmpeg';
    const proc = spawn(ffmpegBin, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderrTail = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        proc.kill('SIGKILL');
        reject(new Error('ffmpeg transcode timed out'));
      }
    }, 90_000);

    proc.stderr.on('data', (chunk: Buffer) => {
      stderrTail = (stderrTail + chunk.toString('utf8')).slice(-2000);
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      if (!settled) {
        settled = true;
        reject(err);
      }
    });

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`ffmpeg exited with code ${code}: ${stderrTail}`));
      }
    });
  });
}

export async function transcodeVideoBufferToH264Mp4(
  inputBuffer: Buffer,
  sourceExt = 'webm'
): Promise<Buffer> {
  const safeExt = /^[a-z0-9]{2,5}$/i.test(sourceExt) ? sourceExt.toLowerCase() : 'webm';
  const jobId = crypto.randomUUID();
  const scratch = await ensureStudioTmpDir();
  const inPath = path.join(scratch, `clipflow-in-${jobId}.${safeExt}`);
  const outPath = path.join(scratch, `clipflow-out-${jobId}.mp4`);

  await fs.writeFile(inPath, inputBuffer);

  try {
    await transcodeVideoFileToH264Mp4(inPath, outPath);
    const outBuffer = await fs.readFile(outPath);
    if (!outBuffer || outBuffer.length === 0) {
      throw new Error('Transcoded MP4 file is empty');
    }
    return outBuffer;
  } finally {
    await Promise.allSettled([fs.unlink(inPath), fs.unlink(outPath)]);
  }
}
