export interface ImGatewayStatus {
  state: 'idle' | 'starting' | 'qr_ready' | 'logged_in' | 'running' | 'error' | 'stopped';
  qrCodeUrl?: string;
  userName?: string;
  errorMessage?: string;
}

export interface ImIncomingMessage {
  id: string;
  fromUserId: string;
  fromUserName?: string;
  content: string;
  timestamp: number;
}

export interface ImGateway {
  readonly id: string;
  start(): Promise<void>;
  stop(): Promise<void>;
  sendText(toUserId: string, content: string): Promise<void>;
  getStatus(): ImGatewayStatus;
  onStatusChange(listener: (status: ImGatewayStatus) => void): () => void;
  onIncomingMessage(listener: (msg: ImIncomingMessage) => void): () => void;
  onLogChange(listener: (logs: ImLogEntry[]) => void): () => void;
}

export interface ImLogEntry {
  id: string;
  timestamp: number;
  direction: 'in' | 'out' | 'system';
  summary: string;
  detail?: string;
}

export interface ImReplyContext {
  gateway: ImGateway;
  message: ImIncomingMessage;
}
