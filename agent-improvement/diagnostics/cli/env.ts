import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";

async function loadDotEnvFile(filePath: string) {
  if (!existsSync(filePath)) return;

  const body = await readFile(filePath, "utf8");
  for (const line of body.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) continue;

    const key = trimmed.slice(0, equalsIndex).trim();
    const rawValue = trimmed.slice(equalsIndex + 1).trim();
    const value = rawValue.replace(/^['"]|['"]$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

export async function loadEnv() {
  await loadDotEnvFile(".env.local");
  await loadDotEnvFile(".env");
}
