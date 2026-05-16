import { put } from "@vercel/blob";

export interface StoreDocumentInput {
  userId: string;
  transactionId?: string;
  filename: string;
  contentType: string;
  body: Blob | ArrayBuffer | Buffer | string;
}

function normalizeFilename(filename: string): string {
  return filename
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 140);
}

export async function storePrivateDocument(input: StoreDocumentInput) {
  const keyParts = [
    "users",
    input.userId,
    input.transactionId ? `transactions/${input.transactionId}` : "intake",
    `${Date.now()}-${normalizeFilename(input.filename)}`
  ];

  const blob = await put(keyParts.join("/"), input.body, {
    access: "private",
    contentType: input.contentType
  });

  return {
    key: blob.pathname,
    url: blob.url,
    contentType: input.contentType
  };
}
