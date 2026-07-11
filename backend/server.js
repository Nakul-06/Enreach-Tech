import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { User } from "./src/models/User.js";
import { Account } from "./src/models/Account.js";
import { TaskType } from "./src/models/TaskType.js";
import { TaskGroup } from "./src/models/TaskGroup.js";
import { Hit } from "./src/models/Hit.js";

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;
const jwtSecret = process.env.JWT_SECRET || "change-this-secret";

app.use(cors());
app.use(express.json());

function createToken(user) {
  return jwt.sign(
    { id: user._id.toString(), email: user.email, role: user.role, name: user.name },
    jwtSecret,
    { expiresIn: "7d" }
  );
}

async function auth(req, res, next) {
  const header = req.headers.authorization;

  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const token = header.slice(7);
    const decoded = jwt.verify(token, jwtSecret);
    const user = await User.findById(decoded.id).select("-passwordHash");

    if (!user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    req.user = user;
    next();
  } catch {
    return res.status(401).json({ message: "Unauthorized" });
  }
}

function adminOnly(req, res, next) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ message: "Forbidden" });
  }

  next();
}

function escapeRegex(value = "") {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildSearch(search, fields) {
  if (!search?.trim()) {
    return {};
  }

  const regex = new RegExp(escapeRegex(search.trim()), "i");
  return { $or: fields.map((field) => ({ [field]: regex })) };
}

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function accountToDashboardRow(account, index) {
  const submitted = account.submitted ?? 0;
  const approved = account.approved ?? 0;
  const rejected = account.rejected ?? 0;
  const pending = account.pending ?? 0;
  const reward = account.reward ?? 0;
  const bonus = account.bonus ?? 0;
  const total = reward + bonus;
  const earnings = account.earnings ?? total;
  const totalApproved = account.totalApproved ?? approved;
  const approvedRate = submitted > 0 ? `${((approved / submitted) * 100).toFixed(2)}%` : "0.00%";

  return [
    String(index + 1),
    account.workerName || "-",
    account.nextPaymentDate ? new Date(account.nextPaymentDate).toLocaleDateString("en-US") : "-",
    account.lastPaymentDate ? new Date(account.lastPaymentDate).toLocaleDateString("en-US") : "-",
    account.paymentAmount ? `$${Number(account.paymentAmount).toFixed(2)}` : "-",
    account.statusLabel || account.status || "Active",
    account.activityDate ? new Date(account.activityDate).toLocaleDateString("en-US") : "-",
    String(submitted),
    String(approved),
    String(rejected),
    String(pending),
    `$${reward.toFixed(2)}`,
    `$${bonus.toFixed(2)}`,
    `$${total.toFixed(2)}`,
    `$${earnings.toFixed(2)}`,
    String(totalApproved),
    approvedRate,
  ];
}

function summaryFromAccounts(accounts, hits) {
  const summary = accounts.reduce(
    (acc, item) => {
      acc.submitted += item.submitted ?? 0;
      acc.approved += item.approved ?? 0;
      acc.rejected += item.rejected ?? 0;
      acc.pending += item.pending ?? 0;
      acc.hitsReward += item.reward ?? 0;
      acc.bonus += item.bonus ?? 0;
      acc.dailyEarnings += item.earnings ?? (item.reward ?? 0) + (item.bonus ?? 0);
      acc.totalEarnings += item.totalEarnings ?? item.earnings ?? (item.reward ?? 0) + (item.bonus ?? 0);
      return acc;
    },
    {
      submitted: 0,
      approved: 0,
      rejected: 0,
      pending: 0,
      hitsReward: 0,
      bonus: 0,
      dailyEarnings: 0,
      totalEarnings: 0,
    }
  );

  if (!accounts.length && hits.length) {
    summary.hitsReward = hits.reduce((acc, item) => acc + (item.reward ?? 0), 0);
  }

  return [
    { title: "Submitted", value: String(summary.submitted), tone: "blue" },
    { title: "Approved", value: String(summary.approved), tone: "green" },
    { title: "Rejected", value: String(summary.rejected), tone: "red" },
    { title: "Pending", value: String(summary.pending), tone: "yellow" },
    { title: "Hits Reward", value: `$${summary.hitsReward.toFixed(2)}`, tone: "blue" },
    { title: "Bonus", value: `$${summary.bonus.toFixed(2)}`, tone: "purple" },
    { title: "Daily Earnings", value: `$${summary.dailyEarnings.toFixed(2)}`, tone: "mint" },
    { title: "Total Earnings", value: `$${summary.totalEarnings.toFixed(2)}`, tone: "sky" },
  ];
}

async function seedAdmin() {
  const email = process.env.ADMIN_EMAIL || "admin@sphinx.com";
  const password = process.env.ADMIN_PASSWORD || "Sphinx@123";
  const existing = await User.findOne({ email });

  if (!existing) {
    const passwordHash = await bcrypt.hash(password, 10);
    await User.create({
      name: "Admin A",
      email,
      passwordHash,
      mobileNumber: "",
      address: "",
      role: "admin",
      status: "Active",
    });
  }
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });

  if (!user) {
    return res.status(401).json({ message: "Invalid email or password" });
  }

  const matches = await bcrypt.compare(password, user.passwordHash);
  if (!matches) {
    return res.status(401).json({ message: "Invalid email or password" });
  }

  return res.json({
    token: createToken(user),
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
    },
  });
});

