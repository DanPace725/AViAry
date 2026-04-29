import { useEffect, useMemo, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { sampleVideoItems, type ProcessingStatus, type VideoItem, type VideoItemDetail } from '@aviary/shared';
import { upload } from '@vercel/blob/client';

const apiBaseUrl =
  import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? 'http://127.0.0.1:3001' : '/api');
const maxUploadSizeBytes = Number(import.meta.env.VITE_MAX_UPLOAD_SIZE_BYTES ?? 500 * 1024 * 1024);
const uploadKeyStorageKey = 'aviary-upload-key';

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

function createUploadPath(filename: string) {
  const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '-').toLowerCase();
  const id = crypto.randomUUID();
  return `uploads/${id}-${safeFilename}`;
}

function formatFileSize(bytes: number) {
  const megabytes = bytes / (1024 * 1024);
  return `${megabytes.toFixed(megabytes >= 10 ? 0 : 1)} MB`;
}

function VideoCard({
  video,
  isSelected,
  onOpen
}: {
  video: VideoItem;
  isSelected: boolean;
  onOpen: () => void;
}) {
  return (
    <article className={`video-card${isSelected ? ' video-card--selected' : ''}`}>
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
      <button className="card-action" type="button" onClick={onOpen}>
        View transcript
      </button>
    </article>
  );
}

