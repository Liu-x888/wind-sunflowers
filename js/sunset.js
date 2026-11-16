import { SunsetGardenScene } from "./sunset-scene.js";

const $ = (selector) => document.querySelector(selector);
const DEFAULT_SONG_ID = "406173";
const MUSIC_SESSION_KEY = "wind-sunflowers-music";
const JOURNEY_PROMPTS = [
  {
    start: 1.8,
    end: 7.2,
    text: "沿着光走，前面有一场日落。",
  },
  {
    start: 9.4,
    end: 14.8,
    text: "风从花海经过，黄昏正慢慢靠近。",
  },
  {
    start: 17.2,
    end: 22.6,
    text: "再走一会儿，我们就在光里停下。",
  },
];

const elements = {
  canvas: $("#sunsetCanvas"),
  musicHint: $("#musicHint"),
  musicButton: $("#musicButton"),
  musicPanel: $("#musicPanel"),
  trackOptions: [...document.querySelectorAll(".track-option")],
  neteasePlayer: $("#neteasePlayer"),
  neteaseAudio: $("#neteaseAudio"),
  playerToggle: $("#playerToggle"),
  currentTrackTitle: $("#currentTrackTitle"),
  currentTrackArtist: $("#currentTrackArtist"),
  audioProgress: $("#audioProgress"),
  audioProgressFill: $("#audioProgressFill"),
  audioTime: $("#audioTime"),
  musicProvider: $("#musicProvider"),
  caption: $(".sunset-caption"),
  journeyPrompt: $("#journeyPrompt"),
  journeyPromptText: $("#journeyPromptText"),
  message: $("#sunsetMessage"),
  toast: $("#toast"),
};

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function readMusicSession() {
  try {
    const stored = JSON.parse(sessionStorage.getItem(MUSIC_SESSION_KEY));
    if (!stored || typeof stored !== "object") return null;
    const knownTrack = elements.trackOptions.some(
      (option) => option.dataset.songId === String(stored.songId)
    );
    return {
      songId: knownTrack ? String(stored.songId) : DEFAULT_SONG_ID,
      currentTime: Number.isFinite(stored.currentTime)
        ? Math.max(0, stored.currentTime)
        : 0,
      paused: Boolean(stored.paused),
    };
  } catch {
    return null;
  }
}

const storedMusic = readMusicSession();
const state = {
  musicPanelOpen: false,
  activeSongId: storedMusic?.songId || DEFAULT_SONG_ID,
  userPaused: storedMusic?.paused || false,
  pendingSeek: storedMusic?.currentTime || 0,
  autoplayPending: true,
  messageVisible: false,
  journeyPromptText: "",
  toastTimer: null,
};

function updateTimeline(timeline) {
  const messageVisible = timeline.messageVisible;
  if (messageVisible !== state.messageVisible) {
    state.messageVisible = messageVisible;
    elements.message.classList.toggle("is-visible", messageVisible);
    elements.message.setAttribute("aria-hidden", String(!messageVisible));
  }
  elements.caption.classList.toggle("is-dimmed", timeline.sunset > 0.58);
  const activePrompt = JOURNEY_PROMPTS.find(
    (prompt) =>
      timeline.elapsed >= prompt.start &&
      timeline.elapsed < prompt.end &&
      !timeline.messageVisible
  );
  const nextPromptText = activePrompt?.text || "";
  if (nextPromptText !== state.journeyPromptText) {
    state.journeyPromptText = nextPromptText;
    if (nextPromptText) {
      elements.journeyPromptText.textContent = nextPromptText;
      elements.journeyPrompt.classList.add("is-visible");
      elements.journeyPrompt.setAttribute("aria-hidden", "false");
    } else {
      elements.journeyPrompt.classList.remove("is-visible");
      elements.journeyPrompt.setAttribute("aria-hidden", "true");
    }
  }
}

const scene = new SunsetGardenScene(elements.canvas, {
  onTimeline: updateTimeline,
});

function formatAudioTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00";
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.floor(seconds % 60);
  return `${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`;
}