app.get("/api/auth/me", auth, async (req, res) => {
  res.json({ user: req.user });
});

app.get("/api/home", auth, async (_req, res) => {
  const processing = await Account.find({ statusLabel: /processing/i }).select("workerId");
  const expired = await Account.find({
    nextPaymentDate: { $lt: new Date() },
  }).select("workerId");

  res.json({
    processingWorkerIds: processing.map((item) => item.workerId),
    expiredWorkerIds: expired.map((item) => item.workerId),
    email: process.env.ADMIN_EMAIL || "admin@sphinx.com",
  });
});

app.get("/api/dashboard", auth, async (req, res) => {
  const query = buildSearch(req.query.search, ["workerName", "workerId", "email", "statusLabel"]);
  const accounts = await Account.find(query).sort({ createdAt: -1 });
  const hits = await Hit.find({});

  res.json({
    rows: accounts.map((account, index) => accountToDashboardRow(account, index)),
    summaryCards: summaryFromAccounts(accounts, hits),
  });
});

app.get("/api/accounts", auth, async (req, res) => {
  const query = buildSearch(req.query.search, ["workerId", "workerName", "email", "status"]);
  const accounts = await Account.find(query).sort({ createdAt: -1 });
  res.json(accounts);
});

app.post("/api/accounts", auth, adminOnly, async (req, res) => {
  const account = await Account.create({
    ...req.body,
    paymentAmount: toNumber(req.body.paymentAmount, 0),
    submitted: toNumber(req.body.submitted, 0),
    approved: toNumber(req.body.approved, 0),
    rejected: toNumber(req.body.rejected, 0),
    pending: toNumber(req.body.pending, 0),
    reward: toNumber(req.body.reward, 0),
    bonus: toNumber(req.body.bonus, 0),
    earnings: toNumber(req.body.earnings, 0),
    totalApproved: toNumber(req.body.totalApproved, 0),
  });
  res.status(201).json(account);
});

app.put("/api/accounts/:id", auth, adminOnly, async (req, res) => {
  const account = await Account.findByIdAndUpdate(
    req.params.id,
    {
      ...req.body,
      paymentAmount: toNumber(req.body.paymentAmount, 0),
      submitted: toNumber(req.body.submitted, 0),
      approved: toNumber(req.body.approved, 0),
      rejected: toNumber(req.body.rejected, 0),
      pending: toNumber(req.body.pending, 0),
      reward: toNumber(req.body.reward, 0),
      bonus: toNumber(req.body.bonus, 0),
      earnings: toNumber(req.body.earnings, 0),
      totalApproved: toNumber(req.body.totalApproved, 0),
    },
    { new: true, runValidators: true }
  );

  res.json(account);
});

app.delete("/api/accounts/:id", auth, adminOnly, async (req, res) => {
  await Account.findByIdAndDelete(req.params.id);
  res.status(204).end();
});

app.get("/api/accounts-status", auth, async (req, res) => {
  const query = buildSearch(req.query.search, ["workerId", "status"]);
  const accounts = await Account.find(query).sort({ createdAt: -1 }).select("workerId status");
  res.json(accounts);
});

app.get("/api/tasktypes", auth, async (req, res) => {
  const query = buildSearch(req.query.search, ["title", "taskUrl", "status"]);
  const taskTypes = await TaskType.find(query).sort({ createdAt: -1 });
  res.json(taskTypes);
});

app.post("/api/tasktypes", auth, adminOnly, async (req, res) => {
  const taskType = await TaskType.create(req.body);
  res.status(201).json(taskType);
});

app.put("/api/tasktypes/:id", auth, adminOnly, async (req, res) => {
  const taskType = await TaskType.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });
  res.json(taskType);
});

