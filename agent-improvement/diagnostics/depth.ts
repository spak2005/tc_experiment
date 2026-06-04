import { diagnosticsDepths, type DiagnosticsDepth } from "./types";

export function parseDiagnosticsDepth(value: string | null | undefined): DiagnosticsDepth {
  if (diagnosticsDepths.includes(value as DiagnosticsDepth)) {
    return value as DiagnosticsDepth;
  }

  return "summary";
}

