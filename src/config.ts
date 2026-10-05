// src/config.ts - Configuration management
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

export interface MonitoringConfig {
  globalConcurrency: number;
  perHostConcurrency: number;
  defaultPollIntervalMs: number;
  minPollIntervalMs: number;
  maxPollIntervalMs: number;
  requestTimeoutMs: number;
  connectTimeoutMs: number;
  maxResponseSizeBytes: number;
  maxRequestsPerSecond: number;
  circuitBreakerThreshold: number;
  circuitBreakerRecoveryMs: number;
  adaptivePolling: boolean;
  respectRobotsTxt: boolean;
  userAgent: string;
}

export interface SmtpConfig {
  enabled: boolean;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
  to: string;
}

export interface PublishingConfig {
  enabled: boolean;
  webhookUrl: string;
  wpUrl: string;
  wpUser: string;
  wpAppPassword: string;
}

export interface AppConfig {
  port: number;
  demoSitesPort: number;
  dbPath: string;
  logLevel: string;
  monitoring: MonitoringConfig;
  smtp: SmtpConfig;
  publishing: PublishingConfig;
}

let _config: AppConfig | null = null;

export function loadConfig(overrides?: Partial<AppConfig>): AppConfig {
  const configPath = resolve(process.cwd(), 'config/default.json');
  let fileConfig: any = {};
  if (existsSync(configPath)) {
    fileConfig = JSON.parse(readFileSync(configPath, 'utf-8'));
  }

  // Env overrides
  const env = process.env;

  const config: AppConfig = {
    port: parseInt(env.PORT || '') || fileConfig.port || 3000,
    demoSitesPort: parseInt(env.DEMO_SITES_PORT || '') || fileConfig.demoSitesPort || 4000,
    dbPath: env.DB_PATH || fileConfig.dbPath || './data/cipher.db',
    logLevel: env.LOG_LEVEL || fileConfig.logLevel || 'info',
    monitoring: {
      globalConcurrency: parseInt(env.GLOBAL_CONCURRENCY || '') || fileConfig.monitoring?.globalConcurrency || 20,
      perHostConcurrency: parseInt(env.PER_HOST_CONCURRENCY || '') || fileConfig.monitoring?.perHostConcurrency || 2,
      defaultPollIntervalMs: parseInt(env.DEFAULT_POLL_INTERVAL_MS || '') || fileConfig.monitoring?.defaultPollIntervalMs || 60000,
      minPollIntervalMs: parseInt(env.MIN_POLL_INTERVAL_MS || '') || fileConfig.monitoring?.minPollIntervalMs || 30000,
      maxPollIntervalMs: parseInt(env.MAX_POLL_INTERVAL_MS || '') || fileConfig.monitoring?.maxPollIntervalMs || 900000,
      requestTimeoutMs: parseInt(env.REQUEST_TIMEOUT_MS || '') || fileConfig.monitoring?.requestTimeoutMs || 10000,
      connectTimeoutMs: fileConfig.monitoring?.connectTimeoutMs || 5000,
      maxResponseSizeBytes: parseInt(env.MAX_RESPONSE_SIZE_BYTES || '') || fileConfig.monitoring?.maxResponseSizeBytes || 5242880,
      maxRequestsPerSecond: fileConfig.monitoring?.maxRequestsPerSecond || 50,
      circuitBreakerThreshold: fileConfig.monitoring?.circuitBreakerThreshold || 5,
      circuitBreakerRecoveryMs: fileConfig.monitoring?.circuitBreakerRecoveryMs || 300000,
      adaptivePolling: fileConfig.monitoring?.adaptivePolling ?? true,
      respectRobotsTxt: fileConfig.monitoring?.respectRobotsTxt ?? true,
      userAgent: fileConfig.monitoring?.userAgent || 'CipherBot/1.0 (+https://github.com/cipher-blog-spy; monitoring)',
    },
    smtp: {
      enabled: (env.SMTP_HOST ? true : false) || fileConfig.smtp?.enabled || false,
      host: env.SMTP_HOST || fileConfig.smtp?.host || '',
      port: parseInt(env.SMTP_PORT || '') || fileConfig.smtp?.port || 587,
      secure: fileConfig.smtp?.secure || false,
      user: env.SMTP_USER || fileConfig.smtp?.user || '',
      pass: env.SMTP_PASS || fileConfig.smtp?.pass || '',
      from: env.SMTP_FROM || fileConfig.smtp?.from || 'cipher@example.com',
      to: env.SMTP_TO || fileConfig.smtp?.to || 'admin@example.com',
    },
    publishing: {
      enabled: env.AUTO_PUBLISH_ENABLED === 'true' || fileConfig.publishing?.enabled || false,
      webhookUrl: env.PUBLISH_WEBHOOK_URL || fileConfig.publishing?.webhookUrl || '',
      wpUrl: env.PUBLISH_WP_URL || fileConfig.publishing?.wpUrl || '',
      wpUser: env.PUBLISH_WP_USER || fileConfig.publishing?.wpUser || '',
      wpAppPassword: env.PUBLISH_WP_APP_PASSWORD || fileConfig.publishing?.wpAppPassword || '',
    },
    ...overrides,
  };

  _config = config;
  return config;
}

export function getConfig(): AppConfig {
  if (!_config) return loadConfig();
  return _config;
}
