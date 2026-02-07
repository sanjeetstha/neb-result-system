import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { api } from "../../lib/api";
import { useMe } from "../../lib/useMe";
import { usePagination } from "../../lib/usePagination";

import { Card, CardContent } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import PaginationBar from "../../components/ui/pagination-bar";
import { Trash2 } from "lucide-react";

function norm(v) {
  return String(v ?? "").trim();
}

export default function UsersPage() {
  const { data: me, isLoading: meLoading } = useMe();
  const qc = useQueryClient();

  const [editOpen, setEditOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({
    full_name: "",
    email: "",
    role: "",
    contact_number: "",
  });

  const [pwOpen, setPwOpen] = useState(false);
  const [pwTarget, setPwTarget] = useState(null);
  const [pwForm, setPwForm] = useState({
    password: "",
    notify_email: true,
    notify_sms: false,
  });
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deletePassword, setDeletePassword] = useState("");

  const canAccess = useMemo(() => me?.role === "SUPER_ADMIN", [me]);

  const usersQ = useQuery({
    queryKey: ["users", "list"],
    enabled: canAccess,
    queryFn: async () => {
      const res = await api.get("/api/users");
      const data = res.data?.users ?? res.data?.data ?? res.data ?? [];
      return Array.isArray(data) ? data : [];
    },
    staleTime: 20_000,
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, is_active }) => {
      const res = await api.put(`/api/users/${id}/status`, { is_active });
      return res.data;
    },
    onSuccess: async () => {
      toast.success("User status updated");
      await qc.invalidateQueries({ queryKey: ["users", "list"] });
    },
    onError: (err) => {
      toast.error(err?.response?.data?.message || err.message || "Failed to update status");
    },
  });

  const updateUser = useMutation({
    mutationFn: async () => {
      const payload = {
        full_name: norm(editForm.full_name),
        email: norm(editForm.email),
        role: norm(editForm.role),
        contact_number: norm(editForm.contact_number),
      };
      const res = await api.put(`/api/users/${editingId}`, payload);
      return res.data;
    },
    onSuccess: async () => {
      toast.success("User updated");
      setEditOpen(false);
      setEditingId(null);
      await qc.invalidateQueries({ queryKey: ["users", "list"] });
    },
    onError: (err) => {
      toast.error(err?.response?.data?.message || err.message || "Failed to update user");
    },
  });

  const changePassword = useMutation({
    mutationFn: async () => {
      const payload = {
        password: pwForm.password,
        notify_email: !!pwForm.notify_email,
        notify_sms: !!pwForm.notify_sms,
      };
      const res = await api.put(`/api/users/${pwTarget?.id}/password`, payload);
      return res.data;
    },
    onSuccess: (data) => {
      const warnings = data?.warnings || [];
      if (warnings.length) {
        toast.message(`Password updated with warnings: ${warnings.join(", ")}`);
      } else {
        toast.success("Password updated");
      }
      setPwOpen(false);
      setPwTarget(null);
      setPwForm({ password: "", notify_email: true, notify_sms: false });
    },
    onError: (err) => {
      toast.error(
        err?.response?.data?.message || err.message || "Failed to update password"
      );
    },
  });

  const deleteUser = useMutation({
    mutationFn: async () => {
      const res = await api.delete(`/api/users/${deleteTarget?.id}`, {
        data: { password: deletePassword },
      });
      return res.data;
    },
    onSuccess: async () => {
      toast.success("User deleted");
      setDeleteOpen(false);
      setDeleteTarget(null);
      setDeletePassword("");
      await qc.invalidateQueries({ queryKey: ["users", "list"] });
    },
    onError: (err) => {
      toast.error(err?.response?.data?.message || err.message || "Failed to delete user");
    },
  });

  const rows = useMemo(() => {
    const arr = usersQ.data || [];
    return arr.map((u) => ({
      id: u.id ?? u.user_id ?? "",
      full_name: u.full_name ?? u.name ?? "",
      email: u.email ?? "",
      role: u.role ?? u.role_name ?? "",
      contact_number: u.contact_number ?? u.phone ?? "",
      is_active: Number(u.is_active ?? 1) === 1,
      created_at: u.created_at ?? null,
      last_login_at: u.last_login_at ?? null,
      raw: u,
    }));
  }, [usersQ.data]);

  const pager = usePagination(rows, 10);

  const openEdit = (u) => {
    setEditingId(u.id);
    setEditForm({
      full_name: u.full_name || "",
      email: u.email || "",
      role: u.role || "TEACHER",
      contact_number: u.contact_number || "",
    });
    setEditOpen(true);
  };

  const openPassword = (u) => {
    setPwTarget(u);
    setPwForm({
      password: "",
      notify_email: true,
      notify_sms: !!u.contact_number,
    });
    setPwOpen(true);
  };

  const openDelete = (u) => {
    setDeleteTarget(u);
    setDeletePassword("");
    setDeleteOpen(true);
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
              Only <span className="font-medium">SUPER_ADMIN</span> can manage users.
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div>
        <div className="text-xl font-semibold">Manage Users</div>
        <div className="text-sm text-muted-foreground">
          Activate/deactivate user accounts and edit basic profile details.
        </div>
      </div>

      <div className="rounded-lg border">
        <div className="flex items-center justify-between p-3 border-b">
          <div className="text-sm font-medium">Users</div>
          <div className="text-xs text-muted-foreground">
            {usersQ.isLoading ? "Loading..." : `Total: ${rows.length}`}
          </div>
        </div>

        <div className="p-3">
          {usersQ.isError ? (
            <div className="text-sm text-destructive">
              Failed to load users:{" "}
              {usersQ.error?.response?.data?.message || usersQ.error?.message || "Unknown error"}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[80px]">ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead className="w-[140px]">Contact</TableHead>
                  <TableHead className="w-[120px]">Role</TableHead>
                  <TableHead className="w-[120px]">Status</TableHead>
                  <TableHead className="w-[300px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pager.pageItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-sm text-muted-foreground">
                      {usersQ.isLoading ? "Loading..." : "No users found."}
                    </TableCell>
                  </TableRow>
                ) : (
                  pager.pageItems.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="font-mono text-xs">{u.id}</TableCell>
                      <TableCell className="font-medium">{u.full_name}</TableCell>
                      <TableCell className="text-xs">{u.email}</TableCell>
                      <TableCell className="text-xs">
                        {u.contact_number || "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{u.role}</Badge>
                      </TableCell>
                      <TableCell>
                        {u.is_active ? (
                          <Badge variant="secondary">Active</Badge>
                        ) : (
                          <Badge variant="destructive">Inactive</Badge>
                        )}
                      </TableCell>
                      <TableCell className="flex gap-2 flex-nowrap items-center">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openEdit(u)}
                        >
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openPassword(u)}
                        >
                          Password
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          title={
                            u.id === me?.id
                              ? "You cannot delete your own account"
                              : "Delete user"
                          }
                          onClick={() => openDelete(u)}
                          disabled={u.id === me?.id}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                        <Button
                          size="sm"
                          variant={u.is_active ? "destructive" : "secondary"}
                          onClick={() =>
                            updateStatus.mutate({ id: u.id, is_active: u.is_active ? 0 : 1 })
                          }
                        >
                          {u.is_active ? "Disable" : "Activate"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </div>
        <PaginationBar
          page={pager.page}
          totalPages={pager.totalPages}
          onPageChange={pager.setPage}
          pageSize={pager.pageSize}
          onPageSizeChange={pager.setPageSize}
          totalItems={pager.totalItems}
        />
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit user</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <label className="text-sm font-medium">Full Name</label>
              <Input
                value={editForm.full_name}
                onChange={(e) => setEditForm((p) => ({ ...p, full_name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Email</label>
              <Input
                type="email"
                value={editForm.email}
                onChange={(e) => setEditForm((p) => ({ ...p, email: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Contact Number</label>
              <Input
                value={editForm.contact_number}
                onChange={(e) =>
                  setEditForm((p) => ({ ...p, contact_number: e.target.value }))
                }
                placeholder="98XXXXXXXX"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Role</label>
              <select
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={editForm.role}
                onChange={(e) => setEditForm((p) => ({ ...p, role: e.target.value }))}
              >
                <option value="SUPER_ADMIN">SUPER_ADMIN</option>
                <option value="ADMIN">ADMIN</option>
                <option value="TEACHER">TEACHER</option>
                <option value="STUDENT">STUDENT</option>
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => updateUser.mutate()} disabled={updateUser.isPending}>
                {updateUser.isPending ? "Saving..." : "Update"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={pwOpen} onOpenChange={setPwOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Password</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-xs text-muted-foreground">
              User: <span className="font-medium">{pwTarget?.full_name || "—"}</span>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">New Password</label>
              <Input
                type="password"
                value={pwForm.password}
                onChange={(e) => setPwForm((p) => ({ ...p, password: e.target.value }))}
                placeholder="••••••••"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Notifications</label>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={!!pwForm.notify_email}
                    onChange={(e) =>
                      setPwForm((p) => ({ ...p, notify_email: e.target.checked }))
                    }
                  />
                  Email
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={!!pwForm.notify_sms}
                    disabled={!pwTarget?.contact_number}
                    onChange={(e) =>
                      setPwForm((p) => ({ ...p, notify_sms: e.target.checked }))
                    }
                  />
                  SMS
                </label>
                {!pwTarget?.contact_number ? (
                  <span className="text-[11px] text-muted-foreground">
                    (no contact number)
                  </span>
                ) : null}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setPwOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => changePassword.mutate()} disabled={changePassword.isPending}>
                {changePassword.isPending ? "Saving..." : "Update Password"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete user</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">
              This will permanently delete{" "}
              <span className="font-medium">{deleteTarget?.full_name || "this user"}</span>.
              This action cannot be undone.
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Your Password</label>
              <Input
                type="password"
                placeholder="Enter your password to confirm"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setDeleteOpen(false);
                  setDeleteTarget(null);
                  setDeletePassword("");
                }}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => deleteUser.mutate()}
                disabled={!deletePassword || deleteUser.isPending}
              >
                {deleteUser.isPending ? "Deleting..." : "Delete"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
