import { Link } from "react-router-dom";
import { useEffect, useState } from "react";

function Logo() {
  return (
    <div className="logo">
      <div className="logo-mark">
        <span />
      </div>
      <span>Sphinx</span>
    </div>
  );
}

export function AuthPanel({ onLogin, error, loading }) {
  const [values, setValues] = useState({
    email: "admin@sphinx.com",
    password: "Sphinx@123",
  });

  return (
    <div className="auth-page">
      <div className="auth-hero">
        <div className="hero-brand">
          <Logo />
        </div>
        <div className="hero-scene">
          <div className="hero-glow hero-glow-a" />
          <div className="hero-glow hero-glow-b" />
          <div className="hero-ring hero-ring-a" />
          <div className="hero-ring hero-ring-b" />
          <div className="royal-model-wrap" aria-hidden="true">
            <div className="royal-orb">
              <div className="royal-orb-core" />
              <div className="royal-orb-ring royal-orb-ring-a" />
              <div className="royal-orb-ring royal-orb-ring-b" />
            </div>
            <div className="royal-plinth">
              <span className="plinth-top" />
              <span className="plinth-face" />
            </div>
          </div>
          <div className="hero-card">
            <div className="hero-card-line" />
            <div className="hero-card-line short" />
            <div className="hero-card-line faint" />
          </div>
        </div>
      </div>
      <div className="auth-form-wrap">
        <form
          className="auth-form"
          onSubmit={(event) => {
            event.preventDefault();
            onLogin(values);
          }}
        >
          <h1>Welcome to Sphinx!</h1>
          <p>Please sign-in to your account and start</p>
          <label>
            <span>Email</span>
            <input
              type="email"
              placeholder="Enter your email"
              value={values.email}
              onChange={(event) => setValues((current) => ({ ...current, email: event.target.value }))}
            />
            {error ? <small>{error}</small> : <small>Email is required</small>}
          </label>
          <label>
            <span>Password</span>
            <input
              type="password"
              value={values.password}
              onChange={(event) => setValues((current) => ({ ...current, password: event.target.value }))}
            />
          </label>
          <div className="auth-row">
            <label className="checkbox">
              <input type="checkbox" />
              <span>Remember me</span>
            </label>
            <a href="/login">Forgot password?</a>
          </div>
          <button type="submit" className="primary-button" disabled={loading}>
            {loading ? "Signing in..." : "Login"}
          </button>
        </form>
      </div>
    </div>
  );
}

