import { getVideoDetail, json } from '../_shared.js';

function getVideoId(request: Request) {
  const pathname = new URL(request.url).pathname;
  return decodeURIComponent(pathname.split('/').filter(Boolean).at(-1) ?? '');
}

export default {
  fetch(request: Request) {
    if (request.method !== 'GET') {
      return json({ message: 'Method not allowed.' }, 405);
    }

    const videoId = getVideoId(request);
    if (!videoId) {
      return json({ message: 'Video item id is required.' }, 400);
    }

    return getVideoDetail(videoId);
  }
};
