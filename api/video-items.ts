import { createVideoItem, getVideoItems, json } from './_shared';

export default {
  fetch(request: Request) {
    if (request.method === 'GET') {
      return getVideoItems();
    }

    if (request.method === 'POST') {
      return createVideoItem(request);
    }

    return json({ message: 'Method not allowed.' }, 405);
  }
};
