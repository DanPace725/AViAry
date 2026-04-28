import { neon } from '@neondatabase/serverless';
import type { ProcessingStatus, VideoItem } from '@aviary/shared';

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
    `select
       processing_jobs.id,
       processing_jobs.video_id,
       processing_jobs.user_id,
       processing_jobs.status,
       processing_jobs.attempts,
       video_items.original_file_url,
       video_items.original_file_path,
       video_items.mime_type,
       video_items.title
     from processing_jobs
     join video_items on video_items.id = processing_jobs.video_id
     where processing_jobs.status = 'queued'
     order by processing_jobs.created_at asc
     limit 1`
  )) as ProcessingJobRow[];

  return rows[0] ? toProcessingJob(rows[0]) : null;
}

export async function markJobStatus(sql: Sql, jobId: string, status: ProcessingStatus, errorMessage?: string) {
  await sql.query(
    `update processing_jobs
     set status = $2,
       error_message = $3,
       attempts = attempts + case when $2 = 'failed' then 1 else 0 end,
       started_at = case when $2 = 'transcribing' then now() else started_at end,
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

export async function saveTranscript(sql: Sql, videoId: string, text: string, language?: string) {
  const rows = (await sql.query(
    `insert into transcripts (video_id, raw_text, language)
     values ($1, $2, $3)
     returning id`,
    [videoId, text, language ?? null]
  )) as { id: string }[];

  const transcriptId = rows[0]!.id;
  await sql.query(
    `insert into transcript_chunks (transcript_id, video_id, chunk_index, text)
     values ($1, $2, 0, $3)`,
    [transcriptId, videoId, text]
  );

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
