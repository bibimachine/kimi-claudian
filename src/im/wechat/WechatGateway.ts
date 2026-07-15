import * as dns from 'node:dns/promises';
import * as fs from 'node:fs/promises';
import * as https from 'node:https';
import * as path from 'node:path';

import type { ImGateway, ImGatewayStatus, ImIncomingMessage, ImLogEntry } from '../types';
import { loginWithQR } from './ilink/auth';
import { ILinkClient } from './ilink/client';
import { MessageItemType, MessageType, type WeixinMessage } from './ilink/types';

const ILINK_BASE_URL = 'https://ilinkai.weixin.qq.com';
const DEFAULT_CHANNEL_VERSION = 'kimi-claudian/1.0.0';

export interface WechatGatewayOptions {
  dataDir: string;
}

interface PersistedCredentials {
  botToken: string;
  accountId: string;
  baseUrl: string;
  userId?: string;
}

function getCredentialsPath(dataDir: string): string {
  return path.join(dataDir, 'credentials.json');
}

function getSyncBufPath(dataDir: string): string {
  return path.join(dataDir, 'sync.buf');
}

export class WechatGateway implements ImGateway {
  readonly id = 'wechat';

  private options: WechatGatewayOptions;
  private status: ImGatewayStatus = { state: 'idle' };
  private client: ILinkClient | null = null;
  private running = false;
  private pollAbortController: AbortController | null = null;
  private statusListeners: Array<(status: ImGatewayStatus) => void> = [];
  private messageListeners: Array<(msg: ImIncomingMessage) => void> = [];
  private logListeners: Array<(logs: ImLogEntry[]) => void> = [];
  private logs: ImLogEntry[] = [];
  private pollPromise: Promise<void> | null = null;

  constructor(options: WechatGatewayOptions) {
    this.options = options;
  }

  getStatus(): ImGatewayStatus {
    return { ...this.status };
  }

  onStatusChange(listener: (status: ImGatewayStatus) => void): () => void {
    this.statusListeners.push(listener);
    return () => {
      const index = this.statusListeners.indexOf(listener);
      if (index >= 0) {
        this.statusListeners.splice(index, 1);
      }
    };
  }

  onIncomingMessage(listener: (msg: ImIncomingMessage) => void): () => void {
    this.messageListeners.push(listener);
    return () => {
      const index = this.messageListeners.indexOf(listener);
      if (index >= 0) {
        this.messageListeners.splice(index, 1);
      }
    };
  }

  onLogChange(listener: (logs: ImLogEntry[]) => void): () => void {
    this.logListeners.push(listener);
    return () => {
      const index = this.logListeners.indexOf(listener);
      if (index >= 0) {
        this.logListeners.splice(index, 1);
      }
    };
  }

  async start(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    this.setStatus({ state: 'starting' });
    this.addLog('system', 'Starting WeChat gateway...');

    try {
      await fs.mkdir(this.options.dataDir, { recursive: true });
      const credentials = await this.loadCredentials();

      if (credentials) {
        this.client = new ILinkClient({
          baseUrl: credentials.baseUrl || ILINK_BASE_URL,
          token: credentials.botToken,
          channelVersion: DEFAULT_CHANNEL_VERSION,
        });
        const syncBuf = await this.loadSyncBuf();
        if (syncBuf) {
          this.client.cursor = syncBuf;
        }
        this.setStatus({ state: 'logged_in', userName: credentials.accountId });
        this.addLog('system', `Restored session for ${credentials.accountId}`);
      } else {
        const result = await loginWithQR(
          {
            onQRCode: (url) => {
              this.setStatus({ state: 'qr_ready', qrCodeUrl: url });
            },
            onStatusChange: (loginStatus) => {
              if (loginStatus === 'scanned') {
                this.addLog('system', 'QR code scanned, waiting for confirmation...');
              } else if (loginStatus === 'expired') {
                this.addLog('system', 'QR code expired, refreshing...');
              }
            },
          },
          ILINK_BASE_URL,
        );

        await this.saveCredentials(result);
        this.client = new ILinkClient({
          baseUrl: result.baseUrl || ILINK_BASE_URL,
          token: result.botToken,
          channelVersion: DEFAULT_CHANNEL_VERSION,
        });
        this.setStatus({ state: 'logged_in', userName: result.accountId });
        this.addLog('system', `Logged in as ${result.accountId}`);
      }

      this.setStatus({ state: 'running' });
      this.pollAbortController = new AbortController();
      this.pollPromise = this.runPollLoop();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const type = classifyFetchError(error);
      this.setStatus({ state: 'error', errorMessage: message });
      this.addLog('system', `Failed to start: ${message} (${type.description})`);
      if (type.type === 'dns' || type.type === 'tcp' || type.type === 'tls') {
        this.addLog('system', 'Network diagnosis tip: check DNS/proxy/VPN/firewall settings for ilinkai.weixin.qq.com');
      }
      this.running = false;
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }
    this.running = false;
    this.pollAbortController?.abort();
    this.pollAbortController = null;

    if (this.pollPromise) {
      try {
        await this.pollPromise;
      } catch {
        // Ignore poll loop errors during shutdown.
      }
      this.pollPromise = null;
    }

    this.setStatus({ state: 'stopped' });
    this.addLog('system', 'WeChat gateway stopped.');
  }

