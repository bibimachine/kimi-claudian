// iLink protocol types — derived from @tencent-weixin/openclaw-weixin and weixin-ilink.

export const MessageType = {
  NONE: 0,
  USER: 1,
  BOT: 2,
} as const;

export const MessageItemType = {
  NONE: 0,
  TEXT: 1,
  IMAGE: 2,
  VOICE: 3,
  FILE: 4,
  VIDEO: 5,
} as const;

export const MessageState = {
  NEW: 0,
  GENERATING: 1,
  FINISH: 2,
} as const;

export const TypingStatus = {
  TYPING: 1,
  CANCEL: 2,
} as const;

export interface TextItem {
  text?: string;
}

export interface VoiceItem {
  text?: string;
  encode_type?: number;
  playtime?: number;
}

export interface ImageItem {
  url?: string;
  cdn_url?: string;
  width?: number;
  height?: number;
}

export interface FileItem {
  url?: string;
  cdn_url?: string;
  file_name?: string;
  file_size?: number;
}

export interface VideoItem {
  url?: string;
  cdn_url?: string;
  thumb_url?: string;
  width?: number;
  height?: number;
  duration?: number;
}

export interface MessageItem {
  type?: number;
  text_item?: TextItem;
  voice_item?: VoiceItem;
  image_item?: ImageItem;
  file_item?: FileItem;
  video_item?: VideoItem;
  ref_msg?: {
    title?: string;
    message_item?: MessageItem;
  };
}

export interface WeixinMessage {
  seq?: number;
  message_id?: number;
  from_user_id?: string;
  to_user_id?: string;
  client_id?: string;
  session_id?: string;
  group_id?: string;
  message_type?: number;
  message_state?: number;
  item_list?: MessageItem[];
  context_token?: string;
  create_time_ms?: number;
}

export interface GetUpdatesReq {
  get_updates_buf?: string;
}

export interface GetUpdatesResp {
  ret?: number;
  errcode?: number;
  errmsg?: string;
  msgs?: WeixinMessage[];
  get_updates_buf?: string;
  longpolling_timeout_ms?: number;
}

export interface SendMessageReq {
  msg?: WeixinMessage;
}

export interface GetConfigResp {
  ret?: number;
  errmsg?: string;
  typing_ticket?: string;
}

export interface SendTypingReq {
  ilink_user_id?: string;
  typing_ticket?: string;
  status?: number;
}

export interface GetUploadUrlReq {
  file_name?: string;
  file_type?: string;
  file_size?: number;
}

export interface GetUploadUrlResp {
  ret?: number;
  errmsg?: string;
  upload_url?: string;
  download_url?: string;
  cdn_url?: string;
}

export interface QRCodeResponse {
  qrcode: string;
  qrcode_img_content: string;
}

export interface QRStatusResponse {
  status: 'wait' | 'scaned' | 'confirmed' | 'expired';
  bot_token?: string;
  ilink_bot_id?: string;
  baseurl?: string;
  ilink_user_id?: string;
}

export interface LoginResult {
  botToken: string;
  accountId: string;
  baseUrl: string;
  userId?: string;
}

export interface LoginCallbacks {
  onQRCode: (url: string) => void;
  onStatusChange: (status: 'waiting' | 'scanned' | 'expired' | 'refreshing') => void;
}

export interface ClientOptions {
  baseUrl: string;
  token: string;
  channelVersion?: string;
  longPollTimeoutMs?: number;
  apiTimeoutMs?: number;
}
