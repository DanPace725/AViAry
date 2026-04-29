import { createAuthClient } from '@neondatabase/neon-js/auth';

export const neonAuthUrl = import.meta.env.VITE_NEON_AUTH_URL as string | undefined;
export const authClient = neonAuthUrl ? createAuthClient(neonAuthUrl) : null;
