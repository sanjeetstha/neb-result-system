const PUBLIC_TOKEN_KEY = "public_portal_token";

function decodeJwtPayload(token) {
  try {
    const parts = String(token || "").split(".");
    if (parts.length < 2) return null;
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const decoded = atob(base64);
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

export function setPublicToken(token) {
  localStorage.setItem(PUBLIC_TOKEN_KEY, token);
}

export function getPublicToken() {
  return localStorage.getItem(PUBLIC_TOKEN_KEY);
}

export function clearPublicToken() {
  localStorage.removeItem(PUBLIC_TOKEN_KEY);
}

export function getPublicSessionPayload() {
  const token = getPublicToken();
  if (!token) return null;
  const payload = decodeJwtPayload(token);
  if (!payload) {
    clearPublicToken();
    return null;
  }
  const expMs = Number(payload.exp || 0) * 1000;
  if (expMs && expMs <= Date.now()) {
    clearPublicToken();
    return null;
  }
  return payload;
}

export function hasPublicSession() {
  return !!getPublicSessionPayload();
}
