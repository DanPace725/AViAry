import { getHealth, json } from './_shared.js';

export default {
  fetch(request: Request) {
    if (request.method !== 'GET') {
      return json({ message: 'Method not allowed.' }, 405);
    }

    return getHealth();
  }
};
