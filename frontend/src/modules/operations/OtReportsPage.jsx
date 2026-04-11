import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, Download, Filter, Users, WalletCards, Clock3, FileSearch } from "lucide-react";

import { api } from "../../lib/api";
import { hasPermission } from "../../lib/access";
import { useMe } from "../../lib/useMe";
import { todayLocalIsoDate } from "../../lib/date";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Badge } from "../../components/ui/badge";
import { Card, CardContent } from "../../components/ui/card";

const STATUS_OPTIONS = [
  { value: "ALL", label: "All Statuses" },
  { value: "DRAFT", label: "Drafted" },
  { value: "SUBMITTED", label: "Submitted" },
  { value: "VERIFIED", label: "Verified" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
  { value: "PAID", label: "Paid" },
];

function monthStartIsoDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

function readErr(err, fallback) {
  return err?.response?.data?.message || err?.message || fallback;
}

function formatMoney(value) {
  const amount = Number(value || 0);
  return `NPR ${amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value || "—");
  return d.toLocaleDateString();
}

function formatDateTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value || "—");
  return d.toLocaleString();
}

function statusBadgeVariant(status) {
  const s = String(status || "").toUpperCase();
  if (s === "APPROVED" || s === "PAID") return "secondary";
  if (s === "REJECTED") return "destructive";
  if (s === "SUBMITTED" || s === "VERIFIED") return "default";
  return "outline";
}

function csvCell(value) {
  const text = String(value ?? "");
  if (!/[",\n]/.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
}

function downloadClaimsCsv(rows) {
  const header = [
    "Claim No",
    "Claim Month",
    "Status",
    "Staff",
    "Email",
    "Phone",
    "Total Hours",
    "Total Amount",
    "Items",
    "Status Date",
    "Created At",
    "Submitted At",
    "Verified At",
    "Approved At",
    "Rejected At",
    "Note",
  ];
  const lines = [header.join(",")];
  for (const row of rows || []) {
    lines.push(
      [
        row.claim_no,
        row.claim_month,
        row.status,
        row.staff_name,
        row.staff_email,
        row.staff_phone,
        row.total_hours,
        row.total_amount,
        row.item_count,
        row.status_at,
        row.created_at,
        row.submitted_at,
        row.verified_at,
        row.approved_at,
        row.rejected_at,
        row.note,
      ]
        .map(csvCell)
        .join(",")
    );
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ot-report-${todayLocalIsoDate()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function SelectField({ label, value, onChange, options, placeholder }) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">{label}</label>
      <select
        className="h-10 w-full rounded-md border bg-background px-3 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{placeholder}</option>
        {(options || []).map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function SummaryCard({ title, value, hint, icon: Icon }) {
  return (
    <div className="rounded-2xl border bg-background/80 p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">{title}</div>
          <div className="mt-1 text-2xl font-semibold text-foreground">{value}</div>
          {hint ? <div className="mt-1 text-xs text-muted-foreground">{hint}</div> : null}
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl border bg-primary/5 text-primary">
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

export default function OtReportsPage() {
  const nav = useNavigate();
  const meQ = useMe();
  const me = meQ.data || null;
  const canAccess = hasPermission(me, "ot.reports");

  const [status, setStatus] = useState("ALL");
  const [staffUserId, setStaffUserId] = useState("");
  const [dateFrom, setDateFrom] = useState(monthStartIsoDate());
  const [dateTo, setDateTo] = useState(todayLocalIsoDate());
  const [query, setQuery] = useState("");

  const reportQ = useQuery({
    queryKey: ["ot", "reports", status, staffUserId, dateFrom, dateTo, query],
    enabled: canAccess,
    staleTime: 15_000,
    queryFn: async () => {
      const res = await api.get("/api/ot/reports", {
        params: {
          status: status || undefined,
          staff_user_id: staffUserId || undefined,
          date_from: dateFrom || undefined,
          date_to: dateTo || undefined,
          q: query || undefined,
        },
      });
      return res.data;
    },
  });

  const data = reportQ.data || {};
  const claims = Array.isArray(data.claims) ? data.claims : [];
  const byDate = Array.isArray(data.by_date) ? data.by_date : [];
  const byUser = Array.isArray(data.by_user) ? data.by_user : [];
  const staffOptions = useMemo(() => {
    return (data.staff_options || []).map((item) => ({
      value: String(item.value),
      label: item.email ? `${item.label} • ${item.email}` : item.label,
    }));
  }, [data.staff_options]);

  const resetFilters = () => {
    setStatus("ALL");
    setStaffUserId("");
    setDateFrom(monthStartIsoDate());
    setDateTo(todayLocalIsoDate());
    setQuery("");
  };

  if (!canAccess) {
    return (
      <div className="text-sm text-muted-foreground">
        You do not have permission to access OT reporting.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-xl font-semibold">OT Reports</h2>
          <p className="text-sm text-muted-foreground">
            Review drafted, submitted, approved, rejected, and verified OT claims by date range or staff member.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => nav("/operations/ot")}
          >
            Back To OT Claims
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!claims.length}
            onClick={() => downloadClaimsCsv(claims)}
            className="inline-flex items-center gap-1.5"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Filter className="h-4 w-4 text-primary" />
            Report Filters
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
            <SelectField
              label="Status"
              value={status}
              onChange={(value) => setStatus(value || "ALL")}
              options={STATUS_OPTIONS}
              placeholder="All Statuses"
            />

            <SelectField
              label="Staff"
              value={staffUserId}
              onChange={setStaffUserId}
              options={staffOptions}
              placeholder={reportQ.isLoading ? "Loading staff..." : "All staff"}
            />

            <div className="space-y-2">
              <label className="text-sm font-medium">From Date</label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">To Date</label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Search</label>
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Claim no, staff, email, phone"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" onClick={resetFilters}>
              Reset Filters
            </Button>
            {reportQ.isFetching ? <Badge variant="outline">Refreshing...</Badge> : null}
            {dateFrom || dateTo ? (
              <Badge variant="outline">
                Range: {dateFrom || "—"} to {dateTo || "—"}
              </Badge>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {reportQ.isLoading ? (
        <Card>
          <CardContent className="p-4 text-sm text-muted-foreground">Loading OT reports...</CardContent>
        </Card>
      ) : reportQ.isError ? (
        <Card>
          <CardContent className="p-4 text-sm text-destructive">
            {readErr(reportQ.error, "Failed to load OT reports")}
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
            <SummaryCard
              title="Claims"
              value={Number(data.summary?.claim_count || 0)}
              hint={`${Number(data.summary?.staff_count || 0)} staff matched`}
              icon={FileSearch}
            />
            <SummaryCard
              title="Total Hours"
              value={Number(data.summary?.total_hours || 0).toFixed(2)}
              hint="Across filtered OT claims"
              icon={Clock3}
            />
            <SummaryCard
              title="Total Amount"
              value={formatMoney(data.summary?.total_amount || 0)}
              hint="Calculated OT value"
              icon={WalletCards}
            />
            <SummaryCard
              title="Approved"
              value={Number(data.summary?.approved_count || 0)}
              hint="Approved OT claims"
              icon={BarChart3}
            />
            <SummaryCard
              title="Submitted"
              value={Number(data.summary?.submitted_count || 0)}
              hint="Pending verification or approval"
              icon={Users}
            />
          </div>

          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex flex-wrap gap-2">
                {(data.status_summary || []).map((row) => (
                  <Badge key={row.status} variant={statusBadgeVariant(row.status)}>
                    {row.status}: {Number(row.claim_count || 0)} • {Number(row.total_hours || 0).toFixed(2)}h • {formatMoney(row.total_amount || 0)}
                  </Badge>
                ))}
                {!(data.status_summary || []).length ? (
                  <div className="text-sm text-muted-foreground">No status summary for the selected filters.</div>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Card>
              <CardContent className="p-4 space-y-3">
                <div>
                  <h3 className="text-base font-semibold">Date-wise OT</h3>
                  <p className="text-xs text-muted-foreground">
                    Grouped by OT workflow date for the selected status and range.
                  </p>
                </div>
                {byDate.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No date-wise records found.</div>
                ) : (
                  <div className="max-h-[420px] overflow-auto rounded-md border">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-muted/95 backdrop-blur">
                        <tr>
                          <th className="p-2 text-left">Date</th>
                          <th className="p-2 text-center">Claims</th>
                          <th className="p-2 text-center">Staff</th>
                          <th className="p-2 text-center">Hours</th>
                          <th className="p-2 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {byDate.map((row) => (
                          <tr key={row.report_date} className="border-t align-top">
                            <td className="p-2">
                              <div className="font-medium">{formatDate(row.report_date)}</div>
                              <div className="mt-1 flex flex-wrap gap-1 text-[11px]">
                                {Number(row.draft_count || 0) ? <Badge variant="outline">Draft {row.draft_count}</Badge> : null}
                                {Number(row.submitted_count || 0) ? <Badge variant="default">Submitted {row.submitted_count}</Badge> : null}
                                {Number(row.verified_count || 0) ? <Badge variant="default">Verified {row.verified_count}</Badge> : null}
                                {Number(row.approved_count || 0) ? <Badge variant="secondary">Approved {row.approved_count}</Badge> : null}
                                {Number(row.rejected_count || 0) ? <Badge variant="destructive">Rejected {row.rejected_count}</Badge> : null}
                              </div>
                            </td>
                            <td className="p-2 text-center">{Number(row.claim_count || 0)}</td>
                            <td className="p-2 text-center">{Number(row.staff_count || 0)}</td>
                            <td className="p-2 text-center">{Number(row.total_hours || 0).toFixed(2)}</td>
                            <td className="p-2 text-right">{formatMoney(row.total_amount || 0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 space-y-3">
                <div>
                  <h3 className="text-base font-semibold">User-wise OT</h3>
                  <p className="text-xs text-muted-foreground">
                    Compare OT workload and value across staff members.
                  </p>
                </div>
                {byUser.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No staff-wise records found.</div>
                ) : (
                  <div className="max-h-[420px] overflow-auto rounded-md border">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-muted/95 backdrop-blur">
                        <tr>
                          <th className="p-2 text-left">Staff</th>
                          <th className="p-2 text-center">Claims</th>
                          <th className="p-2 text-center">Hours</th>
                          <th className="p-2 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {byUser.map((row) => (
                          <tr key={row.staff_user_id} className="border-t align-top">
                            <td className="p-2">
                              <div className="font-medium">{row.staff_name || "—"}</div>
                              <div className="text-xs text-muted-foreground">{row.staff_email || row.staff_phone || "—"}</div>
                              <div className="mt-1 flex flex-wrap gap-1 text-[11px]">
                                {Number(row.draft_count || 0) ? <Badge variant="outline">Draft {row.draft_count}</Badge> : null}
                                {Number(row.submitted_count || 0) ? <Badge variant="default">Submitted {row.submitted_count}</Badge> : null}
                                {Number(row.verified_count || 0) ? <Badge variant="default">Verified {row.verified_count}</Badge> : null}
                                {Number(row.approved_count || 0) ? <Badge variant="secondary">Approved {row.approved_count}</Badge> : null}
                                {Number(row.rejected_count || 0) ? <Badge variant="destructive">Rejected {row.rejected_count}</Badge> : null}
                              </div>
                            </td>
                            <td className="p-2 text-center">{Number(row.claim_count || 0)}</td>
                            <td className="p-2 text-center">{Number(row.total_hours || 0).toFixed(2)}</td>
                            <td className="p-2 text-right">{formatMoney(row.total_amount || 0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
                <div>
                  <h3 className="text-base font-semibold">Claim Details</h3>
                  <p className="text-xs text-muted-foreground">
                    Filtered OT claims with workflow dates and direct access back to the OT processing screen.
                  </p>
                </div>
                <Badge variant="outline">Rows: {claims.length}</Badge>
              </div>

              {claims.length === 0 ? (
                <div className="text-sm text-muted-foreground">No OT claims found for the selected filters.</div>
              ) : (
                <div className="overflow-auto rounded-md border">
                  <table className="w-full min-w-[1040px] text-sm">
                    <thead className="bg-muted/95">
                      <tr>
                        <th className="p-2 text-left">Claim</th>
                        <th className="p-2 text-left">Staff</th>
                        <th className="p-2 text-center">Status</th>
                        <th className="p-2 text-center">Hours</th>
                        <th className="p-2 text-right">Amount</th>
                        <th className="p-2 text-left">Status Date</th>
                        <th className="p-2 text-left">Workflow Dates</th>
                        <th className="p-2 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {claims.map((row) => (
                        <tr key={row.id} className="border-t align-top">
                          <td className="p-2">
                            <div className="font-medium">{row.claim_no || `#${row.id}`}</div>
                            <div className="text-xs text-muted-foreground">Month: {row.claim_month || "—"}</div>
                            <div className="text-xs text-muted-foreground">Items: {Number(row.item_count || 0)}</div>
                            {row.note ? <div className="mt-1 text-xs text-muted-foreground">{row.note}</div> : null}
                          </td>
                          <td className="p-2">
                            <div className="font-medium">{row.staff_name || "—"}</div>
                            <div className="text-xs text-muted-foreground">{row.staff_email || "—"}</div>
                            <div className="text-xs text-muted-foreground">{row.staff_phone || "—"}</div>
                          </td>
                          <td className="p-2 text-center">
                            <Badge variant={statusBadgeVariant(row.status)}>{row.status}</Badge>
                          </td>
                          <td className="p-2 text-center">{Number(row.total_hours || 0).toFixed(2)}</td>
                          <td className="p-2 text-right">{formatMoney(row.total_amount || 0)}</td>
                          <td className="p-2">
                            <div>{formatDateTime(row.status_at)}</div>
                            <div className="text-xs text-muted-foreground">Created: {formatDateTime(row.created_at)}</div>
                          </td>
                          <td className="p-2 text-xs text-muted-foreground">
                            <div>Submitted: {formatDateTime(row.submitted_at)}</div>
                            <div>Verified: {formatDateTime(row.verified_at)}</div>
                            <div>Approved: {formatDateTime(row.approved_at)}</div>
                            <div>Rejected: {formatDateTime(row.rejected_at)}</div>
                          </td>
                          <td className="p-2 text-center">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                nav(
                                  `/operations/ot?scope=all&month=${encodeURIComponent(row.claim_month || "")}&claim_id=${row.id}`
                                )
                              }
                            >
                              Open
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
