import { json, uploadVideoItem } from '../_shared';

export const config = {
  maxDuration: 60
};

export default {
  fetch(request: Request) {
    if (request.method !== 'POST') {
      return json({ message: 'Method not allowed.' }, 405);
    }

    return uploadVideoItem(request);
  }
};
