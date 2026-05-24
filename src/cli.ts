#!/usr/bin/env node
import { Command } from "commander";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createJiti } from "jiti";
import { runSuite } from "./runner.js";
import { AnthropicProvider } from "./providers/anthropic.js";
import { MockProvider } from "./providers/mock.js";
import { Reporters } from "./reporter.js";
import { saveSnapshot, loadSnapshot, compareSnapshots, snapshotPath } from "./snapshot.js";
import type { TestSuite, ToolCall } from "./types.js";
import type { AgentProvider } from "./providers/types.js";

const jiti = createJiti(import.meta.url);

const program = new Command();

program
  .name("agentest")
  .description("Deterministic evaluation framework for AI agents")
  .version("0.1.0");

program
  .command("run <path>")
  .description("Run a test suite (.ts or .js)")
  .option("-p, --provider <name>", "provider: anthropic or mock", "mock")
  .option("-m, --model <name>", "model name for the provider")
  .option("-t, --timeout <ms>", "timeout per test case in ms", "30000")
  .option("--mock-response <json>", 'mock response config, e.g. \'{"content":"ok","toolCalls":[{"name":"query_order","arguments":{}}]}\'')
  .option("--mock-responses-file <path>", "JSON file mapping input patterns to mock responses")
  .option("--json", "output as JSON")
  .action(async (testPath: string, opts: {
    provider: string;
    model?: string;
    timeout: string;
    mockResponse?: string;
    mockResponsesFile?: string;
    json?: boolean;
  }) => {
    const absPath = resolve(testPath);

    if (!existsSync(absPath)) {
      console.error(`Error: file not found: ${absPath}`);
      process.exit(1);
    }

    const suite = await loadSuite(absPath);
    const provider = createProvider(opts);
    const timeoutMs = parseInt(opts.timeout, 10);

    const result = await runSuite(suite, provider, { timeout: timeoutMs });

    if (opts.json) {
      console.log(Reporters.json(result));
    } else {
      console.log(Reporters.cli(result));
    }

    process.exit(result.failed > 0 ? 1 : 0);
  });

// ─── snapshot ───

const snapshotCmd = program
  .command("snapshot")
  .description("Regression snapshot management");

snapshotCmd
  .command("save <path>")
  .description("Run suite and save baseline snapshot")
  .option("-p, --provider <name>", "provider: anthropic or mock", "mock")
  .option("-m, --model <name>", "model name for the provider")
  .option("-t, --timeout <ms>", "timeout per test case in ms", "30000")
  .option("--mock-response <json>", "inline mock response config")
  .option("--mock-responses-file <path>", "JSON file for mock responses")
  .option("--snapshot-dir <dir>", "snapshot directory", "./agentest-snapshots")
  .action(async (testPath: string, opts: {
    provider: string;
    model?: string;
    timeout: string;
    mockResponse?: string;
    mockResponsesFile?: string;
    snapshotDir: string;
  }) => {
    const absPath = resolve(testPath);
    if (!existsSync(absPath)) {
      console.error(`Error: file not found: ${absPath}`);
      process.exit(1);
    }

    const suite = await loadSuite(absPath);
    const provider = createProvider(opts);
    const timeoutMs = parseInt(opts.timeout, 10);
    const result = await runSuite(suite, provider, { timeout: timeoutMs });

    const filePath = snapshotPath(result.suiteName, opts.snapshotDir);
    saveSnapshot(result, opts.provider, opts.model ?? null, filePath);

    console.log(`Snapshot saved: ${filePath}`);
    console.log(Reporters.cli(result));
    process.exit(result.failed > 0 ? 1 : 0);
  });

