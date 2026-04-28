import {
  getNextQueuedJob,
  getSql,
  markJobStatus,
  markVideoStatus,
  saveTranscript
} from '@aviary/db';
import OpenAI, { toFile } from 'openai';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, extname, join } from 'node:path';
import { promisify } from 'node:util';
import { config } from 'dotenv';

config({ path: ['.env.local', '.env'] });

const transcriptionModel = process.env.OPENAI_TRANSCRIPTION_MODEL ?? 'gpt-4o-mini-transcribe';
const execFileAsync = promisify(execFile);

type PreparedMedia = {
  buffer: Buffer;
  filename: string;
  mimeType: string;
};

async function downloadBlob(url: string) {
  const headers = new Headers();
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    headers.set('Authorization', `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}`);
  }

  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`Unable to download blob: ${response.status} ${response.statusText}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

async function transcribeMedia(buffer: Buffer, filename: string, mimeType?: string | null) {
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });
  const file = await toFile(buffer, filename, {
    type: mimeType ?? 'application/octet-stream'
  });

  const transcription = await openai.audio.transcriptions.create({
    file,
    model: transcriptionModel
  });

  return transcription.text;
}

function shouldExtractAudio(filename: string, mimeType?: string | null) {
  const extension = extname(filename).toLowerCase();
  const videoExtensions = new Set(['.avi', '.mov', '.mp4', '.mpeg', '.mpg', '.mkv']);

  return mimeType?.startsWith('video/') || videoExtensions.has(extension);
}

async function extractAudio(buffer: Buffer, filename: string): Promise<PreparedMedia> {
  const tempDirectory = await mkdtemp(join(tmpdir(), 'aviary-worker-'));
  const inputPath = join(tempDirectory, basename(filename) || 'input.media');
  const outputPath = join(tempDirectory, 'audio.wav');

  try {
    await writeFile(inputPath, buffer);
    await execFileAsync('ffmpeg', [
      '-y',
      '-i',
      inputPath,
      '-vn',
      '-acodec',
      'pcm_s16le',
      '-ar',
      '16000',
      '-ac',
      '1',
      outputPath
    ]);

    return {
      buffer: await readFile(outputPath),
      filename: `${basename(filename, extname(filename)) || 'audio'}.wav`,
      mimeType: 'audio/wav'
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown ffmpeg error';
    throw new Error(`Unable to extract audio with ffmpeg. Confirm ffmpeg is installed and on PATH. ${message}`);
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }
}

async function prepareMediaForTranscription(
  buffer: Buffer,
  filename: string,
  mimeType?: string | null
): Promise<PreparedMedia> {
  if (shouldExtractAudio(filename, mimeType)) {
    return extractAudio(buffer, filename);
  }

  return {
    buffer,
    filename: basename(filename) || 'media',
    mimeType: mimeType ?? 'application/octet-stream'
  };
}

async function runOnce() {
  if (!process.env.DATABASE_URL) {
    console.log('DATABASE_URL is not set. Nothing to process.');
    return;
  }

  if (!process.env.OPENAI_API_KEY) {
    console.log('OPENAI_API_KEY is not set. Worker can claim jobs after a key is configured.');
    return;
  }

  const sql = getSql();
  const job = await getNextQueuedJob(sql);
  if (!job) {
    console.log('No queued jobs found.');
    return;
  }

  if (!job.originalFileUrl) {
    await markJobStatus(sql, job.id, 'failed', 'No uploaded media URL is attached to this video item.');
    await markVideoStatus(sql, job.videoId, 'failed');
    console.log(`Job ${job.id} failed: no uploaded media URL.`);
    return;
  }

  try {
    await markVideoStatus(sql, job.videoId, 'processing_audio');

    const media = await downloadBlob(job.originalFileUrl);
    const preparedMedia = await prepareMediaForTranscription(
      media,
      job.originalFilePath ?? `${job.videoId}.media`,
      job.mimeType
    );

    await markJobStatus(sql, job.id, 'transcribing');
    await markVideoStatus(sql, job.videoId, 'transcribing');

    const transcript = await transcribeMedia(
      preparedMedia.buffer,
      preparedMedia.filename,
      preparedMedia.mimeType
    );

    await saveTranscript(sql, job.videoId, transcript);
    await markVideoStatus(sql, job.videoId, 'ready', transcript.slice(0, 500));
    await markJobStatus(sql, job.id, 'ready');

    console.log(`Job ${job.id} processed successfully.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown worker error';
    await markJobStatus(sql, job.id, 'failed', message);
    await markVideoStatus(sql, job.videoId, 'failed');
    console.error(`Job ${job.id} failed: ${message}`);
    process.exitCode = 1;
  }
}

await runOnce();
