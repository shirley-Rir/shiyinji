# 拾音记 Demo V1
本人的一个想法，希望有人能做成真正的硬件产品

拾音记是一款支持精准点歌，并基于用户当下情境和账号级音乐画像进行歌曲推荐的音乐产品。明确歌名会直接搜索并播放指定歌曲；情境输入则理解情绪、活动、环境和期望状态，给出一首默认播放歌曲和四首备选。

当前仓库是 Web MVP 的可运行雏形。界面、业务 API、D1 数据持久化、智谱语义理解、网易云本地服务、账号音乐画像、混合推荐和播放反馈闭环已经接通，同时保留 Mock Provider 用于离线开发与回归测试。

## 当前能力

- 文本、图片和图文组合的情境输入界面。
- 点歌意图前置识别，按歌名、歌手和版本精准搜索并直接播放。
- LRC 时间轴歌词、翻译行、播放高亮、自动滚动和点击跳转。
- Top 1 推荐、四首备选和队列切换。
- 网易云账号二维码连接、完整播放解析、暂停、切歌、进度和音量控制。
- 喜欢、不喜欢以及推荐方向反馈。
- 历史、画像、设置与隐私视图。
- 从喜欢列表、歌单和播放记录生成版本化账号音乐画像，并支持手动刷新。
- 用户可编辑喜欢/不喜欢的曲风与歌手、常听语言和熟悉度倾向。
- 情境解析、模型歌曲草案、平台搜索确认、可播放过滤、账号画像二次排序和方向重排的服务端链路。
- `AIProvider`、`MusicProvider` 与 `Repository` 兼容接口及 Mock 实现。
- 桌面端和移动端响应式布局。
- 私有在线预览和服务端渲染测试。

## 尚待完善

- 生产环境账号接入和跨设备画像学习。
- 正式音乐版权服务与公开商业部署。
- 账号画像后台增量刷新、失败重试和版本对比。
- 根据播放与反馈事件自动更新长期画像权重。
- 基于探索测试集持续调整模型策划、歌曲匹配和候选排序。

## 架构文档

- [总体程序架构](docs/architecture/01-system-architecture.md)
- [推荐引擎设计](docs/architecture/02-recommendation-engine.md)
- [API 职责与契约](docs/architecture/03-api-contracts.md)
- [功能链路与时序](docs/architecture/04-feature-flows.md)
- [当前完成度与实施顺序](docs/architecture/05-current-progress.md)
- [发现新歌与账号画像方案](docs/architecture/06-discovery-and-exploration.md)
- [情境语义模型选型与评测](docs/ai/model-selection.md)
- [网易云 Enhanced API 对接研究](docs/integrations/netease-cloud-api.md)
- [项目快速接手](QUICKSTART.md)
- [Web MVP PRD](04-web-mvp-prd.md)
- [技术选型与资源](05-web-mvp-tech-selection-and-resources.md)

## 本地运行

要求 Node.js `>=22.13.0`。

```bash
npm install
npm run dev
```

验证：

```bash
npm test
```

真实语义模型评测需要先根据 `.dev.vars.example` 配置智谱 API Key，再运行：

```bash
npm run eval:context
```

本地真实链路还需要先启动 `ncm-api-enhanced-main` 的 `4000` 端口服务。`.dev.vars` 中设置 `MUSIC_PROVIDER=netease` 后，Web API 会使用真实网易云搜索、权限过滤和播放 URL；该模式仅用于本机封闭测试。

## 技术形态

当前使用 React、TypeScript、vinext、Tailwind CSS、Drizzle ORM、Cloudflare D1 和 lucide-react，并保留 Cloudflare Worker 兼容输出。业务层已经按 `AIProvider`、`MusicProvider`、`RecommendationService` 和 `Repository` 拆分，后续可独立替换模型、音乐平台和数据库实现。
