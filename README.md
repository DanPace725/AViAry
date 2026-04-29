# AVIARY

AVIARY stands for **AI VIdeo librARY**.

AVIARY is being rebuilt as a mobile-first PWA that turns saved videos into a searchable, portable knowledge library. The first product loop is:

```text
Save video -> transcript -> summary/tags -> search/chat -> cited export
```

## Current Direction

- Frontend: Vite + React + TypeScript PWA in `apps/web`
- API: Node + TypeScript Fastify scaffold in `apps/api`
- Deployed API: Vercel Functions in root `api/`
- Worker: Node + TypeScript processing scaffold in `apps/worker`
- Shared contracts: `packages/shared`
- Database client/schema starter: `packages/db`
- Database: Neon Postgres with `pgvector`
- Deployment target: Vercel for the PWA

The old 2023 scaffold is preserved under `archive/`.

## Getting Started

Install dependencies:

```bash
npm install
```

Copy environment variables:

```bash
cp .env.example .env.local
```

Run the web app:

```bash
npm run dev
```

Run the API scaffold:

```bash
npm run dev:api
```

Run the worker once to process the next queued job:

```bash
npm run dev:worker
```

Apply the initial Neon schema:

```bash
npm run migrate --workspace @aviary/db
```

Build all workspaces:

```bash
npm run build
```

## Phase 2 Environment

Phase 2 uses:

- `DATABASE_URL` for Neon Postgres.
- `BLOB_READ_WRITE_TOKEN` for Vercel Blob uploads.
- `NEON_AUTH_BASE_URL` and `VITE_NEON_AUTH_URL` for Neon Auth.
- `AVIARY_UPLOAD_KEY` as a local/dev fallback when Neon Auth is not configured.
- `MAX_UPLOAD_SIZE_BYTES` and `VITE_MAX_UPLOAD_SIZE_BYTES` for large client-upload limits.
- `OPENAI_API_KEY` for hosted transcription.
- `VITE_API_URL` for the PWA to call the API during local development.
- `ffmpeg` on the worker PATH for extracting audio from uploaded video files.

In production, the web app defaults to same-origin `/api` Vercel Functions. In local development, it defaults to `http://127.0.0.1:3001` unless `VITE_API_URL` is set.

Media uploads use Vercel Blob client uploads with multipart enabled, then AVIARY records the completed blob in Neon. The first worker pass processes one queued upload at a time. URL-only captures are saved to the library, but transcription requires uploaded media until platform-specific download adapters exist. Once the worker finishes, select the capture in the web app to inspect the stored transcript chunks.

When `VITE_NEON_AUTH_URL` is set, the web app uses Neon Auth sign in/sign up and sends JWT bearer tokens to the API. When `NEON_AUTH_BASE_URL` is not set, the API falls back to the temporary `AVIARY_UPLOAD_KEY` header.

See `docs/setup/external-services.md` for Neon, Vercel Blob, OpenAI, and `ffmpeg` setup instructions.

## Planning Docs

- `AVIARY_REDESIGN_PLAN.md` contains the product and architecture plan.
- `docs/architecture/neon-vercel.md` describes the initial Neon/Vercel workflow.
- `docs/setup/external-services.md` explains the external service setup needed for Phase 2.
