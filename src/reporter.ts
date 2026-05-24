import chalk from "chalk";
import type { SuiteResult } from "./types.js";
import type { SnapshotDiff } from "./snapshot.js";
import { CONTENT_SIMILARITY_THRESHOLD } from "./snapshot.js";

function indent(text: string, level: number): string {
  return "  ".repeat(level) + text;
}

function formatCli(suite: SuiteResult): string {
  const lines: string[] = [];

  lines.push("");
  lines.push(chalk.bold(suite.suiteName));
  lines.push("");

  for (const result of suite.results) {
    const icon = result.passed ? chalk.green("✓") : chalk.red("✗");
    lines.push(indent(`${icon} ${result.testName} (${result.durationMs}ms)`, 1));

    if (!result.passed) {
      for (const a of result.assertions) {
        if (!a.passed) {
          lines.push(indent(chalk.red(`  ✗ ${a.name}: ${a.reason}`), 2));
        }
      }
    }
  }

  lines.push("");
  const summary = [
    chalk.green(`${suite.passed} passed`),
    chalk.red(`${suite.failed} failed`),
  ];
  if (suite.skipped > 0) {
    summary.push(chalk.gray(`${suite.skipped} skipped`));
  }
  summary.push(`(${suite.durationMs}ms)`);
  lines.push(`  ${summary.join(", ")}`);
  lines.push("");

  return lines.join("\n");
}

function formatJson(suite: SuiteResult): string {
  return JSON.stringify(
    {
      suiteName: suite.suiteName,
      total: suite.total,
      passed: suite.passed,
      failed: suite.failed,
      skipped: suite.skipped,
      durationMs: suite.durationMs,
      results: suite.results.map((r) => ({
        testName: r.testName,
        passed: r.passed,
        durationMs: r.durationMs,
        assertions: r.assertions,
        agentOutput: r.agentOutput ?? null,
      })),
    },
    null,
    2,
  );
}

function snapshotDiff(diff: SnapshotDiff): string {
  const lines: string[] = [];

  lines.push("");
  lines.push(chalk.bold(`Snapshot diff: ${diff.suiteName}`));
  lines.push("");

  for (const d of diff.diffs) {
    let icon: string;
    let desc: string;

    switch (d.status) {
      case "unchanged":
        icon = chalk.green("✓");
        desc = "unchanged";
        break;
      case "changed": {
        const parts: string[] = [];
        if (d.toolCallsChanged) parts.push("tool calls changed");
        if (d.contentSimilarity < CONTENT_SIMILARITY_THRESHOLD)
          parts.push(`content diverged (${Math.round(d.contentSimilarity * 100)}%)`);
        if (d.passChanged) {
          parts.push(
            d.currentPassed
              ? chalk.green("fail→pass")
              : chalk.red("pass→fail (REGRESSION)"),
          );
        }
        icon = chalk.yellow("~");
        desc = parts.join(", ");
        break;
      }
      case "new":
        icon = chalk.blue("⊕");
        desc = "new test, no baseline";
        break;
      case "removed":
        icon = chalk.gray("⊖");
        desc = "removed from suite";
        break;
    }

    lines.push(indent(`${icon} ${d.testName} — ${desc}`, 1));
  }

  lines.push("");
  const summary = [
    chalk.green(`${diff.unchanged} unchanged`),
    diff.changed > 0 ? chalk.yellow(`${diff.changed} changed`) : "",
    diff.added > 0 ? chalk.blue(`${diff.added} added`) : "",
    diff.removed > 0 ? chalk.gray(`${diff.removed} removed`) : "",
    diff.regressions > 0 ? chalk.red(`${diff.regressions} regressions`) : "",
  ].filter(Boolean);
  lines.push(indent(summary.join(", "), 1));
  lines.push("");

  return lines.join("\n");
}

export const Reporters = {
  cli: formatCli,
  json: formatJson,
  snapshotDiff,
};
