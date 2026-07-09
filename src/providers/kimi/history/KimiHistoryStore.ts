import * as fs from 'node:fs';
import * as path from 'node:path';

import type { ChatMessage, ContentBlock } from '../../../core/types';

interface KimiContextEntry {
  role: string;
  content?: string | Array<{ type: string; text?: string; think?: string; encrypted?: unknown }>;
  id?: number;
  token_count?: number;
}

export async function loadKimiSessionMessages(
  sessionId: string,
  vaultPath: string | null,
): Promise<ChatMessage[]> {
  const contextPath = resolveKimiContextPath(sessionId, vaultPath);
  if (!contextPath || !fs.existsSync(contextPath)) {
    return [];
  }

  const lines = fs.readFileSync(contextPath, 'utf-8')
    .split('\n')
    .filter((line) => line.trim());

  messageCounter = 0;
  const messages: ChatMessage[] = [];
  for (const line of lines) {
    try {
      const entry = JSON.parse(line) as KimiContextEntry;
      const message = mapContextEntryToMessage(entry);
      if (message) {
        messages.push(message);
      }
    } catch {
      // Skip malformed lines.
    }
  }

  return messages;
}

let messageCounter = 0;

function mapContextEntryToMessage(entry: KimiContextEntry): ChatMessage | null {
  const index = messageCounter++;
  if (entry.role === 'user') {
    return {
      id: `kimi-user-${index}`,
      role: 'user',
      content: typeof entry.content === 'string' ? entry.content : '',
      timestamp: Date.now(),
    };
  }

  if (entry.role === 'assistant') {
    const blocks = Array.isArray(entry.content) ? entry.content : [];
    const contentBlocks: ContentBlock[] = [];
    let text = '';

    for (const block of blocks) {
      if (block.type === 'text' && typeof block.text === 'string') {
        text += block.text;
        contentBlocks.push({ type: 'text', content: block.text });
      } else if (block.type === 'think' && typeof block.think === 'string') {
        contentBlocks.push({ type: 'thinking', content: block.think });
      }
    }

    return {
      id: `kimi-assistant-${index}`,
      role: 'assistant',
      content: text,
      contentBlocks: contentBlocks.length > 0 ? contentBlocks : undefined,
      timestamp: Date.now(),
    };
  }

  return null;
}

function resolveKimiContextPath(
  sessionId: string,
  _vaultPath: string | null,
): string | null {
  const homeSessions = path.join(process.env.HOME ?? process.env.USERPROFILE ?? '', '.kimi', 'sessions');
  if (!fs.existsSync(homeSessions)) {
    return null;
  }

  for (const hash of fs.readdirSync(homeSessions)) {
    const candidate = path.join(homeSessions, hash, sessionId, 'context.jsonl');
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}
