import mongoose from "mongoose";

const bannedKeywordSchema = new mongoose.Schema(
  {
    word: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

// Index (word already has unique: true in schema)

export default mongoose.model("BannedKeyword", bannedKeywordSchema);
