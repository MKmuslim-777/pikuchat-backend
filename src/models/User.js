import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    username: { type: String, required: true, unique: true, lowercase: true },
    photoURL: { type: String },
    role: {
      type: String,
      enum: ["user", "elite_user", "super_admin"],
      default: "user",
    },
    isProtectedFromDeletion: { type: Boolean, default: false },
    status: {
      isBlocked: { type: Boolean, default: false },
      blockReason: { type: String, default: "" },
      isMuted: { type: Boolean, default: false },
      mutedUntil: { type: Date, default: null },
    },
    isOnline: { type: Boolean, default: false },
    lastSeen: { type: Date, default: Date.now },
    googleId: { type: String, select: false },
    blockedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  },
  { timestamps: true }
);

// Indexes (email & username already have unique: true in schema)
userSchema.index({ role: 1 });

export default mongoose.model("User", userSchema);
