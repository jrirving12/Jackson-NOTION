import dotenv from 'dotenv';

dotenv.config();

export function getConfig() {
  const databaseUrl = process.env.DATABASE_URL;
  const jwtSecret = process.env.JWT_SECRET;
  const port = parseInt(process.env.PORT ?? '3000', 10);
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:8081';
  const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  if (!jwtSecret && nodeEnv === 'production') {
    throw new Error('JWT_SECRET must be set in production');
  }

  return {
    databaseUrl: databaseUrl ?? undefined,
    jwtSecret: jwtSecret ?? 'dev-secret-change-in-production',
    port,
    nodeEnv,
    frontendUrl,
    allowedOrigins,
  };
}
