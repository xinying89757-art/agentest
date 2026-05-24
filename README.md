# Agentest

> **A test framework for AI agents — deterministic assertions, not LLM-as-Judge.**

Agentest 用测试工程的思维评估智能体：用确定性规则验证行为，而不是用另一个 LLM 去给 LLM 打分。改了一行 prompt 不知道有没有把线上搞炸？Agentest 回答这个问题。

---

## 目录

- [为什么需要 Agentest](#为什么需要-agentest)
- [快速开始](#快速开始)
- [CLI 使用手册](#cli-使用手册)
- [断言参考](#断言参考)
- [Mock 响应文件](#mock-响应文件)
- [编程 API](#编程-api)
- [编写测试套件](#编写测试套件)
- [架构设计](#架构设计)
- [与同类工具的对比](#与同类工具的对比)
- [路线图](#路线图)

---

## 为什么需要 Agentest

### 行业现状

目前评估智能体的主流做法各有问题：

| 做法 | 问题 |
|------|------|
| **LLM-as-Judge**（用 GPT-4 打分） | 同一个输出打两次分结果不同。用一个黑盒评估另一个黑盒。 |
| **人工抽查** | 改了 prompt 手动跑几条，感觉差不多就上线。没有回归保护。 |
| **LangSmith / Braintrust** | SaaS 服务，数据要上传。设计偏通用，不专门面向智能体行为验证。 |

### Agentest 的做法

**确定性优先。** 每一条断言都是纯函数——同样的输入，同样的结果，无论跑多少次。

**评估对象是"行为"，不是"模型"。** 不关心模型的"质量分"，只验证：给定输入下，智能体是不是调了该调的工具、说了该说的话、没做不该做的事。

**面向 CI 设计。** CLI 入口 + exit code，直接放进 GitHub Actions / GitLab CI，不通过就拦截。

---

## 快速开始

### 安装

```bash
npm install -g agentest
```

### 第一个测试套件

```ts
// order-agent.test.ts
import { suite, assertions } from "agentest";

export default suite({
  name: "订单查询智能体",

  cases: [
    {
      name: "查询有效订单时调用 query_order 工具",
      input: {
        systemPrompt: "你是客服助手，用 query_order 查订单。不要主动取消订单。",
        messages: [{ role: "user", content: "帮我查订单 ORD-001 的状态" }],
        tools: [
          { name: "query_order", description: "查询订单", parameters: {} },
          { name: "cancel_order", description: "取消订单", parameters: {} },
        ],
      },
      assertions: [
        assertions.toolCalled("query_order"),
        assertions.toolNotCalled("cancel_order"),
        assertions.contains("ORD-001"),
        assertions.latency(5000),
        assertions.tokenUsage(100000),
      ],
    },
  ],
});
```

### 运行

```bash
# 快速验证（不调 API，零成本）
agentest run ./order-agent.test.ts --provider mock

# 连接真实 Claude
export ANTHROPIC_API_KEY=sk-ant-...
agentest run ./order-agent.test.ts --provider anthropic

# CI 输出 JSON
agentest run ./order-agent.test.ts --provider mock --json
```

```text
订单查询智能体

  ✓ 查询有效订单时调用 query_order 工具 (0ms)

  1 passed, 0 failed, (1ms)
```

非 0 的 exit code 表示存在失败用例，CI 可直接拦截。

---

## CLI 使用手册

### `agentest run <path>`

```bash
agentest run <path> [options]
```

`<path>` 支持 `.ts` 和 `.js` 文件。

| 选项 | 说明 | 默认值 |
|------|------|--------|
| `-p, --provider <name>` | Provider：`mock` 或 `anthropic` | `mock` |
| `-m, --model <name>` | 模型名称（仅 Anthropic） | `claude-sonnet-4-6` |
| `-t, --timeout <ms>` | 每个测试用例的超时（毫秒） | `30000` |
| `--mock-response <json>` | 内联 mock 响应配置 | — |
| `--mock-responses-file <path>` | JSON 文件配置 mock 响应 | — |
| `--json` | 以 JSON 格式输出结果 | — |

### 示例

```bash
# 用内联 JSON 配置 mock 响应
agentest run ./tests.test.ts --provider mock \
  --mock-response '{"content":"处理中","toolCalls":[{"name":"query","arguments":{}}]}'

# 从文件加载 mock 响应
agentest run ./tests.test.ts --provider mock \
  --mock-responses-file ./mock-responses.json

# 指定模型和超时
agentest run ./tests.test.ts --provider anthropic --model claude-opus-4-7 --timeout 15000

# 只运行标记了 only 的用例
# （在测试文件中给指定用例加 only: true，其他用例自动跳过）
```

### `agentest snapshot <action> <path>`

```bash
agentest snapshot save <path> [options]    # 运行测试并保存基线快照
agentest snapshot diff <path> [options]    # 运行测试并与基线对比
agentest snapshot update <path> [options]  # 运行测试并覆盖基线快照
```

回归快照用于在改 prompt 或换模型后，自动检测智能体行为是否发生了意外变化。

| 选项 | 说明 | 默认值 |
|------|------|--------|
| `-p, --provider <name>` | Provider：`mock` 或 `anthropic` | `mock` |
| `-m, --model <name>` | 模型名称（仅 Anthropic） | `claude-sonnet-4-6` |
| `-t, --timeout <ms>` | 每个测试用例的超时（毫秒） | `30000` |
| `--mock-response <json>` | 内联 mock 响应配置 | — |
| `--mock-responses-file <path>` | JSON 文件配置 mock 响应 | — |
| `--snapshot-dir <dir>` | 快照文件存放目录 | `./agentest-snapshots` |

### Snapshot 工作流示例

```bash
# 1. 首次：建立基线
agentest snapshot save ./tests.test.ts --provider mock --mock-responses-file ./responses.json

# 2. 改了 prompt 后：检查行为变化
agentest snapshot diff ./tests.test.ts --provider mock --mock-responses-file ./responses.json
# ✓ unchanged: 4 tests

# 3. 确认变更是预期行为后：更新基线
agentest snapshot update ./tests.test.ts --provider mock --mock-responses-file ./responses.json
```

diff 输出示例：

```text
Snapshot diff: Customer Service Agent

  ✓ handles non-existent order gracefully — unchanged
  ✓ queries order for valid order ID — unchanged
  ~ queries order returns structured JSON — tool calls changed, content diverged (42%), fail→pass
  ⊕ new safety check test — new test, no baseline

  2 unchanged, 1 changed, 1 added
```

对比维度：
- **Tool calls 签名**：工具名称序列是否一致
- **回复内容**：Jaccard 文本相似度（<60% 标记为 diverged）
- **Pass/Fail 状态**：pass→fail 标记为 REGRESSION
- **测试用例增减**：新增用例或删除用例都会被检测到

---

## 断言参考

全部 7 种断言都是**确定性规则**——不依赖 LLM，每次运行结果一致。

### `contains(pattern)`

验证智能体回复中**包含**指定文本。

```ts
assertions.contains("ORD-001")       // 字符串匹配
assertions.contains(/订单\s*#\d+/)    // 正则匹配
```

### `notContains(pattern)`

验证智能体回复中**不包含**指定文本。适用于安全检查：不应出现幻觉的订单号、内部错误信息、竞品名称等。

```ts
assertions.notContains("error")
assertions.notContains("exception")
assertions.notContains(/sk-[a-zA-Z0-9]+/)  // 不应泄露 API key
```

### `schemaMatch(zodSchema)`

验证智能体回复是**合法的 JSON** 且**符合指定 Schema**。适用于结构化输出场景。

```ts
import { z } from "zod";

assertions.schemaMatch(z.object({
  orderId: z.string(),
  status: z.enum(["pending", "shipped", "delivered"]),
  items: z.number().int().positive(),
}))
```

### `toolCalled(name)`

验证智能体**调用了**指定工具。

```ts
assertions.toolCalled("query_order")
```

### `toolNotCalled(name)`

验证智能体**没有调用**指定工具。适用于安全检查——不该调的工具绝对不能调。

```ts
assertions.toolNotCalled("cancel_order")
assertions.toolNotCalled("delete_user")
```

### `latency(thresholdMs)`

验证智能体**响应时间**不超过阈值。

```ts
assertions.latency(5000)  // 必须在 5 秒内回复
```

### `tokenUsage(maxTokens)`

验证 **token 消耗**不超过限制。对成本敏感的场景尤其有用。

```ts
assertions.tokenUsage(4000)  // 单次对话不超过 4000 tokens
```

---

## Mock 响应文件

Mock Provider 根据用户输入做**关键词匹配**，返回预设响应。便于在不调用 API 的情况下快速迭代测试用例。

### 格式

```json
{
  "<关键词1>": {
    "content": "<智能体回复文本>",
    "toolCalls": [
      { "name": "<工具名>", "arguments": { "<参数>": "<值>" } }
    ]
  },
  "<关键词2>": {
    "content": "<智能体回复文本>"
  }
}
```

### 示例

```json
{
  "ORD-001": {
    "content": "订单 ORD-001 正在处理中，预计 2 个工作日内发货。",
    "toolCalls": [
      { "name": "query_order", "arguments": { "orderId": "ORD-001" } }
    ]
  },
  "ORD-999": {
    "content": "未找到订单 ORD-999，请核实订单号是否正确。",
    "toolCalls": [
      { "name": "query_order", "arguments": { "orderId": "ORD-999" } }
    ]
  }
}
```

匹配规则：遍历 JSON 所有 key，如果用户最后一条消息**包含**某个 key，则使用对应的响应。都不匹配时使用 defaultResponse。

### 使用

```bash
agentest run ./tests.test.ts --provider mock --mock-responses-file ./responses.json
```

也可以在不使用文件的情况下直接用内联 JSON 覆盖默认响应：

```bash
agentest run ./tests.test.ts --provider mock \
  --mock-response '{"content":"处理完成","toolCalls":[]}'
```

---

## 编程 API

除了 CLI 之外，也可以作为库使用。

```ts
import {
  runSuite,
  suite,
  assertions,
  MockProvider,
  AnthropicProvider,
  Reporters,
} from "agentest";

// 创建 Provider
const provider = new MockProvider({
  defaultResponse: {
    content: "订单 ORD-001 正在处理中。",
    toolCalls: [{ name: "query_order", arguments: { orderId: "ORD-001" } }],
  },
  responses: new Map([
    ["ORD-999", { content: "未找到该订单。" }],
  ]),
});

// 定义测试套件
const orderSuite = suite({
  name: "订单查询智能体",
  cases: [
    {
      name: "有效订单号应调用 query_order",
      input: {
        systemPrompt: "你是客服助手。",
        messages: [{ role: "user", content: "查订单 ORD-001" }],
        tools: [{ name: "query_order", description: "查订单", parameters: {} }],
      },
      assertions: [
        assertions.toolCalled("query_order"),
        assertions.contains("ORD-001"),
      ],
    },
  ],
});

// 执行
const result = await runSuite(orderSuite, provider);
// {
//   suiteName: "订单查询智能体",
//   total: 1,
//   passed: 1,
//   failed: 0,
//   skipped: 0,
//   results: [...],
//   durationMs: 1
// }

// 输出报告
console.log(Reporters.cli(result));
console.log(Reporters.json(result));
```

### 导出的 API 一览

| 导出 | 类型 | 说明 |
|------|------|------|
| `suite(def)` | Function | 创建测试套件 |
| `assertions` | Object | 断言构建器（7 个方法） |
| `runSuite(suite, provider, opts?)` | Function | 执行测试套件 |
| `MockProvider` | Class | Mock provider |
| `AnthropicProvider` | Class | Anthropic provider |
| `Reporters.cli(result)` | Function | 终端彩色输出 |
| `Reporters.json(result)` | Function | JSON 格式输出 |
| `AgentProvider` | Interface | Provider 接口（扩展用） |

---

## 参数化测试

用 `$paramName` 占位符定义测试模板，通过多行参数数据批量生成测试变体。

```ts
import { suite, assertions } from "agentest";

export default suite({
  name: "订单查询",

  cases: [
    // 参数化：一个模板，三行数据 → 三个测试用例
    {
      name: "查询 $orderId → 应调用 query_order",
      params: [
        { orderId: "ORD-001" },
        { orderId: "ORD-002" },
        { orderId: "ORD-999" },
      ],
      input: {
        systemPrompt: "你是客服助手，用 query_order 查订单。",
        messages: [{ role: "user", content: "帮我查 $orderId" }],
        tools: [{ name: "query_order", description: "查订单", parameters: {} }],
      },
      assertions: [
        assertions.toolCalled("query_order"),
        assertions.contains("$orderId"),
        assertions.latency(5000),
      ],
    },

    // 普通测试用例可以和参数化用例混用
    {
      name: "不应主动取消订单",
      input: { /* ... */ },
      assertions: [assertions.toolNotCalled("cancel_order")],
    },
  ],
});
```

`$paramName` 占位符可以出现在：
- `name` — 测试名称
- `input.systemPrompt`
- `input.messages[].content`
- `input.tools[].name` / `input.tools[].description`
- `assertions.contains()` / `assertions.notContains()` 的 pattern
- `assertions.toolCalled()` / `assertions.toolNotCalled()` 的 toolName

参数行是 flat rows：每行是一个 `Record<string, string>`，生成一个测试用例。如果 `$param` 引用了不存在的 key，展开时会抛出明确错误。

---

## 编写测试套件

### skip / only

支持传统测试框架的 `skip` 和 `only` 语义：

```ts
cases: [
  {
    name: "开发中的用例，先跳过",
    skip: true,  // 跳过此用例
    // ...
  },
  {
    name: "只跑这个用例调试",
    only: true,  // 只运行标记了 only 的用例
    // ...
  },
]
```

- 存在 `only: true` 的用例时，自动跳过所有未标记 `only` 的用例
- `skip: true` 和 `only: true` 同时存在时，`skip` 生效（不运行）

### 工作流建议

```
1. 用 mock provider 写测试，验证断言逻辑本身没写错
2. 切到 Anthropic provider 跑真实评估
3. 放入 CI：每次改 prompt / 换模型 → 自动跑 → 不通过就拦截
```

### 输出解读

**通过时**：输出中不包含 `agentOutput` 字段（减少噪音）。

**失败时**：每个失败的断言附带了详细的失败原因和完整的智能体输出，方便定位问题。JSON 模式下包含 `agentOutput` 字段。

---

## 架构设计

```
                        ┌──────────────┐
  .test.ts 文件 ───────▶│    Runner    │──────▶ Reporter (CLI / JSON)
                        │              │
                        │  ┌──────────┐│
                        │  │Assertions ││
                        │  │ · schema  ││
                        │  │ · content ││
                        │  │ · tools   ││
                        │  │ · perf    ││
                        │  └──────────┘│
                        │              │
  AgentProvider ◀───────┤  Provider    │
  (Anthropic / Mock)    └──────────────┘
```

### 三层设计

**Provider 层** — 适配不同 AI 提供商。每种 Provider 实现统一的 `AgentProvider` 接口：

```ts
interface AgentProvider {
  readonly name: string;
  run(input: AgentInput): Promise<AgentOutput>;
}
```

- `AnthropicProvider`：封装 `@anthropic-ai/sdk`，完整支持 tool calling
- `MockProvider`：关键词匹配返回预设响应，零 API 成本
- 计划中的 `OpenAIProvider` 只需实现同一接口

**断言层** — 全部是纯函数，输入 `AgentOutput`，输出 `AssertionResult`。不依赖 LLM，不调外部 API，可复现。

**Runner 层** — 负责编排：加载测试文件 → 调用 Provider → 运行断言 → 汇总结果 → 输出报告。支持 `skip`/`only`、超时控制、错误捕获。

### 核心设计决策

1. **确定性优先**。每条断言都是纯函数。LLM-as-Judge 可以作为可选补充，但不是默认方式。
2. **Provider 无关**。同一套测试可以在 mock 和真实模型之间自由切换。
3. **测试工程模式**。`skip`/`only`、失败时输出完整上下文用于调试、CI exit code——这些都是软件测试领域的成熟实践，直接搬进了智能体领域。

---

## 与同类工具的对比

| | Promptfoo | DeepEval | **Agentest** |
|---|---|---|---|
| **心智模型** | "哪个 prompt 更好" | "用 LLM 给模型打分" | **"改完之后坏没坏"** |
| **断言方式** | 弱断言（contains / is-json） | LLM-as-Judge 为主 | **确定性规则为主** |
| **Tool call 验证** | ❌ | ❌ | ✅ |
| **参数化测试** | ❌ | ❌ | ✅ |
| **回归快照** | ❌ | ❌ | ✅ |
| **边界注入** | ❌ | ❌ | 🚧 计划中 |
| **CI 集成** | ✅ | ✅ | ✅ |
| **本地运行** | ✅ | ✅ | ✅ |
| **开源** | ✅ | ✅ | ✅ |

---

## 路线图

| 功能 | 状态 | 说明 |
|------|------|------|
| 7 种确定性断言 | ✅ 已完成 | contains, notContains, schemaMatch, toolCalled, toolNotCalled, latency, tokenUsage |
| Mock Provider | ✅ 已完成 | 关键词匹配，支持 JSON 配置文件 |
| Anthropic Provider | ✅ 已完成 | 完整 tool calling 支持 |
| CLI | ✅ 已完成 | TS/JS 双格式，JSON 输出，exit code |
| 超时控制 | ✅ 已完成 | 每个用例独立超时 |
| **参数化测试** | ✅ 已完成 | 同一模板 × 多组输入，批量生成测试变体 |
| **回归快照** | ✅ 已完成 | 改 prompt 前后自动 diff 智能体行为变化 |
| **边界注入** | 🚧 计划中 | Prompt 注入、超长上下文、编码攻击等对抗性输入 |
| **循环检测断言** | 🚧 计划中 | 检测智能体是否陷入重复调用同一工具 |
| OpenAI Provider | 🚧 计划中 | 支持 GPT-4o 等模型 |
| Markdown 报告 | 🚧 计划中 | `--report markdown` 输出可存档的报告 |

---

## License

MIT
