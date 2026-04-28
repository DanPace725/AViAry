import {
  getNextQueuedJob,
  getSql,
  markJobStatus,
  markVideoStatus,
  saveTranscript
} from '@aviary/db';
import OpenAI, { toFile } from 'openai';
import 'dotenv/config';

const transcriptionModel = process.env.OPENAI_TRANSCRIPTION_MODEL ?? 'gpt-4o-mini-transcribe';

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
    await markJobStatus(sql, job.id, 'transcribing');
    await markVideoStatus(sql, job.videoId, 'transcribing');

    const media = await downloadBlob(job.originalFileUrl);
    const transcript = await transcribeMedia(media, job.originalFilePath ?? `${job.videoId}.media`, job.mimeType);

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
