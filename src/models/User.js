import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name:     { type: String, required: true },
    email:    { type: String, required: true, unique: true },
    username: { type: String, required: true, unique: true, lowercase: true },
    photoURL: { type: String },
    bio:      { type: String, default: "", maxlength: 150 },
    role: {
      type: String,
      enum: ["user", "elite_user", "super_admin"],
      default: "user",
    },
    isProtectedFromDeletion: { type: Boolean, default: false },
    status: {
      isBlocked:   { type: Boolean, default: false },
      blockReason: { type: String,  default: "" },
      isMuted:     { type: Boolean, default: false },
      mutedUntil:  { type: Date,    default: null },
    },

    // Privacy settings
    readReceiptsEnabled: { type: Boolean, default: true },
    /** "everyone" | "nobody" */
    lastSeenVisibility:  { type: String, enum: ["everyone", "nobody"], default: "everyone" },

    // Username change history (max 3 changes per 30 days enforced in controller)
    usernameHistory: [
      {
        username:  { type: String },
        changedAt: { type: Date, default: Date.now },
      },
    ],

    // Per-chat mute
    mutedChats: [
      {
        chatId:    { type: mongoose.Schema.Types.ObjectId, ref: "Chat" },
        mutedUntil: { type: Date, default: null },
      },
    ],

    // Hidden from chat list
    hiddenChats: [{ type: mongoose.Schema.Types.ObjectId, ref: "Chat" }],

    // Blocked users
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