function setMusicPanelOpen(open) {
  state.musicPanelOpen = open;
  elements.musicPanel.classList.toggle("is-open", open);
  elements.musicPanel.setAttribute("aria-hidden", String(!open));
  elements.musicPanel.inert = !open;
  elements.musicButton.setAttribute("aria-expanded", String(open));
}

function showToast(message, duration = 2800) {
  clearTimeout(state.toastTimer);
  elements.toast.textContent = message;
  elements.toast.hidden = false;
  state.toastTimer = setTimeout(() => {
    elements.toast.hidden = true;
  }, duration);
}

async function playCurrentTrack() {
  if (state.userPaused || !elements.neteaseAudio.src) return false;

  try {
    await elements.neteaseAudio.play();
    state.autoplayPending = false;
    return true;
  } catch (error) {
    if (error?.name === "NotAllowedError") {
      state.autoplayPending = true;
      const title = elements.currentTrackTitle.textContent;
      elements.musicHint.textContent =
        `点按页面继续播放《${title}》 · 右上角可切换歌曲`;
    }
    return false;
  }
}

function loadActiveTrack({ seekTo = 0 } = {}) {
  if (!state.activeSongId) return;
  state.pendingSeek = seekTo;
  elements.neteaseAudio.src =
    `https://music.163.com/song/media/outer/url?id=${encodeURIComponent(state.activeSongId)}.mp3`;
  elements.neteaseAudio.load();
  elements.audioProgressFill.style.width = "0%";
  elements.audioProgress.setAttribute("aria-valuenow", "0");
  elements.audioTime.textContent = "00:00 / 00:00";
  playCurrentTrack();
}

function selectTrack(option, { userInitiated = true, seekTo = 0 } = {}) {
  const songId = option?.dataset.songId;
  if (!songId) return;

  if (userInitiated) state.userPaused = false;
  state.activeSongId = songId;
  for (const track of elements.trackOptions) {
    const active = track === option;
    track.classList.toggle("is-active", active);
    track.setAttribute("aria-checked", String(active));
  }

  const title = option.querySelector(".track-option__title")?.textContent || "歌曲";
  const artist =
    option.querySelector(".track-option__artist")?.textContent.split(" · ")[0] || "";
  elements.currentTrackTitle.textContent = title;
  elements.currentTrackArtist.textContent = artist;
  elements.musicProvider.textContent = "音源来自网易云音乐";
  elements.musicHint.textContent = `正在继续播放《${title}》 · 右上角可切换歌曲`;
  loadActiveTrack({ seekTo });
}

function saveMusicSession() {
  try {
    sessionStorage.setItem(
      MUSIC_SESSION_KEY,
      JSON.stringify({
        songId: state.activeSongId,
        currentTime: elements.neteaseAudio.currentTime,
        paused: elements.neteaseAudio.paused,
      })
    );
  } catch {
    // Playback still works if browser storage is unavailable.
  }
}

function resumeAutoplayAfterInteraction() {
  if (!state.autoplayPending || state.userPaused || !state.activeSongId) return;
  playCurrentTrack();
}

elements.musicButton.addEventListener("click", () => {
  setMusicPanelOpen(!state.musicPanelOpen);
});

elements.trackOptions.forEach((option) => {
  option.addEventListener("click", () => selectTrack(option));
});

elements.playerToggle.addEventListener("click", () => {
  if (elements.neteaseAudio.paused) {
    state.userPaused = false;
    playCurrentTrack();
  } else {
    state.userPaused = true;
    elements.neteaseAudio.pause();
  }
});

elements.neteaseAudio.addEventListener("loadedmetadata", () => {
  const duration = elements.neteaseAudio.duration;
  if (state.pendingSeek > 0 && Number.isFinite(duration)) {
    elements.neteaseAudio.currentTime = Math.min(state.pendingSeek, duration - 0.25);
  }
  state.pendingSeek = 0;
  elements.audioTime.textContent =
    `${formatAudioTime(elements.neteaseAudio.currentTime)} / ${formatAudioTime(duration)}`;
});

