const TAU = Math.PI * 2;

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function smoothstep(edge0, edge1, value) {
  const x = clamp((value - edge0) / (edge1 - edge0));
  return x * x * (3 - 2 * x);
}

function mix(a, b, amount) {
  return a + (b - a) * amount;
}

function mulberry32(seed) {
  return function random() {
    let value = (seed += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export class GardenScene {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false });
    this.width = 0;
    this.height = 0;
    this.dpr = 1;
    this.time = 0;
    this.lastTimestamp = 0;
    this.energy = 0;
    this.progress = 0;
    this.active = false;
    this.finalizing = false;
    this.hands = [];
    this.trails = [];
    this.pollen = [];
    this.grass = [];
    this.plants = [];
    this.backgroundCanvas = document.createElement("canvas");
    this.backgroundContext = this.backgroundCanvas.getContext("2d");
    this.handleResize = this.resize.bind(this);
    window.addEventListener("resize", this.handleResize);
    this.createSprites();
    this.resize();
    this.createPaperGrain();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.width = Math.max(1280, rect.width);
    this.height = Math.max(720, rect.height);
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.backgroundCanvas.width = Math.round(this.width);
    this.backgroundCanvas.height = Math.round(this.height);
    this.createGarden();
    this.paintBackground();
  }

  createGarden() {
    const random = mulberry32(660066);
    this.plants = [];
    this.grass = [];
    this.pollen = [];

    const addPlants = (count, options) => {
      for (let index = 0; index < count; index += 1) {
        const x = mix(options.xMin, options.xMax, random());
        const y = mix(options.yMin, options.yMax, random());
        const size = mix(options.sizeMin, options.sizeMax, random());
        this.plants.push({
          x,
          y,
          size,
          depth: options.depth,
          windBloom: 0,
          windX: 0,
          windY: 0,
          height: size * mix(options.heightMin, options.heightMax, random()),
          lean: mix(-0.16, 0.16, random()),
          seed: random() * TAU,
          warmth: random(),
          leaves: Math.floor(mix(2, 4.9, random())),
        });
      }
    };

    addPlants(9, {
      xMin: 0.05,
      xMax: 0.95,
      yMin: 0.68,
      yMax: 0.73,
      sizeMin: 20,
      sizeMax: 34,
      heightMin: 2.2,
      heightMax: 3.2,
      depth: 0.22,
    });

    addPlants(8, {
      xMin: 0.24,
      xMax: 0.82,
      yMin: 0.71,
      yMax: 0.79,
      sizeMin: 39,
      sizeMax: 64,
      heightMin: 2.25,
      heightMax: 3.3,
      depth: 0.52,
    });

    addPlants(5, {
      xMin: 0.08,
      xMax: 0.52,
      yMin: 0.82,
      yMax: 0.94,
      sizeMin: 72,
      sizeMax: 112,
      heightMin: 2.1,
      heightMax: 3,
      depth: 1,
    });

    for (let index = 0; index < 130; index += 1) {
      const depth = index < 75 ? 0.45 : 1;
      this.grass.push({
        x: random(),
        y: mix(0.8, 1.04, random()),
        height: mix(38, 146, random()) * depth,
        width: mix(0.45, 1.2, random()) * depth,
        curve: mix(-0.22, 0.22, random()),
        phase: random() * TAU,
        depth,
        shade: random(),
      });
    }

    for (let index = 0; index < 84; index += 1) {
      this.pollen.push({
        x: random(),
        y: mix(0.18, 0.82, random()),
        size: mix(0.55, 2.1, random()),
        speed: mix(0.006, 0.026, random()),
        drift: mix(-0.003, 0.013, random()),
        phase: random() * TAU,
        alpha: mix(0.12, 0.58, random()),
      });
    }
  }

  paintBackground() {
    const ctx = this.backgroundContext;
    const width = this.width;
    const height = this.height;
    const horizon = height * 0.7;
    const random = mulberry32(198809);
    ctx.clearRect(0, 0, width, height);

    const sky = ctx.createLinearGradient(0, 0, width, height);
    sky.addColorStop(0, "#fbf6ee");
    sky.addColorStop(0.45, "#f2e9df");
    sky.addColorStop(0.74, "#e7e9dc");
    sky.addColorStop(1, "#d9e2d2");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);

    const sunrise = ctx.createRadialGradient(
      width * 0.73,
      height * 0.15,
      10,
      width * 0.73,
      height * 0.15,
      width * 0.54
    );
    sunrise.addColorStop(0, "rgba(255, 242, 192, 0.64)");
    sunrise.addColorStop(0.45, "rgba(239, 207, 151, 0.2)");
    sunrise.addColorStop(1, "rgba(238, 199, 195, 0)");
    ctx.fillStyle = sunrise;
    ctx.fillRect(0, 0, width, height);

    for (let index = 0; index < 38; index += 1) {
      const x = random() * width;
      const y = mix(horizon * 0.35, horizon * 1.15, random());
      const radiusX = mix(70, 270, random());
      const radiusY = mix(28, 94, random());
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(radiusX, radiusY);
      const wash = ctx.createRadialGradient(0, 0, 0.05, 0, 0, 1);
      if (index % 3 === 0) {
        wash.addColorStop(0, "rgba(226, 189, 190, 0.075)");
        wash.addColorStop(0.55, "rgba(226, 189, 190, 0.035)");
      } else {
        wash.addColorStop(0, "rgba(150, 170, 136, 0.06)");
        wash.addColorStop(0.55, "rgba(150, 170, 136, 0.025)");
      }
      wash.addColorStop(1, "rgba(240, 226, 207, 0)");
      ctx.fillStyle = wash;
      ctx.fillRect(-1, -1, 2, 2);
      ctx.restore();
    }

    this.paintDistantCanopy(ctx, horizon);

    const meadow = ctx.createLinearGradient(0, horizon - 50, 0, height);
    meadow.addColorStop(0, "rgba(174, 191, 155, 0.22)");
    meadow.addColorStop(0.5, "rgba(142, 164, 124, 0.24)");
    meadow.addColorStop(1, "rgba(104, 130, 94, 0.34)");
    ctx.fillStyle = meadow;
    ctx.beginPath();
    ctx.moveTo(0, horizon);
    for (let x = 0; x <= width; x += width / 8) {
      ctx.quadraticCurveTo(
        x + width / 16,
        horizon - Math.sin(x * 0.004) * 18,
        x + width / 8,
        horizon + Math.cos(x * 0.006) * 8
      );
    }
    ctx.lineTo(width, height);
    ctx.lineTo(0, height);
    ctx.closePath();
    ctx.fill();

    const path = ctx.createLinearGradient(width * 0.42, horizon, width * 0.68, height);
    path.addColorStop(0, "rgba(244, 227, 204, 0)");
    path.addColorStop(0.55, "rgba(244, 225, 200, 0.17)");
    path.addColorStop(1, "rgba(245, 221, 192, 0.28)");
    ctx.fillStyle = path;
    ctx.beginPath();
    ctx.moveTo(width * 0.52, horizon - 4);
    ctx.bezierCurveTo(
      width * 0.55,
      height * 0.8,
      width * 0.38,
      height * 0.94,
      width * 0.2,
      height
    );
    ctx.lineTo(width * 0.74, height);
    ctx.bezierCurveTo(
      width * 0.63,
      height * 0.88,
      width * 0.58,
      height * 0.8,
      width * 0.54,
      horizon - 4
    );
    ctx.closePath();
    ctx.fill();

    for (let index = 0; index < 74; index += 1) {
      const x = random() * width;
      const y = mix(horizon - 4, height, random());
      const length = mix(7, 34, random());
      ctx.strokeStyle =
        index % 4 === 0
          ? "rgba(238, 211, 189, 0.15)"
          : "rgba(104, 132, 94, 0.15)";
      ctx.lineWidth = mix(0.4, 1, random());
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x - length * 0.2, y - length * 0.6, x + length * 0.15, y - length);
      ctx.stroke();
    }

    ctx.save();
    ctx.globalAlpha = 0.09;
    ctx.fillStyle = "#7d7267";
    for (let index = 0; index < 820; index += 1) {
      const x = random() * width;
      const y = random() * height;
      ctx.fillRect(x, y, random() * 1.2 + 0.2, random() * 1.2 + 0.2);
    }
    ctx.restore();
  }

  paintDistantCanopy(ctx, horizon) {
    const width = this.width;
    const layers = [
      {
        color: "rgba(137, 154, 127, 0.12)",
        y: horizon - 36,
        scale: 1,
      },
      {
        color: "rgba(112, 136, 105, 0.14)",
        y: horizon - 6,
        scale: 0.82,
      },
    ];

    for (const layer of layers) {
      ctx.fillStyle = layer.color;
      ctx.beginPath();
      ctx.moveTo(0, horizon);
      const step = width / 18;
      for (let x = 0; x <= width + step; x += step) {
        const peak = layer.y - (10 + Math.abs(Math.sin(x * 0.0042)) * 34 * layer.scale);
        ctx.quadraticCurveTo(x - step * 0.52, layer.y - 12, x, peak);
        ctx.quadraticCurveTo(x - step * 0.12, layer.y + 10, x + step * 0.5, layer.y + 2);
      }
      ctx.lineTo(width, horizon + 24);
      ctx.lineTo(0, horizon + 24);
      ctx.closePath();
      ctx.fill();
    }
  }

  createPaperGrain() {
    const canvas = document.createElement("canvas");
    canvas.width = 180;
    canvas.height = 180;
    const ctx = canvas.getContext("2d");
    const image = ctx.createImageData(canvas.width, canvas.height);
    const random = mulberry32(33117);
    for (let index = 0; index < image.data.length; index += 4) {
      const shade = 98 + Math.floor(random() * 62);
      image.data[index] = shade;
      image.data[index + 1] = shade;
      image.data[index + 2] = shade;
      image.data[index + 3] = 20 + Math.floor(random() * 24);
    }
    ctx.putImageData(image, 0, 0);
    document.documentElement.style.setProperty(
      "--paper-grain",
      `url("${canvas.toDataURL("image/png")}")`
    );
  }

  createSprites() {
    this.outerPetalSprite = this.createPetalSprite(false);
    this.innerPetalSprite = this.createPetalSprite(true);
    this.outerHeadSprite = this.createPetalRingSprite(false);
    this.innerHeadSprite = this.createPetalRingSprite(true);
    this.diskSprite = this.createDiskSprite();
    this.pollenSprite = this.createPollenSprite();
  }

  createPetalSprite(inner) {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 284;
    const ctx = canvas.getContext("2d");
    const gradient = ctx.createLinearGradient(0, 284, 0, 0);
    if (inner) {
      gradient.addColorStop(0, "rgba(218, 137, 35, 0.98)");
      gradient.addColorStop(0.38, "rgba(244, 187, 48, 1)");
      gradient.addColorStop(0.78, "rgba(255, 220, 94, 1)");
      gradient.addColorStop(1, "rgba(217, 150, 44, 0.94)");
    } else {
      gradient.addColorStop(0, "rgba(195, 116, 37, 0.98)");
      gradient.addColorStop(0.36, "rgba(229, 165, 42, 1)");
      gradient.addColorStop(0.76, "rgba(246, 201, 68, 1)");
      gradient.addColorStop(1, "rgba(207, 139, 39, 0.95)");
    }
    ctx.fillStyle = gradient;
    ctx.strokeStyle = "rgba(157, 96, 31, 0.42)";
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(64, 284);
    ctx.bezierCurveTo(39, 220, 34, 105, 54, 12);
    ctx.quadraticCurveTo(64, 1, 74, 12);
    ctx.bezierCurveTo(94, 105, 89, 220, 64, 284);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = "rgba(176, 102, 28, 0.22)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(64, 270);
    ctx.quadraticCurveTo(57, 150, 64, 28);
    ctx.stroke();
    return canvas;
  }

  createPetalRingSprite(inner) {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext("2d");
    const sprite = inner ? this.innerPetalSprite : this.outerPetalSprite;
    const count = inner ? 16 : 18;
    const baseRadius = inner ? 54 : 48;
    const petalWidth = inner ? 98 : 116;
    const petalLength = inner ? 166 : 202;

    for (let index = 0; index < count; index += 1) {
      ctx.save();
      ctx.translate(256, 256);
      ctx.rotate(inner ? index * (TAU / count) + 0.14 : index * (TAU / count));
      ctx.translate(0, -baseRadius);
      ctx.scale(petalWidth / sprite.width, petalLength / sprite.height);
      ctx.drawImage(sprite, -sprite.width / 2, -sprite.height);
      ctx.restore();
    }
    return canvas;
  }

  createDiskSprite() {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");
    const disk = ctx.createRadialGradient(108, 102, 8, 128, 128, 128);
    disk.addColorStop(0, "rgba(145, 91, 48, 1)");
    disk.addColorStop(0.58, "rgba(105, 61, 38, 1)");
    disk.addColorStop(0.9, "rgba(73, 43, 29, 1)");
    disk.addColorStop(1, "rgba(51, 35, 25, 1)");
    ctx.fillStyle = disk;
    ctx.beginPath();
    ctx.arc(128, 128, 126, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = "rgba(83, 50, 29, 0.84)";
    ctx.lineWidth = 2.2;
    ctx.stroke();

    for (let index = 0; index < 62; index += 1) {
      const seedAngle = index * 2.399963;
      const seedRadius = Math.sqrt((index + 1) / 62) * 94;
      const seedX = 128 + Math.cos(seedAngle) * seedRadius;
      const seedY = 128 + Math.sin(seedAngle) * seedRadius;
      ctx.fillStyle =
        index % 3 === 0
          ? "rgba(214, 153, 70, 0.28)"
          : "rgba(42, 30, 24, 0.34)";
      ctx.beginPath();
      ctx.arc(seedX, seedY, index % 4 === 0 ? 2.1 : 1.5, 0, TAU);
      ctx.fill();
    }
    return canvas;
  }

  createPollenSprite() {
    const canvas = document.createElement("canvas");
    canvas.width = 48;
    canvas.height = 48;
    const ctx = canvas.getContext("2d");
    const glow = ctx.createRadialGradient(24, 24, 0, 24, 24, 24);
    glow.addColorStop(0, "rgba(255, 239, 174, 0.9)");
    glow.addColorStop(0.28, "rgba(235, 204, 123, 0.46)");
    glow.addColorStop(1, "rgba(235, 204, 123, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, 48, 48);
    return canvas;
  }

  updateState(state) {
    this.progress = state.progress;
    this.energy = state.energy;
    this.active = state.active;
    this.hands = state.hands || [];
  }

  render(timestamp, state) {
    this.updateState(state);
    this.time = timestamp / 1000;
    const delta = this.lastTimestamp
      ? clamp((timestamp - this.lastTimestamp) / 1000, 0, 0.05)
      : 0;
    this.lastTimestamp = timestamp;

    this.updateWindTrails(delta);
    this.updatePlants(delta);
    this.updatePollen(delta);

    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.drawImage(this.backgroundCanvas, 0, 0, this.width, this.height);
    this.drawLightWash(ctx);
    this.drawFarAtmosphere(ctx);

    const sortedPlants = [...this.plants].sort((a, b) => a.y - b.y || a.depth - b.depth);
    for (const plant of sortedPlants) {
      this.drawPlant(ctx, plant, "stems");
    }
    for (const plant of sortedPlants) {
      this.drawPlant(ctx, plant, "flowers");
    }

    this.drawGrasses(ctx);
    this.drawPollen(ctx);
    this.drawWind(ctx);
    this.drawForegroundMist(ctx);
  }

  updatePlants(delta) {
    for (const plant of this.plants) {
      if (this.finalizing) {
        plant.windBloom = Math.min(1, plant.windBloom + delta * 0.72);
        plant.windX *= Math.pow(0.08, delta);
        plant.windY *= Math.pow(0.08, delta);
        continue;
      }

      if (!this.active || !this.hands.length) {
        plant.windX *= Math.pow(0.12, delta);
        plant.windY *= Math.pow(0.12, delta);
        continue;
      }

      const headX = plant.x * this.width;
      const headY = plant.y * this.height - plant.height * 0.84;
      const wind = this.sampleWindAt(headX, headY);
      const canWake = this.progress >= 0.33 || plant.depth > 0.64;
      if (canWake && wind.strength > 0.015) {
        const gain = delta * (0.24 + this.energy * 1.22) * wind.strength;
        plant.windBloom = Math.min(1, plant.windBloom + gain);
        const smoothing = Math.min(1, delta * 7);
        plant.windX = mix(plant.windX, wind.x, smoothing);
        plant.windY = mix(plant.windY, wind.y, smoothing);
      } else {
        plant.windX *= Math.pow(0.2, delta);
        plant.windY *= Math.pow(0.2, delta);
      }
    }
  }

  sampleWindAt(x, y) {
    if (!this.hands.length) return { strength: 0, x: 0, y: 0 };
    const radius = this.width * (0.115 + smoothstep(0.35, 1, this.progress) * 0.065);
    let strength = 0;
    let directionX = 0;
    let directionY = 0;

    for (const hand of this.hands) {
      const handX = hand.x * this.width;
      const handY = hand.y * this.height;
      const dx = x - handX;
      const dy = y - handY;
      const distance = Math.max(1, Math.hypot(dx, dy));
      const influence = smoothstep(0, 1, clamp(1 - distance / radius));
      if (influence <= 0) continue;
      strength = Math.max(strength, influence);
      const speed = Math.hypot(hand.vx || 0, hand.vy || 0);
      if (speed > 0.003) {
        directionX += ((hand.vx || 0) / speed) * influence;
        directionY += ((hand.vy || 0) / speed) * influence;
      } else {
        directionX += (dx / distance) * influence * 0.45;
        directionY += (dy / distance) * influence * 0.45;
      }
    }

    if (this.hands.length > 1) {
      const first = this.hands[0];
      const second = this.hands[1];
      const x1 = first.x * this.width;
      const y1 = first.y * this.height;
      const x2 = second.x * this.width;
      const y2 = second.y * this.height;
      const vx = x2 - x1;
      const vy = y2 - y1;
      const lengthSquared = Math.max(1, vx * vx + vy * vy);
      const projection = clamp(((x - x1) * vx + (y - y1) * vy) / lengthSquared);
      const nearestX = x1 + vx * projection;
      const nearestY = y1 + vy * projection;
      const lineDistance = Math.hypot(x - nearestX, y - nearestY);
      const corridor = smoothstep(
        0,
        1,
        clamp(1 - lineDistance / (radius * 0.42))
      );
      if (corridor > strength * 0.78) {
        strength = corridor * 0.9;
        const avgVx = ((first.vx || 0) + (second.vx || 0)) * 0.5;
        const avgVy = ((first.vy || 0) + (second.vy || 0)) * 0.5;
        const speed = Math.hypot(avgVx, avgVy);
        if (speed > 0.003) {
          directionX = avgVx / speed;
          directionY = avgVy / speed;
        }
      }
    }

    const directionLength = Math.hypot(directionX, directionY);
    return {
      strength,
      x: directionLength > 0.001 ? directionX / directionLength : 0,
      y: directionLength > 0.001 ? directionY / directionLength : 0,
    };
  }

  getBloomCoverage() {
    if (!this.plants.length) return 0;
    return (
      this.plants.reduce((sum, plant) => sum + plant.windBloom, 0) /
      this.plants.length
    );
  }

  finalizeBloom() {
    this.finalizing = true;
  }

  setAllBlooms(value) {
    this.finalizing = false;
    for (const plant of this.plants) {
      plant.windBloom = clamp(value);
    }
  }

  resetBloom() {
    this.finalizing = false;
    this.trails = [];
    for (const plant of this.plants) {
      plant.windBloom = 0;
      plant.windX = 0;
      plant.windY = 0;
    }
  }

  drawLightWash(ctx) {
    const glow = smoothstep(0.12, 0.95, this.progress);
    const gradient = ctx.createRadialGradient(
      this.width * 0.62,
      this.height * 0.38,
      20,
      this.width * 0.62,
      this.height * 0.38,
      this.width * 0.44
    );
    gradient.addColorStop(0, `rgba(255, 244, 204, ${0.07 + glow * 0.09})`);
    gradient.addColorStop(0.5, `rgba(236, 198, 184, ${0.025 + glow * 0.035})`);
    gradient.addColorStop(1, "rgba(255, 247, 226, 0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, this.width, this.height);
  }

  drawFarAtmosphere(ctx) {
    const phase = this.time * 0.025;
    ctx.save();
    ctx.globalAlpha = 0.12 + smoothstep(0.35, 1, this.progress) * 0.03;
    ctx.fillStyle = "#f8eee7";
    for (let index = 0; index < 4; index += 1) {
      const x = ((phase + index * 0.27) % 1.35) * this.width - this.width * 0.15;
      const y = this.height * (0.27 + index * 0.105);
      ctx.beginPath();
      ctx.ellipse(x, y, this.width * 0.18, 34 + index * 12, -0.08, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  drawPlant(ctx, plant, layer) {
    const open = smoothstep(0.04, 0.96, plant.windBloom);
    const growth = 0.74 + smoothstep(0.01, 0.9, plant.windBloom) * 0.26;
    const baseX = plant.x * this.width;
    const baseY = plant.y * this.height;
    const plantHeight = plant.height * growth;
    const windSway =
      Math.sin(this.time * (0.65 + plant.depth * 0.22) + plant.seed) *
      (3.8 + this.energy * 27) *
      plant.depth +
      plant.windX * (12 + plant.windBloom * 52) * plant.depth;
    const handBend = this.getHandBend(baseX, baseY);
    const tipX =
      baseX +
      plant.lean * plantHeight +
      windSway +
      handBend * (0.72 + plant.depth * 0.55);
    const tipY = baseY - plantHeight;
    const controlX =
      baseX +
      plant.lean * plantHeight * 0.32 +
      windSway * 0.36 +
      handBend * (0.28 + plant.depth * 0.22);
    const controlY = baseY - plantHeight * 0.54;

    ctx.save();
    ctx.globalAlpha = 0.4 + plant.depth * 0.58;
    if (layer === "stems") {
      ctx.strokeStyle =
        plant.depth < 0.4
          ? "rgba(91, 118, 82, 0.38)"
          : "rgba(74, 105, 68, 0.72)";
      ctx.lineWidth = 0.9 + plant.depth * 1.45;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(baseX, baseY);
      ctx.bezierCurveTo(
        baseX + plant.lean * 22,
        baseY - plantHeight * 0.28,
        controlX,
        controlY,
        tipX,
        tipY
      );
      ctx.stroke();

      for (let index = 0; index < plant.leaves; index += 1) {
        const t = 0.16 + index * 0.16;
        const side = index % 2 === 0 ? -1 : 1;
        const leafX =
          baseX +
          (controlX - baseX) * t +
          plant.lean * plantHeight * t * 0.4;
        const leafY = baseY - plantHeight * t;
        const leafLength =
          plant.size * (0.4 + plant.depth * 0.25) * (1 - index * 0.05);
        this.drawLeaf(
          ctx,
          leafX,
          leafY,
          leafLength,
          side,
          plant.depth,
          plant.seed + index
        );
      }
      ctx.restore();
      return;
    }

    const stemAngle = Math.atan2(tipY - controlY, tipX - controlX) + Math.PI / 2;
    const stemAlpha = ctx.globalAlpha;
    ctx.globalAlpha = Math.max(stemAlpha, 0.96);
    this.drawSunflower(
      ctx,
      tipX,
      tipY,
      plant.size,
      open,
      stemAngle,
      plant.depth,
      plant.warmth,
      plant.seed
    );
    ctx.globalAlpha = stemAlpha;
    ctx.restore();
  }

  drawLeaf(ctx, x, y, length, side, depth, phase) {
    const sway =
      Math.sin(this.time * 0.8 + phase) * (2 + this.energy * 10) * depth;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(side * (0.72 + Math.sin(phase) * 0.08));
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(
      side * length * 0.08,
      -length * 0.34,
      side * length * 0.68,
      -length * 0.48 + sway,
      side * length * 0.98,
      sway
    );
    ctx.bezierCurveTo(
      side * length * 0.62,
      length * 0.28 + sway,
      side * length * 0.14,
      length * 0.28,
      0,
      0
    );
    ctx.fillStyle =
      depth > 0.65
        ? "rgba(83, 121, 68, 0.72)"
        : "rgba(102, 135, 84, 0.46)";
    ctx.fill();
    ctx.strokeStyle = "rgba(71, 99, 66, 0.26)";
    ctx.lineWidth = 0.65;
    ctx.beginPath();
    ctx.moveTo(side * 2, 0);
    ctx.quadraticCurveTo(
      side * length * 0.48,
      -length * 0.015,
      side * length * 0.86,
      sway * 0.7
    );
    ctx.stroke();
    ctx.restore();
  }

  drawSunflower(ctx, x, y, size, open, angle, depth, warmth, seed) {
    const breath = 1 + Math.sin(this.time * 1.1 + seed) * 0.008 * (0.2 + open);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle * (1 - open * 0.62));
    ctx.scale(breath, breath);

    if (open < 0.2) {
      this.drawSunflowerBud(ctx, size, open, depth, seed);
      ctx.restore();
      return;
    }

    if (open > 0.72) {
      const aura = ctx.createRadialGradient(0, 0, size * 0.1, 0, 0, size * 1.15);
      aura.addColorStop(0, `rgba(255, 229, 140, ${0.13 * open})`);
      aura.addColorStop(0.55, `rgba(231, 182, 78, ${0.06 * open})`);
      aura.addColorStop(1, "rgba(231, 182, 78, 0)");
      ctx.fillStyle = aura;
      ctx.beginPath();
      ctx.arc(0, 0, size * 1.15, 0, TAU);
      ctx.fill();
    }

    const diskRadius = size * mix(0.13, 0.31, open);
    const headScale = mix(0.38, 1, open);
    const headRadius = size * 1.06 * headScale;
    const headDrift = Math.sin(this.time * 0.8 + seed) * 0.018 * open;
    ctx.save();
    ctx.rotate(headDrift);
    ctx.drawImage(
      this.outerHeadSprite,
      -headRadius,
      -headRadius,
      headRadius * 2,
      headRadius * 2
    );
    ctx.rotate(0.045);
    ctx.drawImage(
      this.innerHeadSprite,
      -headRadius * 0.88,
      -headRadius * 0.88,
      headRadius * 1.76,
      headRadius * 1.76
    );
    ctx.restore();

    ctx.save();
    ctx.rotate(seed * 0.06);
    ctx.drawImage(
      this.diskSprite,
      -diskRadius,
      -diskRadius,
      diskRadius * 2,
      diskRadius * 2
    );
    ctx.restore();
    ctx.restore();
  }

  drawSunflowerBud(ctx, size, open, depth, seed) {
    const headRadius = size * (0.16 + open * 0.12);
    for (let index = 0; index < 9; index += 1) {
      ctx.save();
      ctx.rotate(index * (TAU / 9) + seed * 0.02);
      ctx.fillStyle = `rgba(213, 165, 57, ${0.38 + open * 0.35})`;
      ctx.beginPath();
      ctx.ellipse(
        0,
        -headRadius * 1.55,
        headRadius * 0.34,
        headRadius * 0.92,
        0,
        0,
        TAU
      );
      ctx.fill();
      ctx.restore();
    }

    const head = ctx.createRadialGradient(
      -headRadius * 0.22,
      -headRadius * 0.25,
      headRadius * 0.1,
      0,
      0,
      headRadius
    );
    head.addColorStop(0, "rgba(126, 153, 86, 0.92)");
    head.addColorStop(0.72, "rgba(91, 125, 72, 0.94)");
    head.addColorStop(1, "rgba(63, 91, 58, 0.9)");
    ctx.fillStyle = head;
    ctx.strokeStyle = "rgba(68, 94, 58, 0.54)";
    ctx.lineWidth = Math.max(0.5, depth * 0.85);
    ctx.beginPath();
    ctx.arc(0, 0, headRadius, 0, TAU);
    ctx.fill();
    ctx.stroke();
  }

  drawGrasses(ctx) {
    const sorted = [...this.grass].sort((a, b) => a.depth - b.depth || a.y - b.y);
    for (const blade of sorted) {
      const x = blade.x * this.width;
      const y = blade.y * this.height;
      const sway =
        Math.sin(this.time * 0.72 + blade.phase) *
          (3.5 + blade.depth * 6 + this.energy * 28) +
        this.getHandBend(x, y) * blade.depth;
      const tipX = x + blade.curve * blade.height + sway;
      const tipY = y - blade.height;
      ctx.strokeStyle =
        blade.shade > 0.62
          ? `rgba(90, 121, 79, ${0.15 + blade.depth * 0.28})`
          : `rgba(118, 145, 98, ${0.14 + blade.depth * 0.26})`;
      ctx.lineWidth = blade.width;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(
        x + blade.curve * blade.height * 0.25,
        y - blade.height * 0.55,
        tipX,
        tipY
      );
      ctx.stroke();
    }
  }

  updatePollen(delta) {
    const movement = this.active ? 1 : 0.18;
    for (const particle of this.pollen) {
      particle.x +=
        (particle.speed + this.energy * 0.018 * movement) * delta +
        Math.sin(this.time * 0.35 + particle.phase) * 0.00012;
      particle.y +=
        Math.sin(this.time * 0.55 + particle.phase) *
          0.004 *
          delta *
          movement +
        particle.drift * delta;
      if (particle.x > 1.03) particle.x = -0.02;
      if (particle.y < 0.12) particle.y = 0.84;
      if (particle.y > 0.88) particle.y = 0.16;
    }
  }

  drawPollen(ctx) {
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (const particle of this.pollen) {
      const x = particle.x * this.width;
      const y = particle.y * this.height;
      const alpha = particle.alpha * (0.48 + this.progress * 0.62);
      const radius = particle.size * (0.7 + this.progress * 0.45);
      const glowSize = radius * 8;
      ctx.globalAlpha = alpha;
      ctx.drawImage(
        this.pollenSprite,
        x - glowSize / 2,
        y - glowSize / 2,
        glowSize,
        glowSize
      );
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  getHandBend(x, y) {
    let bend = 0;
    for (const hand of this.hands) {
      const handX = hand.x * this.width;
      const handY = hand.y * this.height;
      const dx = x - handX;
      const dy = y - handY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const influence = clamp(1 - distance / (this.width * 0.38));
      bend +=
        influence * (hand.vx || 0) * 150 +
        Math.sign(dx) * influence * this.energy * 8;
    }
    return clamp(bend, -92, 92);
  }

  updateWindTrails(delta) {
    for (const trail of this.trails) {
      trail.life -= delta;
      trail.radius += delta * 12;
    }
    this.trails = this.trails.filter((trail) => trail.life > 0);

    for (const hand of this.hands) {
      const speed = Math.hypot(hand.vx || 0, hand.vy || 0);
      if (speed > 0.0025) {
        this.trails.push({
          x: hand.x,
          y: hand.y,
          life: 0.55,
          maxLife: 0.55,
          radius: 9 + Math.min(30, speed * 320),
          strength: clamp(speed * 4, 0.15, 1),
        });
      }
    }
    if (this.trails.length > 26) {
      this.trails.splice(0, this.trails.length - 26);
    }
  }

  drawWind(ctx) {
    if (!this.hands.length) return;
    ctx.save();
    ctx.globalCompositeOperation = "source-over";

    for (const trail of this.trails) {
      const x = trail.x * this.width;
      const y = trail.y * this.height;
      const alpha = (trail.life / trail.maxLife) * 0.026 * trail.strength;
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, trail.radius);
      gradient.addColorStop(0, `rgba(225, 176, 72, ${alpha})`);
      gradient.addColorStop(0.5, `rgba(211, 154, 67, ${alpha * 0.55})`);
      gradient.addColorStop(1, "rgba(211, 154, 67, 0)");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, y, trail.radius, 0, TAU);
      ctx.fill();
    }

    for (const hand of this.hands) {
      const x = hand.x * this.width;
      const y = hand.y * this.height;
      const pulse = 1 + Math.sin(this.time * 2.1 + (hand.seed || 0)) * 0.12;
      const aura = ctx.createRadialGradient(x, y, 0, x, y, 54 * pulse);
      aura.addColorStop(0, "rgba(246, 205, 111, 0.12)");
      aura.addColorStop(0.3, "rgba(210, 160, 74, 0.06)");
      aura.addColorStop(1, "rgba(210, 160, 74, 0)");
      ctx.fillStyle = aura;
      ctx.beginPath();
      ctx.arc(x, y, 54 * pulse, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = "rgba(119, 91, 56, 0.34)";
      ctx.lineWidth = 0.75;
      ctx.beginPath();
      ctx.arc(x, y, 9 * pulse, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = "rgba(247, 221, 150, 0.72)";
      ctx.beginPath();
      ctx.arc(x, y, 2.2, 0, TAU);
      ctx.fill();
    }

    if (this.hands.length > 1) {
      const first = this.hands[0];
      const second = this.hands[1];
      const x1 = first.x * this.width;
      const y1 = first.y * this.height;
      const x2 = second.x * this.width;
      const y2 = second.y * this.height;
      const distance = Math.hypot(x2 - x1, y2 - y1);
      const widthStrength = clamp(distance / (this.width * 0.42));
      ctx.strokeStyle = `rgba(193, 142, 62, ${0.04 + widthStrength * 0.055})`;
      ctx.lineWidth = 1;
      for (let strand = 0; strand < 3; strand += 1) {
        ctx.beginPath();
        const bow = (strand - 1) * 18;
        ctx.moveTo(x1, y1 + bow * 0.3);
        ctx.bezierCurveTo(
          mix(x1, x2, 0.3),
          y1 - 22 - bow,
          mix(x1, x2, 0.7),
          y2 + 18 + bow,
          x2,
          y2 + bow * 0.2
        );
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  drawForegroundMist(ctx) {
    const mist = ctx.createLinearGradient(0, this.height * 0.78, 0, this.height);
    mist.addColorStop(0, "rgba(245, 238, 226, 0)");
    mist.addColorStop(0.7, `rgba(245, 238, 226, ${0.045 + this.progress * 0.025})`);
    mist.addColorStop(1, "rgba(245, 238, 226, 0.12)");
    ctx.fillStyle = mist;
    ctx.fillRect(0, this.height * 0.78, this.width, this.height * 0.22);
  }
}