function Sidebar({ navItems, activePath }) {
  return (
    <aside className="sidebar">
      <Logo />
      <nav className="sidebar-nav">
        {navItems.map((item) => {
          const isActiveSection =
            activePath === item.path ||
            (item.children && item.children.some((child) => child.path === activePath));

          return (
            <div key={item.label} className="nav-section">
              <Link to={item.path} className={`nav-item ${isActiveSection && !item.children ? "active" : ""}`}>
                {item.label}
              </Link>
              {item.children && isActiveSection ? (
                <div className="nav-children">
                  {item.children.map((child) => (
                    <Link
                      key={child.path}
                      to={child.path}
                      className={`nav-item sub-item ${activePath === child.path ? "active" : ""}`}
                    >
                      {child.label}
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}

function Topbar({ profile, onLogout }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="topbar-shell">
      <div className="topbar-blank" />
      <div className="profile-area">
        <button className="profile-chip" onClick={() => setOpen((value) => !value)} type="button">
          <div className="profile-avatar">{(profile?.name || "A").slice(0, 1)}</div>
          <span className="profile-dot" />
        </button>
        {open ? (
          <div className="profile-menu">
            <div className="profile-menu-head">
              <div className="profile-avatar large">{(profile?.name || "A").slice(0, 1)}</div>
              <div>
                <strong>{profile?.name || "Admin A"}</strong>
                <small>{profile?.email || "admin@sphinx.com"}</small>
              </div>
            </div>
            <button type="button">My Profile</button>
            <button type="button">Change Password</button>
            <button type="button" className="logout-button" onClick={onLogout}>
              Logout
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function AppShell({ navItems, activePath, profile, onLogout, children }) {
  return (
    <div className="app-layout">
      <Sidebar navItems={navItems} activePath={activePath} />
      <main className="main-area">
        <Topbar profile={profile} onLogout={onLogout} />
        {children}
        <footer className="footer">© 2026,Sphinx</footer>
      </main>
    </div>
  );
}

export function PageHeaderSpacer() {
  return <div className="page-spacer" />;
}

export function LoadingCard({ label, fullPage = false }) {
  return (
    <div className={fullPage ? "loading-shell full-page" : "loading-shell"}>
      <div className="panel loading-card">{label}</div>
    </div>
  );
}

export function MessageBanner({ message, tone }) {
  return <div className={`message-banner ${tone}`}>{message}</div>;
}

export function HomeSummary({ processingWorkerIds = [], expiredWorkerIds = [], email = "" }) {
  return (
    <section className="panel home-panel">
      <div className="panel-body">
        <h2>Dashboard Summary</h2>
        <div className="summary-copy">
          <p>Processing Workers IDs:</p>
          <span>{processingWorkerIds.length ? processingWorkerIds.join(", ") : "No processing workers"}</span>
          <p>Expired Workers IDs:</p>
          <span>{expiredWorkerIds.length ? expiredWorkerIds.join(", ") : "No expired workers"}</span>
        </div>
        <div className="summary-email">{email}</div>
      </div>
    </section>
  );
}

export function FormCard({
  title,
  fields,
  actions,
  onSubmit,
  onCancel,
  submitLabel,
  loading = false,
}) {
  const [values, setValues] = useState({});

  useEffect(() => {
    const nextValues = {};
    fields.forEach((field) => {
      nextValues[field.name] = field.value ?? "";
    });
    setValues(nextValues);
  }, [fields]);

  return (
    <section className="panel form-panel">
      <div className="panel-header">
        <h2>{title}</h2>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(values);
        }}
      >
        <div className="form-grid">
          {fields.map((field) => (
            <label key={field.label} className={field.tall ? "field tall" : "field"}>
              <span>{field.label}</span>
              <input
                type={field.type || "text"}
                placeholder={field.placeholder || ""}
                value={values[field.name] ?? ""}
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    [field.name]: event.target.value,
                  }))
                }
              />
            </label>
          ))}
        </div>
        <div className="form-actions">
          {actions.map((action, index) => {
            const isSubmit = action === submitLabel;
            return (
              <button
                key={action}
                type={isSubmit ? "submit" : "button"}
                onClick={isSubmit ? undefined : onCancel}
                className={index === actions.length - 1 ? "primary-button small" : "ghost-button"}
                disabled={loading}
              >
                {loading && isSubmit ? "Saving..." : action}
              </button>
            );
          })}
        </div>
      </form>
    </section>
  );
}

function ActionIcons({ actionId, onAction }) {
  return (
    <div className="action-icons">
      <button type="button" className="icon-button eye" onClick={() => onAction?.("view", actionId)}>◉</button>
      <button type="button" className="icon-button edit" onClick={() => onAction?.("edit", actionId)}>✎</button>
      <button type="button" className="icon-button trash" onClick={() => onAction?.("delete", actionId)}>🗑</button>
    </div>
  );
}

function HitActions({ actionId, status, onAction }) {
  return (
    <div className="hit-actions">
      <button type="button" className="text-link" onClick={() => onAction?.("view", actionId)}>
        Click Here
      </button>
      {status === "Complete" ? (
        <span className="completed-text">Complete</span>
      ) : (
        <button type="button" className="text-link" onClick={() => onAction?.("complete", actionId)}>
          Set as Complete
        </button>
      )}
    </div>
  );
}

export function TableCard({
  title,
  searchPlaceholder,
  searchValue = "",
  onSearchChange,
  columns,
  rows,
  pagination,
  chipColumns = [],
  statusColumn,
  actionColumn,
  loading = false,
  onAction,
}) {
  const statusIndex = statusColumn ? columns.indexOf(statusColumn) : -1;
  const actionIndex = actionColumn ? columns.indexOf(actionColumn) : -1;

  return (
    <section className="panel table-panel">
      <div className="panel-header table-header">
        <h2>{title}</h2>
        <input
          className="search-input"
          placeholder={searchPlaceholder}
          value={searchValue}
          onChange={(event) => onSearchChange?.(event.target.value)}
        />
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              {columns.map((column, index) => (
                <th key={`${column}-${index}`}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={columns.length} className="empty-row">
                  Loading...
                </td>
              </tr>
            ) : rows.length ? (
              rows.map((row, rowIndex) => (
                <tr key={`${title}-${rowIndex}`}>
                  {row.map((cell, index) => {
                    const column = columns[index];

                    if (actionIndex === index && cell?.type === "actions") {
                      return (
                        <td key={`${cell.id}-${index}`}>
                          <ActionIcons actionId={cell.id} onAction={onAction} />
                        </td>
                      );
                    }

                    if (actionIndex === index && cell?.type === "hit-actions") {
                      return (
                        <td key={`${cell.id}-${index}`}>
                          <HitActions actionId={cell.id} status={cell.status} onAction={onAction} />
                        </td>
                      );
                    }

                    if (statusIndex === index) {
                      return (
                        <td key={`${cell}-${index}`}>
                          <span className={`status-text ${String(cell).includes("hack") ? "bad" : "good"}`}>{cell}</span>
                        </td>
                      );
                    }

                    if (chipColumns.includes(column)) {
                      return (
                        <td key={`${cell}-${index}`}>
                          <span className={`value-chip chip-${index % 6}`}>{cell}</span>
                        </td>
                      );
                    }

                    return <td key={`${cell}-${index}`}>{cell}</td>;
                  })}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={columns.length} className="empty-row">
                  No data available
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="table-footer">
        <span>Rows per page: 10</span>
        <span>{pagination}</span>
        <span>‹</span>
        <span>›</span>
      </div>
    </section>
  );
}

export function SummaryGrid({ cards = [] }) {
  return (
    <section className="summary-section">
      <h2>Daily Report Summary</h2>
      <div className="summary-grid">
        {cards.map((card) => (
          <div key={card.title} className={`summary-card ${card.tone}`}>
            <span>{card.title}</span>
            <strong>{card.value}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

export function DeleteCard({ onSubmit }) {
  const [date, setDate] = useState("");

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Delete Data by Date</h2>
      </div>
      <form
        className="delete-row"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit({ date });
        }}
      >
        <label className="field">
          <span>Select Date:</span>
          <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </label>
        <button type="submit" className="danger-button">Delete</button>
      </form>
    </section>
  );
}
