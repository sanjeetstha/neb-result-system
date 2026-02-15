import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { api } from "../../lib/api";
import { useMe } from "../../lib/useMe";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
import { Input } from "../../components/ui/input";

function readErr(err, fallback) {
  return err?.response?.data?.message || err?.message || fallback;
}

export default function OtPolicyPage() {
  const qc = useQueryClient();
  const meQ = useMe();
  const role = String(meQ.data?.role || "").toUpperCase();
  const canManage = ["SUPER_ADMIN", "ADMIN"].includes(role);

  const policyQ = useQuery({
    queryKey: ["ot", "policy", "active"],
    queryFn: async () => {
      const res = await api.get("/api/ot/policy/active");
      return res.data?.policy || null;
    },
    staleTime: 20_000,
  });

  const [form, setForm] = useState({
    policy_name: "",
    hourly_rate: "250",
    weekend_multiplier: "1.5",
    holiday_multiplier: "2",
    rounding_minutes: "15",
    daily_cap_hours: "8",
    effective_from: new Date().toISOString().slice(0, 10),
  });

  useEffect(() => {
    const p = policyQ.data;
    if (!p) return;
    setForm({
      policy_name: p.policy_name || "Campus OT Policy",
      hourly_rate: String(p.hourly_rate ?? "250"),
      weekend_multiplier: String(p.weekend_multiplier ?? "1.5"),
      holiday_multiplier: String(p.holiday_multiplier ?? "2"),
      rounding_minutes: String(p.rounding_minutes ?? "15"),
      daily_cap_hours: String(p.daily_cap_hours ?? "8"),
      effective_from: String(p.effective_from || new Date().toISOString().slice(0, 10)).slice(
        0,
        10
      ),
    });
  }, [policyQ.data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await api.put("/api/ot/policy/active", {
        policy_name: form.policy_name,
        hourly_rate: Number(form.hourly_rate || 0),
        weekend_multiplier: Number(form.weekend_multiplier || 0),
        holiday_multiplier: Number(form.holiday_multiplier || 0),
        rounding_minutes: Number(form.rounding_minutes || 0),
        daily_cap_hours: Number(form.daily_cap_hours || 0),
        effective_from: form.effective_from,
      });
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ot", "policy"] });
      toast.success("OT policy updated");
    },
    onError: (err) => toast.error(readErr(err, "Failed to update OT policy")),
  });

  if (!canManage) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          Only admin roles can update OT policy.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">OT Policy</h2>
        <p className="text-sm text-muted-foreground">
          Define overtime calculation rules for this campus.
        </p>
      </div>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Policy Name</label>
              <Input
                value={form.policy_name}
                onChange={(e) => setForm((p) => ({ ...p, policy_name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Effective From</label>
              <Input
                type="date"
                value={form.effective_from}
                onChange={(e) => setForm((p) => ({ ...p, effective_from: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Hourly Rate (NPR)</label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.hourly_rate}
                onChange={(e) => setForm((p) => ({ ...p, hourly_rate: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Weekend Multiplier</label>
              <Input
                type="number"
                min="1"
                step="0.01"
                value={form.weekend_multiplier}
                onChange={(e) =>
                  setForm((p) => ({ ...p, weekend_multiplier: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Holiday Multiplier</label>
              <Input
                type="number"
                min="1"
                step="0.01"
                value={form.holiday_multiplier}
                onChange={(e) =>
                  setForm((p) => ({ ...p, holiday_multiplier: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Rounding Minutes</label>
              <Input
                type="number"
                min="1"
                step="1"
                value={form.rounding_minutes}
                onChange={(e) =>
                  setForm((p) => ({ ...p, rounding_minutes: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium">Daily OT Cap (Hours)</label>
              <Input
                type="number"
                min="0.5"
                step="0.25"
                value={form.daily_cap_hours}
                onChange={(e) =>
                  setForm((p) => ({ ...p, daily_cap_hours: e.target.value }))
                }
              />
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Saving..." : "Save Policy"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
