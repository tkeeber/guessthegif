import express from 'express';
import http from 'http';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth';
import lobbyRoutes from './routes/lobbies';
import leaderboardRoutes from './routes/leaderboard';
import adminRoutes from './routes/admin';
import { initSocketServer } from './socket';
import { botManager } from './services/botManager';

dotenv.config();

const app = express();
const server = http.createServer(app);

// Initialize Socket.IO on the HTTP server
const io = initSocketServer(server);

const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',')
  : ['http://localhost:5173'];

app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', authRoutes);
app.use('/api/lobbies', lobbyRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/admin', adminRoutes);

const PORT = process.env.PORT || 3001;

if (process.env.NODE_ENV !== 'test') {
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);

    // Initialize BotManager after server starts listening
    // Only if BOT_ENABLED and BOT_INTERNAL_SECRET are set
    if (process.env.BOT_ENABLED !== 'false' && process.env.BOT_INTERNAL_SECRET) {
      botManager.initialize(io).catch((err) => {
        console.error('[BotManager] Failed to initialize:', err);
      });
    }
  });

  // Graceful shutdown handlers
  const gracefulShutdown = async (signal: string) => {
    console.log(`\n${signal} received. Shutting down gracefully...`);
    await botManager.shutdown();
    server.close(() => {
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

export { app, server, io };
