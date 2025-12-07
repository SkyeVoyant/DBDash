import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Serve static files from frontend/dist
app.use(express.static(path.join(__dirname, 'frontend/dist')));

// Catch-all route: serve index.html for all non-API routes
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'frontend/dist/index.html'));
});

const PORT = process.env.FRONTEND_PORT || 8888;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Frontend served on http://0.0.0.0:${PORT}`);
});

