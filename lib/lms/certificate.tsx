import React from "react";
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from "@react-pdf/renderer";

export type CertificateData = {
  advName: string;
  programName: string;
  milestoneName: string;
  managerName: string;
  dateText: string;
};

const styles = StyleSheet.create({
  page: {
    backgroundColor: "#ffffff",
    paddingVertical: 50,
    paddingHorizontal: 60,
    fontFamily: "Helvetica",
  },
  border: {
    flex: 1,
    borderWidth: 2,
    borderColor: "#1f2937",
    borderRadius: 8,
    padding: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  innerBorder: {
    position: "absolute",
    top: 10,
    left: 10,
    right: 10,
    bottom: 10,
    borderWidth: 0.5,
    borderColor: "#9ca3af",
    borderRadius: 6,
  },
  eyebrow: {
    fontSize: 12,
    letterSpacing: 4,
    color: "#6b7280",
    textTransform: "uppercase",
    marginBottom: 6,
  },
  title: {
    fontSize: 34,
    fontFamily: "Helvetica-Bold",
    color: "#111827",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 11,
    color: "#6b7280",
    marginBottom: 28,
  },
  presentedTo: {
    fontSize: 11,
    color: "#6b7280",
    marginBottom: 8,
  },
  name: {
    fontSize: 26,
    fontFamily: "Helvetica-Bold",
    color: "#1f2937",
    marginBottom: 8,
  },
  rule: {
    width: 240,
    borderBottomWidth: 1,
    borderBottomColor: "#d1d5db",
    marginBottom: 18,
  },
  body: {
    fontSize: 12,
    color: "#374151",
    textAlign: "center",
    lineHeight: 1.6,
    maxWidth: 460,
    marginBottom: 6,
  },
  programName: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    color: "#111827",
  },
  milestoneName: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    color: "#374151",
    marginBottom: 30,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
    paddingHorizontal: 40,
    marginTop: 10,
  },
  footerCol: {
    alignItems: "center",
    width: 200,
  },
  footerLine: {
    width: "100%",
    borderBottomWidth: 1,
    borderBottomColor: "#9ca3af",
    marginBottom: 6,
  },
  footerLabel: {
    fontSize: 9,
    color: "#6b7280",
  },
  footerValue: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: "#1f2937",
  },
});

function CertificateDoc({ advName, programName, milestoneName, managerName, dateText }: CertificateData) {
  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <View style={styles.border}>
          <View style={styles.innerBorder} />
          <Text style={styles.eyebrow}>Sertifikat Kelulusan</Text>
          <Text style={styles.title}>Certificate of Completion</Text>
          <Text style={styles.subtitle}>Redigma — Program Onboarding ADV</Text>

          <Text style={styles.presentedTo}>Diberikan kepada</Text>
          <Text style={styles.name}>{advName}</Text>
          <View style={styles.rule} />

          <Text style={styles.body}>
            atas keberhasilan menyelesaikan program onboarding
          </Text>
          <Text style={styles.programName}>{programName}</Text>
          <Text style={styles.milestoneName}>{milestoneName}</Text>

          <View style={styles.footer}>
            <View style={styles.footerCol}>
              <Text style={styles.footerValue}>{dateText}</Text>
              <View style={styles.footerLine} />
              <Text style={styles.footerLabel}>Tanggal</Text>
            </View>
            <View style={styles.footerCol}>
              <Text style={styles.footerValue}>{managerName}</Text>
              <View style={styles.footerLine} />
              <Text style={styles.footerLabel}>Manager</Text>
            </View>
          </View>
        </View>
      </Page>
    </Document>
  );
}

/** Render sertifikat ke Buffer PDF (dipanggil dari server action). */
export async function generateCertificatePdf(data: CertificateData): Promise<Buffer> {
  return renderToBuffer(<CertificateDoc {...data} />);
}
