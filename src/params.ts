import type { Assertion, ParamCase, ParamRow, TestCase } from "./types.js";

const PLACEHOLDER_RE = /\$(\w+)/g;

export function interpolateString(
  template: string,
  params: ParamRow,
): string {
  return template.replace(PLACEHOLDER_RE, (match, key) => {
    if (!(key in params)) {
      throw new Error(
        `Missing param "${key}" for template "${template}"`,
      );
    }
    return params[key];
  });
}

function interpolateAssertion(a: Assertion, params: ParamRow): Assertion {
  switch (a.type) {
    case "contains":
    case "not-contains":
      return typeof a.pattern === "string"
        ? { ...a, pattern: interpolateString(a.pattern, params) }
        : { ...a };
    case "tool-called":
    case "tool-not-called":
      return { ...a, toolName: interpolateString(a.toolName, params) };
    case "schema-match":
    case "latency":
    case "token-usage":
      return { ...a };
  }
}

export function expandCase(paramCase: ParamCase): TestCase[] {
  return paramCase.params.map((row) => {
    const input = structuredClone(paramCase.input);

    if (input.systemPrompt) {
      input.systemPrompt = interpolateString(input.systemPrompt, row);
    }

    for (const msg of input.messages) {
      msg.content = interpolateString(msg.content, row);
    }

    if (input.tools) {
      for (const tool of input.tools) {
        tool.name = interpolateString(tool.name, row);
        if (tool.description) {
          tool.description = interpolateString(tool.description, row);
        }
      }
    }

    const assertions = paramCase.assertions.map((a) =>
      interpolateAssertion(a, row),
    );

    return {
      name: interpolateString(paramCase.name, row),
      input,
      assertions,
      skip: paramCase.skip,
      only: paramCase.only,
    };
  });
}
