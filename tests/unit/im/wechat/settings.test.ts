import {
  DEFAULT_WECHAT_BOT_SETTINGS,
  getWechatBotSettings,
  updateWechatBotSettings,
} from '../../../../src/im/wechat/settings';

describe('wechat settings', () => {
  it('returns defaults when settings bag is empty', () => {
    const settings: Record<string, unknown> = {};
    const result = getWechatBotSettings(settings);
    expect(result).toEqual(DEFAULT_WECHAT_BOT_SETTINGS);
  });

  it('returns defaults when wechatBot is not an object', () => {
    const settings: Record<string, unknown> = { wechatBot: 'invalid' };
    const result = getWechatBotSettings(settings);
    expect(result).toEqual(DEFAULT_WECHAT_BOT_SETTINGS);
  });

  it('parses stored settings', () => {
    const settings: Record<string, unknown> = {
      wechatBot: {
        enabled: true,
        allowedContact: 'Alice',
        systemPrompt: 'Custom prompt',
        autoApproveTools: true,
        maxHistoryMessages: 50,
      },
    };
    const result = getWechatBotSettings(settings);
    expect(result).toEqual({
      enabled: true,
      allowedContact: 'Alice',
      systemPrompt: 'Custom prompt',
      autoApproveTools: true,
      maxHistoryMessages: 50,
    });
  });

  it('trims string fields', () => {
    const settings: Record<string, unknown> = {
      wechatBot: {
        allowedContact: '  Bob  ',
        systemPrompt: '  Prompt  ',
      },
    };
    const result = getWechatBotSettings(settings);
    expect(result.allowedContact).toBe('Bob');
    expect(result.systemPrompt).toBe('Prompt');
  });

  it('falls back to default system prompt when empty', () => {
    const settings: Record<string, unknown> = {
      wechatBot: { systemPrompt: '   ' },
    };
    const result = getWechatBotSettings(settings);
    expect(result.systemPrompt).toBe(DEFAULT_WECHAT_BOT_SETTINGS.systemPrompt);
  });

  it('updates settings and persists into the bag', () => {
    const settings: Record<string, unknown> = {};
    const updated = updateWechatBotSettings(settings, {
      enabled: true,
      allowedContact: 'Charlie',
      maxHistoryMessages: 0,
    });
    expect(updated.enabled).toBe(true);
    expect(updated.allowedContact).toBe('Charlie');
    expect(updated.maxHistoryMessages).toBe(1);
    expect(settings.wechatBot).toEqual({
      enabled: true,
      allowedContact: 'Charlie',
      systemPrompt: DEFAULT_WECHAT_BOT_SETTINGS.systemPrompt,
      autoApproveTools: false,
      maxHistoryMessages: 1,
    });
  });
});
