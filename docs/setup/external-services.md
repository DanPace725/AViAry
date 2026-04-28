# External Service Setup

AVIARY Phase 2 needs four things outside the repo:

- Neon Postgres for video metadata, jobs, transcripts, and transcript chunks.
- Vercel Blob for uploaded media files.
- OpenAI for hosted transcription.
- `ffmpeg` on the worker machine for extracting audio from video uploads.

The Vercel deployment now serves two pieces from the same project:

- `apps/web` builds the Vite PWA.
- root `api/` contains Vercel Functions for health checks, captures, library reads, and uploads.

That means the deployed web app should call same-origin API routes like `/api/health` and `/api/video-items`.

## Local Environment File

Create `C:\Users\nscha\Coding\aviary\AViAry\.env.local` from `.env.example`.

The API, worker, and migration script load `.env.local` first, then `.env`. The web app only exposes variables prefixed with `VITE_`.

```text
DATABASE_URL="postgresql://USER:PASSWORD@HOST.neon.tech/DB?sslmode=require"
OPENAI_API_KEY="sk-..."
BLOB_READ_WRITE_TOKEN="vercel_blob_rw_..."
MAX_UPLOAD_SIZE_BYTES="524288000"
VITE_MAX_UPLOAD_SIZE_BYTES="524288000"
OPENAI_TRANSCRIPTION_MODEL="gpt-4o-mini-transcribe"
WEB_ORIGIN="http://localhost:5173"
VITE_API_URL="http://127.0.0.1:3001"
PORT="3001"
DEV_USER_ID="dev-user"
```

Do not put comments on the same line as quoted values.

For Vercel production, set `DATABASE_URL`, `BLOB_READ_WRITE_TOKEN`, `OPENAI_API_KEY`, `OPENAI_TRANSCRIPTION_MODEL`, and `DEV_USER_ID` in the Vercel Project Environment Variables. You usually do not need to set `VITE_API_URL` in Vercel because production defaults to same-origin `/api`.

`MAX_UPLOAD_SIZE_BYTES` controls the server-side Blob client upload token limit. `VITE_MAX_UPLOAD_SIZE_BYTES` keeps the browser validation message in sync.

## Neon

1. In Neon, create or open the project.
2. Open the dashboard connection details.
3. Copy the Postgres connection string for the database you want AVIARY to use.
4. Paste it into `.env.local` as `DATABASE_URL`.
5. Make sure it includes `sslmode=require`.
6. Apply the AVIARY schema:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' run migrate --workspace @aviary/db
```

Then start the API:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' run dev:api
```

Check:

```text
http://127.0.0.1:3001/health
```

`databaseConfigured` should be `true`.

If the app still shows sample items, the API probably did not load `DATABASE_URL`, the API was not restarted after editing `.env.local`, or the web app is pointed at the wrong API URL.

On Vercel, check:

```text
https://YOUR_DEPLOYMENT_URL/api/health
```

`databaseConfigured` should be `true`. If it is `false`, add `DATABASE_URL` to the Vercel project's Environment Variables and redeploy.

## Vercel Blob

`BLOB_READ_WRITE_TOKEN` is a Vercel Blob store token. AVIARY needs it because uploads go directly from the browser to Vercel Blob, then the API records the completed blob in Neon before the worker downloads and transcribes it.

1. In Vercel, create or open a project.
2. Go to Storage.
3. Create a Blob store.
4. Create or reveal a read/write token for that Blob store.
5. Paste it into `.env.local` as `BLOB_READ_WRITE_TOKEN`.
6. Restart the API after changing `.env.local`.

Check `http://127.0.0.1:3001/health` again. `blobConfigured` should be `true`.

On Vercel, check `https://YOUR_DEPLOYMENT_URL/api/health`. `blobConfigured` should be `true`.

The upload flow uses:

- `POST /api/video-items/upload` to generate a constrained client upload token.
- Browser multipart upload directly to Vercel Blob.
- `POST /api/video-items/upload-complete` to create the Neon `video_items` and `processing_jobs` rows.

If uploads return:

```json
{"message":"BLOB_READ_WRITE_TOKEN is required for uploads."}
```

the API process does not see that environment variable. Confirm it is in `.env.local`, confirm the name is exactly `BLOB_READ_WRITE_TOKEN`, and restart `npm run dev:api`.

If this happens on Vercel, the Vercel Function does not see `BLOB_READ_WRITE_TOKEN`. Confirm it is set for the correct Vercel environment, usually both Preview and Production while testing, then redeploy.

## OpenAI

The worker uses `OPENAI_API_KEY` for transcription.

1. Create an API key in the OpenAI dashboard.
2. Paste it into `.env.local` as `OPENAI_API_KEY`.
3. Keep `OPENAI_TRANSCRIPTION_MODEL="gpt-4o-mini-transcribe"` unless changing models intentionally.
4. Restart the worker after changing `.env.local`.

Run one worker pass:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' run dev:worker
```

## ffmpeg

The worker calls `ffmpeg` when the uploaded file is a video. Audio-only uploads can skip extraction, but Phase 2 video uploads need `ffmpeg` available on PATH.

Check:

```powershell
ffmpeg -version
```

If PowerShell cannot find `ffmpeg`, install it and restart the terminal before running the worker.

## Phase 2 Local Loop

Use three terminals:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' run dev:api
```

```powershell
& 'C:\Program Files\nodejs\npm.cmd' run dev
```

```powershell
& 'C:\Program Files\nodejs\npm.cmd' run dev:worker
```

Then:

1. Open the web app, usually `http://localhost:5173`.
2. Upload a short audio or video file.
3. Run the worker once.
4. Select the capture in the library.
5. Confirm transcript chunks appear in the transcript detail panel.

## Phase 2 Deployed Loop

For a deployed Vercel test:

1. In Vercel Project Settings, set Framework Preset to `Vite`.
2. Keep Root Directory as the repo root.
3. Use build command `npm run build --workspace @aviary/web`.
4. Use output directory `apps/web/dist`.
5. Add environment variables in Vercel:
   - `DATABASE_URL`
   - `BLOB_READ_WRITE_TOKEN`
   - `MAX_UPLOAD_SIZE_BYTES`
   - `VITE_MAX_UPLOAD_SIZE_BYTES`
   - `OPENAI_API_KEY`
   - `OPENAI_TRANSCRIPTION_MODEL`
   - `DEV_USER_ID`
6. Do not set `VITE_API_URL` unless using a separately deployed API host.
7. Redeploy.
8. Visit `/api/health` on the deployment and confirm both `databaseConfigured` and `blobConfigured` are `true`.

Uploads create queued jobs in Neon. The current worker still runs separately, so transcription will not complete until the worker runs with the same `DATABASE_URL`, `BLOB_READ_WRITE_TOKEN`, `OPENAI_API_KEY`, and `ffmpeg` available.
