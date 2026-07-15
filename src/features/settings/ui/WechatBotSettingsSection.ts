import type { ToggleComponent } from 'obsidian';
import { Notice, Setting } from 'obsidian';

import type { ImGatewayStatus, ImLogEntry } from '../../../im/types';
import { updateWechatBotSettings } from '../../../im/wechat/settings';
import type ClaudianPlugin from '../../../main';
import { WechatQrModal } from './WechatQrModal';

export function renderWechatBotSettingsSection(container: HTMLElement, plugin: ClaudianPlugin): void {
  const settings = plugin.settings;
  const gateway = plugin.getWechatGateway();
  let currentQrModal: WechatQrModal | null = null;

  new Setting(container).setName('Wechat bot').setHeading();

  const statusEl = container.createDiv({ cls: 'claudian-wechat-status' });
  const qrContainer = container.createDiv({ cls: 'claudian-wechat-qr-container claudian-hidden' });
  const logContainer = container.createDiv({ cls: 'claudian-wechat-logs' });

  const closeQrModal = (): void => {
    if (currentQrModal) {
      currentQrModal.close();
      currentQrModal = null;
    }
  };

  const renderStatus = (previousState?: ImGatewayStatus['state']): void => {
    const status = gateway?.getStatus() ?? { state: 'idle' };
    let text = 'Idle';
    switch (status.state) {
      case 'starting':
        text = 'Starting...';
        break;
      case 'qr_ready':
        text = 'Waiting for QR scan';
        break;
      case 'logged_in':
        text = `Logged in as ${status.userName ?? 'unknown'}`;
        break;
      case 'running':
        text = `Running${status.userName ? ` as ${status.userName}` : ''}`;
        break;
      case 'error':
        text = `Error: ${status.errorMessage ?? 'unknown'}`;
        break;
      case 'stopped':
        text = 'Stopped';
        break;
    }
    statusEl.setText(text);

    if (status.qrCodeUrl && status.state === 'qr_ready') {
      qrContainer.empty();
      qrContainer.toggleClass('claudian-hidden', false);
      qrContainer.createEl('p', { text: 'Scan this qr code with wechat:' });
      const img = qrContainer.createEl('img', { cls: 'claudian-wechat-qr-image' });
      img.src = status.qrCodeUrl;
      img.alt = 'Wechat login qr code';
      img.onerror = () => {
        qrContainer.createEl('p', { text: 'Could not load qr image. Use the re-login button to open it again.', cls: 'claudian-wechat-qr-error' });
      };
      if (!currentQrModal) {
        currentQrModal = new WechatQrModal(plugin.app, status.qrCodeUrl);
        currentQrModal.open();
        currentQrModal.onClose = () => {
          currentQrModal = null;
        };
      }
    } else {
      qrContainer.empty();
      qrContainer.toggleClass('claudian-hidden', true);
      if (status.state !== 'qr_ready') {
        closeQrModal();
      }
    }

    if (previousState === 'qr_ready' && status.state === 'logged_in') {
      new Notice('Wechat bot connected successfully');
    }
    if (previousState === 'starting' && status.state === 'error') {
      new Notice(`Wechat bot failed: ${status.errorMessage ?? 'unknown error'}`);
    }
  };

  const renderLogs = (logs: ImLogEntry[]): void => {
    logContainer.empty();
    if (logs.length === 0) {
      logContainer.createEl('p', { text: 'No recent events.', cls: 'claudian-wechat-logs-empty' });
      return;
    }
    const list = logContainer.createEl('ul', { cls: 'claudian-wechat-log-list' });
    for (const entry of logs.slice(-20)) {
      const time = new Date(entry.timestamp).toLocaleTimeString();
      const item = list.createEl('li', { cls: 'claudian-wechat-log-item' });
      item.createEl('span', { text: `[${time}]`, cls: 'claudian-wechat-log-time' });
      item.createEl('span', { text: ` ${entry.summary}`, cls: `claudian-wechat-log-direction-${entry.direction}` });
    }
  };

  let enableToggle: ToggleComponent | null = null;

  new Setting(container)
    .setName('Enable wechat bot')
    .setDesc('Connect the wechat gateway.')
    .addToggle((toggle) => {
      enableToggle = toggle;
      toggle
        .setValue(settings.wechatBot.enabled)
        .onChange(async (value) => {
          updateWechatBotSettings(settings as unknown as Record<string, unknown>, { enabled: value });
          await plugin.saveSettings();
          if (value) {
            const previousState = gateway?.getStatus().state;
            try {
              await plugin.reloadWechatGateway();
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              new Notice(`Wechat bot failed: ${message}`);
            }
            renderStatus(previousState);
          } else {
            const previousState = gateway?.getStatus().state;
            await plugin.getWechatGateway()?.stop();
            renderStatus(previousState);
          }
        });
    });

  const controlSetting = new Setting(container)
    .setName('Gateway control')
    .setDesc('Re-login or refresh the wechat gateway connection.');

  controlSetting.addButton((button) => {
    button
      .setButtonText('Re-login')
      .setWarning()
      .onClick(async () => {
        button.setDisabled(true);
        button.setButtonText('Relogging...');
        const previousState = gateway?.getStatus().state;
        try {
          await plugin.reloadWechatGateway();
          new Notice('Wechat gateway reloaded');
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          new Notice(`Wechat gateway failed: ${message}`);
        }
        button.setDisabled(false);
        button.setButtonText('Re-login');
        renderStatus(previousState);
      });
  });

  new Setting(container)
    .setName('Allowed contact')
    .setDesc('Only respond to messages from this contact (nickname or remark). Leave empty to respond to anyone.')
    .addText((text) =>
      text
        .setPlaceholder('Contact nickname')
        .setValue(settings.wechatBot.allowedContact)
        .onChange(async (value) => {
          updateWechatBotSettings(settings as unknown as Record<string, unknown>, { allowedContact: value });
          await plugin.saveSettings();
        })
    );

  new Setting(container)
    .setName('System prompt')
    .setDesc('The system prompt used for wechat conversations.')
    .addTextArea((textarea) => {
      textarea
        .setValue(settings.wechatBot.systemPrompt)
        .onChange(async (value) => {
          updateWechatBotSettings(settings as unknown as Record<string, unknown>, { systemPrompt: value });
          await plugin.saveSettings();
        });
      textarea.inputEl.rows = 4;
      textarea.inputEl.addClass('claudian-wechat-system-prompt');
    });

  new Setting(container)
    .setName('Auto-approve tools')
    .setDesc('Allow the bot to execute tools automatically without showing the approval modal. Use with caution.')
    .addToggle((toggle) =>
      toggle
        .setValue(settings.wechatBot.autoApproveTools)
        .onChange(async (value) => {
          updateWechatBotSettings(settings as unknown as Record<string, unknown>, { autoApproveTools: value });
          await plugin.saveSettings();
        })
    );

  new Setting(container)
    .setName('Max history messages')
    .setDesc('Number of recent messages to keep for context.')
    .addSlider((slider) =>
      slider
        .setLimits(1, 100, 1)
        .setValue(settings.wechatBot.maxHistoryMessages)
        .setDynamicTooltip()
        .onChange(async (value) => {
          updateWechatBotSettings(settings as unknown as Record<string, unknown>, { maxHistoryMessages: value });
          await plugin.saveSettings();
        })
    );

  new Setting(container)
    .setName('Reset session')
    .setDesc('Clear the current wechat conversation history and start a new kimi session.')
    .addButton((button) =>
      button
        .setButtonText('Reset')
        .setWarning()
        .onClick(async () => {
          const activeGateway = plugin.getWechatGateway();
          if (!activeGateway) {
            return;
          }
          button.setDisabled(true);
          button.setButtonText('Resetting...');
          const previousState = activeGateway.getStatus().state;
          await plugin.reloadWechatGateway();
          button.setButtonText('Reset');
          button.setDisabled(false);
          renderStatus(previousState);
        })
    );

  const diagnosticSetting = new Setting(container)
    .setName('Network diagnostic')
    .setDesc('Test whether Obsidian can reach the wechat ilink endpoint.');

  const diagnosticResultEl = container.createEl('pre', {
    cls: 'claudian-wechat-diagnostic claudian-hidden',
  });

  diagnosticSetting.addButton((button) =>
    button
      .setButtonText('Test connection')
      .onClick(async () => {
        button.setDisabled(true);
        button.setButtonText('Testing...');
        diagnosticResultEl.toggleClass('claudian-hidden', true);
        try {
          const report = await plugin.getWechatGateway()?.diagnoseConnection();
          diagnosticResultEl.setText(report ?? 'Gateway not initialized.');
          diagnosticResultEl.toggleClass('claudian-hidden', false);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          diagnosticResultEl.setText(`Diagnostic error: ${message}`);
          diagnosticResultEl.toggleClass('claudian-hidden', false);
        } finally {
          button.setDisabled(false);
          button.setButtonText('Test connection');
        }
      })
  );

  container.createEl('h4', { text: 'Status' });
  renderStatus();

  container.createEl('h4', { text: 'Recent events' });
  renderLogs([]);

  const updateFromStatusChange = (status: ImGatewayStatus): void => {
    const previousState = status.state;
    renderStatus(previousState);
    if (status.state !== 'running' && status.state !== 'qr_ready' && status.state !== 'starting' && status.state !== 'logged_in') {
      enableToggle?.setValue(false);
    }
  };

  gateway?.onStatusChange(updateFromStatusChange);
  gateway?.onLogChange(renderLogs);
}
