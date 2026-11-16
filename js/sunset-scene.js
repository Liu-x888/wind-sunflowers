const TAU = Math.PI * 2;
const TRAVEL_DURATION = 24;
const SUNSET_START = 19;
const SUNSET_DURATION = 14;
const MESSAGE_TIME = 34;
const CAMERA_HEIGHT = 2.8;
const CAMERA_TRAVEL = 16;
const PATH_HALF_WIDTH = 2.45;
const FOCAL_SCALE = 0.9;
const NEAR_CLIP = 1.35;
const FAR_CLIP = 72;

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function lerp(start, end, amount) {
  return start + (end - start) * amount;
}

function smoothstep(min, max, value) {
  const ratio = clamp((value - min) / (max - min));
  return ratio * ratio * (3 - 2 * ratio);
}

function createRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function mixColor(start, end, amount) {
  const parse = (color) => [
    Number.parseInt(color.slice(1, 3), 16),
    Number.parseInt(color.slice(3, 5), 16),
    Number.parseInt(color.slice(5, 7), 16),
  ];
  const first = parse(start);
  const second = parse(end);
  const channels = first.map((value, index) =>
    Math.round(lerp(value, second[index], amount))
  );
  return `rgb(${channels[0]}, ${channels[1]}, ${channels[2]})`;
}

function createSunflowerSprite({ outer, inner, disk }) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  const center = 256;

  const drawPetal = (length, width, fillStart, fillEnd, rotation) => {
    ctx.save();
    ctx.translate(center, center);
    ctx.rotate(rotation);
    ctx.translate(0, -66);
    const gradient = ctx.createLinearGradient(0, 0, 0, -length);
    gradient.addColorStop(0, fillStart);
    gradient.addColorStop(0.64, fillEnd);
    gradient.addColorStop(1, "rgba(255, 211, 92, 0.96)");
    ctx.fillStyle = gradient;
    ctx.strokeStyle = "rgba(151, 91, 30, 0.34)";
    ctx.lineWidth = 1.35;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(
      -width * 0.52,
      -length * 0.28,
      -width * 0.5,
      -length * 0.78,
      0,
      -length
    );
    ctx.bezierCurveTo(
      width * 0.5,
      -length * 0.78,
      width * 0.52,
      -length * 0.28,
      0,
      0
    );
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  };

  for (let index = 0; index < 13; index += 1) {
    drawPetal(
      176,
      94,
      outer[0],
      outer[1],
      index * (TAU / 13)
    );
  }

  for (let index = 0; index < 12; index += 1) {
    drawPetal(
      142,
      80,
      inner[0],
      inner[1],
      index * (TAU / 12) + 0.16
    );
  }

  const head = ctx.createRadialGradient(228, 220, 8, center, center, 88);
  head.addColorStop(0, disk[0]);
  head.addColorStop(0.7, disk[1]);
  head.addColorStop(1, disk[2]);
  ctx.fillStyle = head;
  ctx.strokeStyle = "rgba(88, 49, 28, 0.72)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(center, center, 86, 0, TAU);
  ctx.fill();
  ctx.stroke();

  for (let index = 0; index < 72; index += 1) {
    const angle = index * 2.399963;
    const radius = Math.sqrt((index + 1) / 72) * 65;
    const x = center + Math.cos(angle) * radius;
    const y = center + Math.sin(angle) * radius;
    ctx.fillStyle =
      index % 3 === 0
        ? "rgba(232, 171, 79, 0.34)"
        : "rgba(48, 31, 22, 0.32)";
    ctx.beginPath();
    ctx.arc(x, y, index % 4 === 0 ? 1.8 : 1.25, 0, TAU);
    ctx.fill();
  }

  return canvas;
}

