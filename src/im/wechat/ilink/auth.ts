// QR-code login for iLink using node:https directly, avoiding Electron fetch DNS issues.

import { request } from './http';
import type { LoginCallbacks, LoginResult, QRCodeResponse, QRStatusResponse } from './types';

const DEFAULT_BASE_URL = 'https://ilinkai.weixin.qq.com';
const QR_POLL_TIMEOUT_MS = 35000;
const LOGIN_TIMEOUT_MS = 480_000; // 8 minutes
const MAX_QR_REFRESH = 3;

async function fetchQRCode(baseUrl: string): Promise<QRCodeResponse> {
  const endpoint = `ilink/bot/get_bot_qrcode?bot_type=3`;
  const res = await request(baseUrl, endpoint, { method: 'GET' });
  if (res.statusCode !== 200) {
    throw new Error(`Failed to fetch QR code: ${res.statusCode} ${res.body}`);
  }
  return JSON.parse(res.body) as QRCodeResponse;
}

async function pollStatus(baseUrl: string, qrcode: string, timeoutMs = QR_POLL_TIMEOUT_MS): Promise<QRStatusResponse> {
  const endpoint = `ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(qrcode)}`;
  try {
    const res = await request(baseUrl, endpoint, {
      method: 'GET',
      headers: { 'iLink-App-ClientVersion': '1' },
      timeoutMs,
    });
    if (res.statusCode !== 200) {
      throw new Error(`QR status poll failed: ${res.statusCode} ${res.body}`);
    }
    return JSON.parse(res.body) as QRStatusResponse;
  } catch (error) {
    if (error instanceof Error && error.message === 'request timeout') {
      return { status: 'wait' };
    }
    throw error;
  }
}

export async function loginWithQR(callbacks: LoginCallbacks, baseUrl = DEFAULT_BASE_URL): Promise<LoginResult> {
  let qr = await fetchQRCode(baseUrl);
  let refreshCount = 1;
  callbacks.onQRCode(qr.qrcode_img_content);
  callbacks.onStatusChange('waiting');

  const deadline = Date.now() + LOGIN_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const status = await pollStatus(baseUrl, qr.qrcode);
    switch (status.status) {
      case 'wait':
        break;
      case 'scaned':
        callbacks.onStatusChange('scanned');
        break;
      case 'expired':
        refreshCount++;
        if (refreshCount > MAX_QR_REFRESH) {
          throw new Error('QR code expired too many times');
        }
        callbacks.onStatusChange('expired');
        qr = await fetchQRCode(baseUrl);
        callbacks.onQRCode(qr.qrcode_img_content);
        callbacks.onStatusChange('waiting');
        break;
      case 'confirmed':
        if (!status.ilink_bot_id || !status.bot_token) {
          throw new Error('Login failed: server did not return required credentials');
        }
        return {
          botToken: status.bot_token,
          accountId: status.ilink_bot_id,
          baseUrl: status.baseurl || baseUrl,
          userId: status.ilink_user_id,
        };
    }
    await new Promise((resolve) => { window.setTimeout(resolve, 1000); });
  }
  throw new Error('Login timed out');
}
