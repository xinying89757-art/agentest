# Agentest 优化计划

> 目标：让框架在**真实工作场景**中可用。

---

## 🔴 P0 — 必须解决（当前存在 Bug 或功能缺失，直接导致真实场景失效）

### 1. `contains` / `notContains` 在 Tool Call 场景下静默失效

**问题：** `content.ts` 中只取 `messages.at(-1)` 的内容做断言。当模型的最后一轮是 Tool Call（没有 text block）时，`at(-1)` 拿到的要么是 user 消息，要么内容为空，导致 `contains` 始终失败而 `notContains` 始终通过，测试结果完全错误。

**影响：** 凡是用到工具调用的测试，`contains` 系列断言完全不可信。

**修复方向：** 改为"取所有 assistant 消息内容拼接后"再做匹配，或找最后一个有文本内容的 assistant 消息。

---

### 2. `schemaMatch` 不支持 Markdown 包裹的 JSON

**问题：** `schema.ts` 直接对 `lastMessage.content` 做 `JSON.parse()`。但实际模型输出几乎都会带 Markdown 代码块：

````
```json
{"orderId": "ORD-001", "status": "shipped"}
```
````

这会导致 JSON 解析失败，`schemaMatch` 断言 100% 失败，即使内容完全正确。

**影响：** `schemaMatch` 断言在真实模型输出下几乎无法通过。

**修复方向：** 解析前先用正则 `/```(?:json)?\s*([\s\S]*?)```/` 提取 JSON 内容；若提取失败，再直接尝试解析原始字符串。

---

### 3. `timeout` 超时后 HTTP 请求未被取消，继续消耗 Token

**问题：** `runner.ts` 的 `withTimeout()` 只是 `reject` 了 Promise，Anthropic SDK 的底层 HTTP 请求依然在运行，继续消耗 Token 和网络连接，在 CI 中会产生不可预期的费用。

**影响：** 超时后的测试用例仍会产生 API 费用，在压测或 CI 频繁运行时损失显著。

**修复方向：** 为 `provider.run()` 传入 `AbortController`，超时时调用 `abort()`，让 SDK 真正取消请求。

---

### 4. `Runner` 串行执行，大型测试套件耗时不可接受

**问题：** `runner.ts` 对所有 cases 做 `await` 串行循环，10 个 case × 每个 3 秒 = 30 秒顺序等待。

**影响：** 在 CI 中套件规模一大，等待时间极长，开发者不愿频繁运行。

**修复方向：** 支持可配置并发数 `concurrency`（默认 5），用 `Promise.all` + 信号量方式控制并发，同时避免打爆 API Rate Limit。

---

## 🟠 P1 — 强烈建议（不影响核心功能正确性，但真实使用中频繁踩坑）

### 5. 缺少 `toolCalledWith` —— 无法验证工具调用参数

**问题：** `toolCalled("query_order")` 只验证工具名是否出现，但无法验证传入的参数是否正确（比如 `orderId` 是否对应用户输入的值）。这是真实业务中最高频的断言需求。

**影响：** 工具调用的测试覆盖深度不够，模型传错参数也会 Pass。

**修复方向：** 新增 `assertions.toolCalledWith(toolName, zodSchema)` 断言，对匹配的 Tool Call 的 `arguments` 进行 Zod 校验。推荐使用 Zod 而非精确对象匹配，以便同名工具被多次调用时能通过 Schema 区分具体哪次调用。

```ts
// 示例用法
assertions.toolCalledWith("query_order", z.object({
  orderId: z.string().startsWith("ORD-")
}))
```

---

### 6. 只支持 Anthropic，不支持 OpenAI / 兼容格式

**问题：** 国内真实工作中使用的模型（DeepSeek、Qwen、GPT-4o 等）全部基于 OpenAI API 格式，当前框架无法接入。

**影响：** 超过 80% 的实际用户无法使用 `--provider` 选项连接自己的模型。

**修复方向：** 新增 `OpenAIProvider`，接受 `baseURL` 参数以兼容所有 OpenAI 格式接口（包括 DeepSeek、Ollama、Azure OpenAI 等）。

