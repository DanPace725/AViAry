import { neon } from '@neondatabase/serverless';
import type { ProcessingStatus, Transcript, TranscriptChunk, VideoItem, VideoItemDetail } from '@aviary/shared';

export function getSql(databaseUrl = process.env.DATABASE_URL) {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required to connect to Neon.');
  }

  return neon(databaseUrl);
}

export type Sql = ReturnType<typeof getSql>;

export type ProcessingJob = {
  id: string;
  videoId: string;
  userId: string;
  status: ProcessingStatus;
  attempts: number;
  originalFileUrl: string | null;
  originalFilePath: string | null;
  mimeType: string | null;
  title: string;
};

export type CreateVideoCaptureInput = {
  userId: string;
  title: string;
  sourceUrl?: string;
  sourcePlatform?: string;
  originalFileUrl?: string;
  originalFilePath?: string;
  fileSizeBytes?: number;
  mimeType?: string;
};

type VideoItemRow = {
  id: string;
  title: string;
  source_url: string | null;
  source_platform: string | null;
  creator: string | null;
  duration_seconds: number | null;
  status: ProcessingStatus;
  summary: string | null;
  created_at: Date | string;
};

type ProcessingJobRow = {
  id: string;
  video_id: string;
  user_id: string;
  status: ProcessingStatus;
  attempts: number;
  original_file_url: string | null;
  original_file_path: string | null;
  mime_type: string | null;
  title: string;
};

type TranscriptRow = {
  id: string;
  video_id: string;
  raw_text: string;
  language: string | null;
  duration_seconds: number | null;
  created_at: Date | string;
};

type TranscriptChunkRow = {
  id: string;
  chunk_index: number;
  start_time_seconds: number | null;
  end_time_seconds: number | null;
  text: string;
  token_count: number | null;
};

function toVideoItem(row: VideoItemRow): VideoItem {
  return {
    id: row.id,
    title: row.title,
    sourceUrl: row.source_url ?? undefined,
    sourcePlatform: row.source_platform ?? undefined,
    creator: row.creator ?? undefined,
    durationSeconds: row.duration_seconds ?? undefined,
    status: row.status,
    summary: row.summary ?? undefined,
    tags: [],
    createdAt:
      row.created_at instanceof Date ? row.created_at.toISOString() : new Date(row.created_at).toISOString()
  };
}

function toTranscriptChunk(row: TranscriptChunkRow): TranscriptChunk {
  return {
    id: row.id,
    chunkIndex: row.chunk_index,
    startTimeSeconds: row.start_time_seconds ?? undefined,
    endTimeSeconds: row.end_time_seconds ?? undefined,
    text: row.text,
    tokenCount: row.token_count ?? undefined
  };
}

function toTranscript(row: TranscriptRow, chunks: TranscriptChunk[]): Transcript {
  return {
    id: row.id,
    videoId: row.video_id,
    rawText: row.raw_text,
    language: row.language ?? undefined,
    durationSeconds: row.duration_seconds ?? undefined,
    chunks,
    createdAt:
      row.created_at instanceof Date ? row.created_at.toISOString() : new Date(row.created_at).toISOString()
  };
}

function toProcessingJob(row: ProcessingJobRow): ProcessingJob {
  return {
    id: row.id,
    videoId: row.video_id,
    userId: row.user_id,
    status: row.status,
    attempts: row.attempts,
    originalFileUrl: row.original_file_url,
    originalFilePath: row.original_file_path,
    mimeType: row.mime_type,
    title: row.title
  };
}

export async function listVideoItems(sql: Sql, userId: string) {
  const rows = (await sql.query(
    `select id, title, source_url, source_platform, creator, duration_seconds, status, summary, created_at
     from video_items
     where user_id = $1
     order by created_at desc
     limit 50`,
    [userId]
  )) as VideoItemRow[];

  return rows.map(toVideoItem);
}

export async function getVideoItemDetail(sql: Sql, userId: string, videoId: string): Promise<VideoItemDetail | null> {
  const videoRows = (await sql.query(
    `select id, title, source_url, source_platform, creator, duration_seconds, status, summary, created_at
     from video_items
     where user_id = $1 and id = $2
     limit 1`,
    [userId, videoId]
  )) as VideoItemRow[];

  if (!videoRows[0]) {
    return null;
  }

  const transcriptRows = (await sql.query(
    `select id, video_id, raw_text, language, duration_seconds, created_at
     from transcripts
     where video_id = $1
     order by created_at desc
     limit 1`,
    [videoId]
  )) as TranscriptRow[];

  if (!transcriptRows[0]) {
    return { item: toVideoItem(videoRows[0]) };
  }

  const chunkRows = (await sql.query(
    `select id, chunk_index, start_time_seconds, end_time_seconds, text, token_count
     from transcript_chunks
     where transcript_id = $1
     order by chunk_index asc`,
    [transcriptRows[0].id]
  )) as TranscriptChunkRow[];

  return {
    item: toVideoItem(videoRows[0]),
    transcript: toTranscript(transcriptRows[0], chunkRows.map(toTranscriptChunk))
  };
}

