import { Modal } from 'obsidian';

import { t } from '../../../i18n/i18n';
import type ClaudianPlugin from '../../../main';

export class WechatQrModal extends Modal {
  private qrCodeUrl: string;

  constructor(plugin: ClaudianPlugin, qrCodeUrl: string) {
    super(plugin.app);
    this.qrCodeUrl = qrCodeUrl;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('claudian-wechat-qr-modal');
    contentEl.createEl('h2', { text: t('settings.wechatBot.qr.modalTitle') });
    contentEl.createEl('p', { text: t('settings.wechatBot.qr.modalDesc') });

    contentEl.createEl('img', {
      cls: 'claudian-wechat-qr-modal-image',
      attr: { src: this.qrCodeUrl, alt: t('settings.wechatBot.qr.modalTitle') },
    });

    contentEl.createEl('p', {
      text: t('settings.wechatBot.qr.fallbackLabel'),
      cls: 'claudian-wechat-qr-modal-label',
    });
    contentEl.createEl('a', {
      text: this.qrCodeUrl,
      href: this.qrCodeUrl,
      cls: 'claudian-wechat-qr-modal-link',
    });

    const buttonRow = contentEl.createDiv({ cls: 'claudian-wechat-qr-modal-buttons' });
    buttonRow.createEl('button', { text: t('settings.wechatBot.qr.done') }).addEventListener('click', () => {
      this.close();
    });
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
  }
}
