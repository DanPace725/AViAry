import { z } from 'zod';

export const processingStatuses = [
  'queued',
  'uploading',
  'processing_audio',
  'transcribing',
  'embedding',
  'summarizing',
  'ready',
  'failed'
] as const;

export const videoItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  sourceUrl: z.string().url().optional(),
  sourcePlatform: z.string().optional(),
  creator: z.string().optional(),
  durationSeconds: z.number().int().positive().optional(),
  status: z.enum(processingStatuses),
  summary: z.string().optional(),
  tags: z.array(z.string()).default([]),
  createdAt: z.string()
});

export const createVideoItemSchema = z.object({
  sourceUrl: z.string().url().optional(),
  title: z.string().min(1).max(160).optional(),
  notes: z.string().max(2000).optional()
});

export type ProcessingStatus = (typeof processingStatuses)[number];
export type VideoItem = z.infer<typeof videoItemSchema>;
export type CreateVideoItemInput = z.infer<typeof createVideoItemSchema>;

export const sampleVideoItems: VideoItem[] = [
  {
    id: 'demo-adhd',
    title: 'ADHD dopamine and task initiation',
    sourceUrl: 'https://example.com/videos/adhd-dopamine',
    sourcePlatform: 'TikTok',
    creator: 'saved research',
    durationSeconds: 92,
    status: 'ready',
    summary:
      'A short explanation of why task initiation can feel harder when motivation depends on urgency or novelty.',
    tags: ['ADHD', 'productivity', 'dopamine'],
    createdAt: '2026-04-27T20:00:00.000Z'
  },
  {
    id: 'demo-garden',
    title: 'Raised bed soil mix basics',
    sourceUrl: 'https://example.com/videos/raised-bed-soil',
    sourcePlatform: 'YouTube Shorts',
    creator: 'saved research',
    durationSeconds: 58,
    status: 'summarizing',
    summary: 'Transcript is ready. AVIARY is extracting reusable notes and tags.',
    tags: ['gardening', 'soil', 'DIY'],
    createdAt: '2026-04-27T20:10:00.000Z'
  },
  {
    id: 'demo-inbox',
    title: 'Paste a link or upload a file',
    status: 'queued',
    summary: 'New captures appear here while the worker processes transcription and enrichment.',
    tags: ['inbox'],
    createdAt: '2026-04-27T20:15:00.000Z'
  }
];
