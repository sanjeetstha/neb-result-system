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

function toIntOrNull(v) {
  const n = Number(String(v ?? "").trim());
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

function normalizePayload(form) {
  const y = toIntOrNull(form.year_bs);
  if (!y) return { error: "Enter a valid BS year (e.g., 2082)." };
  if (y < 2000 || y > 2200) return { error: "Year out of range" };
  return { payload: { year_bs: y, is_current: !!form.is_current } };
}

export default function AcademicYearsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const [form, setForm] = useState({ year_bs: "", is_current: false });

  const q = useQuery({
    queryKey: ["masters", "academic-years"],
    queryFn: async () => {
      const res = await api.get("/api/masters/academic-years");
      const data = res.data?.academic_years ?? res.data?.years ?? res.data?.data ?? res.data;
      return Array.isArray(data) ? data : [];
    },
    staleTime: 30_000,
  });

  const create = useMutation({
    mutationFn: async () => {
      const { payload, error } = normalizePayload(form);
      if (error) throw new Error(error);
      const res = await api.post("/api/masters/academic-years", payload);
      return res.data;
    },
    onSuccess: async () => {
      toast.success("Academic year created");
      setForm({ year_bs: "", is_current: false });
      setOpen(false);
      await qc.invalidateQueries({ queryKey: ["masters", "academic-years"] });
    },
    onError: (err) => {
      toast.error(err?.response?.data?.message || err.message || "Failed to create academic year");
    },
  });

  const update = useMutation({
    mutationFn: async () => {
      const { payload, error } = normalizePayload(form);
      if (error) throw new Error(error);
      const res = await api.put(`/api/masters/academic-years/${editingId}`, payload);
      return res.data;
    },
    onSuccess: async () => {
      toast.success("Academic year updated");
      setEditOpen(false);
      setEditingId(null);
      setForm({ year_bs: "", is_current: false });
      await qc.invalidateQueries({ queryKey: ["masters", "academic-years"] });
    },
    onError: (err) => {
      toast.error(err?.response?.data?.message || err.message || "Failed to update year");
    },
  });

  const rows = useMemo(() => {
    const arr = q.data || [];
    return arr
      .map((x) => ({
        id: x.id ?? x.academic_year_id ?? "",
        year_bs: x.year_bs ?? x.year ?? x.bs_year ?? "",
        is_current: Number(x.is_current ?? 0) === 1,
        is_active: Number(x.is_active ?? 1) === 1,
        created_at: x.created_at ?? null,
        raw: x,
      }))
      .sort((a, b) => Number(b.year_bs) - Number(a.year_bs));
  }, [q.data]);

  const pager = usePagination(rows, 10);

  const openEdit = (r) => {
    setEditingId(r.id);
    setForm({ year_bs: String(r.year_bs || ""), is_current: !!r.is_current });
    setEditOpen(true);
  };

  const renderForm = (onSave, label) => (
    <div className="space-y-3">
      <div className="space-y-2">
        <label className="text-sm font-medium">BS year</label>
        <Input
          placeholder="e.g., 2082"
          value={form.year_bs}
          onChange={(e) => setForm((p) => ({ ...p, year_bs: e.target.value }))}
        />
        <p className="text-xs text-muted-foreground">
          Tip: Use the Nepali BS year (not AD).
        </p>
      </div>
      <label className="text-sm flex items-center gap-2">
        <input
          type="checkbox"
          checked={form.is_current}
          onChange={(e) => setForm((p) => ({ ...p, is_current: e.target.checked }))}
        />
        Set as current year
      </label>

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
          <h3 className="text-base font-semibold">Academic Years (BS)</h3>
          <p className="text-sm text-muted-foreground">
            Used for NEB sessions like 2082.
          </p>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>Add Year</Button>
          </DialogTrigger>

          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add academic year</DialogTitle>
            </DialogHeader>
            {renderForm(() => create.mutate(), "Save")}
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-lg border">
        <div className="flex items-center justify-between p-3 border-b">
          <div className="text-sm font-medium">Year List</div>
          <div className="text-xs text-muted-foreground">
            {q.isLoading ? "Loading..." : `Total: ${rows.length}`}
          </div>
        </div>

        <div className="p-3">
          {q.isError ? (
            <div className="text-sm text-destructive">
              Failed to load years:{" "}
              {q.error?.response?.data?.message || q.error?.message || "Unknown error"}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[90px]">ID</TableHead>
                  <TableHead>Year (BS)</TableHead>
                  <TableHead className="w-[140px]">Status</TableHead>
                  <TableHead className="w-[120px]">Actions</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {pager.pageItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                      {q.isLoading ? "Loading..." : "No academic years found."}
                    </TableCell>
                  </TableRow>
                ) : (
                  pager.pageItems.map((r) => (
                    <TableRow key={r.id || r.year_bs}>
                      <TableCell className="font-mono text-xs">{r.id}</TableCell>
                      <TableCell className="font-medium">
                        {r.year_bs} {r.is_current ? <Badge className="ml-2" variant="secondary">Current</Badge> : null}
                      </TableCell>
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
            <DialogTitle>Edit academic year</DialogTitle>
          </DialogHeader>
          {renderForm(() => update.mutate(), "Update")}
        </DialogContent>
      </Dialog>
    </div>
  );
}
