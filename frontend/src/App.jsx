import { useEffect, useMemo, useRef, useState } from "react";

const API_BASE = "http://localhost:8000";

function formatTime(seconds) {
  if (seconds == null || Number.isNaN(seconds)) return "0:00";

  const totalSeconds = Math.floor(seconds);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;

  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export default function App() {
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

  const audioRef = useRef(null);

  async function fetchVideos() {
    try {
      setLoadingVideos(true);
      const response = await fetch(`${API_BASE}/videos`);
      const data = await response.json();
      setVideos(data.videos || []);
    } catch (error) {
      console.error("Failed to fetch videos:", error);
    } finally {
      setLoadingVideos(false);
    }
  }

  useEffect(() => {
    fetchVideos();
  }, []);

  const videoMap = useMemo(() => {
    const map = {};
    for (const video of videos) {
      map[video.id] = video;
    }
    return map;
  }, [videos]);

  async function handleUpload(event) {
    event.preventDefault();

    if (!file) {
      setUploadMessage("Please choose a file first.");
      return;
    }

    try {
      setUploading(true);
      setUploadMessage("");

      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(`${API_BASE}/videos`, {
        method: "POST",
        body: formData,
      });

      let data;
      const text = await response.text();

      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(`Upload failed. Server returned: ${text}`);
      }

      if (!response.ok) {
        throw new Error(data.detail || "Upload failed");
      }

      setUploadMessage(
        `Upload successful. Indexed ${data.segments_indexed} segments.`
      );
      setUploadedVideoId(data.video_id || "");
      setFile(null);

      const fileInput = document.getElementById("file-input");
      if (fileInput) fileInput.value = "";

      await fetchVideos();
    } catch (error) {
      setUploadMessage(error.message || "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function handleSearch(event) {
    event.preventDefault();

    if (!query.trim()) return;

    try {
      setSearching(true);

      const response = await fetch(`${API_BASE}/search`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: query.trim(),
          limit: 5,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Search failed");
      }

      setResults(data.results || []);
    } catch (error) {
      console.error(error);
      alert(error.message || "Search failed");
    } finally {
      setSearching(false);
    }
  }

  function handlePlayFromResult(result, matchedVideo) {
    if (!matchedVideo?.media_url) return;

    setCurrentMedia(matchedVideo.media_url);
    setCurrentMediaName(matchedVideo.filename || "Unknown file");

    setTimeout(() => {
      if (audioRef.current) {
        audioRef.current.currentTime = result.start_time;
        audioRef.current.play();
      }
    }, 150);
  }

  return (
    <div className="app-shell">
      <header className="hero">
        <h1>Vidara</h1>
        <p>
          Semantic video and audio transcript search with timestamp-level
          retrieval.
        </p>
      </header>

      <main className="content-grid">
        <section className="card">
          <h2>Upload Media</h2>
          <form onSubmit={handleUpload} className="stack">
            <input
              id="file-input"
              type="file"
              accept="audio/*,video/*"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />

            <button type="submit" disabled={uploading}>
              {uploading ? "Uploading..." : "Upload and Index"}
            </button>
          </form>

          {uploadMessage && <p className="status-message">{uploadMessage}</p>}

          {uploadedVideoId && (
            <p className="meta-text">
              <strong>Latest video_id:</strong> {uploadedVideoId}
            </p>
          )}
        </section>

        <section className="card">
          <h2>Semantic Search</h2>
          <form onSubmit={handleSearch} className="stack">
            <input
              type="text"
              placeholder="Search transcript meaning... e.g. yellow notes in the office"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />

            <button type="submit" disabled={searching}>
              {searching ? "Searching..." : "Search"}
            </button>
          </form>
        </section>

        <section className="card">
          <h2>Player</h2>

          {currentMedia ? (
            <>
              <p className="meta-text">
                <strong>Now playing:</strong> {currentMediaName}
              </p>
              <audio
                ref={audioRef}
                controls
                src={currentMedia}
                style={{ width: "100%", marginTop: "12px" }}
              />
            </>
          ) : (
            <p>No media selected yet. Search and click a result to play.</p>
          )}
        </section>

        <section className="card">
          <h2>Indexed Videos</h2>
          {loadingVideos ? (
            <p>Loading videos...</p>
          ) : videos.length === 0 ? (
            <p>No videos uploaded yet.</p>
          ) : (
            <div className="video-list">
              {videos.map((video) => (
                <div key={video.id} className="video-item">
                  <div className="video-name">{video.filename}</div>
                  <div className="video-id">{video.id}</div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="card results-card">
          <h2>Results</h2>

          {results.length === 0 ? (
            <p>No search results yet.</p>
          ) : (
            <div className="results-list">
              {results.map((result) => {
                const matchedVideo = videoMap[result.video_id];

                return (
                  <article key={result.segment_id} className="result-item">
                    <div className="result-top">
                      <span className="badge">
                        Score: {result.score.toFixed(4)}
                      </span>
                      <span className="badge">
                        {formatTime(result.start_time)} -{" "}
                        {formatTime(result.end_time)}
                      </span>
                    </div>

                    <p className="transcript-text">{result.transcript_text}</p>

                    <div className="result-meta">
                      <div>
                        <strong>Filename:</strong>{" "}
                        {matchedVideo?.filename || "Unknown"}
                      </div>
                      <div>
                        <strong>Video ID:</strong> {result.video_id}
                      </div>
                      <div>
                        <strong>Segment ID:</strong> {result.segment_id}
                      </div>
                    </div>

                    <div style={{ marginTop: "12px" }}>
                      <button
                        onClick={() =>
                          handlePlayFromResult(result, matchedVideo)
                        }
                        disabled={!matchedVideo?.media_url}
                      >
                        Play from timestamp
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