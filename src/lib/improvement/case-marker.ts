const markerPattern = /\[STEPH-CASE:([A-Za-z0-9._:-]+)\]/;

export function extractImprovementCaseRunId(...values: Array<string | undefined | null>) {
  for (const value of values) {
    if (!value) continue;
    const match = value.match(markerPattern);
    if (match?.[1]) return match[1];
  }

  return undefined;
}

export function improvementCaseMarker(caseRunId: string) {
  return `[STEPH-CASE:${caseRunId}]`;
}
