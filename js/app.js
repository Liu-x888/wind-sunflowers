import { GardenScene } from "./scene.js";
import { HandTracker } from "./hand-tracker.js";

const $ = (selector) => document.querySelector(selector);
const elements = {
  canvas: $("#gardenCanvas"),
  entry: $("#entryScreen"),
  compatibility: $("#compatibilityScreen"),
  compatibilityReason: $("#compatibilityReason"),
  permission: $("#permissionScreen"),
  permissionReason: $("#permissionReason"),
  cameraButton: $("#cameraButton"),
  cameraButtonLabel: $("#cameraButtonLabel"),
  pointerEntry: $("#pointerEntryButton"),
  retryCamera: $("#retryCameraButton"),
  permissionPointer: $("#permissionPointerButton"),
  stageUi: $("#stageUi"),
  stagePrompt: $("#stagePrompt"),
  pauseHint: $("#pauseHint"),
  gestureDemo: $("#gestureDemo"),
  cameraPanel: $("#cameraPanel"),
  cameraVideo: $("#cameraVideo"),
  cameraOverlay: $("#cameraOverlay"),
  cameraIdle: $("#cameraIdle"),
  cameraStatus: $("#cameraStatus"),
  modeBadge: $("#modeBadge"),
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
  restartButton: $("#restartButton"),
  finale: $("#finale"),
  finaleRestart: $("#finaleRestartButton"),
  continueViewing: $("#continueViewingButton"),
  toast: $("#toast"),
};

const scene = new GardenScene(elements.canvas);
const DEFAULT_SONG_ID = "406173";
const MUSIC_SESSION_KEY = "wind-sunflowers-music";
const VIEWING_ACCESS_KEY = "wind-sunflowers-viewing-access";

try {
  sessionStorage.removeItem(VIEWING_ACCESS_KEY);
} catch {
  // The interactive garden still works when browser storage is unavailable.
}

const state = {
  mode: null,
  started: false,
  finished: false,
  progress: 0,
  energy: 0,
  hands: [],
  cameraHands: [],
  pointer: { x: 0.62, y: 0.54, vx: 0, vy: 0 },
  pointerTarget: { x: 0.62, y: 0.54 },
  lastPointerAt: 0,
  lastFrame: 0,
  startedAt: 0,
  lastPrompt: "",
  pausedAt: 0,
  toastTimer: null,
  screenTimer: null,
  musicPanelOpen: false,
  activeSongId: DEFAULT_SONG_ID,
  userPaused: false,
  autoplayPending: true,
};

let handTracker = null;
let compatibilityPaused = false;

const PHASES = [
  { end: 0.12, prompt: "抬起一只手，缓缓带起风" },
  { end: 0.33, prompt: "让手经过近处的向日葵" },
  { end: 0.4, prompt: "再加入另一只手，让风穿过花园" },
  { end: 0.62, prompt: "双手一起移动，风经过哪里，哪里先开放" },
  { end: 0.84, prompt: "沿着尚未开放的花，再让风走一遍" },
  { end: 1, prompt: "沿着花海，让最后一束风落下" },
];

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function isCompatibleDesktop() {
  const isLargeEnough = window.innerWidth >= 1280 && window.innerHeight >= 720;
  const userAgent = navigator.userAgent;
  const isChromium = /Chrome|Edg|Chromium/i.test(userAgent);
  return isLargeEnough && isChromium;
}

function updateCompatibility() {
  if (isCompatibleDesktop()) {
    elements.compatibility.hidden = true;
    if (compatibilityPaused && state.started) {
      compatibilityPaused = false;
      elements.stageUi.hidden = false;
    }
    return true;
  }

  compatibilityPaused = state.started;
  elements.entry.hidden = true;
  elements.permission.hidden = true;
  elements.compatibility.hidden = false;
  elements.compatibilityReason.textContent =
    window.innerWidth < 1280 || window.innerHeight < 720
      ? "请使用桌面 Chrome 或 Edge，并将窗口扩大到至少 1280 × 720。"
      : "这段双手风场体验目前只支持桌面版 Chrome 或 Edge。";
  return false;
}

