import express from 'express';
import jwt from 'jsonwebtoken';

const router = express.Router();

// Rate limiting for login attempts
const loginAttempts = new Map();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

router.post('/login', (req, res) => {
  const { password } = req.body;
  const PASSWORD = process.env.PASSWORD;
  const JWT_SECRET = process.env.JWT_SECRET;

  // Security checks
  if (!PASSWORD) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  if (!JWT_SECRET || JWT_SECRET === 'your-secret-key-change-this') {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  // Rate limiting: track login attempts by client IP address
  const clientIp = req.ip || req.socket?.remoteAddress || 'unknown';
  const now = Date.now();
  const attempts = loginAttempts.get(clientIp) || { count: 0, resetTime: now + WINDOW_MS };

  if (attempts.resetTime < now) {
    attempts.count = 0;
    attempts.resetTime = now + WINDOW_MS;
  }

  if (attempts.count >= MAX_ATTEMPTS) {
    return res.status(429).json({ error: 'Too many login attempts. Please try again later.' });
  }

  if (!password || password !== PASSWORD) {
    attempts.count++;
    loginAttempts.set(clientIp, attempts);
    return res.status(401).json({ error: 'Invalid password' });
  }

  // Successful login - reset rate limit counter
  loginAttempts.delete(clientIp);

  // Generate JWT token with 7-day expiration
  const token = jwt.sign(
    { authenticated: true },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.json({ token });
});

router.get('/verify', (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(200).json({ authenticated: false });
  }

  const JWT_SECRET = process.env.JWT_SECRET;
  
  if (!JWT_SECRET || JWT_SECRET === 'your-secret-key-change-this') {
    return res.status(500).json({ authenticated: false, error: 'Server configuration error' });
  }
  
  jwt.verify(token, JWT_SECRET, (err) => {
    if (err) {
      return res.status(200).json({ authenticated: false });
    }
    res.json({ authenticated: true });
  });
});

export { router as authRoutes };

