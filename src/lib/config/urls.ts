import { getEnv } from "@/lib/config/env";

export function getPublicAppUrl() {
  return getEnv().NEXT_PUBLIC_APP_URL.replace(/\/+$/, "");
}

export function buildPublicUrl(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${getPublicAppUrl()}${normalizedPath}`;
}
