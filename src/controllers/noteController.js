import Chat from "../models/Chat.js";
import Note from "../models/Note.js";
import { getIO } from "../config/socket.js";
import { sendError, sendSuccess } from "../utils/helpers.js";

const NOTE_LIFETIME_MS = 24 * 60 * 60 * 1000;

async function getContactIds(userId) {
  const chats = await Chat.find({ participants: userId }).select("participants").lean();
  return [...new Set(
    chats.flatMap((chat) => chat.participants.map((participantId) => participantId.toString()))
      .filter((participantId) => participantId !== userId.toString()),
  )];
}

async function emitToContacts(userId, event, payload) {
  const io = getIO();
  if (!io) return;
  const contactIds = await getContactIds(userId);
  for (const contactId of contactIds) {
    io.to(contactId).emit(event, payload);
  }
}

// GET /api/notes — current user's note and unexpired notes from chat contacts
export async function getNotes(req, res) {
  try {
    const contactIds = await getContactIds(req.userId);
    const notes = await Note.find({
      owner: { $in: [req.userId, ...contactIds] },
      expiresAt: { $gt: new Date() },
    })
      .populate("owner", "name username photoURL")
      .sort({ updatedAt: -1 });
    sendSuccess(res, { notes });
  } catch (error) {
    sendError(res, "SERVER_ERROR", error.message, 500);
  }
}

// PUT /api/notes — create or replace the current user's 24-hour note
export async function upsertNote(req, res) {
  try {
    const note = await Note.findOneAndUpdate(
      { owner: req.userId },
      {
        $set: {
          text: req.body.text.trim(),
          expiresAt: new Date(Date.now() + NOTE_LIFETIME_MS),
        },
      },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
    ).populate("owner", "name username photoURL");

    await emitToContacts(req.userId, "note_updated", { note });
    sendSuccess(res, { note });
  } catch (error) {
    sendError(res, "SERVER_ERROR", error.message, 500);
  }
}

// DELETE /api/notes/me — remove the current user's note immediately
export async function deleteNote(req, res) {
  try {
    const note = await Note.findOneAndDelete({ owner: req.userId });
    await emitToContacts(req.userId, "note_deleted", { userId: req.userId.toString() });
    sendSuccess(res, { deleted: Boolean(note) });
  } catch (error) {
    sendError(res, "SERVER_ERROR", error.message, 500);
  }
}
