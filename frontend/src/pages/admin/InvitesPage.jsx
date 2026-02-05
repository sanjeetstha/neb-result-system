import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

import { api } from "../../lib/api";
import { useMe } from "../../lib/useMe";

import { Card, CardContent } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Badge } from "../../components/ui/badge";
import { Separator } from "../../components/ui/separator";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../../components/ui/dialog";

function isValidEmail(email) {
  const s = String(email || "").trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export default function InvitesPage() {
  const { data: me, isLoading: meLoading } = useMe();

  const [email, setEmail] = useState("");
  const [role, setRole] = useState("TEACHER");
  const [expiresInHours, setExpiresInHours] = useState("72");

  const [open, setOpen] = useState(false);
  const [result, setResult] = useState(null);
  const [recent, setRecent] = useState([]);

  const canAccess = useMemo(() => me?.role === "SUPER_ADMIN", [me]);

  const createInvite = useMutation({
    mutationFn: async (payload) => {
      const res = await api.post("/api/invites", payload);
      return res.data;
    },
    onSuccess: (data) => {
      const entry = {
        email: data?.email || email.trim(),
        role: data?.role || role,
        expires_in_hours: data?.expires_in_hours ?? Number(expiresInHours || 0),
        token: data?.token,
        invite_link: data?.invite_link,
        created_at: new Date().toISOString(),
      };

      setResult(entry);
      setOpen(true);
      setRecent((prev) => [entry, ...prev].slice(0, 10));

      toast.success("Invite created");
      setEmail("");
    },
    onError: (err) => {
      const msg =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        "Failed to create invite";
      toast.error(msg);
    },
  });

  const onSubmit = (e) => {
    e?.preventDefault?.();

    const em = email.trim();
    const hrs = Number(String(expiresInHours || "").trim());

    if (!isValidEmail(em)) return toast.error("Enter a valid email");
    if (!role) return toast.error("Select a role");
    if (!Number.isFinite(hrs) || hrs <= 0) return toast.error("Expiry hours must be > 0");

    createInvite.mutate({ email: em, role, expires_in_hours: hrs });
  };

  if (meLoading) {
    return (
      <div className="p-4">
        <div className="text-sm text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!canAccess) {
    return (
      <div className="p-4">
        <Card className="max-w-2xl">
          <CardContent className="p-4">
            <div className="text-lg font-semibold">Access denied</div>
            <div className="text-sm text-muted-foreground mt-1">
              Only <span className="font-medium">SUPER_ADMIN</span> can create user invites.
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div>
        <div className="text-xl font-semibold">User Invites</div>
        <div className="text-sm text-muted-foreground">
          Create invite links for ADMIN / TEACHER / STUDENT accounts.
        </div>
      </div>

      <Card className="max-w-3xl">
        <CardContent className="p-4">
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="md:col-span-2 space-y-1">
                <div className="text-sm font-medium">Email</div>
                <Input
                  placeholder="user@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="off"
                />
              </div>

              <div className="space-y-1">
                <div className="text-sm font-medium">Role</div>
                <select
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                >
                  <option value="ADMIN">ADMIN</option>
                  <option value="TEACHER">TEACHER</option>
                  <option value="STUDENT">STUDENT</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
              <div className="space-y-1">
                <div className="text-sm font-medium">Expires in (hours)</div>
                <Input
                  type="number"
                  min="1"
                  step="1"
                  value={expiresInHours}
                  onChange={(e) => setExpiresInHours(e.target.value)}
                />
                <div className="text-xs text-muted-foreground">
                  Example: 24 (1 day), 72 (3 days), 168 (7 days)
                </div>
              </div>

              <div className="md:col-span-2 flex gap-2 md:justify-end">
                <Button type="submit" disabled={createInvite.isPending} className="min-w-[160px]">
                  {createInvite.isPending ? "Creating..." : "Create Invite"}
                </Button>
              </div>
            </div>
          </form>

          <Separator className="my-4" />

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">Recently generated (local)</div>
              <Badge variant="secondary">{recent.length}</Badge>
            </div>

            {recent.length === 0 ? (
              <div className="text-sm text-muted-foreground">No invites generated in this session yet.</div>
            ) : (
              <div className="space-y-2">
                {recent.map((r, idx) => (
                  <div
                    key={idx}
                    className="rounded-lg border p-3 flex flex-col md:flex-row md:items-center gap-2 md:gap-3"
                  >
                    <div className="flex-1">
                      <div className="text-sm font-medium">{r.email}</div>
                      <div className="text-xs text-muted-foreground">
                        Role: <span className="font-medium">{r.role}</span> • Expires:{" "}
                        <span className="font-medium">{r.expires_in_hours}h</span>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={async () => {
                          if (!r.invite_link) return toast.error("No invite link to copy");
                          const ok = await copyToClipboard(r.invite_link);
                          ok ? toast.success("Invite link copied") : toast.error("Copy failed");
                        }}
                      >
                        Copy Link
                      </Button>

                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setResult(r);
                          setOpen(true);
                        }}
                      >
                        View
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Invite created</DialogTitle>
            <DialogDescription>
              Copy the invite link and send it to the user. The token is shown for debugging.
            </DialogDescription>
          </DialogHeader>

          {!result ? (
            <div className="text-sm text-muted-foreground">No result</div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">{result.email}</Badge>
                <Badge>{result.role}</Badge>
                <Badge variant="outline">Expires: {result.expires_in_hours}h</Badge>
              </div>

              <div className="space-y-1">
                <div className="text-sm font-medium">Invite link</div>
                <div className="flex gap-2">
                  <Input readOnly value={result.invite_link || ""} />
                  <Button
                    type="button"
                    onClick={async () => {
                      if (!result.invite_link) return toast.error("No invite link");
                      const ok = await copyToClipboard(result.invite_link);
                      ok ? toast.success("Invite link copied") : toast.error("Copy failed");
                    }}
                  >
                    Copy
                  </Button>
                </div>
              </div>

              <div className="space-y-1">
                <div className="text-sm font-medium">Token</div>
                <div className="flex gap-2">
                  <Input readOnly value={result.token || ""} />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={async () => {
                      if (!result.token) return toast.error("No token");
                      const ok = await copyToClipboard(result.token);
                      ok ? toast.success("Token copied") : toast.error("Copy failed");
                    }}
                  >
                    Copy
                  </Button>
                </div>
                <div className="text-xs text-muted-foreground">
                  Tip: Normally you only share the invite link with the user.
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
