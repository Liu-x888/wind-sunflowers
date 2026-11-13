const VENDOR_ROOT = new URL("../vendor/mediapipe/", import.meta.url);
const VISION_BUNDLE = new URL("vision_bundle.mjs", VENDOR_ROOT).href;
const VISION_WASM = new URL("wasm/", VENDOR_ROOT).href;
const HAND_MODEL = new URL("hand_landmarker.task", VENDOR_ROOT).href;

const CONNECTIONS = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [0, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  [5, 9],
  [9, 10],
  [10, 11],
  [11, 12],
  [9, 13],
  [13, 14],
  [14, 15],
  [15, 16],
  [13, 17],
  [17, 18],
  [18, 19],
  [19, 20],
  [0, 17],
];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export class HandTracker {
  constructor({ video, overlay, onUpdate, onStatus }) {
    this.video = video;
    this.overlay = overlay;
    this.overlayContext = overlay.getContext("2d");
    this.onUpdate = onUpdate;
    this.onStatus = onStatus;
    this.landmarker = null;
    this.stream = null;
    this.running = false;
    this.frameHandle = null;
    this.lastVideoTime = -1;
    this.lastFrameTime = 0;
    this.smoothedHands = [];
    this.lastLandmarks = [];
    this.pendingHands = [];
    this.lostAt = 0;
  }

  async start() {
    if (!window.isSecureContext) {
      throw new Error("摄像头需要在 HTTPS 页面中使用。");
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("当前浏览器不支持摄像头访问。");
    }

    this.onStatus?.("正在请求摄像头");
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "user",
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30, max: 30 },
      },
      audio: false,
    });
    this.video.srcObject = this.stream;
    await this.video.play();

    this.onStatus?.("正在准备双手识别");
    const { FilesetResolver, HandLandmarker } = await import(VISION_BUNDLE);
    const vision = await FilesetResolver.forVisionTasks(VISION_WASM);
    const options = {
      baseOptions: {
        modelAssetPath: HAND_MODEL,
        delegate: "GPU",
      },
      runningMode: "VIDEO",
      numHands: 2,
      minHandDetectionConfidence: 0.52,
      minHandPresenceConfidence: 0.48,
      minTrackingConfidence: 0.45,
    };

    try {
      this.landmarker = await HandLandmarker.createFromOptions(vision, options);
    } catch (error) {
      options.baseOptions.delegate = "CPU";
      this.landmarker = await HandLandmarker.createFromOptions(vision, options);
    }

    this.running = true;
    this.onStatus?.("缓缓抬起一只手");
    this.resizeOverlay();
    this.loop();
  }

  stop() {
    this.running = false;
    if (this.frameHandle) {
      cancelAnimationFrame(this.frameHandle);
      this.frameHandle = null;
    }
    if (this.stream) {
      for (const track of this.stream.getTracks()) track.stop();
      this.stream = null;
    }
    this.video.srcObject = null;
    this.landmarker?.close?.();
    this.landmarker = null;
    this.clearOverlay();
  }

  resizeOverlay() {
    const rect = this.overlay.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.overlay.width = Math.max(1, Math.round(rect.width * dpr));
    this.overlay.height = Math.max(1, Math.round(rect.height * dpr));
    this.overlayContext.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.overlayWidth = rect.width;
    this.overlayHeight = rect.height;
  }

  loop = () => {
    if (!this.running) return;
    this.frameHandle = requestAnimationFrame(this.loop);
    if (!this.landmarker || this.video.readyState < 2) return;
    const timestamp = performance.now();
    if (this.video.currentTime === this.lastVideoTime) return;
    if (timestamp - this.lastFrameTime < 30) return;
    this.lastFrameTime = timestamp;
    this.lastVideoTime = this.video.currentTime;

    try {
      const result = this.landmarker.detectForVideo(this.video, timestamp);
      this.handleResult(result.landmarks || [], timestamp);
    } catch (error) {
      this.onStatus?.("手部识别暂时中断");
    }
  };

  handleResult(landmarks, timestamp) {
    const rawHands = landmarks
      .map((points, index) => {
        const palmIndexes = [0, 5, 9, 13, 17];
        const palm = palmIndexes.reduce(
          (sum, pointIndex) => ({
            x: sum.x + points[pointIndex].x / palmIndexes.length,
            y: sum.y + points[pointIndex].y / palmIndexes.length,
          }),
          { x: 0, y: 0 }
        );
        return {
          rawX: clamp(1 - palm.x, 0.02, 0.98),
          rawY: clamp(palm.y, 0.05, 0.95),
          points,
          index,
        };
      })
      .sort((a, b) => a.rawX - b.rawX);

    const dt = Math.max(0.016, (timestamp - (this.lastDetectionTime || timestamp - 32)) / 1000);
    this.lastDetectionTime = timestamp;

    this.smoothedHands = rawHands.map((hand, index) => {
      const previous = this.smoothedHands[index];
      const alpha = previous ? 0.28 : 1;
      const x = previous ? previous.x + (hand.rawX - previous.x) * alpha : hand.rawX;
      const y = previous ? previous.y + (hand.rawY - previous.y) * alpha : hand.rawY;
      const vx = previous ? (x - previous.x) / dt : 0;
      const vy = previous ? (y - previous.y) / dt : 0;
      return {
        x,
        y,
        vx,
        vy,
        seed: index * 2.7,
      };
    });

    const now = performance.now();
    if (this.smoothedHands.length) this.lostAt = now;
    const shouldHold = now - this.lostAt < 220;
    const hands = this.smoothedHands.length
      ? this.smoothedHands
      : shouldHold
        ? this.pendingHands
        : [];
    this.pendingHands = hands;

    this.drawOverlay(rawHands);
    this.onUpdate?.(hands);
    if (hands.length >= 2) {
      this.onStatus?.("双手风场已连接");
    } else if (hands.length === 1) {
      this.onStatus?.("一只手已连接");
    } else {
      this.onStatus?.("寻找手部");
    }
  }

  drawOverlay(rawHands) {
    const ctx = this.overlayContext;
    const width = this.overlayWidth || 240;
    const height = this.overlayHeight || 160;
    ctx.clearRect(0, 0, width, height);

    rawHands.forEach((hand, handIndex) => {
      const points = hand.points.map((point) => ({
        x: (1 - point.x) * width,
        y: point.y * height,
      }));
      ctx.strokeStyle =
        handIndex === 0 ? "rgba(235, 207, 151, 0.82)" : "rgba(223, 184, 186, 0.82)";
      ctx.fillStyle = "rgba(255, 250, 231, 0.9)";
      ctx.lineWidth = 0.9;
      ctx.lineCap = "round";
      for (const [start, end] of CONNECTIONS) {
        ctx.beginPath();
        ctx.moveTo(points[start].x, points[start].y);
        ctx.lineTo(points[end].x, points[end].y);
        ctx.stroke();
      }
      for (const point of points) {
        ctx.beginPath();
        ctx.arc(point.x, point.y, 1.1, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  }

  clearOverlay() {
    const rect = this.overlay.getBoundingClientRect();
    this.overlayContext.clearRect(0, 0, rect.width, rect.height);
  }
}
