import mongoose from "mongoose";

const hitSchema = new mongoose.Schema(
  {
    workerName: { type: String, required: true, trim: true },
    task: { type: String, required: true, trim: true },
    requester: { type: String, required: true, trim: true },
    reward: { type: Number, default: 0 },
    timeRemaining: { type: String, default: "" },
    status: { type: String, default: "Open" },
  },
  { timestamps: true }
);

export const Hit = mongoose.model("Hit", hitSchema);
