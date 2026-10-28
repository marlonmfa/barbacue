import * as zap from "./zap-hub.js";

// zap.cog.ia.br is the sole WhatsApp/Baileys owner. A missing key is a
// configuration error, never a reason to open a second local socket.
const selected = zap;

export const RESTAURANTS = selected.RESTAURANTS;
export const onInboundMessage = selected.onInboundMessage;
export const startHub = selected.startHub;
export const accountList = selected.accountList;
export const pair = selected.pair;
export const closePairingWindow = selected.closePairingWindow;
export const disconnect = selected.disconnect;
export const chatList = selected.chatList;
export const messageList = selected.messageList;
export const media = selected.media;
export const sendMessage = selected.sendMessage;
export const readChat = selected.readChat;
export const handleWebhook = zap.handleWebhook;
export const verifyWebhookSignature = zap.verifyWebhookSignature;
export const usingZap = true;
