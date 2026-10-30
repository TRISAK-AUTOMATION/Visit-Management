// client/src/lib/pinnedTools.js
export const MAX_PINNED = 4;

const keyFor = (userId) => `pinnedAdminTools:${userId}`;

export function getPinnedAdminTools(userId) {
  if (userId == null) return [];
  try {
    const raw = localStorage.getItem(keyFor(userId));
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function setPinnedAdminTools(userId, hrefs) {
  if (userId == null) return [];
  const clean = [...new Set(hrefs)].slice(0, MAX_PINNED);
  try {
    localStorage.setItem(keyFor(userId), JSON.stringify(clean));
  } catch {}
  return clean;
}

export function togglePinnedAdminTool(userId, href) {
  const current = getPinnedAdminTools(userId);
  if (current.includes(href)) {
    return setPinnedAdminTools(userId, current.filter((h) => h !== href));
  }
  if (current.length >= MAX_PINNED) return current;
  return setPinnedAdminTools(userId, [...current, href]);
}