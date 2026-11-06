import Message from "../models/Message.js";

export async function createMessageOnce(data) {
  if (!data.clientMessageId) {
    return { message: await Message.create(data), created: true };
  }

  const key = {
    senderId: data.senderId,
    chatId: data.chatId,
    clientMessageId: data.clientMessageId,
  };
  const existing = await Message.findOne(key);
  if (existing) return { message: existing, created: false };

  try {
    return { message: await Message.create(data), created: true };
  } catch (error) {
    if (error?.code !== 11000) throw error;

    const duplicate = await Message.findOne(key);
    if (!duplicate) throw error;
    return { message: duplicate, created: false };
  }
}
