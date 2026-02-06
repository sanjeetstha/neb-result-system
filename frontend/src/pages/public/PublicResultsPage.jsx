import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText, HelpCircle, ShieldCheck } from "lucide-react";

import ResultsSearchPage from "../results/ResultsSearchPage";
import { Card, CardContent } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Separator } from "../../components/ui/separator";
import { api } from "../../lib/api";
import { useAppSettings } from "../../lib/appSettings";

export default function PublicResultsPage() {
  const settings = useAppSettings();
  const examsQ = useQuery({
    queryKey: ["public", "exams", "portal"],
    queryFn: async () => {
      const res = await api.get("/api/public/exams");
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
                Search results by exam, symbol number, and date of birth. Download the
                official marksheet and transcript once results are published.
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
                  <div className="text-xs text-muted-foreground">Support</div>
                  <div className="text-lg font-semibold">Help Desk</div>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                <Badge variant="outline">Fast Search</Badge>
                <Badge variant="outline">Official PDF</Badge>
                <Badge variant="outline">Verified Results</Badge>
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
              Results shown here are official. Download the marksheet PDF to verify
              details or contact your campus administration for support.
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
              After search, download the official marksheet and transcript for
              scholarship or application purposes.
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
              If your result is missing, check symbol number and DOB. For help,
              contact the exam section at your campus.
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
            <Badge variant="secondary">{examList.length} available</Badge>
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