function setScreen(screen) {
  for (const panel of [elements.entry, elements.permission, elements.compatibility]) {
    panel.hidden = panel !== screen;
    panel.classList.remove("is-leaving");
  }
}

function getCameraErrorMessage(error) {
  if (error?.name === "NotAllowedError") {
    return "摄像头权限被拒绝。请在浏览器地址栏中允许摄像头，或先使用鼠标体验。";
  }
  if (error?.name === "NotFoundError") {
    return "没有检测到可用摄像头，请连接摄像头或使用鼠标体验。";
  }
  if (error?.name === "NotReadableError") {
    return "摄像头正被其他程序占用，请关闭占用程序后重试。";
  }
  if (/module|model|fetch|wasm|network/i.test(error?.message || "")) {
    return "手部识别资源加载失败，请刷新页面重试，或先使用鼠标体验。";
  }
  return error?.message || "摄像头暂时不可用，请重试或使用鼠标体验。";
}

function hideScreen(screen) {
  screen.classList.add("is-leaving");
  clearTimeout(state.screenTimer);
  state.screenTimer = setTimeout(() => {
    screen.hidden = true;
    screen.classList.remove("is-leaving");
  }, 900);
}

function showToast(message, duration = 3200) {
  clearTimeout(state.toastTimer);
  elements.toast.textContent = message;
  elements.toast.hidden = false;
  state.toastTimer = setTimeout(() => {
    elements.toast.hidden = true;
  }, duration);
}

function getRequiredHands() {
  return state.progress < 0.34 ? 1 : 2;
}

function getPhasePrompt() {
  const phase = PHASES.find((item) => state.progress < item.end) || PHASES.at(-1);
  const coverage = scene.getBloomCoverage();
  if (state.finished) return "整片花海已经醒来";
  if (
    state.mode === "camera" &&
    state.progress >= 0.33 &&
    state.progress < 0.4 &&
    state.cameraHands.length < 2
  ) {
    return "再让另一只手进入风里";
  }
  if (
    state.mode === "pointer" &&
    state.progress >= 0.33 &&
    state.progress < 0.4
  ) {
    return "第二条风迹已经出现，继续移动鼠标";
  }
  if (state.progress >= 0.84 && coverage < 0.76) {
    return "再沿花海走一小段，让剩下的花醒来";
  }
  if (state.progress >= 0.84) {
    return "最后一束风正在穿过花海";
  }
  return phase.prompt;
}

function updateStageUi() {
  const prompt = getPhasePrompt();
  if (prompt !== state.lastPrompt) {
    state.lastPrompt = prompt;
    elements.stagePrompt.textContent = prompt;
    elements.stagePrompt.animate(
      [
        { opacity: 0, transform: "translateY(5px)" },
        { opacity: 1, transform: "translateY(0)" },
      ],
      { duration: 420, easing: "ease-out" }
    );
  }

  const tutorialVisible =
    state.startedAt > 0 && performance.now() - state.startedAt < 4600;
  elements.pauseHint.textContent =
    state.mode === "pointer" ? "移动鼠标，让风继续" : "花园正在等待你的手";
  elements.gestureDemo.classList.toggle("is-visible", tutorialVisible);
  elements.pauseHint.hidden = !(
    state.started &&
    !state.finished &&
    state.pausedAt > 0 &&
    performance.now() - state.pausedAt > 850
  );
}

function setMode(mode) {
  state.mode = mode;
  document.body.dataset.pointerMode = String(mode === "pointer");
  elements.modeBadge.textContent = mode === "camera" ? "双手风场" : "鼠标风场";
  elements.modeBadge.hidden = false;
}

