import type { AuxQueryConfig, AuxQueryRunner } from '../../../core/auxiliary/AuxQueryRunner';
import { getRuntimeEnvironmentText } from '../../../core/providers/providerEnvironment';
import type ClaudianPlugin from '../../../main';
import { getVaultPath } from '../../../utils/path';
import {
  AcpClientConnection,
  AcpJsonRpcTransport,
  AcpSessionUpdateNormalizer,
  AcpSubprocess,
} from '../../acp';
import { buildKimiRuntimeEnv } from './KimiRuntimeEnvironment';

export class KimiAuxQueryRunner implements AuxQueryRunner {
  private connection: AcpClientConnection | null = null;
  private currentLaunchKey: string | null = null;
  private process: AcpSubprocess | null = null;
  private sessionId: string | null = null;
  private readonly sessionUpdateNormalizer = new AcpSessionUpdateNormalizer();
  private transport: AcpJsonRpcTransport | null = null;

  constructor(
    private readonly plugin: ClaudianPlugin,
  ) {}

  async query(config: AuxQueryConfig, prompt: string): Promise<string> {
    const cwd = getVaultPath(this.plugin.app) ?? process.cwd();
    await this.ensureReady(cwd);

    if (!this.connection) {
      throw new Error('Kimi Code CLI runtime is not ready.');
    }

    if (!this.sessionId) {
      const sessionId = await this.createSession(cwd);
      if (!sessionId) {
        throw new Error('Failed to create a Kimi Code CLI session.');
      }
    }

    const sessionId = this.sessionId!;
    this.sessionUpdateNormalizer.reset();
    let accumulatedText = '';
    const removeListener = this.connection.onSessionNotification((notification) => {
      if (notification.sessionId !== sessionId) {
        return;
      }

      const normalized = this.sessionUpdateNormalizer.normalize(notification.update);
      if (normalized.type !== 'message_chunk' || normalized.role !== 'assistant') {
        return;
      }

      for (const chunk of normalized.streamChunks) {
        if (chunk.type !== 'text') {
          continue;
        }

        accumulatedText += chunk.content;
        config.onTextChunk?.(accumulatedText);
      }
    });

    const abortHandler = () => {
      void this.reset();
    };
    config.abortController?.signal.addEventListener('abort', abortHandler, { once: true });

    try {
      if (config.abortController?.signal.aborted) {
        throw new Error('Cancelled');
      }

      await this.connection.prompt({
        prompt: [{ type: 'text', text: prompt }],
        sessionId,
      });

      if (config.abortController?.signal.aborted) {
        throw new Error('Cancelled');
      }

      return accumulatedText;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Kimi Code CLI request failed';
      const stderr = this.process?.getStderrSnapshot();
      throw new Error(
        stderr ? `${message}\n\n${stderr}` : message,
        error instanceof Error ? { cause: error } : undefined,
      );
    } finally {
      config.abortController?.signal.removeEventListener('abort', abortHandler);
      removeListener();
    }
  }

  reset(): void {
    this.sessionId = null;
    this.connection?.dispose();
    this.connection = null;
    this.transport?.dispose();
    this.transport = null;
    if (this.process) {
      void this.process.shutdown().catch(() => {});
    }
    this.process = null;
    this.sessionUpdateNormalizer.reset();
  }

  private async ensureReady(cwd: string): Promise<void> {
    const resolvedCliPath = this.plugin.getResolvedProviderCliPath('kimi') ?? 'kimi';
    const settings = this.plugin.settings as unknown as Record<string, unknown>;
    const runtimeEnv = buildKimiRuntimeEnv(settings, resolvedCliPath);
    const nextLaunchKey = JSON.stringify({
      command: resolvedCliPath,
      envText: getRuntimeEnvironmentText(settings, 'kimi'),
    });

    const shouldRestart = !this.process
      || !this.transport
      || !this.connection
      || !this.process.isAlive()
      || this.transport.isClosed
      || this.currentLaunchKey !== nextLaunchKey;

    if (!shouldRestart) {
      return;
    }

    this.reset();
    await this.startProcess({
      command: resolvedCliPath,
      cwd,
      runtimeEnv,
    });
    this.currentLaunchKey = nextLaunchKey;
  }

  private async createSession(cwd: string): Promise<string | null> {
    if (!this.connection) {
      return null;
    }

    try {
      const response = await this.connection.newSession({
        cwd,
        mcpServers: [],
      });
      this.sessionId = response.sessionId;
      return response.sessionId;
    } catch {
      return null;
    }
  }

  private async startProcess(params: {
    command: string;
    cwd: string;
    runtimeEnv: NodeJS.ProcessEnv;
  }): Promise<void> {
    const processEnv: NodeJS.ProcessEnv = {
      ...process.env,
      ...params.runtimeEnv,
      PATH: params.runtimeEnv.PATH,
    };

    this.process = new AcpSubprocess({
      args: ['acp'],
      command: params.command,
      cwd: params.cwd,
      env: processEnv,
    });
    this.process.start();

    this.transport = new AcpJsonRpcTransport({
      input: this.process.stdout,
      onClose: (listener) => this.process!.onClose(listener),
      output: this.process.stdin,
    });

    this.connection = new AcpClientConnection({
      clientInfo: {
        name: 'claudian',
        version: this.plugin.manifest?.version ?? '0.0.0',
      },
      delegate: {
        onSessionNotification: () => Promise.resolve(),
        requestPermission: () => Promise.resolve({
          outcome: { outcome: 'cancelled' },
        }),
      },
      transport: this.transport,
    });

    this.transport.start();
    await this.connection.initialize();
  }
}
