import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CheckCircle2,
  KeyRound,
  Save,
  Search,
  ShieldCheck,
  ShieldOff,
  UsersRound,
} from "lucide-react";

import { api } from "../../lib/api";
import { useMe } from "../../lib/useMe";
import { hasPermission } from "../../lib/access";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Badge } from "../../components/ui/badge";

function buildDraft(role) {
  const permissionMap = Object.fromEntries(
    (role?.permissions || []).map((item) => [item.key, !!item.allowed])
  );
  return {
    description: role?.description || "",
    permissions: permissionMap,
  };
}

function countAllowedPermissions(draft) {
  return Object.values(draft?.permissions || {}).filter(Boolean).length;
}

function groupPermissionsByName(items = []) {
  const grouped = new Map();
  for (const item of items) {
    if (!grouped.has(item.group)) grouped.set(item.group, []);
    grouped.get(item.group).push(item);
  }
  return Array.from(grouped.entries());
}

function MetricPill({ icon: Icon, label, value, tone = "default" }) {
  const toneClass =
    tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : tone === "danger"
        ? "border-rose-200 bg-rose-50 text-rose-700"
        : "border-border bg-background text-foreground";

  return (
    <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium ${toneClass}`}>
      <Icon className="h-3.5 w-3.5" />
      <span>{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

export default function RolesAccessPage() {
  const qc = useQueryClient();
  const { data: me, isLoading: meLoading } = useMe();
  const canAccess = hasPermission(me, "roles.manage");

  const accessQ = useQuery({
    queryKey: ["roles", "access"],
    enabled: canAccess,
    queryFn: async () => {
      const res = await api.get("/api/roles/access");
      return {
        roles: Array.isArray(res.data?.roles) ? res.data.roles : [],
        permissions: Array.isArray(res.data?.permissions) ? res.data.permissions : [],
      };
    },
    staleTime: 30_000,
  });

  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [draft, setDraft] = useState({ description: "", permissions: {} });
  const [permissionSearch, setPermissionSearch] = useState("");

  const roles = accessQ.data?.roles || [];
  const selectedRole = useMemo(
    () => roles.find((role) => String(role.id) === String(selectedRoleId)) || null,
    [roles, selectedRoleId]
  );

  const permissionGroups = useMemo(
    () => groupPermissionsByName(accessQ.data?.permissions || []),
    [accessQ.data?.permissions]
  );

  useEffect(() => {
    if (!selectedRoleId && roles.length) {
      setSelectedRoleId(String(roles[0].id));
    }
  }, [roles, selectedRoleId]);

  useEffect(() => {
    if (!selectedRole) return;
    setDraft(buildDraft(selectedRole));
  }, [selectedRole?.id, selectedRole?.description, selectedRole?.permissions]);

  const dirty = useMemo(() => {
    if (!selectedRole) return false;
    const source = buildDraft(selectedRole);
    return JSON.stringify(source) !== JSON.stringify(draft);
  }, [selectedRole, draft]);

  const allowedCount = countAllowedPermissions(draft);
  const blockedCount = Math.max(0, (accessQ.data?.permissions || []).length - allowedCount);

  const filteredGroups = useMemo(() => {
    const search = permissionSearch.trim().toLowerCase();
    if (!search) return permissionGroups;

    return permissionGroups
      .map(([groupName, permissions]) => {
        const next = permissions.filter((permission) => {
          const haystack = `${permission.group} ${permission.label} ${permission.key} ${permission.description}`.toLowerCase();
          return haystack.includes(search);
        });
        return next.length ? [groupName, next] : null;
      })
      .filter(Boolean);
  }, [permissionGroups, permissionSearch]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedRole) throw new Error("Select a role first");
      const payload = {
        description: draft.description,
        permissions: Object.entries(draft.permissions).map(([key, allowed]) => ({ key, allowed })),
      };
      const res = await api.put(`/api/roles/${selectedRole.id}/access`, payload);
      return res.data;
    },
    onSuccess: async () => {
      toast.success("Role access updated");
      await qc.invalidateQueries({ queryKey: ["roles", "access"] });
      await qc.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (err) => {
      toast.error(err?.response?.data?.message || err?.message || "Failed to save role access");
    },
  });

  const setPermissionValue = (permissionKey, nextValue) => {
    setDraft((prev) => ({
      ...prev,
      permissions: {
        ...prev.permissions,
        [permissionKey]: !!nextValue,
      },
    }));
  };

  const applyGroupState = (permissions, nextValue) => {
    setDraft((prev) => {
      const next = { ...prev.permissions };
      for (const permission of permissions) {
        next[permission.key] = !!nextValue;
      }
      return { ...prev, permissions: next };
    });
  };

  if (meLoading) {
    return <div className="p-4 text-sm text-muted-foreground">Loading...</div>;
  }

  if (!canAccess) {
    return (
      <div className="p-4">
        <Card className="max-w-2xl">
          <CardContent className="p-4">
            <div className="text-lg font-semibold">Access denied</div>
            <div className="mt-1 text-sm text-muted-foreground">
              You do not have permission to manage role access.
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-3xl border bg-gradient-to-br from-primary/8 via-background to-accent/12 p-5 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
              <ShieldCheck className="h-3.5 w-3.5" />
              Role-based access control
            </div>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight">Roles & Access</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Keep this simple for your team: pick a role, adjust what it can open, and save. The same rules now control both the sidebar and backend API access.
            </p>
          </div>

          <div className="flex flex-wrap gap-2 xl:justify-end">
            <MetricPill icon={UsersRound} label="Roles" value={roles.length} />
            <MetricPill icon={KeyRound} label="Permissions" value={(accessQ.data?.permissions || []).length} />
            <MetricPill icon={CheckCircle2} label="Allowed" value={allowedCount} tone="success" />
            <MetricPill icon={ShieldOff} label="Blocked" value={blockedCount} tone="danger" />
          </div>
        </div>
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-[280px_1fr]">
        <Card className="xl:sticky xl:top-20">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Roles</CardTitle>
            <CardDescription>
              Choose the role you want to refine.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {roles.map((role) => {
              const active = String(role.id) === String(selectedRoleId);
              const roleAllowedCount = (role.permissions || []).filter((item) => item.allowed).length;
              return (
                <button
                  key={role.id}
                  type="button"
                  onClick={() => setSelectedRoleId(String(role.id))}
                  className={[
                    "w-full rounded-2xl border p-3 text-left transition-all",
                    active
                      ? "border-primary bg-primary/[0.07] shadow-sm ring-1 ring-primary/15"
                      : "hover:border-border hover:bg-muted/35",
                  ].join(" ")}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold tracking-tight">{role.name}</div>
                      <div className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                        {role.description || "No description yet."}
                      </div>
                    </div>
                    <Badge variant={active ? "default" : "secondary"} className="shrink-0">
                      {role.user_count}
                    </Badge>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>{roleAllowedCount} allowed</span>
                    <span>{Math.max(0, (role.permissions || []).length - roleAllowedCount)} blocked</span>
                  </div>
                </button>
              );
            })}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardContent className="p-4 md:p-5">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                <div className="min-w-0 flex-1 space-y-3">
                  <div>
                    <div className="text-sm font-medium text-muted-foreground">Editing Role</div>
                    <div className="mt-1 text-2xl font-semibold tracking-tight">
                      {selectedRole?.name || "Choose a role"}
                    </div>
                  </div>

                  <div className="grid gap-3 lg:grid-cols-[1.4fr_0.9fr]">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Role description</label>
                      <Input
                        value={draft.description}
                        onChange={(e) => setDraft((prev) => ({ ...prev, description: e.target.value }))}
                        placeholder="Describe what this role is responsible for"
                        disabled={!selectedRole}
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">Filter permissions</label>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          value={permissionSearch}
                          onChange={(e) => setPermissionSearch(e.target.value)}
                          placeholder="Search by module, label, or key"
                          className="pl-9"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col items-stretch gap-2 xl:min-w-[180px]">
                  <Button
                    onClick={() => saveMutation.mutate()}
                    disabled={!selectedRole || !dirty || saveMutation.isPending}
                    className="gap-2"
                  >
                    <Save className="h-4 w-4" />
                    {saveMutation.isPending ? "Saving..." : "Save Access"}
                  </Button>
                  <div className="text-center text-xs text-muted-foreground">
                    {dirty ? "You have unsaved permission changes." : "Everything is saved."}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {filteredGroups.map(([groupName, permissions]) => {
              const enabledInGroup = permissions.filter((permission) => !!draft.permissions[permission.key]).length;
              const allEnabled = enabledInGroup === permissions.length;
              return (
                <Card key={groupName} className="overflow-hidden border-border/80">
                  <CardHeader className="border-b bg-muted/20 pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <CardTitle className="text-base tracking-tight">{groupName}</CardTitle>
                        <CardDescription>
                          {enabledInGroup} of {permissions.length} permission{permissions.length === 1 ? "" : "s"} enabled
                        </CardDescription>
                      </div>
                      <Badge variant={allEnabled ? "default" : "secondary"}>{enabledInGroup}</Badge>
                    </div>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button type="button" size="sm" variant="outline" onClick={() => applyGroupState(permissions, true)}>
                        Allow All
                      </Button>
                      <Button type="button" size="sm" variant="ghost" onClick={() => applyGroupState(permissions, false)}>
                        Clear
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2 p-3">
                    {permissions.map((permission) => {
                      const checked = !!draft.permissions[permission.key];
                      return (
                        <label
                          key={permission.key}
                          className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-3 transition-colors ${checked ? "border-primary/25 bg-primary/[0.05]" : "hover:bg-muted/25"}`}
                        >
                          <input
                            type="checkbox"
                            className="mt-1 h-4 w-4"
                            checked={checked}
                            disabled={!selectedRole}
                            onChange={(e) => setPermissionValue(permission.key, e.target.checked)}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium leading-5">{permission.label}</span>
                              <Badge variant="outline" className="font-mono text-[10px]">
                                {permission.key}
                              </Badge>
                            </div>
                            <div className="mt-1 text-sm leading-5 text-muted-foreground">
                              {permission.description}
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {filteredGroups.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-sm text-muted-foreground">
                No permissions matched your search.
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
