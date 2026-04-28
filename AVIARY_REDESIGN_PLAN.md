# AVIARY Refactor and Redesign Plan

## Working Definition

AVIARY stands for **AI VIdeo librARY**.

AVIARY should become a mobile-first video knowledge capture app: a place to save useful videos, turn them into durable text and notes, and ask questions across the growing library.

The core product is not transcription by itself. Transcription is the ingestion step. The product is a portable, searchable, conversational memory layer for videos that would otherwise disappear into TikTok, YouTube, Reels, Shorts, saved folders, camera rolls, chat threads, or forgotten browser tabs.

Product sentence:

> AVIARY turns saved videos into a searchable, portable knowledge library you can chat with.

## What Exists Today

The current repository is an early scaffold, not a working version of the product.

- `README.md` defines the idea only as "AI Video Library."
- `frontend/aviary` is a Create React App project with the default React starter UI.
- `backend/aviary` is a minimal Express server with a single `GET /` route returning "Hello World!"
- `docker-compose.yaml`, `frontend/Dockerfile`, and `backend/dockerfile` are old Docker workflow artifacts.
- There is no current domain model for videos, transcripts, users, tags, embeddings, chat, exports, or processing jobs.
- There is no persistence implemented in application code.
- The PWA manifest is still the default CRA manifest.

This means the best path is a restart inside the repo, not an incremental refactor of existing application logic. The current code can be treated as disposable scaffolding.

## Product Thesis

People increasingly learn from video, especially short-form video, but platforms optimize for consumption rather than retention. Saving or liking a video is not the same as being able to retrieve, compare, summarize, cite, or reuse what was learned later.

AVIARY should solve this problem:

> I watched or saved something useful in a video. I want to keep the knowledge, find it later, and reuse it without being trapped in one platform or another subscription silo.

The durable value is:

- Capture useful video knowledge with low friction.
- Convert video into text, summaries, tags, topics, notes, and citations.
- Search and chat across the whole saved library, not just one file.
- Export the knowledge into formats the user owns.

## Initial Audience

Do not start with "everyone who watches videos." That is too broad.

Start with people who intentionally save videos because they expect to reuse the information:

- Creators doing research for posts, scripts, newsletters, podcasts, or videos.
- Students and self-directed learners who rely on YouTube, TikTok, Shorts, Reels, lectures, or tutorials.
- Coaches, consultants, educators, pastors, and teachers turning video research into lessons or client material.
- DIY, gardening, homestead, health, tech, and hobby learners with lots of practical saved videos.
- Neurodivergent users who collect useful information but struggle to retrieve it later.
- Independent researchers tracking themes, claims, advice, or trends across video sources.

The first monetizable wedge is likely **video research inbox**, not casual TikTok backup.

## Core Principles

### 1. Capture Without Ceremony

Saving a video needs to become as low-friction as possible, especially on mobile. The long-term ideal is sharing directly into AVIARY from a mobile app or browser. The MVP can accept more friction if the payoff is strong.

MVP capture methods:

- Paste a URL.
- Upload a video or audio file.
- Add source metadata manually when automatic extraction is not available.

Later capture adapters:

- Mobile share target or native wrapper.
- Browser extension.
- Obsidian plugin.
- Notion export/import helper.
- Email-to-AVIARY capture.
- Local folder watcher.
- Telegram or Discord bot.

### 2. Knowledge Should Become Portable Text

AVIARY should not become another app prison. Portability is part of the value proposition.

First-class exports:

- Markdown transcript.
- Markdown summary and notes.
- JSON export for full structured data.
- Notion-compatible Markdown or CSV.
- Obsidian-friendly folder output with tags, frontmatter, backlinks, and source links.

Later exports:

- Study guide.
- Content brief.
- Lesson outline.
- Checklist.
- Atomic notes.
- Weekly digest.
- Claim comparison.
- Topic map.

### 3. AI Should Organize and Retrieve, Not Just Summarize

Summaries are useful, but the product should be built around retrieval across time.

AVIARY should answer questions like:

- "What videos did I save about pruning fruit trees?"
- "Where did someone talk about dopamine and ADHD?"
- "Summarize the videos I uploaded last week."
- "What topics have I been saving the most?"
- "Make a study guide from my saved psychology videos."
- "Which videos mentioned potassium deficiency?"
- "What claims across these videos agree or contradict each other?"

