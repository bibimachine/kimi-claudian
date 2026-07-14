import type { WechatBotSettings } from '../../core/types/settings';

export type { WechatBotSettings } from '../../core/types/settings';

export const DEFAULT_WECHAT_BOT_SETTINGS: Readonly<WechatBotSettings> = Object.freeze({
  enabled: false,
  allowedContact: '',
  systemPrompt: 'You are a helpful Obsidian assistant. You can read and write notes in the vault. Keep replies concise and actionable.',
  autoApproveTools: false,
  maxHistoryMessages: 20,
});

export function getWechatBotSettings(settings: Record<string, unknown>): WechatBotSettings {
  const raw = settings.wechatBot;
  const bag = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {};

  return {
    enabled: typeof bag.enabled === 'boolean' ? bag.enabled : DEFAULT_WECHAT_BOT_SETTINGS.enabled,
    allowedContact: typeof bag.allowedContact === 'string'
      ? bag.allowedContact.trim()
      : DEFAULT_WECHAT_BOT_SETTINGS.allowedContact,
    systemPrompt: typeof bag.systemPrompt === 'string' && bag.systemPrompt.trim()
      ? bag.systemPrompt.trim()
      : DEFAULT_WECHAT_BOT_SETTINGS.systemPrompt,
    autoApproveTools: typeof bag.autoApproveTools === 'boolean'
      ? bag.autoApproveTools
      : DEFAULT_WECHAT_BOT_SETTINGS.autoApproveTools,
    maxHistoryMessages: typeof bag.maxHistoryMessages === 'number' && bag.maxHistoryMessages > 0
      ? Math.floor(bag.maxHistoryMessages)
      : DEFAULT_WECHAT_BOT_SETTINGS.maxHistoryMessages,
  };
}

export function updateWechatBotSettings(
  settings: Record<string, unknown>,
  updates: Partial<WechatBotSettings>,
): WechatBotSettings {
  const current = getWechatBotSettings(settings);
  const next: WechatBotSettings = {
    ...current,
    ...updates,
    maxHistoryMessages: updates.maxHistoryMessages !== undefined
      ? Math.max(1, Math.floor(updates.maxHistoryMessages))
      : current.maxHistoryMessages,
  };

  settings.wechatBot = { ...next };
  return next;
}
