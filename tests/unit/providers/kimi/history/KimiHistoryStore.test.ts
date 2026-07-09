import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { loadKimiSessionMessages } from '@/providers/kimi/history/KimiHistoryStore';

describe('Kimi history store', () => {
  let tempSessionsDir: string;
  const originalHome = process.env.HOME;

  beforeEach(() => {
    tempSessionsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kimi-sessions-'));
    process.env.HOME = tempSessionsDir;
  });

  afterEach(() => {
    process.env.HOME = originalHome;
    fs.rmSync(tempSessionsDir, { recursive: true, force: true });
  });

  function createSession(sessionId: string, lines: string[]): void {
    const vaultHash = 'test-vault-hash';
    const sessionDir = path.join(tempSessionsDir, '.kimi', 'sessions', vaultHash, sessionId);
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.writeFileSync(path.join(sessionDir, 'context.jsonl'), lines.join('\n'), 'utf-8');
  }

  it('returns empty array when session is not found', async () => {
    const messages = await loadKimiSessionMessages('missing-session', null);
    expect(messages).toEqual([]);
  });

  it('parses user and assistant messages from context.jsonl', async () => {
    const sessionId = 'session-123';
    createSession(sessionId, [
      '{"role":"_system_prompt","content":"You are Kimi"}',
      '{"role":"user","content":"say hi"}',
      '{"role":"assistant","content":[{"type":"think","think":"The user said hi."},{"type":"text","text":"Hi there!"}]}',
      '{"role":"_usage","token_count":100}',
    ]);

    const messages = await loadKimiSessionMessages(sessionId, null);

    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('user');
    expect(messages[0].content).toBe('say hi');
    expect(messages[1].role).toBe('assistant');
    expect(messages[1].content).toBe('Hi there!');
    expect(messages[1].contentBlocks).toEqual([
      { type: 'thinking', content: 'The user said hi.' },
      { type: 'text', content: 'Hi there!' },
    ]);
  });

  it('skips malformed lines', async () => {
    const sessionId = 'session-456';
    createSession(sessionId, [
      '{"role":"user","content":"hello"}',
      'this is not json',
      '{"role":"assistant","content":[{"type":"text","text":"world"}]}',
    ]);

    const messages = await loadKimiSessionMessages(sessionId, null);

    expect(messages).toHaveLength(2);
    expect(messages[0].content).toBe('hello');
    expect(messages[1].content).toBe('world');
  });
});