Every answer that uses source material should cite the video and transcript timestamp or chunk.

## MVP Scope

The MVP should prove one loop:

> Upload or link a video -> process it -> save transcript and summary -> search/chat across saved videos -> export portable notes.

### Must Have

- User account.
- Mobile-first PWA shell.
- Video/audio upload.
- URL capture with manual metadata fallback.
- Processing status page or card state.
- Audio extraction when needed.
- Transcription.
- Transcript storage.
- Transcript chunking.
- Embeddings for semantic retrieval.
- Generated title, summary, tags, and topics.
- Library page with saved video cards.
- Video detail page with transcript, summary, tags, source metadata, and export actions.
- Global search across transcripts and metadata.
- Chat across the user's library with cited source chunks.
- Markdown export for transcript, summary, tags, and generated notes.

### Should Have Soon After

- Collections.
- Transcript editing.
- Better timestamp handling.
- Weekly digest from saved videos.
- Generated study guide or content brief.
- Bring-your-own-API-key mode for early users.
- Usage limits by minutes, file size, and monthly processing count.

### Not in the First Version

- Automatic TikTok downloading as a foundation.
- Graph database.
- Social features.
- Team collaboration.
- Native mobile apps.
- Full Obsidian plugin as the main product.
- Complex dashboards about every video a user watches.
- Multi-platform downloader automation that depends on browser cookies.

TikTok/Reels/Shorts support matters, but the first stable foundation should be uploaded files and user-provided links. Platform-specific importers should be adapters, not the core architecture.

## Recommended Architecture

Because Docker is no longer part of the desired workflow, the new architecture should be easy to run with normal Node tooling and managed services.

Recommended stack:

- **Frontend/PWA:** Vite + React + TypeScript.
- **PWA support:** `vite-plugin-pwa`, proper manifest, service worker, installability, offline shell.
- **API:** Node + TypeScript using a small framework such as Fastify, Hono, or Express.
- **Database:** Neon Postgres with `pgvector`.
- **Auth:** Managed auth to be chosen after the first PWA/API skeleton is stable.
- **Storage:** Vercel Blob for the first upload loop; revisit S3 or Cloudflare R2 if cost/control becomes a problem.
- **Background jobs:** Inngest, Trigger.dev, Upstash QStash, or a simple managed worker process.
- **AI APIs:** OpenAI for transcription, embeddings, and chat to start.
- **Video processing:** `ffmpeg` installed locally and available in the worker environment.
- **Deployment:** Vercel for the PWA, plus a separate worker host if long-running processing does not fit Vercel's runtime model.

The frontend and backend can live in one repo, but video processing should not happen inside a normal request/response path. Uploads should create a processing job, and the UI should show progress.

Possible repo structure:

```text
apps/
  web/               # React PWA
  api/               # HTTP API
  worker/            # Background processing jobs
packages/
  shared/            # Shared types and schemas
  ai/                # LLM, transcription, embedding helpers
  db/                # Database schema and queries
docs/
  product/           # Product docs and planning
  architecture/      # Technical design docs
```

For a smaller first pass, `apps/api` and `apps/worker` can be the same Node app with separate commands.

## Core Data Model

Start with boring relational tables. Add complexity only after the retrieval loop works.

Core entities:

- `users`
- `video_items`
- `transcripts`
- `transcript_chunks`
- `embeddings`
- `tags`
- `video_tags`
- `collections`
- `collection_items`
- `generated_outputs`
- `chat_sessions`
- `chat_messages`
- `source_citations`
- `processing_jobs`

Possible later entities:

- `notes`
- `claims`
- `entities`
- `video_entity_mentions`
- `claim_links`
- `exports`
- `integration_accounts`

Important fields for `video_items`:

- `id`
- `user_id`
- `title`
- `source_url`
- `source_platform`
- `creator`
- `duration_seconds`
- `original_file_path`
- `thumbnail_path`
- `status`
- `created_at`
- `processed_at`

Important fields for `transcript_chunks`:

- `id`
- `video_id`
- `transcript_id`
- `chunk_index`
- `start_time_seconds`
- `end_time_seconds`
- `text`
- `token_count`
- `embedding`

## Processing Pipeline

Each saved item should move through explicit statuses so the UI can be honest about what is happening.

Pipeline:

