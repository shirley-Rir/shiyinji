# 拾音记：Web MVP 技术选型与资源问题

## 1. 选型原则

Web MVP 的技术目标不是一次性搭出最终商业架构，而是在 4 到 6 周内验证“情境音乐推荐 + 完整播放”是否成立。选型遵循以下原则：

- **先闭环，再扩展**：账号、情境解析、推荐、播放、反馈必须先连通。
- **全链路可替换**：音乐服务、AI 模型和部署平台都通过适配层隔离。
- **服务端掌控敏感逻辑**：音乐凭据、AI Key、授权校验和推荐排序不暴露在浏览器。
- **少造基础设施**：首版优先用成熟托管服务或简单自部署，避免过早拆微服务。
- **数据先可观测**：推荐是否有效必须靠事件数据验证，而不是只靠主观体验。

## 2. 推荐技术栈

### 2.1 总体方案

建议采用单仓全栈 TypeScript：

| 层级 | 推荐选型 | 选择理由 |
| --- | --- | --- |
| 前端与服务端框架 | Next.js + React + TypeScript | 一套工程同时支持页面、服务端 API、鉴权和部署，适合快速 MVP |
| UI | Tailwind CSS + shadcn/ui + lucide-react | 快速搭建稳定控件，便于后续形成设计系统 |
| 表单与校验 | React Hook Form + Zod | 冷启动偏好、设置、接口入参都可复用 schema |
| 数据库 | PostgreSQL | 账号、画像、事件、推荐记录都适合关系型建模 |
| ORM | Prisma | TypeScript 生态成熟，迁移和类型生成清晰 |
| 向量检索 | pgvector 或后置到第二阶段 | 小样本可先用关系查询和规则召回，曲库扩大后再启用 |
| 对象存储 | 本地临时存储，后续 S3 兼容存储 | 图片默认短暂处理，不应首版复杂化 |
| 音源适配 | 独立 `MusicProvider` 接口 + 网易云第三方 API 实现 | 保持后续替换正式授权音乐服务的可能 |
| AI 能力 | 独立 `AIProvider` 接口 + 多模态模型 | 文本和图片输出同一种结构化情境 |
| 事件分析 | 先入库，后续接 PostHog 或自建看板 | 首版必须记录数据，但不必一开始接复杂分析平台 |
| 本地环境 | Docker Compose | 统一启动 PostgreSQL、网易云 API 和 Web 服务 |

### 2.2 为什么首版不建议拆成多后端

Node/TypeScript 能同时覆盖 Web、API 编排、网易云第三方 API 对接和数据层。Python 在推荐实验上有优势，但首版推荐并不训练模型，主要是模型解析、规则过滤、元数据检索和重排。因此第一版用 TypeScript 全栈更省沟通和集成成本。

当进入更复杂的音频特征分析、离线训练或批量标注后，再增加 Python worker 或独立推荐服务。

## 3. 系统模块

### 3.1 前端模块

- 登录与注册。
- 冷启动偏好。
- 网易云连接。
- 情境输入：文本、图片、图文组合。
- 播放器：播放控制、队列、备选切换、状态展示。
- 反馈控件：喜欢、不喜欢、换一首、方向调整。
- 历史与画像管理。
- 设置与隐私。

### 3.2 服务端模块

- `AuthService`：拾音记账号、会话、权限。
- `MusicConnectionService`：网易云会话保存、刷新、解绑。
- `ContextService`：文本和图片解析为统一情境对象。
- `RecommendationService`：候选召回、过滤、排序、备选生成。
- `PlaybackService`：播放地址或凭证获取、可播放状态校验。
- `ProfileService`：显式偏好、隐式反馈、场景偏好更新。
- `EventService`：曝光、播放、跳过、反馈和错误记录。

### 3.3 适配层

`MusicProvider` 需要最早定义，避免把推荐逻辑绑定到网易云第三方 API 返回结构。

建议接口：

```ts
interface MusicProvider {
  getLoginStatus(connectionId: string): Promise<LoginStatus>;
  createLoginSession(): Promise<LoginSession>;
  importUserLibrary(connectionId: string): Promise<UserLibrarySnapshot>;
  searchTracks(query: TrackSearchQuery): Promise<TrackCandidate[]>;
  getPlayableTracks(trackIds: string[], connectionId: string): Promise<PlayableTrack[]>;
  getPlaybackUrl(trackId: string, connectionId: string): Promise<PlaybackHandle>;
}
```

`AIProvider` 同样需要独立：

