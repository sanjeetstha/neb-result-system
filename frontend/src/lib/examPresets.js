export const EXAM_PRESETS = {
  FIRST_TERMINAL: {
    key: "FIRST_TERMINAL",
    label: "First Terminal",
    full: 50,
    optionalFull: 50,
    pass: 17.5,
    optionalPass: 17.5,
    enableIN: false,
    enablePR: false,
    inFull: 0,
    prFull: 0,
  },
  SECOND_TERMINAL: {
    key: "SECOND_TERMINAL",
    label: "Second Terminal",
    full: 75,
    optionalFull: 50,
    pass: 17.5,
    optionalPass: 17.5,
    enableIN: false,
    enablePR: false,
    inFull: 0,
    prFull: 0,
  },
  PRE_BOARD: {
    key: "PRE_BOARD",
    label: "Pre-Board",
    full: 75,
    optionalFull: 75,
    pass: 26.25,
    optionalPass: 26.25,
    enableIN: false,
    enablePR: false,
    inFull: 0,
    prFull: 25,
  },
  CUSTOM: {
    key: "CUSTOM",
    label: "Custom",
    full: "",
    optionalFull: "",
    pass: "",
    optionalPass: "",
    enableIN: false,
    enablePR: false,
    inFull: "",
    prFull: "",
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

export function detectClassLevel(classLabel) {
  const s = String(classLabel || "").toLowerCase();
  if (!s) return null;
  if (s.includes("11")) return 11;
  if (s.includes("12")) return 12;
  return null;
}

export function getExamTermPolicy(presetKey, classLabel) {
  const level = detectClassLevel(classLabel);
  const isPlusTwo = level === 11 || level === 12;

  const policy = {
    forceEnableIN: null,
    forceEnablePR: null,
    showINToggle: true,
    showPRToggle: true,
    note: "",
  };

  if (!isPlusTwo) return policy;

  if (presetKey === "FIRST_TERMINAL") {
    return {
      ...policy,
      forceEnableIN: false,
      forceEnablePR: false,
      showINToggle: false,
      showPRToggle: false,
      note: "First Terminal (+2) uses TH only. Internal and Practical are disabled.",
    };
  }

  if (presetKey === "SECOND_TERMINAL") {
    return {
      ...policy,
      forceEnableIN: false,
      showINToggle: false,
      showPRToggle: true,
      note: "Second Terminal (+2) disables Internal. Practical can be configured if needed.",
    };
  }

  if (presetKey === "PRE_BOARD") {
    if (level === 11) {
      return {
        ...policy,
        forceEnableIN: false,
        forceEnablePR: true,
        showINToggle: false,
        showPRToggle: false,
        note: "Class 11 Pre-Board uses TH + PR. Internal is disabled.",
      };
    }
    if (level === 12) {
      return {
        ...policy,
        forceEnableIN: false,
        forceEnablePR: false,
        showINToggle: false,
        showPRToggle: false,
        note: "Class 12 Pre-Board uses TH only in this system.",
      };
    }
  }

  return policy;
}

export function getPresetDefaults(presetKey, classLabel) {
  const base = EXAM_PRESETS[presetKey] || EXAM_PRESETS.FIRST_TERMINAL;
  const policy = getExamTermPolicy(presetKey, classLabel);

  let enableIN = !!base.enableIN;
  let enablePR = base.enablePR == null ? !!base.enableIN : !!base.enablePR;

  if (policy.forceEnableIN !== null) enableIN = !!policy.forceEnableIN;
  if (policy.forceEnablePR !== null) enablePR = !!policy.forceEnablePR;

  return {
    ...base,
    enableIN,
    enablePR,
    inFull: base.inFull ?? "",
    prFull: base.prFull ?? base.inFull ?? "",
  };
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
  const prFull = toNumberOrEmpty(preset.prFull ?? preset.inFull);
  const pass = toNumberOrEmpty(preset.pass);
  const optionalPass = toNumberOrEmpty(preset.optionalPass);
  const enableIN = !!preset.enableIN;
  const enablePR = preset.enablePR == null ? !!preset.enableIN : !!preset.enablePR;

  return (list || []).map((c) => {
    const isSpecial = isSpecialOptionalSubject(c.subject_name);
    const passMarks =
      c.component_type === "TH"
        ? (isSpecial ? optionalPass : pass)
        : "";

    if (c.component_type === "TH") {
      return {
        ...c,
        full_marks: isSpecial ? optionalFull : full,
        pass_marks: passMarks === "" ? c.pass_marks : passMarks,
        is_enabled: true,
      };
    }

    if (c.component_type === "IN") {
      if (!enableIN) {
        return { ...c, is_enabled: false };
      }

      return {
        ...c,
        full_marks: inFull === "" ? c.full_marks : inFull,
        is_enabled: true,
      };
    }

    if (c.component_type === "PR") {
      if (!enablePR) {
        return { ...c, is_enabled: false };
      }
      return {
        ...c,
        full_marks: prFull === "" ? c.full_marks : prFull,
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
