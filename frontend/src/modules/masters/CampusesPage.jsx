import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { api } from "../../lib/api";
import { usePagination } from "../../lib/usePagination";

import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../../components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import { Badge } from "../../components/ui/badge";
import PaginationBar from "../../components/ui/pagination-bar";

function norm(v) {
  return String(v ?? "").trim();
}

function normalizeCampusPayload(form) {
  const code = norm(form.code);
  const name = norm(form.name);
  if (!code || !name) return { error: "Campus code and name are required" };

  return {
    payload: {
      code,
      name,
      address: norm(form.address) || null,
      phone: norm(form.phone) || null,
      email: norm(form.email) || null,
    },
  };
}

export default function CampusesPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const [form, setForm] = useState({
    code: "",
    name: "",
    address: "",
    phone: "",
    email: "",
  });

  const campusesQuery = useQuery({
    queryKey: ["masters", "campuses"],
    queryFn: async () => {
      const res = await api.get("/api/masters/campuses");
      const data = res.data?.campuses ?? res.data?.data ?? res.data;
      return Array.isArray(data) ? data : [];
    },
    staleTime: 30_000,
  });

  const createCampus = useMutation({
    mutationFn: async () => {
      const { payload, error } = normalizeCampusPayload(form);
      if (error) throw new Error(error);
      const res = await api.post("/api/masters/campuses", payload);
      return res.data;
    },
    onSuccess: async () => {
      toast.success("Campus created");
      setForm({ code: "", name: "", address: "", phone: "", email: "" });
      setOpen(false);
      await qc.invalidateQueries({ queryKey: ["masters", "campuses"] });
    },
    onError: (err) => {
      toast.error(err?.response?.data?.message || err.message || "Failed to create campus");
    },
  });

  const updateCampus = useMutation({
    mutationFn: async () => {
      const { payload, error } = normalizeCampusPayload(form);
      if (error) throw new Error(error);
      const res = await api.put(`/api/masters/campuses/${editingId}`, payload);
      return res.data;
    },
    onSuccess: async () => {
      toast.success("Campus updated");
      setEditOpen(false);
      setEditingId(null);
      setForm({ code: "", name: "", address: "", phone: "", email: "" });
      await qc.invalidateQueries({ queryKey: ["masters", "campuses"] });
    },
    onError: (err) => {
      toast.error(err?.response?.data?.message || err.message || "Failed to update campus");
    },
  });

  const rows = useMemo(() => {
    const arr = campusesQuery.data || [];
    return arr.map((x) => ({
      id: x.id ?? "",
      code: x.code ?? "",
      name: x.name ?? "",
      address: x.address ?? "",
      email: x.email ?? "",
      phone: x.phone ?? "",
      is_active: Number(x.is_active ?? 1) === 1,
      raw: x,
    }));
  }, [campusesQuery.data]);

  const pager = usePagination(rows, 10);

  const openEdit = (r) => {
    setEditingId(r.id);
    setForm({
      code: r.code || "",
      name: r.name || "",
      address: r.address || "",
      phone: r.phone || "",
      email: r.email || "",
    });
    setEditOpen(true);
  };

  const renderForm = (onSave, savingLabel) => (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <label className="text-sm font-medium">Code</label>
          <Input
            placeholder="e.g., GMC"
            value={form.code}
            onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Campus name</label>
          <Input
            placeholder="e.g., Gaurishankar Multiple Campus"
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <label className="text-sm font-medium">Address</label>
          <Input
            placeholder="Location"
            value={form.address}
            onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Phone</label>
          <Input
            placeholder="01-xxxxxx"
            value={form.phone}
            onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Email</label>
          <Input
            placeholder="campus@example.com"
            value={form.email}
            onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
          />
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => { setOpen(false); setEditOpen(false); }}>
          Cancel
        </Button>
        <Button onClick={onSave} disabled={createCampus.isPending || updateCampus.isPending}>
          {createCampus.isPending || updateCampus.isPending ? "Saving..." : savingLabel}
        </Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Campuses</h2>
          <p className="text-sm text-muted-foreground">
            Manage campuses used in NEB result masters.
          </p>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>Add Campus</Button>
          </DialogTrigger>

          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add new campus</DialogTitle>
            </DialogHeader>
            {renderForm(() => createCampus.mutate(), "Save")}
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-lg border">
        <div className="flex items-center justify-between p-3 border-b">
          <div className="text-sm font-medium">Campus List</div>
          <div className="text-xs text-muted-foreground">
            {campusesQuery.isLoading ? "Loading..." : `Total: ${rows.length}`}
          </div>
        </div>

        <div className="p-3">
          {campusesQuery.isError ? (
            <div className="text-sm text-destructive">
              Failed to load campuses:{" "}
              {campusesQuery.error?.response?.data?.message ||
                campusesQuery.error?.message ||
                "Unknown error"}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[70px]">ID</TableHead>
                  <TableHead className="w-[90px]">Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="hidden lg:table-cell">Address</TableHead>
                  <TableHead className="hidden md:table-cell">Email</TableHead>
                  <TableHead className="w-[110px]">Status</TableHead>
                  <TableHead className="w-[120px]">Actions</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {pager.pageItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-sm text-muted-foreground">
                      {campusesQuery.isLoading ? "Loading..." : "No campuses found."}
                    </TableCell>
                  </TableRow>
                ) : (
                  pager.pageItems.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-xs">{r.id}</TableCell>
                      <TableCell className="font-mono text-xs">{r.code || "—"}</TableCell>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell className="hidden lg:table-cell">{r.address || "—"}</TableCell>
                      <TableCell className="hidden md:table-cell">{r.email || "—"}</TableCell>
                      <TableCell>
                        {r.is_active ? (
                          <Badge variant="secondary">Active</Badge>
                        ) : (
                          <Badge variant="destructive">Inactive</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button size="sm" variant="outline" onClick={() => openEdit(r)}>
                          Edit
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
            <DialogTitle>Edit campus</DialogTitle>
          </DialogHeader>
          {renderForm(() => updateCampus.mutate(), "Update")}
        </DialogContent>
      </Dialog>
    </div>
  );
}