```ts
interface AIProvider {
  parseTextContext(input: TextContextInput): Promise<StructuredContext>;
  parseImageContext(input: ImageContextInput): Promise<StructuredContext>;
  mergeContext(input: MergeContextInput): Promise<StructuredContext>;
  explainRecommendation(input: RecommendationExplainInput): Promise<string>;
}
```

## 4. 数据库建议

首版建议保留以下核心表：

| 表 | 作用 |
| --- | --- |
| `users` | 拾音记账号 |
| `user_profiles` | 显式偏好、探索倾向、个性化开关 |
| `music_connections` | 第三方音乐账号连接和加密会话元数据 |
| `context_sessions` | 每次情境输入和结构化解析结果 |
| `tracks` | 曲库 ID、歌名、歌手、封面、时长、元数据 |
| `track_features` | 风格、语种、能量、BPM、情绪标签等可扩展特征 |
| `recommendations` | 一次推荐请求的候选、排序分、位置和理由 |
| `playback_events` | 播放、暂停、跳过、播完、失败 |
| `feedback_events` | 喜欢、不喜欢、方向调整、撤销 |
| `profile_updates` | 画像变化日志，便于排查推荐为什么变了 |

图片默认不长期保存原图。若需要调试，可只保存临时文件路径、图片哈希和结构化标签；保存原图必须有单独用户同意。

## 5. 推荐实现路径

### 5.1 第一版排序公式

首版可以先使用可解释的加权排序：

```text
score =
  playable_gate
  * (
      context_match * 0.40
    + explicit_preference * 0.20
    + scene_history * 0.15
    + familiarity_fit * 0.10
    + diversity_bonus * 0.10
    + freshness_bonus * 0.05
  )
  - hard_penalties
```

权重不需要一次定死，应通过测试数据调整。明确约束和可播放性是硬门槛，不应只作为扣分项。

### 5.2 候选召回

第一版候选来源：

- 用户导入歌单中的歌曲。
- 用户喜欢歌手或相似歌手的歌曲。
- 根据情境标签搜索得到的歌曲。
- 系统内少量人工维护的场景种子歌单。

首版不要依赖大模型直接生成歌名。模型可以生成查询意图和标签，但最终必须回到真实曲库 ID。

### 5.3 元数据补齐

网易云接口未必提供足够的 BPM、能量、歌词密度、场景标签。首版可以混合使用：

- 平台已有元数据。
- 歌名、歌手、专辑、歌词摘要的模型标注。
- 少量人工标注的场景种子。
- 用户反馈反向修正标签。

## 6. 音源方案

### 6.1 MVP 原型方案

当前建议：

- 本地或封闭环境部署 `NeteaseCloudMusicApiEnhanced/api-enhanced`。
- 仅作为 `MusicProvider` 的第一种实现。
- 关闭解灰、代理、音源替换、随机 IP 和绕过限制。
- 只播放当前用户本人有权播放的歌曲。
- 不缓存、下载、转存完整音频。

### 6.2 降级方案

若第三方网易云 API 不稳定或不可用：

- 使用少量自有、采购或明确开放授权的音频文件验证播放器。
- 推荐模块继续返回同一 `Track` 结构。
- 音源不可用原因必须记录，便于评估是否继续投入。

### 6.3 长期正式方案

公开测试和商业化前必须重新选择正式授权音乐服务。届时重点评估：

- 是否允许网页内完整播放。
- 是否提供稳定曲库 ID、可播放状态、封面、歌手、时长。
- 是否支持用户账号授权和会员状态识别。
- 是否允许个性化推荐场景下调用。
- 授权地区、会员限制、分成或费用结构。

## 7. 部署环境

### 7.1 开发环境

建议用 Docker Compose 启动：

- Web 应用。
- PostgreSQL。
- 第三方网易云 API 服务。
- 可选 Redis，用于短期任务状态或登录二维码状态。

开发阶段使用 `.env.local` 管理密钥，不提交到仓库。

### 7.2 测试环境

如果音源仍依赖第三方网易云 API，测试环境建议保持非公开：

- 开发者本机。
- 局域网。
- VPN/Tailscale 私有网络。
- 明确知情的受邀用户访问。

不建议在该阶段直接发布开放互联网 Demo。

### 7.3 未来部署

当接入正式授权音乐能力后，可考虑：

- Vercel 部署 Web。
- Neon、Supabase 或自管 PostgreSQL。
- S3 兼容对象存储。
- PostHog 或自建分析看板。
- Sentry 做前后端错误监控。

## 8. 安全与隐私

