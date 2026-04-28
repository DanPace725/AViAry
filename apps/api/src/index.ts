import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { createVideoCapture, getSql, listVideoItems } from '@aviary/db';
import { createVideoItemSchema, sampleVideoItems } from '@aviary/shared';
import { put } from '@vercel/blob';
import Fastify from 'fastify';
import { randomUUID } from 'node:crypto';
import 'dotenv/config';

const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? '127.0.0.1';
const devUserId = process.env.DEV_USER_ID ?? 'dev-user';

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

function createBlobPath(filename: string) {
  const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '-').toLowerCase();
  return `uploads/${devUserId}/${randomUUID()}-${safeFilename}`;
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

app.post('/video-items', async (request, reply) => {
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

  const uploadedFile = await request.file();
  if (!uploadedFile) {
    return reply.code(400).send({ message: 'Upload a video or audio file with multipart field "file".' });
  }

  const sql = requireDatabase();
  const buffer = await uploadedFile.toBuffer();
  const blob = await put(createBlobPath(uploadedFile.filename), buffer, {
    access: 'private',
    addRandomSuffix: false,
    contentType: uploadedFile.mimetype,
    token: process.env.BLOB_READ_WRITE_TOKEN
  });

  const video = await createVideoCapture(sql, {
    userId: devUserId,
    title: uploadedFile.filename,
    originalFileUrl: blob.url,
    originalFilePath: blob.pathname,
    fileSizeBytes: buffer.byteLength,
    mimeType: uploadedFile.mimetype
  });

  return reply.code(201).send({ item: video, blob: { pathname: blob.pathname } });
});

try {
  await app.listen({ port, host });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
