import mongoose from "mongoose";

const noteSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    text: { type: String, required: true, trim: true, maxlength: 60 },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

noteSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model("Note", noteSchema);