必须做到：

- 不保存网易云明文密码。
- 第三方会话凭据服务端加密保存。
- 凭据设置有效期和解绑删除。
- AI Key、音乐凭据和数据库连接串只在服务端使用。
- 图片默认短暂处理，不长期保存原图。
- 用户可删除历史和关闭个性化。
- 高风险心理表达要进入安全处理分支。

建议后端对所有关键事件写审计日志：登录、绑定音乐账号、解绑、删除历史、播放授权失败、图片处理失败。

## 9. 资源问题

### 9.1 人力资源

最低可推进配置：

| 角色 | 投入 |
| --- | --- |
| 产品/项目负责人 | 1 人，负责需求、测试脚本、复盘 |
| 全栈工程师 | 1 人，负责 Web、后端、数据库、播放器 |
| AI/推荐工程支持 | 可由全栈兼任，复杂阶段再拆分 |
| UI/交互设计 | 可兼职，但主播放页需要认真打磨 |
| 测试用户 | 20 人左右，覆盖三类场景 |

如果只有 1 名开发者，建议先保证“文本/图片输入 -> 推荐 -> 播放 -> 反馈 -> 数据记录”闭环，画像管理页面可以做得朴素一些。

### 9.2 数据资源

首轮至少需要：

- 20 名测试用户的网易云歌单或手动偏好。
- 每人 5 次以上情境会话。
- 三类场景各不少于 30 次有效会话。
- 100 到 300 首可稳定播放的核心曲库样本，用于排查推荐逻辑。
- 少量人工标注的种子歌曲，覆盖安静、振作、专注、旅行、睡前等方向。

### 9.3 成本资源

主要成本来自：

- AI 文本和图片解析调用。
- 服务器与数据库。
- 音乐授权或未来正式音乐服务。
- 测试用户招募与访谈。
- 可能的设计和前端动效打磨。

首版不建议先购买复杂云资源。先用本地 Docker 和低成本数据库完成可行性验证，再根据测试规模升级。

### 9.4 最大资源风险

| 风险 | 影响 | 应对 |
| --- | --- | --- |
| 完整播放授权不确定 | 可能决定产品能否公开 | 原型和正式方案分离，保留 `MusicProvider` 替换能力 |
| 网易云第三方 API 不稳定 | 登录、歌单、播放可能中断 | 阶段 0 先验证，不让推荐模块强依赖 |
| 曲库标签不足 | 推荐看似聪明但歌曲不准 | 种子标注 + 反馈学习 + 小范围人工复盘 |
| 图片理解误判 | 图像输入体验不稳定 | 允许图文补充，低置信度消歧 |
| 用户隐私顾虑 | 影响测试参与和真实反馈 | 默认最小化存储，可查看、可删除、可关闭 |
| 只做出播放器，没有验证价值 | MVP 变成普通音乐页 | 必须记录 Top 1 接受率、场景匹配和复用率 |

## 10. 开发里程碑

### M0：工程与音源可行性，1 周

- 建立 Next.js、PostgreSQL、Prisma、Docker Compose。
- 部署第三方网易云 API。
- 定义 `MusicProvider`。
- 验证登录、歌单导入、搜索、可播放校验和播放 URL。
- 完成播放器最小 Demo。

### M1：推荐闭环，2 周

- 完成账号和冷启动偏好。
- 完成文本、图片、图文情境解析。
- 完成候选召回、规则排序、Top 1 + 4 备选。
- 完成播放、切歌、反馈和事件记录。

### M2：画像与管理，1 周

- 完成画像更新逻辑。
- 完成历史、偏好、设置与删除入口。
- 完成基本异常状态。
- 建立测试数据导出或看板。

### M3：封闭测试与迭代，2 周

- 招募受邀用户。
- 按情绪陪伴、学习/工作、旅游分场景测试。
- 每周复盘失败样本。
- 调整标签、权重、消歧策略和页面交互。

## 11. 当前建议结论

首版建议采用：

```text
Next.js + React + TypeScript
PostgreSQL + Prisma
Tailwind CSS + shadcn/ui + lucide-react
Docker Compose
MusicProvider + NeteaseCloudMusicApiEnhanced/api-enhanced
AIProvider + 多模态模型
事件入库 + 后续分析看板
```

这个方案的优势是开发速度快、工程心智统一、替换边界清晰。它的主要短板是推荐算法不会一开始很高级，但这正适合 MVP：先用可解释规则和真实反馈找到产品是否成立，再决定是否投入更复杂的推荐系统。



