import mongoose from "mongoose";

const accountSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, trim: true, lowercase: true },
    password: { type: String, default: "" },
    workerId: { type: String, required: true, trim: true },
    workerName: { type: String, default: "" },
    accountKey: { type: String, default: "" },
    nextPaymentDate: { type: Date, default: null },
    lastPaymentDate: { type: Date, default: null },
    paymentAmount: { type: Number, default: 0 },
    status: { type: String, default: "live" },
    statusLabel: { type: String, default: "0m-live" },
    activityDate: { type: Date, default: null },
    submitted: { type: Number, default: 0 },
    approved: { type: Number, default: 0 },
    rejected: { type: Number, default: 0 },
    pending: { type: Number, default: 0 },
    reward: { type: Number, default: 0 },
    bonus: { type: Number, default: 0 },
    earnings: { type: Number, default: 0 },
    totalApproved: { type: Number, default: 0 },
    totalEarnings: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export const Account = mongoose.model("Account", accountSchema);