  async sendText(toUserId: string, content: string): Promise<void> {
    if (!this.client) {
      throw new Error('WeChat gateway is not logged in.');
    }
    // contextToken is not available for outbound-only messages; pass empty.
    await this.client.sendTextChunked(toUserId, content, '');
    this.addLog('out', `Sent message to ${toUserId}`, content);
  }

  private async runPollLoop(): Promise<void> {
    if (!this.client) {
      return;
    }

    while (this.running) {
      try {
        const updates = await this.client.poll();
        if (updates.get_updates_buf) {
          await this.saveSyncBuf(updates.get_updates_buf);
        }

        if (updates.ret !== 0 && updates.ret !== undefined) {
          const errorMsg = updates.errmsg || `iLink error ret=${updates.ret}`;
          this.addLog('system', `Poll warning: ${errorMsg}`);
          if (this.isSessionExpiredError(updates.ret, updates.errcode)) {
            this.setStatus({ state: 'error', errorMessage: 'Session expired, please re-login.' });
            await this.clearCredentials();
            this.running = false;
            break;
          }
        }

        for (const msg of updates.msgs ?? []) {
          this.handleMessage(msg);
        }
      } catch (error) {
        if (!this.running) {
          break;
        }
        const message = error instanceof Error ? error.message : String(error);
        this.addLog('system', `Poll error: ${message}`);
        await this.delay(5000);
      }
    }
  }

  private handleMessage(msg: WeixinMessage): void {
    if (msg.message_type !== MessageType.USER) {
      return;
    }

    const textItem = msg.item_list?.find((item) => item.type === MessageItemType.TEXT)?.text_item;
    const content = textItem?.text?.trim();
    if (!content || !msg.from_user_id) {
      return;
    }

    const incoming: ImIncomingMessage = {
      id: `${msg.message_id ?? Date.now()}-${msg.from_user_id}`,
      fromUserId: msg.from_user_id,
      fromUserName: msg.from_user_id,
      content,
      timestamp: msg.create_time_ms ?? Date.now(),
    };

    this.addLog('in', `Message from ${incoming.fromUserId}`, content);
    for (const listener of this.messageListeners) {
      try {
        listener(incoming);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.addLog('system', `Message listener error: ${message}`);
      }
    }
  }

  private setStatus(next: Partial<ImGatewayStatus>): void {
    this.status = { ...this.status, ...next };
    for (const listener of this.statusListeners) {
      try {
        listener(this.getStatus());
      } catch {
        // Ignore listener errors.
      }
    }
  }

