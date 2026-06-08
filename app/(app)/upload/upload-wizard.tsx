"use client";

import { useState, useMemo, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Upload as UploadIcon,
  FileText,
  AlertCircle,
  CheckCircle2,
  Sparkles,
  Link2,
  KeyRound,
  SkipForward,
  GitMerge,
  Plus,
  X,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  parseSpreadsheetFile,
  type ParsedCsv,
} from "@/lib/csv/parse";
import type { DataType } from "@/lib/csv/detect";
import {
  buildNormalizedGrid,
  computeGridStats,
  rowHasError,
  type NormalizedCell,
} from "@/lib/csv/normalize";
import { normalizePhysicalName } from "@/lib/schema/naming";
import {
  detectConvention,
  conventionLabel,
  conventionSystemColumn,
  type Convention,
} from "@/lib/schema/conventions";
import type { DatasetMatch } from "@/lib/schema/smart-match";
import { hashFile, buildRowKey } from "@/lib/csv/hash";
import { createDataset } from "@/server-actions/datasets/create-dataset";
import { getDatasetMatches } from "@/server-actions/datasets/get-matches";
import {
  appendToDataset,
  type DedupMode,
} from "@/server-actions/datasets/append-to-dataset";
import {
  checkFileHash,
  type FileHashCheckResult,
} from "@/server-actions/datasets/check-file-hash";
import { uploadRawFileClient } from "@/lib/storage/upload-raw-client";
import { createLargeDataset } from "@/server-actions/datasets/create-large-dataset";
import { appendLargeDataset } from "@/server-actions/datasets/append-large-dataset";
import { triggerImport } from "@/server-actions/datasets/trigger-import";

const LARGE_FILE_THRESHOLD = 5 * 1024 * 1024; // 5 MB

type Division = { code: string; name: string };

type EditableColumn = {
  displayName: string;
  physicalName: string;
  dataType: DataType;
  isUniqueKey: boolean;
  convention: Convention | null;
};

const DATA_TYPE_LABEL: Record<DataType, string> = {
  text: "Teks",
  number: "Angka",
  currency: "Mata Uang",
  date: "Tanggal",
  boolean: "Ya/Tidak",
  phone: "Telepon / WA",
  email: "Email",
};

const PREVIEW_LIMIT = 100;

