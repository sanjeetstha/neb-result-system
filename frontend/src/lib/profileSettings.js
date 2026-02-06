import { useEffect, useState } from "react";

const KEY_PREFIX = "profile_settings";

function getKey(user) {
  const id = user?.id || user?.uid || "";
  const email = user?.email || "";
  const base = id ? String(id) : email ? String(email) : "guest";
  return `${KEY_PREFIX}:${base}`;
}

function safeParse(json) {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function getProfileSettings(user) {
  const raw = safeParse(localStorage.getItem(getKey(user)));
  return {
    avatar_data_url: "",
    ...(raw || {}),
  };
}

export function saveProfileSettings(user, patch) {
  const next = { ...getProfileSettings(user), ...(patch || {}) };
  localStorage.setItem(getKey(user), JSON.stringify(next));
  window.dispatchEvent(new Event("profile_settings_updated"));
  return next;
}

export function clearProfileSettings(user) {
  localStorage.removeItem(getKey(user));
  window.dispatchEvent(new Event("profile_settings_updated"));
}

export function useProfileSettings(user) {
  const [settings, setSettings] = useState(() => getProfileSettings(user));

  useEffect(() => {
    const onChange = () => setSettings(getProfileSettings(user));
    window.addEventListener("storage", onChange);
    window.addEventListener("profile_settings_updated", onChange);
    return () => {
      window.removeEventListener("storage", onChange);
      window.removeEventListener("profile_settings_updated", onChange);
    };
  }, [user?.id, user?.email]);

  return settings;
}
