import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name:     { type: String, required: true },
    email:    { type: String, required: true, unique: true },
    username: { type: String, required: true, unique: true, lowercase: true },
    photoURL: { type: String },
    coverURL: { type: String, default: "" }, // Custom banner/cover
    bio:      { type: String, default: "", maxlength: 150 },
    role: {
      type: String,
      enum: ["user", "elite_user", "super_admin"],
      default: "user",
    },
    socialLinks: {
      facebook:  { type: String, default: "" },
      instagram: { type: String, default: "" },
      twitter:   { type: String, default: "" },
      github:    { type: String, default: "" },
      linkedin:  { type: String, default: "" },
      tiktok:    { type: String, default: "" },
      whatsapp:  { type: String, default: "" },
      telegram:  { type: String, default: "" },
      youtube:   { type: String, default: "" },
      website:   { type: String, default: "" },
    },
    phoneNumber:     { type: String, default: "" },
    showPhoneNumber: { type: Boolean, default: false },
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

    // Web Push Subscriptions for mobile background notifications
    pushSubscriptions: [
      {
        endpoint: { type: String, required: true },
        keys: {
          p256dh: { type: String, required: true },
          auth:   { type: String, required: true },
        },
        device: { type: String, default: "browser" },
        createdAt: { type: Date, default: Date.now },
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
    groupChatCount: { type: Number, default: 0, min: 0, max: 3 },

    isOnline: { type: Boolean, default: false },
    lastSeen: { type: Date, default: Date.now },

    googleId: { type: String, select: false },
  },
  { timestamps: true }
);

userSchema.index({ role: 1 });
userSchema.index({ "mutedChats.chatId": 1 });
userSchema.index({ "pushSubscriptions.endpoint": 1 });

export default mongoose.model("User", userSchema);
