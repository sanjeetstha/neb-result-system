import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

import { api } from "../../lib/api";
import { useMe } from "../../lib/useMe";

import { Card, CardContent } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Separator } from "../../components/ui/separator";

function isValidEmail(email) {
  const s = String(email || "").trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

export default function AddUserPage() {
  const { data: me, isLoading: meLoading } = useMe();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("TEACHER");
  const [result, setResult] = useState(null);

  const canAccess = useMemo(() => me?.role === "SUPER_ADMIN", [me]);

  const createUser = useMutation({
    mutationFn: async (payload) => {
      const res = await api.post("/api/auth/create-user", payload);
      return res.data;
    },
    onSuccess: (data) => {
      setResult({
        id: data?.user_id,
        full_name: fullName.trim(),
        email: email.trim(),
        role,
      });
      toast.success("User created");
      setFullName("");
      setEmail("");
      setPassword("");
      setRole("TEACHER");
    },
    onError: (err) => {
      const msg =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        "Failed to create user";
      toast.error(msg);
    },
  });

  const onSubmit = (e) => {
    e?.preventDefault?.();

    const name = fullName.trim();
    const em = email.trim();
    const pwd = String(password || "");

    if (!name) return toast.error("Full name is required");
    if (!isValidEmail(em)) return toast.error("Enter a valid email");
    if (!pwd || pwd.length < 6) return toast.error("Password must be at least 6 characters");
    if (!role) return toast.error("Select a role");

    createUser.mutate({ full_name: name, email: em, password: pwd, role });
  };

  if (meLoading) {
    return (
      <div className="p-4">
        <div className="text-sm text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!canAccess) {
    return (
      <div className="p-4">
        <Card className="max-w-2xl">
          <CardContent className="p-4">
            <div className="text-lg font-semibold">Access denied</div>
            <div className="text-sm text-muted-foreground mt-1">
              Only <span className="font-medium">SUPER_ADMIN</span> can create users.
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div>
        <div className="text-xl font-semibold">Add User</div>
        <div className="text-sm text-muted-foreground">
          Create a new ADMIN / TEACHER / STUDENT account.
        </div>
      </div>

      <Card className="max-w-3xl">
        <CardContent className="p-4">
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <div className="text-sm font-medium">Full name</div>
                <Input
                  placeholder="Full name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  autoComplete="off"
                />
              </div>

              <div className="space-y-1">
                <div className="text-sm font-medium">Email</div>
                <Input
                  placeholder="user@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="off"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
              <div className="space-y-1">
                <div className="text-sm font-medium">Password</div>
                <Input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                />
              </div>

              <div className="space-y-1">
                <div className="text-sm font-medium">Role</div>
                <select
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                >
                  <option value="ADMIN">ADMIN</option>
                  <option value="TEACHER">TEACHER</option>
                  <option value="STUDENT">STUDENT</option>
                </select>
              </div>

              <div className="flex md:justify-end">
                <Button type="submit" disabled={createUser.isPending} className="min-w-[160px]">
                  {createUser.isPending ? "Creating..." : "Create User"}
                </Button>
              </div>
            </div>
          </form>

          <Separator className="my-4" />

          {!result ? (
            <div className="text-sm text-muted-foreground">No user created in this session.</div>
          ) : (
            <div className="text-sm">
              Created user:{" "}
              <span className="font-medium">
                {result.full_name} ({result.email})
              </span>{" "}
              as <span className="font-medium">{result.role}</span>
              {result.id ? (
                <>
                  {" "}
                  • ID: <span className="font-medium">{result.id}</span>
                </>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
