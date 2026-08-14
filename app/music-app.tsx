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
import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";

type View = "listen" | "history" | "profile" | "settings";

type Track = {
  id: string;
  title: string;
  artist: string;
  duration: string;
  source: string;
  reason: string;
  tags: string[];
  cover: string;
};

const TRACKS: Track[] = [
  {
    id: "dawn-window",
    title: "窗边的慢速清晨",
    artist: "拾音记演示曲库",
    duration: "6:13",
    source: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
    reason: "留一点呼吸感，把疲惫慢慢放下",
    tags: ["平静", "熟悉感", "低能量"],
    cover: "cover-coral",
  },
  {
    id: "soft-current",
    title: "柔软的水流",
    artist: "拾音记演示曲库",
    duration: "5:34",
    source: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3",
    reason: "节奏稳定，适合把注意力收回来",
    tags: ["专注", "无歌词", "中低能量"],
    cover: "cover-cyan",
  },
  {
    id: "after-rain",
    title: "雨停之后",
    artist: "拾音记演示曲库",
    duration: "5:02",
    source: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3",
    reason: "不急着振作，只给情绪一点亮处",
    tags: ["舒展", "轻盈", "情绪陪伴"],
    cover: "cover-yellow",
  },
  {
    id: "road-north",
    title: "向北的公路",
    artist: "拾音记演示曲库",
    duration: "5:27",
    source: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3",
    reason: "画面感更开阔，适合路上的远景",
    tags: ["旅行", "开阔", "中能量"],
    cover: "cover-blue",
  },
  {
    id: "paper-light",
    title: "纸页间的光",
    artist: "拾音记演示曲库",
    duration: "6:01",
    source: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3",
    reason: "保留轻微律动，不抢走正在做的事",
    tags: ["工作", "稳定", "少干扰"],
    cover: "cover-green",
  },
];

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

function formatTime(value: number) {
  if (!Number.isFinite(value)) return "0:00";
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
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
  const [query, setQuery] = useState("刚结束一天的工作，脑子还有点乱。想慢慢安静下来，但不要太伤感。");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageName, setImageName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [tracks, setTracks] = useState(TRACKS);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [liked, setLiked] = useState(false);
  const [disliked, setDisliked] = useState(false);
  const [feedback, setFeedback] = useState("更安静");
  const [personalization, setPersonalization] = useState(true);
  const [hasRecommendation, setHasRecommendation] = useState(true);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const currentTrack = tracks[currentIndex];

  const context = useMemo(() => {
    const text = query.toLowerCase();
    if (/工作|学习|专注|阅读/.test(text)) return ["专注", "低干扰", "稳定节奏"];
    if (/旅行|路上|窗外|风景/.test(text)) return ["在路上", "开阔", "轻微律动"];
    if (/低落|难过|疲惫|乱/.test(text)) return ["疲惫", "平静", "不要太伤感"];
    return ["此刻", "自然过渡", "熟悉感"];
  }, [query, hasRecommendation]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.play().catch(() => setIsPlaying(false));
    } else {
      audio.pause();
    }
  }, [isPlaying, currentIndex]);

  useEffect(() => {
    return () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    };
  }, [imageUrl]);

  function orderTracks(text: string) {
    if (/工作|学习|专注|阅读/.test(text)) return [TRACKS[1], TRACKS[4], TRACKS[0], TRACKS[2], TRACKS[3]];
    if (/旅行|路上|窗外|风景/.test(text)) return [TRACKS[3], TRACKS[2], TRACKS[1], TRACKS[0], TRACKS[4]];
    if (/低落|难过|疲惫|乱/.test(text)) return [TRACKS[0], TRACKS[2], TRACKS[1], TRACKS[4], TRACKS[3]];
    return TRACKS;
  }

  function submitContext(event: FormEvent) {
    event.preventDefault();
    if (!query.trim() && !imageUrl) {
      setError("写下一点感受，或放一张此刻的照片。");
      return;
    }
    setError("");
    setIsLoading(true);
    setIsPlaying(false);
    window.setTimeout(() => {
      setTracks(orderTracks(query));
      setCurrentIndex(0);
      setHasRecommendation(true);
      setIsLoading(false);
      setProgress(0);
    }, 1100);
  }

  function handleImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    setImageUrl(URL.createObjectURL(file));
    setImageName(file.name);
    setError("");
  }

  function removeImage() {
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    setImageUrl(null);
    setImageName("");
    if (fileRef.current) fileRef.current.value = "";
  }

  function selectTrack(index: number, autoPlay = true) {
    setCurrentIndex(index);
    setProgress(0);
    setLiked(false);
    setDisliked(false);
    setIsPlaying(autoPlay);
  }

  function nextTrack() {
    selectTrack((currentIndex + 1) % tracks.length, true);
  }

  function previousTrack() {
    selectTrack((currentIndex - 1 + tracks.length) % tracks.length, true);
  }

  function seek(value: number) {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = value;
    setProgress(value);
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
            演示曲库
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
                  <input ref={fileRef} type="file" accept="image/*" onChange={handleImage} hidden />
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

                      <audio
                        ref={audioRef}
                        src={currentTrack.source}
                        preload="metadata"
                        onTimeUpdate={(event) => setProgress(event.currentTarget.currentTime)}
                        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
                        onEnded={nextTrack}
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
                        <button className="main-play" onClick={() => setIsPlaying((value) => !value)} aria-label={isPlaying ? "暂停" : "播放"}>
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
                      <button className={liked ? "selected positive" : ""} onClick={() => { setLiked(!liked); setDisliked(false); }}><Heart size={17} fill={liked ? "currentColor" : "none"} /> 喜欢</button>
                      <button className={disliked ? "selected negative" : ""} onClick={() => { setDisliked(!disliked); setLiked(false); }}><ThumbsDown size={17} /> 不太对</button>
                    </div>
                    <div className="direction-feedback" aria-label="调整推荐方向">
                      {[
                        "更安静",
                        "更有劲",
                        "更熟悉",
                        "更新鲜",
                      ].map((item) => <button key={item} className={feedback === item ? "selected" : ""} onClick={() => setFeedback(item)}>{feedback === item && <Check size={13} />}{item}</button>)}
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
  const sessions = [
    { time: "今天 22:14", text: "刚结束一天工作，想慢慢安静下来", song: "窗边的慢速清晨", tone: "疲惫 → 平静" },
    { time: "昨天 09:36", text: "整理一份很长的材料，需要持续专注", song: "柔软的水流", tone: "分散 → 专注" },
    { time: "周六 17:08", text: "在去海边的车上，窗外天色很好", song: "向北的公路", tone: "期待 → 开阔" },
  ];
  return (
    <section className="subpage">
      <div className="subpage-heading"><p className="eyebrow">拾音历史</p><h1>那些被音乐接住的时刻</h1><p>这里只保留结构化情境和反馈，上传的原始图片默认不会长期保存。</p></div>
      <div className="history-list">
        {sessions.map((session, index) => (
          <article className="history-row" key={session.time}>
            <div className="history-index">0{index + 1}</div>
            <div className="history-time"><Clock3 size={15} />{session.time}</div>
            <div className="history-copy"><strong>{session.text}</strong><span>{session.tone}</span></div>
            <div className="history-song"><Music2 size={17} /><span><strong>{session.song}</strong><small>拾音记演示曲库</small></span></div>
            <button onClick={onReplay} aria-label={`重新播放${session.song}`}><Play size={16} fill="currentColor" /></button>
          </article>
        ))}
      </div>
    </section>
  );
}

