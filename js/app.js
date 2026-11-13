import { GardenScene } from "./scene.js";
import { HandTracker } from "./hand-tracker.js";
import { ScorePlayer } from "./score-player.js";

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
  soundButton: $("#soundButton"),
  restartButton: $("#restartButton"),
  finale: $("#finale"),
  finaleRestart: $("#finaleRestartButton"),
  toast: $("#toast"),
};

const scene = new GardenScene(elements.canvas);
const score = new ScorePlayer("./assets/wind-sunflowers-score.wav");

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
};

let handTracker = null;
let compatibilityPaused = false;

const PHASES = [
  { end: 0.12, prompt: "抬起一只手，缓缓带起风" },
  { end: 0.33, prompt: "让手经过近处的向日葵" },
  { end: 0.4, prompt: "再加入另一只手，让风穿过花园" },
  { end: 0.62, prompt: "双手一起移动，风经过哪里，哪里先开放" },
  { end: 0.84, prompt: "沿着尚未开放的花，再让风走一遍" },
  { end: 1, prompt: "让风经过还没有开放的花朵" },
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
  if (state.progress >= 1 && scene.getBloomCoverage() < 0.85) {
    return "让风经过还没有开放的花朵";
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
  try {
    await score.start();
  } catch (error) {
    showToast("浏览器暂时无法播放配乐，体验仍可继续。");
  }
}

async function startCameraMode() {
  if (!updateCompatibility()) return;
  score.start().catch(() => {});
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
    score.pause();
  } finally {
    elements.cameraButton.disabled = false;
    elements.cameraButtonLabel.textContent = "进入花园";
    elements.retryCamera.disabled = false;
  }
}

function startPointerMode() {
  if (!updateCompatibility()) return;
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

  if (active && !score.running) {
    score.start().catch(() => {});
  } else if (!active && score.running) {
    score.pause();
  }

  if (
    state.progress >= 1 &&
    scene.getBloomCoverage() >= 0.85 &&
    !state.finished
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
  score.restart();
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
  if (state.mode === "camera" && state.cameraHands.length) {
    score.start().catch(() => {});
  }
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

elements.cameraButton.addEventListener("click", startCameraMode);
elements.retryCamera.addEventListener("click", startCameraMode);
elements.pointerEntry.addEventListener("click", startPointerMode);
elements.permissionPointer.addEventListener("click", startPointerMode);
elements.finaleRestart.addEventListener("click", resetExperience);
elements.restartButton.addEventListener("click", resetExperience);
elements.soundButton.addEventListener("click", () => {
  const muted = score.toggleMuted();
  elements.soundButton.setAttribute("aria-pressed", String(muted));
  elements.soundButton.setAttribute("aria-label", muted ? "打开声音" : "关闭声音");
});

window.addEventListener("pointermove", updatePointer, { passive: true });
window.addEventListener("pointerdown", updatePointer, { passive: true });
window.addEventListener("resize", () => {
  updateCompatibility();
  handTracker?.resizeOverlay();
});
window.addEventListener("pagehide", () => {
  handTracker?.stop();
  score.destroy();
});

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
  }),
  setProgress(value) {
    state.started = true;
    state.progress = clamp(Number(value));
    state.lastPointerAt = performance.now();
    if (state.progress >= 1) finishExperience();
  },
};
