import { completeVideoUpload, json } from '../_shared.js';

export default {
  fetch(request: Request) {
    if (request.method !== 'POST') {
      return json({ message: 'Method not allowed.' }, 405);
    }

    return completeVideoUpload(request);
  }
};
