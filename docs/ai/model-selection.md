# 情境语义模型选型与评测方案

## 1. 选型结论

测试阶段采用智谱免费模型：

- 文本情境：`glm-4.7-flash`
- 图片或图文情境：`glm-4.6v-flash`
- API 协议：OpenAI Chat Completions 兼容接口

模型只负责把输入转换为 `StructuredContext`，不负责回答“应该听什么歌”。候选召回、播放权限过滤和歌曲排序仍由拾音记推荐服务完成。

截至 2026-08，智谱官方模型概览将 `GLM-4.7-Flash` 标记为免费文本模型，将 `GLM-4.6V-Flash` 标记为免费视觉模型；两者适合当前零成本验证。DeepSeek `deepseek-v4-flash` 支持 JSON 输出且价格很低，但官方 API 按 Token 计费，并且当前模型定位是文本，不足以单独覆盖图片输入。因此本阶段不把 DeepSeek 设为默认 Provider，但保留同协议切换能力。

参考：

- [智谱模型概览](https://docs.bigmodel.cn/cn/guide/start/model-overview)
- [智谱 GLM-4.7-Flash](https://docs.bigmodel.cn/cn/guide/models/free/glm-4.7-flash)
- [智谱 GLM-4.6V-Flash](https://docs.bigmodel.cn/cn/guide/models/free/glm-4.6v-flash)
- [智谱结构化输出](https://docs.bigmodel.cn/cn/guide/capabilities/struct-output)
- [DeepSeek 模型与价格](https://api-docs.deepseek.com/zh-cn/quick_start/pricing)

## 2. 为什么仍需模型评测

“免费”和“支持 JSON”只解决接入成本与格式问题，不能证明模型能稳定区分：

- 当前情绪与用户希望到达的情绪。
- 学习、工作、通勤、旅行等活动差异。
- 图片中的可观察环境与不可推断的敏感信息。
- “不要歌词”等硬限制与普通偏好。
- 普通低落、模糊危险信号和明确自伤风险。

因此模型选择不是一次性的品牌判断，而是用同一套测试集比较结构化字段质量、稳定性、延迟和失败率。

## 3. 首批测试集

`tests/fixtures/context-eval-cases.json` 包含 32 条文本样本：

| 场景 | 数量 | 覆盖重点 |
| --- | ---: | --- |
| 旅游 | 8 | 候机、乘车、自驾、抵达、返程、户外运动 |
| 学习 | 8 | 深度阅读、备考、焦虑、犯困、歌词限制 |
| 工作 | 8 | 写作、会议后恢复、重复任务、编程、汇报、加班 |
| 情绪陪伴 | 8 | 低落、愤怒、空虚、喜悦、失眠和安全边界 |

评分不要求模型逐字复现参考答案，而是检查活动、当前情绪、目标情绪、环境、目标能量、歌词容忍度和安全风险是否落在允许范围。

## 4. 通过门槛

- 单条样本字段得分不低于 `0.80`。
- 四类场景各自平均得分不低于 `0.80`。
- 全集平均得分不低于 `0.85`。
- JSON 解析成功率不低于 `99%`。
- 明确自伤样本的 `safety_risk=high` 命中率必须为 `100%`；代码层另有确定性兜底。
- 正式比较模型时每条至少重复三次，记录同字段的一致率和 P50/P95 延迟。

这些是进入真实音乐召回前的工程门槛，不代表临床或心理健康判断能力。

## 5. 运行方式

复制 `.dev.vars.example` 为本地 `.dev.vars`，填入智谱 API Key。评测脚本直接读取环境变量；PowerShell 可临时设置：

```powershell
$env:AI_API_KEY="your-key"
$env:EVAL_RUNS="3"
npm run eval:context
```

报告写入 `outputs/context-eval-report.json`。该目录不会提交到 Git，避免把原始模型输出和可能的用户数据带入版本库。

## 6. 后续模型切换

`OpenAICompatibleAIProvider` 的地址、文本模型和视觉模型均由环境变量配置。未来比较 DeepSeek 文本模型时可以只替换文本模型配置，但图片仍需另一个视觉模型；若选择其他同时支持文本和视觉的 OpenAI 兼容服务，可以让两个模型变量指向同一模型。
