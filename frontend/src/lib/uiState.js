const KEY = "sidebar_collapsed"; // "1" | "0"

export function getSidebarCollapsed() {
  return localStorage.getItem(KEY) === "1";
}

export function setSidebarCollapsed(v) {
  localStorage.setItem(KEY, v ? "1" : "0");
}