export async function createVideoCapture(sql: Sql, input: CreateVideoCaptureInput) {
  const videoRows = (await sql.query(
    `insert into video_items (
       user_id, title, source_url, source_platform, original_file_url, original_file_path,
       file_size_bytes, mime_type, status
     )
     values ($1, $2, $3, $4, $5, $6, $7, $8, 'queued')
     returning id, title, source_url, source_platform, creator, duration_seconds, status, summary, created_at`,
    [
      input.userId,
      input.title,
      input.sourceUrl ?? null,
      input.sourcePlatform ?? null,
      input.originalFileUrl ?? null,
      input.originalFilePath ?? null,
      input.fileSizeBytes ?? null,
      input.mimeType ?? null
    ]
  )) as VideoItemRow[];

  const video = toVideoItem(videoRows[0]!);

  await sql.query(
    `insert into processing_jobs (video_id, user_id, status)
     values ($1, $2, 'queued')`,
    [video.id, input.userId]
  );

  return video;
}

export async function getNextQueuedJob(sql: Sql) {
  const rows = (await sql.query(
    `with next_job as (
       select id
       from processing_jobs
       where status = 'queued'
       order by created_at asc
       limit 1
       for update skip locked
     ),
     claimed_job as (
       update processing_jobs
       set status = 'processing_audio',
         started_at = coalesce(started_at, now()),
         updated_at = now()
       where id in (select id from next_job)
       returning id, video_id, user_id, status, attempts
     )
     select
       claimed_job.id,
       claimed_job.video_id,
       claimed_job.user_id,
       claimed_job.status,
       claimed_job.attempts,
       video_items.original_file_url,
       video_items.original_file_path,
       video_items.mime_type,
       video_items.title
     from claimed_job
     join video_items on video_items.id = claimed_job.video_id`
  )) as ProcessingJobRow[];

  return rows[0] ? toProcessingJob(rows[0]) : null;
}

export async function markJobStatus(sql: Sql, jobId: string, status: ProcessingStatus, errorMessage?: string) {
  await sql.query(
    `update processing_jobs
     set status = $2,
       error_message = $3,
       attempts = attempts + case when $2 = 'failed' then 1 else 0 end,
       started_at = case when $2 in ('processing_audio', 'transcribing') then coalesce(started_at, now()) else started_at end,
       completed_at = case when $2 in ('ready', 'failed') then now() else completed_at end,
       updated_at = now()
     where id = $1`,
    [jobId, status, errorMessage ?? null]
  );
}

export async function markVideoStatus(sql: Sql, videoId: string, status: ProcessingStatus, summary?: string) {
  await sql.query(
    `update video_items
     set status = $2,
       summary = coalesce($3, summary),
       processed_at = case when $2 = 'ready' then now() else processed_at end
     where id = $1`,
    [videoId, status, summary ?? null]
  );
}

function estimateTokenCount(text: string) {
  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(wordCount * 1.3));
}

function splitTranscriptIntoChunks(text: string, maxCharacters = 3000) {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  const units = paragraphs.length > 0 ? paragraphs : [text.trim()].filter(Boolean);
  const chunks: string[] = [];
  let current = '';

  for (const unit of units) {
    if (unit.length > maxCharacters) {
      if (current) {
        chunks.push(current);
        current = '';
      }

      for (let index = 0; index < unit.length; index += maxCharacters) {
        chunks.push(unit.slice(index, index + maxCharacters).trim());
      }

      continue;
    }

    const next = current ? `${current}\n\n${unit}` : unit;
    if (next.length > maxCharacters) {
      chunks.push(current);
      current = unit;
    } else {
      current = next;
    }
  }

  if (current) {
    chunks.push(current);
  }

  return chunks.length > 0 ? chunks : [text];
}

export async function saveTranscript(sql: Sql, videoId: string, text: string, language?: string) {
  const rows = (await sql.query(
    `insert into transcripts (video_id, raw_text, language)
     values ($1, $2, $3)
     returning id`,
    [videoId, text, language ?? null]
  )) as { id: string }[];

  const transcriptId = rows[0]!.id;
  const chunks = splitTranscriptIntoChunks(text);

  for (const [index, chunkText] of chunks.entries()) {
    await sql.query(
      `insert into transcript_chunks (transcript_id, video_id, chunk_index, text, token_count)
       values ($1, $2, $3, $4, $5)`,
      [transcriptId, videoId, index, chunkText, estimateTokenCount(chunkText)]
    );
  }

  return transcriptId;
}

export const initialSchemaSql = `
create extension if not exists pgcrypto;
create extension if not exists vector;

create table if not exists video_items (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  title text not null,
  source_url text,
  source_platform text,
  creator text,
  duration_seconds integer,
  status text not null default 'queued',
  summary text,
  original_file_url text,
  original_file_path text,
  file_size_bytes integer,
  mime_type text,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create table if not exists processing_jobs (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references video_items(id) on delete cascade,
  user_id text not null,
  status text not null default 'queued',
  attempts integer not null default 0,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists transcripts (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references video_items(id) on delete cascade,
  raw_text text not null,
  language text,
  duration_seconds integer,
  created_at timestamptz not null default now()
);

create table if not exists transcript_chunks (
  id uuid primary key default gen_random_uuid(),
  transcript_id uuid not null references transcripts(id) on delete cascade,
  video_id uuid not null references video_items(id) on delete cascade,
  chunk_index integer not null,
  start_time_seconds integer,
  end_time_seconds integer,
  text text not null,
  token_count integer,
  embedding vector(1536)
);
`;