  private addLog(direction: ImLogEntry['direction'], summary: string, detail?: string): void {
    const entry: ImLogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      timestamp: Date.now(),
      direction,
      summary,
      detail,
    };
    this.logs.push(entry);
    if (this.logs.length > 100) {
      this.logs.shift();
    }
    for (const listener of this.logListeners) {
      try {
        listener([...this.logs]);
      } catch {
        // Ignore listener errors.
      }
    }
  }

  private async loadCredentials(): Promise<PersistedCredentials | null> {
    try {
      const raw = await fs.readFile(getCredentialsPath(this.options.dataDir), 'utf-8');
      const parsed = JSON.parse(raw) as Partial<PersistedCredentials>;
      if (
        typeof parsed.botToken === 'string'
        && typeof parsed.accountId === 'string'
        && parsed.botToken
        && parsed.accountId
      ) {
        return {
          botToken: parsed.botToken,
          accountId: parsed.accountId,
          baseUrl: typeof parsed.baseUrl === 'string' ? parsed.baseUrl : ILINK_BASE_URL,
          userId: typeof parsed.userId === 'string' ? parsed.userId : undefined,
        };
      }
      return null;
    } catch (error) {
      if (this.isEnoentError(error)) {
        return null;
      }
      throw error;
    }
  }

  private async saveCredentials(credentials: PersistedCredentials): Promise<void> {
    await fs.writeFile(
      getCredentialsPath(this.options.dataDir),
      JSON.stringify(credentials, null, 2),
      'utf-8',
    );
  }

  private async clearCredentials(): Promise<void> {
    try {
      await fs.unlink(getCredentialsPath(this.options.dataDir));
    } catch (error) {
      if (this.isEnoentError(error)) {
        return;
      }
      throw error;
    }
  }

  private async loadSyncBuf(): Promise<string | null> {
    try {
      return await fs.readFile(getSyncBufPath(this.options.dataDir), 'utf-8');
    } catch (error) {
      if (this.isEnoentError(error)) {
        return null;
      }
      throw error;
    }
  }

  private async saveSyncBuf(buf: string): Promise<void> {
    await fs.writeFile(getSyncBufPath(this.options.dataDir), buf, 'utf-8');
  }

  private isSessionExpiredError(ret: number, errcode?: number): boolean {
    // Best-effort heuristic based on common iLink error codes.
    if (ret === 120001 || ret === 120002 || errcode === 40001) {
      return true;
    }
    return false;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
      window.setTimeout(resolve, ms);
    });
  }

  private isEnoentError(error: unknown): boolean {
    return !!error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT';
  }

  /**
   * Run a lightweight network diagnostic against the iLink endpoint.
   * Returns a human-readable report; does not throw.
   */
  async diagnoseConnection(): Promise<string> {
    const lines: string[] = [];
    const hostname = new URL(ILINK_BASE_URL).hostname;
    lines.push(`Target: ${ILINK_BASE_URL}`);

    // resolve4 uses the DNS protocol directly; lookup uses the system resolver (getaddrinfo).
    try {
      const addresses = await dns.resolve4(hostname);
      lines.push(`[dns.resolve4] OK: ${addresses.join(', ')}`);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException)?.code ?? 'unknown';
      const message = error instanceof Error ? error.message : String(error);
      lines.push(`[dns.resolve4] FAIL: code=${code} ${message}`);
    }

    try {
      const lookup = await dns.lookup(hostname);
      lines.push(`[dns.lookup] OK: ${lookup.address} (ipv${lookup.family})`);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException)?.code ?? 'unknown';
      const message = error instanceof Error ? error.message : String(error);
      lines.push(`[dns.lookup] FAIL: code=${code} ${message}`);
    }

    const httpsResult = await new Promise<{ ok: boolean; status?: number; body?: string; error?: string }>((resolve) => {
      const req = https.request(
        `${ILINK_BASE_URL}/ilink/bot/get_bot_qrcode?bot_type=3`,
        { method: 'GET', timeout: 15000 },
        (res) => {
          let data = '';
          res.on('data', (chunk) => { data += chunk; });
          res.on('end', () => resolve({ ok: true, status: res.statusCode, body: data.slice(0, 200) }));
        },
      );
      req.on('timeout', () => {
        req.destroy();
        resolve({ ok: false, error: 'request timeout' });
      });
      req.on('error', (error) => {
        resolve({ ok: false, error: error.message });
      });
      req.end();
    });

    if (httpsResult.ok) {
      lines.push(`[node:https] OK: HTTP ${httpsResult.status}`);
      lines.push(`[node:https] body: ${httpsResult.body ?? ''}`);
    } else {
      lines.push(`[node:https] FAIL: ${httpsResult.error}`);
    }

    try {
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), 15000);
      const res = await fetch(`${ILINK_BASE_URL}/ilink/bot/get_bot_qrcode?bot_type=3`, { signal: controller.signal });
      window.clearTimeout(timer);
      const text = await res.text();
      lines.push(`[fetch] OK: HTTP ${res.status}`);
      lines.push(`[fetch] body: ${text.slice(0, 200)}`);
    } catch (error) {
      const message = error instanceof Error ? `${error.name} ${error.message}` : String(error);
      lines.push(`[fetch] FAIL: ${message}`);
    }

    lines.push('Note: ping may be blocked by Tencent even when the service is reachable.');
    return lines.join('\n');
  }
}

function classifyFetchError(error: unknown): { type: 'dns' | 'tcp' | 'tls' | 'timeout' | 'unknown'; description: string } {
  if (error instanceof Error && error.name === 'AbortError') {
    return { type: 'timeout', description: 'request timed out' };
  }
  const text = String(error ?? '').toLowerCase();
  if (/failed to fetch|networkerror|net::err/i.test(text)) {
    return { type: 'tcp', description: 'network connection failed (likely proxy/DNS/firewall)' };
  }
  if (/enotfound|eai_again|getaddrinfo/i.test(text)) {
    return { type: 'dns', description: 'DNS resolution failed' };
  }
  if (/econnrefused/i.test(text)) {
    return { type: 'tcp', description: 'connection refused' };
  }
  if (/ssl|tls|cert|unable_to_verify/i.test(text)) {
    return { type: 'tls', description: 'TLS/SSL handshake failed' };
  }
  return { type: 'unknown', description: 'unknown network error' };
}
