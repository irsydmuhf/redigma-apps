import { getCurrentUser } from "@/lib/auth/current-user";
import { redirect } from "next/navigation";
import { UploadWizard } from "./upload-wizard";

export default async function UploadPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const uploadableDivisions = user.isAdmin
    ? user.divisions
    : user.divisions.filter((d) =>
        ["staff", "spv", "head"].includes(d.role)
      );

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight text-neutral-900">
          Upload Data
        </h1>
        <p className="text-sm text-neutral-600">
          Unggah file CSV atau Excel (.xlsx, .xls). Sistem akan mendeteksi
          schema otomatis, lalu simpan ke Supabase sebagai tabel rapi.
        </p>
      </div>

      {uploadableDivisions.length === 0 ? (
        <div className="rounded-3xl border border-neutral-100 bg-white p-8 text-center">
          <p className="text-sm text-neutral-600">
            Anda tidak punya divisi dengan role Staff/SPV/Head, jadi tidak bisa
            upload dataset. Hubungi Admin Data IT untuk assign role.
          </p>
        </div>
      ) : (
        <UploadWizard
          divisions={uploadableDivisions.map((d) => ({
            code: d.divisionCode,
            name: d.divisionName,
          }))}
          defaultDivisionCode={
            user.activeDivisionCode &&
            uploadableDivisions.some(
              (d) => d.divisionCode === user.activeDivisionCode
            )
              ? user.activeDivisionCode
              : uploadableDivisions[0].divisionCode
          }
        />
      )}
    </div>
  );
}
