import { createVideoCapture, getSql, getVideoItemDetail, listVideoItems } from '@aviary/db';
import { createVideoItemSchema, sampleVideoItems } from '@aviary/shared';
import { put } from '@vercel/blob';
import { randomUUID } from 'node:crypto';

const devUserId = process.env.DEV_USER_ID ?? 'dev-user';

export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json'
    }
  });
}

function getDatabase() {
  return process.env.DATABASE_URL ? getSql() : null;
}

function requireDatabase() {
  const sql = getDatabase();
  if (!sql) {
    throw new Error('DATABASE_URL is required for capture endpoints.');
  }

  return sql;
}

function createBlobPath(filename: string) {
  const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '-').toLowerCase();
  return `uploads/${devUserId}/${randomUUID()}-${safeFilename}`;
}

export function getHealth() {
  return json({
    ok: true,
    service: 'aviary-vercel-api',
    databaseConfigured: Boolean(process.env.DATABASE_URL),
    blobConfigured: Boolean(process.env.BLOB_READ_WRITE_TOKEN)
  });
}

export async function getVideoItems() {
  const sql = getDatabase();
  if (!sql) {
    return json({ items: sampleVideoItems, source: 'sample' });
  }

  const items = await listVideoItems(sql, devUserId);
  return json({ items, source: 'database' });
}

export async function createVideoItem(request: Request) {
  const parsed = createVideoItemSchema.safeParse(await request.json());
  if (!parsed.success) {
    return json(
      {
        message: 'Invalid video capture payload.',
        issues: parsed.error.issues
      },
      400
    );
  }

  const sql = requireDatabase();
  const title = parsed.data.title ?? parsed.data.sourceUrl ?? 'Untitled capture';
  const video = await createVideoCapture(sql, {
    userId: devUserId,
    title,
    sourceUrl: parsed.data.sourceUrl
  });

  return json({ item: video }, 201);
}

export async function getVideoDetail(videoId: string) {
  const sql = getDatabase();

  if (!sql) {
    const item = sampleVideoItems.find((video) => video.id === videoId);
    if (!item) {
      return json({ message: 'Video item not found.' }, 404);
    }

    return json({ detail: { item }, source: 'sample' });
  }

  const detail = await getVideoItemDetail(sql, devUserId, videoId);
  if (!detail) {
    return json({ message: 'Video item not found.' }, 404);
  }

  return json({ detail, source: 'database' });
}

export async function uploadVideoItem(request: Request) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return json({ message: 'BLOB_READ_WRITE_TOKEN is required for uploads.' }, 503);
  }

  const formData = await request.formData();
  const uploadedFile = formData.get('file');

  if (!(uploadedFile instanceof File)) {
    return json({ message: 'Upload a video or audio file with multipart field "file".' }, 400);
  }

  const sql = requireDatabase();
  const buffer = Buffer.from(await uploadedFile.arrayBuffer());
  const blob = await put(createBlobPath(uploadedFile.name), buffer, {
    access: 'private',
    addRandomSuffix: false,
    contentType: uploadedFile.type,
    token: process.env.BLOB_READ_WRITE_TOKEN
  });

  const video = await createVideoCapture(sql, {
    userId: devUserId,
    title: uploadedFile.name,
    originalFileUrl: blob.url,
    originalFilePath: blob.pathname,
    fileSizeBytes: buffer.byteLength,
    mimeType: uploadedFile.type
  });

  return json({ item: video, blob: { pathname: blob.pathname } }, 201);
}
