import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";

const API_BASE = "http://localhost:8000";

function formatTime(seconds) {
  if (seconds == null || Number.isNaN(seconds)) return "0:00";
  const totalSeconds = Math.floor(seconds);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function getInitial(email) {
  return email ? email[0].toUpperCase() : "?";
}

const Icon = {
  Upload: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="17 8 12 3 7 8"/>
      <line x1="12" y1="3" x2="12" y2="15"/>
    </svg>
  ),
  Search: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"/>
      <line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
  ),
  Play: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <polygon points="5 3 19 12 5 21 5 3"/>
    </svg>
  ),
  List: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/>
      <line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/>
      <line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
    </svg>
  ),
  Player: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <polygon points="10 8 16 12 10 16 10 8"/>
    </svg>
  ),
  Video: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="15" height="10" rx="2"/><path d="m17 8 4-2v12l-4-2"/>
    </svg>
  ),
  Music: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
    </svg>
  ),
  Email: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
    </svg>
  ),
  Lock: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </svg>
  ),
  SearchSm: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
  ),
  Clock: () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
    </svg>
  ),
  Close: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  ),
};

function Spinner() {
  return <span className="spinner" />;
}

export default function App() {
  const [mode, setMode] = useState("login");
  const [token, setToken] = useState(localStorage.getItem("vidara_token") || "");
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem("vidara_user");
    return saved ? JSON.parse(saved) : null;
  });

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState("");
  const [uploadedVideoId, setUploadedVideoId] = useState("");

  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState([]);

  const [videos, setVideos] = useState([]);
  const [loadingVideos, setLoadingVideos] = useState(false);

  const [currentMedia, setCurrentMedia] = useState(null);
  const [currentMediaName, setCurrentMediaName] = useState("");

  // Inline transcript state: { videoId, filename, segments } | null
  const [inlineTranscript, setInlineTranscript] = useState(null);
  const [loadingTranscriptId, setLoadingTranscriptId] = useState(null);

  const audioRef = useRef(null);
  const resultsRef = useRef(null);

  function authHeaders(extra = {}) {
    return { ...extra, Authorization: `Bearer ${token}` };
  }

  async function fetchVideos() {
    if (!token) return;
    try {
      setLoadingVideos(true);
      const res = await fetch(`${API_BASE}/videos`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed to fetch videos");
      const data = await res.json();
      setVideos(data.videos || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingVideos(false);
    }
  }

  useEffect(() => { if (token) fetchVideos(); }, [token]);

  const videoMap = useMemo(() => {
    const map = {};
    for (const v of videos) map[v.id] = v;
    return map;
  }, [videos]);

  function persistAuth(authToken, authUser) {
    localStorage.setItem("vidara_token", authToken);
    localStorage.setItem("vidara_user", JSON.stringify(authUser));
    setToken(authToken);
    setUser(authUser);
  }

  function logout() {
    localStorage.removeItem("vidara_token");
    localStorage.removeItem("vidara_user");
    setToken(""); setUser(null); setVideos([]); setResults([]);
    setCurrentMedia(null); setCurrentMediaName("");
    setInlineTranscript(null); setLoadingTranscriptId(null);
    setAuthMessage(""); setUploadMessage("");
  }

  async function handleAuthSubmit(e) {
    e.preventDefault();
    setAuthLoading(true);
    setAuthMessage("");
    try {
      const endpoint = mode === "signup" ? "/auth/signup" : "/auth/login";
      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Authentication failed");
      persistAuth(data.access_token, data.user);
      setAuthMessage(mode === "signup" ? "Account created successfully" : "Welcome back");
      setEmail(""); setPassword("");
    } catch (err) {
      setAuthMessage(err.message || "Authentication failed");
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleUpload(e) {
    e.preventDefault();
    if (!file) { setUploadMessage("Please choose a file first."); return; }
    try {
      setUploading(true); setUploadMessage("");
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`${API_BASE}/videos`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch { throw new Error(`Upload failed: ${text}`); }
      if (!res.ok) throw new Error(data.detail || "Upload failed");
      setUploadMessage(`Indexed ${data.segments_indexed} segments successfully`);
      setUploadedVideoId(data.video_id || "");
      setFile(null);
      const fi = document.getElementById("file-input");
      if (fi) fi.value = "";
      await fetchVideos();
    } catch (err) {
      setUploadMessage(err.message || "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  // FIX 1: scroll results into view after search completes
  async function handleSearch(e) {
    e.preventDefault();
    if (!query.trim()) return;
    try {
      setSearching(true);
      const res = await fetch(`${API_BASE}/search`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ query: query.trim(), limit: 5 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Search failed");
      setResults(data.results || []);
      setTimeout(() => {
        resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 50);
    } catch (err) {
      alert(err.message || "Search failed");
    } finally {
      setSearching(false);
    }
  }

  // FIX 3: play immediately when clicking Play on a result
  function handlePlayFromResult(result, matchedVideo) {
    if (!matchedVideo?.media_url) return;
    setCurrentMedia(matchedVideo.media_url);
    setCurrentMediaName(matchedVideo.filename || "Unknown file");
    // Wait for audio element to load the new src, then seek and play
    setTimeout(() => {
      const audio = audioRef.current;
      if (!audio) return;
      const seek = () => {
        audio.currentTime = result.start_time;
        audio.play();
        audio.removeEventListener("canplay", seek);
      };
      if (audio.readyState >= 3) {
        audio.currentTime = result.start_time;
        audio.play();
      } else {
        audio.addEventListener("canplay", seek);
      }
    }, 50);
  }
  function handlePlayVideo(video) {
    setCurrentMedia(video.media_url);
    setCurrentMediaName(video.filename);
    setTimeout(() => {
      const audio = audioRef.current;
      if (!audio) return;
      if (audio.readyState >= 3) {
        audio.play();
      } else {
        const play = () => { audio.play(); audio.removeEventListener("canplay", play); };
        audio.addEventListener("canplay", play);
      }
    }, 50);
  }

  async function handleToggleTranscript(video) {
    if (inlineTranscript?.videoId === video.id) {
      setInlineTranscript(null);
      return;
    }
    try {
      setLoadingTranscriptId(video.id);
      const res = await fetch(`${API_BASE}/videos/${video.id}/segments`, { headers: authHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to load transcript");
      setInlineTranscript({ videoId: video.id, filename: data.filename, segments: data.segments });
    } catch (err) {
      alert(err.message || "Failed to load transcript");
    } finally {
      setLoadingTranscriptId(null);
    }
  }

  if (!token || !user) {
    return (
      <div className="app-shell">
        <header className="hero" style={{ marginBottom: 0 }}>
          <div className="brand-wordmark" style={{ justifyContent: "center" }}>
            <h1>Vidara</h1>
            <span className="brand-tag">Beta</span>
          </div>
        </header>

        <main className="auth-wrapper">
          <section className="card auth-card">
            <h2>{mode === "signup" ? "Create your account" : "Welcome back"}</h2>
            <p className="auth-subtitle">
              {mode === "signup"
                ? "Start searching your media transcripts semantically."
                : "Sign in to continue to Vidara."}
            </p>

            <form onSubmit={handleAuthSubmit} className="stack">
              <div className="input-wrap">
                <span className="input-icon"><Icon.Email /></span>
                <input
                  type="email"
                  placeholder="Email address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                />
              </div>

              <div className="input-wrap">
                <span className="input-icon"><Icon.Lock /></span>
                <input
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                />
              </div>

              <button
                type="submit"
                className="btn-primary"
                disabled={authLoading}
                style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
              >
                {authLoading && <Spinner />}
                {authLoading ? "Please wait…" : mode === "signup" ? "Create account" : "Sign in"}
              </button>
            </form>

            {authMessage && <p className="status-message">{authMessage}</p>}

            <div className="divider" />

            <p className="meta-text" style={{ textAlign: "center", margin: 0 }}>
              {mode === "signup" ? "Already have an account? " : "Need an account? "}
              <button
                className="link-button"
                onClick={() => { setMode(mode === "signup" ? "login" : "signup"); setAuthMessage(""); }}
              >
                {mode === "signup" ? "Sign in" : "Sign up free"}
              </button>
            </p>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="hero hero-row">
        <div className="brand-lockup">
          <div className="brand-wordmark">
            <h1>Vidara</h1>
            <span className="brand-tag">Beta</span>
          </div>
          <p>Semantic transcript search for your uploaded media</p>
        </div>

        <div className="user-box">
          <div className="user-avatar">{getInitial(user.email)}</div>
          <span className="user-email">{user.email}</span>
          <button className="btn-danger" onClick={logout}>Sign out</button>
        </div>
      </header>

      <main className="content-grid">
        <section className="card">
          <div className="card-header">
            <div className="card-icon"><Icon.Upload /></div>
            <h2>Upload Media</h2>
          </div>
          <form onSubmit={handleUpload} className="stack">
            <input
              id="file-input"
              type="file"
              accept="audio/*,video/*"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
            <button
              type="submit"
              className="btn-primary"
              disabled={uploading}
              style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
            >
              {uploading ? <><Spinner /> Uploading…</> : <><Icon.Upload /> Upload &amp; Index</>}
            </button>
          </form>
          {uploadMessage && <p className="status-message">{uploadMessage}</p>}
          {uploadedVideoId && (
            <p className="meta-text" style={{ marginTop: 10, fontSize: "0.8rem" }}>
              <strong>ID:</strong>{" "}
              <code style={{ fontFamily: "monospace", fontSize: "0.78rem", color: "var(--text-muted)" }}>
                {uploadedVideoId}
              </code>
            </p>
          )}
        </section>

        <section className="card">
          <div className="card-header">
            <div className="card-icon"><Icon.Search /></div>
            <h2>Semantic Search</h2>
          </div>
          <form onSubmit={handleSearch} className="stack">
            <div className="input-wrap">
              <span className="input-icon"><Icon.SearchSm /></span>
              <input
                type="text"
                placeholder="Search by meaning, not just keywords…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <button
              type="submit"
              className="btn-primary"
              disabled={searching}
              style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
            >
              {searching ? <><Spinner /> Searching…</> : <><Icon.Search /> Search</>}
            </button>
          </form>
        </section>

        <section className="card">
          <div className="card-header">
            <div className="card-icon"><Icon.Player /></div>
            <h2>Player</h2>
          </div>
          {currentMedia ? (
            <>
              <p className="now-playing-label">Now playing</p>
              <p className="now-playing-name">{currentMediaName}</p>
              <audio ref={audioRef} controls src={currentMedia} />
            </>
          ) : (
            <div className="player-empty">
              <div className="player-icon"><Icon.Music /></div>
              <span>Search and click a result to play</span>
            </div>
          )}
        </section>

        <section className="card">
          <div className="card-header">
            <div className="card-icon"><Icon.Video /></div>
            <h2>Your Library</h2>
          </div>
          {loadingVideos ? (
            <div className="empty-state"><Spinner /></div>
          ) : videos.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📂</div>
              <span>No media uploaded yet</span>
            </div>
          ) : (
            <div className="video-list">
              {videos.map((video) => {
                const isOpen = inlineTranscript?.videoId === video.id;
                const isLoading = loadingTranscriptId === video.id;
                return (
                  <div key={video.id}>
                    <div className="video-item">
                      <div className="video-name">{video.filename}</div>
                      <div className="video-id">{video.id}</div>
                      <div className="video-actions">
                        <button
                          className={`btn-ghost${isOpen ? " btn-ghost-active" : ""}`}
                          onClick={() => handleToggleTranscript(video)}
                          style={{ display: "flex", alignItems: "center", gap: 6 }}
                          disabled={isLoading}
                        >
                          {isLoading ? <Spinner /> : <Icon.List />}
                          {isOpen ? "Hide" : "Transcript"}
                        </button>
                        <button
                          className="btn-ghost"
                          onClick={() => handlePlayVideo(video)}
                          style={{ display: "flex", alignItems: "center", gap: 6 }}
                        >
                          <Icon.Play /> Play
                        </button>
                      </div>
                    </div>

                    {isOpen && inlineTranscript && (
                      <div style={{
                        marginTop: 2,
                        padding: "14px 16px",
                        background: "rgba(0,0,0,0.28)",
                        border: "1px solid var(--border-subtle)",
                        borderRadius: "var(--radius-md)",
                        maxHeight: 260,
                        overflowY: "auto",
                      }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                          <span className="meta-text" style={{ fontSize: "0.82rem" }}>
                            <strong>{inlineTranscript.filename}</strong>
                            <span style={{ marginLeft: 8, color: "var(--text-muted)" }}>
                              {inlineTranscript.segments?.length} segments
                            </span>
                          </span>
                          <button
                            className="btn-ghost"
                            onClick={() => setInlineTranscript(null)}
                            style={{ padding: "4px 8px", display: "flex", alignItems: "center", gap: 4 }}
                          >
                            <Icon.Close /> Close
                          </button>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          {inlineTranscript.segments.map((seg) => (
                            <div key={seg.id} className="transcript-item">
                              <span className="badge">
                                <Icon.Clock />
                                {formatTime(seg.start_time)} – {formatTime(seg.end_time)}
                              </span>
                              <p className="transcript-text">{seg.transcript_text}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="card results-card" ref={resultsRef}>
          <div className="card-header">
            <div className="card-icon"><Icon.Search /></div>
            <h2>
              Results{" "}
              {results.length > 0 && (
                <span style={{ fontWeight: 400, color: "var(--text-muted)", fontSize: "0.9rem" }}>
                  — {results.length} matches
                </span>
              )}
            </h2>
          </div>
          {results.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">🔍</div>
              <span>Run a search to see results here</span>
            </div>
          ) : (
            <div className="results-list">
              {results.map((result) => {
                const matchedVideo = videoMap[result.video_id];
                return (
                  <article key={result.segment_id} className="result-item">
                    <div className="result-top">
                      <span className="badge badge-score">
                        ↑ {(result.score * 100).toFixed(1)}% match
                      </span>
                      <span className="badge">
                        <Icon.Clock />
                        {formatTime(result.start_time)} – {formatTime(result.end_time)}
                      </span>
                      {matchedVideo && <span className="badge">{matchedVideo.filename}</span>}
                    </div>
                    <p className="transcript-text">{result.transcript_text}</p>
                    <div className="result-meta">
                      <span><strong>Video ID:</strong> {result.video_id}</span>
                      <span><strong>Segment:</strong> {result.segment_id}</span>
                    </div>
                    <div className="result-actions">
                      <button
                        className="btn-secondary"
                        onClick={() => handlePlayFromResult(result, matchedVideo)}
                        disabled={!matchedVideo?.media_url}
                        style={{ display: "flex", alignItems: "center", gap: 6 }}
                      >
                        <Icon.Play /> Play from here
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}