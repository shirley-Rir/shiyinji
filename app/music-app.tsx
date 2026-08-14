"use client";

import {
  BriefcaseBusiness,
  Check,
  ChevronRight,
  Clock3,
  CloudSun,
  Compass,
  Heart,
  History,
  Home,
  ImagePlus,
  ListMusic,
  MapPin,
  Music2,
  Pause,
  Play,
  RotateCcw,
  Settings,
  Shield,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Sparkles,
  ThumbsDown,
  Trash2,
  Unplug,
  UserRound,
  Volume2,
  X,
} from "lucide-react";
import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import { adjustRecommendation, createContextRecommendation, getHistory, getProfile, recordPlayback, resolvePlayback, sendFeedback, updatePrivacy, type ApiContext, type ApiProfile, type ApiTrack } from "@/src/client/api";
import { prepareContextImage } from "@/src/client/image";

type View = "listen" | "history" | "profile" | "settings";

type Track = {
  id: string;
  provider: string;
  title: string;
  artist: string;
  duration: string;
  durationMs: number;
  source?: string;
  reason: string;
  tags: string[];
  cover: string;
};

const NAV_ITEMS: { id: View; label: string; icon: typeof Home }[] = [
  { id: "listen", label: "现在听", icon: Home },
  { id: "history", label: "拾音历史", icon: History },
  { id: "profile", label: "我的画像", icon: UserRound },
  { id: "settings", label: "设置", icon: Settings },
];

const QUICK_SCENES = [
  { label: "需要专注", icon: BriefcaseBusiness, text: "我准备开始工作，想安静专注两个小时，不要有太明显的歌词。" },
  { label: "在路上", icon: MapPin, text: "我在旅行的路上，窗外很开阔，想听一点有画面感但不过分兴奋的歌。" },
  { label: "有点低落", icon: CloudSun, text: "今天有点低落，不想被强行打气，只想有人安静陪一会儿。" },
];

const INITIAL_QUERY = "刚结束一天的工作，脑子还有点乱。想慢慢安静下来，但不要太伤感。";

