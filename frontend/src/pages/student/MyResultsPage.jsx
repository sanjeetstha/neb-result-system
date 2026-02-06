import ResultsSearchPage from "../results/ResultsSearchPage";
import { Card, CardContent } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";

export default function MyResultsPage() {
  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <div className="bg-gradient-to-r from-primary/10 via-accent/10 to-primary/10 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">My Results</Badge>
              <span className="text-sm text-muted-foreground">
                Published results only
              </span>
            </div>
            <div className="mt-2 text-lg font-semibold">
              Access your published results
            </div>
            <div className="text-sm text-muted-foreground">
              Use your symbol number and date of birth to fetch results.
            </div>
          </div>
        </CardContent>
      </Card>

      <ResultsSearchPage title="My Results" />
    </div>
  );
}
