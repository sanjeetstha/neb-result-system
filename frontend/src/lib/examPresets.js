export const EXAM_PRESETS = {
  FIRST_TERMINAL: {
    key: "FIRST_TERMINAL",
    label: "First Terminal",
    full: 50,
    optionalFull: 17.5,
    enableIN: false,
    inFull: 0,
  },
  SECOND_TERMINAL: {
    key: "SECOND_TERMINAL",
    label: "Second Terminal",
    full: 75,
    optionalFull: 50,
    enableIN: false,
    inFull: 0,
  },
  PRE_BOARD: {
    key: "PRE_BOARD",
    label: "Pre-Board",
    full: 75,
    optionalFull: 50,
    enableIN: true,
    inFull: 25,
  },
  CUSTOM: {
    key: "CUSTOM",
    label: "Custom",
    full: "",
    optionalFull: "",
    enableIN: false,
    inFull: "",
  },
};

export function isSpecialOptionalSubject(name) {
  const s = String(name || "").toLowerCase();
  return s.includes("computer") || s.includes("hotel");
}

export function toNumberOrEmpty(v) {
  const s = String(v ?? "").trim();
  if (s === "") return "";
  const n = Number(s);
  return Number.isFinite(n) ? n : "";
}

export function flattenExamGroups(groups) {
  const flat = [];
  for (const g of groups || []) {
    for (const s of g.subjects || []) {
      for (const c of s.components || []) {
        flat.push({
          group_name: g.name,
          subject_id: s.id,
          subject_name: s.name,
          component_code: String(c.component_code),
          component_type: c.component_type,
          component_title: c.component_title,
          credit_hour: c.credit_hour,
          full_marks: c.full_marks ?? "",
          pass_marks: c.pass_marks ?? "",
          is_enabled: !!c.is_enabled,
        });
      }
    }
  }
  return flat;
}

export function applyPresetToFlatComponents(list, preset) {
  const full = toNumberOrEmpty(preset.full);
  const optionalFull = toNumberOrEmpty(preset.optionalFull);
  const inFull = toNumberOrEmpty(preset.inFull);
  const enableIN = !!preset.enableIN;

  return (list || []).map((c) => {
    const isSpecial = isSpecialOptionalSubject(c.subject_name);

    if (c.component_type === "TH") {
      return {
        ...c,
        full_marks: isSpecial ? optionalFull : full,
        is_enabled: true,
      };
    }

    if (c.component_type === "IN" || c.component_type === "PR") {
      if (!enableIN) {
        return { ...c, is_enabled: false };
      }

      return {
        ...c,
        full_marks: inFull === "" ? c.full_marks : inFull,
        is_enabled: true,
      };
    }

    return c;
  });
}

export function buildComponentsPayloadFromFlat(list) {
  return (list || [])
    .filter((c) => Number.isFinite(Number(c.full_marks)))
    .map((c) => ({
      component_code: c.component_code,
      full_marks: Number(c.full_marks),
      pass_marks:
        c.pass_marks === "" || c.pass_marks == null
          ? null
          : Number(c.pass_marks),
      is_enabled: !!c.is_enabled,
    }));
}
