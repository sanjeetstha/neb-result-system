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

function normalizeCampusPayload(name) {
  const n = String(name ?? "").trim();
  if (!n) return null;
  return { name: n };
}

export default function CampusesPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  const campusesQuery = useQuery({
    queryKey: ["masters", "campuses"],
    queryFn: async () => {
      const res = await api.get("/api/masters/campuses");
      const data = res.data?.campuses ?? res.data?.data ?? res.data;
      return Array.isArray(data) ? data : [];
    },
    staleTime: 30_000,
  });

  const createCampus = useMutation({
    mutationFn: async () => {
      const payload = normalizeCampusPayload(name);
      if (!payload) throw new Error("Campus name is required");
      const res = await api.post("/api/masters/campuses", payload);
      return res.data;
    },
    onSuccess: async () => {
      toast.success("Campus created");
      setName("");
      setOpen(false);
      await qc.invalidateQueries({ queryKey: ["masters", "campuses"] });
    },
    onError: (err) => {
      toast.error(err?.response?.data?.message || err.message || "Failed to create campus");
    },
  });

  const rows = useMemo(() => {
    const arr = campusesQuery.data || [];
    // normalize common keys: id/name/created_at
    return arr.map((x) => ({
    id: x.id ?? "",
    code: x.code ?? "",
    name: x.name ?? "",
    address: x.address ?? "",
    email: x.email ?? "",
    is_active: Number(x.is_active ?? 1) === 1,
    raw: x,
    }));

  }, [campusesQuery.data]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Campuses</h2>
          <p className="text-sm text-muted-foreground">
            Manage campuses used in NEB result masters.
          </p>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>Add Campus</Button>
          </DialogTrigger>

          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add new campus</DialogTitle>
            </DialogHeader>

            <div className="space-y-3">
              <div className="space-y-2">
                <label className="text-sm font-medium">Campus name</label>
                <Input
                  placeholder="e.g., Gaurishankar Multiple Campus"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setOpen(false)}
                  disabled={createCampus.isPending}
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => createCampus.mutate()}
                  disabled={createCampus.isPending}
                >
                  {createCampus.isPending ? "Saving..." : "Save"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-lg border">
        <div className="flex items-center justify-between p-3 border-b">
          <div className="text-sm font-medium">Campus List</div>
          <div className="text-xs text-muted-foreground">
            {campusesQuery.isLoading
              ? "Loading..."
              : `Total: ${rows.length}`}
          </div>
        </div>

        <div className="p-3">
          {campusesQuery.isError ? (
            <div className="text-sm text-destructive">
              Failed to load campuses:{" "}
              {campusesQuery.error?.response?.data?.message ||
                campusesQuery.error?.message ||
                "Unknown error"}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[70px]">ID</TableHead>
                  <TableHead className="w-[90px]">Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="hidden lg:table-cell">Address</TableHead>
                  <TableHead className="hidden md:table-cell">Email</TableHead>
                  <TableHead className="w-[110px]">Status</TableHead>
                </TableRow>
              </TableHeader>


              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                      {campusesQuery.isLoading ? "Loading..." : "No campuses found."}
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs">{r.id}</TableCell>
                    <TableCell className="font-mono text-xs">{r.code || "—"}</TableCell>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell className="hidden lg:table-cell">{r.address || "—"}</TableCell>
                    <TableCell className="hidden md:table-cell">{r.email || "—"}</TableCell>
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
