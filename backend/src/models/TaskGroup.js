import mongoose from "mongoose";

const taskGroupSchema = new mongoose.Schema(
  {
    title: { type: String, default: "", trim: true },
    status: { type: Boolean, default: true },
    url1: { type: String, default: "", trim: true },
    url1Name: { type: String, default: "", trim: true },
    url2: { type: String, default: "", trim: true },
    url2Name: { type: String, default: "", trim: true },
    url3: { type: String, default: "", trim: true },
    url3Name: { type: String, default: "", trim: true },
    url4: { type: String, default: "", trim: true },
    url4Name: { type: String, default: "", trim: true },
    minReward: { type: Number, default: 0 },
    interval: { type: Number, default: 0 },
    bannedRequesters: { type: String, default: "", trim: true },
    description: { type: String, default: "", trim: true },
  },
  { timestamps: true }
);

export const TaskGroup = mongoose.model("TaskGroup", taskGroupSchema);
