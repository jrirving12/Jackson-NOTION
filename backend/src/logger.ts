import pino from 'pino';
import { getConfig } from './config.js';

const config = getConfig();

export const logger = pino({
  level: config.nodeEnv === 'production' ? 'info' : 'debug',
  ...(config.nodeEnv !== 'production' && {
    transport: { target: 'pino-pretty', options: { colorize: true } },
  }),
});
