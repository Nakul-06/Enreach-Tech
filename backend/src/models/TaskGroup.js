import mongoose from "mongoose";

const taskGroupSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "", trim: true },
  },
  { timestamps: true }
);

export const TaskGroup = mongoose.model("TaskGroup", taskGroupSchema);
