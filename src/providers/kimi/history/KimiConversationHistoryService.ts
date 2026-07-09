import type { ProviderConversationHistoryService } from '../../../core/providers/types';
import type { Conversation } from '../../../core/types';
import { getKimiState } from '../types';
import { loadKimiSessionMessages } from './KimiHistoryStore';

export class KimiConversationHistoryService implements ProviderConversationHistoryService {
  private hydratedKeys = new Map<string, string>();

  async hydrateConversationHistory(
    conversation: Conversation,
    vaultPath: string | null,
  ): Promise<void> {
    const sessionId = conversation.sessionId;
    if (!sessionId) {
      this.hydratedKeys.delete(conversation.id);
      return;
    }

    const state = getKimiState(conversation.providerState);
    const hydrationKey = `${sessionId}::${state.sessionFile ?? vaultPath ?? ''}`;
    if (
      conversation.messages.length > 0
      && this.hydratedKeys.get(conversation.id) === hydrationKey
    ) {
      return;
    }

    const messages = await loadKimiSessionMessages(sessionId, vaultPath);
    if (messages.length === 0) {
      this.hydratedKeys.delete(conversation.id);
      return;
    }

    conversation.messages = messages;
    this.hydratedKeys.set(conversation.id, hydrationKey);
  }

  async deleteConversationSession(
    _conversation: Conversation,
    _vaultPath: string | null,
  ): Promise<void> {
    // Never mutate Kimi Code CLI native history.
  }

  resolveSessionIdForConversation(conversation: Conversation | null): string | null {
    return conversation?.sessionId ?? null;
  }

  isPendingForkConversation(_conversation: Conversation): boolean {
    return false;
  }

  buildForkProviderState(
    _sourceSessionId: string,
    _resumeAt: string,
    _sourceProviderState?: Record<string, unknown>,
  ): Record<string, unknown> {
    return {};
  }

  buildPersistedProviderState(
    _conversation: Conversation,
  ): Record<string, unknown> | undefined {
    return undefined;
  }
}
