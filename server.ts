import http from 'http';
import path from 'path';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { getDb } from './server/db.ts';
import { createApiRouter } from './server/routes.ts';
import { initWebSocketServer } from './server/ws.ts';

async function startServer() {
  // Initialize persistent database & seed data on startup
  getDb();

  const app = express();
  app.use(express.json({ limit: '5mb' }));

  // Mount REST API
  app.use('/api', createApiRouter());

  // Healthcheck
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'CarePlus HMS' });
  });

  const server = http.createServer(app);
  initWebSocketServer(server);

  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = Number(process.env.PORT || 3000);
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`CarePlus Hospital Management System running at http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start CarePlus server:', err);
  process.exit(1);
});
