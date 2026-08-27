import { spawn } from 'node:child_process';
import { writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import type { Logger } from '../../utils/logger.js';

interface ChapterMarker {
  title: string;
  startTime: number;
}

interface ConcatenateOptions {
  inputFiles: string[];
  outputFile: string;
  format: 'mp3' | 'm4a';
  chapterMarkers?: ChapterMarker[];
  silenceBetweenChapters?: number;
  onProgress?: (percent: number) => void;
  logger: Logger;
}

interface ConcatenateResult {
  duration: number;
  fileSize: number;
}

const SILENCE_DURATION_MS = 1000;

export class AudioConcatenator {
  async concatenateAudioFiles(options: ConcatenateOptions): Promise<ConcatenateResult> {
    const {
      inputFiles,
      outputFile,
      format,
      chapterMarkers,
      silenceBetweenChapters = SILENCE_DURATION_MS,
      onProgress,
      logger,
    } = options;

    if (inputFiles.length === 0) {
      throw new Error('No input files provided');
    }

    logger.info('Starting audio concatenation', {
      inputCount: inputFiles.length,
      outputFile,
      format,
      withMarkers: Boolean(chapterMarkers),
    });

    const tempListFile = join(process.cwd(), `concat-list-${Date.now()}.txt`);

    try {
      await this.createConcatList(inputFiles, tempListFile, silenceBetweenChapters);

      const ffmpegArgs = this.buildFFmpegArgs(tempListFile, outputFile, format, chapterMarkers);

      const result = await this.runFFmpeg(ffmpegArgs, onProgress, logger);

      logger.info('Audio concatenation completed', {
        duration: result.duration,
        fileSize: result.fileSize,
      });

      return result;
    } finally {
      await unlink(tempListFile).catch(() => {});
    }
  }

  private async createConcatList(
    inputFiles: string[],
    listFile: string,
    silenceDuration: number,
  ): Promise<void> {
    const lines: string[] = [];

    for (let i = 0; i < inputFiles.length; i++) {
      lines.push(`file '${inputFiles[i].replace(/'/g, "'\\''")}'`);

      if (i < inputFiles.length - 1 && silenceDuration > 0) {
        lines.push(`file 'anullsrc=r=44100:cl=stereo:d=${silenceDuration / 1000}'`);
      }
    }

    await writeFile(listFile, lines.join('\n'), 'utf-8');
  }

  private buildFFmpegArgs(
    listFile: string,
    outputFile: string,
    format: 'mp3' | 'm4a',
    chapterMarkers?: ChapterMarker[],
  ): string[] {
    const args = [
      '-f', 'concat',
      '-safe', '0',
      '-i', listFile,
      '-c', 'copy',
    ];

    if (format === 'mp3' && chapterMarkers && chapterMarkers.length > 0) {
      const metadata = this.buildMP3Metadata(chapterMarkers);
      args.push('-metadata', metadata);
    }

    if (format === 'm4a' && chapterMarkers && chapterMarkers.length > 0) {
      const chapterFile = this.buildM4AChapterFile(chapterMarkers);
      args.push('-i', chapterFile, '-map_metadata', '1');
    }

    args.push(outputFile);

    return args;
  }

  private buildMP3Metadata(markers: ChapterMarker[]): string {
    const chapters = markers.map((marker, idx) => {
      const startMs = Math.floor(marker.startTime * 1000);
      const endMs = idx < markers.length - 1
        ? Math.floor(markers[idx + 1].startTime * 1000)
        : startMs + 600000;

      return `[CHAPTER]\nTIMEBASE=1/1000\nSTART=${startMs}\nEND=${endMs}\ntitle=${marker.title}`;
    }).join('\n\n');

    return `;FFMETADATA1\n${chapters}`;
  }

  private buildM4AChapterFile(markers: ChapterMarker[]): string {
    const chapters = markers.map((marker, idx) => {
      const startTime = this.formatTimestamp(marker.startTime);
      return `CHAPTER${idx + 1}=${startTime}\nCHAPTER${idx + 1}NAME=${marker.title}`;
    }).join('\n');

    return `;FFMETADATA1\n${chapters}`;
  }

  private formatTimestamp(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);

    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
  }

  private async runFFmpeg(
    args: string[],
    onProgress?: (percent: number) => void,
    logger?: Logger,
  ): Promise<ConcatenateResult> {
    return new Promise((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', args);

      let stderr = '';
      let duration = 0;

      ffmpeg.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();

        const durationMatch = stderr.match(/Duration: (\d{2}):(\d{2}):(\d{2})\.\d+/);
        if (durationMatch) {
          const [, hours, minutes, seconds] = durationMatch;
          duration = parseInt(hours) * 3600 + parseInt(minutes) * 60 + parseInt(seconds);
        }

        const timeMatch = stderr.match(/time=(\d{2}):(\d{2}):(\d{2})\.\d+/);
        if (timeMatch && duration > 0) {
          const [, hours, minutes, seconds] = timeMatch;
          const currentTime = parseInt(hours) * 3600 + parseInt(minutes) * 60 + parseInt(seconds);
          const percent = Math.min(100, Math.floor((currentTime / duration) * 100));
          onProgress?.(percent);
        }
      });

      ffmpeg.on('close', (code) => {
        if (code !== 0) {
          logger?.error('FFmpeg failed', { code, stderr });
          reject(new Error(`FFmpeg exited with code ${code}`));
          return;
        }

        const sizeMatch = stderr.match(/size=\s*(\d+)kB/);
        const fileSize = sizeMatch ? parseInt(sizeMatch[1]) * 1024 : 0;

        resolve({ duration, fileSize });
      });

      ffmpeg.on('error', (error) => {
        logger?.error('FFmpeg spawn error', { error: error.message });
        reject(error);
      });
    });
  }
}
