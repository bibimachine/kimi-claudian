import type { ToggleComponent } from 'obsidian';
import { Notice, Setting } from 'obsidian';

import { t } from '../../../i18n/i18n';
import type { ImGatewayStatus, ImLogEntry } from '../../../im/types';
import { updateWechatBotSettings } from '../../../im/wechat/settings';
import type ClaudianPlugin from '../../../main';
import { WechatQrModal } from './WechatQrModal';

export function renderWechatBotSettingsSection(container: HTMLElement, plugin: ClaudianPlugin): () => void {
  const settings = plugin.settings;
  const gateway = plugin.getWechatGateway();
  let currentQrModal: WechatQrModal | null = null;

  new Setting(container).setName(t('settings.wechatBot.heading')).setHeading();

  const statusEl = container.createDiv({ cls: 'claudian-wechat-status' });
  const enableStatusEl = container.createDiv({ cls: 'claudian-wechat-enable-status claudian-hidden' });
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
    let text: string;
    switch (status.state) {
      case 'starting':
        text = t('settings.wechatBot.status.starting');
        break;
      case 'qr_ready':
        text = t('settings.wechatBot.status.qrReady');
        break;
      case 'logged_in':
        text = t('settings.wechatBot.status.loggedIn', {
          userName: status.userName ?? t('settings.wechatBot.status.unknown'),
        });
        break;
      case 'running':
        text = t('settings.wechatBot.status.running', {
          userName: status.userName ?? t('settings.wechatBot.status.unknown'),
        });
        break;
      case 'error':
        text = t('settings.wechatBot.status.error', {
          message: status.errorMessage ?? t('settings.wechatBot.status.unknown'),
        });
        break;
      case 'stopped':
        text = t('settings.wechatBot.status.stopped');
        break;
      case 'idle':
      default:
        text = t('settings.wechatBot.status.idle');
    }
    statusEl.setText(text);

    if (status.state === 'idle' || status.state === 'stopped') {
      enableStatusEl.addClass('claudian-hidden');
    } else {
      enableStatusEl.removeClass('claudian-hidden');
      enableStatusEl.setText(t('settings.wechatBot.status.label', { status: text }));
    }

    if (status.qrCodeUrl && status.state === 'qr_ready') {
      qrContainer.empty();
      qrContainer.toggleClass('claudian-hidden', false);
      qrContainer.createEl('p', { text: t('settings.wechatBot.qr.scanPrompt') });
      const img = qrContainer.createEl('img', { cls: 'claudian-wechat-qr-image' });
      img.src = status.qrCodeUrl;
      img.alt = t('settings.wechatBot.qr.modalTitle');
      img.onerror = () => {
        qrContainer.createEl('p', {
          text: t('settings.wechatBot.qr.loadError'),
          cls: 'claudian-wechat-qr-error',
        });
      };
      if (!currentQrModal) {
        currentQrModal = new WechatQrModal(plugin, status.qrCodeUrl);
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
      new Notice(t('settings.wechatBot.notice.connected'));
    }
    if (previousState === 'starting' && status.state === 'error') {
      new Notice(
        t('settings.wechatBot.notice.failed', {
          message: status.errorMessage ?? t('settings.wechatBot.status.unknown'),
        })
      );
    }
  };

  const renderLogs = (logs: ImLogEntry[]): void => {
    logContainer.empty();
    if (logs.length === 0) {
      logContainer.createEl('p', {
        text: t('settings.wechatBot.events.noEvents'),
        cls: 'claudian-wechat-logs-empty',
      });
      return;
    }
    const list = logContainer.createEl('ul', { cls: 'claudian-wechat-log-list' });
    for (const entry of logs.slice(-20)) {
      const time = new Date(entry.timestamp).toLocaleTimeString();
      const item = list.createEl('li', { cls: 'claudian-wechat-log-item' });
      item.createEl('span', { text: `[${time}]`, cls: 'claudian-wechat-log-time' });
      item.createEl('span', {
        text: ` ${entry.summary}`,
        cls: `claudian-wechat-log-direction-${entry.direction}`,
      });
    }
  };

  let enableToggle: ToggleComponent | null = null;

  new Setting(container)
    .setName(t('settings.wechatBot.enable.name'))
    .setDesc(t('settings.wechatBot.enable.desc'))
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
              new Notice(t('settings.wechatBot.notice.failed', { message }));
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
    .setName(t('settings.wechatBot.gatewayControl.name'))
    .setDesc(t('settings.wechatBot.gatewayControl.desc'));

  controlSetting.addButton((button) => {
    button
      .setButtonText(t('settings.wechatBot.gatewayControl.relogin'))
      .setWarning()
      .onClick(async () => {
        button.setDisabled(true);
        button.setButtonText(t('settings.wechatBot.gatewayControl.relogging'));
        const previousState = gateway?.getStatus().state;
        try {
          await plugin.reloginWechatGateway();
          new Notice(t('settings.wechatBot.notice.reloaded'));
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          new Notice(t('settings.wechatBot.notice.gatewayFailed', { message }));
        }
        button.setDisabled(false);
        button.setButtonText(t('settings.wechatBot.gatewayControl.relogin'));
        renderStatus(previousState);
      });
  });

  new Setting(container)
    .setName(t('settings.wechatBot.allowedContact.name'))
    .setDesc(t('settings.wechatBot.allowedContact.desc'))
    .addText((text) =>
      text
        .setPlaceholder(t('settings.wechatBot.allowedContact.placeholder'))
        .setValue(settings.wechatBot.allowedContact)
        .onChange(async (value) => {
          updateWechatBotSettings(settings as unknown as Record<string, unknown>, { allowedContact: value });
          await plugin.saveSettings();
        })
    );

  new Setting(container)
    .setName(t('settings.wechatBot.systemPrompt.name'))
    .setDesc(t('settings.wechatBot.systemPrompt.desc'))
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
    .setName(t('settings.wechatBot.autoApproveTools.name'))
    .setDesc(t('settings.wechatBot.autoApproveTools.desc'))
    .addToggle((toggle) =>
      toggle
        .setValue(settings.wechatBot.autoApproveTools)
        .onChange(async (value) => {
          updateWechatBotSettings(settings as unknown as Record<string, unknown>, { autoApproveTools: value });
          await plugin.saveSettings();
        })
    );

  new Setting(container)
    .setName(t('settings.wechatBot.maxHistoryMessages.name'))
    .setDesc(t('settings.wechatBot.maxHistoryMessages.desc'))
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
    .setName(t('settings.wechatBot.resetSession.name'))
    .setDesc(t('settings.wechatBot.resetSession.desc'))
    .addButton((button) =>
      button
        .setButtonText(t('settings.wechatBot.resetSession.reset'))
        .setWarning()
        .onClick(async () => {
          const activeGateway = plugin.getWechatGateway();
          if (!activeGateway) {
            return;
          }
          button.setDisabled(true);
          button.setButtonText(t('settings.wechatBot.resetSession.resetting'));
          const previousState = activeGateway.getStatus().state;
          await plugin.reloadWechatGateway();
          button.setButtonText(t('settings.wechatBot.resetSession.reset'));
          button.setDisabled(false);
          renderStatus(previousState);
        })
    );

  const diagnosticSetting = new Setting(container)
    .setName(t('settings.wechatBot.networkDiagnostic.name'))
    .setDesc(t('settings.wechatBot.networkDiagnostic.desc'));

  const diagnosticResultEl = container.createEl('pre', {
    cls: 'claudian-wechat-diagnostic claudian-hidden',
  });

  diagnosticSetting.addButton((button) =>
    button
      .setButtonText(t('settings.wechatBot.networkDiagnostic.testConnection'))
      .onClick(async () => {
        button.setDisabled(true);
        button.setButtonText(t('settings.wechatBot.networkDiagnostic.testing'));
        diagnosticResultEl.toggleClass('claudian-hidden', true);
        try {
          const report = await plugin.getWechatGateway()?.diagnoseConnection();
          diagnosticResultEl.setText(report ?? t('settings.wechatBot.networkDiagnostic.gatewayNotInitialized'));
          diagnosticResultEl.toggleClass('claudian-hidden', false);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          diagnosticResultEl.setText(message);
          diagnosticResultEl.toggleClass('claudian-hidden', false);
        } finally {
          button.setDisabled(false);
          button.setButtonText(t('settings.wechatBot.networkDiagnostic.testConnection'));
        }
      })
  );

  container.createEl('h4', { text: t('settings.wechatBot.events.status') });
  renderStatus();

  container.createEl('h4', { text: t('settings.wechatBot.events.recentEvents') });
  renderLogs([]);

  const updateFromStatusChange = (status: ImGatewayStatus): void => {
    const previousState = status.state;
    renderStatus(previousState);
    if (status.state !== 'running' && status.state !== 'qr_ready' && status.state !== 'starting' && status.state !== 'logged_in') {
      enableToggle?.setValue(false);
    }
  };

  const unsubscribeStatus = gateway?.onStatusChange(updateFromStatusChange);
  const unsubscribeLog = gateway?.onLogChange(renderLogs);

  return () => {
    closeQrModal();
    unsubscribeStatus?.();
    unsubscribeLog?.();
  };
}
