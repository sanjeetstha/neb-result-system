// import axios from "axios";

// const baseURL = import.meta.env.VITE_API_BASE_URL;

// export const api = axios.create({
//   baseURL,
// });

// api.interceptors.request.use((config) => {
//   const token = localStorage.getItem("token");
//   if (token) config.headers.Authorization = `Bearer ${token}`;
//   return config;
// });


import axios from "axios";
import { getToken, clearToken } from "./auth";

const baseURL = import.meta.env.VITE_API_BASE_URL;

export const api = axios.create({ baseURL });

api.interceptors.request.use((config) => {
  const token = getToken(); // ✅ same key as auth.js
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Optional but good: logout only on 401/403
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const status = err?.response?.status;
    if (status === 401 || status === 403) {
      clearToken();
      if (!window.location.pathname.startsWith("/login")) {
        window.location.href = "/login";
      }
    }
    return Promise.reject(err);
  }
);
