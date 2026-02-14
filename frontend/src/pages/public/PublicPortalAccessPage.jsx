import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import { Clock3, KeyRound, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { publicApi } from "../../lib/publicApi";
import { hasPublicSession, setPublicToken } from "../../lib/publicAuth";
import { isAuthed } from "../../lib/auth";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Badge } from "../../components/ui/badge";

function norm(v) {
  return String(v || "").trim();
}

export default function PublicPortalAccessPage() {
  const nav = useNavigate();
  const location = useLocation();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [requestId, setRequestId] = useState("");
  const [otp, setOtp] = useState("");
  const [contactHint, setContactHint] = useState("");
  const [expiresIn, setExpiresIn] = useState(0);

  const canOpenDirect = isAuthed() || hasPublicSession();
  const fromPath = location.state?.from || "/public/portal";

  const requestOtpMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        full_name: norm(fullName),
        email: norm(email),
        mobile: norm(mobile),
      };
      const res = await publicApi.post("/api/public/auth/request-otp", payload);
      return res.data;
    },
    onSuccess: (data) => {
      setRequestId(String(data.request_id || ""));
      setContactHint(String(data.contact_hint || ""));
      setExpiresIn(Number(data.expires_in_seconds || 0));
      toast.success(data?.message || "OTP sent");
      if (data?.debug_otp) {
        toast.info(`Dev OTP: ${data.debug_otp}`);
      }
    },
    onError: (err) => {
      toast.error(err?.response?.data?.message || err?.message || "Failed to request OTP");
    },
  });

  const verifyOtpMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        request_id: Number(requestId),
        otp: norm(otp),
      };
      const res = await publicApi.post("/api/public/auth/verify-otp", payload);
      return res.data;
    },
    onSuccess: (data) => {
      const token = data?.token;
      if (!token) {
        toast.error("Session token missing in response");
        return;
      }
      setPublicToken(token);
      toast.success("Public portal access granted");
      nav(fromPath, { replace: true });
    },
    onError: (err) => {
      toast.error(err?.response?.data?.message || err?.message || "OTP verification failed");
    },
  });

  const remainingLabel = useMemo(() => {
    if (!expiresIn) return "";
    const min = Math.max(1, Math.ceil(expiresIn / 60));
    return `${min} minute(s)`;
  }, [expiresIn]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 space-y-6">
      <div className="space-y-2">
        <Badge variant="secondary">General Public Portal</Badge>
        <h1 className="text-2xl font-semibold">Access Published Results</h1>
        <p className="text-sm text-muted-foreground">
          No account required. Enter your details, verify OTP, then access published
          result pages for a limited session.
        </p>
      </div>

      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium">Full Name</label>
              <Input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Enter your name"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Email (recommended)</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Mobile (optional)</label>
              <Input
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                placeholder="98XXXXXXXX"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-xs text-muted-foreground">
            <div className="inline-flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4" />
              Session access is limited to published public result pages only.
            </div>
            <div className="inline-flex items-center gap-1.5">
              <Clock3 className="h-4 w-4" />
              Session duration: {remainingLabel || "about 20 minutes"}
            </div>
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            {canOpenDirect ? (
              <Button variant="outline" onClick={() => nav("/public/portal")}>
                Open Portal
              </Button>
            ) : null}
            <Button
              onClick={() => requestOtpMutation.mutate()}
              disabled={!norm(fullName) || (!norm(email) && !norm(mobile)) || requestOtpMutation.isPending}
            >
              {requestOtpMutation.isPending ? "Sending OTP..." : "Send OTP"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {requestId ? (
        <Card>
          <CardContent className="p-5 space-y-4">
            <div className="space-y-1">
              <div className="text-sm font-medium">Verify OTP</div>
              <div className="text-xs text-muted-foreground">
                OTP sent to {contactHint || "your contact"}. Enter OTP to start session.
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-[200px_1fr]">
              <div className="space-y-2">
                <label className="text-sm font-medium">Request ID</label>
                <Input value={requestId} onChange={(e) => setRequestId(e.target.value)} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">OTP Code</label>
                <Input
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  placeholder="6-digit OTP"
                  maxLength={6}
                />
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => requestOtpMutation.mutate()}
                disabled={requestOtpMutation.isPending}
              >
                Resend OTP
              </Button>
              <Button
                onClick={() => verifyOtpMutation.mutate()}
                disabled={!norm(requestId) || norm(otp).length < 4 || verifyOtpMutation.isPending}
                className="inline-flex items-center gap-1.5"
              >
                <KeyRound className="h-4 w-4" />
                {verifyOtpMutation.isPending ? "Verifying..." : "Verify & Access"}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
