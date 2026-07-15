import { ProviderRegistry } from '../core/providers/ProviderRegistry';
import type { ChatRuntime } from '../core/runtime/ChatRuntime';
import type { ChatTurnRequest } from '../core/runtime/types';
import type { ChatMessage } from '../core/types';
import type ClaudianPlugin from '../main';
import type { ImSessionStorage } from './ImSessionStorage';
import type { ImGateway, ImIncomingMessage } from './types';
import { getWechatBotSettings } from './wechat/settings';

export interface ImReplyServiceOptions {
  plugin: ClaudianPlugin;
  storage: ImSessionStorage;
}

export class ImReplyService {
  private plugin: ClaudianPlugin;
  private storage: ImSessionStorage;
  private activeRuntimes = new Set<ChatRuntime>();

  constructor(options: ImReplyServiceOptions) {
    this.plugin = options.plugin;
    this.storage = options.storage;
  }

  async handleIncomingMessage(gateway: ImGateway, message: ImIncomingMessage): Promise<void> {
    const settings = getWechatBotSettings(this.plugin.settings as unknown as Record<string, unknown>);

    if (!settings.enabled) {
      return;
    }

    const contactIdentifier = message.fromUserName || message.fromUserId;
    if (settings.allowedContact && contactIdentifier !== settings.allowedContact) {
      return;
    }

    let runtime: ChatRuntime | null = null;
    try {
      const conversation = await this.storage.load(message.fromUserId);
      const userMsg = this.createUserMessage(message);
      conversation.messages.push(userMsg);

      const assistantMsg = this.createAssistantMessage();
      conversation.messages.push(assistantMsg);

      runtime = ProviderRegistry.createChatRuntime({ plugin: this.plugin, providerId: 'kimi' });
      this.activeRuntimes.add(runtime);

      const originalSystemPrompt = this.plugin.settings.systemPrompt;
      this.plugin.settings.systemPrompt = settings.systemPrompt;

      try {
        runtime.syncConversationState(
          {
            sessionId: conversation.sessionId,
            providerState: conversation.providerState,
            selectedModel: conversation.selectedModel ?? undefined,
          },
          [],
        );

        if (settings.autoApproveTools) {
          runtime.setApprovalCallback(async () => 'allow');
        }

        const turnRequest: ChatTurnRequest = {
          text: message.content,
          externalContextPaths: [],
          enabledMcpServers: new Set(),
        };
        const preparedTurn = runtime.prepareTurn(turnRequest);

        let replyText = '';
        for await (const chunk of runtime.query(preparedTurn, conversation.messages.slice(0, -2))) {
          if (chunk.type === 'text') {
            replyText += chunk.content;
            assistantMsg.content = replyText;
          } else if (chunk.type === 'error') {
            assistantMsg.content = `Error: ${chunk.content}`;
            break;
          } else if (chunk.type === 'done') {
            break;
          }
        }

        assistantMsg.content = replyText || assistantMsg.content || '...';

        const sessionId = runtime.getSessionId();
        if (sessionId) {
          conversation.sessionId = sessionId;
        }
      } finally {
        this.plugin.settings.systemPrompt = originalSystemPrompt;
        this.activeRuntimes.delete(runtime);
        runtime.cleanup();
      }

      await this.storage.save(conversation);
      await this.syncToClaudianConversation(contactIdentifier, conversation);

      if (assistantMsg.content) {
        await gateway.sendText(message.fromUserId, assistantMsg.content);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      try {
        await gateway.sendText(message.fromUserId, `Sorry, I encountered an error: ${errorMessage}`);
      } catch {
        // Best-effort error reporting.
      }
    } finally {
      if (runtime && this.activeRuntimes.has(runtime)) {
        this.activeRuntimes.delete(runtime);
        runtime.cleanup();
      }
    }
  }

  private async syncToClaudianConversation(contactName: string, imConversation: { contactId: string; sessionId: string | null; selectedModel: string | null; messages: ChatMessage[] }): Promise<void> {
    const conversationId = `wechat-${imConversation.contactId}`;
    const existing = this.plugin.getConversationSync(conversationId);
    const now = Date.now();

    if (existing) {
      await this.plugin.updateConversation(conversationId, {
        messages: imConversation.messages,
        sessionId: imConversation.sessionId,
        selectedModel: imConversation.selectedModel ?? undefined,
        lastResponseAt: now,
        updatedAt: now,
      });
    } else {
      const conversation = await this.plugin.createConversation({
        providerId: 'kimi',
        sessionId: imConversation.sessionId ?? conversationId,
        selectedModel: imConversation.selectedModel ?? undefined,
      });
      // Override the generated id/title so the conversation is keyed by contact.
      conversation.id = conversationId;
      conversation.title = contactName || conversationId;
      conversation.messages = imConversation.messages;
      conversation.lastResponseAt = now;
      await this.plugin.updateConversation(conversationId, {
        title: conversation.title,
        messages: conversation.messages,
        lastResponseAt: now,
      });
    }
  }

  async stopAll(): Promise<void> {
    for (const runtime of this.activeRuntimes) {
      runtime.cancel();
      runtime.cleanup();
    }
    this.activeRuntimes.clear();
  }

  private createUserMessage(message: ImIncomingMessage): ChatMessage {
    return {
      id: this.generateId(),
      role: 'user',
      content: message.content,
      timestamp: message.timestamp,
    };
  }

  private createAssistantMessage(): ChatMessage {
    return {
      id: this.generateId(),
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
    };
  }

  private generateId(): string {
    return `msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }
}
