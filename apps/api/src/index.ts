import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { createVideoCapture, getSql, getVideoItemDetail, listVideoItems } from '@aviary/db';
import { completeVideoUploadSchema, createVideoItemSchema, sampleVideoItems } from '@aviary/shared';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import Fastify from 'fastify';
import { config } from 'dotenv';

config({ path: ['.env.local', '.env'] });

const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? '127.0.0.1';
const devUserId = process.env.DEV_USER_ID ?? 'dev-user';
const maxUploadSizeBytes = Number(process.env.MAX_UPLOAD_SIZE_BYTES ?? 500 * 1024 * 1024);
const uploadAuthHeader = 'x-aviary-upload-key';

const app = Fastify({
  logger: true
});

await app.register(cors, {
  origin: process.env.WEB_ORIGIN ?? true
});

await app.register(multipart, {
  limits: {
    fileSize: 100 * 1024 * 1024,
    files: 1
  }
});

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

function requireUploadAuthorization(request: { headers: Record<string, string | string[] | undefined> }) {
  const expectedKey = process.env.AVIARY_UPLOAD_KEY;
  if (!expectedKey) {
    return { statusCode: 503, body: { message: 'AVIARY_UPLOAD_KEY is required before uploads can be authorized.' } };
  }

  if (request.headers[uploadAuthHeader] !== expectedKey) {
    return { statusCode: 401, body: { message: 'Upload is not authorized.' } };
  }

  return null;
}

app.get('/health', async () => ({
  ok: true,
  service: 'aviary-api',
  databaseConfigured: Boolean(process.env.DATABASE_URL),
  blobConfigured: Boolean(process.env.BLOB_READ_WRITE_TOKEN)
}));

app.get('/video-items', async () => {
  const sql = getDatabase();
  if (!sql) {
    return { items: sampleVideoItems, source: 'sample' };
  }

  const items = await listVideoItems(sql, devUserId);
  return { items, source: 'database' };
});

app.get('/video-items/:id', async (request, reply) => {
  const { id } = request.params as { id: string };
  const sql = getDatabase();

  if (!sql) {
    const item = sampleVideoItems.find((video) => video.id === id);
    if (!item) {
      return reply.code(404).send({ message: 'Video item not found.' });
    }

    return { detail: { item }, source: 'sample' };
  }

  const detail = await getVideoItemDetail(sql, devUserId, id);
  if (!detail) {
    return reply.code(404).send({ message: 'Video item not found.' });
  }

  return { detail, source: 'database' };
});

app.post('/video-items', async (request, reply) => {
  const authorizationError = requireUploadAuthorization(request);
  if (authorizationError) {
    return reply.code(authorizationError.statusCode).send(authorizationError.body);
  }

  const parsed = createVideoItemSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.code(400).send({
      message: 'Invalid video capture payload.',
      issues: parsed.error.issues
    });
  }

  const sql = requireDatabase();
  const title = parsed.data.title ?? parsed.data.sourceUrl ?? 'Untitled capture';
  const video = await createVideoCapture(sql, {
    userId: devUserId,
    title,
    sourceUrl: parsed.data.sourceUrl
  });

  return reply.code(201).send({ item: video });
});

app.post('/video-items/upload', async (request, reply) => {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return reply.code(503).send({ message: 'BLOB_READ_WRITE_TOKEN is required for uploads.' });
  }

  try {
    const response = await handleUpload({
      body: request.body as HandleUploadBody,
      request: request.raw,
      token: process.env.BLOB_READ_WRITE_TOKEN,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const authorizationError = requireUploadAuthorization(request);
        if (authorizationError) {
          throw new Error('Upload is not authorized.');
        }

        if (!pathname.startsWith('uploads/')) {
          throw new Error('Upload path is not allowed.');
        }

        return {
          allowedContentTypes: ['audio/*', 'video/*'],
          maximumSizeInBytes: maxUploadSizeBytes,
          tokenPayload: clientPayload,
          addRandomSuffix: false
        };
      }
    });

    return response;
  } catch (error) {
    return reply
      .code(400)
      .send({ message: error instanceof Error ? error.message : 'Unable to create upload token.' });
  }
});

app.post('/video-items/upload-complete', async (request, reply) => {
  const authorizationError = requireUploadAuthorization(request);
  if (authorizationError) {
    return reply.code(authorizationError.statusCode).send(authorizationError.body);
  }

  const parsed = completeVideoUploadSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.code(400).send({
      message: 'Invalid completed upload payload.',
      issues: parsed.error.issues
    });
  }

  const sql = requireDatabase();
  const video = await createVideoCapture(sql, {
    userId: devUserId,
    title: parsed.data.filename,
    originalFileUrl: parsed.data.blob.url,
    originalFilePath: parsed.data.blob.pathname,
    fileSizeBytes: parsed.data.fileSizeBytes,
    mimeType: parsed.data.mimeType ?? parsed.data.blob.contentType
  });

  return reply.code(201).send({ item: video, blob: { pathname: parsed.data.blob.pathname } });
});

try {
  await app.listen({ port, host });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