export class SunsetGardenScene {
  constructor(canvas, { onTimeline } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.width = 1;
    this.height = 1;
    this.dpr = 1;
    this.lastFrame = performance.now();
    this.startedAt = performance.now();
    this.onTimeline = onTimeline;
    this.timeline = {
      elapsed: 0,
      travel: 0,
      sunset: 0,
      messageVisible: false,
    };
    this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.sprites = {
      gold: createSunflowerSprite({
        outer: ["rgba(188, 112, 31, 0.98)", "rgba(237, 165, 40, 1)"],
        inner: ["rgba(218, 132, 31, 0.98)", "rgba(255, 207, 73, 1)"],
        disk: ["#9a6039", "#6e422b", "#4d3023"],
      }),
      amber: createSunflowerSprite({
        outer: ["rgba(176, 100, 27, 0.98)", "rgba(226, 145, 32, 1)"],
        inner: ["rgba(211, 121, 26, 0.98)", "rgba(250, 190, 54, 1)"],
        disk: ["#925833", "#613a27", "#422b21"],
      }),
    };

    this.resize = this.resize.bind(this);
    window.addEventListener("resize", this.resize, { passive: true });
    this.resize();
    this.render(performance.now());
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.width = Math.max(1, rect.width);
    this.height = Math.max(1, rect.height);
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    this.horizon = this.height * 0.435;
    this.sun = {
      x: this.width * 0.5,
      y: this.horizon - this.height * 0.035,
      radius: this.height * 0.071,
    };
    this.buildScene();
  }

  projectGround(worldX, worldZ, camera) {
    // World-space scenery stays fixed; only camera.distance advances the view.
    const relativeZ = worldZ - camera.distance;
    if (relativeZ <= NEAR_CLIP) return null;
    const focal = this.height * FOCAL_SCALE;
    const scale = focal / relativeZ;
    return {
      x: this.width * 0.5 + (worldX - camera.worldX) * scale,
      y: this.horizon + camera.height * scale,
      scale,
      relativeZ,
    };
  }

  pathAtDepth(worldZ, camera) {
    const center = this.projectGround(0, worldZ, camera);
    if (!center) return null;
    const halfWidth = PATH_HALF_WIDTH * center.scale;
    const depth = clamp(center.relativeZ / FAR_CLIP);
    return {
      center: center.x,
      left: center.x - halfWidth,
      right: center.x + halfWidth,
      y: center.y,
      scale: center.scale,
      relativeZ: center.relativeZ,
      depth,
    };
  }

  buildScene() {
    const random = createRandom(35117);
    this.flowers = [];
    const flowersBySide = new Map([
      [-1, []],
      [1, []],
    ]);

    const addLayer = (side, count, options) => {
      const nearbyFlowers = flowersBySide.get(side);
      let placed = 0;
      let attempts = 0;
      while (placed < count && attempts < count * 24) {
        attempts += 1;
        const z = lerp(
          options.zMin,
          options.zMax,
          Math.pow(random(), options.zCurve)
        );
        const worldX =
          side *
          (PATH_HALF_WIDTH +
            options.offsetMin +
            Math.pow(random(), 1.35) * options.fieldWidth);
        const headHeight = lerp(0.7, 2.45, random());
        const headSize = lerp(
          options.sizeMin,
          options.sizeMax,
          Math.pow(random(), 0.82)
        );
        const hasRoom = nearbyFlowers.every((other) => {
          const deltaX = worldX - other.worldX;
          const deltaZ = z - other.z;
          const minimumSpacing = headSize + other.headSize + 0.13;
          return deltaX * deltaX + deltaZ * deltaZ >= minimumSpacing ** 2;
        });
        if (!hasRoom) continue;

        const flower = {
          side,
          z,
          worldX,
          headHeight,
          headSize,
          phase: random() * TAU,
          angle: (random() - 0.5) * 0.14,
          warmth: random(),
          bend: (random() - 0.5) * 0.2,
          leafSide: random() > 0.5 ? 1 : -1,
          hasExtraLeaf: random() > options.extraLeafThreshold,
        };
        this.flowers.push(flower);
        nearbyFlowers.push(flower);
        placed += 1;
      }
    };

    for (const side of [-1, 1]) {
      addLayer(side, 170, {
        zMin: 8,
        zMax: FAR_CLIP + 4,
        zCurve: 0.9,
        offsetMin: 0.7,
        fieldWidth: 13,
        sizeMin: 0.18,
        sizeMax: 0.52,
        extraLeafThreshold: 0.7,
      });
      addLayer(side, 55, {
        zMin: 1.75,
        zMax: 18,
        zCurve: 0.9,
        offsetMin: 0.25,
        fieldWidth: 8.2,
        sizeMin: 0.24,
        sizeMax: 0.64,
        extraLeafThreshold: 0.08,
      });
    }

    this.pathStones = [];
    let stoneZ = 2.15;
    while (stoneZ < FAR_CLIP + 8) {
      this.pathStones.push({
        z: stoneZ,
        split: lerp(-0.22, 0.22, random()),
        offset: random() * TAU,
      });
      stoneZ += lerp(0.78, 1.35, random());
    }

    this.grassTufts = Array.from({ length: 150 }, () => ({
      z: lerp(2.1, 62, Math.pow(random(), 0.86)),
      side: random() > 0.5 ? 1 : -1,
      offset: lerp(0.05, 4.8, Math.pow(random(), 1.3)),
      height: lerp(0.16, 0.72, random()),
      lean: (random() - 0.5) * 0.38,
      phase: random() * TAU,
      alpha: lerp(0.2, 0.62, random()),
    }));
    this.pollen = Array.from({ length: 34 }, () => ({
      x: random(),
      y: lerp(0.43, 0.9, random()),
      radius: lerp(0.7, 2.4, random()),
      phase: random() * TAU,
      speed: lerp(0.14, 0.4, random()),
      alpha: lerp(0.22, 0.68, random()),
    }));
  }

