import { useEffect, useMemo, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { api } from "./api";
import {
  AppShell,
  AuthPanel,
  DeleteCard,
  FormCard,
  HomeSummary,
  LoadingCard,
  MessageBanner,
  PageHeaderSpacer,
  SummaryGrid,
  TableCard,
} from "./components";

const SKIP_AUTH = import.meta.env.VITE_SKIP_AUTH === "true";
const DEMO_USER = {
  id: "demo-admin",
  name: "Admin A",
  email: "admin@sphinx.com",
  role: "admin",
  status: "Active",
};

const navItems = [
  { label: "Home", path: "/home" },
  { label: "Dashboard", path: "/dashboard-status" },
  {
    label: "Accounts",
    path: "/accounts",
    children: [
      { label: "List", path: "/accounts" },
      { label: "Add", path: "/accounts/add" },
    ],
  },
  {
    label: "TaskTypes",
    path: "/tasktypes",
    children: [
      { label: "List", path: "/tasktypes" },
      { label: "Add", path: "/tasktypes/add" },
    ],
  },
  { label: "TaskGroup", path: "/taskgroup" },
  { label: "All Hits", path: "/my-hits" },
  {
    label: "Users",
    path: "/users/list",
    children: [
      { label: "List", path: "/users/list" },
      { label: "Add", path: "/users/add" },
    ],
  },
  { label: "Accounts Status", path: "/accounts-status" },
  { label: "Delete data", path: "/delete-by-date" },
];

const accountColumns = [
  "S.NO",
  "WORKER ID",
  "WORKER NAME",
  "EMAIL",
  "NEXT PAYMENT",
  "LAST PAYMENT",
  "PAYMENT AMOUNT",
  "STATUS",
  "ACTIONS",
];

const dashboardColumns = [
  "S.NO",
  "WORKER NAME",
  "NEXT PAYMENT",
  "LAST PAYMENT",
  "PAYMENT AMOUNT",
  "STATUS",
  "DATE",
  "SUBTD",
  "APPRD",
  "REJTD",
  "PNDNG",
  "REWRD",
  "BONUS",
  "TOTAL",
  "ERNGS",
  "TTL APRVD",
  "APRVD RATE",
];

const dashboardChipColumns = ["SUBTD", "APPRD", "REJTD", "PNDNG", "REWRD", "BONUS", "TOTAL", "ERNGS", "TTL APRVD", "APRVD RATE"];

function useDebouncedValue(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

function useCollection(resource, enabled = true) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);

  const load = async () => {
    if (!enabled) {
      return;
    }

    setLoading(true);
    setError("");

    try {
      const data = await api.list(resource, debouncedSearch);
      setItems(data);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [resource, debouncedSearch, enabled]);

  return {
    items,
    setItems,
    loading,
    error,
    search,
    setSearch,
    refresh: load,
  };
}

function LoginPage({ onLogin }) {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (values) => {
    if (SKIP_AUTH) {
      localStorage.setItem("sphinx-token", "demo-token");
      onLogin({ ...DEMO_USER, email: values.email || DEMO_USER.email });
      return;
    }

    setLoading(true);
    setError("");

    try {
      const data = await api.login(values);
      localStorage.setItem("sphinx-token", data.token);
      onLogin(data.user);
    } catch (loginError) {
      setError(loginError.message);
    } finally {
      setLoading(false);
    }
  };

  return <AuthPanel onLogin={handleLogin} error={error} loading={loading} />;
}

function HomePage({ homeData, loading }) {
  return (
    <>
      <PageHeaderSpacer />
      {loading ? (
        <LoadingCard label="Loading Home..." />
      ) : (
        <HomeSummary
          processingWorkerIds={homeData.processingWorkerIds}
          expiredWorkerIds={homeData.expiredWorkerIds}
          email={homeData.email}
        />
      )}
    </>
  );
}

function DashboardPage() {
  const [rows, setRows] = useState([]);
  const [summaryCards, setSummaryCards] = useState([]);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");

      try {
        const data = await api.dashboard(debouncedSearch);
        setRows(data.rows);
        setSummaryCards(data.summaryCards);
      } catch (loadError) {
        setError(loadError.message);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [debouncedSearch]);

  return (
    <>
      <PageHeaderSpacer />
      {error ? <MessageBanner tone="error" message={error} /> : null}
      <TableCard
        title="Dashboard"
        searchPlaceholder="Search accounts..."
        searchValue={search}
        onSearchChange={setSearch}
        columns={dashboardColumns}
        rows={rows}
        pagination={`1-${rows.length} of ${rows.length}`}
        chipColumns={dashboardChipColumns}
        statusColumn="STATUS"
        loading={loading}
      />
      <SummaryGrid cards={summaryCards} />
    </>
  );
}

function AccountsListPage() {
  const { items, loading, error, search, setSearch, refresh } = useCollection("accounts");
  const [message, setMessage] = useState("");
  const navigate = useNavigate();

  const rows = items.map((account, index) => [
    String(index + 1),
    account.workerId,
    account.workerName,
    account.email,
    account.nextPaymentDate ? new Date(account.nextPaymentDate).toLocaleDateString("en-US") : "-",
    account.lastPaymentDate ? new Date(account.lastPaymentDate).toLocaleDateString("en-US") : "-",
    account.paymentAmount ? `$${Number(account.paymentAmount).toFixed(2)}` : "-",
    account.status === "hacked" ? "hacked" : "Active",
    { type: "actions", id: account._id },
  ]);

  const handleAction = async (action, id) => {
    const current = items.find((item) => item._id === id);
    if (!current) {
      return;
    }

    if (action === "view") {
      const nextStatus = String(current.status || "").toLowerCase() === "inactive" ? "live" : "inactive";
      await api.update("accounts", id, {
        ...current,
        status: nextStatus,
        statusLabel: nextStatus === "inactive" ? "inactive" : current.statusLabel || "0m-live",
      });
      setMessage(nextStatus === "inactive" ? "Account hidden" : "Account shown");
      refresh();
      return;
    }

    if (action === "edit") {
      navigate("/accounts/add", { state: { account: current } });
      return;
    }

    if (action === "delete") {
      await api.remove("accounts", id);
      setMessage("Account deleted");
      refresh();
    }
  };

  return (
    <>
      <PageHeaderSpacer />
      {error ? <MessageBanner tone="error" message={error} /> : null}
      {message ? <MessageBanner tone="success" message={message} /> : null}
      <TableCard
        title="Accounts"
        searchPlaceholder="Search accounts..."
        searchValue={search}
        onSearchChange={setSearch}
        columns={accountColumns}
        rows={rows}
        pagination={`1-${rows.length} of ${rows.length}`}
        statusColumn="STATUS"
        actionColumn="ACTIONS"
        loading={loading}
        onAction={handleAction}
      />
    </>
  );
}

function AccountsAddPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const editing = location.state?.account;
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const initialValues = {
    email: editing?.email || "testcompany@gmail.com",
    password: editing?.password || "",
    workerId: editing?.workerId || "",
    workerName: editing?.workerName || "",
    accountKey: editing?.accountKey || "",
    nextPaymentDate: editing?.nextPaymentDate ? editing.nextPaymentDate.slice(0, 10) : "",
    lastPaymentDate: editing?.lastPaymentDate ? editing.lastPaymentDate.slice(0, 10) : "",
    paymentAmount: editing?.paymentAmount || "",
    status: editing?.status || "live",
    statusLabel: editing?.statusLabel || "0m-live",
    activityDate: editing?.activityDate ? editing.activityDate.slice(0, 10) : "",
    submitted: editing?.submitted || 0,
    approved: editing?.approved || 0,
    rejected: editing?.rejected || 0,
    pending: editing?.pending || 0,
    reward: editing?.reward || 0,
    bonus: editing?.bonus || 0,
    earnings: editing?.earnings || 0,
    totalApproved: editing?.totalApproved || 0,
    totalEarnings: editing?.totalEarnings || 0,
  };

  const fields = [
    { label: "Email *", name: "email", value: initialValues.email },
    { label: "Password *", name: "password", value: initialValues.password, type: "password" },
    { label: "Worker Id *", name: "workerId", value: initialValues.workerId },
    { label: "Worker Name", name: "workerName", value: initialValues.workerName },
    { label: "Account Key", name: "accountKey", value: initialValues.accountKey },
    { label: "Next Payment Date", name: "nextPaymentDate", value: initialValues.nextPaymentDate, type: "date" },
    { label: "Last Payment Date", name: "lastPaymentDate", value: initialValues.lastPaymentDate, type: "date" },
    { label: "Payment Amount", name: "paymentAmount", value: initialValues.paymentAmount, type: "number" },
  ];

  const handleSubmit = async (values) => {
    setLoading(true);
    setError("");
    setMessage("");

    try {
      if (editing?._id) {
        await api.update("accounts", editing._id, values);
        setMessage("Account updated");
      } else {
        await api.create("accounts", values);
        setMessage("Account created");
      }

      setTimeout(() => navigate("/accounts"), 600);
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <PageHeaderSpacer />
      {error ? <MessageBanner tone="error" message={error} /> : null}
      {message ? <MessageBanner tone="success" message={message} /> : null}
      <FormCard
        title="Add Accounts"
        fields={fields}
        actions={["Cancel", editing ? "Update" : "Create"]}
        submitLabel={editing ? "Update" : "Create"}
        onSubmit={handleSubmit}
        onCancel={() => navigate("/accounts")}
        loading={loading}
        cancelLabel="Cancel"
      />
    </>
  );
}

function TaskTypesListPage() {
  const { items, loading, error, search, setSearch, refresh } = useCollection("tasktypes");
  const navigate = useNavigate();

  const rows = items.map((taskType, index) => [
    String(items.length - index),
    taskType.title,
    taskType.taskUrl,
    taskType.status,
    { type: "actions", id: taskType._id },
  ]);

  const handleAction = async (action, id) => {
    const current = items.find((item) => item._id === id);
    if (!current) {
      return;
    }

    if (action === "view") {
      const nextStatus = current.status === "Inactive" ? "Active" : "Inactive";
      await api.update("tasktypes", id, { ...current, status: nextStatus });
      refresh();
      return;
    }

    if (action === "edit") {
      navigate("/tasktypes/add", { state: { taskType: current } });
      return;
    }

    if (action === "delete") {
      await api.remove("tasktypes", id);
      refresh();
    }
  };

  return (
    <>
      <PageHeaderSpacer />
      {error ? <MessageBanner tone="error" message={error} /> : null}
      <TableCard
        title="Task Types"
        searchPlaceholder="Search..."
        searchValue={search}
        onSearchChange={setSearch}
        columns={["ID", "TITLE", "TASK URL", "STATUS", "ACTIONS"]}
        rows={rows}
        pagination={`1-${rows.length} of ${rows.length}`}
        statusColumn="STATUS"
        actionColumn="ACTIONS"
        loading={loading}
        onAction={handleAction}
      />
    </>
  );
}

function TaskTypesAddPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const editing = location.state?.taskType;
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const handleSubmit = async (values) => {
    setError("");
    setMessage("");

    try {
      if (editing?._id) {
        await api.update("tasktypes", editing._id, values);
        setMessage("Task Type updated");
      } else {
        await api.create("tasktypes", values);
        setMessage("Task Type created");
      }
      setTimeout(() => navigate("/tasktypes"), 500);
    } catch (submitError) {
      setError(submitError.message);
    }
  };

  return (
    <>
      <PageHeaderSpacer />
      {error ? <MessageBanner tone="error" message={error} /> : null}
      {message ? <MessageBanner tone="success" message={message} /> : null}
      <FormCard
        title="Add Task Type"
        fields={[
          { label: "Title *", name: "title", value: editing?.title || "" },
          { label: "Task URL *", name: "taskUrl", value: editing?.taskUrl || "" },
          {
            label: "Status",
            name: "status",
            value: editing?.status || "Active",
            type: "select",
            options: ["Active", "Inactive"],
          },
        ]}
        actions={["Cancel", editing ? "Update" : "Create"]}
        submitLabel={editing ? "Update" : "Create"}
        onSubmit={handleSubmit}
        onCancel={() => navigate("/tasktypes")}
        cancelLabel="Cancel"
      />
    </>
  );
}

