# 拾音记 Demo V1

拾音记是一款基于用户当下情境和账号级音乐画像进行歌曲推荐的音乐产品。用户可以输入一句话、上传一张图片，或同时提供图文；系统理解情绪、活动、环境和期望状态后，给出一首默认播放歌曲和四首备选。

当前仓库是 Web MVP 的产品雏形。界面和播放交互已可运行，推荐、画像、历史和音乐平台连接仍处于模拟或接口设计阶段。

## 当前能力

- 文本、图片和图文组合的情境输入界面。
- Top 1 推荐、四首备选和队列切换。
- 示例音频播放、暂停、切歌、进度和音量控制。
- 喜欢、不喜欢以及推荐方向反馈。
- 历史、画像、设置与隐私视图。
- 桌面端和移动端响应式布局。
- 私有在线预览和服务端渲染测试。

## 尚未接通

- 大模型文本和图片语义解析。
- 真实账号、数据库和跨设备画像。
- 网易云账号授权、歌单导入和完整曲库。
- 真实候选召回、可播放过滤和推荐排序。
- 播放事件、反馈事件及画像学习。

## 架构文档

- [总体程序架构](docs/architecture/01-system-architecture.md)
- [推荐引擎设计](docs/architecture/02-recommendation-engine.md)
- [API 职责与契约](docs/architecture/03-api-contracts.md)
- [功能链路与时序](docs/architecture/04-feature-flows.md)
- [当前完成度与实施顺序](docs/architecture/05-current-progress.md)
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

## 技术形态

当前使用 React、TypeScript、vinext、Tailwind CSS 和 lucide-react，并保留 Cloudflare Worker 兼容输出。后续业务层按 `AIProvider`、`MusicProvider`、`RecommendationService` 和 `ProfileService` 拆分，避免页面直接依赖某一家模型或音乐平台。
