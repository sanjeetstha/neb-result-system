import { Button } from "./button";

export default function PaginationBar({
  page,
  totalPages,
  onPageChange,
  pageSize,
  onPageSizeChange,
  totalItems,
}) {
  const canPrev = page > 1;
  const canNext = page < totalPages;

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-t text-sm">
      <div className="text-xs text-muted-foreground">
        Showing page {page} of {totalPages} • Total: {totalItems}
      </div>

      <div className="flex items-center gap-2">
        <select
          className="h-8 rounded-md border bg-background px-2 text-xs"
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
        >
          {[10, 20, 50, 100].map((n) => (
            <option key={n} value={n}>
              {n} / page
            </option>
          ))}
        </select>

        <Button size="sm" variant="outline" onClick={() => onPageChange(1)} disabled={!canPrev}>
          First
        </Button>
        <Button size="sm" variant="outline" onClick={() => onPageChange(page - 1)} disabled={!canPrev}>
          Prev
        </Button>
        <Button size="sm" variant="outline" onClick={() => onPageChange(page + 1)} disabled={!canNext}>
          Next
        </Button>
        <Button size="sm" variant="outline" onClick={() => onPageChange(totalPages)} disabled={!canNext}>
          Last
        </Button>
      </div>
    </div>
  );
}
