export const MessageType = {
  NONE: 0,
  USER: 1,
  BOT: 2,
};

export const MessageItemType = {
  NONE: 0,
  TEXT: 1,
  IMAGE: 2,
  VOICE: 3,
  FILE: 4,
  VIDEO: 5,
};

export const ILinkClient = jest.fn();

export const loginWithQR = jest.fn();

export const getUpdates = jest.fn();
export const sendMessage = jest.fn();
export const sendTyping = jest.fn();
export const getConfig = jest.fn();
export const getUploadUrl = jest.fn();
