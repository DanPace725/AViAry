import { completeVideoUpload, json } from '../_shared.js';

export default {
  async fetch(request: Request) {
    if (request.method === 'GET') {
      return json({
        ok: true,
        service: 'aviary-upload-complete',
        databaseConfigured: Boolean(process.env.DATABASE_URL),
        uploadKeyConfigured: Boolean(process.env.AVIARY_UPLOAD_KEY)
      });
    }

    if (request.method !== 'POST') {
      return json({ message: 'Method not allowed.' }, 405);
    }

    try {
      return await completeVideoUpload(request);
    } catch (error) {
      return json(
        {
          message: error instanceof Error ? error.message : 'Unable to complete upload.'
        },
        500
      );
    }
  }
};
