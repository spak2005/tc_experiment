import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { getEnv } from "@/lib/config/env";

const execFileAsync = promisify(execFile);

function positiveInteger(value: unknown, fallback: number) {
  const parsed = typeof value === "string" ? Number.parseInt(value, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function runBinary(
  command: string,
  args: string[],
  options: { timeout: number }
) {
  try {
    return await execFileAsync(command, args, {
      timeout: options.timeout,
      maxBuffer: 20 * 1024 * 1024
    });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      throw new Error(`OCR binary not found: ${command}`);
    }

    throw error;
  }
}

export async function extractTextFromPdfWithOcr(input: {
  filename: string;
  pdf: Buffer;
}) {
  const env = getEnv();
  const pdfToPpmPath = env.PDFTOPPM_PATH ?? "pdftoppm";
  const tesseractPath = env.TESSERACT_PATH ?? "tesseract";
  const maxPages = positiveInteger(env.OCR_MAX_PAGES, 20);
  const tempDir = await mkdtemp(path.join(tmpdir(), `tc-ocr-${randomUUID()}-`));
  const pdfPath = path.join(tempDir, input.filename.replace(/[^a-z0-9._-]+/gi, "_"));
  const outputPrefix = path.join(tempDir, "page");

  try {
    await writeFile(pdfPath, input.pdf);
    await runBinary(
      pdfToPpmPath,
      ["-f", "1", "-l", String(maxPages), "-png", "-r", "160", pdfPath, outputPrefix],
      { timeout: 90_000 }
    );

    const files = (await readdir(tempDir))
      .filter((file) => /^page-\d+\.png$/.test(file))
      .sort();

    if (files.length === 0) {
      throw new Error("OCR rendering produced no page images.");
    }

    const pageTexts: string[] = [];
    for (const file of files) {
      const pagePath = path.join(tempDir, file);
      const { stdout } = await runBinary(
        tesseractPath,
        [pagePath, "stdout", "--psm", "6"],
        { timeout: 45_000 }
      );
      pageTexts.push(`--- ${file} ---\n${stdout.trim()}`);
    }

    return pageTexts.join("\n\n").trim();
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
