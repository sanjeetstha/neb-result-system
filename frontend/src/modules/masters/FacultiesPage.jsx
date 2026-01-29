import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { api } from "../../lib/api";

import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../../components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import { Badge } from "../../components/ui/badge";

function normalizePayload(code, name) {
  const c = String(code ?? "").trim().toUpperCase();
  const n = String(name ?? "").trim();
  if (!c) return null;
  if (!n) return null;
  return { code: c, name: n };
}

export default function FacultiesPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");

  const q = useQuery({
    queryKey: ["masters", "faculties"],
    queryFn: async () => {
      const res = await api.get("/api/masters/faculties");
      const data =
        res.data?.faculties ?? res.data?.programs ?? res.data?.data ?? res.data;
      return Array.isArray(data) ? data : [];
    },
    staleTime: 30_000,
  });

  const create = useMutation({
    mutationFn: async () => {
      const payload = normalizePayload(code, name);
      if (!payload) throw new Error("Faculty code and name are required");
      const res = await api.post("/api/masters/faculties", payload);
      return res.data;
    },
    onSuccess: async () => {
      toast.success("Faculty created");
      setCode("");
      setName("");
      setOpen(false);
      await qc.invalidateQueries({ queryKey: ["masters", "faculties"] });
    },
    onError: (err) => {
      toast.error(
        err?.response?.data?.message || err.message || "Failed to create faculty"
      );
    },
  });

  const rows = useMemo(() => {
    const arr = q.data || [];
    return arr
      .map((x) => ({
        id: x.id ?? x.faculty_id ?? "",
        code: x.code ?? x.short_code ?? "",
        name: x.name ?? x.title ?? x.program_name ?? "",
        is_active: Number(x.is_active ?? 1) === 1,
        raw: x,
      }))
      .sort((a, b) => String(a.code).localeCompare(String(b.code)));
  }, [q.data]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">Faculties / Programs</h3>
          <p className="text-sm text-muted-foreground">
            Example: MGMT, HUM, EDU, SCI, HM, CS.
          </p>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>Add Faculty</Button>
          </DialogTrigger>

          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add faculty</DialogTitle>
            </DialogHeader>

            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="space-y-2 sm:col-span-1">
                  <label className="text-sm font-medium">Code</label>
                  <Input
                    placeholder="MGMT"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                  />
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <label className="text-sm font-medium">Name</label>
                  <Input
                    placeholder="Management"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setOpen(false)}
                  disabled={create.isPending}
                >
                  Cancel
                </Button>
                <Button onClick={() => create.mutate()} disabled={create.isPending}>
                  {create.isPending ? "Saving..." : "Save"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-lg border">
        <div className="flex items-center justify-between p-3 border-b">
          <div className="text-sm font-medium">Faculty List</div>
          <div className="text-xs text-muted-foreground">
            {q.isLoading ? "Loading..." : `Total: ${rows.length}`}
          </div>
        </div>

        <div className="p-3">
          {q.isError ? (
            <div className="text-sm text-destructive">
              Failed to load faculties:{" "}
              {q.error?.response?.data?.message || q.error?.message || "Unknown error"}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[90px]">ID</TableHead>
                  <TableHead className="w-[120px]">Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="w-[140px]">Status</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                      {q.isLoading ? "Loading..." : "No faculties found."}
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((r) => (
                    <TableRow key={r.id || r.code}>
                      <TableCell className="font-mono text-xs">{r.id}</TableCell>
                      <TableCell className="font-mono text-xs">{r.code}</TableCell>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell>
                        {r.is_active ? (
                          <Badge variant="secondary">Active</Badge>
                        ) : (
                          <Badge variant="destructive">Inactive</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </div>
      </div>
    </div>
  );
}
