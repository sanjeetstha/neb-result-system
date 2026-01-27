const KEY = "theme"; // "light" | "dark"

export function getTheme() {
  return localStorage.getItem(KEY) || "light";
}

export function setTheme(t) {
  localStorage.setItem(KEY, t);
  const root = document.documentElement;
  if (t === "dark") root.classList.add("dark");
  else root.classList.remove("dark");
}

export function initTheme() {
  setTheme(getTheme());
}

export function toggleTheme() {
  const next = getTheme() === "dark" ? "light" : "dark";
  setTheme(next);
  return next;
}
