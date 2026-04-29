import { createRemoteJWKSet, jwtVerify } from 'jose';

const uploadAuthHeader = 'x-aviary-upload-key';
let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;

type AuthFailure = {
  response: Response;
};

type AuthSuccess = {
  userId: string;
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json'
    }
  });
}

function getJwks() {
  const authBaseUrl = process.env.NEON_AUTH_BASE_URL;
  if (!authBaseUrl) {
    throw new Error('NEON_AUTH_BASE_URL is required for Neon Auth.');
  }

  jwks ??= createRemoteJWKSet(new URL(`${authBaseUrl.replace(/\/$/, '')}/.well-known/jwks.json`));
  return jwks;
}

function getAuthOrigin() {
  const authBaseUrl = process.env.NEON_AUTH_BASE_URL;
  if (!authBaseUrl) {
    throw new Error('NEON_AUTH_BASE_URL is required for Neon Auth.');
  }

  return new URL(authBaseUrl).origin;
}

function getBearerToken(request: Request) {
  const header = request.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) {
    return null;
  }

  return header.slice('Bearer '.length).trim();
}

function getFallbackUserId(request: Request) {
  const expectedKey = process.env.AVIARY_UPLOAD_KEY;
  if (!expectedKey) {
    return {
      response: json({ message: 'NEON_AUTH_BASE_URL or AVIARY_UPLOAD_KEY is required for authorized requests.' }, 503)
    };
  }

  if (request.headers.get(uploadAuthHeader) !== expectedKey) {
    return { response: json({ message: 'Request is not authorized.' }, 401) };
  }

  return { userId: process.env.DEV_USER_ID ?? 'dev-user' };
}

export async function getRequestUserId(request: Request): Promise<AuthFailure | AuthSuccess> {
  if (!process.env.NEON_AUTH_BASE_URL) {
    return getFallbackUserId(request);
  }

  const token = getBearerToken(request);
  if (!token) {
    return { response: json({ message: 'Sign in before continuing.' }, 401) };
  }

  try {
    const { payload } = await jwtVerify(token, getJwks(), {
      issuer: getAuthOrigin()
    });
    const userId = typeof payload.sub === 'string' ? payload.sub : undefined;

    if (!userId) {
      return { response: json({ message: 'Authenticated token is missing a user id.' }, 401) };
    }

    return { userId };
  } catch {
    return { response: json({ message: 'Authentication token is invalid or expired.' }, 401) };
  }
}
