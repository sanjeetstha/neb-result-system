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

function normalizeStudentPayload(form) {
  const section_id = Number(form.section_id || 0);
  if (!section_id) return { error: "Section is required" };

  const full_name = norm(form.full_name);
  const symbol_no = norm(form.symbol_no);
  const dob = norm(form.dob);

  if (!full_name) return { error: "Student full name is required" };
  if (!symbol_no) return { error: "Symbol no is required" };
  if (!dob) return { error: "DOB is required (YYYY-MM-DD)" };

  const email = norm(form.email) || undefined;
  const phone = norm(form.phone) || undefined;

  return {
    payload: {
      section_id,
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

  const [sectionId, setSectionId] = useState("");
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
    section_id: "",
    full_name: "",
    symbol_no: "",
    dob: "",
    email: "",
    phone: "",
  });

  // Optional editor state
  const [optDraft, setOptDraft] = useState({});
  const [optDirty, setOptDirty] = useState(false);

  // load sections
  const sectionsQ = useQuery({
    queryKey: ["masters", "sections"],
    queryFn: async () => {
      const res = await api.get("/api/masters/sections");
      const data = res.data?.sections ?? res.data?.data ?? res.data ?? [];
      return Array.isArray(data) ? data : [];
    },
    staleTime: 30_000,
  });

  const sectionOptions = useMemo(() => {
    const arr = sectionsQ.data || [];
    return arr.map((s) => {
      const id = String(s.id ?? s.section_id ?? "");
      const name = s.name ?? s.section_name ?? "";
      const campus = s.campus_code || s.campus?.code || "";
      const faculty = s.faculty_code || s.faculty?.code || "";
      const year = s.year_bs || s.academic_year?.year_bs || "";
      const cls = s.class_name || s.class?.name || s.class_id || "";
      const label = [campus, year, cls, faculty, name].filter(Boolean).join(" • ");
      return { value: id, label: label || `Section #${id}` };
    });
  }, [sectionsQ.data]);

  // load students for selected section
  const studentsQ = useQuery({
    queryKey: ["students", "list", sectionId],
    enabled: !!sectionId,
    queryFn: async () => {
      const res = await api.get(`/api/students?section_id=${encodeURIComponent(sectionId)}`);
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
        section_id: sectionId || "",
        full_name: "",
        symbol_no: "",
        dob: "",
        email: "",
        phone: "",
      });

      await qc.invalidateQueries({ queryKey: ["students", "list", sectionId] });
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
      await qc.invalidateQueries({ queryKey: ["students", "list", sectionId] });
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
          Select a section to list students, then add new students into that section.
        </p>
      </div>

      <div className="rounded-lg border p-3">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Select
            label="Section"
            value={sectionId}
            onChange={(v) => {
              setSectionId(v);
              setForm((p) => ({ ...p, section_id: v }));
            }}
            options={sectionOptions}
            placeholder={sectionsQ.isLoading ? "Loading sections..." : "Select section"}
          />

          <div className="md:col-span-2 flex items-end justify-between gap-2">
            <div className="text-xs text-muted-foreground">
              {sectionId
                ? studentsQ.isLoading
                  ? "Loading students..."
                  : `Total: ${rows.length}`
                : "Choose a section to load students."}
            </div>

            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button disabled={!sectionId}>Add Student</Button>
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
                      <label className="text-sm font-medium">DOB (YYYY-MM-DD)</label>
                      <Input
                        placeholder="2007-01-15"
                        value={form.dob}
                        onChange={(e) => setForm((p) => ({ ...p, dob: e.target.value }))}
                      />
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
            {sectionId ? `Section ID: ${sectionId}` : "No section selected"}
          </div>
        </div>

        <div className="p-3">
          {!sectionId ? (
            <div className="text-sm text-muted-foreground">Select a section to view students.</div>
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
                <label className="text-sm font-medium">DOB</label>
                <Input
                  type="date"
                  value={editForm.dob}
                  onChange={(e) => setEditForm((p) => ({ ...p, dob: e.target.value }))}
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
