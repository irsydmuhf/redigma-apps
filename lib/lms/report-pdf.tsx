import React from "react";
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import type { ReportRow } from "@/lib/lms/reports";

const styles = StyleSheet.create({
  page: { padding: 28, fontFamily: "Helvetica", fontSize: 9, color: "#111827" },
  title: { fontSize: 16, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  subtitle: { fontSize: 9, color: "#6b7280", marginBottom: 12 },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#e5e7eb" },
  headRow: { flexDirection: "row", backgroundColor: "#07569d" },
  headCell: { color: "#fff", fontFamily: "Helvetica-Bold", padding: 5, fontSize: 8 },
  cell: { padding: 5, fontSize: 8 },
  cName: { width: "20%" },
  cProg: { width: "22%" },
  cStat: { width: "12%" },
  cProgr: { width: "16%" },
  cScore: { width: "12%" },
  cDate: { width: "18%" },
});

const STATUS_LABEL: Record<string, string> = {
  active: "Aktif",
  completed: "Lulus",
};

function ReportDoc({ rows, title }: { rows: ReportRow[]; title: string }) {
  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <Text style={styles.title}>Laporan Progress ADV</Text>
        <Text style={styles.subtitle}>
          {title} · {rows.length} ADV
        </Text>

        <View style={styles.headRow}>
          <Text style={[styles.headCell, styles.cName]}>Nama</Text>
          <Text style={[styles.headCell, styles.cProg]}>Program</Text>
          <Text style={[styles.headCell, styles.cStat]}>Status</Text>
          <Text style={[styles.headCell, styles.cProgr]}>Progress</Text>
          <Text style={[styles.headCell, styles.cScore]}>Rata2 Post-test</Text>
          <Text style={[styles.headCell, styles.cDate]}>Tanggal Lulus</Text>
        </View>

        {rows.map((r, i) => (
          <View key={i} style={styles.row} wrap={false}>
            <Text style={[styles.cell, styles.cName]}>{r.advName}</Text>
            <Text style={[styles.cell, styles.cProg]}>{r.programName}</Text>
            <Text style={[styles.cell, styles.cStat]}>{STATUS_LABEL[r.status] ?? r.status}</Text>
            <Text style={[styles.cell, styles.cProgr]}>
              {r.progressPct}% ({r.completedModules}/{r.totalModules})
            </Text>
            <Text style={[styles.cell, styles.cScore]}>{r.avgPostTest != null ? `${r.avgPostTest}%` : "-"}</Text>
            <Text style={[styles.cell, styles.cDate]}>
              {r.graduationDate
                ? new Date(r.graduationDate).toLocaleDateString("id-ID", { dateStyle: "medium" })
                : "-"}
            </Text>
          </View>
        ))}
      </Page>
    </Document>
  );
}

export async function renderReportPdf(rows: ReportRow[], title: string): Promise<Buffer> {
  return renderToBuffer(<ReportDoc rows={rows} title={title} />);
}