export function UploadWizard({
  divisions,
  defaultDivisionCode,
}: {
  divisions: Division[];
  defaultDivisionCode: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [step, setStep] = useState<"file" | "schema">("file");

  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);

  const [displayName, setDisplayName] = useState("");
  const [divisionCode, setDivisionCode] = useState(defaultDivisionCode);
  const [columns, setColumns] = useState<EditableColumn[]>([]);
  const [skippedRows, setSkippedRows] = useState<Set<number>>(new Set());
  const [showOnlyErrors, setShowOnlyErrors] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [cellEdits, setCellEdits] = useState<Map<string, string>>(new Map());

  // === Smart match state ===
  const [matches, setMatches] = useState<DatasetMatch[]>([]);
  const [matchingPending, setMatchingPending] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<DatasetMatch | null>(null);
  const [addColumnDecisions, setAddColumnDecisions] = useState<
    Map<string, boolean>
  >(new Map());

  // === Phase 6: file hash + dedup + raw upload state ===
  const [rawFile, setRawFile] = useState<File | null>(null);
  const [fileHash, setFileHash] = useState<string | null>(null);
  const [fileHashCheck, setFileHashCheck] =
    useState<FileHashCheckResult | null>(null);
  const [dismissedHashWarning, setDismissedHashWarning] = useState(false);
  const [dedupMode, setDedupMode] = useState<DedupMode>("skip");
  const [isBackfill, setIsBackfill] = useState(false);

  // Hasil submit (untuk show post-import summary)
  const [submitResult, setSubmitResult] = useState<{
    datasetId: string;
    rowsInserted: number;
    rowsSkipped: number;
    rowsUpdated: number;
    mode: "create" | "append";
  } | null>(null);

  const mode: "create" | "append" = selectedMatch ? "append" : "create";

  // Re-fetch matches saat divisi atau kolom CSV berubah
  useEffect(() => {
    if (!parsed || step !== "schema") return;
    const physicalNames = columns.map((c) => c.physicalName);
    if (physicalNames.length === 0) return;

    let cancelled = false;
    // Async kick-off via microtask supaya setState tidak sync di body effect
    (async () => {
      if (cancelled) return;
      setMatchingPending(true);
      try {
        const results = await getDatasetMatches(divisionCode, physicalNames);
        if (!cancelled) setMatches(results);
      } finally {
        if (!cancelled) setMatchingPending(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsed, divisionCode, columns.map((c) => c.physicalName).join("|"), step]);

  // === Effective rows + grid (sama seperti Phase 4) ===
  const effectiveRows = useMemo(() => {
    if (!parsed) return [];
    return parsed.rows.map((row, ri) => {
      const out: Record<string, string> = {};
      for (const col of columns) {
        const editKey = `${ri}:${col.physicalName}`;
        const edited = cellEdits.get(editKey);
        out[col.displayName] =
          edited !== undefined ? edited : String(row[col.displayName] ?? "");
      }
      return out;
    });
  }, [parsed, columns, cellEdits]);

  const grid = useMemo(() => {
    if (!parsed || columns.length === 0) return [];
    return buildNormalizedGrid(
      effectiveRows.map((r) => {
        const out: Record<string, string> = {};
        for (const col of columns) {
          out[col.displayName] = r[col.displayName] ?? "";
        }
        return out;
      }),
      columns.map((c) => ({
        displayName: c.displayName,
        physicalName: c.physicalName,
        dataType: c.dataType,
      }))
    );
  }, [parsed, columns, effectiveRows]);

  const stats = useMemo(
    () => computeGridStats(grid, skippedRows),
    [grid, skippedRows]
  );

  const visibleRows = useMemo(() => {
    if (!showOnlyErrors) return grid.map((_, i) => i).slice(0, PREVIEW_LIMIT);
    return grid
      .map((_, i) => i)
      .filter((i) => !skippedRows.has(i) && rowHasError(grid[i]))
      .slice(0, PREVIEW_LIMIT);
  }, [grid, showOnlyErrors, skippedRows]);

  const canSubmit =
    !!parsed &&
    (mode === "append"
      ? selectedMatch !== null
      : displayName.trim().length > 0) &&
    stats.errorRows === 0 &&
    stats.validRows > 0;

  async function handleFile(picked: File) {
    setParseError(null);
    setParsing(true);
    setCellEdits(new Map());
    setSkippedRows(new Set());
    setSelectedMatch(null);
    setAddColumnDecisions(new Map());
    setMatches([]);
    setRawFile(null);
    setFileHash(null);
    setFileHashCheck(null);
    setDismissedHashWarning(false);
    setSubmitResult(null);
    try {
      const [result, hash] = await Promise.all([
        parseSpreadsheetFile(picked),
        hashFile(picked),
      ]);
      setParsed(result);
      setRawFile(picked);
      setFileHash(hash);
      setColumns(
        result.columns.map((c) => ({
          displayName: c.displayName,
          physicalName: c.physicalName,
          dataType: c.dataType,
          isUniqueKey: false,
          convention: detectConvention(c.displayName),
        }))
      );
      setDisplayName(
        picked.name.replace(/\.(csv|tsv|txt|xlsx|xls|xlsm)$/i, "")
      );
      setStep("schema");

      // Check apakah file hash sudah pernah di-upload
      checkFileHash(hash)
        .then(setFileHashCheck)
        .catch(() => setFileHashCheck(null));
    } catch (e: unknown) {
      setParseError(
        e instanceof Error ? e.message : "Gagal membaca file."
      );
    } finally {
      setParsing(false);
    }
  }

  function updateColumn(index: number, patch: Partial<EditableColumn>) {
    setColumns((cols) =>
      cols.map((c, i) => (i === index ? { ...c, ...patch } : c))
    );
  }

  function handleColumnDisplayName(index: number, newName: string) {
    updateColumn(index, {
      displayName: newName,
      physicalName: normalizePhysicalName(newName),
      convention: detectConvention(newName),
    });
  }

  function editCell(rowIndex: number, physicalName: string, value: string) {
    setCellEdits((prev) => {
      const next = new Map(prev);
      next.set(`${rowIndex}:${physicalName}`, value);
      return next;
    });
  }

  function toggleRowSkip(rowIndex: number) {
    setSkippedRows((prev) => {
      const next = new Set(prev);
      if (next.has(rowIndex)) next.delete(rowIndex);
      else next.add(rowIndex);
      return next;
    });
  }

  function bulkSkipAllErrors() {
    const errorIndices = grid
      .map((row, i) => (rowHasError(row) ? i : -1))
      .filter((i) => i >= 0);
    setSkippedRows(new Set(errorIndices));
  }

  function clearSkipped() {
    setSkippedRows(new Set());
  }

  function chooseAppendTarget(match: DatasetMatch) {
    setSelectedMatch(match);
    // Default: tambah semua kolom baru
    const decisions = new Map<string, boolean>();
    for (const c of match.newColumns) {
      decisions.set(c, true);
    }
    setAddColumnDecisions(decisions);
  }

  function cancelAppend() {
    setSelectedMatch(null);
    setAddColumnDecisions(new Map());
  }

  function toggleAddColumn(physicalName: string) {
    setAddColumnDecisions((prev) => {
      const next = new Map(prev);
      next.set(physicalName, !(next.get(physicalName) ?? true));
      return next;
    });
  }

  // Upload raw file ke Storage langsung dari browser, return path (atau null kalau gagal/skip)
  async function uploadRawIfPresent(): Promise<string | null> {
    if (!rawFile) return null;
    const tempId = crypto.randomUUID();
    const res = await uploadRawFileClient(tempId, rawFile);
    if (!res.ok) {
      // Non-fatal: log saja, lanjut tanpa raw backup
      console.warn("Upload raw file gagal:", res.error);
      return null;
    }
    return res.path;
  }

  async function submit() {
    if (!parsed) return;
    setSubmitError(null);

    if (mode === "append" && selectedMatch) {
      await submitAppend(selectedMatch);
      return;
    }
    await submitCreate();
  }

  const isLargeFile = rawFile !== null && rawFile.size >= LARGE_FILE_THRESHOLD;

  async function submitCreate() {
    if (isLargeFile && rawFile && fileHash) {
      return await submitCreateLarge();
    }
    const uniqueColNames = columns
      .filter((c) => c.isUniqueKey)
      .map((c) => c.physicalName);

    const rowsToInsert: Record<string, unknown>[] = [];
    grid.forEach((normRow, i) => {
      if (skippedRows.has(i)) return;
      if (rowHasError(normRow)) return;
      const record: Record<string, unknown> = {};
      for (const col of columns) {
        const cell = normRow[col.physicalName];
        record[col.physicalName] = cell.value;
        if (col.convention && cell.value !== null && cell.value !== undefined) {
          record[conventionSystemColumn(col.convention)] = String(cell.value);
        }
      }
      // Phase 6: compute _row_hash kalau ada unique key
      const rowKey = buildRowKey(record, uniqueColNames);
      if (rowKey) record._row_hash = rowKey;
      rowsToInsert.push(record);
    });

    if (rowsToInsert.length === 0) {
      setSubmitError("Tidak ada baris valid untuk di-import.");
      return;
    }

    startTransition(async () => {
      const rawPath = await uploadRawIfPresent();

      const res = await createDataset({
        displayName,
        divisionCode,
        columns: columns.map((c) => ({
          physicalName: c.physicalName,
          displayName: c.displayName,
          dataType: c.dataType,
          isUniqueKey: c.isUniqueKey,
        })),
        rows: rowsToInsert,
        fileName: rawFile?.name,
        fileHash: fileHash ?? undefined,
        rawFileUrl: rawPath ?? undefined,
        isBackfill,
      });

      if (!res.ok) {
        setSubmitError(res.error);
        return;
      }

      setSubmitResult({
        datasetId: res.datasetId,
        rowsInserted: res.rowsInserted,
        rowsSkipped: 0,
        rowsUpdated: 0,
        mode: "create",
      });
    });
  }

  async function submitCreateLarge() {
    if (!rawFile || !fileHash || !parsed) return;
    startTransition(async () => {
      const tempId = crypto.randomUUID();
      const upRes = await uploadRawFileClient(tempId, rawFile);
      if (!upRes.ok) {
        setSubmitError(`Upload raw file gagal: ${upRes.error}`);
        return;
      }

      const res = await createLargeDataset({
        displayName,
        divisionCode,
        columns: columns.map((c) => ({
          physicalName: c.physicalName,
          displayName: c.displayName,
          dataType: c.dataType,
          isUniqueKey: c.isUniqueKey,
        })),
        fileName: rawFile.name,
        fileHash,
        rawFileUrl: upRes.path,
        estimatedRows: parsed.rowCount,
        isBackfill,
      });

      if (!res.ok) {
        setSubmitError(res.error);
        return;
      }

      const trigRes = await triggerImport(res.importJobId);
      if (!trigRes.ok) {
        setSubmitError(
          `Dataset & job sudah dibuat, tapi gagal memicu Edge Function: ${trigRes.error}`
        );
        return;
      }
      router.push(`/datasets/${res.datasetId}?job=${res.importJobId}`);
    });
  }

  async function submitAppendLarge(match: DatasetMatch) {
    if (!rawFile || !fileHash || !parsed) return;
    const addCols = columns
      .filter(
        (c) =>
          match.newColumns.includes(c.physicalName) &&
          (addColumnDecisions.get(c.physicalName) ?? true)
      )
      .map((c) => ({
        physicalName: c.physicalName,
        displayName: c.displayName,
        dataType: c.dataType,
        isUniqueKey: c.isUniqueKey,
      }));

    startTransition(async () => {
      const tempId = crypto.randomUUID();
      const upRes = await uploadRawFileClient(tempId, rawFile);
      if (!upRes.ok) {
        setSubmitError(`Upload raw file gagal: ${upRes.error}`);
        return;
      }

      const res = await appendLargeDataset({
        datasetId: match.id,
        addColumns: addCols,
        fileName: rawFile.name,
        fileHash,
        rawFileUrl: upRes.path,
        estimatedRows: parsed.rowCount,
        dedupMode,
        isBackfill,
      });

      if (!res.ok) {
        setSubmitError(res.error);
        return;
      }

      const trigRes = await triggerImport(res.importJobId);
      if (!trigRes.ok) {
        setSubmitError(
          `Dataset & job sudah dibuat, tapi gagal memicu Edge Function: ${trigRes.error}`
        );
        return;
      }
      router.push(`/datasets/${res.datasetId}?job=${res.importJobId}`);
    });
  }

  async function submitAppend(match: DatasetMatch) {
    if (isLargeFile && rawFile && fileHash) {
      return await submitAppendLarge(match);
    }
    const addCols = columns
      .filter(
        (c) =>
          match.newColumns.includes(c.physicalName) &&
          (addColumnDecisions.get(c.physicalName) ?? true)
      )
      .map((c) => ({
        physicalName: c.physicalName,
        displayName: c.displayName,
        dataType: c.dataType,
        isUniqueKey: c.isUniqueKey,
      }));

    const existingCols = new Set(match.columns.map((c) => c.physicalName));
    const acceptedNew = new Set(addCols.map((c) => c.physicalName));
    const includedCols = new Set([...existingCols, ...acceptedNew]);

    // Unique columns berasal dari existing dataset metadata
    const uniqueColNames = match.columns
      .filter((c) => columns.find((x) => x.physicalName === c.physicalName)?.isUniqueKey)
      .map((c) => c.physicalName);

    const rowsToInsert: Record<string, unknown>[] = [];
    grid.forEach((normRow, i) => {
      if (skippedRows.has(i)) return;
      if (rowHasError(normRow)) return;
      const record: Record<string, unknown> = {};
      for (const col of columns) {
        if (!includedCols.has(col.physicalName)) continue;
        const cell = normRow[col.physicalName];
        record[col.physicalName] = cell.value;
        if (col.convention && cell.value !== null && cell.value !== undefined) {
          record[conventionSystemColumn(col.convention)] = String(cell.value);
        }
      }
      const rowKey = buildRowKey(record, uniqueColNames);
      if (rowKey) record._row_hash = rowKey;
      rowsToInsert.push(record);
    });

    if (rowsToInsert.length === 0) {
      setSubmitError("Tidak ada baris valid untuk di-append.");
      return;
    }

    startTransition(async () => {
      const rawPath = await uploadRawIfPresent();

      const res = await appendToDataset({
        datasetId: match.id,
        addColumns: addCols,
        rows: rowsToInsert,
        fileName: rawFile?.name,
        fileHash: fileHash ?? undefined,
        rawFileUrl: rawPath ?? undefined,
        isBackfill,
        dedupMode,
      });

      if (!res.ok) {
        setSubmitError(res.error);
        return;
      }

      setSubmitResult({
        datasetId: res.datasetId,
        rowsInserted: res.rowsInserted,
        rowsSkipped: res.rowsSkipped,
        rowsUpdated: res.rowsUpdated,
        mode: "append",
      });
    });
  }

  // === STEP 1: file picker ===
  if (step === "file") {
    return (
      <div className="rounded-3xl border border-neutral-100 bg-white p-8">
        <label
          htmlFor="csv-file"
          className="mesh-soft flex cursor-pointer flex-col items-center justify-center gap-4 rounded-3xl border-2 border-dashed border-neutral-200 px-6 py-16 text-center transition hover:border-neutral-300"
        >
          <div className="mesh-blue grid h-14 w-14 place-items-center rounded-3xl text-white shadow-md">
            <UploadIcon className="h-6 w-6" />
          </div>
          <div>
            <p className="text-base font-semibold text-neutral-900">
              {parsing ? "Membaca file..." : "Klik untuk pilih file CSV / Excel"}
            </p>
            <p className="mt-1 text-sm text-neutral-500">
              Format: .csv, .xlsx, .xls. Maksimal 5 MB untuk Phase 3
            </p>
          </div>
          <input
            id="csv-file"
            type="file"
            accept=".csv,.tsv,.txt,.xlsx,.xls,.xlsm,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
            disabled={parsing}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
            className="hidden"
          />
        </label>

        {parseError && (
          <p className="mt-4 flex items-start gap-2 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {parseError}
          </p>
        )}
      </div>
    );
  }

  // === STEP 2: schema editor + cleaning preview ===
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="min-w-0 space-y-6">
        {/* ===== POST-IMPORT SUMMARY MODAL ===== */}
        {submitResult && (
          <SuccessSummary
            result={submitResult}
            onView={() => router.push(`/datasets/${submitResult.datasetId}`)}
            onUploadAnother={() => {
              setStep("file");
              setParsed(null);
              setColumns([]);
              setDisplayName("");
              setCellEdits(new Map());
              setSkippedRows(new Set());
              setSelectedMatch(null);
              setMatches([]);
              setRawFile(null);
              setFileHash(null);
              setFileHashCheck(null);
              setSubmitResult(null);
            }}
          />
        )}

        {/* ===== FILE HASH WARNING ===== */}
        {fileHashCheck?.exists &&
          !dismissedHashWarning &&
          !submitResult && (
            <FileHashWarning
              check={fileHashCheck}
              onDismiss={() => setDismissedHashWarning(true)}
            />
          )}

        {/* ===== LARGE FILE BANNER ===== */}
        {isLargeFile && rawFile && !submitResult && (
          <LargeFileBanner sizeMb={rawFile.size / 1024 / 1024} />
        )}

        {/* ===== SMART MATCH BANNER ===== */}
        {mode === "create" && matches.length > 0 && !submitResult && (
          <MatchBanner matches={matches} onChoose={chooseAppendTarget} />
        )}

        {/* ===== APPEND MODE INDICATOR + DEDUP MODE SELECTOR ===== */}
        {mode === "append" && selectedMatch && !submitResult && (
          <>
            <AppendBanner match={selectedMatch} onCancel={cancelAppend} />
            <DedupModeSelector
              value={dedupMode}
              onChange={setDedupMode}
              hasUniqueKey={columns.some((c) => c.isUniqueKey)}
            />
          </>
        )}

        {/* ===== Dataset name + division ===== */}
        {mode === "create" && (
          <div className="grid gap-5 rounded-3xl border border-neutral-100 bg-white p-7 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="display_name">Nama Dataset</Label>
              <Input
                id="display_name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Laporan CS Juni 2026"
                className="h-11 rounded-2xl"
              />
              <p className="text-xs text-neutral-500">
                Tersimpan di database sebagai:{" "}
                <code className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs">
                  {normalizePhysicalName(displayName) || "..."}
                </code>
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="division">Divisi</Label>
              <select
                id="division"
                value={divisionCode}
                onChange={(e) => setDivisionCode(e.target.value)}
                className="h-11 w-full rounded-2xl border border-neutral-200 bg-white px-3 text-sm"
              >
                {divisions.map((d) => (
                  <option key={d.code} value={d.code}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            {matchingPending && (
              <p className="col-span-full text-xs text-neutral-500">
                🔍 Mengecek dataset existing di divisi ini...
              </p>
            )}
          </div>
        )}

        {/* ===== SCHEMA DRIFT (append mode) ===== */}
        {mode === "append" && selectedMatch && (
          <SchemaDriftPanel
            match={selectedMatch}
            columns={columns}
            addColumnDecisions={addColumnDecisions}
            onToggleAdd={toggleAddColumn}
          />
        )}

        {/* ===== SCHEMA EDITOR (create mode) ===== */}
        {mode === "create" && (
          <div className="rounded-3xl border border-neutral-100 bg-white p-7">
            <div className="mb-5">
              <h3 className="text-lg font-semibold text-neutral-900">
                Schema Kolom
              </h3>
              <p className="text-sm text-neutral-500">
                Atur nama tampilan, tipe data, dan kolom unik (untuk dedup nanti).
              </p>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-neutral-100">
              <table className="w-full text-sm">
                <thead className="bg-neutral-50/50">
                  <tr className="text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
                    <th className="px-4 py-3">Nama Tampilan</th>
                    <th className="px-4 py-3">Nama Fisik</th>
                    <th className="px-4 py-3">Tipe Data</th>
                    <th className="px-4 py-3 text-center">Unique Key</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {columns.map((c, i) => (
                    <tr key={i}>
                      <td className="px-4 py-2">
                        <div className="space-y-1">
                          <input
                            type="text"
                            value={c.displayName}
                            onChange={(e) =>
                              handleColumnDisplayName(i, e.target.value)
                            }
                            className="h-9 w-full rounded-xl border border-neutral-200 px-3"
                          />
                          {c.convention && (
                            <p className="flex items-center gap-1 text-xs text-blue-600">
                              <Link2 className="h-3 w-3" />
                              Akan dinormalisasi untuk match lintas tabel
                              ({conventionLabel(c.convention)})
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        <code className="rounded bg-neutral-100 px-2 py-1 text-xs">
                          {c.physicalName}
                        </code>
                      </td>
                      <td className="px-4 py-2">
                        <select
                          value={c.dataType}
                          onChange={(e) =>
                            updateColumn(i, {
                              dataType: e.target.value as DataType,
                            })
                          }
                          className="h-9 w-36 rounded-xl border border-neutral-200 bg-white px-3 text-sm"
                        >
                          {(Object.keys(DATA_TYPE_LABEL) as DataType[]).map(
                            (t) => (
                              <option key={t} value={t}>
                                {DATA_TYPE_LABEL[t]}
                              </option>
                            )
                          )}
                        </select>
                      </td>
                      <td className="px-4 py-2 text-center">
                        <label className="inline-flex cursor-pointer items-center gap-2">
                          <input
                            type="checkbox"
                            checked={c.isUniqueKey}
                            onChange={(e) =>
                              updateColumn(i, {
                                isUniqueKey: e.target.checked,
                              })
                            }
                            className="h-4 w-4 rounded border-neutral-300"
                          />
                          <KeyRound
                            className={`h-3.5 w-3.5 ${
                              c.isUniqueKey
                                ? "text-yellow-600"
                                : "text-neutral-400"
                            }`}
                          />
                        </label>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ===== CLEANING PREVIEW (both modes) ===== */}
        <div className="rounded-3xl border border-neutral-100 bg-white p-7">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-neutral-900">
                Preview Data
              </h3>
              <p className="text-sm text-neutral-500">
                {stats.cellNormalized > 0 || stats.cellError > 0 ? (
                  <>
                    <span className="inline-flex items-center gap-1 text-yellow-700">
                      <span className="h-2 w-2 rounded-full bg-yellow-400" />
                      {stats.cellNormalized} sel di-normalisasi
                    </span>
                    {stats.cellError > 0 && (
                      <>
                        {" · "}
                        <span className="inline-flex items-center gap-1 text-red-700">
                          <span className="h-2 w-2 rounded-full bg-red-500" />
                          {stats.cellError} sel error
                        </span>
                      </>
                    )}
                  </>
                ) : (
                  "Semua data terlihat valid"
                )}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {stats.errorRows > 0 && (
                <button
                  type="button"
                  onClick={() => setShowOnlyErrors(!showOnlyErrors)}
                  className="inline-flex items-center gap-1 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 transition hover:bg-neutral-50"
                >
                  {showOnlyErrors ? "Tampilkan semua" : "Hanya tampilkan error"}
                </button>
              )}
              {stats.errorRows > 0 && (
                <button
                  type="button"
                  onClick={bulkSkipAllErrors}
                  className="inline-flex items-center gap-1 rounded-full bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 transition hover:bg-red-100"
                >
                  <SkipForward className="h-3 w-3" />
                  Skip semua {stats.errorRows} baris error
                </button>
              )}
              {stats.skippedRows > 0 && (
                <button
                  type="button"
                  onClick={clearSkipped}
                  className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-3 py-1.5 text-xs font-medium text-neutral-700 transition hover:bg-neutral-200"
                >
                  Batalkan skip ({stats.skippedRows})
                </button>
              )}
            </div>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-neutral-100 max-h-[500px]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-neutral-50">
                <tr className="text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  <th className="px-3 py-3 w-10">#</th>
                  {columns.map((c) => (
                    <th
                      key={c.physicalName}
                      className="px-4 py-3 whitespace-nowrap"
                    >
                      {c.displayName}
                    </th>
                  ))}
                  <th className="px-3 py-3 w-20 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {visibleRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={columns.length + 2}
                      className="px-4 py-12 text-center text-sm text-neutral-500"
                    >
                      {showOnlyErrors
                        ? "Tidak ada baris error 🎉"
                        : "Tidak ada data."}
                    </td>
                  </tr>
                ) : (
                  visibleRows.map((rowIndex) => {
                    const row = grid[rowIndex];
                    const isSkipped = skippedRows.has(rowIndex);
                    return (
                      <tr
                        key={rowIndex}
                        className={isSkipped ? "opacity-40" : ""}
                      >
                        <td className="px-3 py-2 text-xs text-neutral-400">
                          {rowIndex + 1}
                        </td>
                        {columns.map((c) => (
                          <CellView
                            key={c.physicalName}
                            cell={row[c.physicalName]}
                            type={c.dataType}
                            onEdit={(val) =>
                              editCell(rowIndex, c.physicalName, val)
                            }
                          />
                        ))}
                        <td className="px-3 py-2 text-center">
                          <button
                            type="button"
                            onClick={() => toggleRowSkip(rowIndex)}
                            className="rounded-full bg-neutral-100 px-2 py-1 text-xs text-neutral-700 hover:bg-neutral-200"
                          >
                            {isSkipped ? "Kembali" : "Skip"}
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {grid.length > PREVIEW_LIMIT && (
            <p className="mt-3 text-xs text-neutral-500">
              Menampilkan {visibleRows.length} dari{" "}
              {grid.length.toLocaleString("id-ID")} baris. Semua baris akan
              diimport setelah Anda klik Lanjutkan.
            </p>
          )}
        </div>

        {submitError && (
          <p className="flex items-start gap-2 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {submitError}
          </p>
        )}

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit || pending}
            className="mesh-blue inline-flex items-center gap-2 rounded-2xl px-6 py-3 text-sm font-semibold text-white shadow-md transition hover:opacity-90 active:translate-y-px disabled:opacity-50"
          >
            <FileText className="h-4 w-4" />
            {pending
              ? "Menyimpan ke Supabase..."
              : mode === "append"
              ? `Append ${stats.validRows.toLocaleString("id-ID")} Baris ke "${selectedMatch?.displayName}"`
              : `Lanjutkan & Import ${stats.validRows.toLocaleString("id-ID")} Baris`}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setStep("file");
              setParsed(null);
              setColumns([]);
              setDisplayName("");
              setCellEdits(new Map());
              setSkippedRows(new Set());
              setSelectedMatch(null);
              setMatches([]);
              setRawFile(null);
              setFileHash(null);
              setFileHashCheck(null);
              setSubmitResult(null);
            }}
            className="rounded-2xl border border-neutral-200 bg-white px-6 py-3 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50"
          >
            Pilih file lain
          </button>
          <label className="ml-auto flex items-center gap-2 text-sm text-neutral-700">
            <input
              type="checkbox"
              checked={isBackfill}
              onChange={(e) => setIsBackfill(e.target.checked)}
              className="h-4 w-4 rounded border-neutral-300"
            />
            Data historis (backfill)
          </label>
        </div>
      </div>

      {/* ===== SIDEBAR COUNTER ===== */}
      <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
        <div className="mesh-soft rounded-3xl p-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Ringkasan
          </p>
          <div className="mt-4 space-y-3">
            <Stat
              label="Total baris"
              value={stats.totalRows.toLocaleString("id-ID")}
              tone="neutral"
            />
            <Stat
              label="Baris valid"
              value={stats.validRows.toLocaleString("id-ID")}
              tone="green"
              icon={<CheckCircle2 className="h-3.5 w-3.5" />}
            />
            <Stat
              label="Baris error"
              value={stats.errorRows.toLocaleString("id-ID")}
              tone={stats.errorRows > 0 ? "red" : "neutral"}
              icon={<AlertCircle className="h-3.5 w-3.5" />}
            />
            <Stat
              label="Baris di-skip"
              value={stats.skippedRows.toLocaleString("id-ID")}
              tone="neutral"
              icon={<SkipForward className="h-3.5 w-3.5" />}
            />
            <hr className="border-neutral-200" />
            <Stat
              label="Sel di-normalisasi"
              value={stats.cellNormalized.toLocaleString("id-ID")}
              tone={stats.cellNormalized > 0 ? "yellow" : "neutral"}
              icon={<Sparkles className="h-3.5 w-3.5" />}
            />
          </div>
          {!canSubmit && stats.errorRows > 0 && (
            <p className="mt-4 rounded-2xl bg-white/70 px-3 py-2 text-xs text-neutral-700">
              Tombol Lanjutkan akan aktif setelah semua error di-fix atau di-skip.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// =================================================================
// Sub-components
// =================================================================

function MatchBanner({
  matches,
  onChoose,
}: {
  matches: DatasetMatch[];
  onChoose: (m: DatasetMatch) => void;
}) {
  const top = matches[0];
  const pct = Math.round(top.similarity * 100);

  return (
    <div className="mesh-soft rounded-3xl border border-blue-200 p-6">
      <div className="flex items-start gap-4">
        <div className="mesh-blue grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-white shadow-md">
          <GitMerge className="h-5 w-5" />
        </div>
        <div className="flex-1 space-y-3">
          <div>
            <h3 className="text-base font-semibold text-neutral-900">
              Dataset mirip ditemukan
            </h3>
            <p className="text-sm text-neutral-700">
              Tampaknya ini lanjutan dari{" "}
              <strong>&ldquo;{top.displayName}&rdquo;</strong> ({pct}% kolom
              cocok). {top.newColumns.length > 0 && `${top.newColumns.length} kolom baru, `}
              {top.missingColumns.length > 0 &&
                `${top.missingColumns.length} kolom hilang, `}
              {top.newColumns.length === 0 &&
                top.missingColumns.length === 0 &&
                "struktur identik. "}
              Mau append?
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onChoose(top)}
              className="mesh-blue inline-flex items-center gap-1 rounded-2xl px-4 py-2 text-sm font-semibold text-white shadow"
            >
              <GitMerge className="h-4 w-4" />
              Append ke &ldquo;{top.displayName}&rdquo;
            </button>

            {matches.length > 1 && (
              <details className="rounded-2xl">
                <summary className="cursor-pointer rounded-2xl border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50">
                  {matches.length - 1} match lain
                </summary>
                <div className="mt-2 space-y-1 rounded-2xl border border-neutral-200 bg-white p-2">
                  {matches.slice(1).map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => onChoose(m)}
                      className="block w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-neutral-50"
                    >
                      <span className="font-medium">{m.displayName}</span>
                      <span className="ml-2 text-xs text-neutral-500">
                        {Math.round(m.similarity * 100)}% match
                      </span>
                    </button>
                  ))}
                </div>
              </details>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function AppendBanner({
  match,
  onCancel,
}: {
  match: DatasetMatch;
  onCancel: () => void;
}) {
  return (
    <div className="rounded-3xl border-2 border-blue-300 bg-blue-50 p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <GitMerge className="mt-0.5 h-5 w-5 text-blue-700" />
          <div>
            <p className="text-sm font-semibold text-blue-900">
              Mode: Append ke &ldquo;{match.displayName}&rdquo;
            </p>
            <p className="text-xs text-blue-700">
              {Math.round(match.similarity * 100)}% kolom cocok.{" "}
              {match.newColumns.length === 0
                ? "Tidak ada perubahan struktur."
                : `${match.newColumns.length} kolom baru akan ditambahkan.`}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-1 rounded-full border border-blue-300 bg-white px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100"
        >
          <X className="h-3 w-3" />
          Batal append
        </button>
      </div>
    </div>
  );
}

function SchemaDriftPanel({
  match,
  columns,
  addColumnDecisions,
  onToggleAdd,
}: {
  match: DatasetMatch;
  columns: EditableColumn[];
  addColumnDecisions: Map<string, boolean>;
  onToggleAdd: (physicalName: string) => void;
}) {
  const newCols = columns.filter((c) =>
    match.newColumns.includes(c.physicalName)
  );

  return (
    <div className="space-y-4">
      {newCols.length > 0 && (
        <div className="rounded-3xl border border-neutral-100 bg-white p-7">
          <div className="mb-4 flex items-center gap-2">
            <Plus className="h-4 w-4 text-green-700" />
            <h3 className="text-base font-semibold text-neutral-900">
              {newCols.length} kolom baru terdeteksi
            </h3>
          </div>
          <p className="mb-4 text-sm text-neutral-600">
            Kolom-kolom ini ada di CSV tapi tidak ada di dataset target. Pilih
            mana yang mau ditambahkan ke tabel.
          </p>
          <div className="space-y-2">
            {newCols.map((c) => {
              const checked = addColumnDecisions.get(c.physicalName) ?? true;
              return (
                <label
                  key={c.physicalName}
                  className="flex cursor-pointer items-center gap-3 rounded-2xl border border-neutral-200 bg-neutral-50/50 p-3 hover:bg-neutral-50"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggleAdd(c.physicalName)}
                    className="h-4 w-4 rounded border-neutral-300"
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-neutral-900">
                      {c.displayName}
                    </p>
                    <p className="text-xs text-neutral-500">
                      <code className="rounded bg-neutral-100 px-1.5 py-0.5">
                        {c.physicalName}
                      </code>
                      <span className="ml-2">
                        {DATA_TYPE_LABEL[c.dataType]}
                      </span>
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                      checked
                        ? "bg-green-100 text-green-700"
                        : "bg-neutral-200 text-neutral-600"
                    }`}
                  >
                    {checked ? "Tambah ke tabel" : "Skip kolom"}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      )}

      {match.missingColumns.length > 0 && (
        <div className="rounded-3xl border border-neutral-100 bg-white p-7">
          <div className="mb-4 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-amber-700" />
            <h3 className="text-base font-semibold text-neutral-900">
              {match.missingColumns.length} kolom tidak ada di CSV
            </h3>
          </div>
          <p className="mb-3 text-sm text-neutral-600">
            Kolom-kolom ini ada di dataset target tapi tidak ada di CSV. Untuk
            baris baru, kolom ini akan diisi <strong>NULL</strong>.
          </p>
          <div className="flex flex-wrap gap-2">
            {match.missingColumns.map((c) => (
              <code
                key={c}
                className="rounded-full bg-amber-50 px-3 py-1 text-xs text-amber-800"
              >
                {c}
              </code>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CellView({
  cell,
  type,
  onEdit,
}: {
  cell: NormalizedCell;
  type: DataType;
  onEdit: (val: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(cell.raw);

  if (editing) {
    return (
      <td className="px-2 py-1">
        <input
          autoFocus
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            onEdit(draft);
            setEditing(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              onEdit(draft);
              setEditing(false);
            }
            if (e.key === "Escape") {
              setDraft(cell.raw);
              setEditing(false);
            }
          }}
          className="h-8 w-full rounded-lg border border-blue-400 bg-white px-2 text-sm outline-none"
        />
      </td>
    );
  }

  const baseClass = "px-4 py-2 cursor-pointer whitespace-nowrap";
  let bgClass = "";
  let title = "";

  if (cell.status === "error") {
    bgClass = "bg-red-50 text-red-900";
    title = `Tidak bisa di-parse sebagai ${type}. Klik untuk edit.`;
  } else if (cell.status === "normalized") {
    bgClass = "bg-yellow-50";
    title = `Di-normalisasi dari "${cell.raw}" → "${String(cell.value)}"`;
  } else if (cell.status === "empty") {
    bgClass = "text-neutral-400 italic";
  }

  const display =
    cell.status === "empty"
      ? "(kosong)"
      : cell.status === "error"
      ? cell.raw
      : String(cell.value);

  return (
    <td
      className={`${baseClass} ${bgClass}`}
      title={title}
      onClick={() => {
        setDraft(cell.raw);
        setEditing(true);
      }}
    >
      {display}
    </td>
  );
}

function Stat({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: string;
  tone: "neutral" | "green" | "red" | "yellow";
  icon?: React.ReactNode;
}) {
  const toneClass = {
    neutral: "text-neutral-900",
    green: "text-green-700",
    red: "text-red-700",
    yellow: "text-yellow-700",
  }[tone];
  return (
    <div className="flex items-center justify-between">
      <span className="inline-flex items-center gap-1.5 text-xs text-neutral-600">
        {icon}
        {label}
      </span>
      <span className={`text-sm font-semibold ${toneClass}`}>{value}</span>
    </div>
  );
}

// =================================================================
// Phase 6 components
// =================================================================

function LargeFileBanner({ sizeMb }: { sizeMb: number }) {
  return (
    <div className="rounded-3xl border-2 border-purple-300 bg-purple-50 p-5">
      <div className="flex items-start gap-3">
        <div className="mesh-purple grid h-10 w-10 shrink-0 place-items-center rounded-2xl text-white shadow">
          <UploadIcon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-semibold text-purple-900">
            File besar ({sizeMb.toFixed(1)} MB) — diproses di background
          </p>
          <p className="mt-1 text-sm text-purple-800">
            Setelah klik Lanjutkan, file akan diproses oleh Edge Function di
            Supabase. Anda bisa tutup tab dan kembali nanti — progress tersimpan
            di server. Halaman dataset akan menampilkan progress real-time.
          </p>
        </div>
      </div>
    </div>
  );
}

function FileHashWarning({
  check,
  onDismiss,
}: {
  check: FileHashCheckResult;
  onDismiss: () => void;
}) {
  const job = check.existingJob;
  if (!job) return null;
  const date = new Date(job.createdAt).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="rounded-3xl border-2 border-amber-300 bg-amber-50 p-5">
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 h-5 w-5 text-amber-700" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-amber-900">
            File ini sudah pernah di-upload
          </p>
          <p className="mt-1 text-sm text-amber-800">
            File dengan isi yang persis sama di-upload pada <strong>{date}</strong>
            {job.createdByEmail && <> oleh <strong>{job.createdByEmail}</strong></>}
            {job.datasetDisplayName && (
              <>
                {" "}ke dataset <strong>&ldquo;{job.datasetDisplayName}&rdquo;</strong>
              </>
            )}
            . Mau lanjut import lagi?
          </p>
          <button
            type="button"
            onClick={onDismiss}
            className="mt-3 inline-flex items-center gap-1 rounded-full border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100"
          >
            Saya paham, tetap lanjutkan
          </button>
        </div>
      </div>
    </div>
  );
}

function DedupModeSelector({
  value,
  onChange,
  hasUniqueKey,
}: {
  value: DedupMode;
  onChange: (v: DedupMode) => void;
  hasUniqueKey: boolean;
}) {
  const options: { value: DedupMode; label: string; description: string }[] = [
    {
      value: "skip",
      label: "Skip duplikat",
      description: "Baris yang sudah ada (kolom unik sama) dilewati. Aman, default.",
    },
    {
      value: "update",
      label: "Update yang sudah ada",
      description: "Baris dengan kolom unik sama akan di-update dengan data baru.",
    },
    {
      value: "insert",
      label: "Tetap insert",
      description: "Semua baris di-insert, termasuk duplikat. Bisa double-count.",
    },
  ];

  return (
    <div className="rounded-3xl border border-neutral-100 bg-white p-7">
      <div className="mb-4 flex items-center gap-2">
        <KeyRound className="h-4 w-4 text-yellow-700" />
        <h3 className="text-base font-semibold text-neutral-900">
          Mode Duplikat
        </h3>
      </div>
      {!hasUniqueKey ? (
        <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Tidak ada kolom yang ditandai sebagai Unique Key. Dedup row-level
          tidak akan jalan — semua baris akan di-insert (mode insert).
        </p>
      ) : (
        <div className="space-y-2">
          {options.map((opt) => (
            <label
              key={opt.value}
              className={`flex cursor-pointer items-start gap-3 rounded-2xl border-2 p-3 transition ${
                value === opt.value
                  ? "border-blue-400 bg-blue-50"
                  : "border-neutral-200 bg-white hover:bg-neutral-50"
              }`}
            >
              <input
                type="radio"
                name="dedup-mode"
                value={opt.value}
                checked={value === opt.value}
                onChange={() => onChange(opt.value)}
                className="mt-0.5 h-4 w-4"
              />
              <div className="flex-1">
                <p className="text-sm font-semibold text-neutral-900">
                  {opt.label}
                </p>
                <p className="text-xs text-neutral-600">{opt.description}</p>
              </div>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function SuccessSummary({
  result,
  onView,
  onUploadAnother,
}: {
  result: {
    datasetId: string;
    rowsInserted: number;
    rowsSkipped: number;
    rowsUpdated: number;
    mode: "create" | "append";
  };
  onView: () => void;
  onUploadAnother: () => void;
}) {
  const fmt = (n: number) => n.toLocaleString("id-ID");
  return (
    <div className="mesh-soft rounded-3xl border border-green-300 p-8">
      <div className="flex items-start gap-4">
        <div className="mesh-green grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-white shadow">
          <CheckCircle2 className="h-6 w-6" />
        </div>
        <div className="flex-1 space-y-4">
          <div>
            <h3 className="text-lg font-bold text-neutral-900">
              {result.mode === "create"
                ? "Dataset berhasil dibuat"
                : "Append berhasil"}
            </h3>
            <p className="text-sm text-neutral-700">
              Ringkasan import:
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-2xl bg-white p-4 text-center">
              <p className="text-xs text-neutral-500">Baris baru</p>
              <p className="text-2xl font-bold text-green-700">
                {fmt(result.rowsInserted)}
              </p>
            </div>
            <div className="rounded-2xl bg-white p-4 text-center">
              <p className="text-xs text-neutral-500">Skipped (duplikat)</p>
              <p className="text-2xl font-bold text-neutral-700">
                {fmt(result.rowsSkipped)}
              </p>
            </div>
            <div className="rounded-2xl bg-white p-4 text-center">
              <p className="text-xs text-neutral-500">Updated</p>
              <p className="text-2xl font-bold text-blue-700">
                {fmt(result.rowsUpdated)}
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onView}
              className="mesh-blue inline-flex items-center gap-1 rounded-2xl px-4 py-2 text-sm font-semibold text-white shadow"
            >
              <FileText className="h-4 w-4" />
              Lihat Dataset
            </button>
            <button
              type="button"
              onClick={onUploadAnother}
              className="rounded-2xl border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
            >
              Upload file lain
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