1. User uploads a file or submits a URL.
2. API creates a `video_item` and `processing_job`.
3. Worker validates file type, size, duration, and ownership.
4. Worker extracts audio if needed.
5. Worker transcribes audio.
6. Worker stores the raw transcript.
7. Worker normalizes transcript into timestamped chunks.
8. Worker generates embeddings for chunks.
9. Worker generates title, summary, tags, topics, and optional notes.
10. Worker marks the item as ready.
11. UI enables detail view, search, chat, and export.

Failure states should be saved clearly:

- `queued`
- `uploading`
- `processing_audio`
- `transcribing`
- `embedding`
- `summarizing`
- `ready`
- `failed`

## Retrieval and Chat Behavior

The chat experience should be retrieval-first.

For each user query:

1. Embed the query.
2. Retrieve matching transcript chunks for that user.
3. Optionally filter by collection, date, platform, creator, or tag.
4. Pass the selected chunks and source metadata to the LLM.
5. Generate an answer with citations.
6. Store the chat message and source citations.

The UI should make citations visible and useful. A user should be able to jump from an answer to the source video detail page and the relevant transcript section.

The model should be encouraged to say when the library does not contain enough evidence.

## UX Shape

AVIARY should feel like a mobile-first research inbox.

Primary navigation:

- **Capture:** Add a URL or upload a file.
- **Library:** Browse saved videos.
- **Search:** Find videos, transcript text, topics, creators, or tags.
- **Chat:** Ask across the library.
- **Exports:** Generate and download portable artifacts.

Important screens:

- Landing/auth screen.
- Add video screen.
- Processing queue/status screen.
- Library grid/list.
- Video detail screen.
- Transcript viewer with timestamps.
- Summary and generated notes panel.
- Global chat screen.
- Export modal.
- Settings/usage/API key screen.

Mobile priorities:

- Large touch targets.
- Paste/share/upload as the main actions.
- Clear processing status.
- Fast return to saved items.
- Readable transcript and summary layout.
- Minimal setup before first successful processed video.

Desktop priorities:

- Better review workflow.
- Side-by-side transcript and AI notes.
- Richer search/filtering.
- Bulk export.

## PWA Requirements

The PWA should not pretend to be a full native app at first, but it should be installable and pleasant on mobile.

Minimum PWA requirements:

- App manifest with AVIARY name, icons, theme color, and standalone display mode.
- Responsive mobile-first layout.
- Service worker with offline app shell.
- Graceful offline message for network-dependent features.
- Local caching for recently viewed transcript/summary pages when possible.
- Install prompt support where available.

Do not rely on PWA share target support as the MVP's only capture mechanism. Browser and OS support varies, and platform-specific behavior can become a distraction.

## Privacy, Cost, and Trust

AVIARY will handle personal viewing habits and potentially sensitive research material. Trust should be designed early.

Baseline requirements:

- User-owned private libraries by default.
- Clear deletion path for videos, transcripts, embeddings, and generated outputs.
- Do not train on user data.
- Make export easy.
- Make account deletion real.
- Use signed URLs for private media.
- Enforce row-level/user-level access rules in the database and API.

Cost controls:

- File size limits.
- Duration limits.
- Monthly transcription minute limits.
- Queue limits.
- Per-user rate limits.
- Usage tracking.
- Optional bring-your-own-API-key mode.

## Refactor Plan

### Phase 0: Archive the Old Scaffold

Goal: stop treating the 2023 scaffold as the active architecture.

Actions:

- Keep `ChatGPT-Simplify MVP Restart.md` as historical context.
- Move or replace the CRA frontend with a new React TypeScript PWA.
- Remove Docker as the supported workflow.
- Replace the placeholder Express backend with a typed API skeleton.
- Add current project documentation in `docs/`.

Deliverable:

- Repo can run locally without Docker.
- README explains what AVIARY is and how to start development.

### Phase 1: Product Skeleton

Goal: make the app shape real before building AI-heavy features.

Actions:

- Create the PWA shell.
- Add auth.
- Add database schema for users, video items, transcripts, chunks, jobs, tags, and generated outputs.
- Add library page.
- Add add-video/upload flow.
- Add processing status UI using fake or stubbed jobs.

Deliverable:

- User can sign in, add a placeholder video item, and see it in a mobile-friendly library.

### Phase 2: Real Processing Loop

Goal: process uploaded media into usable text.

Actions:

