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

function getNestedNumber(source, paths, fallback = 0) {
  for (const path of paths) {
    const value = path.split(".").reduce((current, key) => current?.[key], source);
    const number = Number(value);

    if (Number.isFinite(number)) {
      return number;
    }
  }

  return fallback;
}

async function findAccountByWorkerId(workerId) {
  if (!workerId?.trim()) {
    return null;
  }

  return repositories.accounts.findOne({ workerId: workerId.trim() });
}

async function updateWorkerActivity(workerId, updates = {}) {
  const account = await findAccountByWorkerId(workerId);

  if (!account) {
    return null;
  }

  return repositories.accounts.updateById(account._id, {
    ...account,
    ...updates,
    workerId: account.workerId,
    status: updates.status || account.status || "live",
    statusLabel: updates.statusLabel || "0m-live",
    activityDate: updates.activityDate || new Date(),
  });
}

function getApiBaseUrl(req) {
  return process.env.PUBLIC_API_BASE_URL || `${req.protocol}://${req.get("host")}/api`;
}

function getWorkerIdQuery(req) {
  return String(req.query.workerId || "CHANGE_ME").trim();
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function manualTaskLinksUserScript(apiBaseUrl, workerId) {
  return `// ==UserScript==
// @name         Sphinx Manual Task Links
// @namespace    https://www.mayohn.co.in/
// @version      1.0
// @description  Shows dashboard task links for manual opening only.
// @match        https://worker.mturk.com/*
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  const WORKER_ID = ${JSON.stringify(workerId)};
  const API_BASE = ${JSON.stringify(apiBaseUrl)};

  function createPanel() {
    const panel = document.createElement("div");
    panel.id = "sphinx-manual-task-links";
    panel.style.cssText = [
      "position:fixed",
      "right:16px",
      "bottom:16px",
      "z-index:999999",
      "width:280px",
      "max-height:360px",
      "overflow:auto",
      "background:#ffffff",
      "border:1px solid #d8dbe8",
      "box-shadow:0 12px 32px rgba(20,24,40,.18)",
      "border-radius:10px",
      "font:14px Arial,sans-serif",
      "color:#39405f"
    ].join(";");

    panel.innerHTML = '<div style="padding:12px 14px;border-bottom:1px solid #eceef6;font-weight:700">Sphinx Task Links</div><div data-body style="padding:10px 14px">Loading...</div>';
    document.body.appendChild(panel);
    return panel;
  }

  function renderLinks(panel, links) {
    const body = panel.querySelector("[data-body]");
    if (!links.length) {
      body.textContent = "No active task links.";
      return;
    }

    body.innerHTML = "";
    links.forEach((link) => {
      const item = document.createElement("a");
      item.href = link.url;
      item.target = "_blank";
      item.rel = "noopener noreferrer";
      item.textContent = link.title || link.url;
      item.style.cssText = "display:block;margin:0 0 8px;color:#4f65d8;text-decoration:underline";
      body.appendChild(item);
    });
  }

  async function loadLinks() {
    const panel = document.getElementById("sphinx-manual-task-links") || createPanel();
    const url = API_BASE + "/manual-task-links?workerId=" + encodeURIComponent(WORKER_ID);

    try {
      const response = await fetch(url, { credentials: "omit" });
      const data = await response.json();
      renderLinks(panel, data.links || []);
    } catch (error) {
      const body = panel.querySelector("[data-body]");
      body.textContent = "Unable to load links.";
      console.error("Sphinx manual links failed", error);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", loadLinks);
  } else {
    loadLinks();
  }
})();
`;
}

function workerReporterUserScript(apiBaseUrl, workerId) {
  return `// ==UserScript==
// @name         Sphinx Worker Status Reporter
// @namespace    https://www.mayohn.co.in/
// @version      1.0
// @description  Reports worker live status and dashboard summary to Sphinx.
// @match        https://worker.mturk.com/*
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  const WORKER_ID = ${JSON.stringify(workerId)};
  const API_BASE = ${JSON.stringify(apiBaseUrl)};
  const PING_INTERVAL_MS = 30000;
  const DASHBOARD_INTERVAL_MS = 30 * 60 * 1000;

  async function postJson(path, payload) {
    const response = await fetch(API_BASE + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      credentials: "omit"
    });

    if (!response.ok) {
      throw new Error("Request failed: " + response.status);
    }

    return response.json();
  }

  function sendPing() {
    postJson("/check-worker", { workerId: WORKER_ID }).catch((error) => {
      console.error("Sphinx ping failed", error);
    });
  }

  async function sendDashboardSummary() {
    try {
      const response = await fetch("https://worker.mturk.com/dashboard.json?ref=w_hdr_db", {
        credentials: "include"
      });
      const data = await response.json();

      await postJson("/worker-dashboard-detail", {
        workerId: WORKER_ID,
        available_earnings: {
          amount_in_dollars: data.available_earnings?.amount_in_dollars ?? 0
        },
        hits_overview: data.hits_overview ?? {},
        daily_hit_statistics_overview: [data.daily_hit_statistics_overview?.[0] ?? {}]
      });
    } catch (error) {
      console.error("Sphinx dashboard report failed", error);
    }
  }

  sendPing();
  sendDashboardSummary();
  setInterval(sendPing, PING_INTERVAL_MS);
  setInterval(sendDashboardSummary, DASHBOARD_INTERVAL_MS);
})();
`;
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

app.get("/api/userscripts", (req, res) => {
  const apiBaseUrl = getApiBaseUrl(req);
  const workerId = getWorkerIdQuery(req);
  const safeWorkerId = escapeHtml(workerId);
  const manualLinksUrl = `${apiBaseUrl}/userscripts/manual-task-links.user.js?workerId=${encodeURIComponent(workerId)}`;
  const reporterUrl = `${apiBaseUrl}/userscripts/worker-reporter.user.js?workerId=${encodeURIComponent(workerId)}`;

  res.type("html").send(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Sphinx Userscripts</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 32px; color: #39405f; }
      a { color: #4f65d8; }
      code { background: #f4f5fb; padding: 2px 5px; border-radius: 4px; }
      .card { border: 1px solid #dfe2f0; border-radius: 8px; padding: 18px; margin-bottom: 14px; max-width: 720px; }
    </style>
  </head>
  <body>
    <h1>Sphinx Userscripts</h1>
    <p>Worker ID: <code>${safeWorkerId}</code></p>
    <div class="card">
      <h2>Manual Task Links</h2>
      <p>Shows active dashboard task links so they can be opened manually.</p>
      <a href="${manualLinksUrl}">Install manual task links script</a>
    </div>
    <div class="card">
      <h2>Worker Status Reporter</h2>
      <p>Reports live status and dashboard summary numbers to Sphinx.</p>
      <a href="${reporterUrl}">Install worker status reporter script</a>
    </div>
  </body>
</html>`);
});

app.get("/api/userscripts/manual-task-links.user.js", (req, res) => {
  res.type("application/javascript").send(manualTaskLinksUserScript(getApiBaseUrl(req), getWorkerIdQuery(req)));
});

app.get("/api/userscripts/worker-reporter.user.js", (req, res) => {
  res.type("application/javascript").send(workerReporterUserScript(getApiBaseUrl(req), getWorkerIdQuery(req)));
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

app.post("/api/check-worker", async (req, res) => {
  const workerId = req.body.workerId?.trim();

  if (!workerId) {
    return res.status(400).json({ message: "workerId is required" });
  }

  const account = await updateWorkerActivity(workerId);

  if (!account) {
    return res.status(404).json({ message: "Worker not found" });
  }

  res.json({
    ok: true,
    workerId: account.workerId,
    status: account.status,
    statusLabel: account.statusLabel,
    activityDate: account.activityDate,
  });
});

app.post("/api/worker-dashboard-detail", async (req, res) => {
  const workerId = req.body.workerId?.trim();

  if (!workerId) {
    return res.status(400).json({ message: "workerId is required" });
  }

  const dailyStats = req.body.daily_hit_statistics_overview?.[0] || req.body.dailyStats || {};
  const hitsOverview = req.body.hits_overview || {};
  const reward = getNestedNumber(req.body, [
    "available_earnings.amount_in_dollars",
    "earnings",
    "reward",
  ]);

  const account = await updateWorkerActivity(workerId, {
    submitted: getNestedNumber(dailyStats, ["submitted", "assignments_submitted"], 0),
    approved: getNestedNumber(dailyStats, ["approved", "assignments_approved"], 0),
    rejected: getNestedNumber(dailyStats, ["rejected", "assignments_rejected"], 0),
    pending: getNestedNumber(dailyStats, ["pending", "assignments_pending"], getNestedNumber(hitsOverview, ["pending"], 0)),
    reward,
    earnings: reward,
    totalEarnings: reward,
  });

  if (!account) {
    return res.status(404).json({ message: "Worker not found" });
  }

  res.json({ ok: true, workerId: account.workerId });
});

app.get("/api/manual-task-links", async (req, res) => {
  const workerId = req.query.workerId?.trim();

  if (workerId) {
    const account = await findAccountByWorkerId(workerId);
    if (!account) {
      return res.status(404).json({ message: "Worker not found" });
    }
  }

  const taskGroups = (await repositories.taskgroups.find({})).filter((item) => item.status !== false);
  const links = taskGroups.flatMap((taskGroup) =>
    [
      [taskGroup.url1, taskGroup.url1Name],
      [taskGroup.url2, taskGroup.url2Name],
      [taskGroup.url3, taskGroup.url3Name],
      [taskGroup.url4, taskGroup.url4Name],
    ]
      .filter(([url]) => Boolean(url))
      .map(([url, title]) => ({
        title: title || taskGroup.title || "Task",
        url,
        reward: taskGroup.minReward ?? 0,
        interval: taskGroup.interval ?? 0,
      }))
  );

  res.json({ ok: true, workerId: workerId || null, links });
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
  const query = buildSearch(req.query.search, ["title", "url1", "url1Name", "url2", "url2Name", "description"]);
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