function TaskGroupPage() {
  const { items, loading, error, search, setSearch, refresh } = useCollection("taskgroups");
  const [editing, setEditing] = useState(null);
  const [message, setMessage] = useState("");
  const [formValues, setFormValues] = useState({
    title: "",
    status: true,
    url1: "",
    url1Name: "",
    url2: "",
    url2Name: "",
    url3: "",
    url3Name: "",
    url4: "",
    url4Name: "",
    minReward: "0.2",
    interval: "1000",
    bannedRequesters: "",
    description: "",
  });

  useEffect(() => {
    if (!editing) {
      setFormValues({
        title: "",
        status: true,
        url1: "",
        url1Name: "",
        url2: "",
        url2Name: "",
        url3: "",
        url3Name: "",
        url4: "",
        url4Name: "",
        minReward: "0.2",
        interval: "1000",
        bannedRequesters: "",
        description: "",
      });
      return;
    }

    setFormValues({
      title: editing.title || "",
      status: editing.status !== false,
      url1: editing.url1 || "",
      url1Name: editing.url1Name || "",
      url2: editing.url2 || "",
      url2Name: editing.url2Name || "",
      url3: editing.url3 || "",
      url3Name: editing.url3Name || "",
      url4: editing.url4 || "",
      url4Name: editing.url4Name || "",
      minReward: editing.minReward ?? "0.2",
      interval: editing.interval ?? "1000",
      bannedRequesters: editing.bannedRequesters || "",
      description: editing.description || "",
    });
  }, [editing]);

  const rows = items.map((taskGroup, index) => [
    String(index + 1),
    taskGroup.url1 || taskGroup.title || "-",
    taskGroup.url1Name || "-",
    taskGroup.status === false ? "Off" : "On",
    { type: "taskgroup-actions", id: taskGroup._id, hidden: taskGroup.status === false },
  ]);

  const handleSubmit = async (event) => {
    event.preventDefault();
      const payload = {
        ...formValues,
        title: formValues.url1Name || formValues.url1 || "",
        minReward: Number(formValues.minReward) || 0,
        interval: Number(formValues.interval) || 0,
      };

    if (editing?._id) {
      await api.update("taskgroups", editing._id, payload);
      setMessage("TaskGroup updated");
    } else {
      await api.create("taskgroups", payload);
      setMessage("TaskGroup created");
    }
    setEditing(null);
    refresh();
  };

  const handleAction = async (action, id) => {
    const current = items.find((item) => item._id === id);
    if (!current) {
      return;
    }

    if (action === "toggle-hide") {
      await api.update("taskgroups", id, {
        ...current,
        status: current.status === false,
      });
      setMessage(current.status === false ? "TaskGroup shown" : "TaskGroup hidden");
      refresh();
      return;
    }

    if (action === "edit") {
      setEditing(current);
      return;
    }
    if (action === "delete") {
      await api.remove("taskgroups", id);
      refresh();
    }
  };

  return (
    <>
      <PageHeaderSpacer />
      {error ? <MessageBanner tone="error" message={error} /> : null}
      {message ? <MessageBanner tone="success" message={message} /> : null}
      <section className="panel form-panel">
        <div className="panel-header">
          <h2>TaskGroup</h2>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="taskgroup-toolbar">
            <div className="taskgroup-status">
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={formValues.status}
                  onChange={(event) =>
                    setFormValues((current) => ({
                      ...current,
                      status: event.target.checked,
                    }))
                  }
                />
                <span className="toggle-track" />
              </label>
              <span>Status</span>
            </div>
          </div>
          <div className="taskgroup-grid">
            {[
              ["URL 1", "url1", "url1Name"],
              ["URL 2", "url2", "url2Name"],
              ["URL 3", "url3", "url3Name"],
              ["URL 4", "url4", "url4Name"],
            ].map(([label, leftName, rightName]) => (
              <div className="taskgroup-row" key={leftName}>
                <label className="field">
                  <span>{label}</span>
                  <input
                    type="text"
                    value={formValues[leftName]}
                    disabled={!formValues.status}
                    onChange={(event) =>
                      setFormValues((current) => ({
                        ...current,
                        [leftName]: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="field">
                  <span>&nbsp;</span>
                  <input
                    type="text"
                    value={formValues[rightName]}
                    disabled={!formValues.status}
                    onChange={(event) =>
                      setFormValues((current) => ({
                        ...current,
                        [rightName]: event.target.value,
                      }))
                    }
                  />
                </label>
              </div>
            ))}
          </div>
          <div className="taskgroup-subhead">Survey Settings:</div>
          <div className="taskgroup-grid survey-grid">
            <label className="field">
              <span>Min Reward:</span>
              <input
                type="number"
                step="0.01"
                value={formValues.minReward}
                disabled={!formValues.status}
                onChange={(event) =>
                  setFormValues((current) => ({
                    ...current,
                    minReward: event.target.value,
                  }))
                }
              />
            </label>
            <label className="field">
              <span>Interval:</span>
              <input
                type="number"
                value={formValues.interval}
                disabled={!formValues.status}
                onChange={(event) =>
                  setFormValues((current) => ({
                    ...current,
                    interval: event.target.value,
                  }))
                }
              />
            </label>
            <label className="field taskgroup-textarea">
              <span>Banned Requesters List:</span>
              <textarea
                value={formValues.bannedRequesters}
                disabled={!formValues.status}
                onChange={(event) =>
                  setFormValues((current) => ({
                    ...current,
                    bannedRequesters: event.target.value,
                  }))
                }
              />
            </label>
          </div>
          <div className="form-actions">
            <button type="button" className="ghost-button" onClick={() => setEditing(null)}>
              Cancel
            </button>
            <button type="submit" className="primary-button small">
              {editing ? "Update" : "Create"}
            </button>
          </div>
        </form>
      </section>
    </>
  );
}

function HitsPage() {
  const { items, loading, error, search, setSearch, refresh } = useCollection("hits");
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (location.state?.seedHit) {
      api.create("hits", location.state.seedHit).then(refresh).catch(() => {});
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location, navigate]);

  const rows = items.map((hit, index) => [
    { type: "checkbox", checked: false },
    String(index + 1),
    hit.workerName,
    hit.task,
    hit.requester,
    String(hit.reward),
    hit.timeRemaining || hit.status,
    { type: "hit-actions", id: hit._id, status: hit.status },
  ]);

  const handleAction = async (action, id) => {
    const current = items.find((item) => item._id === id);

    if (action === "view") {
      const target = current?.task || "";
      const url = /^https?:\/\//i.test(target) ? target : `https://${target}`;
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }

    if (action === "complete") {
      await api.completeHit(id);
      refresh();
      return;
    }

    if (action === "delete") {
      await api.remove("hits", id);
      refresh();
    }
  };

  return (
    <>
      <PageHeaderSpacer />
      {error ? <MessageBanner tone="error" message={error} /> : null}
      <TableCard
        title="Hit List"
        searchPlaceholder="Search all columns..."
        searchValue={search}
        onSearchChange={setSearch}
        columns={["", "S.NO", "WORKER NAME", "TASK", "REQUESTER", "REWARD", "TIME REMAINING", "ACTIONS"]}
        rows={rows}
        pagination={`1-${rows.length} of ${rows.length}`}
        actionColumn="ACTIONS"
        loading={loading}
        onAction={handleAction}
      />
    </>
  );
}

function UsersListPage() {
  const { items, loading, error, search, setSearch, refresh } = useCollection("users");
  const navigate = useNavigate();

  const rows = items.map((user, index) => [
    { type: "checkbox", checked: index === 0 },
    user.name,
    user.email,
    user.mobileNumber || "-",
    user.status || "Active",
    { type: "actions", id: user._id || user.id },
  ]);

  const handleAction = async (action, id) => {
    const current = items.find((item) => (item._id || item.id) === id);
    if (!current) {
      return;
    }

    if (action === "view") {
      const nextStatus = current.status === "Inactive" ? "Active" : "Inactive";
      await api.update("users", id, { ...current, status: nextStatus });
      refresh();
      return;
    }

    if (action === "edit") {
      navigate("/users/add", { state: { user: current } });
      return;
    }

    if (action === "delete") {
      await api.remove("users", id);
      refresh();
    }
  };

  return (
    <>
      <PageHeaderSpacer />
      {error ? <MessageBanner tone="error" message={error} /> : null}
      <TableCard
        title="Users List"
        searchPlaceholder="Search all columns..."
        searchValue={search}
        onSearchChange={setSearch}
        columns={["", "NAME", "EMAIL", "PHONE", "STATUS", "ACTIONS"]}
        rows={rows}
        pagination={`0-${rows.length} of ${rows.length}`}
        statusColumn="STATUS"
        actionColumn="ACTIONS"
        loading={loading}
        onAction={handleAction}
      />
    </>
  );
}

function UsersAddPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const editing = location.state?.user;
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const handleSubmit = async (values) => {
    setError("");
    setMessage("");

    try {
      if (editing?._id || editing?.id) {
        await api.update("users", editing._id || editing.id, values);
        setMessage("User updated");
      } else {
        await api.create("users", values);
        setMessage("User created");
      }
      setTimeout(() => navigate("/users/list"), 500);
    } catch (submitError) {
      setError(submitError.message);
    }
  };

  return (
    <>
      <PageHeaderSpacer />
      {error ? <MessageBanner tone="error" message={error} /> : null}
      {message ? <MessageBanner tone="success" message={message} /> : null}
      <FormCard
        title="Add User"
        fields={[
          { label: "Name", name: "name", value: editing?.name || "" },
          { label: "Email", name: "email", value: editing?.email || "testcompany@gmail.com" },
          { label: "Password", name: "password", value: "", type: "password" },
          { label: "Mobile Number", name: "mobileNumber", value: editing?.mobileNumber || "" },
          { label: "Address", name: "address", value: editing?.address || "", tall: true, type: "textarea" },
        ]}
        actions={["Cancel", editing ? "Update" : "Create"]}
        submitLabel={editing ? "Update" : "Create"}
        onSubmit={handleSubmit}
        onCancel={() => navigate("/users/list")}
        cancelLabel="Cancel"
      />
    </>
  );
}

function AccountsStatusPage() {
  const { items, loading, error, search, setSearch } = useCollection("accounts-status");

  const rows = items.map((account) => [account.workerId, account.status]);

  return (
    <>
      <PageHeaderSpacer />
      {error ? <MessageBanner tone="error" message={error} /> : null}
      <TableCard
        title="Accounts Status"
        searchPlaceholder="Search accounts..."
        searchValue={search}
        onSearchChange={setSearch}
        columns={["WORKER ID", "STATUS"]}
        rows={rows}
        pagination={`1-${rows.length} of ${rows.length}`}
        statusColumn="STATUS"
        loading={loading}
      />
    </>
  );
}

function DeletePage() {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const handleDelete = async ({ date }) => {
    setMessage("");
    setError("");
    try {
      await api.deleteByDate(date);
      setMessage("Deleted successfully");
    } catch (deleteError) {
      setError(deleteError.message);
    }
  };

  return (
    <>
      <PageHeaderSpacer />
      {error ? <MessageBanner tone="error" message={error} /> : null}
      {message ? <MessageBanner tone="success" message={message} /> : null}
      <DeleteCard onSubmit={handleDelete} />
    </>
  );
}

function ProtectedApp({ user, onLogout }) {
  const location = useLocation();
  const activePath = useMemo(() => location.pathname, [location.pathname]);
  const [homeData, setHomeData] = useState({ processingWorkerIds: [], expiredWorkerIds: [], email: user?.email || "" });
  const [loadingHome, setLoadingHome] = useState(true);

  useEffect(() => {
    api.home()
      .then(setHomeData)
      .finally(() => setLoadingHome(false));
  }, []);

  return (
    <AppShell navItems={navItems} activePath={activePath} profile={user} onLogout={onLogout}>
      <Routes>
        <Route path="/home" element={<HomePage homeData={homeData} loading={loadingHome} />} />
        <Route path="/dashboard-status" element={<DashboardPage />} />
        <Route path="/accounts" element={<AccountsListPage />} />
        <Route path="/accounts/add" element={<AccountsAddPage />} />
        <Route path="/tasktypes" element={<TaskTypesListPage />} />
        <Route path="/tasktypes/add" element={<TaskTypesAddPage />} />
        <Route path="/taskgroup" element={<TaskGroupPage />} />
        <Route path="/my-hits" element={<HitsPage />} />
        <Route path="/users/list" element={<UsersListPage />} />
        <Route path="/users/add" element={<UsersAddPage />} />
        <Route path="/accounts-status" element={<AccountsStatusPage />} />
        <Route path="/delete-by-date" element={<DeletePage />} />
        <Route path="*" element={<Navigate to="/home" replace />} />
      </Routes>
    </AppShell>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem("sphinx-token");
    if (!token) {
      setChecking(false);
      return;
    }

    if (SKIP_AUTH) {
      setUser(DEMO_USER);
      setChecking(false);
      return;
    }

    api.me()
      .then((data) => setUser(data.user))
      .catch(() => {
        localStorage.removeItem("sphinx-token");
      })
      .finally(() => setChecking(false));
  }, []);

  const handleLogin = (loggedUser) => {
    setUser(loggedUser);
    navigate("/home");
  };

  const handleLogout = () => {
    localStorage.removeItem("sphinx-token");
    setUser(null);
    navigate("/login");
  };

  if (checking) {
    return <LoadingCard label="Loading Sphinx..." fullPage />;
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={user ? <Navigate to="/home" replace /> : <LoginPage onLogin={handleLogin} />}
      />
      <Route
        path="/*"
        element={user ? <ProtectedApp user={user} onLogout={handleLogout} /> : <Navigate to="/login" replace />}
      />
    </Routes>
  );
}
