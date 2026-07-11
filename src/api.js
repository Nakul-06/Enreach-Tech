const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api";

function getHeaders(includeJson = true) {
  const headers = {};
  const token = localStorage.getItem("sphinx-token");

  if (includeJson) {
    headers["Content-Type"] = "application/json";
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

async function request(path, options = {}) {
  let response;

  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        ...getHeaders(options.body !== undefined || options.method && options.method !== "GET"),
        ...(options.headers || {}),
      },
    });
  } catch {
    throw new Error("Cannot reach the server. Start the backend and check MongoDB.");
  }

  if (response.status === 204) {
    return null;
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || "Request failed");
  }

  return data;
}

export const api = {
  login: (payload) => request("/auth/login", { method: "POST", body: JSON.stringify(payload) }),
  me: () => request("/auth/me"),
  home: () => request("/home"),
  dashboard: (search = "") => request(`/dashboard?search=${encodeURIComponent(search)}`),
  list: (resource, search = "") => request(`/${resource}?search=${encodeURIComponent(search)}`),
  create: (resource, payload) => request(`/${resource}`, { method: "POST", body: JSON.stringify(payload) }),
  update: (resource, id, payload) =>
    request(`/${resource}/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  remove: (resource, id) => request(`/${resource}/${id}`, { method: "DELETE" }),
  completeHit: (id) => request(`/hits/${id}/complete`, { method: "PATCH" }),
  deleteByDate: (date) =>
    request("/delete-by-date", { method: "DELETE", body: JSON.stringify({ date }) }),
};
