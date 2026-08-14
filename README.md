# 拾音记 Demo V1

拾音记是一款基于用户当下情境和账号级音乐画像进行歌曲推荐的音乐产品。用户可以输入一句话、上传一张图片，或同时提供图文；系统理解情绪、活动、环境和期望状态后，给出一首默认播放歌曲和四首备选。

当前仓库是 Web MVP 的可运行雏形。界面、业务 API、D1 数据持久化、Mock 推荐链路和播放反馈闭环已经接通；真实语义模型、音乐平台授权和曲库仍待接入。

## 当前能力

- 文本、图片和图文组合的情境输入界面。
- Top 1 推荐、四首备选和队列切换。
- 示例音频播放、暂停、切歌、进度和音量控制。
- 喜欢、不喜欢以及推荐方向反馈。
- 历史、画像、设置与隐私视图。
- 账号级画像、情境会话、推荐结果、播放事件和反馈事件持久化。
- 情境解析、候选召回、可播放过滤、加权排序和方向重排的服务端链路。
- `AIProvider`、`MusicProvider` 与 `Repository` 兼容接口及 Mock 实现。
- 桌面端和移动端响应式布局。
- 私有在线预览和服务端渲染测试。

## 尚未接通

- 大模型文本和图片语义解析。
- 生产环境账号接入和跨设备画像学习。
- 网易云账号授权、歌单导入和完整曲库。
- 基于真实曲库的候选召回、可播放过滤和推荐排序调权。
- 根据播放与反馈事件自动更新长期画像。

## 架构文档

- [总体程序架构](docs/architecture/01-system-architecture.md)
- [推荐引擎设计](docs/architecture/02-recommendation-engine.md)
- [API 职责与契约](docs/architecture/03-api-contracts.md)
- [功能链路与时序](docs/architecture/04-feature-flows.md)
- [当前完成度与实施顺序](docs/architecture/05-current-progress.md)
- [情境语义模型选型与评测](docs/ai/model-selection.md)
- [网易云 Enhanced API 对接研究](docs/integrations/netease-cloud-api.md)
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