async function beginExperience(mode) {
  if (state.started) return;
  state.started = true;
  state.startedAt = performance.now();
  state.lastFrame = performance.now();
  setMode(mode);
  document.body.dataset.started = "true";
  setScreen(elements.entry);
  hideScreen(elements.entry);
  elements.permission.hidden = true;
  elements.stageUi.hidden = false;
  elements.cameraPanel.hidden = mode !== "camera";
  elements.cameraPanel.classList.toggle("is-visible", mode === "camera");
  elements.restartButton.hidden = false;
}

async function startCameraMode() {
  if (!updateCompatibility()) return;
  startCurrentTrack();
  elements.cameraButton.disabled = true;
  elements.cameraButtonLabel.textContent = "正在听见风";
  elements.retryCamera.disabled = true;
  clearTimeout(state.screenTimer);
  try {
    if (!handTracker) {
      handTracker = new HandTracker({
        video: elements.cameraVideo,
        overlay: elements.cameraOverlay,
        onUpdate: (hands) => {
          state.cameraHands = hands;
          if (hands.length) {
            state.pausedAt = 0;
          } else if (!state.pausedAt) {
            state.pausedAt = performance.now();
          }
          elements.cameraIdle.hidden = hands.length > 0;
        },
        onStatus: (message) => {
          elements.cameraStatus.textContent = message;
        },
      });
    }
    await handTracker.start();
    elements.permission.hidden = true;
    await beginExperience("camera");
  } catch (error) {
    handTracker?.stop();
    handTracker = null;
    elements.permissionReason.textContent = getCameraErrorMessage(error);
    setScreen(elements.permission);
  } finally {
    elements.cameraButton.disabled = false;
    elements.cameraButtonLabel.textContent = "进入花园";
    elements.retryCamera.disabled = false;
  }
}

function startPointerMode() {
  if (!updateCompatibility()) return;
  startCurrentTrack();
  beginExperience("pointer");
  state.lastPointerAt = 0;
}

function updatePointer(event) {
  if (state.mode !== "pointer" || !state.started) return;
  const rect = elements.canvas.getBoundingClientRect();
  const x = clamp((event.clientX - rect.left) / rect.width, 0.02, 0.98);
  const y = clamp((event.clientY - rect.top) / rect.height, 0.04, 0.96);
  const now = performance.now();
  const dt = Math.max(0.016, (now - state.lastPointerAt) / 1000);
  if (state.lastPointerAt) {
    state.pointer.vx = (x - state.pointerTarget.x) / dt;
    state.pointer.vy = (y - state.pointerTarget.y) / dt;
  }
  state.pointerTarget.x = x;
  state.pointerTarget.y = y;
  state.lastPointerAt = now;
  state.pausedAt = 0;
}

function buildPointerHands(now) {
  const smoothing = 0.23;
  state.pointer.x += (state.pointerTarget.x - state.pointer.x) * smoothing;
  state.pointer.y += (state.pointerTarget.y - state.pointer.y) * smoothing;
  const hands = [
    {
      x: state.pointer.x,
      y: state.pointer.y,
      vx: state.pointer.vx,
      vy: state.pointer.vy,
      seed: 0.4,
    },
  ];
  if (state.progress >= 0.33) {
    hands.push({
      x: clamp(
        state.pointer.x - 0.11 + Math.sin(now * 0.00075) * 0.055,
        0.03,
        0.97
      ),
      y: clamp(state.pointer.y + 0.035, 0.05, 0.95),
      vx: state.pointer.vx * 0.86,
      vy: state.pointer.vy * 0.86,
      seed: 2.2,
    });
  }
  return hands;
}

