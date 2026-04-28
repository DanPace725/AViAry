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

create index if not exists video_items_user_created_idx on video_items (user_id, created_at desc);
create index if not exists processing_jobs_status_created_idx on processing_jobs (status, created_at);
create index if not exists transcripts_video_id_idx on transcripts (video_id);
create index if not exists transcript_chunks_video_id_idx on transcript_chunks (video_id);
