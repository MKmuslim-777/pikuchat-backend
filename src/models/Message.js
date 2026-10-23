import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    chatId: { type: mongoose.Schema.Types.ObjectId, ref: "Chat", required: true },
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    receiverId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    text: { type: String, default: "" },
    fileUrl: { type: String, default: null },
    fileType: {
      type: String,
      default: null,
      enum: [null, "image", "video", "audio", "document", "other"],
    },
    publicId: { type: String, default: null }, // Cloudinary public ID for cleanup on delete
    isEdited: { type: Boolean, default: false },
    isDeleted: { type: Boolean, default: false },
    isSeen: { type: Boolean, default: false },
  },
  { timestamps: true }
);

messageSchema.index({ chatId: 1, createdAt: -1 });
messageSchema.index({ senderId: 1 });
messageSchema.index({ receiverId: 1, isSeen: 1 });

export default mongoose.model("Message", messageSchema);
