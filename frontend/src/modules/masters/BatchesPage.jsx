import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "../../lib/api";
import { usePagination } from "../../lib/usePagination";

import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Badge } from "../../components/ui/badge";
import PaginationBar from "../../components/ui/pagination-bar";
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

function toId(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.trunc(n);
}

function normStr(v) {
  return String(v ?? "").trim();
}

function normalizeBatchPayload(form) {
  const name = normStr(form.name);
  const year_bs = form.year_bs === "" ? null : toId(form.year_bs);

  if (!name) return { error: "Batch name is required (e.g., Batch 2082)" };

  return {
    payload: { name, year_bs, is_active: form.is_active !== false },
  };
}

export default function BatchesPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const [form, setForm] = useState({
    name: "",
    year_bs: "",
    is_active: true,
  });

  const batchesQ = useQuery({
    queryKey: ["masters", "batches"],
    queryFn: async () => {
      const res = await api.get("/api/masters/batches");
      const data = res.data?.batches ?? res.data?.data ?? res.data ?? [];
      return Array.isArray(data) ? data : [];
    },
    staleTime: 60_000,
  });

  const rows = useMemo(() => {
    const arr = batchesQ.data || [];
    return arr.map((b) => ({
      id: b.id ?? b.batch_id ?? "",
      name: b.name,
      year_bs: b.year_bs ?? "",
      is_active: b.is_active !== 0,
    }));
  }, [batchesQ.data]);

  const { pagedData, page, totalPages, setPage } = usePagination(rows, 10);

  const createMut = useMutation({
    mutationFn: async (payload) => {
      const res = await api.post("/api/masters/batches", payload);
      return res.data;
    },
    onSuccess: () => {
      toast.success("Batch created");
      setOpen(false);
      setForm({ name: "", year_bs: "", is_active: true });
      qc.invalidateQueries({ queryKey: ["masters", "batches"] });
    },
    onError: (err) => {
      toast.error(err?.response?.data?.message || "Failed to create batch");
    },
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, payload }) => {
      const res = await api.put(`/api/masters/batches/${id}`, payload);
      return res.data;
    },
    onSuccess: () => {
      toast.success("Batch updated");
      setEditOpen(false);
      qc.invalidateQueries({ queryKey: ["masters", "batches"] });
    },
    onError: (err) => {
      toast.error(err?.response?.data?.message || "Failed to update batch");
    },
  });

  function onCreate() {
    const { error, payload } = normalizeBatchPayload(form);
    if (error) return toast.error(error);
    createMut.mutate(payload);
  }

  function onUpdate() {
    const { error, payload } = normalizeBatchPayload(form);
    if (error) return toast.error(error);
    updateMut.mutate({ id: editingId, payload });
  }

  function startEdit(row) {
    setEditingId(row.id);
    setForm({
      name: row.name || "",
      year_bs: row.year_bs ?? "",
      is_active: row.is_active !== false,
    });
    setEditOpen(true);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xl font-semibold">Batches</div>
          <div className="text-sm text-muted-foreground">
            Manage student batches (e.g., Batch 2082).
          </div>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>Add Batch</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Batch</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <Input
                placeholder="Batch name (e.g., Batch 2082)"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              />
              <Input
                placeholder="Year (BS)"
                value={form.year_bs}
                onChange={(e) => setForm((p) => ({ ...p, year_bs: e.target.value }))}
              />
              <div className="flex items-center justify-end gap-2">
                <Button variant="secondary" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={onCreate} disabled={createMut.isPending}>
                  {createMut.isPending ? "Saving..." : "Save"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Year (BS)</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pagedData.map((row) => (
              <TableRow key={row.id}>
                <TableCell>{row.name}</TableCell>
                <TableCell>{row.year_bs || "—"}</TableCell>
                <TableCell>
                  {row.is_active ? (
                    <Badge>Active</Badge>
                  ) : (
                    <Badge variant="secondary">Inactive</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="outline" onClick={() => startEdit(row)}>
                    Edit
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {pagedData.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                  {batchesQ.isLoading ? "Loading..." : "No batches found."}
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>

      <PaginationBar page={page} totalPages={totalPages} onPageChange={setPage} />

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Batch</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              placeholder="Batch name (e.g., Batch 2082)"
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            />
            <Input
              placeholder="Year (BS)"
              value={form.year_bs}
              onChange={(e) => setForm((p) => ({ ...p, year_bs: e.target.value }))}
            />
            <div className="flex items-center justify-end gap-2">
              <Button variant="secondary" onClick={() => setEditOpen(false)}>
                Cancel
              </Button>
              <Button onClick={onUpdate} disabled={updateMut.isPending}>
                {updateMut.isPending ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
