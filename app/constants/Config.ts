/**
 * App config. EXPO_PUBLIC_* vars are available at build time.
 * For local dev: set EXPO_PUBLIC_API_URL in .env (e.g. http://localhost:3000)
 */
const getEnv = (key: string, fallback: string): string => {
  if (typeof process !== 'undefined' && 'env' in process) {
    const env = process.env as Record<string, string | undefined>;
    const val = env[key];
    if (val) return val;
  }
  return fallback;
};

export const API_BASE_URL = getEnv('EXPO_PUBLIC_API_URL', 'http://localhost:3000');
