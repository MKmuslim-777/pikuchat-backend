import mongoose from "mongoose";

const chatSchema = new mongoose.Schema(
  {
    participants: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    isGroup: { type: Boolean, default: false },
    name: { type: String, trim: true, maxlength: 60 },
    groupPhotoURL: { type: String, default: "" },
    admins: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    lastMessage: {
      text: String,
      senderId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      updatedAt: { type: Date, default: Date.now },
    },
  },
  { timestamps: true }
);

chatSchema.index({ participants: 1 });
chatSchema.index({ "lastMessage.updatedAt": -1 });

export default mongoose.model("Chat", chatSchema);