app.delete("/api/tasktypes/:id", auth, adminOnly, async (req, res) => {
  await TaskType.findByIdAndDelete(req.params.id);
  res.status(204).end();
});

app.get("/api/taskgroups", auth, async (req, res) => {
  const query = buildSearch(req.query.search, ["title", "description"]);
  const taskGroups = await TaskGroup.find(query).sort({ createdAt: -1 });
  res.json(taskGroups);
});

app.post("/api/taskgroups", auth, adminOnly, async (req, res) => {
  const taskGroup = await TaskGroup.create(req.body);
  res.status(201).json(taskGroup);
});

app.put("/api/taskgroups/:id", auth, adminOnly, async (req, res) => {
  const taskGroup = await TaskGroup.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });
  res.json(taskGroup);
});

app.delete("/api/taskgroups/:id", auth, adminOnly, async (req, res) => {
  await TaskGroup.findByIdAndDelete(req.params.id);
  res.status(204).end();
});

app.get("/api/hits", auth, async (req, res) => {
  const query = buildSearch(req.query.search, ["workerName", "task", "requester", "status"]);
  const hits = await Hit.find(query).sort({ createdAt: -1 });
  res.json(hits);
});

app.post("/api/hits", auth, adminOnly, async (req, res) => {
  const hit = await Hit.create({
    ...req.body,
    reward: toNumber(req.body.reward, 0),
  });
  res.status(201).json(hit);
});

app.put("/api/hits/:id", auth, adminOnly, async (req, res) => {
  const hit = await Hit.findByIdAndUpdate(
    req.params.id,
    {
      ...req.body,
      reward: toNumber(req.body.reward, 0),
    },
    { new: true, runValidators: true }
  );
  res.json(hit);
});

app.delete("/api/hits/:id", auth, adminOnly, async (req, res) => {
  await Hit.findByIdAndDelete(req.params.id);
  res.status(204).end();
});

app.patch("/api/hits/:id/complete", auth, adminOnly, async (req, res) => {
  const hit = await Hit.findByIdAndUpdate(
    req.params.id,
    { status: "Complete", timeRemaining: "Completed" },
    { new: true }
  );
  res.json(hit);
});

app.get("/api/users", auth, adminOnly, async (req, res) => {
  const query = buildSearch(req.query.search, ["name", "email", "mobileNumber", "status"]);
  const users = await User.find(query).select("-passwordHash").sort({ createdAt: -1 });
  res.json(users);
});

app.post("/api/users", auth, adminOnly, async (req, res) => {
  const passwordHash = await bcrypt.hash(req.body.password, 10);
  const user = await User.create({
    name: req.body.name,
    email: req.body.email,
    passwordHash,
    mobileNumber: req.body.mobileNumber,
    address: req.body.address,
    role: req.body.role || "user",
    status: req.body.status || "Active",
  });

  res.status(201).json({
    id: user._id,
    name: user.name,
    email: user.email,
    mobileNumber: user.mobileNumber,
    address: user.address,
    role: user.role,
    status: user.status,
  });
});

app.put("/api/users/:id", auth, adminOnly, async (req, res) => {
  const update = {
    name: req.body.name,
    email: req.body.email,
    mobileNumber: req.body.mobileNumber,
    address: req.body.address,
    role: req.body.role || "user",
    status: req.body.status || "Active",
  };

  if (req.body.password) {
    update.passwordHash = await bcrypt.hash(req.body.password, 10);
  }

  const user = await User.findByIdAndUpdate(req.params.id, update, {
    new: true,
    runValidators: true,
  }).select("-passwordHash");

  res.json(user);
});

app.delete("/api/users/:id", auth, adminOnly, async (req, res) => {
  await User.findByIdAndDelete(req.params.id);
  res.status(204).end();
});

app.delete("/api/delete-by-date", auth, adminOnly, async (req, res) => {
  const date = req.body.date;
  const start = new Date(date);
  const end = new Date(date);
  end.setDate(end.getDate() + 1);

  await Promise.all([
    Account.deleteMany({ createdAt: { $gte: start, $lt: end } }),
    TaskType.deleteMany({ createdAt: { $gte: start, $lt: end } }),
    TaskGroup.deleteMany({ createdAt: { $gte: start, $lt: end } }),
    Hit.deleteMany({ createdAt: { $gte: start, $lt: end } }),
  ]);

  res.json({ message: "Deleted successfully" });
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ message: error.message || "Something went wrong" });
});

async function start() {
  await mongoose.connect(process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/sphinx-dashboard");
  await seedAdmin();
  app.listen(port, () => {
    console.log(`API listening on http://127.0.0.1:${port}`);
  });
}

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
