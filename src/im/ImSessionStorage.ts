import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import type { ChatMessage } from '../core/types';

export interface ImConversation {
  contactId: string;
  sessionId: string | null;
  selectedModel: string | null;
  providerState?: Record<string, unknown>;
  messages: ChatMessage[];
}

export interface ImSessionStorageOptions {
  dataDir: string;
  maxHistoryMessages: number;
}

function getConversationFilePath(dataDir: string, contactId: string): string {
  const safeId = contactId.replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(dataDir, `wechat-${safeId}.json`);
}

export class ImSessionStorage {
  constructor(private readonly options: ImSessionStorageOptions) {}

  async load(contactId: string): Promise<ImConversation> {
    const filePath = getConversationFilePath(this.options.dataDir, contactId);
    try {
      const raw = await fs.readFile(filePath, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<ImConversation>;
      return {
        contactId,
        sessionId: typeof parsed.sessionId === 'string' ? parsed.sessionId : null,
        selectedModel: typeof parsed.selectedModel === 'string' ? parsed.selectedModel : null,
        providerState: parsed.providerState && typeof parsed.providerState === 'object' && !Array.isArray(parsed.providerState)
          ? parsed.providerState as Record<string, unknown>
          : undefined,
        messages: Array.isArray(parsed.messages) ? parsed.messages : [],
      };
    } catch (error) {
      if (this.isEnoentError(error)) {
        return this.createEmpty(contactId);
      }
      throw error;
    }
  }

  async save(conversation: ImConversation): Promise<void> {
    const filePath = getConversationFilePath(this.options.dataDir, conversation.contactId);
    await fs.mkdir(this.options.dataDir, { recursive: true });

    const trimmed: ImConversation = {
      ...conversation,
      messages: conversation.messages.slice(-this.options.maxHistoryMessages),
    };

    await fs.writeFile(filePath, JSON.stringify(trimmed, null, 2), 'utf-8');
  }

  async delete(contactId: string): Promise<void> {
    const filePath = getConversationFilePath(this.options.dataDir, contactId);
    try {
      await fs.unlink(filePath);
    } catch (error) {
      if (this.isEnoentError(error)) {
        return;
      }
      throw error;
    }
  }

  private createEmpty(contactId: string): ImConversation {
    return {
      contactId,
      sessionId: null,
      selectedModel: null,
      messages: [],
    };
  }

  private isEnoentError(error: unknown): boolean {
    return !!error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT';
  }
}
