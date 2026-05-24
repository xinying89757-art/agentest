import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { SuiteResult, ToolCall } from "./types.js";

// ─── Types ───

export interface SnapshotCase {
  passed: boolean;
  toolCalls: ToolCall[];
  lastMessage: string;
  usage: { inputTokens: number; outputTokens: number };
  durationMs: number;
}

export interface SnapshotFile {
  version: 1;
  suiteName: string;
  createdAt: string;
  provider: string;
  model: string | null;
  cases: Record<string, SnapshotCase>;
}

export interface CaseDiff {
  testName: string;
  status: "unchanged" | "changed" | "new" | "removed";
  toolCallsChanged: boolean;
  contentSimilarity: number;
  passChanged: boolean;
  previousPassed: boolean | null;
  currentPassed: boolean | null;
}

export interface SnapshotDiff {
  suiteName: string;
  snapshotPath: string;
  diffs: CaseDiff[];
  unchanged: number;
  changed: number;
  added: number;
  removed: number;
  regressions: number;
}

export const CONTENT_SIMILARITY_THRESHOLD = 0.6;

// ─── File paths ───

export function snapshotPath(suiteName: string, dir?: string): string {
  const base = resolve(dir ?? "./agentest-snapshots");
  const safeName = suiteName.replace(/[^a-zA-Z0-9_-]/g, "_");
  const hash = createHash("sha256").update(suiteName).digest("hex").slice(0, 8);
  return resolve(base, `${safeName}_${hash}.json`);
}

// ─── Save ───

export function saveSnapshot(
  suiteResult: SuiteResult,
  provider: string,
  model: string | null,
  filePath: string,
): void {
  const cases: Record<string, SnapshotCase> = {};

  for (const r of suiteResult.results) {
    const output = r.agentOutput;
    cases[r.testName] = {
      passed: r.passed,
      toolCalls: output?.toolCalls ?? [],
      lastMessage: output?.messages.at(-1)?.content ?? "",
      usage: output?.usage ?? { inputTokens: 0, outputTokens: 0 },
      durationMs: r.durationMs,
    };
  }

  const file: SnapshotFile = {
    version: 1,
    suiteName: suiteResult.suiteName,
    createdAt: new Date().toISOString(),
    provider,
    model,
    cases,
  };

  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  writeFileSync(filePath, JSON.stringify(file, null, 2), "utf-8");
}

// ─── Load ───

export function loadSnapshot(filePath: string): SnapshotFile {
  if (!existsSync(filePath)) {
    throw new Error(`Snapshot file not found: ${filePath}`);
  }
  const raw = readFileSync(filePath, "utf-8");
  const parsed = JSON.parse(raw);
  if (parsed.version !== 1) {
    throw new Error(
      `Unsupported snapshot version: ${parsed.version}. Expected version 1.`,
    );
  }
  return parsed as SnapshotFile;
}

// ─── Compare ───

export function compareSnapshots(
  current: SuiteResult,
  previous: SnapshotFile,
): SnapshotDiff {
  const currentNames = new Set(current.results.map((r) => r.testName));
  const previousNames = new Set(Object.keys(previous.cases));
  const allNames = new Set([...currentNames, ...previousNames]);

  const diffs: CaseDiff[] = [];

  for (const name of allNames) {
    const curr = current.results.find((r) => r.testName === name);
    const prev = previous.cases[name];

    if (!prev && curr) {
      diffs.push({
        testName: name,
        status: "new",
        toolCallsChanged: false,
        contentSimilarity: 1,
        passChanged: false,
        previousPassed: null,
        currentPassed: curr.passed,
      });
    } else if (prev && !curr) {
      diffs.push({
        testName: name,
        status: "removed",
        toolCallsChanged: false,
        contentSimilarity: 0,
        passChanged: false,
        previousPassed: prev.passed,
        currentPassed: null,
      });
    } else if (prev && curr) {
      const output = curr.agentOutput;
      const currentCalls = output?.toolCalls ?? [];
      const currentMsg = output?.messages.at(-1)?.content ?? "";
      const toolCallsChanged =
        currentCalls.map((t) => t.name).sort().join(",") !==
        prev.toolCalls.map((t) => t.name).sort().join(",");
      const similarity = jaccardSimilarity(currentMsg, prev.lastMessage);
      const passChanged = prev.passed !== curr.passed;

      const anyChange =
        toolCallsChanged ||
        similarity < CONTENT_SIMILARITY_THRESHOLD ||
        passChanged;

      diffs.push({
        testName: name,
        status: anyChange ? "changed" : "unchanged",
        toolCallsChanged,
        contentSimilarity: similarity,
        passChanged,
        previousPassed: prev.passed,
        currentPassed: curr.passed,
      });
    }
  }

  diffs.sort((a, b) => a.testName.localeCompare(b.testName));

  return {
    suiteName: current.suiteName,
    snapshotPath: "",
    diffs,
    unchanged: diffs.filter((d) => d.status === "unchanged").length,
    changed: diffs.filter((d) => d.status === "changed").length,
    added: diffs.filter((d) => d.status === "new").length,
    removed: diffs.filter((d) => d.status === "removed").length,
    regressions: diffs.filter(
      (d) => d.status === "changed" && d.previousPassed === true && d.currentPassed === false,
    ).length,
  };
}

// ─── Jaccard Similarity ───

export function jaccardSimilarity(a: string, b: string): number {
  if (!a && !b) return 1;
  if (!a || !b) return 0;

  const wordsA = tokenize(a);
  const wordsB = tokenize(b);

  if (wordsA.length === 0 && wordsB.length === 0) return 1;

  const setA = new Set(wordsA);
  const setB = new Set(wordsB);

  let intersection = 0;
  for (const w of setA) {
    if (setB.has(w)) intersection++;
  }

  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 1 : intersection / union;
}

function tokenize(text: string): string[] {
  const cleaned = text
    .toLowerCase()
    .replace(/[^\w\s一-鿿㐀-䶿]/g, " ")
    .trim();

  if (!cleaned) return [];

  const words = cleaned.split(/\s+/).filter((w) => w.length > 0);
  const hasCJK = /[一-鿿㐀-䶿]/.test(cleaned);

  if (!hasCJK) return words;

  const tokens: string[] = [];
  for (const word of words) {
    if (/[一-鿿㐀-䶿]/.test(word)) {
      for (let i = 0; i < word.length - 1; i++) {
        tokens.push(word.slice(i, i + 2));
      }
    }
    if (word.length <= 2) {
      tokens.push(word);
    }
  }
  return tokens;
}