  projectFlower(flower, camera) {
    const relativeZ = flower.z - camera.distance;
    if (relativeZ <= NEAR_CLIP) return { ...flower, visibility: 0 };
    const focal = this.height * FOCAL_SCALE;
    const scale = focal / relativeZ;
    const groundY = this.horizon + camera.height * scale;
    const depth = clamp(relativeZ / FAR_CLIP);
    const visibility =
      smoothstep(NEAR_CLIP, 2.15, relativeZ) *
      (1 - smoothstep(FAR_CLIP * 0.82, FAR_CLIP, relativeZ));
    const x =
      this.width * 0.5 + (flower.worldX - camera.worldX) * scale;
    const y = this.horizon + (camera.height - flower.headHeight) * scale;
    const size = flower.headSize * scale;
    return {
      ...flower,
      x,
      y,
      size,
      depth,
      visibility,
      groundY,
      stemLength: Math.max(0, groundY - y),
      stemBend: flower.bend * scale,
      leafCount: relativeZ < 22 && flower.hasExtraLeaf ? 2 : 1,
    };
  }

  drawSky(ctx, time, sunset, camera) {
    const sunX = this.sun.x + camera.lookX;
    const sunY =
      this.sun.y + sunset * this.height * 0.085 + camera.lookY;
    const sunRadius = this.sun.radius * (1 - sunset * 0.08);
    const sky = ctx.createLinearGradient(0, 0, 0, this.horizon + 30);
    sky.addColorStop(0, mixColor("#8e6d5f", "#655762", sunset));
    sky.addColorStop(0.36, mixColor("#c77d56", "#b46856", sunset));
    sky.addColorStop(0.72, mixColor("#eaa064", "#dc895d", sunset));
    sky.addColorStop(1, mixColor("#f7c980", "#e3a06f", sunset));
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, this.width, this.horizon + 32);

