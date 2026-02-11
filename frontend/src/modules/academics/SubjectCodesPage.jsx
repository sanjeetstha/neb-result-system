import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { api } from "../../lib/api";
import { useMe } from "../../lib/useMe";
import { Card, CardContent } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Badge } from "../../components/ui/badge";

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
        {(options || []).map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function getThCode(subject) {
  const th = (subject?.components || []).find((c) => c.component_type === "TH");
  return String(th?.component_code || "").trim();
}

function sortOptGroups(groups) {
  const getRank = (name) => {
    const s = String(name || "").toLowerCase();
    if (s.includes("1")) return 1;
    if (s.includes("2")) return 2;
    if (s.includes("3")) return 3;
    if (s.includes("4")) return 4;
    return 99;
  };
  return [...groups].sort((a, b) => {
    const ra = getRank(a.name);
    const rb = getRank(b.name);
    if (ra !== rb) return ra - rb;
    return Number(a.sort_order || 0) - Number(b.sort_order || 0);
  });
}

export default function SubjectCodesPage() {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const canShift = me?.role === "SUPER_ADMIN";

  const [academicYearId, setAcademicYearId] = useState("");
  const [classId, setClassId] = useState("");
  const [query, setQuery] = useState("");
  const [targetBySubject, setTargetBySubject] = useState({});
  const [dragging, setDragging] = useState(null); // { subject_id, from_group, name }
  const [dropGroupName, setDropGroupName] = useState("");
  const [dragPos, setDragPos] = useState({ x: 0, y: 0 });
  const [recentShift, setRecentShift] = useState(null); // { subject_id, to_group_name, at }

  const yearsQ = useQuery({
    queryKey: ["masters", "academic-years"],
    queryFn: async () => {
      const res = await api.get("/api/masters/academic-years");
      const data = res.data?.academic_years ?? res.data?.data ?? [];
      return Array.isArray(data) ? data : [];
    },
    staleTime: 60_000,
  });

  const classesQ = useQuery({
    queryKey: ["masters", "classes"],
    queryFn: async () => {
      const res = await api.get("/api/masters/classes");
      const data = res.data?.classes ?? res.data?.data ?? [];
      return Array.isArray(data) ? data : [];
    },
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!academicYearId && yearsQ.data?.length) {
      setAcademicYearId(String(yearsQ.data[0].id));
    }
  }, [academicYearId, yearsQ.data]);

  useEffect(() => {
    if (!classId && classesQ.data?.length) {
      setClassId(String(classesQ.data[0].id));
    }
  }, [classId, classesQ.data]);

  const yearOptions = useMemo(
    () =>
      (yearsQ.data || []).map((y) => ({
        value: String(y.id),
        label: String(y.year_bs || y.year_ad || y.id),
      })),
    [yearsQ.data]
  );

  const classOptions = useMemo(
    () =>
      (classesQ.data || []).map((c) => ({
        value: String(c.id),
        label: String(c.name || c.id),
      })),
    [classesQ.data]
  );

  const catalogQ = useQuery({
    queryKey: ["masters", "subject-catalog", academicYearId, classId],
    enabled: !!academicYearId && !!classId,
    queryFn: async () => {
      const params = new URLSearchParams({
        academic_year_id: academicYearId,
        class_id: classId,
      });
      const res = await api.get(`/api/masters/subject-catalog?${params.toString()}`);
      return res.data || {};
    },
    staleTime: 20_000,
  });

  const optionalGroups = useMemo(() => {
    const groups = Array.isArray(catalogQ.data?.groups) ? catalogQ.data.groups : [];
    return sortOptGroups(
      groups.filter((g) => String(g.name || "").toLowerCase().startsWith("opt"))
    );
  }, [catalogQ.data]);

  const filteredGroups = useMemo(() => {
    const q = String(query || "").trim().toLowerCase();
    if (!q) return optionalGroups;
    return optionalGroups
      .map((g) => ({
        ...g,
        subjects: (g.subjects || []).filter((s) => {
          const code = getThCode(s);
          const hay = `${s.name || ""} ${code}`.toLowerCase();
          return hay.includes(q);
        }),
      }))
      .filter((g) => (g.subjects || []).length > 0);
  }, [optionalGroups, query]);

  useEffect(() => {
    setTargetBySubject({});
  }, [academicYearId, classId, catalogQ.data]);

  const shiftMutation = useMutation({
    mutationFn: async ({ subject_id, to_group_name }) => {
      const payload = {
        academic_year_id: Number(academicYearId),
        class_id: Number(classId),
        subject_id,
        to_group_name,
      };
      const res = await api.post("/api/masters/subject-codes/shift", payload);
      return res.data;
    },
    onSuccess: async () => {
      toast.success("Subject shifted");
      setTargetBySubject({});
      if (dragging?.subject_id && dropGroupName) {
        setRecentShift({
          subject_id: Number(dragging.subject_id),
          to_group_name: dropGroupName,
          at: Date.now(),
        });
      }
      await qc.invalidateQueries({
        queryKey: ["masters", "subject-catalog", academicYearId, classId],
      });
    },
    onError: (err) => {
      toast.error(err?.response?.data?.message || err.message || "Failed to shift subject");
    },
  });

  const runShift = (subject_id, to_group_name) => {
    setRecentShift({
      subject_id: Number(subject_id),
      to_group_name,
      at: Date.now(),
    });
    shiftMutation.mutate({
      subject_id: Number(subject_id),
      to_group_name,
    });
  };

  useEffect(() => {
    if (!recentShift) return undefined;
    const t = setTimeout(() => setRecentShift(null), 1800);
    return () => clearTimeout(t);
  }, [recentShift]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Subject Codes</h2>
        <p className="text-sm text-muted-foreground">
          Manage optional subject code categories (Opt. 1st to Opt. 4th). Other modules read this
          catalog, so shifts are reflected automatically.
        </p>
      </div>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <Select
              label="Academic Year"
              value={academicYearId}
              onChange={setAcademicYearId}
              options={yearOptions}
              placeholder={yearsQ.isLoading ? "Loading years..." : "Select year"}
            />
            <Select
              label="Class"
              value={classId}
              onChange={setClassId}
              options={classOptions}
              placeholder={classesQ.isLoading ? "Loading classes..." : "Select class"}
            />
            <div className="space-y-2">
              <label className="text-sm font-medium">Search Subject</label>
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Name or TH code..."
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">Optional Groups: {optionalGroups.length}</Badge>
            <Badge variant="outline">
              Subjects: {optionalGroups.reduce((acc, g) => acc + (g.subjects?.length || 0), 0)}
            </Badge>
            {canShift ? (
              <Badge variant="secondary">Shift enabled (SUPER_ADMIN)</Badge>
            ) : (
              <Badge variant="outline">Read-only (only SUPER_ADMIN can shift)</Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {!academicYearId || !classId ? (
        <div className="text-sm text-muted-foreground">Select academic year and class.</div>
      ) : catalogQ.isLoading ? (
        <div className="text-sm text-muted-foreground">Loading subject catalog...</div>
      ) : catalogQ.isError ? (
        <div className="text-sm text-destructive">
          Failed to load catalog:{" "}
          {catalogQ.error?.response?.data?.message || catalogQ.error?.message || "Unknown error"}
        </div>
      ) : filteredGroups.length === 0 ? (
        <div className="text-sm text-muted-foreground">No optional subjects found.</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {filteredGroups.map((group) => (
            <Card
              key={group.id || group.name}
              className={
                dropGroupName === group.name
                  ? "ring-2 ring-primary/70 border-primary scale-[1.01] shadow-md bg-primary/5"
                  : "transition-all duration-200"
              }
              onDragOver={(e) => {
                if (!canShift || !dragging || shiftMutation.isPending) return;
                if (dragging.from_group === group.name) return;
                e.preventDefault();
                setDropGroupName(group.name);
              }}
              onDragLeave={() => {
                if (dropGroupName === group.name) setDropGroupName("");
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (!canShift || !dragging || shiftMutation.isPending) return;
                if (dragging.from_group === group.name) {
                  setDropGroupName("");
                  setDragging(null);
                  return;
                }
                runShift(dragging.subject_id, group.name);
                setDropGroupName("");
                setDragging(null);
              }}
            >
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="font-semibold">{group.name}</div>
                  <div className="flex items-center gap-2">
                    {dragging && dragging.from_group !== group.name ? (
                      <Badge variant={dropGroupName === group.name ? "secondary" : "outline"}>
                        {dropGroupName === group.name ? "Release to Drop" : "Drop Here"}
                      </Badge>
                    ) : null}
                    <Badge variant="outline">Subjects: {(group.subjects || []).length}</Badge>
                  </div>
                </div>
                {canShift ? (
                  <div className="text-xs text-muted-foreground">
                    Drag a subject here from another optional group.
                  </div>
                ) : null}

                <div className="space-y-2">
                  {(group.subjects || []).map((s) => {
                    const code = getThCode(s);
                    const target = targetBySubject[s.id] || "";
                    const targetOptions = optionalGroups
                      .map((g) => g.name)
                      .filter((gName) => gName !== group.name);

                    return (
                      <div
                        key={`${group.name}-${s.id}`}
                        className={[
                          "rounded-md border p-2 grid grid-cols-1 gap-2 md:grid-cols-[1fr_170px_auto]",
                          "transition-all duration-300",
                          dragging?.subject_id === Number(s.id)
                            ? "opacity-60 scale-[0.98] shadow-sm border-primary/50"
                            : "",
                          recentShift?.subject_id === Number(s.id) &&
                          recentShift?.to_group_name === group.name
                            ? "bg-emerald-50/70 border-emerald-400 ring-1 ring-emerald-300 animate-pulse"
                            : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        draggable={canShift && !shiftMutation.isPending}
                        onDragStart={(e) => {
                          if (!canShift || shiftMutation.isPending) return;
                          e.dataTransfer.effectAllowed = "move";
                          setDragPos({ x: e.clientX, y: e.clientY });
                          setDragging({
                            subject_id: Number(s.id),
                            from_group: group.name,
                            name: s.name,
                          });
                        }}
                        onDrag={(e) => {
                          if (e.clientX > 0 && e.clientY > 0) {
                            setDragPos({ x: e.clientX, y: e.clientY });
                          }
                        }}
                        onDragEnd={() => {
                          setDragging(null);
                          setDropGroupName("");
                        }}
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate flex items-center gap-2">
                            <span>{s.name}</span>
                            {recentShift?.subject_id === Number(s.id) &&
                            recentShift?.to_group_name === group.name ? (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-600 text-white">
                                Moved
                              </span>
                            ) : null}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            TH Code: {code || "—"}
                          </div>
                        </div>

                        <select
                          className="h-9 rounded-md border bg-background px-2 text-sm"
                          value={target}
                          disabled={!canShift || shiftMutation.isPending || targetOptions.length === 0}
                          onChange={(e) =>
                            setTargetBySubject((prev) => ({
                              ...prev,
                              [s.id]: e.target.value,
                            }))
                          }
                        >
                          <option value="">Move to...</option>
                          {targetOptions.map((gName) => (
                            <option key={`${s.id}-${gName}`} value={gName}>
                              {gName}
                            </option>
                          ))}
                        </select>

                        <Button
                          size="sm"
                          disabled={!canShift || !target || shiftMutation.isPending}
                          onClick={() =>
                            runShift(Number(s.id), target)
                          }
                        >
                          Shift
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      {dragging && canShift ? (
        <div
          className="fixed z-[120] pointer-events-none rounded-md border bg-background/95 px-3 py-1.5 shadow-lg text-xs"
          style={{
            left: `${dragPos.x + 14}px`,
            top: `${dragPos.y + 14}px`,
          }}
        >
          Moving: <span className="font-medium">{dragging.name}</span>
          <div className="text-[10px] text-muted-foreground">
            From {dragging.from_group}
            {dropGroupName ? ` -> ${dropGroupName}` : ""}
          </div>
        </div>
      ) : null}
    </div>
  );
}