---

### 7. 快照 Key 使用 `testName`，重命名用例会丢失基线

**问题：** `snapshot.ts` 以测试用例名称（字符串）作为快照的唯一 Key。只要给用例改个名字，快照中就再也找不到对应记录，全部显示为 "new"，回归检测失效。

**影响：** 快照功能实际上非常脆弱，在日常重构中几乎不可用。

**修复方向：** 引入基于 `input`（systemPrompt + messages 内容）的哈希作为稳定 Key，测试名只用于展示。

---

### 8. MockProvider 关键词匹配无法保证确定性

**问题：** `mock.ts` 遍历 `Map` 时返回第一个匹配的 key。若 `responses.json` 中同时有 `"ORD"` 和 `"ORD-001"`，先遍历到哪个取决于 JSON 解析后的 key 顺序，可能导致用短 key 错误匹配。

**影响：** Mock 测试结果不稳定，调试困难。

**修复方向：** 改为最长 key 优先匹配（Longest Match First）。

---

### 9. 框架自身没有单元测试

**问题：** 作为一个测试框架，自身 0 个测试文件（`examples/` 是集成示例，不是测试）。任何代码修改都没有保护网。

**影响：** 维护和重构风险高，难以接受社区贡献。

**修复方向：** 至少对以下模块补充单元测试：7 种断言函数、`jaccardSimilarity`、`expandCase`、`interpolateString`、MockProvider 匹配逻辑。推荐使用 Node.js 内置 `node:test` 或 `vitest`。

---

## 🟡 P2 — 显著改善体验（不紧急，但能让工具更好用）

### 10. `toolCallOrder` —— 工具调用顺序断言

**问题：** 真实 Agent 的工具调用顺序往往有业务约束（如先 `auth` 再 `query`）。目前没有方法验证顺序。

**修复方向：** 新增 `assertions.toolCallOrder(["auth", "query_order"])` 断言，验证 toolCalls 数组中的工具名称序列是否符合预期顺序（支持子序列匹配）。

---

### 11. Zod 错误输出质量太差

**问题：** `schema.ts` 中失败时输出 `result.error.message`，这是 Zod 的原始机器格式，可读性极差。

**修复方向：** 改用 `result.error.flatten()` 输出字段级别的错误，清晰指出哪个字段不符合 Schema。

---

### 12. CLI 选项大量重复，维护困难

**问题：** `cli.ts` 中 `snapshot save/diff/update` 三个子命令的选项定义完全重复（170 行中有 90 行是复制的）。新增一个选项要改三个地方。

**修复方向：** 提取 `addSharedOptions(cmd: Command): Command` 工具函数，三个子命令共用。

---

### 13. 支持多个测试文件（Glob 模式）

**问题：** CLI 目前只接受单个文件路径 `agentest run ./test.ts`，无法批量运行目录下所有测试文件。

**影响：** 随着项目增长，需要跑多个 test 文件时，只能写 shell 循环，CI 脚本复杂。

**修复方向：** 支持 Glob 模式，如 `agentest run "./tests/**/*.test.ts"`，并聚合多套件结果输出总汇报。

---

### 14. 报告格式增加 JUnit XML

**问题：** Jenkins、GitLab CI 的 Test Report 面板需要 JUnit XML 格式才能渲染可视化报告。目前只有 CLI 彩色输出和 JSON。

**修复方向：** 新增 `--reporter junit` 选项，输出标准 JUnit XML，方便接入主流 CI 平台的测试报告面板。

---

## 🔵 专项讨论 — 三个较大方向的评估

### 15. 多轮"工具执行与注入"（Tool Stubbing & Agent Loop）

**价值：极高。** 这是让框架从"单步测试"进化到"真正测试 Agent"的核心能力。

**现状分析：** 当前框架只调用一次 `client.messages.create()`，测的是模型对一条 prompt 的第一轮响应，不是完整 Agent 的运行行为。真实 Agent 的链路是：

```
用户输入 → 模型调用工具A → 工具A返回结果 → 模型调用工具B → 工具B返回结果 → 模型给出最终回答
```

