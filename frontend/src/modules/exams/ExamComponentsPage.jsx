import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { api } from "../../lib/api";
import {
  EXAM_PRESETS,
  applyPresetToFlatComponents,
  buildComponentsPayloadFromFlat,
  flattenExamGroups,
  isSpecialOptionalSubject,
  toNumberOrEmpty,
} from "../../lib/examPresets";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Badge } from "../../components/ui/badge";
import { Card, CardContent } from "../../components/ui/card";
import { Separator } from "../../components/ui/separator";

export default function ExamComponentsPage() {
  const { examId } = useParams();
  const qc = useQueryClient();

  const [components, setComponents] = useState([]);
  const baselineRef = useRef([]);

  const [search, setSearch] = useState("");
  const [presetKey, setPresetKey] = useState("FIRST_TERMINAL");
  const [presetValues, setPresetValues] = useState({
    full: EXAM_PRESETS.FIRST_TERMINAL.full,
    optionalFull: EXAM_PRESETS.FIRST_TERMINAL.optionalFull,
    enableIN: EXAM_PRESETS.FIRST_TERMINAL.enableIN,
    inFull: EXAM_PRESETS.FIRST_TERMINAL.inFull,
  });

  const examQ = useQuery({
    queryKey: ["exams", "components", examId],
    enabled: !!examId,
    queryFn: async () => {
      const res = await api.get(`/api/exams/${examId}/components`);
      return res.data;
    },
  });

  useEffect(() => {
    const p = EXAM_PRESETS[presetKey] || EXAM_PRESETS.FIRST_TERMINAL;
    setPresetValues({
      full: p.full,
      optionalFull: p.optionalFull,
      enableIN: p.enableIN,
      inFull: p.inFull,
    });
  }, [presetKey]);

  useEffect(() => {
    if (!examQ.data?.groups) return;
    const flat = flattenExamGroups(examQ.data.groups || []);
    setComponents(flat);
    baselineRef.current = JSON.parse(JSON.stringify(flat));
  }, [examQ.data]);

  const exam = examQ.data?.exam || null;
  const isLocked = !!(exam?.is_locked || exam?.published_at);

  const filtered = useMemo(() => {
    const q = String(search || "").trim().toLowerCase();
    if (!q) return components;
    return components.filter((c) => {
      const hay = [
        c.subject_name,
        c.component_title,
        c.component_code,
        c.component_type,
        c.group_name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [components, search]);

  const grouped = useMemo(() => {
    const map = new Map();
    for (const c of filtered) {
      const key = `${c.subject_id}`;
      if (!map.has(key)) {
        map.set(key, {
          subject_id: c.subject_id,
          subject_name: c.subject_name,
          group_name: c.group_name,
          items: [],
        });
      }
      map.get(key).items.push(c);
    }
    return Array.from(map.values());
  }, [filtered]);

  const updateComponent = (code, patch) => {
    setComponents((prev) =>
      prev.map((c) => (c.component_code === code ? { ...c, ...patch } : c))
    );
  };

  const applyPreset = () => {
    const full = toNumberOrEmpty(presetValues.full);
    const optionalFull = toNumberOrEmpty(presetValues.optionalFull);
    const inFull = toNumberOrEmpty(presetValues.inFull);
    const enableIN = !!presetValues.enableIN;

    if (full === "" || optionalFull === "") {
      return toast.error("Full marks and optional full marks are required.");
    }

    setComponents((prev) => applyPresetToFlatComponents(prev, {
      full,
      optionalFull,
      enableIN,
      inFull,
    }));

    toast.success("Preset applied");
  };

  const resetChanges = () => {
    setComponents(JSON.parse(JSON.stringify(baselineRef.current || [])));
    toast.message("Changes reset");
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const invalid = components.filter(
        (c) => c.is_enabled && !Number.isFinite(Number(c.full_marks))
      );
      if (invalid.length > 0) {
        throw new Error("Full marks required for all enabled components.");
      }

      const payload = buildComponentsPayloadFromFlat(components);

      const res = await api.post(`/api/exams/${examId}/components`, {
        components: payload,
      });
      return res.data;
    },
    onSuccess: async () => {
      toast.success("Exam components saved");
      await qc.invalidateQueries({ queryKey: ["exams", "components", examId] });
    },
    onError: (err) => {
      toast.error(
        err?.response?.data?.message ||
          err?.message ||
          "Failed to save exam components"
      );
    },
  });

  const enabledCount = useMemo(
    () => components.filter((c) => c.is_enabled).length,
    [components]
  );

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Exam Components</h2>
          <p className="text-sm text-muted-foreground">
            Configure full marks and enable/disable components for this exam.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/exams">Back to Exams</Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-4 space-y-3">
          {examQ.isLoading ? (
            <div className="text-sm text-muted-foreground">Loading exam...</div>
          ) : examQ.isError ? (
            <div className="text-sm text-destructive">
              {examQ.error?.response?.data?.message ||
                examQ.error?.message ||
                "Failed to load exam"}
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">Exam #{exam?.id}</Badge>
              <Badge variant="secondary">{exam?.name || "—"}</Badge>
              {isLocked ? (
                <Badge variant="secondary">Locked / Published</Badge>
              ) : (
                <Badge variant="outline">Draft</Badge>
              )}
              <Badge variant="outline">Components: {components.length}</Badge>
              <Badge variant="outline">Enabled: {enabledCount}</Badge>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="text-sm font-semibold">Terminal Preset</div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="space-y-2">
              <label className="text-sm font-medium">Preset</label>
              <select
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={presetKey}
                onChange={(e) => setPresetKey(e.target.value)}
                disabled={isLocked}
              >
                {Object.entries(EXAM_PRESETS).map(([key, p]) => (
                  <option key={key} value={key}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Full Marks (TH)</label>
              <Input
                type="number"
                step="0.25"
                value={presetValues.full}
                onChange={(e) =>
                  setPresetValues((p) => ({
                    ...p,
                    full: toNumberOrEmpty(e.target.value),
                  }))
                }
                disabled={isLocked}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">
                Optional Full Marks (Computer/Hotel)
              </label>
              <Input
                type="number"
                step="0.25"
                value={presetValues.optionalFull}
                onChange={(e) =>
                  setPresetValues((p) => ({
                    ...p,
                    optionalFull: toNumberOrEmpty(e.target.value),
                  }))
                }
                disabled={isLocked}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3 items-end">
            <div className="space-y-2">
              <label className="text-sm font-medium">Include Practical/Internal (IN)</label>
              <div className="flex items-center gap-3 h-10">
                <input
                  type="checkbox"
                  checked={!!presetValues.enableIN}
                  onChange={(e) =>
                    setPresetValues((p) => ({
                      ...p,
                      enableIN: e.target.checked,
                    }))
                  }
                  disabled={isLocked}
                  className="h-4 w-4"
                />
                <span className="text-sm text-muted-foreground">
                  Enable IN / PR components
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Practical/Internal Full Marks</label>
              <Input
                type="number"
                step="0.25"
                value={presetValues.inFull}
                onChange={(e) =>
                  setPresetValues((p) => ({
                    ...p,
                    inFull: toNumberOrEmpty(e.target.value),
                  }))
                }
                disabled={isLocked || !presetValues.enableIN}
              />
            </div>

            <div className="flex md:justify-end gap-2">
              <Button
                variant="outline"
                onClick={applyPreset}
                disabled={isLocked || components.length === 0}
              >
                Apply Preset
              </Button>
              <Button
                variant="outline"
                onClick={resetChanges}
                disabled={isLocked || components.length === 0}
              >
                Reset
              </Button>
            </div>
          </div>

          <div className="text-xs text-muted-foreground">
            Optional overrides apply to subjects containing{" "}
            <span className="font-medium">Computer</span> or{" "}
            <span className="font-medium">Hotel</span> in the subject name.
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div className="text-sm font-semibold">Components</div>
            <div className="w-full md:w-[320px]">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search subject / code / type..."
              />
            </div>
          </div>

          <Separator />

          {examQ.isLoading ? (
            <div className="text-sm text-muted-foreground">Loading components...</div>
          ) : grouped.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              No components found for this exam.
            </div>
          ) : (
            <div className="space-y-3">
              {grouped.map((g) => (
                <div key={g.subject_id} className="rounded-lg border">
                  <div className="p-3 border-b flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold">
                        {g.subject_name}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Group: {g.group_name || "—"}
                      </div>
                    </div>
                    {isSpecialOptionalSubject(g.subject_name) ? (
                      <Badge variant="secondary">Optional (Computer/Hotel)</Badge>
                    ) : null}
                  </div>

                  <div className="p-3 space-y-3">
                    {g.items.map((c) => (
                      <div
                        key={c.component_code}
                        className="grid grid-cols-1 gap-3 md:grid-cols-6 md:items-center"
                      >
                        <div className="md:col-span-2">
                          <div className="text-sm font-medium">
                            {c.component_title || "Component"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Code: {c.component_code} • Type: {c.component_type}
                          </div>
                        </div>

                        <div className="md:col-span-2 grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <label className="text-xs text-muted-foreground">
                              Full Marks
                            </label>
                            <Input
                              type="number"
                              step="0.25"
                              value={c.full_marks}
                              onChange={(e) =>
                                updateComponent(c.component_code, {
                                  full_marks: toNumberOrEmpty(e.target.value),
                                })
                              }
                              disabled={isLocked}
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs text-muted-foreground">
                              Pass Marks
                            </label>
                            <Input
                              type="number"
                              step="0.25"
                              value={c.pass_marks}
                              onChange={(e) =>
                                updateComponent(c.component_code, {
                                  pass_marks: toNumberOrEmpty(e.target.value),
                                })
                              }
                              disabled={isLocked}
                            />
                          </div>
                        </div>

                        <div className="md:col-span-1">
                          <label className="text-xs text-muted-foreground">
                            Enabled
                          </label>
                          <div className="flex items-center gap-2 h-10">
                            <input
                              type="checkbox"
                              checked={!!c.is_enabled}
                              onChange={(e) =>
                                updateComponent(c.component_code, {
                                  is_enabled: e.target.checked,
                                })
                              }
                              disabled={isLocked}
                              className="h-4 w-4"
                            />
                            <span className="text-xs text-muted-foreground">
                              {c.is_enabled ? "Yes" : "No"}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button
          variant="outline"
          onClick={resetChanges}
          disabled={isLocked || components.length === 0}
        >
          Reset Changes
        </Button>
        <Button
          onClick={() => saveMutation.mutate()}
          disabled={isLocked || saveMutation.isPending || components.length === 0}
        >
          {saveMutation.isPending ? "Saving..." : "Save Components"}
        </Button>
      </div>

      {isLocked ? (
        <div className="text-xs text-muted-foreground">
          Exam is locked/published. Editing is disabled.
        </div>
      ) : null}
    </div>
  );
}
