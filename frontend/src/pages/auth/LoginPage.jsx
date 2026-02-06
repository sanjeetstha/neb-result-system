import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Eye, EyeOff, Sparkles, ShieldCheck } from "lucide-react";

import { api } from "../../lib/api";
import { setToken } from "../../lib/auth";
import { useAppSettings } from "../../lib/appSettings";

import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";

export default function LoginPage() {
  const nav = useNavigate();
  const settings = useAppSettings();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetLoading, setResetLoading] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await api.post("/api/auth/login", { email, password });
      const token = res?.data?.token || res?.data?.access_token || res?.data?.jwt;
      if (!token) throw new Error("Token not found in login response");
      setToken(token);
      toast.success("Login successful");
      nav("/", { replace: true });
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  async function onReset(e) {
    e.preventDefault();
    const payloadEmail = resetEmail || email;
    if (!payloadEmail) {
      toast.error("Enter your email to reset password");
      return;
    }
    setResetLoading(true);
    try {
      await api.post("/api/auth/forgot-password", { email: payloadEmail });
      toast.success("If your account exists, reset instructions were sent.");
      setResetOpen(false);
      setResetEmail("");
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message || "Request failed");
    } finally {
      setResetLoading(false);
    }
  }

  return (
    <div className="min-h-screen relative overflow-hidden bg-gradient-to-br from-[#f9f5eb] via-white to-[#fdf2ea] text-foreground">
      <div className="absolute -top-24 -left-16 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
      <div className="absolute -bottom-24 right-0 h-72 w-72 rounded-full bg-accent/15 blur-3xl" />

      <div className="relative min-h-screen grid grid-cols-1 lg:grid-cols-2">
        <div className="hidden lg:flex flex-col justify-between p-12">
          <div>
            <div className="flex items-center gap-3">
              {settings.logo_small_data_url || settings.logo_data_url ? (
                <img
                  src={settings.logo_small_data_url || settings.logo_data_url}
                  alt="Logo"
                  className="h-12 w-12 rounded-xl object-cover border"
                />
              ) : (
                <div className="h-12 w-12 rounded-xl bg-primary/10 border flex items-center justify-center font-display text-lg">
                  {String(settings.brand_name || "NEB")
                    .split(/\s+/)
                    .slice(0, 2)
                    .map((p) => p[0])
                    .join("")}
                </div>
              )}
              <div>
                <div className="text-lg font-semibold font-display">
                  {settings.brand_name}
                </div>
                <div className="text-sm text-muted-foreground">{settings.tagline}</div>
              </div>
            </div>

            <div className="mt-10 space-y-4">
              <div className="text-3xl font-semibold font-display leading-tight">
                Simple, calm, and ready for results.
              </div>
              <p className="text-muted-foreground">
                Manage NEB +2 exams, enter marks faster, and publish results for
                students and guardians with confidence.
              </p>
            </div>
          </div>

          <div className="space-y-3 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Bulk grid entry + Excel import
            </div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Terminal-wise exam setup + corrections
            </div>
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Public result portal + SMS delivery
            </div>
          </div>
        </div>

        <div className="flex items-center justify-center p-6">
          <Card className="w-full max-w-md bg-white/95 text-foreground shadow-2xl border border-white/60">
            <CardHeader>
              <CardTitle className="text-xl font-display">Sign in</CardTitle>
              <p className="text-sm text-muted-foreground">
                Enter your credentials to access the dashboard.
              </p>
            </CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={onSubmit}>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Email</label>
                  <Input
                    type="email"
                    placeholder="name@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Password</label>
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

                <div className="flex items-center justify-between text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      setResetEmail(email);
                      setResetOpen(true);
                    }}
                    className="text-primary hover:underline"
                  >
                    Forgot password?
                  </button>
                  <span className="text-muted-foreground">Need access? Ask admin.</span>
                </div>

                <Button className="w-full" type="submit" disabled={loading}>
                  {loading ? "Logging in..." : "Login"}
                </Button>
              </form>

              <div className="mt-5 rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
                Tip: Use App Settings after login to customize brand colors and
                announcement bar styles.
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset your password</DialogTitle>
            <DialogDescription>
              Enter the email linked with your account. We will send reset instructions.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onReset} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Email</label>
              <Input
                type="email"
                placeholder="name@example.com"
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setResetOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={resetLoading}>
                {resetLoading ? "Sending..." : "Send reset link"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
