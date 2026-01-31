import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Link } from "react-router-dom";

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

function norm(v) {
  return String(v ?? "").trim();
}

function normalizeExamPayload(form) {
  const name = norm(form.name);
  const academic_year_id = Number(form.academic_year_id || 0);
  const class_id = Number(form.class_id || 0);
  const faculty_id = Number(form.faculty_id || 0);

  if (!name) return { error: "Exam name is required" };
  if (!academic_year_id) return { error: "Academic year is required" };
  if (!class_id) return { error: "Class is required" };
  if (!faculty_id) return { error: "Faculty is required" };

  return {
    payload: {
      name,
      academic_year_id,
      class_id,
      faculty_id,
    },
  };
}

export default function ExamsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const [form, setForm] = useState({
    name: "",
    academic_year_id: "",
    class_id: "",
    faculty_id: "",
  });

  // Load exams
  const examsQ = useQuery({
    queryKey: ["exams", "list"],
    queryFn: async () => {
      const res = await api.get("/api/exams");
      const data = res.data?.exams ?? res.data?.data ?? res.data ?? [];
      return Array.isArray(data) ? data : [];
    },
    staleTime: 10_000,
  });

  // Masters for select options
  const yearsQ = useQuery({
    queryKey: ["masters", "academic-years"],
    queryFn: async () => {
      const res = await api.get("/api/masters/academic-years");
      const data = res.data?.academic_years ?? res.data?.years ?? res.data?.data ?? res.data ?? [];
      return Array.isArray(data) ? data : [];
    },
    staleTime: 60_000,
  });

  const facultiesQ = useQuery({
    queryKey: ["masters", "faculties"],
    queryFn: async () => {
      const res = await api.get("/api/masters/faculties");
      const data = res.data?.faculties ?? res.data?.data ?? res.data ?? [];
      return Array.isArray(data) ? data : [];
    },
    staleTime: 60_000,
  });

  const classesQ = useQuery({
    queryKey: ["masters", "classes"],
    queryFn: async () => {
      const res = await api.get("/api/masters/classes");
      const data = res.data?.classes ?? res.data?.data ?? res.data ?? [];
      return Array.isArray(data) ? data : [];
    },
    staleTime: 60_000,
  });

  const createExam = useMutation({
    mutationFn: async () => {
      const { payload, error } = normalizeExamPayload(form);
      if (error) throw new Error(error);

      const res = await api.post("/api/exams", payload);
      return res.data;
    },
    onSuccess: async () => {
      toast.success("Exam created");
      setOpen(false);
      setForm({ name: "", academic_year_id: "", class_id: "", faculty_id: "" });
      await qc.invalidateQueries({ queryKey: ["exams", "list"] });
    },
    onError: (err) => {
      toast.error(err?.response?.data?.message || err.message || "Failed to create exam");
    },
  });

  const rows = useMemo(() => {
    const arr = examsQ.data || [];
    return arr.map((x) => ({
      id: x.id ?? x.exam_id ?? "",
      name: x.name ?? x.title ?? "",
      academic_year_id: x.academic_year_id ?? "",
      class_id: x.class_id ?? "",
      faculty_id: x.faculty_id ?? "",
      is_published: !!(x.published_at || x.is_published),
      published_at: x.published_at || null,
      locked_at: x.locked_at || null,
      raw: x,
    }));
  }, [examsQ.data]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Exams</h2>
          <p className="text-sm text-muted-foreground">
            Create exams and configure components/full marks per exam.
          </p>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>Create Exam</Button>
          </DialogTrigger>

          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>Create exam</DialogTitle>
            </DialogHeader>

            <div className="space-y-3">
              <div className="space-y-2">
                <label className="text-sm font-medium">Exam name</label>
                <Input
                  placeholder="e.g., Terminal 1 2082"
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Academic year</label>
                  <select
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                    value={form.academic_year_id}
                    onChange={(e) => setForm((p) => ({ ...p, academic_year_id: e.target.value }))}
                  >
                    <option value="">
                      {yearsQ.isLoading ? "Loading..." : "Select year"}
                    </option>
                    {(yearsQ.data || []).map((y) => (
                      <option key={y.id} value={y.id}>
                        {y.year_bs || y.name || `Year #${y.id}`}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Class</label>
                  <select
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                    value={form.class_id}
                    onChange={(e) => setForm((p) => ({ ...p, class_id: e.target.value }))}
                  >
                    <option value="">
                      {classesQ.isLoading ? "Loading..." : "Select class"}
                    </option>
                    {(classesQ.data || []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name || c.class_name || `Class #${c.id}`}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <label className="text-sm font-medium">Faculty / Program</label>
                  <select
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                    value={form.faculty_id}
                    onChange={(e) => setForm((p) => ({ ...p, faculty_id: e.target.value }))}
                  >
                    <option value="">
                      {facultiesQ.isLoading ? "Loading..." : "Select faculty"}
                    </option>
                    {(facultiesQ.data || []).map((f) => (
                      <option key={f.id} value={f.id}>
                        {(f.code ? `${f.code} — ` : "") + (f.name || `Faculty #${f.id}`)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setOpen(false)} disabled={createExam.isPending}>
                  Cancel
                </Button>
                <Button onClick={() => createExam.mutate()} disabled={createExam.isPending}>
                  {createExam.isPending ? "Saving..." : "Save"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-lg border">
        <div className="flex items-center justify-between p-3 border-b">
          <div className="text-sm font-medium">Exam List</div>
          <div className="text-xs text-muted-foreground">
            {examsQ.isLoading ? "Loading..." : `Total: ${rows.length}`}
          </div>
        </div>

        <div className="p-3">
          {examsQ.isError ? (
            <div className="text-sm text-destructive">
              Failed to load exams:{" "}
              {examsQ.error?.response?.data?.message || examsQ.error?.message || "Unknown error"}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[90px]">ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="w-[140px]">Status</TableHead>
                  <TableHead className="w-[200px]">Actions</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                      {examsQ.isLoading ? "Loading..." : "No exams found."}
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-xs">{r.id}</TableCell>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell>
                        {r.is_published ? (
                          <Badge variant="secondary">Published</Badge>
                        ) : (
                          <Badge variant="outline">Draft</Badge>
                        )}
                      </TableCell>
                      <TableCell className="space-x-2">
                        <Button asChild size="sm" variant="outline">
                          <Link to={`/exams/${r.id}/components`}>Components</Link>
                        </Button>
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
