import { getConfig } from './config.js';
import { getLogger } from './logger.js';
import { initDb, closeDb } from './db/database.js';
import { engine } from './worker/engine.js';

const log = getLogger('worker-main');

async function main() {
  await initDb();
  engine.start();
  log.info('Standalone worker started');

  // Graceful shutdown
  const shutdown = () => {
    log.info('Worker shutting down...');
    engine.stop();
    closeDb();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