function formatTime(value: number) {
  if (!Number.isFinite(value)) return "0:00";
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function contextLabels(context: ApiContext) {
  return Array.from(new Set([
    ...context.current_mood,
    ...context.target_mood,
    ...context.environment,
    context.activity,
  ].filter((value): value is string => Boolean(value)))).slice(0, 4);
}

function mapApiTracks(tracks: ApiTrack[]): Track[] {
  return tracks.map((track) => ({
    id: track.track_id,
    provider: track.provider,
    title: track.title,
    artist: track.artist,
    duration: formatTime(track.duration_ms / 1000),
    durationMs: track.duration_ms,
    reason: track.reason,
    tags: track.tags,
    cover: track.cover_variant,
  }));
}

function Cover({ variant, small = false }: { variant: string; small?: boolean }) {
  return (
    <div className={`album-cover ${variant} ${small ? "album-cover-small" : ""}`} aria-hidden="true">
      <span className="cover-sun" />
      <span className="cover-line cover-line-one" />
      <span className="cover-line cover-line-two" />
      <span className="cover-mark">拾</span>
    </div>
  );
}

export function MusicApp() {
  const [view, setView] = useState<View>("listen");
  const [query, setQuery] = useState(INITIAL_QUERY);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageName, setImageName] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [tracks, setTracks] = useState<Track[]>([]);
  const [recommendationId, setRecommendationId] = useState<string | null>(null);
  const [context, setContext] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [liked, setLiked] = useState(false);
  const [disliked, setDisliked] = useState(false);
  const [feedback, setFeedback] = useState("更安静");
  const [personalization, setPersonalization] = useState(true);
  const [hasRecommendation, setHasRecommendation] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const bootstrapped = useRef(false);
  const currentTrack = tracks[currentIndex];

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.play().catch(() => setIsPlaying(false));
    } else {
      audio.pause();
    }
  }, [isPlaying, currentIndex, currentTrack?.source]);

  useEffect(() => {
    return () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    };
  }, [imageUrl]);

  function submitContext(event: FormEvent) {
    event.preventDefault();
    if (!query.trim() && !imageFile) {
      setError("写下一点感受，或放一张此刻的照片。");
      return;
    }
    void runRecommendation(query, imageFile);
  }

  async function runRecommendation(text: string, image: File | null) {
    try {
      setError("");
      setIsLoading(true);
      setIsPlaying(false);
      const result = await createContextRecommendation(text, image);
      setTracks(mapApiTracks(result.recommendation.tracks));
      setRecommendationId(result.recommendation.recommendation_id);
      setContext(contextLabels(result.context.context));
      setCurrentIndex(0);
      setHasRecommendation(true);
      setProgress(0);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "这次推荐没有接住，请稍后重试。");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;
    void runRecommendation(INITIAL_QUERY, null);
  }, []);

  async function handleImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const prepared = await prepareContextImage(file);
      if (imageUrl) URL.revokeObjectURL(imageUrl);
      setImageUrl(URL.createObjectURL(prepared));
      setImageName(file.name);
      setImageFile(prepared);
      setError("");
    } catch {
      setError("图片处理失败，请换一张 JPEG、PNG 或 WebP 图片。");
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function removeImage() {
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    setImageUrl(null);
    setImageName("");
    setImageFile(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function selectTrack(index: number, autoPlay = true) {
    const selected = tracks[index];
    if (!selected || !recommendationId) return;
    try {
      if (currentTrack && currentTrack.id !== selected.id) {
        void recordPlayback({ recommendationId, trackId: currentTrack.id, eventType: "skipped", positionMs: Math.round(progress * 1000) });
      }
      let source = selected.source;
      if (!source) {
        const playback = await resolvePlayback(recommendationId, selected.id);
        source = playback.url;
        setTracks((current) => current.map((track, trackIndex) => trackIndex === index ? { ...track, source } : track));
      }
      setCurrentIndex(index);
      setProgress(0);
      setLiked(false);
      setDisliked(false);
      setIsPlaying(autoPlay);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "这首歌暂时无法播放");
    }
  }

  function nextTrack() {
    if (tracks.length) void selectTrack((currentIndex + 1) % tracks.length, true);
  }

  function previousTrack() {
    if (tracks.length) void selectTrack((currentIndex - 1 + tracks.length) % tracks.length, true);
  }

  function seek(value: number) {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = value;
    setProgress(value);
  }

  async function handlePreference(type: "like" | "dislike") {
    if (!recommendationId || !currentTrack) return;
    if (type === "like") {
      setLiked((value) => !value);
      setDisliked(false);
    } else {
      setDisliked((value) => !value);
      setLiked(false);
    }
    try {
      await sendFeedback({ recommendationId, trackId: currentTrack.id, type, scope: type === "like" ? "scene_profile" : "current_context" });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "反馈暂时没有保存");
    }
  }

  async function handleDirection(label: string) {
    setFeedback(label);
    if (!recommendationId || !currentTrack) return;
    const directionByLabel: Record<string, string> = { "更安静": "quieter", "更有劲": "more_energy", "更熟悉": "more_familiar", "更新鲜": "more_fresh" };
    try {
      await sendFeedback({ recommendationId, trackId: currentTrack.id, type: "direction", scope: "current_context", direction: directionByLabel[label] });
      const adjusted = await adjustRecommendation(recommendationId, directionByLabel[label]);
      setIsPlaying(false);
      setTracks(mapApiTracks(adjusted.tracks));
      setRecommendationId(adjusted.recommendation_id);
      setCurrentIndex(0);
      setProgress(0);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "方向反馈暂时没有保存");
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="主导航">
        <button className="brand-mark" onClick={() => setView("listen")} aria-label="拾音记首页">拾</button>
        <nav className="nav-list">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={`nav-button ${view === item.id ? "is-active" : ""}`}
                onClick={() => setView(item.id)}
                aria-label={item.label}
                title={item.label}
              >
                <Icon size={20} strokeWidth={1.8} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
        <button className="avatar" onClick={() => setView("profile")} aria-label="打开个人画像">LY</button>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="wordmark">
            <Music2 size={18} />
            <span>拾音记</span>
            <span className="version">DEMO V1</span>
          </div>
          <button className="provider-status" onClick={() => setView("settings")}>
            <span className="status-dot" />
            {tracks[0]?.provider === "netease" ? "网易云曲库" : "演示曲库"}
            <ChevronRight size={15} />
          </button>
        </header>

        {view === "listen" && (
          <div className="listen-view">
            <section className="context-section" aria-labelledby="context-title">
              <div className="context-heading">
                <div>
                  <p className="eyebrow">把此刻，变成一首歌</p>
                  <h1 id="context-title">你现在是什么感觉？</h1>
                </div>
                <div className="quick-scenes" aria-label="快速情境">
                  {QUICK_SCENES.map((scene) => {
                    const Icon = scene.icon;
                    return (
                      <button key={scene.label} onClick={() => setQuery(scene.text)}>
                        <Icon size={15} />
                        {scene.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <form className="context-composer" onSubmit={submitContext}>
                <textarea
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="说说此刻的心情、正在做的事，或想去往的状态..."
                  aria-label="描述此刻情境"
                  rows={3}
                />
                {imageUrl && (
                  <div className="image-preview">
                    <img src={imageUrl} alt="用户上传的情境预览" />
                    <div>
                      <strong>{imageName}</strong>
                      <span>仅用于本次情境理解</span>
                    </div>
                    <button type="button" onClick={removeImage} aria-label="移除图片"><X size={16} /></button>
                  </div>
                )}
                {error && <p className="form-error" role="alert">{error}</p>}
                <div className="composer-actions">
                  <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handleImage} hidden />
                  <button className="image-button" type="button" onClick={() => fileRef.current?.click()}>
                    <ImagePlus size={18} />
                    加一张照片
                  </button>
                  <span className="privacy-note"><Shield size={14} /> 原图不会长期保存</span>
                  <button className="listen-button" type="submit" disabled={isLoading}>
                    {isLoading ? <><span className="loading-dot" /> 正在理解</> : <><Sparkles size={18} /> 开始听</>}
                  </button>
                </div>
              </form>
            </section>

            <section className={`recommendation-section ${isLoading ? "is-loading" : ""}`} aria-live="polite">
              {isLoading ? (
                <div className="understanding-state">
                  <span className="pulse-ring"><Sparkles size={24} /></span>
                  <p>正在听懂这句话里的情绪和方向</p>
                  <div className="thinking-lines"><span /><span /><span /></div>
                </div>
              ) : hasRecommendation ? (
                <>
                  <div className="session-summary">
                    <div className="context-tags">
                      <span className="context-label"><SlidersHorizontal size={14} /> 本次理解</span>
                      {context.map((item) => <span key={item}>{item}</span>)}
                    </div>
                    <button className="rethink-button" onClick={() => document.querySelector<HTMLTextAreaElement>("textarea")?.focus()}>
                      <RotateCcw size={15} /> 换个说法
                    </button>
                  </div>

                  <div className="player-layout">
                    <article className="now-playing">
                      <div className="now-label"><span /> 此刻首选</div>
                      <div className="player-core">
                        <Cover variant={currentTrack.cover} />
                        <div className="track-copy">
                          <p className="track-kicker">为你选中</p>
                          <h2>{currentTrack.title}</h2>
                          <p className="artist">{currentTrack.artist}</p>
                          <p className="reason">{currentTrack.reason}</p>
                          <div className="track-tags">
                            {currentTrack.tags.map((tag) => <span key={tag}>{tag}</span>)}
                          </div>
                        </div>
                      </div>

                      {/* Music playback has no equivalent caption track. */}
                      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                      <audio
                        ref={audioRef}
                        src={currentTrack.source}
                        preload="metadata"
                        onTimeUpdate={(event) => setProgress(event.currentTarget.currentTime)}
                        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
                        onPlay={() => { if (recommendationId) void recordPlayback({ recommendationId, trackId: currentTrack.id, eventType: "started" }); }}
                        onPause={() => { if (recommendationId && progress > 0) void recordPlayback({ recommendationId, trackId: currentTrack.id, eventType: "paused", positionMs: Math.round(progress * 1000) }); }}
                        onEnded={() => { if (recommendationId) void recordPlayback({ recommendationId, trackId: currentTrack.id, eventType: "completed", positionMs: currentTrack.durationMs }); nextTrack(); }}
                      />
                      <div className="progress-wrap">
                        <input
                          type="range"
                          min="0"
                          max={duration || 100}
                          value={Math.min(progress, duration || 100)}
                          onChange={(event) => seek(Number(event.target.value))}
                          aria-label="播放进度"
                        />
                        <div className="time-row"><span>{formatTime(progress)}</span><span>{duration ? formatTime(duration) : currentTrack.duration}</span></div>
                      </div>
                      <div className="player-controls">
                        <button onClick={previousTrack} aria-label="上一首" title="上一首"><SkipBack size={21} fill="currentColor" /></button>
                        <button className="main-play" onClick={() => currentTrack.source ? setIsPlaying((value) => !value) : void selectTrack(currentIndex, true)} aria-label={isPlaying ? "暂停" : "播放"}>
                          {isPlaying ? <Pause size={25} fill="currentColor" /> : <Play size={25} fill="currentColor" />}
                        </button>
                        <button onClick={nextTrack} aria-label="下一首" title="下一首"><SkipForward size={21} fill="currentColor" /></button>
                        <div className="volume-control"><Volume2 size={18} /><input type="range" min="0" max="1" step="0.05" defaultValue="0.8" aria-label="音量" onChange={(event) => { if (audioRef.current) audioRef.current.volume = Number(event.target.value); }} /></div>
                      </div>
                    </article>

                    <aside className="alternatives" aria-labelledby="alternatives-title">
                      <div className="panel-title">
                        <div><p>不只一个答案</p><h3 id="alternatives-title">也可以听这些</h3></div>
                        <ListMusic size={19} />
                      </div>
                      <div className="track-list">
                        {tracks.map((track, index) => (
                          <button
                            key={track.id}
                            className={`track-row ${currentIndex === index ? "is-current" : ""}`}
                            onClick={() => selectTrack(index)}
                          >
                            <Cover variant={track.cover} small />
                            <span className="track-row-copy">
                              <strong>{track.title}</strong>
                              <span>{index === 0 ? "首选" : track.tags[0]} · {track.duration}</span>
                            </span>
                            {currentIndex === index ? <span className="equalizer"><i /><i /><i /></span> : <Play size={15} />}
                          </button>
                        ))}
                      </div>
                    </aside>
                  </div>

                  <div className="feedback-bar">
                    <div className="feedback-question">
                      <span>这一首，贴近你此刻吗？</span>
                      <button className={liked ? "selected positive" : ""} onClick={() => void handlePreference("like")}><Heart size={17} fill={liked ? "currentColor" : "none"} /> 喜欢</button>
                      <button className={disliked ? "selected negative" : ""} onClick={() => void handlePreference("dislike")}><ThumbsDown size={17} /> 不太对</button>
                    </div>
                    <div className="direction-feedback" aria-label="调整推荐方向">
                      {[
                        "更安静",
                        "更有劲",
                        "更熟悉",
                        "更新鲜",
                      ].map((item) => <button key={item} className={feedback === item ? "selected" : ""} onClick={() => void handleDirection(item)}>{feedback === item && <Check size={13} />}{item}</button>)}
                    </div>
                  </div>
                  <p className="audio-disclaimer">当前为界面与推荐闭环演示，音频来自开放示例源；网易云账号与完整曲库尚未接入。</p>
                </>
              ) : null}
            </section>
          </div>
        )}

        {view === "history" && <HistoryView onReplay={() => setView("listen")} />}
        {view === "profile" && <ProfileView />}
        {view === "settings" && (
          <SettingsView personalization={personalization} setPersonalization={setPersonalization} />
        )}
      </main>
    </div>
  );
}

function HistoryView({ onReplay }: { onReplay: () => void }) {
  const [sessions, setSessions] = useState<Awaited<ReturnType<typeof getHistory>>["sessions"]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    getHistory().then((result) => setSessions(result.sessions)).finally(() => setLoading(false));
  }, []);
  return (
    <section className="subpage">
      <div className="subpage-heading"><p className="eyebrow">拾音历史</p><h1>那些被音乐接住的时刻</h1><p>这里只保留结构化情境和反馈，上传的原始图片默认不会长期保存。</p></div>
      <div className="history-list">
        {!loading && sessions.length === 0 && <p className="empty-data">完成一次情境推荐后，这里会出现真实记录。</p>}
        {sessions.map((session, index) => {
          const firstTrack = session.recommendation?.tracks[0];
          const tone = `${session.context.current_mood[0] ?? "此刻"} → ${session.context.target_mood[0] ?? "自然过渡"}`;
          return (
          <article className="history-row" key={session.context_session_id}>
            <div className="history-index">0{index + 1}</div>
            <div className="history-time"><Clock3 size={15} />{new Date(session.created_at).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</div>
            <div className="history-copy"><strong>{session.input_text || "图片情境"}</strong><span>{tone}</span></div>
            <div className="history-song"><Music2 size={17} /><span><strong>{firstTrack?.title ?? "等待推荐"}</strong><small>{firstTrack?.artist ?? "拾音记"}</small></span></div>
            <button onClick={onReplay} aria-label="回到播放页"><Play size={16} fill="currentColor" /></button>
          </article>
        );})}
      </div>
    </section>
  );
}

function ProfileView() {
  const [profile, setProfile] = useState<ApiProfile | null>(null);
  useEffect(() => { getProfile().then((result) => setProfile(result.profile)); }, []);
  const familiarity = Math.round((profile?.explicit.familiarityBias ?? 0.5) * 100);
  const traits = profile?.long_term_traits ?? [];
  const preferenceTags = profile ? [...profile.explicit.languages, ...profile.explicit.likedGenres] : [];
  return (
    <section className="subpage">
      <div className="subpage-heading"><p className="eyebrow">账号级音乐画像</p><h1>你的声音偏好，正在变得具体</h1><p>显式选择和每一次反馈共同影响排序，你可以随时修正。</p></div>
      <div className="profile-grid">
        <section className="profile-band">
          <div className="profile-avatar">LY</div>
          <div><p>当前画像</p><h2>{traits.length ? `偏爱${traits.join("、")}的陪伴感` : "正在形成你的音乐画像"}</h2><span>画像版本 {profile?.version ?? "读取中"} · 账号级持久化</span></div>
        </section>
        <section className="preference-section">
          <div className="panel-title"><div><p>长期倾向</p><h3>熟悉与探索</h3></div><Compass size={19} /></div>
          <div className="preference-meter"><span style={{ width: `${familiarity}%` }} /></div>
          <div className="meter-label"><span>更熟悉</span><strong>{familiarity}%</strong><span>更新鲜</span></div>
          <div className="preference-tags">{preferenceTags.map((tag) => <span key={tag}>{tag}</span>)}<button>+ 修正偏好</button></div>
        </section>
        <section className="scene-learning">
          <div className="panel-title"><div><p>按场景学习</p><h3>你在不同状态下的选择</h3></div><SlidersHorizontal size={19} /></div>
          {[["focus", "工作 / 学习"], ["emotional", "情绪陪伴"], ["travel", "旅行途中"]].map(([key, label]) => {
            const scene = profile?.scene_preferences[key];
            return <div className="scene-row" key={key}><span>{label}</span><div><i style={{ width: `${scene?.targetEnergy ?? 0}%` }} /></div><strong>{scene?.preferredTags.join("、") ?? "等待数据"}</strong></div>;
          })}
        </section>
      </div>
    </section>
  );
}

function SettingsView({ personalization, setPersonalization }: { personalization: boolean; setPersonalization: (value: boolean) => void }) {
  useEffect(() => { getProfile().then((result) => setPersonalization(result.profile.personalization_enabled)); }, [setPersonalization]);
  async function togglePersonalization() {
    const next = !personalization;
    setPersonalization(next);
    try {
      const result = await updatePrivacy(next);
      setPersonalization(result.profile.personalization_enabled);
    } catch {
      setPersonalization(!next);
    }
  }
  return (
    <section className="subpage settings-page">
      <div className="subpage-heading"><p className="eyebrow">设置与隐私</p><h1>你的数据，由你决定</h1><p>画像、情境和反馈现已绑定当前账号；第三方音乐服务仍未连接。</p></div>
      <div className="settings-list">
        <div className="setting-row"><div className="setting-icon"><Sparkles size={19} /></div><div><strong>个性化学习</strong><span>用播放、跳过和反馈改进跨会话推荐</span></div><button className={`toggle ${personalization ? "is-on" : ""}`} onClick={() => void togglePersonalization()} aria-label="切换个性化学习"><span /></button></div>
        <div className="setting-row"><div className="setting-icon"><Unplug size={19} /></div><div><strong>网易云音乐</strong><span>尚未连接 · 后续仅使用扫码或会话授权</span></div><button className="text-action">准备接入 <ChevronRight size={15} /></button></div>
        <div className="setting-row"><div className="setting-icon"><Shield size={19} /></div><div><strong>图片处理</strong><span>原图只用于本次理解，默认不长期保留</span></div><span className="setting-state"><Check size={15} /> 已开启</span></div>
        <div className="setting-row danger-row"><div className="setting-icon"><Trash2 size={19} /></div><div><strong>清除演示数据</strong><span>删除当前浏览器中的历史、反馈和画像</span></div><button className="text-action danger">清除数据</button></div>
      </div>
    </section>
  );
}
