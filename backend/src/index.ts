import express from 'express';
import cors from 'cors';
import { getConfig } from './config.js';
import { logger } from './logger.js';
import healthRouter from './routes/health.js';
import authRouter from './routes/auth.js';

const config = getConfig();
const app = express();

app.use(cors({ origin: config.frontendUrl, credentials: true }));
app.use(express.json());

app.use('/api/health', healthRouter);
app.use('/api/auth', authRouter);

app.get('/', (_req, res) => {
  res.json({ name: 'tequila-crm-api', version: '0.1.0', status: 'running' });
});

app.listen(config.port, () => {
  logger.info({ port: config.port, nodeEnv: config.nodeEnv }, 'API listening');
});
