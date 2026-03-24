import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  BadgeCheck,
  CalendarDays,
  BriefcaseBusiness,
  Clock3,
  FilePlus2,
  Printer,
  ShieldCheck,
  WalletCards,
  XCircle,
  Bell,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

import { api } from "../../lib/api";
import { useMe } from "../../lib/useMe";
import { getAppSettings } from "../../lib/appSettings";
import { formatLocalDateToIso, parseIsoDateParts, todayLocalIsoDate } from "../../lib/date";
import { getNotificationStageMeta, isOtNotification } from "../../lib/notifications";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Card, CardContent } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import NepaliCalendar from "../../components/calendar/NepaliCalendar";
import { adToBs, formatBsDateLong } from "../../components/calendar/nepaliCalendarEngine";
import NepaliMonthPicker, {
  currentBsMonthKey,
  formatNepaliMonthKey,
} from "../../components/calendar/NepaliMonthPicker";

function norm(v) {
  return String(v ?? "").trim();
}

function normalizeMonthKey(value) {
  const s = norm(value);
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(s) ? s : "";
}

function readErr(err, fallback) {
  return err?.response?.data?.message || err?.message || fallback;
}

function statusBadgeVariant(status) {
  if (status === "APPROVED" || status === "PAID") return "secondary";
  if (status === "REJECTED") return "destructive";
  if (status === "VERIFIED") return "default";
  return "outline";
}