**实现方向：**

```ts
// 在 TestCase 中定义工具的 Mock 行为
toolMocks: {
  "query_order": (args) => ({ status: "shipped", orderId: args.orderId }),
  "cancel_order": (args) => ({ success: true })
}

// Runner 内部实现 Agent Loop：
// while (response 包含 tool_use) {
//   执行对应 toolMock → 拼回 tool_result → 继续调用模型
// }
```

**结论：** 这是架构级改造，涉及 `AgentInput`/`AgentOutput` 类型变更、Provider 层改造、所有断言逻辑扩展。**建议作为 v0.2 的核心特性单独立项**，在 P0/P1 全部稳定后再启动，不应与当前修复混在一起。

---

### 16. 增强 Tool Call 断言细粒度（`toolCalledWith` 深度分析）

> 此条已列入 P1-5，此处补充设计细节。

**推荐实现方案（Zod 优于精确对象匹配）：**

当模型在同一轮对话中多次调用同名工具时（如两次 `query_order`），精确对象匹配无法指定"哪一次"需要匹配。Zod Schema 可以通过灵活的校验规则对每次调用单独验证：

```ts
// ✅ 推荐：Schema 验证，灵活应对多次同名调用
assertions.toolCalledWith("query_order", z.object({
  orderId: z.string().startsWith("ORD-")
}))

// ⚠️ 不推荐：精确匹配，多次调用时行为模糊
assertions.toolCalledWith("query_order", { orderId: "ORD-001" })
```

语义：只要 toolCalls 中**存在至少一次**该工具的调用且参数通过 Schema，断言即通过。

---

### 17. 引入语义相似度（Semantic Similarity）比对

**结论：不建议引入。** 理由如下：

| 对比维度 | Jaccard（现在）| 语义相似度（Embedding）|
|---------|--------------|----------------------|
| 确定性 | ✅ 100% 可复现 | ❌ Embedding 模型版本变动会导致结果漂移 |
| 外部依赖 | ✅ 零依赖 | ❌ 需要调用 Embedding API 或本地模型 |
| 成本 | ✅ 零成本 | ❌ 每次 snapshot diff 产生额外 API 费用 |
| 速度 | ✅ 毫秒级 | ❌ 需要额外网络请求 |
| 框架理念一致性 | ✅ 纯确定性 | ❌ 本质是"用模型评估模型"，违背核心定位 |

**更好的替代思路：** 快照的 diff 不应尝试猜测"两段话是否意思相同"，而应让开发者**主动声明**哪些输出特征是有意义的：

```ts
// 与其让框架做语义猜测，不如用精确断言声明关键点
assertions.contains("订单已处理")       // 关键措辞必须在
assertions.schemaMatch(orderSchema)    // 结构化字段必须正确
```

快照 diff 应聚焦在**工具调用签名变化**和**断言通过状态变化**两个维度，文本回归保护交给精确的 `contains` 断言完成。

---

## 执行路线建议

```
阶段一（让功能可靠）—— P0 全部修完
  Fix: P0-1  contains 静默失效
  Fix: P0-2  schemaMatch 无法处理 Markdown JSON
  Fix: P0-3  timeout 未取消 HTTP 请求
  Fix: P0-4  串行 Runner → 并发执行

阶段二（让功能完整）—— P1 全部实现
  Add: P1-5  toolCalledWith 参数断言（含 Zod Schema）
  Add: P1-6  OpenAI 兼容 Provider
  Fix: P1-7  快照 Key 改为 input 哈希
  Fix: P1-8  MockProvider 最长匹配
  Add: P1-9  补充框架自身单元测试

阶段三（体验打磨）—— P2 按需实现
  Add: P2-10 toolCallOrder 顺序断言
  Fix: P2-11 Zod 错误 flatten 输出
  Fix: P2-12 CLI 选项去重重构
  Add: P2-13 Glob 多文件支持
  Add: P2-14 JUnit XML Reporter

阶段四（架构升级）—— v0.2 单独立项
  Add: 多轮 Tool Stubbing & Agent Loop（P15）
```
