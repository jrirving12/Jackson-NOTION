import http from 'http';
import express from 'express';
import cors from 'cors';
import { getConfig } from './config.js';
import { logger } from './logger.js';
import { createSocketServer } from './socket.js';
import healthRouter from './routes/health.js';
import authRouter from './routes/auth.js';
import channelsRouter from './routes/channels.js';
import messagesRouter from './routes/messages.js';
import dmRouter from './routes/dm.js';
import usersRouter from './routes/users.js';

const config = getConfig();
const app = express();
const httpServer = http.createServer(app);

const io = createSocketServer(httpServer);
app.set('io', io);

app.use(cors({
  origin: config.nodeEnv === 'production' ? config.frontendUrl : true,
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));

app.use('/api/health', healthRouter);
app.use('/api/auth', authRouter);
app.use('/api/channels', channelsRouter);
app.use('/api/messages', messagesRouter);
app.use('/api/dm', dmRouter);
app.use('/api/users', usersRouter);

app.get('/', (_req, res) => {
  res.json({ name: 'tequila-crm-api', version: '0.1.0', status: 'running' });
});

const host = process.env.HOST ?? '0.0.0.0';
httpServer.listen(config.port, host, () => {
  logger.info({ port: config.port, host, nodeEnv: config.nodeEnv }, 'API listening');
});
