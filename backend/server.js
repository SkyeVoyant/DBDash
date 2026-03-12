import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { dbManager } from './src/dbManager.js';
import { databaseRoutes } from './src/routes/databases.js';
import { authRoutes } from './src/routes/auth.js';
import { authenticateToken } from './src/middleware/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from project root (parent directory)
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const app = express();
const PORT = process.env.PORT || 8889;
const NODE_ENV = process.env.NODE_ENV || 'production';

// Security middleware
app.use((req, res, next) => {
  // Security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});

// CORS configuration
// Supports both local dev and Cloudflare Tunnel hostnames via CORS_ORIGIN.
// Example: CORS_ORIGIN=https://panel.skyecord.app,http://localhost:5160
const FRONTEND_PORT = process.env.FRONTEND_PORT || '8888';
const corsOriginRaw = process.env.CORS_ORIGIN || `http://localhost:${FRONTEND_PORT}`;
const corsOrigins = corsOriginRaw
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

const corsOptions = {
  origin: corsOrigins,
  credentials: true,
  optionsSuccessStatus: 200
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message,
    ...(NODE_ENV !== 'production' && { stack: err.stack })
  });
});

// Health check (public)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Auth routes (public)
app.use('/api/auth', authRoutes);

// Database routes (protected)
app.use('/api/databases', authenticateToken, databaseRoutes);

// Initialize database connections
dbManager.initializeConnections();

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 DBDash Backend running on http://0.0.0.0:${PORT}`);
  console.log(`📊 Managing ${dbManager.getConnectionCount()} database connections`);
});