function TranscriptDetail({
  detail,
  isLoading,
  message
}: {
  detail?: VideoItemDetail;
  isLoading: boolean;
  message: string;
}) {
  const transcript = detail?.transcript;

  return (
    <section className="section-block transcript-panel" aria-labelledby="transcript-heading">
      <div className="section-block__header">
        <div>
          <p className="eyebrow">Phase 2 loop</p>
          <h2 id="transcript-heading">Transcript detail</h2>
        </div>
        {detail ? <span className={`status-pill status-pill--${detail.item.status}`}>{statusLabels[detail.item.status]}</span> : null}
      </div>

      {isLoading ? <p>Loading transcript...</p> : null}
      {!isLoading && !detail ? <p>{message}</p> : null}
      {!isLoading && detail ? (
        <div className="transcript-layout">
          <aside className="transcript-summary">
            <h3>{detail.item.title}</h3>
            <p>{detail.item.summary ?? 'AVIARY has not generated a summary for this capture yet.'}</p>
            {detail.item.sourceUrl ? (
              <a href={detail.item.sourceUrl} target="_blank" rel="noreferrer">
                Open source
              </a>
            ) : null}
          </aside>
          <div className="transcript-body">
            {transcript ? (
              transcript.chunks.map((chunk) => (
                <article className="transcript-chunk" key={chunk.id}>
                  <div className="transcript-chunk__meta">
                    <span>Chunk {chunk.chunkIndex + 1}</span>
                    {chunk.tokenCount ? <span>{chunk.tokenCount} est. tokens</span> : null}
                  </div>
                  <p>{chunk.text}</p>
                </article>
              ))
            ) : (
              <p>
                No transcript is stored for this item yet. Upload media, run the worker, then refresh the
                capture when processing is ready.
              </p>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function App() {
  const [items, setItems] = useState<VideoItem[]>(sampleVideoItems);
  const [selectedVideoId, setSelectedVideoId] = useState<string>();
  const [detail, setDetail] = useState<VideoItemDetail>();
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [detailMessage, setDetailMessage] = useState('Select a capture to inspect its stored transcript.');
  const [sourceUrl, setSourceUrl] = useState('');
  const [uploadKey, setUploadKey] = useState(() => localStorage.getItem(uploadKeyStorageKey) ?? '');
  const [message, setMessage] = useState('Paste a link or upload media to create a queued item.');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number>();
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

  async function refreshDetail(videoId: string) {
    setIsDetailLoading(true);

    try {
      const response = await fetch(`${hasConfiguredApi}/video-items/${videoId}`);
      if (!response.ok) {
        throw new Error('Unable to load transcript detail.');
      }

      const data = (await response.json()) as { detail: VideoItemDetail; source: 'sample' | 'database' };
      setDetail(data.detail);
      setDetailMessage(
        data.detail.transcript
          ? 'Transcript loaded.'
          : data.source === 'sample'
            ? 'Sample captures do not have stored transcripts.'
            : 'This capture does not have a stored transcript yet.'
      );
    } catch (error) {
      setDetail(undefined);
      setDetailMessage(error instanceof Error ? error.message : 'Unable to load transcript detail.');
    } finally {
      setIsDetailLoading(false);
    }
  }

  useEffect(() => {
    refreshItems().catch((error: unknown) => {
      const errorMessage = error instanceof Error ? error.message : 'Unable to reach the API.';
      setMessage(errorMessage);
    });
  }, []);

  useEffect(() => {
    if (selectedVideoId) {
      refreshDetail(selectedVideoId);
    }
  }, [selectedVideoId]);

  async function handleUrlCapture(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);

    try {
      if (!uploadKey) {
        throw new Error('Enter the alpha upload key before saving captures.');
      }

      localStorage.setItem(uploadKeyStorageKey, uploadKey);
      const response = await fetch(`${hasConfiguredApi}/video-items`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-aviary-upload-key': uploadKey
        },
        body: JSON.stringify({ sourceUrl })
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const data = (await response.json()) as { item: VideoItem };
      setSourceUrl('');
      setMessage('Link captured. The worker will need uploaded media before transcription can run.');
      await refreshItems();
      setSelectedVideoId(data.item.id);
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
    setUploadProgress(0);

    try {
      if (!uploadKey) {
        throw new Error('Enter the alpha upload key before uploading media.');
      }

      if (file.size > maxUploadSizeBytes) {
        throw new Error(`Upload is too large. Maximum size is ${formatFileSize(maxUploadSizeBytes)}.`);
      }

      localStorage.setItem(uploadKeyStorageKey, uploadKey);
      const blob = await upload(createUploadPath(file.name), file, {
        access: 'private',
        contentType: file.type,
        handleUploadUrl: `${hasConfiguredApi}/video-items/upload`,
        headers: {
          'x-aviary-upload-key': uploadKey
        },
        multipart: true,
        clientPayload: JSON.stringify({
          filename: file.name,
          fileSizeBytes: file.size,
          mimeType: file.type
        }),
        onUploadProgress: ({ percentage }) => {
          setUploadProgress(percentage);
          setMessage(`Uploading ${file.name}: ${Math.round(percentage)}%`);
        }
      });

      const response = await fetch(`${hasConfiguredApi}/video-items/upload-complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-aviary-upload-key': uploadKey
        },
        body: JSON.stringify({
          blob,
          filename: file.name,
          fileSizeBytes: file.size,
          mimeType: file.type
        })
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const data = (await response.json()) as { item: VideoItem };
      setMessage('Upload saved to Vercel Blob and queued for transcription.');
      await refreshItems();
      setSelectedVideoId(data.item.id);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to upload media.');
    } finally {
      event.target.value = '';
      setUploadProgress(undefined);
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
          <label htmlFor="upload-key">Alpha upload key</label>
          <input
            id="upload-key"
            type="password"
            value={uploadKey}
            onChange={(event) => setUploadKey(event.target.value)}
            placeholder="Required for uploads"
            autoComplete="off"
          />
          <p className="capture-message" role="status">
            {message}
          </p>
          {uploadProgress !== undefined ? (
            <div className="progress-bar" aria-label="Upload progress">
              <span style={{ width: `${uploadProgress}%` }} />
            </div>
          ) : null}
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
            <VideoCard
              key={video.id}
              video={video}
              isSelected={video.id === selectedVideoId}
              onOpen={() => setSelectedVideoId(video.id)}
            />
          ))}
        </div>
      </section>

      <TranscriptDetail detail={detail} isLoading={isDetailLoading} message={detailMessage} />

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
