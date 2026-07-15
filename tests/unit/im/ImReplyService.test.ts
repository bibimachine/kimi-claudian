import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { ProviderRegistry } from '../../../src/core/providers/ProviderRegistry';
import type { ChatRuntime } from '../../../src/core/runtime/ChatRuntime';
import { ImReplyService } from '../../../src/im/ImReplyService';
import { ImSessionStorage } from '../../../src/im/ImSessionStorage';
import type { ImGateway, ImIncomingMessage } from '../../../src/im/types';
import { DEFAULT_WECHAT_BOT_SETTINGS } from '../../../src/im/wechat/settings';
import type ClaudianPlugin from '../../../src/main';

jest.mock('../../../src/core/providers/ProviderRegistry');

describe('ImReplyService', () => {
  let dataDir: string;
  let storage: ImSessionStorage;
  let plugin: {
    settings: Record<string, unknown>;
    saveSettings: jest.Mock;
    app: Record<string, unknown>;
    getConversationSync: jest.Mock;
    createConversation: jest.Mock;
    updateConversation: jest.Mock;
  };
  let service: ImReplyService;
  let gateway: { sendText: jest.Mock; id: string };

  beforeEach(async () => {
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'im-reply-'));
    storage = new ImSessionStorage({ dataDir, maxHistoryMessages: 20 });
    plugin = {
      settings: {
        wechatBot: { ...DEFAULT_WECHAT_BOT_SETTINGS },
        systemPrompt: '',
      },
      saveSettings: jest.fn(),
      app: {},
      getConversationSync: jest.fn().mockReturnValue(null),
      createConversation: jest.fn().mockResolvedValue({
        id: 'wechat-user1',
        providerId: 'kimi',
        title: 'user1',
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        sessionId: null,
      }),
      updateConversation: jest.fn().mockResolvedValue(undefined),
    };
    service = new ImReplyService({ plugin: plugin as unknown as ClaudianPlugin, storage });
    gateway = { sendText: jest.fn().mockResolvedValue(undefined), id: 'wechat' };

    jest.clearAllMocks();
  });

  afterEach(async () => {
    await service.stopAll();
    await fs.rm(dataDir, { recursive: true, force: true });
  });

  function createMockRuntime(chunks: Array<{ type: string; content?: string }>): ChatRuntime {
    const runtime = {
      providerId: 'kimi',
      syncConversationState: jest.fn(),
      prepareTurn: jest.fn().mockReturnValue({ request: { text: '' }, persistedContent: '', prompt: '', isCompact: false, mcpMentions: new Set() }),
      query: jest.fn(async function *() {
        for (const chunk of chunks) {
          yield chunk;
        }
      }),
      setApprovalCallback: jest.fn(),
      getSessionId: jest.fn().mockReturnValue('kimi-session-1'),
      cleanup: jest.fn(),
    } as unknown as ChatRuntime;
    return runtime;
  }

  it('ignores messages when disabled', async () => {
    plugin.settings.wechatBot = { ...DEFAULT_WECHAT_BOT_SETTINGS, enabled: false };
    const runtime = createMockRuntime([{ type: 'text', content: 'Reply' }]);
    jest.mocked(ProviderRegistry.createChatRuntime).mockReturnValue(runtime);

    await service.handleIncomingMessage(gateway as unknown as ImGateway, {
      id: '1',
      fromUserId: 'user1',
      content: 'Hello',
      timestamp: Date.now(),
    } as ImIncomingMessage);

    expect(ProviderRegistry.createChatRuntime).not.toHaveBeenCalled();
    expect(gateway.sendText).not.toHaveBeenCalled();
  });

  it('ignores messages from non-allowed contacts', async () => {
    plugin.settings.wechatBot = { ...DEFAULT_WECHAT_BOT_SETTINGS, enabled: true, allowedContact: 'Alice' };
    const runtime = createMockRuntime([{ type: 'text', content: 'Reply' }]);
    jest.mocked(ProviderRegistry.createChatRuntime).mockReturnValue(runtime);

    await service.handleIncomingMessage(gateway as unknown as ImGateway, {
      id: '1',
      fromUserId: 'user1',
      fromUserName: 'Bob',
      content: 'Hello',
      timestamp: Date.now(),
    } as ImIncomingMessage);

    expect(ProviderRegistry.createChatRuntime).not.toHaveBeenCalled();
    expect(gateway.sendText).not.toHaveBeenCalled();
  });

  it('generates a reply and sends it back', async () => {
    plugin.settings.wechatBot = { ...DEFAULT_WECHAT_BOT_SETTINGS, enabled: true };
    const runtime = createMockRuntime([{ type: 'text', content: 'Hello back' }]);
    jest.mocked(ProviderRegistry.createChatRuntime).mockReturnValue(runtime);

    await service.handleIncomingMessage(gateway as unknown as ImGateway, {
      id: '1',
      fromUserId: 'user1',
      fromUserName: 'user1',
      content: 'Hello',
      timestamp: Date.now(),
    } as ImIncomingMessage);

    expect(ProviderRegistry.createChatRuntime).toHaveBeenCalledWith({ plugin: plugin, providerId: 'kimi' });
    expect(gateway.sendText).toHaveBeenCalledWith('user1', 'Hello back');
    expect(runtime.cleanup).toHaveBeenCalled();
  });

  it('sets auto-approve callback when configured', async () => {
    plugin.settings.wechatBot = { ...DEFAULT_WECHAT_BOT_SETTINGS, enabled: true, autoApproveTools: true };
    const runtime = createMockRuntime([{ type: 'text', content: 'Done' }]);
    jest.mocked(ProviderRegistry.createChatRuntime).mockReturnValue(runtime);

    await service.handleIncomingMessage(gateway as unknown as ImGateway, {
      id: '1',
      fromUserId: 'user1',
      content: 'Create a note',
      timestamp: Date.now(),
    } as ImIncomingMessage);

    expect(runtime.setApprovalCallback).toHaveBeenCalled();
    const approvalFn = jest.mocked(runtime.setApprovalCallback).mock.calls[0][0];
    await expect(approvalFn?.('tool', {}, 'desc')).resolves.toBe('allow');
  });

  it('temporarily overrides system prompt for the query', async () => {
    plugin.settings.systemPrompt = 'global-prompt';
    plugin.settings.wechatBot = { ...DEFAULT_WECHAT_BOT_SETTINGS, enabled: true, systemPrompt: 'wechat-prompt' };
    const runtime = createMockRuntime([{ type: 'text', content: 'Reply' }]);
    jest.mocked(ProviderRegistry.createChatRuntime).mockReturnValue(runtime);

    await service.handleIncomingMessage(gateway as unknown as ImGateway, {
      id: '1',
      fromUserId: 'user1',
      content: 'Hello',
      timestamp: Date.now(),
    } as ImIncomingMessage);

    expect(plugin.settings.systemPrompt).toBe('global-prompt');
  });

  it('reports errors back to the user', async () => {
    plugin.settings.wechatBot = { ...DEFAULT_WECHAT_BOT_SETTINGS, enabled: true };
    jest.mocked(ProviderRegistry.createChatRuntime).mockImplementation(() => {
      throw new Error('Kimi not ready');
    });

    await service.handleIncomingMessage(gateway as unknown as ImGateway, {
      id: '1',
      fromUserId: 'user1',
      content: 'Hello',
      timestamp: Date.now(),
    } as ImIncomingMessage);

    expect(gateway.sendText).toHaveBeenCalledWith('user1', expect.stringContaining('Kimi not ready'));
  });
});