snapshotCmd
  .command("diff <path>")
  .description("Run suite and compare against baseline")
  .option("-p, --provider <name>", "provider: anthropic or mock", "mock")
  .option("-m, --model <name>", "model name for the provider")
  .option("-t, --timeout <ms>", "timeout per test case in ms", "30000")
  .option("--mock-response <json>", "inline mock response config")
  .option("--mock-responses-file <path>", "JSON file for mock responses")
  .option("--snapshot-dir <dir>", "snapshot directory", "./agentest-snapshots")
  .action(async (testPath: string, opts: {
    provider: string;
    model?: string;
    timeout: string;
    mockResponse?: string;
    mockResponsesFile?: string;
    snapshotDir: string;
  }) => {
    const absPath = resolve(testPath);
    if (!existsSync(absPath)) {
      console.error(`Error: file not found: ${absPath}`);
      process.exit(1);
    }

    const suite = await loadSuite(absPath);
    const provider = createProvider(opts);
    const timeoutMs = parseInt(opts.timeout, 10);
    const result = await runSuite(suite, provider, { timeout: timeoutMs });

    const filePath = snapshotPath(result.suiteName, opts.snapshotDir);
    let previous;
    try {
      previous = loadSnapshot(filePath);
    } catch {
      console.error(`Error: no baseline snapshot found at ${filePath}`);
      console.error("Run 'agentest snapshot save' first.");
      process.exit(1);
    }

    const diff = compareSnapshots(result, previous);
    diff.snapshotPath = filePath;

    console.log(Reporters.cli(result));
    console.log(Reporters.snapshotDiff(diff));
    process.exit((result.failed > 0 || diff.changed > 0) ? 1 : 0);
  });

snapshotCmd
  .command("update <path>")
  .description("Run suite and overwrite baseline snapshot")
  .option("-p, --provider <name>", "provider: anthropic or mock", "mock")
  .option("-m, --model <name>", "model name for the provider")
  .option("-t, --timeout <ms>", "timeout per test case in ms", "30000")
  .option("--mock-response <json>", "inline mock response config")
  .option("--mock-responses-file <path>", "JSON file for mock responses")
  .option("--snapshot-dir <dir>", "snapshot directory", "./agentest-snapshots")
  .action(async (testPath: string, opts: {
    provider: string;
    model?: string;
    timeout: string;
    mockResponse?: string;
    mockResponsesFile?: string;
    snapshotDir: string;
  }) => {
    const absPath = resolve(testPath);
    if (!existsSync(absPath)) {
      console.error(`Error: file not found: ${absPath}`);
      process.exit(1);
    }

    const suite = await loadSuite(absPath);
    const provider = createProvider(opts);
    const timeoutMs = parseInt(opts.timeout, 10);
    const result = await runSuite(suite, provider, { timeout: timeoutMs });

    const filePath = snapshotPath(result.suiteName, opts.snapshotDir);
    saveSnapshot(result, opts.provider, opts.model ?? null, filePath);

    console.log(`Snapshot updated: ${filePath}`);
    console.log(Reporters.cli(result));
    process.exit(result.failed > 0 ? 1 : 0);
  });

async function loadSuite(path: string): Promise<TestSuite> {
  if (path.endsWith(".ts")) {
    const mod = jiti(path) as Record<string, unknown>;
    return (mod.default ?? mod.suite ?? mod) as TestSuite;
  }
  const url = pathToFileURL(path).href;
  const mod = await import(url);
  return mod.default ?? mod.suite ?? mod;
}

function createProvider(opts: {
  provider: string;
  model?: string;
  mockResponse?: string;
  mockResponsesFile?: string;
}): AgentProvider {
  switch (opts.provider) {
    case "anthropic":
      return new AnthropicProvider({ model: opts.model });

    case "mock": {
      let defaultResponse = { content: "Mock response" };
      const responses = new Map<string, { content: string; toolCalls?: ToolCall[] }>();

      if (opts.mockResponse) {
        defaultResponse = JSON.parse(opts.mockResponse);
      }

      if (opts.mockResponsesFile) {
        const filePath = resolve(opts.mockResponsesFile);
        if (!existsSync(filePath)) {
          console.error(`Error: mock responses file not found: ${filePath}`);
          process.exit(1);
        }
        const raw = JSON.parse(readFileSync(filePath, "utf-8"));
        for (const [key, value] of Object.entries(raw)) {
          responses.set(key, value as { content: string; toolCalls?: ToolCall[] });
        }
      }

      return new MockProvider({ defaultResponse, responses });
    }

    default:
      console.error(`Error: unknown provider "${opts.provider}". Use "anthropic" or "mock".`);
      process.exit(1);
  }
}

program.parse();
