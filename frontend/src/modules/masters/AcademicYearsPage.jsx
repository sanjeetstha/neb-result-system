import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { api } from "../../lib/api";

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

function toIntOrNull(v) {
  const n = Number(String(v ?? "").trim());
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

function normalizePayload(bsYear) {
  const y = toIntOrNull(bsYear);
  if (!y) return null;
  if (y < 2000 || y > 2200) return null; // sane range
  return { year_bs: y };
}

export default function AcademicYearsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState("");

  const q = useQuery({
    queryKey: ["masters", "academic-years"],
    queryFn: async () => {
      const res = await api.get("/api/masters/academic-years");
      // common shapes:
      // {ok:true, academic_years:[...]} OR {ok:true, years:[...]} OR {ok:true, data:[...]}
      const data =
        res.data?.academic_years ??
        res.data?.years ??
        res.data?.data ??
        res.data;
      return Array.isArray(data) ? data : [];
    },
    staleTime: 30_000,
  });

  const create = useMutation({
    mutationFn: async () => {
      const payload = normalizePayload(year);
      if (!payload)
        throw new Error("Enter a valid BS year (e.g., 2082).");
      const res = await api.post("/api/masters/academic-years", payload);
      return res.data;
    },
    onSuccess: async () => {
      toast.success("Academic year created");
      setYear("");
      setOpen(false);
      await qc.invalidateQueries({ queryKey: ["masters", "academic-years"] });
    },
    onError: (err) => {
      toast.error(
        err?.response?.data?.message ||
          err.message ||
          "Failed to create academic year"
      );
    },
  });

  const rows = useMemo(() => {
    const arr = q.data || [];
    return arr
      .map((x) => ({
        id: x.id ?? x.academic_year_id ?? "",
        year_bs: x.year_bs ?? x.year ?? x.bs_year ?? "",
        is_active: Number(x.is_active ?? 1) === 1,
        created_at: x.created_at ?? null,
        raw: x,
      }))
      .sort((a, b) => Number(b.year_bs) - Number(a.year_bs));
  }, [q.data]);

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

            <div className="space-y-3">
              <div className="space-y-2">
                <label className="text-sm font-medium">BS year</label>
                <Input
                  placeholder="e.g., 2082"
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Tip: Use the Nepali BS year (not AD).
                </p>
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setOpen(false)}
                  disabled={create.isPending}
                >
                  Cancel
                </Button>
                <Button onClick={() => create.mutate()} disabled={create.isPending}>
                  {create.isPending ? "Saving..." : "Save"}
                </Button>
              </div>
            </div>
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
                </TableRow>
              </TableHeader>

              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-sm text-muted-foreground">
                      {q.isLoading ? "Loading..." : "No academic years found."}
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((r) => (
                    <TableRow key={r.id || r.year_bs}>
                      <TableCell className="font-mono text-xs">{r.id}</TableCell>
                      <TableCell className="font-medium">{r.year_bs}</TableCell>
                      <TableCell>
                        {r.is_active ? (
                          <Badge variant="secondary">Active</Badge>
                        ) : (
                          <Badge variant="destructive">Inactive</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </div>
      </div>
    </div>
  );
}
