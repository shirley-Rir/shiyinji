# API 职责与契约

## 1. 设计规则

- 对外接口统一使用 `/api/v1` 前缀。
- 浏览器只调用拾音记 API，不直接调用大模型或音乐平台。
- 用户身份由服务端会话确定，不接受客户端传入 `user_id`。
- 写接口支持 `Idempotency-Key`，避免重复反馈和事件。
- 所有时间使用 ISO 8601 UTC，所有资源 ID 使用不透明字符串。
- API 返回领域模型，不透传网易云或某个模型厂商的原始结构。

统一错误结构：

```json
{
  "error": {
    "code": "NO_PLAYABLE_TRACK",
    "message": "当前没有可播放候选",
    "request_id": "req_xxx",
    "retryable": true
  }
}
```

## 2. API 总览

| 方法与路径 | 用途 | 主要输入 | 主要输出 | 副作用 | 阶段 |
| --- | --- | --- | --- | --- | --- |
| `GET /api/v1/me` | 获取当前账号和连接状态 | 当前会话 | 用户摘要、画像状态、音乐连接状态 | 无 | P0 |
| `GET /api/v1/profile` | 获取账号级音乐画像 | 当前会话 | 显式、长期、场景和负偏好 | 无 | P0 |
| `PATCH /api/v1/profile` | 修正显式偏好 | 偏好差量 | 新画像版本 | 写画像更新日志 | P0 |
| `PATCH /api/v1/settings/privacy` | 修改个性化和图片策略 | 开关差量 | 最新设置 | 影响后续数据写入 | P0 |
| `POST /api/v1/music-connections/netease/login-sessions` | 创建网易云扫码授权会话 | 无 | 二维码、会话 ID、过期时间 | 创建短期授权状态 | P0 |
| `GET /api/v1/music-connections/netease/login-sessions/:id` | 轮询扫码结果 | 登录会话 ID | 等待、成功、过期 | 成功时加密保存凭据 | P0 |
| `POST /api/v1/music-connections/netease/import` | 导入用户歌单和收藏 | 导入范围 | 任务状态、数量摘要 | 更新曲库来源和画像种子 | P0 |
| `DELETE /api/v1/music-connections/netease` | 解绑音乐账号 | 当前会话 | 删除结果 | 删除本地第三方凭据 | P0 |
| `POST /api/v1/context-sessions` | 区分点歌/推荐意图并解析文本、图片或图文情境 | `multipart/form-data` | `StructuredContext`、意图、置信度、会话 ID | 保存结构化情境，原图短暂处理 | P0 |
| `POST /api/v1/recommendations` | 点歌时精准返回一首；推荐时生成 Top 1 与四首备选 | 情境会话 ID、模式 | 歌曲列表、理由、推荐 ID | 保存候选、分数和画像版本 | P0 |
| `POST /api/v1/recommendations/:id/adjust` | 按方向重新排序 | 更安静、更有劲等 | 更新后的推荐列表 | 保存方向反馈 | P0 |
| `POST /api/v1/playback/resolve` | 获取当前用户的播放句柄 | Track ID、推荐 ID | 临时播放地址或播放凭证 | 记录解析结果，不缓存音频 | P0 |
| `GET /api/v1/tracks/:trackId/lyrics` | 获取歌曲歌词时间轴 | Track ID | 同步状态、原文与翻译行 | 不持久化歌词正文 | P0 |
| `POST /api/v1/events/playback` | 记录播放事件 | 播放、暂停、跳过、播完、失败 | 接收确认 | 写事件表，触发画像任务 | P0 |
| `POST /api/v1/feedback` | 记录喜欢或不喜欢 | 推荐位置、歌曲、作用范围 | 反馈 ID、影响说明 | 写反馈并触发画像任务 | P0 |
| `POST /api/v1/feedback/:id/undo` | 撤销最近反馈 | 反馈 ID | 撤销结果、画像版本 | 写补偿事件 | P0 |
| `GET /api/v1/history` | 获取最近情境会话 | 分页游标 | 会话和播放摘要 | 无 | P0 |
| `DELETE /api/v1/history/:sessionId` | 删除一条会话 | 会话 ID | 删除结果 | 删除或匿名化相关数据 | P0 |

## 3. 核心接口

### 3.1 创建情境会话

`POST /api/v1/context-sessions`

请求使用 `multipart/form-data`：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `text` | string | 条件必填 | 和图片至少提供一个 |
| `image` | file | 条件必填 | JPEG、PNG 或 WebP，限制大小 |
| `timezone` | string | 否 | 用于理解时间场景，不作为定位 |
| `client_context` | JSON string | 否 | 用户主动授权的时间、天气等环境信息 |

响应：

