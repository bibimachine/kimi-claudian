// Network diagnostic for WeChat iLink endpoint.
// Run: node scripts/test-wechat-network.mjs

import dns from 'node:dns/promises';
import https from 'node:https';

const HOST = 'ilinkai.weixin.qq.com';
const URL = `https://${HOST}/ilink/bot/get_bot_qrcode?bot_type=3`;

function request(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method: 'GET', timeout: 15000, ...options }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ statusCode: res.statusCode, body: data }));
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('request timeout')); });
    req.on('error', reject);
    req.end();
  });
}

async function diagnose() {
  console.log(`Diagnosing ${HOST}...\n`);

  try {
    const addresses = await dns.resolve4(HOST);
    console.log(`[dns.resolve4] OK: ${addresses.join(', ')}`);
  } catch (e) {
    console.log(`[dns.resolve4] FAIL: code=${e.code ?? 'unknown'} ${e.message}`);
  }

  try {
    const lookup = await dns.lookup(HOST);
    console.log(`[dns.lookup] OK: ${lookup.address} (ipv${lookup.family})`);
  } catch (e) {
    console.log(`[dns.lookup] FAIL: code=${e.code ?? 'unknown'} ${e.message}`);
  }

  try {
    const start = Date.now();
    const res = await request(URL);
    console.log(`[node:https] OK: status=${res.statusCode} time=${Date.now() - start}ms`);
    console.log(`[node:https] body preview: ${res.body.slice(0, 200)}`);
  } catch (e) {
    console.log(`[node:https] FAIL: ${e.code ?? ''} ${e.message}`);
  }

  try {
    const start = Date.now();
    const res = await fetch(URL, { signal: AbortSignal.timeout(15000) });
    const text = await res.text();
    console.log(`[fetch] OK: status=${res.status} time=${Date.now() - start}ms`);
    console.log(`[fetch] body preview: ${text.slice(0, 200)}`);
  } catch (e) {
    console.log(`[fetch] FAIL: ${e.name} ${e.message}`);
  }

  console.log('\nNote: ping may be blocked by Tencent even when service is reachable. HTTPS test is authoritative.');
}

diagnose().catch(e => console.error('Unexpected:', e));
