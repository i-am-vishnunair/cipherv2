// src/utils/http.ts - HTTP client with timeouts, conditional GET, size limits
import axios, { AxiosResponse, AxiosError } from 'axios';
import { getConfig } from '../config.js';
import { getLogger } from '../logger.js';

const log = getLogger('http');

export interface HttpResult {
  status: number;
  data: string;
  headers: Record<string, string>;
  bytes: number;
  durationMs: number;
  notModified: boolean;
  error?: string;
}

export interface HttpOptions {
  etag?: string;
  lastModified?: string;
  timeoutMs?: number;
  maxBytes?: number;
  userAgent?: string;
}

/**
 * Fetch a URL with timeout, conditional GET support, and size limits
 */
export async function fetchUrl(url: string, options: HttpOptions = {}): Promise<HttpResult> {
  const config = getConfig();
  const timeout = options.timeoutMs || config.monitoring.requestTimeoutMs;
  const maxBytes = options.maxBytes || config.monitoring.maxResponseSizeBytes;
  const ua = options.userAgent || config.monitoring.userAgent;

  const start = Date.now();
  const headers: Record<string, string> = {
    'User-Agent': ua,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Encoding': 'gzip, deflate',
  };

  if (options.etag) headers['If-None-Match'] = options.etag;
  if (options.lastModified) headers['If-Modified-Since'] = options.lastModified;

  try {
    const response: AxiosResponse = await axios.get(url, {
      headers,
      timeout,
      maxContentLength: maxBytes,
      maxBodyLength: maxBytes,
      responseType: 'text',
      maxRedirects: 5,
      validateStatus: (status) => status < 500 || status === 503 || status === 429,
    });

    const durationMs = Date.now() - start;
    const responseHeaders: Record<string, string> = {};
    for (const [key, val] of Object.entries(response.headers)) {
      if (typeof val === 'string') responseHeaders[key.toLowerCase()] = val;
    }

    const data = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);

    return {
      status: response.status,
      data: response.status === 304 ? '' : data,
      headers: responseHeaders,
      bytes: Buffer.byteLength(data || '', 'utf-8'),
      durationMs,
      notModified: response.status === 304,
    };
  } catch (err: any) {
    const durationMs = Date.now() - start;

    if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
      return {
        status: 0,
        data: '',
        headers: {},
        bytes: 0,
        durationMs,
        notModified: false,
        error: `Timeout after ${timeout}ms`,
      };
    }

    if (err.response) {
      return {
        status: err.response.status,
        data: '',
        headers: {},
        bytes: 0,
        durationMs,
        notModified: false,
        error: `HTTP ${err.response.status}: ${err.response.statusText}`,
      };
    }

    return {
      status: 0,
      data: '',
      headers: {},
      bytes: 0,
      durationMs,
      notModified: false,
      error: err.message || 'Unknown error',
    };
  }
}