```json
{
  "context_session_id": "ctx_01",
  "context": {
    "source": "text_image",
    "request_intent": "recommendation",
    "direct_play": null,
    "current_mood": ["疲惫", "混乱"],
    "target_mood": ["平静"],
    "activity": "下班后休息",
    "environment": ["室内", "夜晚"],
    "valence": -0.3,
    "arousal": 0.45,
    "target_energy": 28,
    "lyric_tolerance": "medium",
    "familiarity_bias": 0.7,
    "hard_constraints": ["不要太伤感"],
    "safety_risk": "none",
    "confidence": 0.84
  },
  "clarification": null
}
```

如果置信度不足，仍返回会话 ID，同时返回一个 `clarification`，前端只展示一个追问。

明确点歌会在调用大模型前被识别为 `direct_play`，并保存 `{ title, artist, version_hint }`。后续只进行歌曲搜索与可播放校验，不进入画像推荐；未指定歌手时接受任意歌手的标题匹配版本，指定歌手后执行严格歌手实体校验。

### 3.2 创建推荐

`POST /api/v1/recommendations`

请求：

```json
{
  "context_session_id": "ctx_01",
  "mode": "autoplay",
  "count": 5
}
```

响应：

```json
{
  "recommendation_id": "rec_01",
  "profile_version": 12,
  "generated_at": "2026-08-14T01:00:00Z",
  "tracks": [
    {
      "track_id": "netease:123456",
      "position": 1,
      "role": "top_pick",
      "title": "歌曲名",
      "artist": "歌手名",
      "cover_url": "https://...",
      "duration_ms": 240000,
      "reason": "节奏稳定，接住疲惫但不会继续下沉",
      "tags": ["平静", "中低能量"],
      "playable": true
    }
  ]
}
```

内部响应还要保存完整分数和过滤原因，但浏览器只需要简短解释。

### 3.3 解析播放

`POST /api/v1/playback/resolve`

请求：

```json
{
  "track_id": "netease:123456",
  "recommendation_id": "rec_01"
}
```

响应：

```json
{
  "playback_handle": "ph_01",
  "url": "https://temporary-audio-url.example/...",
  "expires_at": "2026-08-14T01:10:00Z",
  "mime_type": "audio/mpeg"
}
```

服务端必须再次校验当前用户权限。不可播放返回 `TRACK_NOT_PLAYABLE`，前端自动尝试下一首，不能调用解灰或替换音源。

### 3.4 播放事件

`POST /api/v1/events/playback`

```json
{
  "event_id": "evt_client_uuid",
  "playback_handle": "ph_01",
  "recommendation_id": "rec_01",
  "track_id": "netease:123456",
  "event_type": "skipped",
  "position_ms": 18200,
  "occurred_at": "2026-08-14T01:02:20Z"
}
```

`event_type` 支持 `started`、`paused`、`resumed`、`seeked`、`skipped`、`completed` 和 `failed`。客户端生成唯一 `event_id`，服务端据此去重。

### 3.5 反馈

`POST /api/v1/feedback`

```json
{
  "recommendation_id": "rec_01",
  "track_id": "netease:123456",
  "type": "dislike",
  "scope": "current_context",
  "reason": "too_sad"
}
```

`scope` 必须明确：

- `current_context`：只影响当前会话。
- `scene_profile`：影响相似场景。
- `long_term`：进入账号长期偏好。

服务端响应需要告诉前端该反馈影响了什么，方便用户撤销。

## 4. Provider 接口

Provider 是应用内部 TypeScript 接口，不通过公网 HTTP 暴露。

```ts
interface AIProvider {
  interpretContext(input: ContextInput): Promise<StructuredContext>;
  labelTrack(input: TrackLabelInput): Promise<TrackFeatureDraft>;
  explainRecommendation(input: ExplanationInput): Promise<string>;
}

interface MusicProvider {
  createLoginSession(): Promise<MusicLoginSession>;
  getLoginStatus(sessionId: string): Promise<MusicLoginStatus>;
  importUserLibrary(connectionId: string): Promise<UserLibrarySnapshot>;
  searchTracks(query: TrackSearchQuery): Promise<TrackCandidate[]>;
  getPlayableTracks(trackIds: string[], connectionId: string): Promise<PlayableTrack[]>;
  resolvePlayback(trackId: string, connectionId: string): Promise<PlaybackHandle>;
}
```

`AIProvider` 不能直接写画像；`MusicProvider` 不能决定推荐分数。这两个约束可避免外部服务反向侵入业务逻辑。

## 5. 内部异步任务

| 任务 | 触发条件 | 用途 |
| --- | --- | --- |
| `profile.update` | 喜欢、不喜欢、有效播放或跳过 | 更新场景画像和长期画像 |
| `library.import` | 音乐账号连接或手动刷新 | 拉取歌单、收藏和曲目元数据 |
| `track.enrich` | 新曲目缺少特征 | 离线补充标签、能量和歌词密度 |
| `image.purge` | 图片处理完成或到期 | 删除原始上传图片 |
| `analytics.rollup` | 定时任务 | 聚合 Top 1 接受率等验证指标 |

首版可以用数据库任务表实现，不需要立即引入独立消息队列。
