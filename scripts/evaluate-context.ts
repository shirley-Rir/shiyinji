import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { contextEvalCasesSchema, scoreContextCase, type ContextEvalResult } from "../src/evaluation/context";
import { OpenAICompatibleAIProvider } from "../src/providers/ai/real";

if (existsSync(".dev.vars")) loadEnvFile(".dev.vars");

const apiKey = process.env.AI_API_KEY ?? process.env.ZAI_API_KEY;
if (!apiKey) throw new Error("请先设置 AI_API_KEY 或 ZAI_API_KEY，再运行 npm run eval:context");

const provider = new OpenAICompatibleAIProvider({
  apiKey,
  baseUrl: process.env.AI_BASE_URL ?? "https://open.bigmodel.cn/api/paas/v4",
  textModel: process.env.AI_TEXT_MODEL ?? "glm-4.7-flash",
  visionModel: process.env.AI_VISION_MODEL ?? "glm-4.6v-flash",
  thinking: "disabled",
  timeoutMs: Number(process.env.AI_TIMEOUT_MS ?? 45_000),
  maxRetries: Number(process.env.AI_MAX_RETRIES ?? 4),
  retryBaseMs: Number(process.env.AI_RETRY_BASE_MS ?? 1500),
});
const runs = Math.max(1, Number(process.env.EVAL_RUNS ?? 1));
const delayMs = Math.max(0, Number(process.env.EVAL_DELAY_MS ?? 1200));
const casesPath = resolve("tests/fixtures/context-eval-cases.json");
const allCases = contextEvalCasesSchema.parse(JSON.parse(await readFile(casesPath, "utf8")));
const caseFilter = process.env.EVAL_CASE_FILTER?.trim();
const limit = Number(process.env.EVAL_LIMIT ?? 0);
const filteredCases = caseFilter ? allCases.filter((item) => item.id.includes(caseFilter) || item.category === caseFilter) : allCases;
const cases = limit > 0 ? filteredCases.slice(0, limit) : filteredCases;
if (cases.length === 0) throw new Error(`没有匹配 EVAL_CASE_FILTER=${caseFilter ?? ""} 的测试样本`);
type Attempt = ContextEvalResult | { id: string; category: ContextEvalResult["category"]; score: 0; error: string };
const results: Attempt[] = [];

for (let run = 0; run < runs; run += 1) {
  for (const testCase of cases) {
    try {
      const interpretation = await provider.interpretContext(testCase.input);
      const result = scoreContextCase(testCase, interpretation.context);
      results.push(result);
      process.stdout.write(`${result.score >= 0.8 ? "PASS" : "FAIL"} ${testCase.id} run=${run + 1} score=${result.score.toFixed(2)}\n`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      results.push({ id: testCase.id, category: testCase.category, score: 0, error: message });
      process.stdout.write(`ERROR ${testCase.id} run=${run + 1} ${message}\n`);
    }
    if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}

const categories = [...new Set(cases.map((item) => item.category))];
const categoryScores = Object.fromEntries(categories.map((category) => {
  const selected = results.filter((item) => item.category === category);
  return [category, average(selected.map((item) => item.score))];
}));
const report = {
  generatedAt: new Date().toISOString(),
  provider: provider.name,
  runs,
  cases: cases.length,
  overallScore: average(results.map((item) => item.score)),
  categoryScores,
  results,
  failed: results.filter((item) => item.score < 0.8),
};
const reportPath = resolve("outputs/context-eval-report.json");
await mkdir(dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
const { results: _results, ...summary } = report;
void _results;
process.stdout.write(`${JSON.stringify({ ...summary, failed: report.failed.map((item) => item.id) }, null, 2)}\n`);

if (report.overallScore < 0.85 || Object.values(categoryScores).some((score) => score < 0.8)) process.exitCode = 1;

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
