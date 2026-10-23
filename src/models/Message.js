import mongoose from "mongoose";

const reactionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    emoji: { type: String, required: true }, // e.g. "❤️", "😂", "👍"
  },
  { _id: false }
);

const messageSchema = new mongoose.Schema(
  {
    chatId:     { type: mongoose.Schema.Types.ObjectId, ref: "Chat",    required: true },
    senderId:   { type: mongoose.Schema.Types.ObjectId, ref: "User",    required: true },
    receiverId: { type: mongoose.Schema.Types.ObjectId, ref: "User",    required: true },
    text:       { type: String, default: "" },
    fileUrl:    { type: String, default: null },
    fileType: {
      type: String, default: null,
      enum: [null, "image", "video", "audio", "document", "other"],
    },
    publicId:  { type: String, default: null },
    replyTo: {
      _id:      { type: mongoose.Schema.Types.ObjectId },
      text:     { type: String, default: "" },
      senderId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      fileType: { type: String, default: null },
    },
    reactions: [reactionSchema],
    isEdited:  { type: Boolean, default: false },
    isDeleted: { type: Boolean, default: false },
    isSeen:    { type: Boolean, default: false },
    // Soft-reported: list of userIds who reported this message
    reportedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  },
  { timestamps: true }
);

messageSchema.index({ chatId: 1, createdAt: -1 });
messageSchema.index({ senderId: 1 });
messageSchema.index({ receiverId: 1, isSeen: 1 });

export default mongoose.model("Message", messageSchema);
