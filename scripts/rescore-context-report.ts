import { readFile, writeFile } from "node:fs/promises";
import { contextEvalCasesSchema, scoreContextCase, type ContextEvalResult } from "../src/evaluation/context";

const reportPath = "outputs/context-eval-report.json";
const report = JSON.parse(await readFile(reportPath, "utf8")) as {
  provider: string;
  runs: number;
  results: Array<ContextEvalResult | { id: string; category: ContextEvalResult["category"]; score: 0; error: string }>;
  [key: string]: unknown;
};
const cases = contextEvalCasesSchema.parse(JSON.parse(await readFile("tests/fixtures/context-eval-cases.json", "utf8")));
const caseById = new Map(cases.map((item) => [item.id, item]));
const results = report.results.map((result) => {
  if ("error" in result) return result;
  const testCase = caseById.get(result.id);
  if (!testCase) throw new Error(`评测报告包含未知样本：${result.id}`);
  return scoreContextCase(testCase, result.context);
});
const categoryScores = Object.fromEntries([...new Set(results.map((item) => item.category))].map((category) => {
  const selected = results.filter((item) => item.category === category);
  return [category, average(selected.map((item) => item.score))];
}));
const rescored = {
  ...report,
  rescoredAt: new Date().toISOString(),
  overallScore: average(results.map((item) => item.score)),
  categoryScores,
  results,
  failed: results.filter((item) => item.score < 0.8),
};
await writeFile(reportPath, `${JSON.stringify(rescored, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify({ overallScore: rescored.overallScore, categoryScores, failed: rescored.failed.map((item) => item.id) }, null, 2)}\n`);

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
