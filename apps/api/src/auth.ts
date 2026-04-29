import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { IncomingHttpHeaders } from 'node:http';

const uploadAuthHeader = 'x-aviary-upload-key';
let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;

type AuthFailure = {
  statusCode: number;
  body: { message: string };
};

type AuthSuccess = {
  userId: string;
};

function getFirstHeader(headers: IncomingHttpHeaders, name: string) {
  const value = headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
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

function getBearerToken(headers: IncomingHttpHeaders) {
  const header = getFirstHeader(headers, 'authorization');
  if (!header?.startsWith('Bearer ')) {
    return null;
  }

  return header.slice('Bearer '.length).trim();
}

function getFallbackUserId(headers: IncomingHttpHeaders) {
  const expectedKey = process.env.AVIARY_UPLOAD_KEY;
  if (!expectedKey) {
    return {
      statusCode: 503,
      body: { message: 'NEON_AUTH_BASE_URL or AVIARY_UPLOAD_KEY is required for authorized requests.' }
    };
  }

  if (getFirstHeader(headers, uploadAuthHeader) !== expectedKey) {
    return { statusCode: 401, body: { message: 'Request is not authorized.' } };
  }

  return { userId: process.env.DEV_USER_ID ?? 'dev-user' };
}

export async function getRequestUserId(headers: IncomingHttpHeaders): Promise<AuthFailure | AuthSuccess> {
  if (!process.env.NEON_AUTH_BASE_URL) {
    return getFallbackUserId(headers);
  }

  const token = getBearerToken(headers);
  if (!token) {
    return { statusCode: 401, body: { message: 'Sign in before continuing.' } };
  }

  try {
    const { payload } = await jwtVerify(token, getJwks(), { issuer: getAuthOrigin() });
    const userId = typeof payload.sub === 'string' ? payload.sub : undefined;
    if (!userId) {
      return { statusCode: 401, body: { message: 'Authenticated token is missing a user id.' } };
    }

    return { userId };
  } catch {
    return { statusCode: 401, body: { message: 'Authentication token is invalid or expired.' } };
  }
}