    const glow = ctx.createRadialGradient(
      sunX,
      sunY,
      0,
      sunX,
      sunY,
      this.height * 0.36
    );
    glow.addColorStop(0, `rgba(255, 238, 170, ${0.96 - sunset * 0.22})`);
    glow.addColorStop(0.15, `rgba(255, 213, 129, ${0.68 - sunset * 0.16})`);
    glow.addColorStop(0.52, `rgba(245, 163, 84, ${0.2 - sunset * 0.05})`);
    glow.addColorStop(1, "rgba(245, 163, 84, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, this.width, this.horizon + this.height * 0.22);

    ctx.fillStyle = "rgba(255, 229, 158, 0.94)";
    ctx.beginPath();
    ctx.arc(
      sunX,
      sunY,
      sunRadius * (1 + Math.sin(time * 0.45) * 0.018),
      0,
      TAU
    );
    ctx.fill();

    for (let index = 0; index < 5; index += 1) {
      const x =
        this.width *
        (0.13 + index * 0.19 + Math.sin(index * 2.1) * 0.035);
      const y = this.height * (0.11 + (index % 3) * 0.056);
      const radius = this.width * (0.1 + (index % 2) * 0.035);
      ctx.save();
      ctx.translate(x + Math.sin(time * 0.06 + index) * 13, y);
      ctx.scale(3.2, 0.66);
      const cloud = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
      cloud.addColorStop(0, "rgba(255, 236, 198, 0.13)");
      cloud.addColorStop(0.62, "rgba(255, 224, 177, 0.075)");
      cloud.addColorStop(1, "rgba(255, 224, 177, 0)");
      ctx.fillStyle = cloud;
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }

  drawHills(ctx, sunset, camera) {
    ctx.save();
    ctx.translate(camera.lookX * 0.72, camera.lookY * 0.72);
    ctx.globalAlpha = 0.62;
    ctx.fillStyle = mixColor("#6b5237", "#4f454d", sunset);
    ctx.beginPath();
    ctx.moveTo(0, this.horizon + 10);
    ctx.bezierCurveTo(
      this.width * 0.14,
      this.horizon - 32,
      this.width * 0.29,
      this.horizon - 7,
      this.width * 0.43,
      this.horizon + 2
    );
    ctx.bezierCurveTo(
      this.width * 0.58,
      this.horizon - 34,
      this.width * 0.79,
      this.horizon - 20,
      this.width,
      this.horizon + 4
    );
    ctx.lineTo(this.width, this.horizon + 70);
    ctx.lineTo(0, this.horizon + 70);
    ctx.closePath();
    ctx.fill();

    ctx.globalAlpha = 0.72;
    ctx.fillStyle = mixColor("#454e30", "#354139", sunset);
    ctx.beginPath();
    ctx.moveTo(0, this.horizon + 35);
    ctx.bezierCurveTo(
      this.width * 0.18,
      this.horizon + 12,
      this.width * 0.34,
      this.horizon + 25,
      this.width * 0.5,
      this.horizon + 16
    );
    ctx.bezierCurveTo(
      this.width * 0.67,
      this.horizon + 9,
      this.width * 0.83,
      this.horizon + 22,
      this.width,
      this.horizon + 24
    );
    ctx.lineTo(this.width, this.horizon + 88);
    ctx.lineTo(0, this.horizon + 88);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  drawGround(ctx, sunset) {
    const ground = ctx.createLinearGradient(0, this.horizon, 0, this.height);
    ground.addColorStop(0, mixColor("#8b7547", "#756047", sunset));
    ground.addColorStop(0.32, mixColor("#65754a", "#566147", sunset));
    ground.addColorStop(0.7, mixColor("#415c3e", "#374b3c", sunset));
    ground.addColorStop(1, mixColor("#2f4735", "#293b33", sunset));
    ctx.fillStyle = ground;
    ctx.fillRect(0, this.horizon + 20, this.width, this.height - this.horizon);

    for (let index = 0; index < 7; index += 1) {
      const y = this.horizon + 34 + index * this.height * 0.095;
      ctx.fillStyle =
        index % 2 === 0
          ? "rgba(154, 124, 68, 0.13)"
          : "rgba(42, 73, 48, 0.13)";
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(
        this.width * 0.3,
        y - 16,
        this.width * 0.7,
        y + 22,
        this.width,
        y - 8
      );
      ctx.lineTo(this.width, y + 25);
      ctx.bezierCurveTo(
        this.width * 0.68,
        y + 54,
        this.width * 0.3,
        y + 18,
        0,
        y + 46
      );
      ctx.closePath();
      ctx.fill();
    }
  }

  drawPath(ctx, camera, sunset) {
    const left = [];
    const right = [];
    const steps = 64;
    for (let index = 0; index <= steps; index += 1) {
      const amount = index / steps;
      const relativeZ = lerp(
        NEAR_CLIP + 0.08,
        FAR_CLIP,
        Math.pow(amount, 2.15)
      );
      const path = this.pathAtDepth(
        camera.distance + relativeZ,
        camera
      );
      if (!path) continue;
      left.push({ x: path.left, y: path.y, depth: path.depth });
      right.push({ x: path.right, y: path.y, depth: path.depth });
    }

    ctx.fillStyle = `rgba(105, 72, 43, ${0.52 - sunset * 0.08})`;
    ctx.beginPath();
    ctx.moveTo(left[0].x - 6, left[0].y);
    for (const point of left) ctx.lineTo(point.x - 6, point.y);
    for (let index = right.length - 1; index >= 0; index -= 1) {
      ctx.lineTo(right[index].x + 6, right[index].y);
    }
    ctx.closePath();
    ctx.fill();

    const pathFill = ctx.createLinearGradient(0, this.horizon, 0, this.height);
    pathFill.addColorStop(0, mixColor("#f6d9aa", "#d9bd9e", sunset));
    pathFill.addColorStop(0.34, mixColor("#eed2a6", "#d1b99a", sunset));
    pathFill.addColorStop(0.74, mixColor("#ead1aa", "#c8af93", sunset));
    pathFill.addColorStop(1, mixColor("#d8b585", "#b8997d", sunset));
    ctx.fillStyle = pathFill;
    ctx.beginPath();
    ctx.moveTo(left[0].x, left[0].y);
    for (const point of left) ctx.lineTo(point.x, point.y);
    for (let index = right.length - 1; index >= 0; index -= 1) {
      ctx.lineTo(right[index].x, right[index].y);
    }
    ctx.closePath();
    ctx.fill();

    const centerLight = ctx.createLinearGradient(
      this.width * 0.43,
      0,
      this.width * 0.58,
      0
    );
    centerLight.addColorStop(0, "rgba(255, 243, 211, 0)");
    centerLight.addColorStop(0.5, "rgba(255, 243, 211, 0.28)");
    centerLight.addColorStop(1, "rgba(255, 243, 211, 0)");
    ctx.fillStyle = centerLight;
    ctx.beginPath();
    ctx.moveTo(left[0].x, left[0].y);
    for (const point of left) ctx.lineTo(point.x, point.y);
    for (let index = right.length - 1; index >= 0; index -= 1) {
      ctx.lineTo(right[index].x, right[index].y);
    }
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = "rgba(125, 89, 56, 0.24)";
    ctx.lineCap = "round";
    for (const stone of this.pathStones) {
      const path = this.pathAtDepth(stone.z, camera);
      if (
        !path ||
        path.relativeZ > FAR_CLIP ||
        path.y < this.horizon - 2 ||
        path.y > this.height + 40
      ) {
        continue;
      }
      const halfWidth = (path.right - path.left) * 0.5;
      const inset = Math.max(1, halfWidth * 0.035);
      const split = path.center + halfWidth * stone.split;
      const gap = clamp(halfWidth * 0.035, 1.2, 13);
      ctx.lineWidth = clamp(path.scale * 0.006, 0.35, 2);
      ctx.beginPath();
      ctx.moveTo(path.left + inset, path.y);
      ctx.quadraticCurveTo(
        lerp(path.left, split, 0.5),
        path.y + Math.sin(stone.offset) * 2,
        split - gap,
        path.y + Math.cos(stone.offset) * 0.8
      );
      ctx.moveTo(split + gap, path.y + Math.cos(stone.offset) * 0.8);
      ctx.quadraticCurveTo(
        lerp(split, path.right, 0.54),
        path.y - Math.sin(stone.offset) * 2,
        path.right - inset,
        path.y
      );
      ctx.stroke();
    }
  }

  drawPathGrass(ctx, time, camera, sunset) {
    ctx.save();
    ctx.lineCap = "round";
    for (const tuft of this.grassTufts) {
      const relativeZ = tuft.z - camera.distance;
      if (relativeZ <= NEAR_CLIP || relativeZ > 62) continue;
      const point = this.projectGround(
        tuft.side * (PATH_HALF_WIDTH + tuft.offset),
        tuft.z,
        camera
      );
      if (!point || point.y < this.horizon - 4 || point.y > this.height + 80) {
        continue;
      }
      const length = clamp(tuft.height * point.scale, 3, 96);
      const sway = Math.sin(time * 0.7 + tuft.phase) * length * 0.08;
      ctx.strokeStyle = `rgba(${Math.round(52 + sunset * 8)}, ${Math.round(
        91 - sunset * 16
      )}, ${Math.round(47 - sunset * 4)}, ${tuft.alpha})`;
      ctx.lineWidth = lerp(0.5, 1.7, 1 - relativeZ / 62);
      ctx.beginPath();
      ctx.moveTo(point.x, point.y);
      ctx.quadraticCurveTo(
        point.x - tuft.side * length * (0.18 + tuft.lean),
        point.y - length * 0.48,
        point.x - tuft.side * length + sway,
        point.y - length
      );
      ctx.stroke();
    }
    ctx.restore();
  }

  drawLeaf(ctx, x, y, length, side, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(side * 0.43);
    ctx.fillStyle = color;
    ctx.strokeStyle = "rgba(49, 77, 45, 0.42)";
    ctx.lineWidth = Math.max(0.5, length * 0.012);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(
      side * length * 0.18,
      -length * 0.42,
      side * length * 0.82,
      -length * 0.43,
      side * length,
      -length * 0.04
    );
    ctx.bezierCurveTo(
      side * length * 0.68,
      length * 0.36,
      side * length * 0.2,
      length * 0.3,
      0,
      0
    );
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  drawFlower(ctx, flower, time) {
    const sway =
      Math.sin(time * 0.52 + flower.phase) *
      flower.size *
      lerp(0.038, 0.012, flower.depth);
    const headX = flower.x + sway;
    const headY =
      flower.y - Math.abs(sway) * 0.08 + Math.sin(time * 0.35 + flower.phase) * 0.7;
    const baseY = flower.y + flower.stemLength;
    const baseX = flower.x + flower.stemBend * (1 - flower.depth);
    const stemAlpha = lerp(0.92, 0.48, flower.depth);
    const stemWidth = clamp(flower.size * 0.055, 0.7, 5.2);

    ctx.save();
    ctx.globalAlpha = flower.visibility;
    ctx.strokeStyle = `rgba(55, 92, 48, ${stemAlpha})`;
    ctx.lineWidth = stemWidth;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(headX, headY + flower.size * 0.46);
    ctx.quadraticCurveTo(
      headX + flower.stemBend * 0.35,
      lerp(headY, baseY, 0.46),
      baseX,
      baseY
    );
    ctx.stroke();

    for (let index = 0; index < flower.leafCount; index += 1) {
      const amount = index === 0 ? 0.38 : 0.66;
      const direction = index % 2 === 0 ? flower.leafSide : -flower.leafSide;
      const leafX = lerp(headX, baseX, amount);
      const leafY = lerp(headY, baseY, amount);
      const leafLength = flower.size * (index === 0 ? 0.72 : 0.58);
      const color = `rgba(${Math.round(lerp(92, 72, flower.depth))}, ${Math.round(
        lerp(124, 103, flower.depth)
      )}, ${Math.round(lerp(70, 67, flower.depth))}, ${lerp(0.78, 0.42, flower.depth)})`;
      this.drawLeaf(ctx, leafX, leafY, leafLength, direction, color);
    }

    ctx.save();
    if (flower.size > 24) {
      const aura = ctx.createRadialGradient(
        headX,
        headY,
        flower.size * 0.15,
        headX,
        headY,
        flower.size * 1.38
      );
      aura.addColorStop(0, "rgba(255, 218, 120, 0.15)");
      aura.addColorStop(1, "rgba(255, 218, 120, 0)");
      ctx.fillStyle = aura;
      ctx.beginPath();
      ctx.arc(headX, headY, flower.size * 1.38, 0, TAU);
      ctx.fill();
    }
    ctx.translate(headX, headY);
    ctx.rotate(
      flower.angle +
        Math.sin(time * 0.45 + flower.phase) * lerp(0.022, 0.006, flower.depth)
    );
    ctx.globalAlpha = flower.visibility * lerp(1, 0.62, flower.depth);
    const sprite = flower.warmth > 0.52 ? this.sprites.gold : this.sprites.amber;
    ctx.drawImage(sprite, -flower.size, -flower.size, flower.size * 2, flower.size * 2);
    ctx.restore();
    ctx.restore();
  }

  drawAtmosphere(ctx, time, sunset) {
    ctx.fillStyle = `rgba(62, 48, 56, ${sunset * 0.14})`;
    ctx.fillRect(0, 0, this.width, this.height);

    const haze = ctx.createLinearGradient(0, this.horizon - 60, 0, this.height * 0.72);
    haze.addColorStop(0, `rgba(255, 211, 137, ${0.2 - sunset * 0.07})`);
    haze.addColorStop(0.5, "rgba(255, 194, 112, 0.05)");
    haze.addColorStop(1, "rgba(255, 194, 112, 0)");
    ctx.fillStyle = haze;
    ctx.fillRect(0, this.horizon - 60, this.width, this.height * 0.5);

    for (const mote of this.pollen) {
      const drift = Math.sin(time * mote.speed + mote.phase) * 18;
      const x = mote.x * this.width + drift;
      const y =
        mote.y * this.height +
        Math.cos(time * mote.speed * 0.72 + mote.phase) * 9;
      ctx.fillStyle = `rgba(255, 232, 166, ${mote.alpha})`;
      ctx.beginPath();
      ctx.arc(x, y, mote.radius, 0, TAU);
      ctx.fill();
      ctx.fillStyle = `rgba(255, 218, 129, ${mote.alpha * 0.15})`;
      ctx.beginPath();
      ctx.arc(x, y, mote.radius * 3.1, 0, TAU);
      ctx.fill();
    }
  }

  seek(seconds) {
    this.startedAt = performance.now() - Math.max(0, seconds) * 1000;
    this.render(performance.now());
  }

  getCameraState(elapsed) {
    const travel = smoothstep(0, TRAVEL_DURATION, elapsed);
    const walkEnvelope = Math.sin(Math.PI * travel);
    const stride = elapsed * 2.15;
    return {
      travel,
      distance: travel * CAMERA_TRAVEL,
      worldX:
        (Math.sin(stride) * 0.045 + Math.sin(stride * 0.43 + 1.7) * 0.022) *
        walkEnvelope,
      height:
        CAMERA_HEIGHT +
        (Math.sin(stride * 2) * 0.025 + Math.sin(stride * 0.73) * 0.012) *
          walkEnvelope,
      lookX:
        (Math.sin(stride) * 1.8 + Math.sin(stride * 0.43 + 1.7) * 0.8) *
        walkEnvelope,
      lookY:
        (Math.sin(stride * 2.1) * 0.9 + Math.sin(stride * 0.73) * 0.35) *
        walkEnvelope,
    };
  }

  render(now) {
    const time = this.reducedMotion ? 0 : now * 0.001;
    const elapsed = Math.max(0, (now - this.startedAt) / 1000);
    const camera = this.getCameraState(elapsed);
    const travel = camera.travel;
    const sunset = smoothstep(
      SUNSET_START,
      SUNSET_START + SUNSET_DURATION,
      elapsed
    );
    this.timeline = {
      elapsed,
      travel,
      sunset,
      cameraDistance: camera.distance,
      cameraWorldX: camera.worldX,
      cameraHeight: camera.height,
      messageVisible: elapsed >= MESSAGE_TIME,
    };
    this.onTimeline?.(this.timeline);

    const projectedFlowers = this.flowers
      .map((flower) => this.projectFlower(flower, camera))
      .filter(
        (flower) =>
          flower.visibility > 0.01 &&
          flower.y < this.height + this.height * 0.2 &&
          flower.x > -this.width * 0.45 &&
          flower.x < this.width * 1.45
      )
      .sort(
        (first, second) =>
          second.relativeZ - first.relativeZ || first.y - second.y
      );
    this.visibleFlowerCount = projectedFlowers.length;

    const ctx = this.ctx;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    this.drawSky(ctx, time, sunset, camera);
    this.drawHills(ctx, sunset, camera);
    this.drawGround(ctx, sunset);
    this.drawPath(ctx, camera, sunset);
    this.drawPathGrass(ctx, time, camera, sunset);
    for (const flower of projectedFlowers) {
      this.drawFlower(ctx, flower, time);
    }
    const sunX = this.sun.x + camera.lookX;
    const sunY =
      this.sun.y + sunset * this.height * 0.085 + camera.lookY;
    const backlight = ctx.createRadialGradient(
      sunX,
      sunY,
      this.sun.radius * 0.3,
      sunX,
      sunY,
      this.height * 0.82
    );
    backlight.addColorStop(0, `rgba(255, 221, 151, ${0.22 - sunset * 0.11})`);
    backlight.addColorStop(0.42, `rgba(255, 184, 105, ${0.08 - sunset * 0.03})`);
    backlight.addColorStop(1, "rgba(255, 184, 105, 0)");
    ctx.save();
    ctx.globalCompositeOperation = "soft-light";
    ctx.fillStyle = backlight;
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.restore();
    this.drawAtmosphere(ctx, time, sunset);

    if (!this.reducedMotion) {
      requestAnimationFrame((nextNow) => this.render(nextNow));
    }
  }
}