function updateExperience(now) {
  const delta = state.lastFrame
    ? clamp((now - state.lastFrame) / 1000, 0, 0.05)
    : 0;
  state.lastFrame = now;

  if (!state.started || state.finished || compatibilityPaused) {
    state.energy += (0 - state.energy) * clamp(delta * 5);
    state.hands = state.mode === "pointer" ? buildPointerHands(now) : state.cameraHands;
    return delta;
  }

  if (state.mode === "camera") {
    state.hands = state.cameraHands;
  } else {
    state.hands = buildPointerHands(now);
  }

  const requiredHands = getRequiredHands();
  const enoughHands = state.hands.length >= requiredHands;
  const pointerFresh =
    state.mode !== "pointer" || now - state.lastPointerAt < 2200;
  const active = enoughHands && pointerFresh;

  if (state.mode === "pointer" && now - state.lastPointerAt > 90) {
    const damping = Math.pow(0.0008, delta);
    state.pointer.vx *= damping;
    state.pointer.vy *= damping;
  }

  if (!active && !state.pausedAt) state.pausedAt = now;
  if (active) state.pausedAt = 0;

  const averageSpeed =
    state.hands.length > 0
      ? state.hands.reduce(
          (sum, hand) => sum + Math.hypot(hand.vx || 0, hand.vy || 0),
          0
        ) / state.hands.length
      : 0;
  const targetEnergy = active ? clamp(averageSpeed * 1.8) : 0;
  state.energy += (targetEnergy - state.energy) * clamp(delta * 5.2);

  if (active) {
    const rate = 0.58 + state.energy * 1.25;
    state.progress = clamp(state.progress + (delta / 48) * rate);
  }

  const bloomCoverage = scene.getBloomCoverage();
  if (
    !state.finished &&
    ((state.progress >= 0.84 && bloomCoverage >= 0.74) ||
      bloomCoverage >= 0.93)
  ) {
    finishExperience();
  }

  return delta;
}

function finishExperience() {
  if (state.finished) return;
  state.finished = true;
  state.progress = 1;
  scene.finalizeBloom();
  elements.finale.hidden = false;
  elements.restartButton.hidden = false;
  setTimeout(() => {
    elements.stageUi.hidden = true;
  }, 1400);
}

function resetExperience() {
  scene.resetBloom();
  state.progress = 0;
  state.energy = 0;
  state.finished = false;
  state.startedAt = performance.now();
  state.lastFrame = performance.now();
  state.lastPointerAt = 0;
  state.pausedAt = 0;
  state.lastPrompt = "";
  elements.finale.hidden = true;
  elements.stageUi.hidden = false;
  elements.pauseHint.hidden = true;
}

function animationLoop(now) {
  updateExperience(now);
  updateStageUi();
  scene.render(now, {
    progress: state.progress,
    energy: state.energy,
    active:
      state.started &&
      !state.finished &&
      state.hands.length >= getRequiredHands() &&
      (state.mode !== "pointer" || now - state.lastPointerAt < 2200),
    hands: state.hands,
  });
  requestAnimationFrame(animationLoop);
}

function handlePreviewMode() {
  const preview = new URLSearchParams(window.location.search).get("preview");
  if (!preview) return false;
  state.started = true;
  state.startedAt = performance.now() - 6000;
  state.mode = "pointer";
  document.body.dataset.started = "true";
  document.body.dataset.pointerMode = "true";
  elements.entry.hidden = true;
  elements.stageUi.hidden = false;
  elements.modeBadge.hidden = false;
  elements.modeBadge.textContent = "预览模式";
  elements.restartButton.hidden = false;
  state.lastPointerAt = performance.now();
  if (preview === "bloom") {
    state.progress = 0.74;
    scene.setAllBlooms(0.72);
  } else if (preview === "full") {
    state.progress = 1;
    state.finished = true;
    scene.setAllBlooms(1);
    elements.finale.hidden = false;
    elements.stageUi.hidden = true;
  } else {
    state.progress = 0;
  }
  return true;
}

function setMusicPanelOpen(open) {
  state.musicPanelOpen = open;
  elements.musicPanel.classList.toggle("is-open", open);
  elements.musicPanel.setAttribute("aria-hidden", String(!open));
  elements.musicPanel.inert = !open;
  elements.musicButton.setAttribute("aria-expanded", String(open));
}

function formatAudioTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00";
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.floor(seconds % 60);
  return `${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`;
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
        `点按页面播放《${title}》 · 右上角可切换歌曲`;
    }
    return false;
  }
}

function loadActiveTrack() {
  if (!state.activeSongId) return;
  elements.neteaseAudio.src =
    `https://music.163.com/song/media/outer/url?id=${encodeURIComponent(state.activeSongId)}.mp3`;
  elements.neteaseAudio.load();
  elements.audioProgressFill.style.width = "0%";
  elements.audioProgress.setAttribute("aria-valuenow", "0");
  elements.audioTime.textContent = "00:00 / 00:00";
  playCurrentTrack();
}

function selectTrack(option, { userInitiated = true } = {}) {
  const songId = option.dataset.songId;
  const title = option.querySelector(".track-option__title")?.textContent || "歌曲";
  const artist = option.querySelector(".track-option__artist")?.textContent.split(" · ")[0] || "";
  if (!songId) return;

  if (userInitiated) state.userPaused = false;
  state.activeSongId = songId;
  for (const track of elements.trackOptions) {
    const active = track === option;
    track.classList.toggle("is-active", active);
    track.setAttribute("aria-checked", String(active));
  }

  elements.currentTrackTitle.textContent = title;
  elements.currentTrackArtist.textContent = artist;
  elements.musicProvider.textContent = "音源来自网易云音乐";
  elements.musicHint.textContent = `点右侧图标切换 · ${title}`;
  loadActiveTrack();
}

function startCurrentTrack() {
  if (!state.userPaused) return playCurrentTrack();
  return Promise.resolve(false);
}

function resumeAutoplayAfterInteraction() {
  if (!state.autoplayPending || state.userPaused || !state.activeSongId) return;
  startCurrentTrack();
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
    sessionStorage.setItem(VIEWING_ACCESS_KEY, "completed");
  } catch {
    // Navigation still proceeds if browser storage is unavailable.
  }
}

elements.cameraButton.addEventListener("click", startCameraMode);
elements.retryCamera.addEventListener("click", startCameraMode);
elements.pointerEntry.addEventListener("click", startPointerMode);
elements.permissionPointer.addEventListener("click", startPointerMode);
elements.finaleRestart.addEventListener("click", resetExperience);
elements.restartButton.addEventListener("click", resetExperience);
elements.continueViewing.addEventListener("click", saveMusicSession);
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
elements.neteaseAudio.addEventListener("loadedmetadata", () => {
  elements.audioTime.textContent =
    `00:00 / ${formatAudioTime(elements.neteaseAudio.duration)}`;
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

window.addEventListener("pointermove", updatePointer, { passive: true });
window.addEventListener("pointerdown", updatePointer, { passive: true });
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
window.addEventListener("resize", () => {
  updateCompatibility();
  handTracker?.resizeOverlay();
});
window.addEventListener("pagehide", () => {
  elements.neteaseAudio.pause();
  handTracker?.stop();
});

const defaultTrack = elements.trackOptions.find(
  (option) => option.dataset.songId === DEFAULT_SONG_ID
);
if (defaultTrack) selectTrack(defaultTrack, { userInitiated: false });

updateCompatibility();
handlePreviewMode();
requestAnimationFrame(animationLoop);

window.__windLilies = {
  getState: () => ({
    mode: state.mode,
    started: state.started,
    finished: state.finished,
    progress: state.progress,
    handCount: state.hands.length,
    bloomCoverage: scene.getBloomCoverage(),
    hands: state.hands.map(({ x, y, vx, vy }) => ({ x, y, vx, vy })),
  }),
  getBloomSnapshot: () =>
    scene.plants.map(({ x, y, depth, windBloom }) => ({
      x,
      y,
      depth,
      bloom: windBloom,
    })),
  setProgress(value) {
    state.started = true;
    state.progress = clamp(Number(value));
    state.lastPointerAt = performance.now();
    if (state.progress >= 1) finishExperience();
  },
};
