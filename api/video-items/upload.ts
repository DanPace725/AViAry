import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { getRequestUserId } from '../_auth.js';

const maxUploadSizeBytes = Number(process.env.MAX_UPLOAD_SIZE_BYTES ?? 500 * 1024 * 1024);

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json'
    }
  });
}

export const config = {
  maxDuration: 60
};

export default {
  async fetch(request: Request) {
    if (request.method === 'GET') {
      return json({
        ok: true,
        service: 'aviary-upload-token',
        blobConfigured: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
        uploadKeyConfigured: Boolean(process.env.AVIARY_UPLOAD_KEY),
        authConfigured: Boolean(process.env.NEON_AUTH_BASE_URL),
        maxUploadSizeBytes
      });
    }

    if (request.method !== 'POST') {
      return json({ message: 'Method not allowed.' }, 405);
    }

    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return json({ message: 'BLOB_READ_WRITE_TOKEN is required for uploads.' }, 503);
    }

    const auth = await getRequestUserId(request);
    if ('response' in auth) {
      return auth.response;
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
};