elements.neteaseAudio.addEventListener("play", () => {
  state.autoplayPending = false;
  elements.neteasePlayer.classList.add("is-playing");
  elements.playerToggle.setAttribute("aria-label", "暂停音乐");
  const title = elements.currentTrackTitle.textContent;
  elements.musicHint.textContent = `正在播放《${title}》 · 右上角可切换歌曲`;
});

elements.neteaseAudio.addEventListener("pause", () => {
  elements.neteasePlayer.classList.remove("is-playing");
  elements.playerToggle.setAttribute("aria-label", "播放音乐");
  if (!elements.neteaseAudio.ended && state.userPaused) {
    elements.musicHint.textContent = "音乐已暂停 · 右上角可继续播放或切换歌曲";
  }
});

elements.neteaseAudio.addEventListener("timeupdate", () => {
  const duration = elements.neteaseAudio.duration;
  const current = elements.neteaseAudio.currentTime;
  const progress = duration > 0 ? clamp(current / duration) * 100 : 0;
  elements.audioProgressFill.style.width = `${progress}%`;
  elements.audioProgress.setAttribute("aria-valuenow", String(Math.round(progress)));
  elements.audioTime.textContent =
    `${formatAudioTime(current)} / ${formatAudioTime(duration)}`;
});

elements.neteaseAudio.addEventListener("ended", () => {
  elements.neteasePlayer.classList.remove("is-playing");
  elements.playerToggle.setAttribute("aria-label", "重新播放音乐");
  elements.musicHint.textContent = "播放结束 · 右上角可重播或切换歌曲";
});

elements.neteaseAudio.addEventListener("error", () => {
  elements.musicProvider.textContent = "网易云音源暂时不可用";
  elements.musicHint.textContent = "音乐加载失败 · 请切换歌曲";
});

document.addEventListener("pointerdown", (event) => {
  if (
    state.musicPanelOpen &&
    !event.target.closest("#musicPanel") &&
    !event.target.closest("#musicButton")
  ) {
    setMusicPanelOpen(false);
  }
});

document.addEventListener("pointerdown", resumeAutoplayAfterInteraction, {
  capture: true,
  passive: true,
});

document.addEventListener("keydown", (event) => {
  resumeAutoplayAfterInteraction();
  if (event.key === "Escape" && state.musicPanelOpen) {
    setMusicPanelOpen(false);
    elements.musicButton.focus();
  }
});

window.addEventListener("pagehide", () => {
  saveMusicSession();
  elements.neteaseAudio.pause();
});

const initialTrack =
  elements.trackOptions.find(
    (option) => option.dataset.songId === state.activeSongId
  ) || elements.trackOptions.find((option) => option.dataset.songId === DEFAULT_SONG_ID);

if (initialTrack) {
  selectTrack(initialTrack, {
    userInitiated: false,
    seekTo: state.pendingSeek,
  });
}

if (state.userPaused) {
  elements.musicHint.textContent = "音乐已暂停 · 右上角可继续播放或切换歌曲";
}

window.__sunsetGarden = {
  getState: () => ({
    activeSongId: state.activeSongId,
    playing: !elements.neteaseAudio.paused,
    currentTime: elements.neteaseAudio.currentTime,
    panelOpen: state.musicPanelOpen,
    timeline: scene.timeline,
    flowerCount: scene.flowers.length,
    visibleFlowerCount: scene.visibleFlowerCount || 0,
  }),
  getLayoutDiagnostics: () => {
    let overlapCount = 0;
    let minimumGap = Number.POSITIVE_INFINITY;
    for (let first = 0; first < scene.flowers.length; first += 1) {
      for (let second = first + 1; second < scene.flowers.length; second += 1) {
        const a = scene.flowers[first];
        const b = scene.flowers[second];
        if (a.side !== b.side) continue;
        const distance = Math.hypot(a.worldX - b.worldX, a.z - b.z);
        const gap = distance - (a.headSize + b.headSize);
        minimumGap = Math.min(minimumGap, gap);
        if (gap < 0) overlapCount += 1;
      }
    }
    return { overlapCount, minimumGap };
  },
  seekTimeline: (seconds) => scene.seek(seconds),
  showToast,
};