function escapeHtml(raw) {
  return String(raw ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatOtDateForPrint(isoDate) {
  const parsed = parseIsoDateParts(String(isoDate || "").slice(0, 10));
  if (!parsed) return String(isoDate || "—");
  return `${parsed.year}-${String(parsed.month).padStart(2, "0")}-${String(parsed.day).padStart(2, "0")}`;
}

function formatOtTimeForPrint(rawTime) {
  const t = String(rawTime || "").slice(0, 5);
  if (!/^\d{2}:\d{2}$/.test(t)) return String(rawTime || "—");
  const [h, m] = t.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const hh = ((h + 11) % 12) + 1;
  return `${String(hh).padStart(2, "0")}:${String(m).padStart(2, "0")} ${suffix}`;
}

function bsMonthKeyFromAdIso(isoDate) {
  try {
    if (!isoDate) return "";
    const bs = adToBs(String(isoDate).slice(0, 10));
    return `${bs.year}-${String(bs.month).padStart(2, "0")}`;
  } catch {
    return "";
  }
}

function parseHmToMinutes(hm) {
  const m = String(hm || "").trim().match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function addMinutesToHm(hm, deltaMinutes) {
  const minutes = parseHmToMinutes(hm);
  if (minutes == null) return "";
  const next = Math.max(0, Math.min(23 * 60 + 59, minutes + Number(deltaMinutes || 0)));
  const h = Math.floor(next / 60);
  const m = next % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function round2(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function timeAgo(input) {
  if (!input) return "";
  const stamp = new Date(input).getTime();
  if (!Number.isFinite(stamp)) return "";
  const diff = Math.max(0, Date.now() - stamp);
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function buildOtPreview(itemForm, policy) {
  const workDate = String(itemForm?.work_date || "").slice(0, 10);
  const startMinutes = parseHmToMinutes(itemForm?.start_time);
  const endMinutes = parseHmToMinutes(itemForm?.end_time);
  const claimMonth = bsMonthKeyFromAdIso(workDate);

  if (!workDate) {
    return {
      valid: false,
      message: "Select a work date first.",
      claimMonth,
      hours: 0,
      amount: 0,
      multiplier: 1,
      rateTypeLabel: "Regular",
    };
  }

  if (startMinutes == null || endMinutes == null) {
    return {
      valid: false,
      message: "Enter a valid start and end time.",
      claimMonth,
      hours: 0,
      amount: 0,
      multiplier: 1,
      rateTypeLabel: "Regular",
    };
  }

  if (endMinutes <= startMinutes) {
    return {
      valid: false,
      message: "End time must be later than start time.",
      claimMonth,
      hours: 0,
      amount: 0,
      multiplier: 1,
      rateTypeLabel: "Regular",
    };
  }

  const breakMinutes = Math.max(0, Math.floor(Number(itemForm?.break_minutes || 0)));
  const rawMinutes = endMinutes - startMinutes - breakMinutes;
  if (rawMinutes <= 0) {
    return {
      valid: false,
      message: "Break time is larger than the selected OT time.",
      claimMonth,
      hours: 0,
      amount: 0,
      multiplier: 1,
      rateTypeLabel: "Regular",
    };
  }

  const rounding = Math.max(1, Math.floor(Number(policy?.rounding_minutes || 15)));
  const roundedMinutes = Math.max(0, Math.round(rawMinutes / rounding) * rounding);
  const capHours = Math.max(0.5, Number(policy?.daily_cap_hours || 8));
  const cappedMinutes = Math.min(roundedMinutes, Math.floor(capHours * 60));
  const parsedDate = parseIsoDateParts(workDate);
  const adDate = parsedDate
    ? new Date(parsedDate.year, parsedDate.month - 1, parsedDate.day, 12, 0, 0, 0)
    : null;
  const isHoliday = !!itemForm?.is_holiday;
  const isSaturday = adDate ? adDate.getDay() === 6 : false;
  const isWeekend = isHoliday ? false : isSaturday;
  const multiplier = isHoliday
    ? Math.max(1, Number(policy?.holiday_multiplier || 2))
    : isWeekend
    ? Math.max(1, Number(policy?.weekend_multiplier || 1.5))
    : 1;
  const hours = round2(cappedMinutes / 60);
  const hourlyRate = Math.max(0, Number(policy?.hourly_rate || 0));
  const amount = round2(hours * hourlyRate * multiplier);

  return {
    valid: true,
    message: "",
    claimMonth,
    hours,
    amount,
    multiplier,
    rateTypeLabel: isHoliday ? "Holiday" : isWeekend ? "Saturday" : "Regular",
  };
}

const DURATION_PRESETS = [
  { label: "+2h", minutes: 120 },
  { label: "+3h", minutes: 180 },
  { label: "+4h", minutes: 240 },
];

const NOTIFICATION_STAGE_ORDER = [
  "PENDING_VERIFY",
  "PENDING_APPROVE",
  "SUBMITTED",
  "DRAFT",
  "APPROVED",
  "REJECTED",
  "INFO",
];

const SCOPE_OPTIONS = [
  { value: "my", label: "My Claims" },
  { value: "pending_verify", label: "Pending Verify" },
  { value: "pending_approve", label: "Pending Approve" },
  { value: "all", label: "All Claims" },
];

export default function OtClaimsPage() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const meQ = useMe();
  const me = meQ.data || null;
  const role = String(me?.role || "").toUpperCase();
  const canAccessOt = [
    "SUPER_ADMIN",
    "ADMIN",
    "FINANCE",
    "TEACHER",
    "CAMPUS_CHIEF",
  ].includes(role);
  const canManagePolicy = ["SUPER_ADMIN", "ADMIN"].includes(role);

  const [searchParams, setSearchParams] = useSearchParams();
  const queryScope = norm(searchParams.get("scope")) || "my";
  const queryStatus = norm(searchParams.get("status"));
  const queryMonth = normalizeMonthKey(searchParams.get("month")) || currentBsMonthKey();
  const queryClaimId = Number(searchParams.get("claim_id") || 0);

  const [scope, setScope] = useState(queryScope);
  const [status, setStatus] = useState(queryStatus);
  const [month, setMonth] = useState(queryMonth);
  const [selectedClaimId, setSelectedClaimId] = useState(queryClaimId);

  const [claimMonthForm, setClaimMonthForm] = useState("");
  const [claimNoteForm, setClaimNoteForm] = useState("");
  const [decisionNote, setDecisionNote] = useState("");

  const [itemForm, setItemForm] = useState({
    work_date: todayLocalIsoDate(),
    start_time: "16:00",
    end_time: "18:00",
    break_minutes: "0",
    is_holiday: false,
    reason: "",
  });
  const [isBsCalendarOpen, setIsBsCalendarOpen] = useState(false);
  const [isOtInboxExpanded, setIsOtInboxExpanded] = useState(false);

  const dashboardQ = useQuery({
    queryKey: ["ot", "dashboard"],
    queryFn: async () => {
      const res = await api.get("/api/ot/dashboard");
      return res.data?.summary || {};
    },
    staleTime: 60_000,
    enabled: canAccessOt,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const claimsQ = useQuery({
    queryKey: ["ot", "claims", scope, status, month],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("scope", scope);
      if (status) params.set("status", status);
      if (month) params.set("month", month);
      const res = await api.get(`/api/ot/claims?${params.toString()}`);
      return Array.isArray(res.data?.claims) ? res.data.claims : [];
    },
    staleTime: 60_000,
    enabled: canAccessOt,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const selectedClaimQ = useQuery({
    queryKey: ["ot", "claim", selectedClaimId],
    queryFn: async () => {
      const res = await api.get(`/api/ot/claims/${selectedClaimId}`);
      return res.data;
    },
    enabled: canAccessOt && !!selectedClaimId,
    staleTime: 15 * 60_000,
    gcTime: 30 * 60_000,
    retry: false,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchInterval: false,
  });

  const policyQ = useQuery({
    queryKey: ["ot", "policy", "active"],
    queryFn: async () => {
      const res = await api.get("/api/ot/policy/active");
      return res.data?.policy || null;
    },
    staleTime: 60_000,
    enabled: canAccessOt,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const otNotificationsQ = useQuery({
    queryKey: ["notifications", "ot-page", me?.id, me?.role],
    enabled: canAccessOt && !!me?.id,
    staleTime: 60_000,
    refetchInterval: 120_000,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: async () => {
      const res = await api.get("/api/notifications", {
        params: { limit: 16 },
      });
      const notifications = Array.isArray(res.data?.notifications)
        ? res.data.notifications.filter((n) => isOtNotification(n))
        : [];
      return notifications;
    },
  });

  const refreshCore = () => {
    qc.invalidateQueries({ queryKey: ["ot", "dashboard"] });
    qc.invalidateQueries({ queryKey: ["ot", "claims"] });
    qc.invalidateQueries({ queryKey: ["notifications"] });
  };

  const createClaimMutation = useMutation({
    mutationFn: async (payload = {}) => {
      const res = await api.post("/api/ot/claims", {
        claim_month: payload.claim_month || month || undefined,
        note: payload.note || undefined,
      });
      return res.data;
    },
    onSuccess: (data) => {
      const id = Number(data?.claim?.id || 0);
      if (id) setSelectedClaimId(id);
      refreshCore();
      toast.success("OT claim created");
    },
    onError: (err) => toast.error(readErr(err, "Failed to create OT claim")),
  });

  const updateClaimMutation = useMutation({
    mutationFn: async () => {
      const res = await api.put(`/api/ot/claims/${selectedClaimId}`, {
        claim_month: claimMonthForm,
        note: claimNoteForm,
      });
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ot", "claim", selectedClaimId] });
      qc.invalidateQueries({ queryKey: ["ot", "claims"] });
      toast.success("Claim details updated");
    },
    onError: (err) => toast.error(readErr(err, "Failed to update claim")),
  });

  const addItemMutation = useMutation({
    mutationFn: async ({ claimId }) => {
      const payload = {
        ...itemForm,
        break_minutes: Number(itemForm.break_minutes || 0),
      };
      const res = await api.post(`/api/ot/claims/${claimId}/items`, payload);
      return res.data;
    },
    onSuccess: (data, vars) => {
      const targetClaimId = Number(data?.claim?.id || vars?.claimId || selectedClaimId || 0);
      if (targetClaimId) {
        setSelectedClaimId(targetClaimId);
        qc.invalidateQueries({ queryKey: ["ot", "claim", targetClaimId] });
      }
      qc.invalidateQueries({ queryKey: ["ot", "claims"] });
      qc.invalidateQueries({ queryKey: ["ot", "dashboard"] });
      setItemForm((p) => ({ ...p, reason: "", is_holiday: false }));
      toast.success("OT entry added");
    },
    onError: (err) => toast.error(readErr(err, "Failed to add OT entry")),
  });

  const removeItemMutation = useMutation({
    mutationFn: async (itemId) => {
      const res = await api.delete(`/api/ot/claims/${selectedClaimId}/items/${itemId}`);
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ot", "claim", selectedClaimId] });
      qc.invalidateQueries({ queryKey: ["ot", "claims"] });
      qc.invalidateQueries({ queryKey: ["ot", "dashboard"] });
      toast.success("OT entry removed");
    },
    onError: (err) => toast.error(readErr(err, "Failed to remove OT entry")),
  });

  const doAction = useMutation({
    mutationFn: async ({ action, note }) => {
      const actionMap = {
        submit: "submit",
        verify: "verify",
        approve: "approve",
        reject: "reject",
        reopen: "reopen",
      };
      const path = actionMap[action];
      const res = await api.post(`/api/ot/claims/${selectedClaimId}/${path}`, {
        note: note || undefined,
      });
      return res.data;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["ot", "claim", selectedClaimId] });
      refreshCore();
      setDecisionNote("");
      toast.success(
        vars.action === "submit"
          ? "Claim submitted for verification"
          : vars.action === "verify"
          ? "Claim verified"
          : vars.action === "approve"
          ? "Claim approved"
          : vars.action === "reject"
          ? "Claim rejected"
          : "Claim reopened"
      );
    },
    onError: (err) => toast.error(readErr(err, "Action failed")),
  });

  useEffect(() => {
    const next = new URLSearchParams();
    if (scope) next.set("scope", scope);
    if (status) next.set("status", status);
    if (month) next.set("month", month);
    if (selectedClaimId) next.set("claim_id", String(selectedClaimId));
    const nextSearch = next.toString();
    const currentSearch = searchParams.toString();
    if (nextSearch === currentSearch) return;
    setSearchParams(next, { replace: true });
  }, [scope, status, month, selectedClaimId, searchParams, setSearchParams]);

  useEffect(() => {
    if (queryScope !== scope) setScope(queryScope);
    if (queryStatus !== status) setStatus(queryStatus);
    if (queryMonth !== month) setMonth(queryMonth);
    if (queryClaimId !== selectedClaimId) setSelectedClaimId(queryClaimId);
  }, [
    queryScope,
    queryStatus,
    queryMonth,
    queryClaimId,
    scope,
    status,
    month,
    selectedClaimId,
  ]);

  useEffect(() => {
    if (!selectedClaimId && claimsQ.data?.length) {
      setSelectedClaimId(Number(claimsQ.data[0].id));
    }
  }, [claimsQ.data, selectedClaimId]);

  useEffect(() => {
    const c = selectedClaimQ.data?.claim;
    if (!c) return;
    setClaimMonthForm(c.claim_month || "");
    setClaimNoteForm(c.note || "");
  }, [selectedClaimQ.data?.claim]);

  const allowedScopes = useMemo(() => {
    return SCOPE_OPTIONS.filter((s) => {
      if (s.value === "pending_verify")
        return ["SUPER_ADMIN", "ADMIN", "FINANCE"].includes(role);
      if (s.value === "pending_approve") return ["SUPER_ADMIN", "CAMPUS_CHIEF"].includes(role);
      if (s.value === "all")
        return ["SUPER_ADMIN", "ADMIN", "FINANCE", "CAMPUS_CHIEF"].includes(role);
      return true;
    });
  }, [role]);

  useEffect(() => {
    if (!allowedScopes.some((s) => s.value === scope)) {
      setScope("my");
    }
  }, [allowedScopes, scope]);

  const claimData = selectedClaimQ.data;
  const claim = claimData?.claim || null;
  const items = Array.isArray(claimData?.items) ? claimData.items : [];
  const approvals = Array.isArray(claimData?.approvals) ? claimData.approvals : [];
  const perms = claimData?.permissions || {};

  const itemWorkDateBsValue = useMemo(() => {
    const iso = norm(itemForm.work_date);
    if (!iso) return adToBs(new Date());
    return adToBs(iso);
  }, [itemForm.work_date]);

  const itemWorkDateBsLabel = useMemo(() => {
    const iso = norm(itemForm.work_date);
    if (!iso) return "BS date not selected";
    return formatBsDateLong(adToBs(iso));
  }, [itemForm.work_date]);

  const editableClaimForFilteredMonth = useMemo(() => {
    if (scope !== "my") return null;
    return (
      (claimsQ.data || []).find(
        (row) => row.claim_month === month && ["DRAFT", "REJECTED"].includes(String(row.status || ""))
      ) || null
    );
  }, [claimsQ.data, month, scope]);

  const itemTargetClaimMonth = useMemo(
    () => bsMonthKeyFromAdIso(itemForm.work_date) || month || currentBsMonthKey(),
    [itemForm.work_date, month]
  );

  const reusableDraftForItemMonth = useMemo(() => {
    if (scope !== "my") return null;
    return (
      (claimsQ.data || []).find(
        (row) =>
          row.claim_month === itemTargetClaimMonth &&
          ["DRAFT", "REJECTED"].includes(String(row.status || ""))
      ) || null
    );
  }, [claimsQ.data, itemTargetClaimMonth, scope]);

  const itemPreview = useMemo(
    () => buildOtPreview(itemForm, policyQ.data),
    [itemForm, policyQ.data]
  );

  const entryTargetSummary = useMemo(() => {
    if (claim && perms.can_edit && claim.claim_month === itemTargetClaimMonth) {
      return `Selected claim ${claim.claim_no || `#${claim.id}`}`;
    }
    if (reusableDraftForItemMonth) {
      return `Existing draft ${reusableDraftForItemMonth.claim_no || `#${reusableDraftForItemMonth.id}`}`;
    }
    return `New draft for ${formatNepaliMonthKey(itemTargetClaimMonth)}`;
  }, [claim, itemTargetClaimMonth, perms.can_edit, reusableDraftForItemMonth]);

  async function handleOpenOrCreateClaim(targetMonth = month || currentBsMonthKey()) {
    try {
      if (scope === "my" && editableClaimForFilteredMonth && targetMonth === month) {
        setSelectedClaimId(Number(editableClaimForFilteredMonth.id));
        toast.success("Opened your existing draft claim");
        return;
      }
      if (targetMonth && targetMonth !== month) {
        setMonth(targetMonth);
      }
      const data = await createClaimMutation.mutateAsync({ claim_month: targetMonth || undefined });
      const nextId = Number(data?.claim?.id || 0);
      if (nextId) setSelectedClaimId(nextId);
    } catch (err) {
      toast.error(readErr(err, "Failed to prepare OT claim"));
    }
  }

  function shiftWorkDate(offsetDays) {
    const base = parseIsoDateParts(itemForm.work_date || todayLocalIsoDate()) ||
      parseIsoDateParts(todayLocalIsoDate());
    if (!base) return;
    const adDate = new Date(base.year, base.month - 1, base.day, 12, 0, 0, 0);
    adDate.setDate(adDate.getDate() + Number(offsetDays || 0));
    const iso = formatLocalDateToIso(adDate);
    if (!iso) return;
    setItemForm((p) => ({ ...p, work_date: iso }));
  }

  function applyDurationPreset(durationMinutes) {
    const endTime = addMinutesToHm(itemForm.start_time, durationMinutes);
    if (!endTime) {
      toast.error("Set a valid start time first");
      return;
    }
    setItemForm((p) => ({ ...p, end_time: endTime }));
  }

  async function resolveClaimForEntry() {
    const targetMonth = itemTargetClaimMonth || month || currentBsMonthKey();
    if (claim && perms.can_edit && claim.claim_month === targetMonth) {
      return Number(claim.id);
    }
    if (scope !== "my") {
      throw new Error(`Select an editable claim for ${formatNepaliMonthKey(targetMonth)} first.`);
    }
    if (targetMonth && targetMonth !== month) {
      setMonth(targetMonth);
    }
    if (reusableDraftForItemMonth) {
      const draftId = Number(reusableDraftForItemMonth.id || 0);
      if (draftId) {
        setSelectedClaimId(draftId);
        return draftId;
      }
    }
    const created = await createClaimMutation.mutateAsync({ claim_month: targetMonth });
    const createdId = Number(created?.claim?.id || 0);
    if (!createdId) throw new Error("Failed to create draft claim");
    setSelectedClaimId(createdId);
    return createdId;
  }

  async function handleAddItem() {
    if (!norm(itemForm.reason)) {
      toast.error("Reason is required");
      return;
    }
    if (!itemPreview.valid) {
      toast.error(itemPreview.message || "Check the OT entry values");
      return;
    }
    try {
      const claimId = await resolveClaimForEntry();
      await addItemMutation.mutateAsync({ claimId });
    } catch (err) {
      toast.error(readErr(err, err?.message || "Failed to add OT entry"));
    }
  }

  const otNotifications = otNotificationsQ.data || [];

  const otNotificationSummary = useMemo(() => {
    const bucket = new Map();
    for (const notification of otNotifications) {
      const meta = getNotificationStageMeta(notification);
      const current = bucket.get(meta.stage) || { ...meta, count: 0 };
      current.count += 1;
      bucket.set(meta.stage, current);
    }
    return NOTIFICATION_STAGE_ORDER.map((stage) => bucket.get(stage)).filter(Boolean);
  }, [otNotifications]);

  const latestOtNotification = otNotifications[0] || null;
  const latestOtNotificationMeta = latestOtNotification
    ? getNotificationStageMeta(latestOtNotification)
    : null;

  const canPrintClaim = !!claim && String(claim.status || "").toUpperCase() === "APPROVED";

  const printApprovedClaim = () => {
    if (!canPrintClaim || !claim) {
      toast.error("Only approved OT claims can be printed");
      return;
    }

    const printWindow = window.open("", "_blank", "width=1024,height=768");
    if (!printWindow) {
      toast.error("Popup blocked. Please allow popups to print OT form.");
      return;
    }

    const rowsHtml =
      items.length === 0
        ? `<tr><td colspan="7" class="empty">No OT entries.</td></tr>`
        : items
            .map((i, idx) => {
              const workIso = String(i.work_date || "").slice(0, 10);
              const bsLabel = workIso ? formatBsDateLong(adToBs(workIso)) : "";
              return `
                <tr>
                  <td>${idx + 1}</td>
                  <td>${escapeHtml(formatOtDateForPrint(workIso))}<div class="sub">${escapeHtml(
                bsLabel
              )}</div></td>
                  <td>${escapeHtml(formatOtTimeForPrint(i.start_time))} - ${escapeHtml(
                formatOtTimeForPrint(i.end_time)
              )}</td>
                  <td class="right">${escapeHtml(i.break_minutes ?? 0)}</td>
                  <td class="right">${escapeHtml(Number(i.ot_hours || 0).toFixed(2))}</td>
                  <td class="right">${escapeHtml(Number(i.amount || 0).toFixed(2))}</td>
                  <td>${escapeHtml(i.reason || "")}</td>
                </tr>
              `;
            })
            .join("");

    const trailHtml =
      approvals.length === 0
        ? `<tr><td colspan="4" class="empty">No workflow actions.</td></tr>`
        : approvals
            .map((a) => {
              const ts = a.action_at ? new Date(a.action_at).toLocaleString() : "—";
              return `
                <tr>
                  <td>${escapeHtml(a.action || "—")}</td>
                  <td>${escapeHtml(a.action_by_name || "System")}</td>
                  <td>${escapeHtml(ts)}</td>
                  <td>${escapeHtml(a.note || "—")}</td>
                </tr>
              `;
            })
            .join("");

    const monthLabel = formatNepaliMonthKey(claim.claim_month);
    const appSettings = getAppSettings();
    const logoSrc =
      String(appSettings.logo_data_url || "").trim() ||
      String(appSettings.logo_small_data_url || "").trim() ||
      "";
    const logoHtml = logoSrc
      ? `<img src="${escapeHtml(logoSrc)}" alt="Campus logo" class="campus-logo" />`
      : `<div class="campus-logo-placeholder"></div>`;
    const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>OT Form ${escapeHtml(claim.claim_no || `#${claim.id}`)}</title>
    <style>
      @page { size: A4; margin: 14mm; }
      body {
        font-family: Arial, "Noto Sans Devanagari", sans-serif;
        color: #0f172a;
        font-size: 12px;
        padding-bottom: 34mm;
      }
      .header { border-bottom: 2px solid #1e3a8a; padding-bottom: 10px; margin-bottom: 10px; }
      .header-top {
        display: grid;
        grid-template-columns: 82px 1fr 82px;
        align-items: center;
        column-gap: 8px;
      }
      .header-center { text-align: center; }
      .campus-name { font-size: 20px; font-weight: 800; color: #1e3a8a; margin: 0; line-height: 1.2; }
      .campus-address { font-size: 13px; font-weight: 600; color: #334155; margin: 2px 0 0 0; }
      .title { font-size: 15px; font-weight: 700; color: #1e293b; margin: 6px 0 0 0; }
      .campus-logo {
        height: 68px;
        width: 68px;
        object-fit: contain;
        border-radius: 10px;
      }
      .campus-logo-placeholder {
        height: 68px;
        width: 68px;
        border-radius: 10px;
        border: 1px dashed #94a3b8;
      }
      .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 14px; margin: 10px 0; }
      .chip { display: inline-block; padding: 2px 8px; border: 1px solid #cbd5e1; border-radius: 999px; font-size: 11px; }
      table { width: 100%; border-collapse: collapse; margin-top: 8px; }
      th, td { border: 1px solid #cbd5e1; padding: 6px; vertical-align: top; }
      th { background: #f1f5f9; text-align: left; }
      .right { text-align: right; }
      .sub { font-size: 10px; color: #475569; margin-top: 2px; }
      .section-title { margin-top: 12px; font-size: 13px; font-weight: 700; color: #1e293b; }
      .totals { margin-top: 8px; display: flex; gap: 18px; justify-content: flex-end; font-weight: 700; }
      .footer-sign {
        position: fixed;
        left: 14mm;
        right: 14mm;
        bottom: 10mm;
      }
      .sign { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; }
      .sign-box { border-top: 1px solid #334155; padding-top: 4px; text-align: center; color: #334155; font-size: 11px; }
      .empty { text-align: center; color: #64748b; padding: 10px; }
    </style>
  </head>
  <body>
    <div class="header">
      <div class="header-top">
        <div>${logoHtml}</div>
        <div class="header-center">
          <p class="campus-name">Gaurishankar Multiple Campus</p>
          <p class="campus-address">Charikot, Dolakha</p>
          <p class="title">Overtime Claim Form</p>
        </div>
        <div></div>
      </div>
      <div class="meta">
        <div><strong>Claim No:</strong> ${escapeHtml(claim.claim_no || `OT-${claim.id}`)}</div>
        <div><strong>Status:</strong> <span class="chip">${escapeHtml(claim.status)}</span></div>
        <div><strong>Name:</strong> ${escapeHtml(claim.staff_name || "—")}</div>
        <div><strong>Claim Month (BS):</strong> ${escapeHtml(monthLabel)}</div>
        <div><strong>Email:</strong> ${escapeHtml(claim.staff_email || "—")}</div>
        <div><strong>Generated At:</strong> ${escapeHtml(new Date().toLocaleString())}</div>
      </div>
      <div><strong>Note:</strong> ${escapeHtml(claim.note || "—")}</div>
    </div>

    <div class="section-title">OT Entries</div>
    <table>
      <thead>
        <tr>
          <th style="width:32px;">SN</th>
          <th style="width:170px;">Work Date</th>
          <th style="width:155px;">Time</th>
          <th style="width:65px;" class="right">Break</th>
          <th style="width:70px;" class="right">Hours</th>
          <th style="width:80px;" class="right">Amount</th>
          <th>Reason</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>

    <div class="totals">
      <div>Total Hours: ${escapeHtml(Number(claim.total_hours || 0).toFixed(2))}</div>
      <div>Total Amount: NPR ${escapeHtml(Number(claim.total_amount || 0).toFixed(2))}</div>
    </div>

    <div class="section-title">Approval Trail</div>
    <table>
      <thead>
        <tr>
          <th style="width:120px;">Action</th>
          <th style="width:180px;">By</th>
          <th style="width:170px;">At</th>
          <th>Note</th>
        </tr>
      </thead>
      <tbody>${trailHtml}</tbody>
    </table>

    <footer class="footer-sign">
      <div class="sign">
        <div class="sign-box">Staff Signature</div>
        <div class="sign-box">Verified By (Finance/Admin)</div>
        <div class="sign-box">Approved By (Campus Chief)</div>
      </div>
    </footer>
  </body>
</html>`;

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 250);
  };

  if (meQ.isLoading) {
    return <div className="text-sm text-muted-foreground">Loading OT module...</div>;
  }

  if (!canAccessOt) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          You do not have permission to access OT Claim Management.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-gradient-to-br from-primary/5 via-background to-accent/10 p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-xl font-semibold">OT Claim Management</h2>
            <p className="text-sm text-muted-foreground">
              Create overtime claims, run verification workflow, and approve campus OT with full audit trail.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {["SUPER_ADMIN", "ADMIN", "FINANCE", "CAMPUS_CHIEF"].includes(role) ? (
              <Button type="button" variant="outline" onClick={() => nav("/operations/ot/reports")}>
                OT Reports
              </Button>
            ) : null}
            {canManagePolicy ? (
              <Button type="button" variant="outline" onClick={() => nav("/operations/ot/policy")}>
                OT Policy
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Draft</div>
            <div className="mt-1 text-2xl font-semibold">{dashboardQ.data?.DRAFT || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Submitted</div>
            <div className="mt-1 text-2xl font-semibold">{dashboardQ.data?.SUBMITTED || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Approved</div>
            <div className="mt-1 text-2xl font-semibold">{dashboardQ.data?.APPROVED || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Pending Verify/Approve</div>
            <div className="mt-1 text-2xl font-semibold">
              {(dashboardQ.data?.pending_verify || 0) + (dashboardQ.data?.pending_approve || 0)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">My OT Value</div>
            <div className="mt-1 text-2xl font-semibold">
              NPR {Number(dashboardQ.data?.my_total_amount || 0).toFixed(2)}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {allowedScopes.map((s) => (
              <Button
                key={s.value}
                type="button"
                size="sm"
                variant={scope === s.value ? "secondary" : "outline"}
                onClick={() => setScope(s.value)}
              >
                {s.label}
              </Button>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-2 md:grid-cols-[280px_220px_auto]">
            <NepaliMonthPicker value={month} onChange={setMonth} />
            <select
              className="h-10 rounded-md border bg-background px-3 text-sm"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">All status</option>
              <option value="DRAFT">Draft</option>
              <option value="SUBMITTED">Submitted</option>
              <option value="VERIFIED">Verified</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
              <option value="PAID">Paid</option>
            </select>
            <div className="flex justify-end gap-2">
              {canManagePolicy ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => (window.location.href = "/operations/ot/policy")}
                >
                  Policy
                </Button>
              ) : null}
              <Button
                type="button"
                onClick={() => handleOpenOrCreateClaim()}
                disabled={createClaimMutation.isPending}
                className="inline-flex items-center gap-1.5"
              >
                <FilePlus2 className="h-4 w-4" />
                {createClaimMutation.isPending
                  ? "Preparing..."
                  : editableClaimForFilteredMonth
                  ? "Open Draft"
                  : "New Claim"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card className="border-primary/15 bg-background/80 shadow-sm backdrop-blur-sm">
        <CardContent className="p-2.5">
          {otNotificationsQ.isLoading ? (
            <div className="flex items-center gap-2 rounded-xl border border-dashed px-3 py-2 text-sm text-muted-foreground">
              <Bell className="h-4 w-4" />
              <span>Loading OT notifications...</span>
            </div>
          ) : otNotifications.length === 0 ? (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-dashed px-3 py-2 text-sm text-muted-foreground">
              <span>No OT workflow notifications right now.</span>
              <Bell className="h-4 w-4" />
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
                <div className="flex min-w-0 flex-1 items-center gap-2 rounded-2xl border border-primary/10 bg-primary/[0.035] px-2.5 py-2">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-primary/15 bg-background text-primary shadow-sm">
                    <Bell className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                      <span className="text-sm font-semibold text-foreground">OT Inbox</span>
                      <Badge variant="outline">{otNotifications.length}</Badge>
                      {latestOtNotificationMeta ? (
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${latestOtNotificationMeta.badgeClass}`}>
                          {latestOtNotificationMeta.label}
                        </span>
                      ) : null}
                      {latestOtNotification ? <span>{timeAgo(latestOtNotification.created_at)}</span> : null}
                    </div>
                    <div className="truncate text-sm font-medium text-foreground">
                      {latestOtNotification?.title || "OT workflow notifications"}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 xl:justify-end">
                  {otNotificationSummary.map((item) => (
                    <span
                      key={item.stage}
                      className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${item.badgeClass}`}
                    >
                      {item.label} {item.count}
                    </span>
                  ))}
                  {latestOtNotification ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8"
                      onClick={() => {
                        const path = String(latestOtNotification.action_path || "").trim();
                        if (path) nav(path);
                      }}
                    >
                      {latestOtNotification.action_label || "Open latest"}
                    </Button>
                  ) : null}
                  {otNotifications.length > 1 ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-8 gap-1 px-2"
                      onClick={() => setIsOtInboxExpanded((v) => !v)}
                    >
                      {isOtInboxExpanded ? "Hide" : "Details"}
                      {isOtInboxExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </Button>
                  ) : null}
                </div>
              </div>

              {isOtInboxExpanded ? (
                <div className="rounded-2xl border bg-background/65 p-2">
                  <div className="grid gap-2 lg:grid-cols-2 xl:grid-cols-3">
                    {otNotifications.map((notification, idx) => {
                      const stageMeta = getNotificationStageMeta(notification);
                      return (
                        <button
                          key={notification.id || `${idx}`}
                          type="button"
                          className={[
                            "flex min-h-[88px] w-full flex-col justify-between rounded-xl border px-3 py-2 text-left transition-colors",
                            stageMeta.itemClass,
                          ].join(" ")}
                          onClick={() => {
                            const path = String(notification.action_path || "").trim();
                            if (path) nav(path);
                          }}
                        >
                          <div className="space-y-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${stageMeta.badgeClass}`}>
                                {stageMeta.label}
                              </span>
                              <span className="text-[11px] text-muted-foreground">
                                {timeAgo(notification.created_at)}
                              </span>
                            </div>
                            <div className="line-clamp-1 text-sm font-medium text-foreground">
                              {notification.title || "Notification"}
                            </div>
                            <div className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                              {notification.message || ""}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <Card className="xl:col-span-4">
          <CardContent className="p-3">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Claim List</h3>
              <Badge variant="outline">{(claimsQ.data || []).length}</Badge>
            </div>
            <div className="max-h-[65vh] space-y-2 overflow-auto pr-1">
              {claimsQ.isLoading ? (
                <div className="text-sm text-muted-foreground p-2">Loading claims...</div>
              ) : (claimsQ.data || []).length === 0 ? (
                <div className="text-sm text-muted-foreground p-2">No OT claims found.</div>
              ) : (
                (claimsQ.data || []).map((r) => {
                  const active = Number(r.id) === Number(selectedClaimId);
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setSelectedClaimId(Number(r.id))}
                      className={[
                        "w-full rounded-lg border p-3 text-left transition",
                        active
                          ? "border-primary bg-primary/5 shadow-sm"
                          : "hover:border-primary/40 hover:bg-muted/40",
                      ].join(" ")}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">
                            {r.claim_no || `Claim #${r.id}`}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            {r.staff_name} • {formatNepaliMonthKey(r.claim_month)}
                          </div>
                        </div>
                        <Badge variant={statusBadgeVariant(r.status)}>{r.status}</Badge>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                        <div className="rounded-md border px-2 py-1">
                          Hours: <span className="font-semibold">{Number(r.total_hours || 0).toFixed(2)}</span>
                        </div>
                        <div className="rounded-md border px-2 py-1">
                          NPR: <span className="font-semibold">{Number(r.total_amount || 0).toFixed(2)}</span>
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="xl:col-span-8">
          <CardContent className="p-4 space-y-4">
            {!selectedClaimId ? (
              <div className="space-y-3 rounded-lg border border-dashed p-4 text-sm">
                <div className="text-muted-foreground">
                  No claim is selected yet. Open your draft for this month or create a fresh one.
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    onClick={() => handleOpenOrCreateClaim()}
                    disabled={createClaimMutation.isPending}
                    className="inline-flex items-center gap-1.5"
                  >
                    <FilePlus2 className="h-4 w-4" />
                    {editableClaimForFilteredMonth
                      ? `Open ${editableClaimForFilteredMonth.claim_no || `draft #${editableClaimForFilteredMonth.id}`}`
                      : `Create ${formatNepaliMonthKey(month)}`}
                  </Button>
                  {scope !== "my" ? (
                    <span className="self-center text-xs text-muted-foreground">
                      Tip: switch to My Claims for one-tap draft creation.
                    </span>
                  ) : null}
                </div>
              </div>
            ) : selectedClaimQ.isLoading ? (
              <div className="text-sm text-muted-foreground">Loading claim details...</div>
            ) : selectedClaimQ.isError || !claim ? (
              <div className="text-sm text-destructive">
                {readErr(selectedClaimQ.error, "Failed to load claim details")}
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-lg font-semibold">{claim.claim_no || `Claim #${claim.id}`}</div>
                    <div className="text-xs text-muted-foreground">
                      {claim.staff_name} • {claim.staff_email || "no-email"} •{" "}
                      {formatNepaliMonthKey(claim.claim_month)}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={statusBadgeVariant(claim.status)}>{claim.status}</Badge>
                    <Badge variant="outline" className="inline-flex items-center gap-1">
                      <Clock3 className="h-3.5 w-3.5" />
                      {Number(claim.total_hours || 0).toFixed(2)} hrs
                    </Badge>
                    <Badge variant="outline" className="inline-flex items-center gap-1">
                      <WalletCards className="h-3.5 w-3.5" />
                      NPR {Number(claim.total_amount || 0).toFixed(2)}
                    </Badge>
                    {canPrintClaim ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="inline-flex items-center gap-1.5"
                        onClick={printApprovedClaim}
                      >
                        <Printer className="h-4 w-4" />
                        Print
                      </Button>
                    ) : null}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-2 md:grid-cols-[280px_1fr_auto]">
                  <NepaliMonthPicker
                    value={claimMonthForm}
                    onChange={setClaimMonthForm}
                    className={!perms.can_edit ? "pointer-events-none opacity-60" : ""}
                  />
                  <Input
                    value={claimNoteForm}
                    onChange={(e) => setClaimNoteForm(e.target.value)}
                    placeholder="Claim note (optional)"
                    disabled={!perms.can_edit}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => updateClaimMutation.mutate()}
                    disabled={!perms.can_edit || updateClaimMutation.isPending}
                  >
                    Save
                  </Button>
                </div>

                {perms.can_edit ? (
                  <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="text-sm font-medium inline-flex items-center gap-1.5">
                          <BriefcaseBusiness className="h-4 w-4" />
                          Quick OT Entry
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Pick the work date, time, and reason. The app will use the correct monthly draft claim automatically.
                        </div>
                      </div>
                      <Badge variant="outline">{formatNepaliMonthKey(itemTargetClaimMonth)}</Badge>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button type="button" size="sm" variant="outline" onClick={() => shiftWorkDate(0)}>
                        Today
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => shiftWorkDate(-1)}>
                        Yesterday
                      </Button>
                      {DURATION_PRESETS.map((preset) => (
                        <Button
                          key={preset.label}
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => applyDurationPreset(preset.minutes)}
                        >
                          {preset.label}
                        </Button>
                      ))}
                    </div>

                    <div className="grid grid-cols-1 gap-2 md:grid-cols-6">
                      <Button
                        type="button"
                        variant="outline"
                        className="h-10 w-full justify-start gap-1.5 overflow-hidden"
                        onClick={() => setIsBsCalendarOpen(true)}
                      >
                        <CalendarDays className="h-4 w-4 shrink-0" />
                        <span className="truncate text-left">{itemWorkDateBsLabel}</span>
                      </Button>
                      <Input
                        type="time"
                        value={itemForm.start_time}
                        onChange={(e) => setItemForm((p) => ({ ...p, start_time: e.target.value }))}
                      />
                      <Input
                        type="time"
                        value={itemForm.end_time}
                        onChange={(e) => setItemForm((p) => ({ ...p, end_time: e.target.value }))}
                      />
                      <Input
                        type="number"
                        min="0"
                        value={itemForm.break_minutes}
                        onChange={(e) =>
                          setItemForm((p) => ({ ...p, break_minutes: e.target.value }))
                        }
                        placeholder="Break min"
                      />
                      <Input
                        value={itemForm.reason}
                        onChange={(e) => setItemForm((p) => ({ ...p, reason: e.target.value }))}
                        placeholder="Reason"
                      />
                      <Button
                        type="button"
                        onClick={handleAddItem}
                        disabled={
                          !norm(itemForm.reason) ||
                          !itemPreview.valid ||
                          addItemMutation.isPending ||
                          createClaimMutation.isPending
                        }
                      >
                        {addItemMutation.isPending ? "Saving..." : "Add Entry"}
                      </Button>
                    </div>

                    <div className="rounded-md border bg-background/80 px-3 py-2 text-xs text-muted-foreground">
                      <div className="flex flex-wrap gap-x-4 gap-y-1">
                        <span>
                          <span className="font-medium text-foreground">Target claim:</span> {entryTargetSummary}
                        </span>
                        {itemPreview.valid ? (
                          <>
                            <span>
                              <span className="font-medium text-foreground">Hours:</span> {itemPreview.hours.toFixed(2)}
                            </span>
                            <span>
                              <span className="font-medium text-foreground">Amount:</span> NPR {itemPreview.amount.toFixed(2)}
                            </span>
                            <span>
                              <span className="font-medium text-foreground">Rate:</span> x{itemPreview.multiplier.toFixed(2)} {itemPreview.rateTypeLabel}
                            </span>
                          </>
                        ) : (
                          <span className="text-amber-700">{itemPreview.message}</span>
                        )}
                      </div>
                    </div>

                    <label className="text-xs text-muted-foreground inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={itemForm.is_holiday}
                        onChange={(e) =>
                          setItemForm((p) => ({ ...p, is_holiday: e.target.checked }))
                        }
                      />
                      Public holiday OT (uses holiday multiplier)
                    </label>
                  </div>
                ) : null}

                <Dialog open={isBsCalendarOpen} onOpenChange={setIsBsCalendarOpen}>
                  <DialogContent className="max-w-sm p-4">
                    <DialogHeader>
                      <DialogTitle className="text-base">Select Work Date (BS)</DialogTitle>
                    </DialogHeader>
                    <NepaliCalendar
                      value={itemWorkDateBsValue}
                      onChange={({ adDate }) => {
                        const iso = formatLocalDateToIso(adDate);
                        if (iso) {
                          setItemForm((p) => ({ ...p, work_date: iso }));
                          setIsBsCalendarOpen(false);
                        }
                      }}
                    />
                    <div className="flex justify-end">
                      <Button type="button" onClick={() => setIsBsCalendarOpen(false)}>
                        Done
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>

                <div className="overflow-auto rounded-md border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/60">
                      <tr>
                        <th className="px-2 py-2 text-left">Date</th>
                        <th className="px-2 py-2 text-left">Time</th>
                        <th className="px-2 py-2 text-center">Break</th>
                        <th className="px-2 py-2 text-center">Hours</th>
                        <th className="px-2 py-2 text-center">Rate x Mult</th>
                        <th className="px-2 py-2 text-right">Amount</th>
                        <th className="px-2 py-2 text-left">Reason</th>
                        <th className="px-2 py-2 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="px-2 py-4 text-center text-muted-foreground">
                            No OT entries yet.
                          </td>
                        </tr>
                      ) : (
                        items.map((i) => (
                          <tr key={i.id} className="border-t">
                            <td className="px-2 py-2">{String(i.work_date).slice(0, 10)}</td>
                            <td className="px-2 py-2 font-mono text-xs">
                              {String(i.start_time).slice(0, 5)} - {String(i.end_time).slice(0, 5)}
                            </td>
                            <td className="px-2 py-2 text-center">{i.break_minutes}</td>
                            <td className="px-2 py-2 text-center">{Number(i.ot_hours || 0).toFixed(2)}</td>
                            <td className="px-2 py-2 text-center">
                              {Number(i.hourly_rate || 0).toFixed(2)} x {Number(i.multiplier || 0).toFixed(2)}
                            </td>
                            <td className="px-2 py-2 text-right font-semibold">
                              {Number(i.amount || 0).toFixed(2)}
                            </td>
                            <td className="px-2 py-2">{i.reason}</td>
                            <td className="px-2 py-2 text-right">
                              {perms.can_edit ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => removeItemMutation.mutate(i.id)}
                                  disabled={removeItemMutation.isPending}
                                >
                                  Remove
                                </Button>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="rounded-lg border p-3 space-y-2">
                  <div className="text-sm font-medium">Workflow Actions</div>
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_auto_auto_auto_auto_auto]">
                    <Input
                      placeholder="Decision note (required for reject)"
                      value={decisionNote}
                      onChange={(e) => setDecisionNote(e.target.value)}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      disabled={!perms.can_submit || doAction.isPending}
                      onClick={() => doAction.mutate({ action: "submit" })}
                    >
                      Submit
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={!perms.can_verify || doAction.isPending}
                      onClick={() => doAction.mutate({ action: "verify" })}
                      className="inline-flex items-center gap-1.5"
                    >
                      <ShieldCheck className="h-4 w-4" />
                      Verify
                    </Button>
                    <Button
                      type="button"
                      disabled={!perms.can_approve || doAction.isPending}
                      onClick={() => doAction.mutate({ action: "approve" })}
                      className="inline-flex items-center gap-1.5"
                    >
                      <BadgeCheck className="h-4 w-4" />
                      Approve
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      disabled={!perms.can_reject || doAction.isPending}
                      onClick={() => doAction.mutate({ action: "reject", note: decisionNote })}
                      className="inline-flex items-center gap-1.5"
                    >
                      <XCircle className="h-4 w-4" />
                      Reject
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={!perms.can_reopen || doAction.isPending}
                      onClick={() => doAction.mutate({ action: "reopen", note: decisionNote })}
                    >
                      Reopen
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-sm font-medium">Approval Trail</div>
                  <div className="max-h-36 overflow-auto rounded-md border">
                    {approvals.length === 0 ? (
                      <div className="p-3 text-sm text-muted-foreground">No workflow actions yet.</div>
                    ) : (
                      approvals.map((a) => (
                        <div key={a.id} className="border-b px-3 py-2 text-sm last:border-b-0">
                          <div className="font-medium">
                            {a.action} • {a.action_by_name || "System"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {a.note || "No note"} • {a.action_at ? new Date(a.action_at).toLocaleString() : "—"}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="rounded-md border bg-muted/20 p-3 text-xs text-muted-foreground">
                  Active policy:
                  <span className="ml-1 font-medium">
                    NPR {Number(policyQ.data?.hourly_rate || 0).toFixed(2)} / hour
                  </span>
                  <span className="mx-2">•</span>
                  Weekend x{Number(policyQ.data?.weekend_multiplier || 0).toFixed(2)}
                  <span className="mx-2">•</span>
                  Holiday x{Number(policyQ.data?.holiday_multiplier || 0).toFixed(2)}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
