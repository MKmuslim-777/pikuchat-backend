import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    username: { type: String, required: true, unique: true, lowercase: true },
    photoURL: { type: String },
    bio: { type: String, default: "", maxlength: 150 },
    role: {
      type: String,
      enum: ["user", "elite_user", "super_admin"],
      default: "user",
    },
    isProtectedFromDeletion: { type: Boolean, default: false },
    status: {
      isBlocked: { type: Boolean, default: false },
      blockReason: { type: String, default: "" },
      isMuted:  { type: Boolean, default: false },
      mutedUntil: { type: Date, default: null },
    },
    // Privacy settings
    readReceiptsEnabled: { type: Boolean, default: true },
    // Per-chat mute: array of { chatId, mutedUntil (null = forever) }
    mutedChats: [
      {
        chatId: { type: mongoose.Schema.Types.ObjectId, ref: "Chat" },
        mutedUntil: { type: Date, default: null }, // null = forever
      },
    ],
    // Chats hidden from list (re-appear on new message)
    hiddenChats: [{ type: mongoose.Schema.Types.ObjectId, ref: "Chat" }],
    // Users this user has blocked
    blockedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    isOnline: { type: Boolean, default: false },
    lastSeen: { type: Date, default: Date.now },
    googleId: { type: String, select: false },
  },
  { timestamps: true }
);

userSchema.index({ role: 1 });
userSchema.index({ "mutedChats.chatId": 1 });

export default mongoose.model("User", userSchema);
