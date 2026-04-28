# External Service Setup

AVIARY Phase 2 needs four things outside the repo:

- Neon Postgres for video metadata, jobs, transcripts, and transcript chunks.
- Vercel Blob for uploaded media files.
- OpenAI for hosted transcription.
- `ffmpeg` on the worker machine for extracting audio from video uploads.

## Local Environment File

Create `C:\Users\nscha\Coding\aviary\AViAry\.env.local` from `.env.example`.

The API, worker, and migration script load `.env.local` first, then `.env`. The web app only exposes variables prefixed with `VITE_`.

```text
DATABASE_URL="postgresql://USER:PASSWORD@HOST.neon.tech/DB?sslmode=require"
OPENAI_API_KEY="sk-..."
BLOB_READ_WRITE_TOKEN="vercel_blob_rw_..."
OPENAI_TRANSCRIPTION_MODEL="gpt-4o-mini-transcribe"
WEB_ORIGIN="http://localhost:5173"
VITE_API_URL="http://127.0.0.1:3001"
PORT="3001"
DEV_USER_ID="dev-user"
```

Do not put comments on the same line as quoted values.

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

## Vercel Blob

`BLOB_READ_WRITE_TOKEN` is a Vercel Blob store token. AVIARY needs it because uploads go from the API to Vercel Blob before the worker downloads and transcribes them.

1. In Vercel, create or open a project.
2. Go to Storage.
3. Create a Blob store.
4. Create or reveal a read/write token for that Blob store.
5. Paste it into `.env.local` as `BLOB_READ_WRITE_TOKEN`.
6. Restart the API after changing `.env.local`.

Check `http://127.0.0.1:3001/health` again. `blobConfigured` should be `true`.

If uploads return:

```json
{"message":"BLOB_READ_WRITE_TOKEN is required for uploads."}
```

the API process does not see that environment variable. Confirm it is in `.env.local`, confirm the name is exactly `BLOB_READ_WRITE_TOKEN`, and restart `npm run dev:api`.

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
