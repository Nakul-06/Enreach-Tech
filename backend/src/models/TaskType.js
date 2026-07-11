import mongoose from "mongoose";

const taskTypeSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    taskUrl: { type: String, required: true, trim: true },
    status: { type: String, default: "Active" },
  },
  { timestamps: true }
);

export const TaskType = mongoose.model("TaskType", taskTypeSchema);
