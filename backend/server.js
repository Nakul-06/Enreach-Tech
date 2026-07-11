import { randomUUID } from "crypto";
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
const mongoUri = process.env.MONGODB_URI?.trim();
const useMemoryDb = process.env.USE_IN_MEMORY_DB === "true" || !mongoUri;

app.use(cors());
app.use(express.json());

const memory = {
  users: [],
  accounts: [],
  tasktypes: [],
  taskgroups: [],
  hits: [],
};

function createMemoryRecord(payload = {}) {
  return {
    _id: randomUUID(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...payload,
  };
}

function normalizeRecord(record) {
  if (!record) {
    return null;
  }

  if (typeof record.toObject === "function") {
    return record.toObject();
  }

  return { ...record };
}

function matchesQuery(record, query = {}) {
  if (!query || !Object.keys(query).length) {
    return true;
  }

  if (query.$or) {
    return query.$or.some((condition) => {
      const [field, matcher] = Object.entries(condition)[0];
      return matcher.test(String(record[field] ?? ""));
    });
  }

  return Object.entries(query).every(([field, expected]) => record[field] === expected);
}

function sortByCreatedAtDesc(items) {
  return [...items].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
}

function createMemoryRepository(key) {
  return {
    async find(filter = {}, options = {}) {
      let items = memory[key].filter((item) => matchesQuery(item, filter));
      if (options.select) {
        const fields = options.select.split(" ").filter(Boolean);
        items = items.map((item) => {
          const next = { ...item };
          for (const field of fields) {
            if (field.startsWith("-")) {
              delete next[field.slice(1)];
            }
          }
          return next;
        });
      }
      return sortByCreatedAtDesc(items).map(normalizeRecord);
    },
    async findOne(filter = {}) {
      const item = memory[key].find((entry) => matchesQuery(entry, filter));
      return normalizeRecord(item);
    },
    async findById(id, options = {}) {
      const item = memory[key].find((entry) => entry._id === id);
      if (!item) {
        return null;
      }
      const next = { ...item };
      if (options.select) {
        for (const field of options.select.split(" ").filter(Boolean)) {
          if (field.startsWith("-")) {
            delete next[field.slice(1)];
          }
        }
      }
      return next;
    },
    async create(payload) {
      const record = createMemoryRecord(payload);
      memory[key].push(record);
      return normalizeRecord(record);
    },
    async updateById(id, payload) {
      const index = memory[key].findIndex((entry) => entry._id === id);
      if (index === -1) {
        return null;
      }
      memory[key][index] = {
        ...memory[key][index],
        ...payload,
        updatedAt: new Date(),
      };
      return normalizeRecord(memory[key][index]);
    },
    async deleteById(id) {
      const index = memory[key].findIndex((entry) => entry._id === id);
      if (index === -1) {
        return null;
      }
      const [deleted] = memory[key].splice(index, 1);
      return normalizeRecord(deleted);
    },
    async deleteManyByCreatedAt(start, end) {
      memory[key] = memory[key].filter((entry) => {
        const createdAt = new Date(entry.createdAt);
        return !(createdAt >= start && createdAt < end);
      });
    },
  };
}

function createMongoRepository(model) {
  return {
    async find(filter = {}, options = {}) {
      let query = model.find(filter).sort({ createdAt: -1 });
      if (options.select) {
        query = query.select(options.select);
      }
      return query;
    },
    async findOne(filter = {}) {
      return model.findOne(filter);
    },
    async findById(id, options = {}) {
      let query = model.findById(id);
      if (options.select) {
        query = query.select(options.select);
      }
      return query;
    },
    async create(payload) {
      return model.create(payload);
    },
    async updateById(id, payload) {
      return model.findByIdAndUpdate(id, payload, { new: true, runValidators: true });
    },
    async deleteById(id) {
      return model.findByIdAndDelete(id);
    },
    async deleteManyByCreatedAt(start, end) {
      await model.deleteMany({ createdAt: { $gte: start, $lt: end } });
    },
  };
}

const repositories = useMemoryDb
  ? {
      users: createMemoryRepository("users"),
      accounts: createMemoryRepository("accounts"),
      tasktypes: createMemoryRepository("tasktypes"),
      taskgroups: createMemoryRepository("taskgroups"),
      hits: createMemoryRepository("hits"),
    }
  : {
      users: createMongoRepository(User),
      accounts: createMongoRepository(Account),
      tasktypes: createMongoRepository(TaskType),
      taskgroups: createMongoRepository(TaskGroup),
      hits: createMongoRepository(Hit),
    };

function createToken(user) {
  return jwt.sign(
    { id: String(user._id), email: user.email, role: user.role, name: user.name },
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
    const user = await repositories.users.findById(decoded.id, { select: "-passwordHash" });

    if (!user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    req.user = normalizeRecord(user);
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
  const existing = await repositories.users.findOne({ email });

  if (!existing) {
    const passwordHash = await bcrypt.hash(password, 10);
    await repositories.users.create({
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
  res.json({ ok: true, mode: useMemoryDb ? "memory" : "mongodb" });
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;
  const user = await repositories.users.findOne({ email });

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
  const processing = await repositories.accounts.find({ statusLabel: /processing/i });
  const expired = (await repositories.accounts.find({})).filter(
    (item) => item.nextPaymentDate && new Date(item.nextPaymentDate) < new Date()
  );

  res.json({
    processingWorkerIds: processing.map((item) => item.workerId),
    expiredWorkerIds: expired.map((item) => item.workerId),
    email: process.env.ADMIN_EMAIL || "admin@sphinx.com",
  });
});

app.get("/api/dashboard", auth, async (req, res) => {
  const query = buildSearch(req.query.search, ["workerName", "workerId", "email", "statusLabel"]);
  const accounts = await repositories.accounts.find(query);
  const hits = await repositories.hits.find({});

  res.json({
    rows: accounts.map((account, index) => accountToDashboardRow(account, index)),
    summaryCards: summaryFromAccounts(accounts, hits),
  });
});

app.get("/api/accounts", auth, async (req, res) => {
  const query = buildSearch(req.query.search, ["workerId", "workerName", "email", "status"]);
  const accounts = await repositories.accounts.find(query);
  res.json(accounts);
});

app.post("/api/accounts", auth, adminOnly, async (req, res) => {
  const account = await repositories.accounts.create({
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
  const account = await repositories.accounts.updateById(req.params.id, {
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
  res.json(account);
});

app.delete("/api/accounts/:id", auth, adminOnly, async (req, res) => {
  await repositories.accounts.deleteById(req.params.id);
  res.status(204).end();
});

app.get("/api/accounts-status", auth, async (req, res) => {
  const query = buildSearch(req.query.search, ["workerId", "status"]);
  const accounts = await repositories.accounts.find(query);
  res.json(accounts.map((item) => ({ workerId: item.workerId, status: item.status })));
});

app.get("/api/tasktypes", auth, async (req, res) => {
  const query = buildSearch(req.query.search, ["title", "taskUrl", "status"]);
  const taskTypes = await repositories.tasktypes.find(query);
  res.json(taskTypes);
});

app.post("/api/tasktypes", auth, adminOnly, async (req, res) => {
  const taskType = await repositories.tasktypes.create(req.body);
  res.status(201).json(taskType);
});

app.put("/api/tasktypes/:id", auth, adminOnly, async (req, res) => {
  const taskType = await repositories.tasktypes.updateById(req.params.id, req.body);
  res.json(taskType);
});

app.delete("/api/tasktypes/:id", auth, adminOnly, async (req, res) => {
  await repositories.tasktypes.deleteById(req.params.id);
  res.status(204).end();
});

app.get("/api/taskgroups", auth, async (req, res) => {
  const query = buildSearch(req.query.search, ["title", "description"]);
  const taskGroups = await repositories.taskgroups.find(query);
  res.json(taskGroups);
});

app.post("/api/taskgroups", auth, adminOnly, async (req, res) => {
  const taskGroup = await repositories.taskgroups.create(req.body);
  res.status(201).json(taskGroup);
});

app.put("/api/taskgroups/:id", auth, adminOnly, async (req, res) => {
  const taskGroup = await repositories.taskgroups.updateById(req.params.id, req.body);
  res.json(taskGroup);
});

app.delete("/api/taskgroups/:id", auth, adminOnly, async (req, res) => {
  await repositories.taskgroups.deleteById(req.params.id);
  res.status(204).end();
});

app.get("/api/hits", auth, async (req, res) => {
  const query = buildSearch(req.query.search, ["workerName", "task", "requester", "status"]);
  const hits = await repositories.hits.find(query);
  res.json(hits);
});

app.post("/api/hits", auth, adminOnly, async (req, res) => {
  const hit = await repositories.hits.create({
    ...req.body,
    reward: toNumber(req.body.reward, 0),
  });
  res.status(201).json(hit);
});

app.put("/api/hits/:id", auth, adminOnly, async (req, res) => {
  const hit = await repositories.hits.updateById(req.params.id, {
    ...req.body,
    reward: toNumber(req.body.reward, 0),
  });
  res.json(hit);
});

app.delete("/api/hits/:id", auth, adminOnly, async (req, res) => {
  await repositories.hits.deleteById(req.params.id);
  res.status(204).end();
});

app.patch("/api/hits/:id/complete", auth, adminOnly, async (req, res) => {
  const hit = await repositories.hits.updateById(req.params.id, {
    status: "Complete",
    timeRemaining: "Completed",
  });
  res.json(hit);
});

app.get("/api/users", auth, adminOnly, async (req, res) => {
  const query = buildSearch(req.query.search, ["name", "email", "mobileNumber", "status"]);
  const users = await repositories.users.find(query, { select: "-passwordHash" });
  res.json(users);
});

app.post("/api/users", auth, adminOnly, async (req, res) => {
  const passwordHash = await bcrypt.hash(req.body.password, 10);
  const user = await repositories.users.create({
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

  const user = await repositories.users.updateById(req.params.id, update);

  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  const { passwordHash, ...safeUser } = user;
  res.json(safeUser);
});

app.delete("/api/users/:id", auth, adminOnly, async (req, res) => {
  await repositories.users.deleteById(req.params.id);
  res.status(204).end();
});

app.delete("/api/delete-by-date", auth, adminOnly, async (req, res) => {
  const date = req.body.date;
  const start = new Date(date);
  const end = new Date(date);
  end.setDate(end.getDate() + 1);

  await Promise.all([
    repositories.accounts.deleteManyByCreatedAt(start, end),
    repositories.tasktypes.deleteManyByCreatedAt(start, end),
    repositories.taskgroups.deleteManyByCreatedAt(start, end),
    repositories.hits.deleteManyByCreatedAt(start, end),
  ]);

  res.json({ message: "Deleted successfully" });
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ message: error.message || "Something went wrong" });
});

async function start() {
  if (!useMemoryDb) {
    await mongoose.connect(mongoUri);
  }

  await seedAdmin();
  app.listen(port, () => {
    console.log(`API listening on http://127.0.0.1:${port} (${useMemoryDb ? "memory" : "mongodb"})`);
  });
}

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
