import { createVideoCapture, getSql, getVideoItemDetail, listVideoItems } from '@aviary/db';
import { completeVideoUploadSchema, createVideoItemSchema, sampleVideoItems } from '@aviary/shared';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { getRequestUserId } from './_auth.js';

const maxUploadSizeBytes = Number(process.env.MAX_UPLOAD_SIZE_BYTES ?? 500 * 1024 * 1024);

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

export function getHealth() {
  return json({
    ok: true,
    service: 'aviary-vercel-api',
    databaseConfigured: Boolean(process.env.DATABASE_URL),
    blobConfigured: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
    authConfigured: Boolean(process.env.NEON_AUTH_BASE_URL)
  });
}

export async function getVideoItems(request: Request) {
  const auth = await getRequestUserId(request);
  if ('response' in auth) {
    return auth.response;
  }

  const sql = getDatabase();
  if (!sql) {
    return json({ items: sampleVideoItems, source: 'sample' });
  }

  const items = await listVideoItems(sql, auth.userId);
  return json({ items, source: 'database' });
}

export async function createVideoItem(request: Request) {
  const auth = await getRequestUserId(request);
  if ('response' in auth) {
    return auth.response;
  }

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
    userId: auth.userId,
    title,
    sourceUrl: parsed.data.sourceUrl
  });

  return json({ item: video }, 201);
}

export async function getVideoDetail(request: Request, videoId: string) {
  const auth = await getRequestUserId(request);
  if ('response' in auth) {
    return auth.response;
  }

  const sql = getDatabase();

  if (!sql) {
    const item = sampleVideoItems.find((video) => video.id === videoId);
    if (!item) {
      return json({ message: 'Video item not found.' }, 404);
    }

    return json({ detail: { item }, source: 'sample' });
  }

  const detail = await getVideoItemDetail(sql, auth.userId, videoId);
  if (!detail) {
    return json({ message: 'Video item not found.' }, 404);
  }

  return json({ detail, source: 'database' });
}

export async function createVideoUploadToken(request: Request) {
  const auth = await getRequestUserId(request);
  if ('response' in auth) {
    return auth.response;
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return json({ message: 'BLOB_READ_WRITE_TOKEN is required for uploads.' }, 503);
  }

  try {
    const body = (await request.json()) as HandleUploadBody;
    const response = await handleUpload({
      body,
      request,
      token: process.env.BLOB_READ_WRITE_TOKEN,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        if (!pathname.startsWith('uploads/')) {
          throw new Error('Upload path is not allowed.');
        }

        return {
          allowedContentTypes: ['audio/*', 'video/*'],
          maximumSizeInBytes: maxUploadSizeBytes,
          tokenPayload: clientPayload ?? auth.userId,
          addRandomSuffix: false
        };
      }
    });

    return json(response);
  } catch (error) {
    return json({ message: error instanceof Error ? error.message : 'Unable to create upload token.' }, 400);
  }
}

export async function completeVideoUpload(request: Request) {
  const auth = await getRequestUserId(request);
  if ('response' in auth) {
    return auth.response;
  }

  const parsed = completeVideoUploadSchema.safeParse(await request.json());
  if (!parsed.success) {
    return json(
      {
        message: 'Invalid completed upload payload.',
        issues: parsed.error.issues
      },
      400
    );
  }

  const sql = requireDatabase();
  const video = await createVideoCapture(sql, {
    userId: auth.userId,
    title: parsed.data.filename,
    originalFileUrl: parsed.data.blob.url,
    originalFilePath: parsed.data.blob.pathname,
    fileSizeBytes: parsed.data.fileSizeBytes,
    mimeType: parsed.data.mimeType ?? parsed.data.blob.contentType
  });

  return json({ item: video, blob: { pathname: parsed.data.blob.pathname } }, 201);
}
