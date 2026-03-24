const STAGE_META = {
  DRAFT: {
    label: "Draft",
    itemClass: "border-slate-200 bg-slate-50 hover:bg-slate-100/80",
    badgeClass: "border-slate-300 bg-slate-100 text-slate-700",
  },
  SUBMITTED: {
    label: "Submitted",
    itemClass: "border-sky-200 bg-sky-50 hover:bg-sky-100/80",
    badgeClass: "border-sky-300 bg-sky-100 text-sky-700",
  },
  PENDING_VERIFY: {
    label: "Pending Verify",
    itemClass: "border-amber-200 bg-amber-50 hover:bg-amber-100/80",
    badgeClass: "border-amber-300 bg-amber-100 text-amber-800",
  },
  VERIFIED: {
    label: "Verified",
    itemClass: "border-indigo-200 bg-indigo-50 hover:bg-indigo-100/80",
    badgeClass: "border-indigo-300 bg-indigo-100 text-indigo-700",
  },
  PENDING_APPROVE: {
    label: "Pending Approve",
    itemClass: "border-violet-200 bg-violet-50 hover:bg-violet-100/80",
    badgeClass: "border-violet-300 bg-violet-100 text-violet-700",
  },
  APPROVED: {
    label: "Approved",
    itemClass: "border-emerald-200 bg-emerald-50 hover:bg-emerald-100/80",
    badgeClass: "border-emerald-300 bg-emerald-100 text-emerald-700",
  },
  REJECTED: {
    label: "Rejected",
    itemClass: "border-rose-200 bg-rose-50 hover:bg-rose-100/80",
    badgeClass: "border-rose-300 bg-rose-100 text-rose-700",
  },
  INFO: {
    label: "Info",
    itemClass: "border-border bg-background hover:bg-muted/60",
    badgeClass: "border-border bg-muted text-muted-foreground",
  },
};

function normalizeStage(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");
}

export function isOtNotification(notification) {
  const category = String(notification?.category || "").trim().toUpperCase();
  const type = String(notification?.type || "").trim().toUpperCase();
  return category === "OT" || type.startsWith("OT_");
}

export function getNotificationStage(notification) {
  const explicit = normalizeStage(notification?.stage);
  if (explicit) return explicit;

  const type = String(notification?.type || "").trim().toUpperCase();
  const title = String(notification?.title || "").trim().toUpperCase();

  if (type === "OT_VERIFY") return "PENDING_VERIFY";
  if (type === "OT_APPROVE") return "PENDING_APPROVE";
  if (type === "OT_DRAFT") return "DRAFT";
  if (type === "OT_SUBMITTED") return "SUBMITTED";
  if (type === "OT_STATUS") {
    if (title.includes("APPROVED")) return "APPROVED";
    if (title.includes("REJECTED")) return "REJECTED";
  }
  if (type === "WORKFLOW_VERIFY") return "PENDING_VERIFY";
  if (type === "WORKFLOW_APPROVE") return "PENDING_APPROVE";
  if (type === "WORKFLOW_PUBLISH") return "APPROVED";

  return "INFO";
}

export function getNotificationStageMeta(notification) {
  const stage = getNotificationStage(notification);
  const meta = STAGE_META[stage] || STAGE_META.INFO;
  return {
    stage,
    label: meta.label,
    itemClass: meta.itemClass,
    badgeClass: meta.badgeClass,
  };
}
