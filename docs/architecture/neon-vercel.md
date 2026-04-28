# Neon and Vercel Setup

## Purpose

AVIARY will use Neon for Postgres and Vercel for the PWA deployment.

The first implementation should keep database and deployment choices simple:

- Vercel builds and serves `apps/web`.
- Neon stores video metadata, transcripts, transcript chunks, and later vector embeddings.
- API and worker code stay in the monorepo while the deployment shape is validated.

## Local Environment

Create `.env.local` from `.env.example` and set:

```text
DATABASE_URL="postgresql://USER:PASSWORD@HOST.neon.tech/aviary?sslmode=require"
OPENAI_API_KEY=""
BLOB_READ_WRITE_TOKEN=""
OPENAI_TRANSCRIPTION_MODEL="gpt-4o-mini-transcribe"
WEB_ORIGIN="http://localhost:5173"
VITE_API_URL="http://127.0.0.1:3001"
PORT="3001"
DEV_USER_ID="dev-user"
```

## Initial Schema

`packages/db/migrations/0001_initial.sql` contains a first-pass SQL migration for:

- `video_items`
- `transcripts`
- `transcript_chunks`
- `processing_jobs`
- `vector` extension

Apply it with:

```bash
npm run migrate --workspace @aviary/db
```

This is intentionally small. It gives Phase 2 enough structure for uploads, status tracking, and transcripts before adding tags, embeddings, auth-owned users, or exports.

## Vercel

The root `vercel.json` points Vercel at the PWA:

- Install: `npm install`
- Build: `npm run build --workspace @aviary/web`
- Output: `apps/web/dist`

In Vercel, set the project environment variables from `.env.example`. `DATABASE_URL` should come from Neon.

## Vercel Blob

The API uploads user media to Vercel Blob via `POST /video-items/upload`. The current implementation stores blobs as private and records the blob URL/path on `video_items`.

The worker downloads the stored blob, sends it to OpenAI transcription, stores the transcript, and marks the job/video ready.

## Open Questions

- Whether the API should deploy as Vercel serverless functions or as a separate long-running service.
- Whether the worker should stay as a manual command, move to a hosted worker, or become a managed queue consumer.
- Whether migrations should use Drizzle, Prisma, or plain SQL migration files.
