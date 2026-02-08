import { useMemo, useState, useEffect } from "react";
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

function norm(v) {
  return String(v ?? "").trim();
}

function pad4(code) {
  const s = String(code ?? "").trim();
  if (!s) return "";
  if (s.length >= 4) return s;
  return s.padStart(4, "0");
}

function splitBsDate(v) {
  const m = String(v || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return { y: "", m: "", d: "" };
  return { y: m[1], m: m[2], d: m[3] };
}

function buildBsDate(y, m, d) {
  if (!y || !m || !d) return "";
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function BsDateSelect({ value, onChange }) {
  const parts = splitBsDate(value);
  const years = [];
  for (let y = 2000; y <= 2200; y += 1) years.push(String(y));
  const months = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0"));
  const days = Array.from({ length: 32 }, (_, i) => String(i + 1).padStart(2, "0"));

  return (
    <div className="grid grid-cols-3 gap-2">
      <select
        className="h-10 w-full rounded-md border bg-background px-3 text-sm"
        value={parts.y}
        onChange={(e) => onChange(buildBsDate(e.target.value, parts.m, parts.d))}
      >
        <option value="">Year</option>
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
      <select
        className="h-10 w-full rounded-md border bg-background px-3 text-sm"
        value={parts.m}
        onChange={(e) => onChange(buildBsDate(parts.y, e.target.value, parts.d))}
      >
        <option value="">Month</option>
        {months.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
      <select
        className="h-10 w-full rounded-md border bg-background px-3 text-sm"
        value={parts.d}
        onChange={(e) => onChange(buildBsDate(parts.y, parts.m, e.target.value))}
      >
        <option value="">Day</option>
        {days.map((d) => (
          <option key={d} value={d}>
            {d}
          </option>
        ))}
      </select>
    </div>
  );
}

function normalizeStudentPayload(form) {
  const batch_id = Number(form.batch_id || 0);
  const class_id = Number(form.class_id || 0);
  if (!batch_id) return { error: "Batch is required" };
  if (!class_id) return { error: "Class is required" };

  const full_name = norm(form.full_name);
  const symbol_no = norm(form.symbol_no);
  const dob = norm(form.dob);

  if (!full_name) return { error: "Student full name is required" };
  if (!symbol_no) return { error: "Symbol no is required" };
  if (!dob) return { error: "DOB is required (BS, YYYY-MM-DD)" };

  const email = norm(form.email) || undefined;
  const phone = norm(form.phone) || undefined;

  return {
    payload: {
      batch_id,
      class_id,
      full_name,
      symbol_no,
      dob,
      email,
      phone,
    },
  };
}

export default function StudentsPage() {
  const qc = useQueryClient();

  const [batchId, setBatchId] = useState("");
  const [classId, setClassId] = useState("");
  const [open, setOpen] = useState(false);

  // Profile dialog state
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileEnrollmentId, setProfileEnrollmentId] = useState(null);

  // Edit dialog state
  const [editOpen, setEditOpen] = useState(false);
  const [editingStudentId, setEditingStudentId] = useState(null);
  const [editForm, setEditForm] = useState({
    full_name: "",
    symbol_no: "",
    dob: "",
    regd_no: "",
    roll_no: "",
  });

  // create form
  const [form, setForm] = useState({
    batch_id: "",
    class_id: "",
    full_name: "",
    symbol_no: "",
    dob: "",
    email: "",
    phone: "",
  });

  // Optional editor state
  const [optDraft, setOptDraft] = useState({});
  const [optDirty, setOptDirty] = useState(false);

  // load batches
  const batchesQ = useQuery({
    queryKey: ["masters", "batches"],
    queryFn: async () => {
      const res = await api.get("/api/masters/batches");
      const data = res.data?.batches ?? res.data?.data ?? res.data ?? [];
      return Array.isArray(data) ? data : [];
    },
    staleTime: 30_000,
  });

  const batchOptions = useMemo(() => {
    const arr = batchesQ.data || [];
    return arr.map((b) => {
      const id = String(b.id ?? b.batch_id ?? "");
      const name = b.name ?? "";
      const year = b.year_bs ?? "";
      const label = [name, year ? `(${year})` : ""].filter(Boolean).join(" ");
      return { value: id, label: label || `Batch #${id}` };
    });
  }, [batchesQ.data]);

  const classesQ = useQuery({
    queryKey: ["masters", "classes"],
    queryFn: async () => {
      const res = await api.get("/api/masters/classes");
      const data = res.data?.classes ?? res.data?.data ?? res.data ?? [];
      return Array.isArray(data) ? data : [];
    },
    staleTime: 30_000,
  });

  const classOptions = useMemo(() => {
    const arr = classesQ.data || [];
    return arr.map((c) => ({
      value: String(c.id ?? c.class_id ?? ""),
      label: c.name ?? `Class #${c.id ?? c.class_id}`,
    }));
  }, [classesQ.data]);

  // load students for selected batch + class
  const studentsQ = useQuery({
    queryKey: ["students", "list", batchId, classId],
    enabled: !!batchId && !!classId,
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (batchId) qs.set("batch_id", batchId);
      if (classId) qs.set("class_id", classId);
      const res = await api.get(`/api/students?${qs.toString()}`);
      const data = res.data?.students ?? res.data?.data ?? res.data ?? [];
      return Array.isArray(data) ? data : [];
    },
    staleTime: 10_000,
  });

  // profile fetch
  const profileQ = useQuery({
    queryKey: ["students", "profile", profileEnrollmentId],
    enabled: !!profileEnrollmentId && profileOpen,
    queryFn: async () => {
      const res = await api.get(`/api/students/${profileEnrollmentId}/profile`);
      return res.data;
    },
    staleTime: 10_000,
  });

  // subject catalog fetch (for optional choices)
  const catalogQ = useQuery({
    queryKey: ["masters", "subject-catalog", profileEnrollmentId],
    enabled: !!profileEnrollmentId && profileOpen && !!profileQ.data?.enrollment,
    queryFn: async () => {
      const e = profileQ.data.enrollment;
      const academic_year_id = e.academic_year_id;
      const class_id = e.class_id;
      const res = await api.get(
        `/api/masters/subject-catalog?academic_year_id=${encodeURIComponent(academic_year_id)}&class_id=${encodeURIComponent(class_id)}`
      );
      return res.data;
    },
    staleTime: 30_000,
  });

  const createStudent = useMutation({
    mutationFn: async () => {
      const { payload, error } = normalizeStudentPayload(form);
      if (error) throw new Error(error);

      const res = await api.post("/api/students", payload);
      return res.data;
    },
    onSuccess: async () => {
      toast.success("Student created");
      setOpen(false);
      setForm({
        batch_id: batchId || "",
        full_name: "",
        symbol_no: "",
        dob: "",
        email: "",
        phone: "",
      });

      await qc.invalidateQueries({ queryKey: ["students", "list", batchId, classId] });
    },
    onError: (err) => {
      toast.error(err?.response?.data?.message || err.message || "Failed to create student");
    },
  });

  const updateStudent = useMutation({
    mutationFn: async () => {
      if (!editingStudentId) throw new Error("Missing student id");

      const payload = {
        full_name: norm(editForm.full_name),
        symbol_no: norm(editForm.symbol_no),
        dob: norm(editForm.dob),
        regd_no: norm(editForm.regd_no) || null,
        roll_no: norm(editForm.roll_no) || null,
      };

      const res = await api.put(`/api/students/${editingStudentId}`, payload);
      return res.data;
    },
    onSuccess: async () => {
      toast.success("Student updated");
      setEditOpen(false);
      setEditingStudentId(null);
      await qc.invalidateQueries({ queryKey: ["students", "list", batchId, classId] });
    },
    onError: (err) => {
      toast.error(err?.response?.data?.message || err.message || "Failed to update student");
    },
  });

  // save optional choices
  const saveOptionals = useMutation({
    mutationFn: async () => {
      if (!profileEnrollmentId) throw new Error("Missing enrollment id");

      const choices = Object.entries(optDraft)
        .filter(([, sid]) => Number(sid) > 0)
        .map(([group_name, subject_id]) => ({
          group_name,
          subject_id: Number(subject_id),
        }));

      if (choices.length === 0) throw new Error("Select at least one optional subject");

      const payload = { choices, optional_choices: choices };

      const res = await api.post(`/api/students/${profileEnrollmentId}/optional-choices`, payload);
      return res.data;
    },
    onSuccess: async () => {
      toast.success("Optional subjects saved");
      setOptDirty(false);
      await qc.invalidateQueries({ queryKey: ["students", "profile", profileEnrollmentId] });
    },
    onError: (err) => {
      toast.error(err?.response?.data?.message || err.message || "Failed to save optionals");
    },
  });

  const rows = useMemo(() => {
    const arr = studentsQ.data || [];
    return arr.map((x) => ({
      id: x.id ?? x.student_id ?? "",
      enrollment_id: x.enrollment_id ?? x.enrollmentId ?? x.id_enrollment ?? x.enrollment?.id ?? "",
      full_name: x.full_name ?? x.name ?? "",
      symbol_no: x.symbol_no ?? x.symbol ?? "",
      dob: x.dob ?? "",
      regd_no: x.regd_no ?? "",
      roll_no: x.roll_no ?? "",
      is_active: Number(x.is_active ?? 1) === 1,
      raw: x,
    }));
  }, [studentsQ.data]);

  const pager = usePagination(rows, 20);

  // When profile loads, initialize optDraft from server optional_choices
  useEffect(() => {
    if (!profileOpen) return;
    if (!profileQ.data?.ok) return;

    const serverChoices = profileQ.data.optional_choices || [];
    const draft = {};
    for (const c of serverChoices) {
      if (!c?.group_name) continue;
      draft[c.group_name] = Number(c.subject_id) || "";
    }
    setOptDraft(draft);
    setOptDirty(false);
  }, [profileOpen, profileQ.data]);

  const optionalGroups = useMemo(() => {
    const raw =
      catalogQ.data?.catalog_groups ||
      catalogQ.data?.groups ||
      catalogQ.data?.data?.catalog_groups ||
      catalogQ.data?.data?.groups ||
      [];

    const groups = Array.isArray(raw) ? raw : [];

    const normalizedFromCatalog = groups
      .map((g) => {
        const group_name = g.group_name || g.name || g.title || "";
        const subs = g.subjects || g.items || g.subject_list || [];
        const subjects = (Array.isArray(subs) ? subs : []).map((s) => ({
          id: s.id ?? s.subject_id,
          name: s.name ?? s.subject_name,
          code: s.code ?? s.subject_code ?? "",
        }));
        if (!group_name) return null;
        return { group_name, subjects: subjects.filter((x) => x.id) };
      })
      .filter(Boolean);

    if (normalizedFromCatalog.length > 0) return normalizedFromCatalog;

    const choiceGroups = (profileQ.data?.optional_choices || [])
      .map((c) => c.group_name)
      .filter(Boolean);

    const uniqueGroups = [...new Set(choiceGroups)];

    const fallbackSubjects = (profileQ.data?.optional_subjects || []).map((s) => ({
      id: s.id,
      name: s.name,
      code: s.components?.[0]?.component_code || "",
    }));

    return uniqueGroups.map((group_name) => ({
      group_name,
      subjects: fallbackSubjects,
    }));
  }, [catalogQ.data, profileQ.data, profileQ.data?.optional_choices]);

  const enrollment = profileQ.data?.enrollment;

  const openEdit = (r) => {
    setEditingStudentId(r.id);
    setEditForm({
      full_name: r.full_name || "",
      symbol_no: r.symbol_no || "",
      dob: String(r.dob || "").slice(0, 10),
      regd_no: r.regd_no || "",
      roll_no: r.roll_no || "",
    });
    setEditOpen(true);
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Students</h2>
        <p className="text-sm text-muted-foreground">
          Select a batch and class to list students, then add new students into that batch.
        </p>
      </div>

      <div className="rounded-lg border p-3">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Select
            label="Batch"
            value={batchId}
            onChange={(v) => {
              setBatchId(v);
              setForm((p) => ({ ...p, batch_id: v }));
            }}
            options={batchOptions}
            placeholder={batchesQ.isLoading ? "Loading batches..." : "Select batch"}
          />
          <Select
            label="Class"
            value={classId}
            onChange={(v) => {
              setClassId(v);
              setForm((p) => ({ ...p, class_id: v }));
            }}
            options={classOptions}
            placeholder={classesQ.isLoading ? "Loading classes..." : "Select class"}
          />

          <div className="md:col-span-1 flex items-end justify-between gap-2">
            <div className="text-xs text-muted-foreground">
              {batchId && classId
                ? studentsQ.isLoading
                  ? "Loading students..."
                  : `Total: ${rows.length}`
                : "Choose a batch and class to load students."}
            </div>

            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button disabled={!batchId || !classId}>Add Student</Button>
              </DialogTrigger>

              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add student</DialogTitle>
                </DialogHeader>

                <div className="space-y-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-2 sm:col-span-2">
                      <label className="text-sm font-medium">Full name</label>
                      <Input
                        placeholder="Student full name"
                        value={form.full_name}
                        onChange={(e) => setForm((p) => ({ ...p, full_name: e.target.value }))}
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">Symbol no</label>
                      <Input
                        placeholder="e.g., 12345678"
                        value={form.symbol_no}
                        onChange={(e) => setForm((p) => ({ ...p, symbol_no: e.target.value }))}
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">DOB (BS)</label>
                      <BsDateSelect
                        value={form.dob}
                        onChange={(v) => setForm((p) => ({ ...p, dob: v }))}
                      />
                      <div className="text-xs text-muted-foreground">
                        Format: YYYY-MM-DD (BS)
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">Email (optional)</label>
                      <Input
                        placeholder="student@example.com"
                        value={form.email}
                        onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">Phone (optional)</label>
                      <Input
                        placeholder="98xxxxxxxx"
                        value={form.phone}
                        onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setOpen(false)} disabled={createStudent.isPending}>
                      Cancel
                    </Button>
                    <Button onClick={() => createStudent.mutate()} disabled={createStudent.isPending}>
                      {createStudent.isPending ? "Saving..." : "Save"}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>

      <div className="rounded-lg border">
        <div className="flex items-center justify-between p-3 border-b">
          <div className="text-sm font-medium">Student List</div>
          <div className="text-xs text-muted-foreground">
            {batchId ? `Batch ID: ${batchId}` : "No batch selected"}
          </div>
        </div>

        <div className="p-3">
          {!batchId || !classId ? (
            <div className="text-sm text-muted-foreground">Select a batch and class to view students.</div>
          ) : studentsQ.isError ? (
            <div className="text-sm text-destructive">
              Failed to load students:{" "}
              {studentsQ.error?.response?.data?.message || studentsQ.error?.message || "Unknown error"}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[90px]">ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="w-[140px]">Symbol No</TableHead>
                  <TableHead className="w-[140px]">DOB</TableHead>
                  <TableHead className="w-[120px]">Status</TableHead>
                  <TableHead className="w-[200px]">Actions</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {pager.pageItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                      {studentsQ.isLoading ? "Loading..." : "No students found."}
                    </TableCell>
                  </TableRow>
                ) : (
                  pager.pageItems.map((r) => (
                    <TableRow key={r.id || r.symbol_no}>
                      <TableCell className="font-mono text-xs">{r.id}</TableCell>
                      <TableCell className="font-medium">{r.full_name}</TableCell>
                      <TableCell className="font-mono text-xs">{r.symbol_no}</TableCell>
                      <TableCell className="font-mono text-xs">{String(r.dob || "").slice(0, 10)}</TableCell>
                      <TableCell>
                        {r.is_active ? <Badge variant="secondary">Active</Badge> : <Badge variant="destructive">Inactive</Badge>}
                      </TableCell>
                      <TableCell className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openEdit(r)}
                        >
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            const eid = r.enrollment_id || r.id;
                            setProfileEnrollmentId(eid);
                            setProfileOpen(true);
                          }}
                        >
                          Profile
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

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit student</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <label className="text-sm font-medium">Full name</label>
                <Input
                  value={editForm.full_name}
                  onChange={(e) => setEditForm((p) => ({ ...p, full_name: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Symbol no</label>
                <Input
                  value={editForm.symbol_no}
                  onChange={(e) => setEditForm((p) => ({ ...p, symbol_no: e.target.value }))}
                />
              </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">DOB (BS)</label>
                      <BsDateSelect
                        value={editForm.dob}
                        onChange={(v) => setEditForm((p) => ({ ...p, dob: v }))}
                      />
                    </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Regd No</label>
                <Input
                  value={editForm.regd_no}
                  onChange={(e) => setEditForm((p) => ({ ...p, regd_no: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Roll No</label>
                <Input
                  value={editForm.roll_no}
                  onChange={(e) => setEditForm((p) => ({ ...p, roll_no: e.target.value }))}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => updateStudent.mutate()} disabled={updateStudent.isPending}>
                {updateStudent.isPending ? "Saving..." : "Update"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Profile Dialog */}
      <Dialog
        open={profileOpen}
        onOpenChange={(v) => {
          setProfileOpen(v);
          if (!v) {
            setProfileEnrollmentId(null);
            setOptDraft({});
            setOptDirty(false);
          }
        }}
      >
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Student Profile</DialogTitle>
          </DialogHeader>

          {profileQ.isLoading ? (
            <div className="text-sm text-muted-foreground">Loading profile...</div>
          ) : profileQ.isError ? (
            <div className="text-sm text-destructive">
              Failed:{" "}
              {profileQ.error?.response?.data?.message || profileQ.error?.message || "Unknown error"}
            </div>
          ) : (
            <div className="space-y-4">
              {/* Basic */}
              <div className="rounded-lg border p-3">
                <div className="text-sm font-medium">Enrollment</div>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div className="text-sm">
                    <span className="text-muted-foreground">Name: </span>
                    <span className="font-medium">{enrollment?.full_name || "—"}</span>
                  </div>
                  <div className="text-sm">
                    <span className="text-muted-foreground">Symbol: </span>
                    <span className="font-mono">{enrollment?.symbol_no || "—"}</span>
                  </div>
                  <div className="text-sm">
                    <span className="text-muted-foreground">Class ID: </span>
                    <span className="font-medium">{enrollment?.class_id || "—"}</span>
                  </div>
                  <div className="text-sm">
                    <span className="text-muted-foreground">Faculty ID: </span>
                    <span className="font-medium">{enrollment?.faculty_id || "—"}</span>
                  </div>
                </div>
              </div>

              {/* Compulsory */}
              <div className="rounded-lg border p-3">
                <div className="text-sm font-medium">Compulsory Subjects</div>
                {profileQ.data?.compulsory_subjects?.length ? (
                  <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {profileQ.data.compulsory_subjects.map((s) => (
                      <div key={s.id} className="text-sm">
                        {s.name}
                        {s.components?.length ? (
                          <div className="text-xs text-muted-foreground mt-1">
                            {s.components
                              .map((c) => `${c.component_type} ${pad4(c.component_code)}`)
                              .join(" • ")}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground mt-2">No compulsory subjects.</div>
                )}
              </div>

              {/* Optional */}
              <div className="rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium">Optional Subjects</div>
                  {optDirty ? <Badge variant="outline">Unsaved</Badge> : null}
                </div>

                {optionalGroups.length === 0 ? (
                  <div className="text-sm text-muted-foreground mt-2">No optional groups found.</div>
                ) : (
                  <div className="mt-3 space-y-3">
                    {optionalGroups.map((g) => (
                      <div key={g.group_name} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <div className="text-sm font-medium">{g.group_name}</div>
                        <select
                          className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                          value={String(optDraft[g.group_name] || "")}
                          onChange={(e) => {
                            setOptDraft((p) => ({ ...p, [g.group_name]: e.target.value }));
                            setOptDirty(true);
                          }}
                        >
                          <option value="">Select subject</option>
                          {g.subjects.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name} {s.code ? `(${pad4(s.code)})` : ""}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}

                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={() => setOptDirty(false)}>
                        Reset
                      </Button>
                      <Button onClick={() => saveOptionals.mutate()} disabled={saveOptionals.isPending}>
                        {saveOptionals.isPending ? "Saving..." : "Save Optional"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
