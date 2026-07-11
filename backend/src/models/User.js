import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    passwordHash: { type: String, required: true },
    mobileNumber: { type: String, default: "" },
    address: { type: String, default: "" },
    role: { type: String, enum: ["admin", "user"], default: "user" },
    status: { type: String, default: "Active" },
  },
  { timestamps: true }
);

export const User = mongoose.model("User", userSchema);