function ProfileView() {
  return (
    <section className="subpage">
      <div className="subpage-heading"><p className="eyebrow">账号级音乐画像</p><h1>你的声音偏好，正在变得具体</h1><p>显式选择和每一次反馈共同影响排序，你可以随时修正。</p></div>
      <div className="profile-grid">
        <section className="profile-band">
          <div className="profile-avatar">LY</div>
          <div><p>当前画像</p><h2>偏爱克制、温暖的陪伴感</h2><span>基于 18 次情境播放 · 最近更新于今天</span></div>
        </section>
        <section className="preference-section">
          <div className="panel-title"><div><p>长期倾向</p><h3>熟悉与探索</h3></div><Compass size={19} /></div>
          <div className="preference-meter"><span style={{ width: "68%" }} /></div>
          <div className="meter-label"><span>更熟悉</span><strong>68%</strong><span>更新鲜</span></div>
          <div className="preference-tags"><span>华语</span><span>独立流行</span><span>轻电子</span><span>器乐</span><button>+ 修正偏好</button></div>
        </section>
        <section className="scene-learning">
          <div className="panel-title"><div><p>按场景学习</p><h3>你在不同状态下的选择</h3></div><SlidersHorizontal size={19} /></div>
          <div className="scene-row"><span>工作 / 学习</span><div><i style={{ width: "82%" }} /></div><strong>稳定、少歌词</strong></div>
          <div className="scene-row"><span>情绪陪伴</span><div><i style={{ width: "64%" }} /></div><strong>柔和、不煽情</strong></div>
          <div className="scene-row"><span>旅行途中</span><div><i style={{ width: "73%" }} /></div><strong>开阔、有画面</strong></div>
        </section>
      </div>
    </section>
  );
}

function SettingsView({ personalization, setPersonalization }: { personalization: boolean; setPersonalization: (value: boolean) => void }) {
  return (
    <section className="subpage settings-page">
      <div className="subpage-heading"><p className="eyebrow">设置与隐私</p><h1>你的数据，由你决定</h1><p>演示版数据仅保存在当前浏览器，真实账号与第三方音乐服务尚未连接。</p></div>
      <div className="settings-list">
        <div className="setting-row"><div className="setting-icon"><Sparkles size={19} /></div><div><strong>个性化学习</strong><span>用播放、跳过和反馈改进跨会话推荐</span></div><button className={`toggle ${personalization ? "is-on" : ""}`} onClick={() => setPersonalization(!personalization)} aria-label="切换个性化学习"><span /></button></div>
        <div className="setting-row"><div className="setting-icon"><Unplug size={19} /></div><div><strong>网易云音乐</strong><span>尚未连接 · 后续仅使用扫码或会话授权</span></div><button className="text-action">准备接入 <ChevronRight size={15} /></button></div>
        <div className="setting-row"><div className="setting-icon"><Shield size={19} /></div><div><strong>图片处理</strong><span>原图只用于本次理解，默认不长期保留</span></div><span className="setting-state"><Check size={15} /> 已开启</span></div>
        <div className="setting-row danger-row"><div className="setting-icon"><Trash2 size={19} /></div><div><strong>清除演示数据</strong><span>删除当前浏览器中的历史、反馈和画像</span></div><button className="text-action danger">清除数据</button></div>
      </div>
    </section>
  );
}
