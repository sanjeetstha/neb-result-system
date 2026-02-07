import { useEffect, useState } from "react";

const KEY = "app_settings";

const DEFAULTS = {
  brand_name: "NEB Result System",
  org_name: "Gaurishankar Multiple Campus",
  tagline: "NEB +2 Result Management",
  logo_data_url: "",
  logo_small_data_url: "",
  favicon_data_url: "",
  logo_size: 44,
  logo_small_size: 28,
  // Default palette from ColorHunt
  primary_color: "#0c2c55",
  accent_color: "#629fad",
  sidebar_color: "#0c2c55",
  header_style: "glass", // glass | solid
  notice_enabled: true,
  notice_text: "Welcome to NEB Result System • Publish results with confidence •",
  notice_speed: 28,
  notice_style: "gradient", // solid | gradient
  notice_bg_color: "#ededce",
  notice_accent_color: "#629fad",
  notice_text_color: "#0c2c55",
  notifications_enabled: true,
};

function safeParse(json) {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function hexToHsl(hex) {
  const clean = String(hex || "").replace("#", "").trim();
  if (![3, 6].includes(clean.length)) return null;
  const full =
    clean.length === 3
      ? clean.split("").map((c) => c + c).join("")
      : clean;
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
      default:
        break;
    }
    h /= 6;
  }

  const hh = Math.round(h * 360);
  const ss = Math.round(s * 100);
  const ll = Math.round(l * 100);
  return `${hh} ${ss}% ${ll}%`;
}

function hexToRgb(hex) {
  const clean = String(hex || "").replace("#", "").trim();
  if (![3, 6].includes(clean.length)) return null;
  const full =
    clean.length === 3
      ? clean.split("").map((c) => c + c).join("")
      : clean;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  if ([r, g, b].some((v) => Number.isNaN(v))) return null;
  return { r, g, b };
}

function rgbToHex({ r, g, b }) {
  const toHex = (n) => n.toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function mixHex(hex, targetHex, amount) {
  const a = hexToRgb(hex);
  const b = hexToRgb(targetHex);
  if (!a || !b) return null;
  const mix = (x, y) => Math.round(x + (y - x) * amount);
  return rgbToHex({
    r: mix(a.r, b.r),
    g: mix(a.g, b.g),
    b: mix(a.b, b.b),
  });
}

export function isLightColor(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return false;
  const { r, g, b } = rgb;
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6;
}

function applyTheme(settings) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;

  const primary = hexToHsl(settings.primary_color) || hexToHsl(DEFAULTS.primary_color);
  const accent = hexToHsl(settings.accent_color) || hexToHsl(DEFAULTS.accent_color);
  const sidebar = hexToHsl(settings.sidebar_color) || hexToHsl(DEFAULTS.sidebar_color);

  if (primary) root.style.setProperty("--primary", primary);
  if (accent) root.style.setProperty("--accent", accent);
  if (accent) root.style.setProperty("--ring", accent);
  if (sidebar) root.style.setProperty("--sidebar", sidebar);

  const sidebarStrongHex =
    mixHex(settings.sidebar_color, "#000000", 0.2) ||
    mixHex(DEFAULTS.sidebar_color, "#000000", 0.2);
  const sidebarSoftHex =
    mixHex(settings.sidebar_color, "#ffffff", 0.18) ||
    mixHex(DEFAULTS.sidebar_color, "#ffffff", 0.18);

  const sidebarStrong = hexToHsl(sidebarStrongHex);
  const sidebarSoft = hexToHsl(sidebarSoftHex);
  if (sidebarStrong) root.style.setProperty("--sidebar-strong", sidebarStrong);
  if (sidebarSoft) root.style.setProperty("--sidebar-soft", sidebarSoft);

  const primaryIsLight = isLightColor(settings.primary_color);
  root.style.setProperty(
    "--primary-foreground",
    primaryIsLight ? "222.2 47.4% 11.2%" : "210 40% 98%"
  );

  const accentIsLight = isLightColor(settings.accent_color);
  root.style.setProperty(
    "--accent-foreground",
    accentIsLight ? "222.2 47.4% 11.2%" : "210 40% 98%"
  );

  const speed = Number(settings.notice_speed);
  const safeSpeed = Number.isFinite(speed) ? clamp(speed, 10, 60) : DEFAULTS.notice_speed;
  root.style.setProperty("--notice-speed", `${safeSpeed}s`);

  // favicon
  const favicon = settings.favicon_data_url || settings.logo_small_data_url || settings.logo_data_url;
  if (favicon) {
    let link = document.querySelector("link[rel='icon']");
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.href = favicon;
  }
}

export function getAppSettings() {
  const raw = safeParse(localStorage.getItem(KEY));
  return { ...DEFAULTS, ...(raw || {}) };
}

export function saveAppSettings(next) {
  const merged = { ...DEFAULTS, ...(next || {}) };
  localStorage.setItem(KEY, JSON.stringify(merged));
  applyTheme(merged);
  window.dispatchEvent(new Event("app_settings_updated"));
  return merged;
}

export function initAppSettings() {
  const s = getAppSettings();
  applyTheme(s);
  return s;
}

export function useAppSettings() {
  const [settings, setSettings] = useState(() => getAppSettings());

  useEffect(() => {
    const onChange = () => setSettings(getAppSettings());
    window.addEventListener("storage", onChange);
    window.addEventListener("app_settings_updated", onChange);
    return () => {
      window.removeEventListener("storage", onChange);
      window.removeEventListener("app_settings_updated", onChange);
    };
  }, []);

  return settings;
}

export function resetAppSettings() {
  localStorage.removeItem(KEY);
  const s = getAppSettings();
  applyTheme(s);
  window.dispatchEvent(new Event("app_settings_updated"));
  return s;
}
