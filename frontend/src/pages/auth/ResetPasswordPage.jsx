import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Eye, EyeOff } from "lucide-react";

import { api } from "../../lib/api";
import { useAppSettings } from "../../lib/appSettings";

import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Button } from "../../components/ui/button";

export default function ResetPasswordPage() {
  const nav = useNavigate();
  const settings = useAppSettings();
  const [params] = useSearchParams();
  const token = params.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    if (!token) {
      toast.error("Reset token missing");
      return;
    }
    if (!password || password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords do not match");
      return;
    }

    setLoading(true);
    try {
      await api.post("/api/auth/reset-password", { token, password });
      toast.success("Password updated. Please login.");
      nav("/login", { replace: true });
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message || "Reset failed");
    } finally {
      setLoading(false);
    }
  }

  const tokenMissing = !token;

  return (
    <div className="min-h-screen relative overflow-hidden bg-gradient-to-br from-[#f9f5eb] via-white to-[#fdf2ea] text-foreground">
      <div className="absolute -top-24 -left-16 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
      <div className="absolute -bottom-24 right-0 h-72 w-72 rounded-full bg-accent/15 blur-3xl" />

      <div className="relative min-h-screen flex items-center justify-center p-6">
        <Card className="w-full max-w-md bg-white/95 text-foreground shadow-2xl border border-white/60">
          <CardHeader>
            <div className="flex items-center gap-3">
              {settings.logo_small_data_url || settings.logo_data_url ? (
                <img
                  src={settings.logo_small_data_url || settings.logo_data_url}
                  alt="Logo"
                  className="h-10 w-10 rounded-xl object-cover border"
                />
              ) : (
                <div className="h-10 w-10 rounded-xl bg-primary/10 border flex items-center justify-center font-display text-base">
                  {String(settings.brand_name || "NEB")
                    .split(/\s+/)
                    .slice(0, 2)
                    .map((p) => p[0])
                    .join("")}
                </div>
              )}
              <div>
                <div className="text-sm font-semibold font-display">{settings.brand_name}</div>
                <div className="text-xs text-muted-foreground">Reset Password</div>
              </div>
            </div>
            <CardTitle className="text-xl font-display mt-3">Create a new password</CardTitle>
            <p className="text-sm text-muted-foreground">
              Choose a strong password for your account.
            </p>
            {tokenMissing ? (
              <p className="text-xs text-destructive mt-2">
                Reset token is missing. Please use the link from your email.
              </p>
            ) : null}
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={onSubmit}>
              <div className="space-y-2">
                <label className="text-sm font-medium">New Password</label>
                <div className="relative">
                  <Input
                    placeholder="••••••••"
                    type={showPw ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label="Toggle password visibility"
                  >
                    {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Confirm Password</label>
                <Input
                  placeholder="••••••••"
                  type={showPw ? "text" : "password"}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </div>

              <Button className="w-full" type="submit" disabled={loading || tokenMissing}>
                {loading ? "Updating..." : "Update Password"}
              </Button>
              <Button
                className="w-full"
                type="button"
                variant="outline"
                onClick={() => nav("/login")}
              >
                Back to login
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
