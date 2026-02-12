const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.detail || payload?.message || "Request failed";
    throw new Error(message);
  }
  return payload;
}

export function triggerSync() {
  return request("/api/sync", { method: "POST" });
}

export function getSyncStatus() {
  return request("/api/sync/status");
}

export function getBroadcasts(params = {}) {
  const query = new URLSearchParams(params).toString();
  return request(`/api/broadcasts${query ? `?${query}` : ""}`);
}

export function getBroadcast(broadcastId) {
  return request(`/api/broadcasts/${broadcastId}`);
}

export function getBroadcastRecipients(broadcastId, params = {}) {
  const query = new URLSearchParams(params).toString();
  return request(`/api/broadcasts/${broadcastId}/recipients${query ? `?${query}` : ""}`);
}

export function getUsers(params = {}) {
  const query = new URLSearchParams(params).toString();
  return request(`/api/users${query ? `?${query}` : ""}`);
}

export function getUser(email) {
  return request(`/api/users/${encodeURIComponent(email)}`);
}

export function getSegments(params = {}) {
  const query = new URLSearchParams(params).toString();
  return request(`/api/segments${query ? `?${query}` : ""}`);
}

export function getSegment(segmentId) {
  return request(`/api/segments/${segmentId}`);
}
