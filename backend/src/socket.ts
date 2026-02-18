import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { verifyToken } from './services/authService.js';
import { logger } from './logger.js';

export function createSocketServer(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    cors: { origin: process.env.FRONTEND_URL ?? '*', credentials: true },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token ?? socket.handshake.headers?.authorization?.replace('Bearer ', '');
    if (!token) {
      return next(new Error('Missing token'));
    }
    try {
      const payload = verifyToken(token);
      (socket.data as { userId: string }).userId = payload.userId;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const userId = (socket.data as { userId: string }).userId;
    logger.info({ userId, socketId: socket.id }, 'Socket connected');

    socket.join(`user:${userId}`);

    socket.on('join_channel', (channelId: string) => {
      socket.join(`channel:${channelId}`);
    });
    socket.on('leave_channel', (channelId: string) => {
      socket.leave(`channel:${channelId}`);
    });
    socket.on('join_dm', (threadId: string) => {
      socket.join(`dm:${threadId}`);
    });
    socket.on('leave_dm', (threadId: string) => {
      socket.leave(`dm:${threadId}`);
    });

    socket.on('disconnect', () => {
      logger.debug({ userId, socketId: socket.id }, 'Socket disconnected');
    });
  });

  return io;
}

export function emitChannelMessage(io: Server, channelId: string, message: unknown): void {
  io.to(`channel:${channelId}`).emit('new_message', message);
}

export function emitDMMessage(io: Server, threadId: string, message: unknown): void {
  io.to(`dm:${threadId}`).emit('new_message', message);
}

export function emitToUser(io: Server, userId: string, event: string, data: unknown): void {
  io.to(`user:${userId}`).emit(event, data);
}
