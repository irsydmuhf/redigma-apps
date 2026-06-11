import { getCurrentLmsUser } from "@/lib/lms/current-user";
import { getReportRows } from "@/lib/lms/reports";
import { renderReportPdf } from "@/lib/lms/report-pdf";
import { createAdminClient } from "@/lib/supabase/admin";
import * as XLSX from "xlsx";

const STATUS_LABEL: Record<string, string> = { active: "Aktif", completed: "Lulus" };

export async function GET(req: Request) {
  const me = await getCurrentLmsUser();
  if (!me || (me.role !== "manager" && me.role !== "admin")) {
    return new Response("Forbidden", { status: 403 });
  }

  const url = new URL(req.url);
  const format = url.searchParams.get("format") === "pdf" ? "pdf" : "xlsx";
  const program = url.searchParams.get("program");

  const rows = await getReportRows(program);

  // Judul (nama program kalau difilter)
  let title = "Semua Program";
  if (program) {
    const admin = createAdminClient();
    const { data: prog } = await admin.from("lms_programs").select("name").eq("id", program).maybeSingle();
    title = prog?.name ?? "Program";
  }

  if (format === "pdf") {
    const buf = await renderReportPdf(rows, title);
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="laporan-progress-adv.pdf"`,
      },
    });
  }

  // Excel
  const sheetData = rows.map((r) => ({
    Nama: r.advName,
    Email: r.advEmail,
    Program: r.programName,
    Status: STATUS_LABEL[r.status] ?? r.status,
    "Progress (%)": r.progressPct,
    "Modul Selesai": `${r.completedModules}/${r.totalModules}`,
    "Rata2 Post-test": r.avgPostTest != null ? r.avgPostTest : "-",
    "Tanggal Lulus": r.graduationDate
      ? new Date(r.graduationDate).toLocaleDateString("id-ID", { dateStyle: "medium" })
      : "-",
  }));
  const ws = XLSX.utils.json_to_sheet(sheetData);
  ws["!cols"] = [{ wch: 22 }, { wch: 26 }, { wch: 24 }, { wch: 10 }, { wch: 12 }, { wch: 14 }, { wch: 16 }, { wch: 16 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Progress ADV");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="laporan-progress-adv.xlsx"`,
    },
  });
}
