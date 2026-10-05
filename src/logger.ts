// src/logger.ts - Pino logger
import pino from 'pino';
import { getConfig } from './config.js';

let _logger: pino.Logger | null = null;

export function getLogger(name?: string): pino.Logger {
  if (!_logger) {
    const config = getConfig();
    _logger = pino({
      level: config.logLevel || 'info',
      transport: {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'SYS:HH:MM:ss.l' },
      },
    });
  }
  return name ? _logger.child({ module: name }) : _logger;
}
