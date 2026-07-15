// Network diagnostic for WeChat iLink endpoint.
// Run: node .context/test-wechat-network.mjs
// Or in Obsidian DevTools Console, paste the fetch-based section.

import dns from 'node:dns/promises';
import https from 'node:https';

const HOST = 'ilinkai.weixin.qq.com';
const URL = `https://${HOST}/ilink/bot/get_bot_qrcode?bot_type=3`;

function request(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method: 'GET', timeout: 15000, ...options }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('request timeout')); });
    req.on('error', reject);
    req.end();
  });
}

async function diagnose() {
  console.log(`Diagnosing ${HOST}...\n`);

  // 1. DNS
  try {
    const addresses = await dns.resolve4(HOST);
    console.log(`[DNS] OK: ${addresses.join(', ')}`);
  } catch (e) {
    console.log(`[DNS] FAIL: ${e.code || e.message}`);
    try {
      const lookup = await dns.lookup(HOST);
      console.log(`[DNS lookup] fallback: ${lookup.address} (${lookup.family})`);
    } catch (e2) {
      console.log(`[DNS lookup] FAIL: ${e2.code || e2.message}`);
    }
  }

  // 2. HTTPS with node https (matches Obsidian/Electron network stack more closely)
  try {
    const start = Date.now();
    const res = await request(URL);
    console.log(`[HTTPS] OK: status=${res.statusCode} time=${Date.now() - start}ms`);
    console.log(`[HTTPS] body preview: ${res.body.slice(0, 200)}`);
  } catch (e) {
    console.log(`[HTTPS] FAIL: ${e.code || e.message}`);
  }

  // 3. Native fetch (what weixin-ilink uses)
  try {
    const start = Date.now();
    const res = await fetch(URL, { signal: AbortSignal.timeout(15000) });
    const text = await res.text();
    console.log(`[fetch] OK: status=${res.status} time=${Date.now() - start}ms`);
    console.log(`[fetch] body preview: ${text.slice(0, 200)}`);
  } catch (e) {
    console.log(`[fetch] FAIL: ${e.name} ${e.message}`);
  }

  // 4. Ping note
  console.log('\nNote: ping may be blocked by Tencent even when service is reachable. HTTPS test is authoritative.');
}

diagnose().catch(e => console.error('Unexpected:', e));
