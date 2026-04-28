import { useEffect, useMemo, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { sampleVideoItems, type ProcessingStatus, type VideoItem } from '@aviary/shared';

const apiBaseUrl = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:3001';

const statusLabels: Record<ProcessingStatus, string> = {
  queued: 'Queued',
  uploading: 'Uploading',
  processing_audio: 'Processing audio',
  transcribing: 'Transcribing',
  embedding: 'Indexing',
  summarizing: 'Summarizing',
  ready: 'Ready',
  failed: 'Failed'
};

const statusSteps: ProcessingStatus[] = [
  'queued',
  'uploading',
  'processing_audio',
  'transcribing',
  'embedding',
  'summarizing',
  'ready'
];

function getProgress(status: ProcessingStatus) {
  if (status === 'failed') {
    return 100;
  }

  const index = statusSteps.indexOf(status);
  return Math.max(12, Math.round(((index + 1) / statusSteps.length) * 100));
}

function formatDuration(seconds?: number) {
  if (!seconds) {
    return 'Pending';
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

function VideoCard({ video }: { video: VideoItem }) {
  return (
    <article className="video-card">
      <div className="video-card__header">
        <span className={`status-pill status-pill--${video.status}`}>{statusLabels[video.status]}</span>
        <span>{formatDuration(video.durationSeconds)}</span>
      </div>
      <h3>{video.title}</h3>
      <p>{video.summary}</p>
      <div className="tag-list" aria-label={`Tags for ${video.title}`}>
        {video.tags.map((tag) => (
          <span key={tag}>#{tag}</span>
        ))}
      </div>
      <div className="progress-bar" aria-label={`${statusLabels[video.status]} progress`}>
        <span style={{ width: `${getProgress(video.status)}%` }} />
      </div>
    </article>
  );
}

function App() {
  const [items, setItems] = useState<VideoItem[]>(sampleVideoItems);
  const [sourceUrl, setSourceUrl] = useState('');
  const [message, setMessage] = useState('Paste a link or upload media to create a queued item.');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const hasConfiguredApi = useMemo(() => apiBaseUrl.replace(/\/$/, ''), []);

  async function refreshItems() {
    const response = await fetch(`${hasConfiguredApi}/video-items`);
    if (!response.ok) {
      throw new Error('Unable to load video items.');
    }

    const data = (await response.json()) as { items: VideoItem[]; source: 'sample' | 'database' };
    setItems(data.items);
    setMessage(
      data.source === 'sample'
        ? 'Showing sample items until DATABASE_URL is configured for the API.'
        : 'Loaded your latest captures from Neon.'
    );
  }

  useEffect(() => {
    refreshItems().catch((error: unknown) => {
      const errorMessage = error instanceof Error ? error.message : 'Unable to reach the API.';
      setMessage(errorMessage);
    });
  }, []);

  async function handleUrlCapture(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);

    try {
      const response = await fetch(`${hasConfiguredApi}/video-items`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ sourceUrl })
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      setSourceUrl('');
      setMessage('Link captured. The worker will need uploaded media before transcription can run.');
      await refreshItems();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to capture link.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleFileUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setIsSubmitting(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch(`${hasConfiguredApi}/video-items/upload`, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      setMessage('Upload saved to Vercel Blob and queued for transcription.');
      await refreshItems();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to upload media.');
    } finally {
      event.target.value = '';
      setIsSubmitting(false);
    }
  }

  return (
    <main className="app-shell">
      <section className="hero-card">
        <p className="eyebrow">AI VIdeo librARY</p>
        <h1>Turn saved videos into searchable, portable knowledge.</h1>
        <p className="hero-card__lede">
          AVIARY is starting as a mobile-first PWA for capturing videos, generating transcripts,
          and building a library you can search, export, and eventually chat with.
        </p>
        <form className="capture-panel" aria-label="Capture a video" onSubmit={handleUrlCapture}>
          <label htmlFor="video-source">Paste a video link</label>
          <div className="capture-panel__row">
            <input
              id="video-source"
              type="url"
              value={sourceUrl}
              onChange={(event) => setSourceUrl(event.target.value)}
              placeholder="https://www.tiktok.com/@creator/video/..."
            />
            <button type="submit" disabled={isSubmitting || !sourceUrl}>
              Save
            </button>
          </div>
          <label className="secondary-action" htmlFor="media-upload">
            Upload video or audio
          </label>
          <input
            className="file-input"
            id="media-upload"
            type="file"
            accept="audio/*,video/*"
            onChange={handleFileUpload}
            disabled={isSubmitting}
          />
          <p className="capture-message" role="status">
            {message}
          </p>
        </form>
      </section>

      <section className="section-block" aria-labelledby="library-heading">
        <div className="section-block__header">
          <div>
            <p className="eyebrow">Phase 1 skeleton</p>
            <h2 id="library-heading">Research inbox</h2>
          </div>
          <a href="#chat-preview">Preview chat</a>
        </div>
        <div className="video-grid">
          {items.map((video) => (
            <VideoCard key={video.id} video={video} />
          ))}
        </div>
      </section>

      <section className="section-block two-column" id="chat-preview">
        <div>
          <p className="eyebrow">Coming next</p>
          <h2>Cited library chat</h2>
          <p>
            The API and worker skeletons are in place for the real processing loop. The first
            implementation target is upload to transcript, then semantic search, then cited answers.
          </p>
        </div>
        <div className="chat-card">
          <p className="chat-card__question">What did I save this week about ADHD productivity?</p>
          <p>
            AVIARY will retrieve transcript chunks from your saved videos, answer with citations,
            and link back to the original source and timestamp.
          </p>
        </div>
      </section>
    </main>
  );
}

export default App;
