// High-level iLink client using node:https directly to avoid Electron fetch DNS issues.

import * as crypto from 'node:crypto';

import { request } from './http';
import type {
  ClientOptions,
  GetConfigResp,
  GetUpdatesResp,
  GetUploadUrlReq,
  GetUploadUrlResp,
  MessageItem,
  SendMessageReq,
  SendTypingReq,
  WeixinMessage,
} from './types';
import { MessageItemType, MessageState, MessageType, TypingStatus } from './types';

const DEFAULT_CHANNEL_VERSION = 'kimi-claudian/1.0.0';
const DEFAULT_LONG_POLL_TIMEOUT_MS = 35000;
const DEFAULT_API_TIMEOUT_MS = 15000;

function randomWechatUin(): string {
  const uint32 = crypto.randomBytes(4).readUInt32BE(0);
  return Buffer.from(String(uint32), 'utf-8').toString('base64');
}

function buildHeaders(token: string, body: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    AuthorizationType: 'ilink_bot_token',
    'Content-Length': String(Buffer.byteLength(body, 'utf-8')),
    'X-WECHAT-UIN': randomWechatUin(),
  };
}

export class ILinkClient {
  private opts: Required<ClientOptions>;
  private syncBuf = '';

  constructor(opts: ClientOptions) {
    this.opts = {
      channelVersion: DEFAULT_CHANNEL_VERSION,
      longPollTimeoutMs: DEFAULT_LONG_POLL_TIMEOUT_MS,
      apiTimeoutMs: DEFAULT_API_TIMEOUT_MS,
      ...opts,
    };
  }

  set cursor(buf: string) {
    this.syncBuf = buf;
  }

  get cursor(): string {
    return this.syncBuf;
  }

  private async post<T>(endpoint: string, payload: object, timeoutMs?: number): Promise<T> {
    const body = JSON.stringify({ ...(payload as Record<string, unknown>), base_info: { channel_version: this.opts.channelVersion } });
    const res = await request(this.opts.baseUrl, endpoint, {
      method: 'POST',
      headers: buildHeaders(this.opts.token, body),
      body,
      timeoutMs: timeoutMs ?? this.opts.apiTimeoutMs,
    });
    if (res.statusCode !== 200) {
      throw new Error(`${endpoint} ${res.statusCode}: ${res.body}`);
    }
    return JSON.parse(res.body) as T;
  }

  async poll(abortSignal?: AbortSignal): Promise<GetUpdatesResp> {
    try {
      const resp = await this.post<GetUpdatesResp>(
        'ilink/bot/getupdates',
        { get_updates_buf: this.syncBuf },
        this.opts.longPollTimeoutMs,
      );
      if (resp.get_updates_buf) {
        this.syncBuf = resp.get_updates_buf;
      }
      return resp;
    } catch (error) {
      if (error instanceof Error && error.message === 'request timeout') {
        return { ret: 0, msgs: [], get_updates_buf: this.syncBuf };
      }
      throw error;
    }
  }

  async sendMessage(body: SendMessageReq): Promise<void> {
    await this.post('ilink/bot/sendmessage', body);
  }

  async sendText(toUserId: string, text: string, contextToken: string): Promise<void> {
    const msg: WeixinMessage = {
      from_user_id: '',
      to_user_id: toUserId,
      client_id: this.generateClientId(),
      message_type: MessageType.BOT,
      message_state: MessageState.FINISH,
      context_token: contextToken,
      item_list: [{ type: MessageItemType.TEXT, text_item: { text } }],
    };
    await this.sendMessage({ msg });
  }

  async sendTextChunked(toUserId: string, text: string, contextToken: string, maxLength = 4000): Promise<number> {
    if (text.length <= maxLength) {
      await this.sendText(toUserId, text, contextToken);
      return 1;
    }
    const chunks: string[] = [];
    for (let i = 0; i < text.length; i += maxLength) {
      chunks.push(text.slice(i, i + maxLength));
    }
    for (const chunk of chunks) {
      await this.sendText(toUserId, chunk, contextToken);
    }
    return chunks.length;
  }

  async sendMedia(toUserId: string, item: MessageItem, contextToken: string): Promise<void> {
    const msg: WeixinMessage = {
      from_user_id: '',
      to_user_id: toUserId,
      client_id: this.generateClientId(),
      message_type: MessageType.BOT,
      message_state: MessageState.FINISH,
      context_token: contextToken,
      item_list: [item],
    };
    await this.sendMessage({ msg });
  }

  async sendTyping(userId: string, contextToken: string): Promise<void> {
    const config = await this.getConfig(userId, contextToken);
    if (config.typing_ticket) {
      const body: SendTypingReq = {
        ilink_user_id: userId,
        typing_ticket: config.typing_ticket,
        status: TypingStatus.TYPING,
      };
      await this.post('ilink/bot/sendtyping', body);
    }
  }

  async getConfig(userId: string, contextToken: string): Promise<GetConfigResp> {
    return this.post('ilink/bot/getconfig', { ilink_user_id: userId, context_token: contextToken });
  }

  async getUploadUrl(params: GetUploadUrlReq): Promise<GetUploadUrlResp> {
    return this.post('ilink/bot/getuploadurl', params);
  }

  private generateClientId(): string {
    const hex = crypto.randomBytes(6).toString('hex');
    return `ilink-${Date.now()}-${hex}`;
  }
}
