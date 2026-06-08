/**
 * Smart match: cari dataset existing yang struktur kolomnya mirip dengan
 * CSV yang baru di-upload, agar bisa disarankan append.
 *
 * Pakai Jaccard similarity pada set physical_name kolom.
 * Threshold default 0.8 (80% cocok).
 */

export type DatasetCandidate = {
  id: string;
  displayName: string;
  physicalTableName: string;
  divisionCode: string;
  columns: { physicalName: string; displayName: string; dataType: string }[];
};

export type DatasetMatch = DatasetCandidate & {
  similarity: number; // 0-1
  newColumns: string[];      // kolom CSV yang tidak ada di dataset existing
  missingColumns: string[];  // kolom dataset existing yang tidak ada di CSV
};

/**
 * Hitung Jaccard similarity dari 2 set string.
 */
export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let intersect = 0;
  for (const x of a) if (b.has(x)) intersect++;
  const union = a.size + b.size - intersect;
  if (union === 0) return 0;
  return intersect / union;
}

/**
 * Cari kandidat match. Return list yang similarity >= threshold,
 * di-sort menurun.
 */
export function findDatasetMatches(
  csvPhysicalNames: string[],
  datasets: DatasetCandidate[],
  threshold = 0.8
): DatasetMatch[] {
  const csvSet = new Set(csvPhysicalNames);

  const results = datasets.map((d) => {
    const dsCols = d.columns.map((c) => c.physicalName);
    const dsSet = new Set(dsCols);
    const similarity = jaccard(csvSet, dsSet);
    const newColumns = csvPhysicalNames.filter((c) => !dsSet.has(c));
    const missingColumns = dsCols.filter((c) => !csvSet.has(c));
    return {
      ...d,
      similarity,
      newColumns,
      missingColumns,
    };
  });

  return results
    .filter((m) => m.similarity >= threshold)
    .sort((a, b) => b.similarity - a.similarity);
}
