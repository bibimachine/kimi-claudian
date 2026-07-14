import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { ILinkClient, loginWithQR, MessageItemType, MessageType } from 'weixin-ilink';

import { WechatGateway } from '../../../../src/im/wechat/WechatGateway';

jest.mock('weixin-ilink');

function createMockILinkClient(overrides: Partial<InstanceType<typeof ILinkClient>> = {}): InstanceType<typeof ILinkClient> {
  return {
    cursor: '',
    poll: jest.fn().mockResolvedValue({ ret: 0, msgs: [] }),
    sendText: jest.fn().mockResolvedValue(undefined),
    sendTextChunked: jest.fn().mockResolvedValue(1),
    sendMedia: jest.fn().mockResolvedValue(undefined),
    sendTyping: jest.fn().mockResolvedValue(undefined),
    getConfig: jest.fn().mockResolvedValue({}),
    getUploadUrl: jest.fn().mockResolvedValue({}),
    ...overrides,
  } as unknown as InstanceType<typeof ILinkClient>;
}

describe('WechatGateway', () => {
  let dataDir: string;
  let gateway: WechatGateway;

  beforeEach(async () => {
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wechat-gateway-'));
    gateway = new WechatGateway({ dataDir });
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await gateway.stop();
    await fs.rm(dataDir, { recursive: true, force: true });
  });

  it('initially reports idle status', () => {
    expect(gateway.getStatus().state).toBe('idle');
  });

  it('performs QR login when no credentials exist', async () => {
    const mockedLogin = jest.mocked(loginWithQR);
    mockedLogin.mockResolvedValue({
      botToken: 'token',
      accountId: 'account',
      baseUrl: 'https://ilinkai.weixin.qq.com',
      userId: 'user',
    });

    const mockedClient = jest.mocked(ILinkClient);
    mockedClient.mockImplementation(() => createMockILinkClient());

    const statusChanges: string[] = [];
    gateway.onStatusChange((status) => statusChanges.push(status.state));

    await gateway.start();

    expect(mockedLogin).toHaveBeenCalled();
    expect(gateway.getStatus().state).toBe('running');
    expect(statusChanges).toContain('running');
  });

  it('restores session from saved credentials', async () => {
    await fs.mkdir(dataDir, { recursive: true });
    await fs.writeFile(
      path.join(dataDir, 'credentials.json'),
      JSON.stringify({ botToken: 'saved-token', accountId: 'saved-account', baseUrl: 'https://ilinkai.weixin.qq.com', userId: 'saved-user' }),
      'utf-8',
    );

    const mockedClient = jest.mocked(ILinkClient);
    mockedClient.mockImplementation(() => createMockILinkClient());

    await gateway.start();

    expect(loginWithQR).not.toHaveBeenCalled();
    expect(gateway.getStatus().state).toBe('running');
  });

  it('dispatches incoming text messages to listeners', async () => {
    const mockedLogin = jest.mocked(loginWithQR);
    mockedLogin.mockResolvedValue({
      botToken: 'token',
      accountId: 'account',
      baseUrl: 'https://ilinkai.weixin.qq.com',
      userId: 'user',
    });

    let callCount = 0;
    const pollMock = jest.fn().mockImplementation(async () => {
      callCount += 1;
      if (callCount === 1) {
        return {
          ret: 0,
          msgs: [{
            message_type: MessageType.USER,
            from_user_id: 'sender-id',
            message_id: 123,
            create_time_ms: 123456789,
            item_list: [{ type: MessageItemType.TEXT, text_item: { text: 'Hello bot' } }],
          }],
        };
      }
      // Keep the poll loop alive until stop() is called.
      await new Promise((resolve) => setTimeout(resolve, 50));
      return { ret: 0, msgs: [] };
    });

    const mockedClient = jest.mocked(ILinkClient);
    mockedClient.mockImplementation(() => createMockILinkClient({ poll: pollMock }));

    const messages: { fromUserId: string; content: string }[] = [];
    gateway.onIncomingMessage((msg) => messages.push(msg));

    await gateway.start();
    await new Promise((resolve) => setTimeout(resolve, 100));
    await gateway.stop();

    expect(messages).toHaveLength(1);
    expect(messages[0].fromUserId).toBe('sender-id');
    expect(messages[0].content).toBe('Hello bot');
  });

  it('stops the poll loop cleanly', async () => {
    const mockedLogin = jest.mocked(loginWithQR);
    mockedLogin.mockResolvedValue({
      botToken: 'token',
      accountId: 'account',
      baseUrl: 'https://ilinkai.weixin.qq.com',
      userId: 'user',
    });

    const mockedClient = jest.mocked(ILinkClient);
    mockedClient.mockImplementation(() => createMockILinkClient());

    await gateway.start();
    await gateway.stop();

    expect(gateway.getStatus().state).toBe('stopped');
  });
});
