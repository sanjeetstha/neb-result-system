import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText, HelpCircle, ShieldCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import ResultsSearchPage from "../results/ResultsSearchPage";
import { Card, CardContent } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Separator } from "../../components/ui/separator";
import { Button } from "../../components/ui/button";
import { publicApi } from "../../lib/publicApi";
import { useAppSettings } from "../../lib/appSettings";
import { clearPublicToken, getPublicSessionPayload } from "../../lib/publicAuth";
import { isAuthed } from "../../lib/auth";

export default function PublicResultsPage() {
  const settings = useAppSettings();
  const nav = useNavigate();

  const publicPayload = getPublicSessionPayload();
  const expiresAt = publicPayload?.exp
    ? new Date(Number(publicPayload.exp) * 1000)
    : null;

  useEffect(() => {
    const onExpired = () => {
      toast.error("Public session expired. Please request OTP again.");
      nav("/public", { replace: true });
    };
    window.addEventListener("public-session-expired", onExpired);
    return () => window.removeEventListener("public-session-expired", onExpired);
  }, [nav]);

  const examsQ = useQuery({
    queryKey: ["public", "exams", "portal"],
    queryFn: async () => {
      const res = await publicApi.get("/api/public/exams");
      const data = res.data?.exams ?? res.data?.data ?? res.data ?? [];
      return Array.isArray(data) ? data : [];
    },
    staleTime: 60_000,
  });

  const examList = useMemo(() => examsQ.data || [], [examsQ.data]);

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden border-0 shadow-xl">
        <CardContent className="p-0">
          <div className="grid grid-cols-1 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="p-6 lg:p-8 bg-gradient-to-br from-primary/10 via-background to-accent/10">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="secondary">Public Portal</Badge>
                <span>Official result publishing area</span>
              </div>
              <h1 className="mt-3 text-2xl md:text-3xl font-display font-semibold">
                {settings.org_name || "NEB Result System"}
              </h1>
              <p className="mt-2 text-sm text-muted-foreground max-w-lg">
                Search published results by exam and registration number. Date of birth
                is optional for confirmation only. No internal modules are available in
                this public session.
              </p>

              <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-lg border bg-white/70 p-3">
                  <div className="text-xs text-muted-foreground">Published Exams</div>
                  <div className="text-lg font-semibold">{examList.length || "—"}</div>
                </div>
                <div className="rounded-lg border bg-white/70 p-3">
                  <div className="text-xs text-muted-foreground">PDF Downloads</div>
                  <div className="text-lg font-semibold">Marksheet + Transcript</div>
                </div>
                <div className="rounded-lg border bg-white/70 p-3">
                  <div className="text-xs text-muted-foreground">Session</div>
                  <div className="text-lg font-semibold">
                    {expiresAt
                      ? `Until ${expiresAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                      : "Protected"}
                  </div>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                <Badge variant="outline">Fast Search</Badge>
                <Badge variant="outline">Official PDF</Badge>
                <Badge variant="outline">Published Only</Badge>
              </div>
            </div>

            <div className="p-6 lg:p-8 bg-white/80">
              <ResultsSearchPage title="Public Result Portal" variant="compact" />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Result Verification
            </div>
            <p className="text-sm text-muted-foreground">
              Results shown here are official and limited to published exam data.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <FileText className="h-4 w-4 text-primary" />
              Download Options
            </div>
            <p className="text-sm text-muted-foreground">
              Open marksheet and transcript in browser, then print as needed.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <HelpCircle className="h-4 w-4 text-primary" />
              Need Help?
            </div>
            <p className="text-sm text-muted-foreground">
              Contact your campus exam section if result details are missing.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <div className="text-sm font-medium">Published Exams</div>
              <div className="text-xs text-muted-foreground">
                Only published exams are visible in the public portal.
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{examList.length} available</Badge>
              {!isAuthed() && publicPayload ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    clearPublicToken();
                    nav("/public", { replace: true });
                  }}
                >
                  End Session
                </Button>
              ) : null}
            </div>
          </div>

          <Separator />

          {examsQ.isLoading ? (
            <div className="text-sm text-muted-foreground">Loading exams...</div>
          ) : examList.length === 0 ? (
            <div className="text-sm text-muted-foreground">No exams published yet.</div>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {examList.map((e) => (
                <div key={e.exam_id || e.id} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{e.name || e.title || "Exam"}</div>
                    <Badge variant="outline">Published</Badge>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {e.published_at
                      ? `Published: ${new Date(e.published_at).toLocaleDateString()}`
                      : "Available for search"}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
