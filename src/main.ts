import express from 'express';
import { resolve } from 'path';
import { apiRouter } from './server/api.js';
import { getConfig } from './config.js';
import { getLogger } from './logger.js';
import { initDb, closeDb } from './db/database.js';
import { engine } from './worker/engine.js';

const log = getLogger('main');

async function main() {
  const config = getConfig();

  // Initialize DB
  await initDb();

  const app = express();
  app.use(express.json());

  // API Routes
  app.use('/api', apiRouter);

  // Serve Dashboard
  app.use(express.static(resolve(process.cwd(), 'web')));

  // Fallback to index.html for SPA if we had one (we just have one page though)
  app.get('*', (req, res) => {
    res.sendFile(resolve(process.cwd(), 'web/index.html'));
  });

  const server = app.listen(config.port, () => {
    log.info(`Dashboard and API running on http://localhost:${config.port}`);
  });

  // Start engine if not running separate worker
  if (!process.argv.includes('--no-worker')) {
    engine.start();
  }

  // Graceful shutdown
  const shutdown = () => {
    log.info('Shutting down...');
    server.close(() => {
      engine.stop();
      closeDb();
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
