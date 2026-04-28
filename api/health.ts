import { getHealth, json } from './_shared';

export default {
  fetch(request: Request) {
    if (request.method !== 'GET') {
      return json({ message: 'Method not allowed.' }, 405);
    }

    return getHealth();
  }
};
