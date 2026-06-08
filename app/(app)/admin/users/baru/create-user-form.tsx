"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Eye, EyeOff, RefreshCw, Tag } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Role } from "@/lib/auth/current-user";
import { createUser } from "@/server-actions/admin/create-user";
import {
  AliasInputSection,
  type AliasState,
  type RoleColumn,
} from "@/components/alias/alias-input-section";

function generatePassword(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 10; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

type Division = { code: string; name: string };
type RoleOption = { value: Role; label: string; description: string };
type Assignment = { divisionCode: string; role: Role };

export function CreateUserForm({
  divisions,
  roles,
  roleColumns,
}: {
  divisions: Division[];
  roles: RoleOption[];
  roleColumns: RoleColumn[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState(() => generatePassword());
  const [showPassword, setShowPassword] = useState(true);
  const [assignments, setAssignments] = useState<Assignment[]>([
    { divisionCode: divisions[0]?.code ?? "", role: "staff" },
  ]);
  const [aliases, setAliases] = useState<AliasState>({});
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  function addAssignment() {
    const used = new Set(assignments.map((a) => a.divisionCode));
    const next = divisions.find((d) => !used.has(d.code));
    if (!next) return;
    setAssignments([...assignments, { divisionCode: next.code, role: "staff" }]);
  }

  function removeAssignment(index: number) {
    setAssignments(assignments.filter((_, i) => i !== index));
  }

  function updateAssignment(index: number, patch: Partial<Assignment>) {
    setAssignments(
      assignments.map((a, i) => (i === index ? { ...a, ...patch } : a))
    );
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setWarnings([]);

    if (password.length < 6) {
      setError("Password sementara minimal 6 karakter.");
      return;
    }

    // Flatten alias state
    const aliasList: { roleCode: string; aliasText: string }[] = [];
    for (const [roleCode, list] of Object.entries(aliases)) {
      for (const a of list) aliasList.push({ roleCode, aliasText: a });
    }

    startTransition(async () => {
      const res = await createUser({
        email,
        fullName,
        password,
        assignments: assignments.filter((a) => a.divisionCode),
        aliases: aliasList,
      });

      if (!res.ok) {
        setError(res.error);
        return;
      }

      if (res.aliasErrors && res.aliasErrors.length > 0) {
        setWarnings(res.aliasErrors);
        // tetap lanjut, tapi tampilkan warning. Beri jeda 2.5s biar user baca.
        setTimeout(() => {
          router.push("/admin/users");
          router.refresh();
        }, 2500);
        return;
      }

      router.push("/admin/users");
      router.refresh();
    });
  }

  const selectedDivisionCodes = assignments.map((a) => a.divisionCode);

  return (
    <form
      onSubmit={submit}
      className="space-y-6 rounded-3xl border border-neutral-100 bg-white p-8"
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="nama@redigma.com"
            required
            className="h-11 rounded-2xl"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="full_name">Nama Lengkap</Label>
          <Input
            id="full_name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Budi Santoso"
            className="h-11 rounded-2xl"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Password Sementara</Label>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min 6 karakter"
              required
              minLength={6}
              className="h-11 rounded-2xl pr-12 font-mono"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700"
              aria-label={showPassword ? "Sembunyikan" : "Tampilkan"}
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
          <button
            type="button"
            onClick={() => setPassword(generatePassword())}
            className="inline-flex h-11 items-center gap-1.5 rounded-2xl border border-neutral-200 bg-white px-3 text-xs font-medium text-neutral-700 transition hover:bg-neutral-50"
            title="Generate password acak"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Acak
          </button>
        </div>
        <p className="rounded-2xl bg-blue-50 px-4 py-3 text-xs text-blue-800">
          💡 Catat password ini & berikan ke user. Mereka bisa ubah sendiri
          lewat menu <strong>Pengaturan → Ubah Password</strong> setelah login.
        </p>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>Divisi & Role</Label>
          <button
            type="button"
            onClick={addAssignment}
            disabled={assignments.length >= divisions.length}
            className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-3 py-1.5 text-xs font-medium text-neutral-700 transition hover:bg-neutral-200 disabled:opacity-50"
          >
            <Plus className="h-3 w-3" />
            Tambah Divisi
          </button>
        </div>

        <div className="space-y-2">
          {assignments.map((a, i) => (
            <div
              key={i}
              className="flex items-center gap-2 rounded-2xl border border-neutral-200 bg-neutral-50/50 p-2"
            >
              <select
                value={a.divisionCode}
                onChange={(e) =>
                  updateAssignment(i, { divisionCode: e.target.value })
                }
                className="h-10 flex-1 rounded-xl border border-neutral-200 bg-white px-3 text-sm"
              >
                {divisions.map((d) => (
                  <option
                    key={d.code}
                    value={d.code}
                    disabled={
                      d.code !== a.divisionCode &&
                      assignments.some((x) => x.divisionCode === d.code)
                    }
                  >
                    {d.name}
                  </option>
                ))}
              </select>

              <select
                value={a.role}
                onChange={(e) =>
                  updateAssignment(i, { role: e.target.value as Role })
                }
                className="h-10 w-44 rounded-xl border border-neutral-200 bg-white px-3 text-sm"
              >
                {roles.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>

              {assignments.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeAssignment(i)}
                  className="rounded-xl p-2 text-neutral-500 hover:bg-neutral-100 hover:text-red-600"
                  aria-label="Hapus assignment"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Section: Nama di Excel (Alias) */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Tag className="h-4 w-4 text-neutral-500" />
          <Label>Nama di Excel (Alias)</Label>
        </div>
        <p className="rounded-2xl bg-amber-50 px-4 py-3 text-xs text-amber-900">
          💡 Daftarkan nama yang muncul di file Excel transaksi (misal{" "}
          <code className="rounded bg-white px-1.5 py-0.5">Cs.Budi</code>,{" "}
          <code className="rounded bg-white px-1.5 py-0.5">Budi CS</code>).
          Setiap nama dianggap &ldquo;ini orang yang sama&rdquo;. Transaksi yang
          namanya match akan otomatis nyambung ke akun ini. Bisa tambah belakangan
          lewat halaman Edit User.
        </p>
        <AliasInputSection
          roleColumns={roleColumns}
          selectedDivisionCodes={selectedDivisionCodes}
          value={aliases}
          onChange={setAliases}
        />
      </div>

      {error && (
        <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}
      {warnings.length > 0 && (
        <div className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-semibold">User berhasil dibuat dengan catatan:</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="mesh-blue h-11 rounded-2xl px-6 text-sm font-semibold text-white shadow-md transition hover:opacity-90 active:translate-y-px disabled:opacity-50"
        >
          {pending ? "Menyimpan..." : "Buat User"}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          disabled={pending}
          className="h-11 rounded-2xl border border-neutral-200 bg-white px-6 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50"
        >
          Batal
        </button>
      </div>
    </form>
  );
}
