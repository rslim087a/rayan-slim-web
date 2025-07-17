/**
 * shared/utils.js  – browser helpers
 * • Safe JSON fetch (no "Unexpected token '<'")
 * • Old helpers (toTitle, debounce) kept
 */

/* ---------- tiny helpers ---------- */
export function toTitle(slug) {
  return slug
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function debounce(fn, wait = 300) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

/* ---------- internal fetch helpers ---------- */
function makeConfig(method = 'GET', body) {
  const cfg = { method };
  if (body != null) {
    cfg.body = typeof body === 'string' ? body : JSON.stringify(body);
    cfg.headers = { 'Content-Type': 'application/json' };
  }
  return cfg;
}

async function safeJsonFetch(url, cfg) {
  const resp = await fetch(url, cfg);
  if (!resp.ok) {
    const txt = await resp.text();
    const snippet = txt.slice(0, 120).replace(/\s+/g, ' ');
    throw new Error(`HTTP ${resp.status} – ${snippet}`);
  }
  const text = await resp.text();
  return text ? JSON.parse(text) : {};
}

/* ---------- API wrapper ---------- */
export const api = {
  // generic
  request(url, { method = 'GET', body } = {}) {
    return safeJsonFetch(url, makeConfig(method, body));
  },

  // gating
  subscribe(email, slug = 'universal') {
    return this.request('/api/subscribe', { method: 'POST', body: { email, slug } });
  },
  verifyAccess(email) {
    return this.request('/api/verify-access', { method: 'POST', body: { email } });
  },

  // progress
  loadProgress(email, courseSlug) {
    return this.request(`/api/progress/${encodeURIComponent(email)}/${encodeURIComponent(courseSlug)}`);
  },
  saveProgress(email, courseSlug, progress) {
    return this.request('/api/progress', { method: 'POST', body: { email, courseSlug, progress } });
  },

  // suggestions
  sendSuggestion(data) {
    return this.request('/api/suggestion', { method: 'POST', body: data });
  },


};
