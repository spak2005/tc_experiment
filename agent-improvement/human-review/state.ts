import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { stateRoot } from "@improvement/loop/state";
import {
  humanReviewItemTypes,
  humanReviewStateSchema,
  parseHumanReviewState,
  type HumanReviewItem,
  type HumanReviewItemType,
  type HumanReviewState
} from "./schema";

function reviewStatePath(cwd = process.cwd()) {
  return path.join(stateRoot(cwd), "human-review.json");
}

function compactTimestamp(now = new Date()) {
  return now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 42);
}

export function createHumanReviewItemId(input: {
  type: HumanReviewItemType;
  title: string;
  now?: Date;
}) {
  return `HR-${compactTimestamp(input.now)}-${input.type}-${slugify(input.title) || "item"}`;
}

export async function readHumanReviewState(cwd = process.cwd()) {
  const filePath = reviewStatePath(cwd);
  if (!existsSync(filePath)) {
    return humanReviewStateSchema.parse({
      schemaVersion: "steph-human-review.v1",
      items: []
    });
  }

  return parseHumanReviewState(JSON.parse(await readFile(filePath, "utf8")));
}

export async function writeHumanReviewState(
  state: HumanReviewState,
  cwd = process.cwd()
) {
  const parsed = humanReviewStateSchema.parse(state);
  const filePath = reviewStatePath(cwd);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(parsed, null, 2)}\n`);
  return parsed;
}

export function activeHumanReviewItems(state: HumanReviewState) {
  return state.items.filter((item) => item.status === "open");
}

function findItem(state: HumanReviewState, itemId: string) {
  const item = state.items.find((candidate) => candidate.id === itemId);
  if (!item) throw new Error(`Human review item ${itemId} was not found.`);
  return item;
}

function assertType(value: string): asserts value is HumanReviewItemType {
  if (!humanReviewItemTypes.includes(value as HumanReviewItemType)) {
    throw new Error(`Invalid human review item type: ${value}`);
  }
}

export async function createHumanReviewItem(input: {
  cwd?: string;
  id?: string;
  type: string;
  title: string;
  body: string;
  caseId?: string;
  caseRunId?: string;
  now?: Date;
}) {
  assertType(input.type);
  const cwd = input.cwd ?? process.cwd();
  const now = input.now ?? new Date();
  const state = await readHumanReviewState(cwd);
  const item: HumanReviewItem = {
    id:
      input.id ??
      createHumanReviewItemId({
        type: input.type,
        title: input.title,
        now
      }),
    type: input.type,
    status: "open",
    title: input.title,
    body: input.body,
    caseId: input.caseId,
    caseRunId: input.caseRunId,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };

  const next = await writeHumanReviewState(
    {
      ...state,
      items: [item, ...state.items]
    },
    cwd
  );

  return { item, state: next };
}

export async function answerHumanReviewItem(input: {
  cwd?: string;
  itemId: string;
  answer: string;
  now?: Date;
}) {
  const cwd = input.cwd ?? process.cwd();
  const now = input.now ?? new Date();
  const state = await readHumanReviewState(cwd);
  findItem(state, input.itemId);
  const next = await writeHumanReviewState(
    {
      ...state,
      items: state.items.map((item) =>
        item.id === input.itemId
          ? {
              ...item,
              status: "answered",
              answer: input.answer,
              updatedAt: now.toISOString(),
              resolvedAt: now.toISOString()
            }
          : item
      )
    },
    cwd
  );

  return { item: findItem(next, input.itemId), state: next };
}

export async function acknowledgeHumanReviewItem(input: {
  cwd?: string;
  itemId: string;
  now?: Date;
}) {
  const cwd = input.cwd ?? process.cwd();
  const now = input.now ?? new Date();
  const state = await readHumanReviewState(cwd);
  findItem(state, input.itemId);
  const next = await writeHumanReviewState(
    {
      ...state,
      items: state.items.map((item) =>
        item.id === input.itemId
          ? {
              ...item,
              status: "acknowledged",
              updatedAt: now.toISOString(),
              resolvedAt: now.toISOString()
            }
          : item
      )
    },
    cwd
  );

  return { item: findItem(next, input.itemId), state: next };
}

export async function resolveHumanReviewItem(input: {
  cwd?: string;
  itemId: string;
  now?: Date;
}) {
  const cwd = input.cwd ?? process.cwd();
  const now = input.now ?? new Date();
  const state = await readHumanReviewState(cwd);
  findItem(state, input.itemId);
  const next = await writeHumanReviewState(
    {
      ...state,
      items: state.items.map((item) =>
        item.id === input.itemId
          ? {
              ...item,
              status: "resolved",
              updatedAt: now.toISOString(),
              resolvedAt: now.toISOString()
            }
          : item
      )
    },
    cwd
  );

  return { item: findItem(next, input.itemId), state: next };
}
