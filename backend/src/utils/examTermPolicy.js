function detectClassLevel(classLabel) {
  const s = String(classLabel || "").toLowerCase();
  if (!s) return null;
  if (s.includes("11")) return 11;
  if (s.includes("12")) return 12;
  return null;
}

function getExamTermPolicy(examType, classLabel) {
  const level = detectClassLevel(classLabel);
  const isPlusTwo = level === 11 || level === 12;

  const policy = {
    forceEnableIN: null,
    forceEnablePR: null,
  };

  if (!isPlusTwo) return policy;

  if (examType === "FIRST_TERMINAL") {
    return { forceEnableIN: false, forceEnablePR: false };
  }

  if (examType === "SECOND_TERMINAL") {
    return { forceEnableIN: false, forceEnablePR: null };
  }

  if (examType === "PRE_BOARD") {
    if (level === 11) {
      return { forceEnableIN: false, forceEnablePR: true };
    }
    if (level === 12) {
      return { forceEnableIN: false, forceEnablePR: false };
    }
  }

  return policy;
}

module.exports = { detectClassLevel, getExamTermPolicy };

