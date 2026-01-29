import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "../../lib/api";

import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Badge } from "../../components/ui/badge";
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

function normalizeSectionPayload(form) {
  const campus_id = toId(form.campus_id);
  const academic_year_id = toId(form.academic_year_id);
  const class_id = toId(form.class_id);
  const faculty_id = toId(form.faculty_id);
  const name = normStr(form.name);

  if (!campus_id) return { error: "Campus is required" };
  if (!academic_year_id) return { error: "Academic year is required" };
  if (!class_id) return { error: "Class is required" };
  if (!faculty_id) return { error: "Faculty is required" };
  if (!name) return { error: "Section name is required (e.g., A)" };

  return {
    payload: { campus_id, academic_year_id, class_id, faculty_id, name },
  };
}

function Select({ label, value, onChange, options, placeholder }) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">{label}</label>
      <select
        className="h-10 w-full rounded-md border bg-background px-3 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export default function SectionsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  // Create form state
  const [form, setForm] = useState({
    campus_id: "",
    academic_year_id: "",
    class_id: "",
    faculty_id: "",
    name: "",
  });

  // Filters for list
  const [filter, setFilter] = useState({
    campus_id: "",
    academic_year_id: "",
    class_id: "",
    faculty_id: "",
  });

  const campusesQ = useQuery({
    queryKey: ["masters", "campuses"],
    queryFn: async () => {
      const res = await api.get("/api/masters/campuses");
      return res.data?.campuses ?? [];
    },
    staleTime: 60_000,
  });

  const yearsQ = useQuery({
    queryKey: ["masters", "academic-years"],
    queryFn: async () => {
      const res = await api.get("/api/masters/academic-years");
      const data =
        res.data?.academic_years ?? res.data?.years ?? res.data?.data ?? [];
      return Array.isArray(data) ? data : [];
    },
    staleTime: 60_000,
  });

  const facultiesQ = useQuery({
    queryKey: ["masters", "faculties"],
    queryFn: async () => {
      const res = await api.get("/api/masters/faculties");
      const data = res.data?.faculties ?? res.data?.programs ?? res.data?.data ?? [];
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

  const sectionsQ = useQuery({
    queryKey: ["masters", "sections"],
    queryFn: async () => {
      const res = await api.get("/api/masters/sections");
      const data = res.data?.sections ?? res.data?.data ?? res.data ?? [];
      return Array.isArray(data) ? data : [];
    },
    staleTime: 20_000,
  });

  const create = useMutation({
    mutationFn: async () => {
      const { payload, error } = normalizeSectionPayload(form);
      if (error) throw new Error(error);
      const res = await api.post("/api/masters/sections", payload);
      return res.data;
    },
    onSuccess: async () => {
      toast.success("Section created");
      setForm({
        campus_id: "",
        academic_year_id: "",
        class_id: "",
        faculty_id: "",
        name: "",
      });
      setOpen(false);
      await qc.invalidateQueries({ queryKey: ["masters", "sections"] });
    },
    onError: (err) => {
      toast.error(err?.response?.data?.message || err.message || "Failed to create section");
    },
  });

  const campusOptions = useMemo(
    () =>
      (campusesQ.data || []).map((c) => ({
        value: String(c.id),
        label: `${c.code ? `${c.code} • ` : ""}${c.name}`,
      })),
    [campusesQ.data]
  );

  const yearOptions = useMemo(
    () =>
      (yearsQ.data || []).map((y) => ({
        value: String(y.id ?? y.academic_year_id ?? ""),
        label: String(y.year_bs ?? y.year ?? y.bs_year ?? ""),
      })),
    [yearsQ.data]
  );

  const facultyOptions = useMemo(
    () =>
      (facultiesQ.data || []).map((f) => ({
        value: String(f.id ?? f.faculty_id ?? ""),
        label: `${f.code ?? ""} • ${f.name ?? f.title ?? ""}`.trim(),
      })),
    [facultiesQ.data]
  );

  const classOptions = useMemo(
    () =>
      (classesQ.data || []).map((c) => ({
        value: String(c.id ?? c.class_id ?? ""),
        label: String(c.name ?? c.class_name ?? c.label ?? c.grade ?? c.value ?? ""),
      })),
    [classesQ.data]
  );

  // index maps for list display
  const campusMap = useMemo(() => {
    const m = new Map();
    (campusesQ.data || []).forEach((c) => m.set(Number(c.id), c));
    return m;
  }, [campusesQ.data]);

  const yearMap = useMemo(() => {
    const m = new Map();
    (yearsQ.data || []).forEach((y) => m.set(Number(y.id ?? y.academic_year_id), y));
    return m;
  }, [yearsQ.data]);

  const facultyMap = useMemo(() => {
    const m = new Map();
    (facultiesQ.data || []).forEach((f) => m.set(Number(f.id ?? f.faculty_id), f));
    return m;
  }, [facultiesQ.data]);

  const classMap = useMemo(() => {
    const m = new Map();
    (classesQ.data || []).forEach((c) => m.set(Number(c.id ?? c.class_id), c));
    return m;
  }, [classesQ.data]);

  const rows = useMemo(() => {
    const arr = sectionsQ.data || [];
    const fc = filter;

    return arr
      .map((s) => ({
        id: s.id ?? s.section_id ?? "",
        campus_id: Number(s.campus_id),
        academic_year_id: Number(s.academic_year_id),
        class_id: Number(s.class_id),
        faculty_id: Number(s.faculty_id),
        name: s.name ?? s.section_name ?? "",
        is_active: Number(s.is_active ?? 1) === 1,
        raw: s,
      }))
      .filter((r) => (fc.campus_id ? String(r.campus_id) === fc.campus_id : true))
      .filter((r) => (fc.academic_year_id ? String(r.academic_year_id) === fc.academic_year_id : true))
      .filter((r) => (fc.class_id ? String(r.class_id) === fc.class_id : true))
      .filter((r) => (fc.faculty_id ? String(r.faculty_id) === fc.faculty_id : true))
      .sort((a, b) => Number(b.id) - Number(a.id));
  }, [sectionsQ.data, filter]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">Sections</h3>
          <p className="text-sm text-muted-foreground">
            A section is a unique combination of Campus + Year + Class + Faculty + Section Name.
          </p>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>Add Section</Button>
          </DialogTrigger>

          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add section</DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Select
                  label="Campus"
                  value={form.campus_id}
                  onChange={(v) => setForm((p) => ({ ...p, campus_id: v }))}
                  options={campusOptions}
                  placeholder="Select campus"
                />
                <Select
                  label="Academic Year (BS)"
                  value={form.academic_year_id}
                  onChange={(v) => setForm((p) => ({ ...p, academic_year_id: v }))}
                  options={yearOptions}
                  placeholder="Select year"
                />
                <Select
                  label="Class"
                  value={form.class_id}
                  onChange={(v) => setForm((p) => ({ ...p, class_id: v }))}
                  options={classOptions}
                  placeholder="Select class"
                />
                <Select
                  label="Faculty"
                  value={form.faculty_id}
                  onChange={(v) => setForm((p) => ({ ...p, faculty_id: v }))}
                  options={facultyOptions}
                  placeholder="Select faculty"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Section name</label>
                <Input
                  placeholder="e.g., A"
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                />
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

      {/* Filters */}
      <div className="rounded-lg border p-3">
        <div className="text-sm font-medium mb-3">Filter</div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Select
            label="Campus"
            value={filter.campus_id}
            onChange={(v) => setFilter((p) => ({ ...p, campus_id: v }))}
            options={campusOptions}
            placeholder="All campuses"
          />
          <Select
            label="Year"
            value={filter.academic_year_id}
            onChange={(v) => setFilter((p) => ({ ...p, academic_year_id: v }))}
            options={yearOptions}
            placeholder="All years"
          />
          <Select
            label="Class"
            value={filter.class_id}
            onChange={(v) => setFilter((p) => ({ ...p, class_id: v }))}
            options={classOptions}
            placeholder="All classes"
          />
          <Select
            label="Faculty"
            value={filter.faculty_id}
            onChange={(v) => setFilter((p) => ({ ...p, faculty_id: v }))}
            options={facultyOptions}
            placeholder="All faculties"
          />
        </div>

        <div className="mt-3 flex justify-end">
          <Button
            variant="outline"
            onClick={() =>
              setFilter({ campus_id: "", academic_year_id: "", class_id: "", faculty_id: "" })
            }
          >
            Clear Filters
          </Button>
        </div>
      </div>

      {/* List */}
      <div className="rounded-lg border">
        <div className="flex items-center justify-between p-3 border-b">
          <div className="text-sm font-medium">Section List</div>
          <div className="text-xs text-muted-foreground">
            {sectionsQ.isLoading ? "Loading..." : `Showing: ${rows.length}`}
          </div>
        </div>

        <div className="p-3">
          {sectionsQ.isError ? (
            <div className="text-sm text-destructive">
              Failed to load sections:{" "}
              {sectionsQ.error?.response?.data?.message ||
                sectionsQ.error?.message ||
                "Unknown error"}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[80px]">ID</TableHead>
                  <TableHead>Campus</TableHead>
                  <TableHead className="w-[110px]">Year</TableHead>
                  <TableHead className="w-[90px]">Class</TableHead>
                  <TableHead>Faculty</TableHead>
                  <TableHead className="w-[90px]">Section</TableHead>
                  <TableHead className="w-[120px]">Status</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-sm text-muted-foreground">
                      {sectionsQ.isLoading ? "Loading..." : "No sections found."}
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((r) => {
                    const c = campusMap.get(r.campus_id);
                    const y = yearMap.get(r.academic_year_id);
                    const f = facultyMap.get(r.faculty_id);
                    const cl = classMap.get(r.class_id);

                    const campusLabel = c ? `${c.code ? `${c.code} • ` : ""}${c.name}` : `#${r.campus_id}`;
                    const yearLabel = y ? String(y.year_bs ?? y.year ?? y.bs_year) : `#${r.academic_year_id}`;
                    const facultyLabel = f ? `${f.code ?? ""} • ${f.name ?? f.title ?? ""}`.trim() : `#${r.faculty_id}`;
                    const classLabel = cl ? String(cl.name ?? cl.class_name ?? cl.label ?? "") : `#${r.class_id}`;

                    return (
                      <TableRow key={r.id}>
                        <TableCell className="font-mono text-xs">{r.id}</TableCell>
                        <TableCell className="font-medium">{campusLabel}</TableCell>
                        <TableCell>{yearLabel}</TableCell>
                        <TableCell>{classLabel}</TableCell>
                        <TableCell>{facultyLabel}</TableCell>
                        <TableCell className="font-semibold">{r.name}</TableCell>
                        <TableCell>
                          {r.is_active ? (
                            <Badge variant="secondary">Active</Badge>
                          ) : (
                            <Badge variant="destructive">Inactive</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          )}
        </div>
      </div>
    </div>
  );
}
