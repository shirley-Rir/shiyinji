# 功能链路与时序

## 1. 首次使用

```mermaid
sequenceDiagram
    actor U as 用户
    participant WEB as Web 客户端
    participant AUTH as AuthService
    participant PROF as ProfileService
    participant MUSIC as MusicConnectionService
    participant DB as 数据库

    U->>WEB: 首次进入
    WEB->>AUTH: 获取当前身份
    AUTH-->>WEB: 账号或登录要求
    U->>WEB: 选择冷启动偏好
    WEB->>PROF: 保存显式偏好
    PROF->>DB: 创建画像版本 1
    U->>WEB: 可选连接网易云
    WEB->>MUSIC: 创建扫码会话
    MUSIC-->>WEB: 二维码
    MUSIC->>MUSIC: 轮询授权状态
    MUSIC->>DB: 加密保存会话凭据
    MUSIC->>DB: 导入歌单和收藏
    WEB-->>U: 进入情境播放页
```

冷启动和音乐账号连接都允许跳过，不能阻塞用户体验情境推荐。未连接音乐账号时使用手动偏好和演示授权曲库。

## 2. 文本与图片推荐

```mermaid
sequenceDiagram
    actor U as 用户
    participant WEB as Web 客户端
    participant CTX as Context API
    participant AI as AIProvider
    participant REC as Recommendation API
    participant PROF as ProfileService
    participant MUSIC as MusicProvider
    participant DB as 数据库

    U->>WEB: 输入文字并可选上传图片
    WEB->>CTX: 创建情境会话
    CTX->>AI: 文本和临时图片
    AI-->>CTX: 结构化情境与置信度
    CTX->>DB: 保存结构化结果
    CTX-->>WEB: 情境标签或一个追问
    WEB->>REC: 请求推荐
    REC->>PROF: 读取画像快照
    REC->>MUSIC: 召回真实候选
    REC->>MUSIC: 校验可播放状态
    REC->>DB: 读取歌曲特征
    REC->>REC: 过滤、打分、多样化
    REC->>DB: 保存推荐快照
    REC-->>WEB: Top 1 与四首备选
    WEB->>MUSIC: 解析 Top 1 播放句柄
    MUSIC-->>WEB: 临时播放地址
    WEB-->>U: 开始播放
```

### 页面等待策略

- 情境解析目标 P75 小于 2 秒。
- 推荐和可播放过滤目标 P75 小于 3 秒。
- 播放解析目标 P75 小于 2 秒。
- 总体提交到出声目标 P75 小于 8 秒。
- 超时 5 秒先展示理解结果；播放失败自动尝试下一首。

## 3. 方向调整

用户点击“更安静”“更有劲”“更熟悉”或“更新鲜”时，不重新调用大模型理解整段输入，而是修改当前 `StructuredContext` 的明确维度并重排剩余候选。

```mermaid
flowchart LR
    CLICK[用户选择更安静] --> PATCH[targetEnergy 下调 20]
    PATCH --> SAVE[保存方向反馈]
    SAVE --> RERANK[重排当前候选]
    RERANK --> FILTER[去掉已播和已跳过]
    FILTER --> QUEUE[返回新首选与队列]
```

只有候选不足时才重新召回，减少延迟和模型成本。

## 4. 播放与反馈

```mermaid
sequenceDiagram
    actor U as 用户
    participant PLAYER as 播放器
    participant EVENT as EventService
    participant PROF as ProfileService
    participant REC as RecommendationService

    PLAYER->>EVENT: started
    U->>PLAYER: 跳过或喜欢
    PLAYER->>EVENT: skipped 或 feedback
    EVENT-->>PLAYER: 接收确认
    EVENT->>PROF: 异步画像更新
    PROF->>PROF: 判断当前、场景或长期范围
    PROF-->>REC: 新画像版本供下次请求使用
    PLAYER->>REC: 当前队列重排
    REC-->>PLAYER: 下一首
```

前端不能以按钮点击直接修改画像。所有画像变化都来自服务端事件处理，并保留可撤销记录。

## 5. 图片隐私链路

```mermaid
flowchart LR
    UPLOAD[浏览器上传] --> VALIDATE[类型与大小校验]
    VALIDATE --> TEMP[临时对象存储]
    TEMP --> AI[多模态理解]
    AI --> TAGS[保存结构化标签]
    TAGS --> PURGE[删除原图]
    TEMP -. 超时任务 .-> PURGE
```

- 默认不把图片写入用户历史。
- 调试环境保存原图必须单独征得同意，并设置到期时间。
- 图片哈希只用于去重和审计，不能被用作跨产品追踪标识。

## 6. 音乐账号连接

```mermaid
stateDiagram-v2
    [*] --> disconnected
    disconnected --> waiting_scan: 创建二维码
    waiting_scan --> authorized: 用户扫码成功
    waiting_scan --> expired: 二维码过期
    expired --> waiting_scan: 重新创建
    authorized --> importing: 导入歌单
    importing --> connected: 导入完成
    importing --> connected_partial: 部分失败
    connected --> expired_auth: 平台会话失效
    connected_partial --> importing: 重试
    expired_auth --> waiting_scan: 重新授权
    connected --> disconnected: 用户解绑
```

凭据只在服务端加密存储。解绑后立即删除凭据，已导入的画像数据是否保留应由用户选择。

## 7. 降级策略

| 异常 | 用户体验 | 系统动作 |
| --- | --- | --- |
| 大模型超时 | 使用最近一次同类场景或规则解析，并明确提示 | 记录模型错误，不伪造高置信度 |
| 图片无法理解 | 保留文字输入并询问一个问题 | 删除临时图片 |
| 音乐平台不可用 | 展示稍后重试或切换演示授权曲库 | 不绕过平台限制 |
| Top 1 不可播放 | 自动尝试下一首并记录失败 | 刷新可播放缓存 |
| 候选不足 | 放宽软偏好，不放宽硬约束 | 记录召回缺口 |
| 画像不可用 | 使用本次情境和冷启动偏好 | 不阻塞推荐 |
| 事件上报失败 | 本地短暂排队后重试 | 使用事件 ID 去重 |
