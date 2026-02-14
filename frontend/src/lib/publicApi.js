import axios from "axios";
import { getToken } from "./auth";
import { clearPublicToken, getPublicToken } from "./publicAuth";

const envBaseURL = String(import.meta.env.VITE_API_BASE_URL || "").trim();
const baseURL = import.meta.env.DEV ? "" : envBaseURL;

export const publicApi = axios.create({ baseURL });

publicApi.interceptors.request.use((config) => {
  const staffToken = getToken();
  const publicToken = getPublicToken();

  if (staffToken) {
    config.headers.Authorization = `Bearer ${staffToken}`;
  } else if (publicToken) {
    config.headers.Authorization = `Bearer ${publicToken}`;
  }

  return config;
});

publicApi.interceptors.response.use(
  (res) => res,
  (err) => {
    const status = err?.response?.status;
    const url = String(err?.config?.url || "");
    if ((status === 401 || status === 403) && url.includes("/api/public")) {
      clearPublicToken();
      window.dispatchEvent(new CustomEvent("public-session-expired"));
    }
    return Promise.reject(err);
  }
);
