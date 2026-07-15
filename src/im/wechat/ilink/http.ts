// Minimal HTTPS client for iLink that bypasses Electron's fetch/DNS stack and uses node:https directly.

import * as https from 'node:https';
import { URL } from 'node:url';

export interface RequestOptions {
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  abortSignal?: AbortSignal;
}

export interface Response {
  statusCode: number;
  body: string;
}

export async function request(baseUrl: string, endpoint: string, options: RequestOptions = {}): Promise<Response> {
  const url = new URL(endpoint, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
  const timeoutMs = options.timeoutMs ?? 15000;

  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method: options.method ?? 'GET',
        headers: options.headers,
        timeout: timeoutMs,
      },
      (res) => {
        let data = '';
        res.setEncoding('utf-8');
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => resolve({ statusCode: res.statusCode ?? 0, body: data }));
      },
    );

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('request timeout'));
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (options.abortSignal) {
      const onAbort = () => {
        req.destroy();
        reject(new Error('aborted'));
      };
      if (options.abortSignal.aborted) {
        onAbort();
        return;
      }
      options.abortSignal.addEventListener('abort', onAbort, { once: true });
      req.on('close', () => {
        options.abortSignal?.removeEventListener('abort', onAbort);
      });
    }

    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}
