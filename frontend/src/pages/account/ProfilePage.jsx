import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { useMe } from "../../lib/useMe";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import {
  saveProfileSettings,
  useProfileSettings,
  clearProfileSettings,
} from "../../lib/profileSettings";

import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Separator } from "../../components/ui/separator";

export default function ProfilePage() {
  const { data: me, isLoading } = useMe();
  const qc = useQueryClient();
  const profile = useProfileSettings(me);

  const [form, setForm] = useState({ full_name: "", email: "" });
  const [saving, setSaving] = useState(false);

  const [pwForm, setPwForm] = useState({
    current_password: "",
    new_password: "",
    confirm_password: "",
  });
  const [pwSaving, setPwSaving] = useState(false);

  useEffect(() => {
    if (!me) return;
    setForm({
      full_name: me.full_name || me.name || "",
      email: me.email || "",
    });
  }, [me]);

  const initials = useMemo(() => {
    const s = String(me?.full_name || me?.name || me?.email || "U").trim();
    const parts = s.split(/\s+/).filter(Boolean);
    const a = parts[0]?.[0] || "U";
    const b = parts.length > 1 ? parts[parts.length - 1][0] : "";
    return (a + b).toUpperCase();
  }, [me]);

  const onSaveProfile = async () => {
    if (!form.full_name || !form.email) {
      toast.error("Full name and email are required");
      return;
    }
    setSaving(true);
    try {
      const res = await api.put("/api/me/profile", form);
      const msg = res?.data?.message || "Profile updated";
      toast.success(msg);
      qc.invalidateQueries({ queryKey: ["me"] });
    } catch (e) {
      toast.error(e?.response?.data?.message || e.message || "Update failed");
    } finally {
      setSaving(false);
    }
  };

  const onChangePassword = async () => {
    if (!pwForm.current_password || !pwForm.new_password) {
      toast.error("Current and new password are required");
      return;
    }
    if (pwForm.new_password.length < 6) {
      toast.error("New password must be at least 6 characters");
      return;
    }
    if (pwForm.new_password !== pwForm.confirm_password) {
      toast.error("Passwords do not match");
      return;
    }

    setPwSaving(true);
    try {
      const res = await api.post("/api/me/password", {
        current_password: pwForm.current_password,
        new_password: pwForm.new_password,
      });
      toast.success(res?.data?.message || "Password updated");
      setPwForm({ current_password: "", new_password: "", confirm_password: "" });
    } catch (e) {
      toast.error(e?.response?.data?.message || e.message || "Password update failed");
    } finally {
      setPwSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold font-display">Profile Settings</h2>
        <p className="text-sm text-muted-foreground">
          Update your account details, avatar, and security settings.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Account Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="h-14 w-14 rounded-full border bg-muted flex items-center justify-center overflow-hidden">
                {profile.avatar_data_url ? (
                  <img
                    src={profile.avatar_data_url}
                    alt="Avatar"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="text-sm font-semibold">{initials}</span>
                )}
              </div>
              <div>
                <div className="text-sm font-medium">
                  {me?.full_name || me?.name || "User"}
                </div>
                <div className="text-xs text-muted-foreground">{me?.role || "—"}</div>
              </div>
              {me?.role ? <Badge variant="outline">{me.role}</Badge> : null}
            </div>

            <Separator />

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Full Name</label>
                <Input
                  value={form.full_name}
                  onChange={(e) => setForm((p) => ({ ...p, full_name: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Email</label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button onClick={onSaveProfile} disabled={saving || isLoading}>
                {saving ? "Saving..." : "Save Profile"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Profile Photo</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = () => {
                    saveProfileSettings(me, { avatar_data_url: String(reader.result || "") });
                  };
                  reader.readAsDataURL(file);
                }}
              />
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => clearProfileSettings(me)}
                  disabled={!profile.avatar_data_url}
                >
                  Remove Photo
                </Button>
                <span className="text-xs text-muted-foreground">
                  Recommended square image, 256x256
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Security</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <label className="text-sm font-medium">Current Password</label>
                <Input
                  type="password"
                  value={pwForm.current_password}
                  onChange={(e) =>
                    setPwForm((p) => ({ ...p, current_password: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">New Password</label>
                <Input
                  type="password"
                  value={pwForm.new_password}
                  onChange={(e) =>
                    setPwForm((p) => ({ ...p, new_password: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Confirm Password</label>
                <Input
                  type="password"
                  value={pwForm.confirm_password}
                  onChange={(e) =>
                    setPwForm((p) => ({ ...p, confirm_password: e.target.value }))
                  }
                />
              </div>

              <div className="flex justify-end">
                <Button onClick={onChangePassword} disabled={pwSaving}>
                  {pwSaving ? "Updating..." : "Update Password"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
