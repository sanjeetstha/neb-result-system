import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import { clearToken } from "./auth";

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const res = await api.get("/api/me");
      return res.data.user; // ✅ important
    },
    retry: false,
    staleTime: 60_000,
    gcTime: 10 * 60_000,
  });
}

export function logoutHard() {
  clearToken();
  window.location.href = "/login";
}