- Implement media upload to storage.
- Implement processing job creation.
- Implement worker command.
- Add ffmpeg audio extraction.
- Add transcription.
- Store transcript and chunks.
- Show transcript on video detail page.

Deliverable:

- User can upload a media file and receive a stored transcript.

### Phase 3: Knowledge Layer

Goal: turn transcripts into searchable and reusable knowledge.

Actions:

- Generate embeddings for transcript chunks.
- Add semantic search.
- Generate title, summary, tags, and topics.
- Add Markdown export.
- Add source metadata editing.

Deliverable:

- User can search saved videos and export transcript/summary/notes as Markdown.

### Phase 4: Cited Library Chat

Goal: prove the actual differentiator.

Actions:

- Add global chat UI.
- Implement retrieval-augmented answers across a user's library.
- Store chat sessions and messages.
- Store source citations.
- Let users jump from answers to transcript chunks.

Deliverable:

- User can ask questions across saved videos and get cited answers.

### Phase 5: Retention and Monetization Tests

Goal: test whether the tool creates recurring value.

Actions:

- Add collections.
- Add weekly digest.
- Add generated study guide or content brief.
- Add usage limits and billing experiments if needed.
- Add BYO API key option if cost is a concern.

Deliverable:

- AVIARY can be tested with early users as a video research inbox.

## Technical Decisions to Make Before Implementation

These should be decided explicitly before coding the new version:

- Use Vite React PWA or Next.js React PWA.
- Use Neon directly for Postgres/vector search and choose auth/storage separately.
- Use OpenAI hosted transcription first; consider local Whisper later if cost or control requires it.
- Use one Node app for API and worker initially or separate apps from day one.
- Use Prisma, Drizzle, or direct SQL migrations.
- Use hosted job orchestration or a simple worker process.
- Support BYO API key in MVP or postpone it.

Recommended first decision set:

- Vite + React + TypeScript for the PWA.
- Node + TypeScript API and worker.
- Neon Postgres for database and pgvector.
- Drizzle or Supabase SQL migrations for schema.
- OpenAI APIs for hosted transcription first, then embeddings and chat.
- Simple worker process first; upgrade to a managed job system if needed.

This keeps the app understandable, avoids Docker, and still gives a path to a real SaaS-style product.

## Success Criteria

AVIARY is working when a user can:

1. Open the app on a phone.
2. Upload a video/audio file or paste a source URL.
3. See the item process without babysitting the app.
4. Open a saved video in the library.
5. Read the transcript, summary, tags, and source metadata.
6. Search across saved videos.
7. Ask a question across the whole library.
8. Get an answer with citations back to source videos and transcript sections.
9. Export useful Markdown without lock-in.

The first version does not need to be beautiful, but it needs to make the core loop feel obviously useful.

## Positioning

Avoid:

- "AI video summarizer."
- "TikTok transcript downloader."
- "Second brain."
- "Generic AI knowledge base."

Prefer:

- "A mobile-first research inbox for videos."
- "Save useful videos. Ask questions across everything you've watched."
- "A searchable memory for educational video content."
- "Your video knowledge is yours. Capture it once. Search it here. Export it anywhere."

## Main Risks

### Ingestion Friction

If capture takes too many steps, casual users will not stick. For MVP, power-user friction is acceptable, but the capture path should improve every release.

### Platform Dependency

TikTok and other platforms can break downloader flows through cookies, rate limits, browser requirements, policy changes, and legal constraints. AVIARY should not depend on platform downloading as its foundation.

### AI and Processing Cost

Transcription, embeddings, storage, and chat can become expensive. Usage limits and processing queues are not optional if this becomes public.

### Scope Creep

The old idea naturally pulls toward note-taking, graph memory, social bookmarking, AI chat, content generation, browser extensions, mobile apps, and integrations all at once. The product should resist that.

The first durable loop is enough:

> Save video -> transcript -> knowledge objects -> search/chat -> cited export.

## Near-Term Next Steps

1. Decide whether to rebuild in place or create a new `apps/` structure beside the old scaffold.
2. Pick the first stack decision set.
3. Replace the root README with the current product definition and local dev instructions.
4. Create a schema/design doc for the MVP data model.
5. Build the PWA shell and fake library flow before connecting AI services.
6. Implement one real upload-to-transcript path.
7. Add search, then cited chat, then exports.
