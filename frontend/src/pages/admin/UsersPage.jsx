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

function norm(v) {
  return String(v ?? "").trim();
}

export default function UsersPage() {
  const { data: me, isLoading: meLoading } = useMe();
  const qc = useQueryClient();

  const [editOpen, setEditOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ full_name: "", email: "" });

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

  const rows = useMemo(() => {
    const arr = usersQ.data || [];
    return arr.map((u) => ({
      id: u.id ?? u.user_id ?? "",
      full_name: u.full_name ?? u.name ?? "",
      email: u.email ?? "",
      role: u.role ?? u.role_name ?? "",
      is_active: Number(u.is_active ?? 1) === 1,
      created_at: u.created_at ?? null,
      last_login_at: u.last_login_at ?? null,
      raw: u,
    }));
  }, [usersQ.data]);

  const pager = usePagination(rows, 10);

  const openEdit = (u) => {
    setEditingId(u.id);
    setEditForm({ full_name: u.full_name || "", email: u.email || "" });
    setEditOpen(true);
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
                  <TableHead className="w-[120px]">Role</TableHead>
                  <TableHead className="w-[120px]">Status</TableHead>
                  <TableHead className="w-[180px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pager.pageItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                      {usersQ.isLoading ? "Loading..." : "No users found."}
                    </TableCell>
                  </TableRow>
                ) : (
                  pager.pageItems.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="font-mono text-xs">{u.id}</TableCell>
                      <TableCell className="font-medium">{u.full_name}</TableCell>
                      <TableCell className="text-xs">{u.email}</TableCell>
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
                      <TableCell className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openEdit(u)}
                        >
                          Edit
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
    </div>
  );
}
