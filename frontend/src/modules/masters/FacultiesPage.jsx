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

function normalizePayload(form) {
  const code = norm(form.code);
  const name = norm(form.name);
  if (!code || !name) return { error: "Faculty code and name are required" };
  return { payload: { code, name } };
}

export default function FacultiesPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const [form, setForm] = useState({ code: "", name: "" });

  const q = useQuery({
    queryKey: ["masters", "faculties"],
    queryFn: async () => {
      const res = await api.get("/api/masters/faculties");
      const data = res.data?.faculties ?? res.data?.data ?? res.data;
      return Array.isArray(data) ? data : [];
    },
    staleTime: 30_000,
  });

  const create = useMutation({
    mutationFn: async () => {
      const { payload, error } = normalizePayload(form);
      if (error) throw new Error(error);
      const res = await api.post("/api/masters/faculties", payload);
      return res.data;
    },
    onSuccess: async () => {
      toast.success("Faculty created");
      setForm({ code: "", name: "" });
      setOpen(false);
      await qc.invalidateQueries({ queryKey: ["masters", "faculties"] });
    },
    onError: (err) => {
      toast.error(err?.response?.data?.message || err.message || "Failed to create faculty");
    },
  });

  const update = useMutation({
    mutationFn: async () => {
      const { payload, error } = normalizePayload(form);
      if (error) throw new Error(error);
      const res = await api.put(`/api/masters/faculties/${editingId}`, payload);
      return res.data;
    },
    onSuccess: async () => {
      toast.success("Faculty updated");
      setEditOpen(false);
      setEditingId(null);
      setForm({ code: "", name: "" });
      await qc.invalidateQueries({ queryKey: ["masters", "faculties"] });
    },
    onError: (err) => {
      toast.error(err?.response?.data?.message || err.message || "Failed to update faculty");
    },
  });

  const rows = useMemo(() => {
    const arr = q.data || [];
    return arr.map((x) => ({
      id: x.id ?? x.faculty_id ?? "",
      code: x.code ?? "",
      name: x.name ?? "",
      is_active: Number(x.is_active ?? 1) === 1,
      raw: x,
    }));
  }, [q.data]);

  const pager = usePagination(rows, 10);

  const openEdit = (r) => {
    setEditingId(r.id);
    setForm({ code: r.code || "", name: r.name || "" });
    setEditOpen(true);
  };

  const renderForm = (onSave, label) => (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <label className="text-sm font-medium">Faculty code</label>
          <Input
            placeholder="e.g., MGT"
            value={form.code}
            onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Faculty name</label>
          <Input
            placeholder="Management"
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
          />
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => { setOpen(false); setEditOpen(false); }}>
          Cancel
        </Button>
        <Button onClick={onSave} disabled={create.isPending || update.isPending}>
          {create.isPending || update.isPending ? "Saving..." : label}
        </Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">Faculties</h3>
          <p className="text-sm text-muted-foreground">
            Define faculty list (Science, Management, Humanities, etc.).
          </p>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>Add Faculty</Button>
          </DialogTrigger>

          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add faculty</DialogTitle>
            </DialogHeader>
            {renderForm(() => create.mutate(), "Save")}
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-lg border">
        <div className="flex items-center justify-between p-3 border-b">
          <div className="text-sm font-medium">Faculty List</div>
          <div className="text-xs text-muted-foreground">
            {q.isLoading ? "Loading..." : `Total: ${rows.length}`}
          </div>
        </div>

        <div className="p-3">
          {q.isError ? (
            <div className="text-sm text-destructive">
              Failed to load faculties:{" "}
              {q.error?.response?.data?.message || q.error?.message || "Unknown error"}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[90px]">ID</TableHead>
                  <TableHead className="w-[120px]">Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="w-[120px]">Status</TableHead>
                  <TableHead className="w-[120px]">Actions</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {pager.pageItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                      {q.isLoading ? "Loading..." : "No faculties found."}
                    </TableCell>
                  </TableRow>
                ) : (
                  pager.pageItems.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-xs">{r.id}</TableCell>
                      <TableCell className="font-mono text-xs">{r.code}</TableCell>
                      <TableCell className="font-medium">{r.name}</TableCell>
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
            <DialogTitle>Edit faculty</DialogTitle>
          </DialogHeader>
          {renderForm(() => update.mutate(), "Update")}
        </DialogContent>
      </Dialog>
    </div>
  );
}
