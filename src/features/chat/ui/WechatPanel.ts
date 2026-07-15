import type { Component } from 'obsidian';
import { Notice, setIcon } from 'obsidian';

import type { ImIncomingMessage, ImLogEntry } from '../../../im/types';
import type ClaudianPlugin from '../../../main';
import { MessageRenderer } from '../rendering/MessageRenderer';

export interface WechatPanelOptions {
  onClose?: () => void;
}

export class WechatPanel {
  private plugin: ClaudianPlugin;
  private container: HTMLElement;
  private component: Component;
  private messageRenderer: MessageRenderer;
  private selectedContactId: string | null = null;
  private contactListEl: HTMLElement;
  private messagesEl: HTMLElement;
  private headerTitleEl: HTMLElement;
  private unsubscribeMessages: (() => void) | null = null;
  private unsubscribeStatus: (() => void) | null = null;
  private onClose?: () => void;

  constructor(plugin: ClaudianPlugin, container: HTMLElement, component: Component, options: WechatPanelOptions = {}) {
    this.plugin = plugin;
    this.container = container;
    this.component = component;
    this.onClose = options.onClose;

    this.container.empty();
    this.container.addClass('claudian-wechat-panel');

    const header = this.container.createDiv({ cls: 'claudian-wechat-panel-header' });
    const backBtn = header.createDiv({ cls: 'claudian-wechat-panel-back' });
    setIcon(backBtn, 'arrow-left');
    backBtn.setAttribute('aria-label', 'Back to chat');
    backBtn.addEventListener('click', () => {
      this.onClose?.();
    });
    this.headerTitleEl = header.createDiv({ cls: 'claudian-wechat-panel-title' });
    this.headerTitleEl.setText('Wechat conversations');

    const body = this.container.createDiv({ cls: 'claudian-wechat-panel-body' });
    this.contactListEl = body.createDiv({ cls: 'claudian-wechat-panel-contacts' });
    const messagesContainer = body.createDiv({ cls: 'claudian-wechat-panel-messages-container' });
    this.messagesEl = messagesContainer.createDiv({ cls: 'claudian-wechat-panel-messages' });

    this.messageRenderer = new MessageRenderer(
      plugin,
      component,
      this.messagesEl,
      undefined,
      undefined,
      () => ({
        providerId: 'kimi',
        supportsPersistentRuntime: false,
        supportsNativeHistory: false,
        supportsPlanMode: false,
        supportsRewind: false,
        supportsFork: false,
        supportsProviderCommands: false,
        supportsImageAttachments: false,
        supportsInstructionMode: false,
        supportsMcpTools: false,
        supportsTurnSteer: false,
        reasoningControl: 'none',
      }),
    );

    this.renderContacts();
    this.bindGateway();
  }

  show(): void {
    this.container.removeClass('claudian-hidden');
    this.renderContacts();
    if (this.selectedContactId) {
      this.selectContact(this.selectedContactId);
    }
  }

  hide(): void {
    this.container.addClass('claudian-hidden');
  }

  isVisible(): boolean {
    return !this.container.hasClass('claudian-hidden');
  }

  destroy(): void {
    this.unsubscribeMessages?.();
    this.unsubscribeStatus?.();
    this.container.empty();
  }

  private bindGateway(): void {
    const gateway = this.plugin.getWechatGateway();
    if (!gateway) {
      return;
    }

    this.unsubscribeMessages = gateway.onIncomingMessage((msg: ImIncomingMessage) => {
      this.handleIncomingMessage(msg);
    });

    this.unsubscribeStatus = gateway.onLogChange((logs: ImLogEntry[]) => {
      const lastLog = logs[logs.length - 1];
      if (lastLog?.direction === 'out') {
        this.refreshSelectedContact();
      }
    });
  }

  private handleIncomingMessage(msg: ImIncomingMessage): void {
    this.renderContacts();
    if (this.selectedContactId === msg.fromUserId) {
      this.selectContact(msg.fromUserId);
    } else if (this.isVisible()) {
      new Notice(`New wechat message from ${msg.fromUserName || msg.fromUserId}`);
    }
  }

  private refreshSelectedContact(): void {
    if (this.selectedContactId) {
      this.selectContact(this.selectedContactId);
    }
  }

  private getWechatConversations() {
    return this.plugin.getConversationList().filter((c) => c.id.startsWith('wechat-'));
  }

  private renderContacts(): void {
    this.contactListEl.empty();
    const conversations = this.getWechatConversations();

    if (conversations.length === 0) {
      this.contactListEl.createEl('p', { text: 'No wechat conversations yet.', cls: 'claudian-wechat-panel-empty' });
      return;
    }

    const list = this.contactListEl.createEl('ul', { cls: 'claudian-wechat-panel-contact-list' });
    for (const conv of conversations) {
      const item = list.createEl('li', {
        cls: 'claudian-wechat-panel-contact' + (conv.id === `wechat-${this.selectedContactId}` ? ' is-active' : ''),
      });
      const contactId = conv.id.replace(/^wechat-/, '');
      item.createEl('span', { text: conv.title || contactId, cls: 'claudian-wechat-panel-contact-name' });
      if (conv.messageCount > 0) {
        item.createEl('span', { text: `${conv.messageCount}`, cls: 'claudian-wechat-panel-contact-count' });
      }
      item.addEventListener('click', () => {
        this.selectContact(contactId);
      });
    }
  }

  private selectContact(contactId: string): void {
    this.selectedContactId = contactId;
    this.renderContacts();

    const conversationId = `wechat-${contactId}`;
    const conversation = this.plugin.getConversationSync(conversationId);
    if (!conversation) {
      this.messagesEl.empty();
      this.messagesEl.createEl('p', { text: 'Conversation not found.', cls: 'claudian-wechat-panel-empty' });
      return;
    }

    this.headerTitleEl.setText(conversation.title || contactId);
    this.messageRenderer.renderMessages(conversation.messages, () => '');
  }
}
