import chalk from "chalk";
import type { SuiteResult } from "./types.js";

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

export const Reporters = {
  cli: formatCli,
  json: formatJson,
};
