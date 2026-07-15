import type { App } from 'obsidian';
import { Modal } from 'obsidian';

export class WechatQrModal extends Modal {
  private qrCodeUrl: string;

  constructor(app: App, qrCodeUrl: string) {
    super(app);
    this.qrCodeUrl = qrCodeUrl;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('claudian-wechat-qr-modal');
    contentEl.createEl('h2', { text: 'Scan with wechat' });
    contentEl.createEl('p', { text: 'Use wechat to scan this qr code to connect the bot.' });

    contentEl.createEl('img', {
      cls: 'claudian-wechat-qr-modal-image',
      attr: { src: this.qrCodeUrl, alt: 'Wechat login qr code' },
    });

    contentEl.createEl('p', { text: 'If the image does not load, open this link:', cls: 'claudian-wechat-qr-modal-label' });
    contentEl.createEl('a', {
      text: this.qrCodeUrl,
      href: this.qrCodeUrl,
      cls: 'claudian-wechat-qr-modal-link',
    });

    const buttonRow = contentEl.createDiv({ cls: 'claudian-wechat-qr-modal-buttons' });
    buttonRow.createEl('button', { text: 'Done' }).addEventListener('click', () => {
      this.close();
    });
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
  }
}
