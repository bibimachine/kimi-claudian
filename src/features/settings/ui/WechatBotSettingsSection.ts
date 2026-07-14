import { Setting } from 'obsidian';

import type { ImLogEntry } from '../../../im/types';
import { updateWechatBotSettings } from '../../../im/wechat/settings';
import type ClaudianPlugin from '../../../main';

export function renderWechatBotSettingsSection(container: HTMLElement, plugin: ClaudianPlugin): void {
  const settings = plugin.settings;
  const gateway = plugin.getWechatGateway();

  new Setting(container).setName('Wechat bot').setHeading();

  const statusEl = container.createDiv({ cls: 'claudian-wechat-status' });
  const qrContainer = container.createDiv({ cls: 'claudian-wechat-qr-container claudian-hidden' });
  const logContainer = container.createDiv({ cls: 'claudian-wechat-logs' });

  const renderStatus = (): void => {
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

    if (status.qrCodeUrl) {
      qrContainer.empty();
      qrContainer.toggleClass('claudian-hidden', false);
      qrContainer.createEl('p', { text: 'Scan this qr code with wechat:' });
      const img = qrContainer.createEl('img', { cls: 'claudian-wechat-qr-image' });
      img.src = status.qrCodeUrl;
      img.alt = 'WeChat login QR code';
    } else {
      qrContainer.empty();
      qrContainer.toggleClass('claudian-hidden', true);
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

  new Setting(container)
    .setName('Enable wechat bot')
    .setDesc('Start the wechat gateway when the plugin loads.')
    .addToggle((toggle) =>
      toggle
        .setValue(settings.wechatBot.enabled)
        .onChange(async (value) => {
          updateWechatBotSettings(settings as unknown as Record<string, unknown>, { enabled: value });
          await plugin.saveSettings();
          if (value) {
            await plugin.reloadWechatGateway();
          } else {
            await plugin.getWechatGateway()?.stop();
          }
          renderStatus();
        })
    );

  const controlSetting = new Setting(container)
    .setName('Gateway control')
    .setDesc('Start, stop, or re-login the wechat gateway.');

  controlSetting.addButton((button) =>
    button
      .setButtonText('Start')
      .onClick(async () => {
        await plugin.getWechatGateway()?.start().catch(() => {});
        renderStatus();
      })
  );

  controlSetting.addButton((button) =>
    button
      .setButtonText('Stop')
      .onClick(async () => {
        await plugin.getWechatGateway()?.stop();
        renderStatus();
      })
  );

  controlSetting.addButton((button) =>
    button
      .setButtonText('Re-login')
      .setWarning()
      .onClick(async () => {
        await plugin.reloadWechatGateway();
        renderStatus();
      })
  );

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
          const gateway = plugin.getWechatGateway();
          if (!gateway) {
            return;
          }
          // Session storage files are keyed by contact id; clearing all is safest for now.
          // A future improvement could track the active contact id in the gateway.
          button.setDisabled(true);
          button.setButtonText('Resetting...');
          await plugin.reloadWechatGateway();
          button.setButtonText('Reset');
          button.setDisabled(false);
        })
    );

  container.createEl('h4', { text: 'Status' });
  renderStatus();

  container.createEl('h4', { text: 'Recent events' });
  renderLogs([]);

  gateway?.onStatusChange(renderStatus);
  gateway?.onLogChange(renderLogs);
}
