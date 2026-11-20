const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");
const launchButton = document.querySelector("#launch");
const restartButton = document.querySelector("#restart");
const messageEl = document.querySelector("#message");
const levelEl = document.querySelector("#level");
const livesEl = document.querySelector("#lives");
const difficultyEl = document.querySelector("#difficulty");

const barrelEl = document.querySelector("#barrel");
const scoreEl = document.querySelector("#score");
const bestEl = document.querySelector("#best");
const highScoreKey = "BarrelAdventure.highScore";
let highScore = 0;
try {
  const saved = Number(localStorage.getItem(highScoreKey));
  if (Number.isSafeInteger(saved) && saved >= 0) highScore = saved;
} catch { /* Storage may be unavailable in private browsing. */ }

const W = canvas.width;
const H = canvas.height;
const groundY = 486;
const maxDifficulty = 8;
const playerRadius = 12;

let state;
let keys = new Set();
let lastTime = performance.now();

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function makeRng(seed) {
  let n = seed >>> 0;
  return () => {
    n = (n * 1664525 + 1013904223) >>> 0;
    return n / 4294967296;
  };
}

function angleTo(a, b) {
  return Math.atan2(b.y - a.y, b.x - a.x);
}

function launchPowerForDifficulty(difficulty) {
  return 650 + difficulty * 18;
}

function gravityForDifficulty(difficulty) {
  return 700 + difficulty * 12;
}

function solveLaunchAngle(from, to, power, gravity) {
  const dx = to.x - from.x;
  if (dx <= 0) return angleTo(from, to);

  const dy = from.y - to.y;
  const v2 = power * power;
  const root = v2 * v2 - gravity * (gravity * dx * dx + 2 * dy * v2);

  if (root < 0) {
    return -0.58;
  }

  const lowArc = Math.atan((v2 - Math.sqrt(root)) / (gravity * dx));
  return -clamp(lowArc, 0.18, 1.15);
}

function createLevel(level, runSeed) {
  const difficulty = Math.min(maxDifficulty, level);
  const rng = makeRng(runSeed + level * 92821 + difficulty * 4099);
  const width = W + (difficulty - 1) * 240;
  const barrelCount = 3 + difficulty;
  const barrels = [];
  const finish = { x: width - 42, y: 148, w: 18, h: groundY - 148 };
  let previousY = 292 - (rng() - 0.5) * 32;

  for (let i = 0; i < barrelCount; i += 1) {
    const t = barrelCount === 1 ? 0 : i / (barrelCount - 1);
    const x = 64 + t * (width - 224);
    const y = clamp(previousY - (rng() - 0.5) * 92, 178, 354);
    const moving = i > 0 && difficulty > 2 && rng() < 0.25 + difficulty * 0.07;
    previousY = y;

    barrels.push({
      x,
      baseY: y,
      y,
      radius: 30,
      moving,
      moveRange: moving ? 34 + rng() * 28 : 0,
      moveSpeed: moving ? 0.75 + difficulty * 0.11 + rng() * 0.35 : 0,
      moveOffset: rng() * Math.PI * 2,
      phase: rng() * Math.PI * 2,
      sweep: 0.24 + difficulty * 0.035,
      spinSpeed: 1.3 + difficulty * 0.16 + rng() * 0.5,
      angle: 0,
    });
  }

  const gates = [];
  const obstacles = [];
  for (let i = 0; i < Math.min(difficulty, barrelCount - 1); i += 1) {
    const upper = {};
    const lower = {};
    gates.push({ sourceIndex: i, targetIndex: i + 1,
      fraction: 0.42 + rng() * 0.16,
      openingHeight: Math.max(96, 184 - difficulty * 11),
      width: 24 + difficulty * 2, upper, lower });
    obstacles.push(upper, lower);
  }
  return { level, difficulty, width, barrels, gates, obstacles, finish };
}

function resetPlayerToBarrel(index = 0) {
  const barrel = state.levelData.barrels[index];
  state.currentBarrel = index;
  state.player = {
    x: barrel.x,
    y: barrel.y,
    vx: 0,
    vy: 0,
    launched: false,
  };
}

function startGame() {
  const runSeed = Math.floor(Math.random() * 4294967295);
  state = {
    lives: 5,
    score: 0,
    hasBeatenHighScore: false,
    nextExtraLifeScore: 1000,
    skippedBarrels: new Set(),
    runSeed,
    levelData: createLevel(1, runSeed),
    currentBarrel: 0,
    player: null,
    gameOver: false,
    levelFlash: 1,
    elapsed: 0,
    message: "Tap or press Space to launch",
  };
  resetPlayerToBarrel(0);
  updateBarrels();
  updateObstacles();
  updateHud();
}

function nextLevel(clearMessage) {
  const next = state.levelData.level + 1;
  state.levelData = createLevel(next, state.runSeed);
  state.levelFlash = 1;
  state.skippedBarrels.clear();
  state.message = clearMessage + (next > maxDifficulty ? " Max difficulty reached. Keep going." : "");
  resetPlayerToBarrel(0);
  updateBarrels();
  updateObstacles();
  updateHud();
}

function addPoints(points) {
  state.score += points;
  if (state.score > highScore) {
    highScore = state.score;
    state.hasBeatenHighScore = true;
    try { localStorage.setItem(highScoreKey, String(highScore)); } catch { /* Optional storage. */ }
  }
  let extraLives = 0;
  while (state.score >= state.nextExtraLifeScore) {
    state.lives += 1;
    extraLives += 1;
    state.nextExtraLifeScore += 1000;
  }
  updateHud();
  return extraLives;
}

function completeLevel() {
  const skipped = state.skippedBarrels.size;
  const points = 100 + skipped * 150;
  const extraLives = addPoints(points);
  window.playSound("levelClear");
  if (extraLives) window.playSound("extraLife");
  nextLevel(`Level clear! +${points} points.` +
    (skipped ? ` ${skipped} skipped barrel${skipped === 1 ? "" : "s"} scored.` : "") +
    (extraLives ? ` Extra life${extraLives === 1 ? "" : "s"} earned!` : ""));
}

function loseLife(reason, sound) {
  state.lives -= 1;
  updateHud();

  if (state.lives <= 0) {
    state.gameOver = true;
    state.player.launched = false;
    state.message = "Game over. Press R or tap Restart.";
    window.playSound("gameOver");
    return;
  }

  window.playSound(sound);
  state.skippedBarrels.clear();
  state.message = `${reason} Lives left: ${state.lives}.`;
  state.levelFlash = 0.85;
  resetPlayerToBarrel(0);
  updateHud();
}

function updateHud() {
  levelEl.textContent = state.levelData.level;
  livesEl.textContent = state.lives;
  difficultyEl.textContent = state.levelData.difficulty;
  barrelEl.textContent = `${state.currentBarrel + 1}/${state.levelData.barrels.length}`;
  scoreEl.textContent = state.score;
  bestEl.textContent = highScore;
  bestEl.classList.toggle("record-beaten", state.hasBeatenHighScore);
}

function targetForBarrel(index) {
  return (
    state.levelData.barrels[index + 1] ?? {
      x: state.levelData.finish.x + 30,
      y: groundY - 150,
    }
  );
}

function launch() {
  window.unlockAudio();
  if (state.gameOver) return;
  if (state.player.launched) return;

  const barrel = state.levelData.barrels[state.currentBarrel];
  const power = launchPowerForDifficulty(state.levelData.difficulty);
  state.player.launched = true;
  state.player.x =
    barrel.x + Math.cos(barrel.angle) * (barrel.radius + playerRadius);
  state.player.y =
    barrel.y + Math.sin(barrel.angle) * (barrel.radius + playerRadius);
  state.player.vx = Math.cos(barrel.angle) * power;
  state.player.vy = Math.sin(barrel.angle) * power;
  state.message = state.levelData.level === 1
    ? "Find the next barrel or the flag."
    : "";
  window.playSound("launch");
}

function updateBarrels() {
  const { barrels } = state.levelData;
  for (let i = 0; i < barrels.length; i += 1) {
    const barrel = barrels[i];
    if (barrel.moving) {
      barrel.y =
        barrel.baseY +
        Math.sin(state.elapsed * barrel.moveSpeed + barrel.moveOffset) *
          barrel.moveRange;
    }
    const desired = solveLaunchAngle(
      barrel,
      targetForBarrel(i),
      launchPowerForDifficulty(state.levelData.difficulty),
      gravityForDifficulty(state.levelData.difficulty),
    );
    barrel.angle =
      desired +
      Math.sin(state.elapsed * barrel.spinSpeed + barrel.phase) * barrel.sweep;
  }

  if (!state.player.launched) {
    const held = barrels[state.currentBarrel];
    state.player.x = held.x;
    state.player.y = held.y;
  }
}

function updateObstacles() {
  const { barrels, gates, difficulty } = state.levelData;
  const power = launchPowerForDifficulty(difficulty);
  const gravity = gravityForDifficulty(difficulty);
  for (const gate of gates) {
    const source = barrels[gate.sourceIndex];
    const target = barrels[gate.targetIndex];
    const angle = solveLaunchAngle(source, target, power, gravity);
    const muzzleX = source.x + Math.cos(angle) * (source.radius + playerRadius);
    const muzzleY = source.y + Math.sin(angle) * (source.radius + playerRadius);
    const x = source.x + (target.x - source.x) * gate.fraction;
    const time = (x - muzzleX) / Math.max(1, power * Math.cos(angle));
    const center = muzzleY + power * Math.sin(angle) * time + 0.5 * gravity * time * time;
    const upperEnd = center - gate.openingHeight / 2;
    const lowerStart = center + gate.openingHeight / 2;
    Object.assign(gate.upper, { x, drawY: 0, w: gate.width, h: Math.max(0, upperEnd) });
    Object.assign(gate.lower, { x, drawY: lowerStart, w: gate.width, h: Math.max(0, H + 120 - lowerStart) });
  }
}

function circleRectHit(circle, rect) {
  const closestX = clamp(circle.x, rect.x, rect.x + rect.w);
  const closestY = clamp(circle.y, rect.drawY, rect.drawY + rect.h);
  const dx = circle.x - closestX;
  const dy = circle.y - closestY;
  return dx * dx + dy * dy < playerRadius * playerRadius;
}

function updatePlayer(dt) {
  if (!state.player.launched || state.gameOver) return;

  const gravity = gravityForDifficulty(state.levelData.difficulty);
  state.player.vy += gravity * dt;
  state.player.x += state.player.vx * dt;
  state.player.y += state.player.vy * dt;

  for (let i = 0; i < state.levelData.barrels.length; i += 1) {
    if (i === state.currentBarrel) continue;
    const barrel = state.levelData.barrels[i];
    const dx = state.player.x - barrel.x;
    const dy = state.player.y - barrel.y;
    const hitDistance = barrel.radius + playerRadius + 8;
    if (dx * dx + dy * dy <= hitDistance * hitDistance) {
      resetPlayerToBarrel(i);
      updateHud();
      state.message = state.levelData.level === 1
        ? "Landed in a barrel. Tap or press Space."
        : "";
      window.playSound("land");
      return;
    }
  }

  for (let i = state.currentBarrel + 1; i < state.levelData.barrels.length; i += 1) {
    if (state.player.x > state.levelData.barrels[i].x) state.skippedBarrels.add(i);
  }

  // The finish line counts at any height, including above the viewport.
  if (state.player.x >= state.levelData.finish.x) {
    completeLevel();
    return;
  }

  for (const obstacle of state.levelData.obstacles) {
    if (circleRectHit(state.player, obstacle)) {
      loseLife("Obstacle hit.", "hit");
      return;
    }
  }

  if (
    state.player.y > H + 40 ||
    state.player.x < -40
  ) {
    loseLife("You fell.", "fall");
  }
}

function update(dt) {
  state.elapsed += dt;
  state.levelFlash = Math.max(0, state.levelFlash - dt * 1.4);
  updateBarrels();
  updateObstacles();
  updatePlayer(dt);
}

function drawSky() {
  const themes = [
    ["#7ad4fa", "#66a10d", "#4da140", "#ffd652"],
    ["#faab73", "#784d21", "#ab633d", "#ffe080"],
    ["#29336e", "#1a4738", "#1f2952", "#e8edff"],
    ["#73c2b8", "#2e7333", "#3d9461", "#fff094"],
  ];
  const themeIndex = (state.levelData.level - 1) % themes.length;
  const [sky, ground, hill, accent] = themes[themeIndex];
  const width = state.levelData.width;
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, H);
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(720, themeIndex === 2 ? 112 : 102, 36, 0, Math.PI * 2);
  ctx.fill();
  if (themeIndex === 2) {
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    for (let x = 90; x < width - 40; x += 96) {
      ctx.beginPath();
      ctx.arc(x, 160 - Math.abs(Math.sin(x * 0.037)) * 128, 2 + Math.abs(Math.sin(x)) * 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.fillStyle = hill;
  for (let x = -100; x < width + 120; x += 210) {
    ctx.beginPath();
    ctx.ellipse(x, groundY - 42 - Math.sin(x * 0.02) * 16, 150, 75, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = ground;
  ctx.fillRect(0, groundY, width, H - groundY);
  ctx.fillStyle = themeIndex === 2 ? "rgba(255,255,255,0.32)" : "rgba(255,255,255,0.82)";
  for (let x = 158 + (state.levelData.level % 3) * 42; x < width - 80; x += 310) {
    drawCloud(x, 110 - Math.sin(x * 0.03) * 42, 1);
  }
}

function drawCloud(x, y, scale) {
  ctx.beginPath();
  ctx.ellipse(x, y, 42 * scale, 18 * scale, 0, 0, Math.PI * 2);
  ctx.ellipse(
    x + 33 * scale,
    y + 4 * scale,
    32 * scale,
    15 * scale,
    0,
    0,
    Math.PI * 2,
  );
  ctx.ellipse(
    x - 30 * scale,
    y + 5 * scale,
    30 * scale,
    14 * scale,
    0,
    0,
    Math.PI * 2,
  );
  ctx.fill();
}

function drawFinish() {
  const f = state.levelData.finish;
  ctx.fillStyle = "#713f12";
  ctx.fillRect(f.x, f.y, 6, f.h);

  const rows = 6;
  const cols = 4;
  const cell = 12;
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      ctx.fillStyle = (x + y) % 2 === 0 ? "#f8fafc" : "#0f172a";
      ctx.fillRect(f.x + 6 + x * cell, f.y + y * cell, cell, cell);
    }
  }
}

function drawObstacles() {
  for (const obstacle of state.levelData.obstacles) {
    ctx.fillStyle = "#dc2626";
    ctx.fillRect(obstacle.x, obstacle.drawY, obstacle.w, obstacle.h);
  }
}

function drawBarrels() {
  for (let i = 0; i < state.levelData.barrels.length; i += 1) {
    const barrel = state.levelData.barrels[i];

    ctx.save();
    ctx.translate(barrel.x, barrel.y);
    ctx.rotate(barrel.angle);
    // The whole barrel aims along its length, with an open end on the right.
    const r = barrel.radius;
    ctx.beginPath();
    ctx.moveTo(-r, -r * 0.65);
    ctx.bezierCurveTo(-r * 0.4, -r, r * 0.4, -r, r, -r * 0.65);
    ctx.lineTo(r, r * 0.65);
    ctx.bezierCurveTo(r * 0.4, r, -r * 0.4, r, -r, r * 0.65);
    ctx.closePath();
    ctx.fillStyle =
      i === state.currentBarrel && !state.player.launched
        ? "#f59e0b"
        : "#b45309";
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#451a03";
    ctx.stroke();

    // Long wooden staves and hoops make the side-on silhouette readable.
    ctx.strokeStyle = "rgba(69, 26, 3, 0.55)";
    ctx.lineWidth = 2;
    for (const y of [-0.32, 0.32]) {
      ctx.beginPath();
      ctx.moveTo(-r, r * y);
      ctx.quadraticCurveTo(0, r * y * 1.5, r, r * y);
      ctx.stroke();
    }
    ctx.strokeStyle = "#64748b";
    ctx.lineWidth = 6;
    for (const x of [-0.65, 0.6]) {
      ctx.beginPath();
      ctx.moveTo(r * x, -r * 0.79);
      ctx.quadraticCurveTo(r * (x - 0.15), 0, r * x, r * 0.79);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.ellipse(r, 0, r * 0.22, r * 0.65, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#291507";
    ctx.fill();
    ctx.strokeStyle = "#94a3b8";
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.restore();

    if (i === state.currentBarrel && !state.player.launched) {
      ctx.fillStyle = "#ffd60a";
      ctx.fillRect(barrel.x - 19, barrel.y - 65, 38, 22);
      ctx.fillStyle = "#111827";
      ctx.font = "bold 14px system-ui";
      ctx.textAlign = "center";
      ctx.fillText("YOU", barrel.x, barrel.y - 49);
    }

  }
}

function drawPlayer() {
  if (!state.player.launched) return;

  ctx.beginPath();
  ctx.arc(state.player.x, state.player.y, playerRadius, 0, Math.PI * 2);
  ctx.fillStyle = "#2563eb";
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#eff6ff";
  ctx.stroke();

  ctx.fillStyle = "#eff6ff";
  ctx.beginPath();
  ctx.arc(state.player.x + 4, state.player.y - 4, 3, 0, Math.PI * 2);
  ctx.fill();
}

function drawOverlayFlash() {
  if (state.levelFlash <= 0) return;
  ctx.fillStyle = `rgba(255, 255, 255, ${state.levelFlash * 0.22})`;
  ctx.fillRect(0, 0, W, H);
}

function draw() {
  const cameraX = clamp(state.player.x + 120 - W / 2, 0, state.levelData.width - W);
  ctx.save();
  ctx.translate(-cameraX, 0);
  drawSky();
  drawFinish();
  drawObstacles();
  drawBarrels();
  drawPlayer();
  ctx.restore();
  drawOverlayFlash();
  messageEl.textContent = state.message;
}

function frame(now) {
  const dt = Math.min(0.033, (now - lastTime) / 1000);
  lastTime = now;
  update(dt);
  draw();
  requestAnimationFrame(frame);
}

window.addEventListener("keydown", (event) => {
  if (event.code === "Space") {
    event.preventDefault();
    if (!keys.has(event.code)) launch();
  }
  if (event.code === "KeyR" && state.gameOver) {
    startGame();
  }
  keys.add(event.code);
});

window.addEventListener("keyup", (event) => {
  keys.delete(event.code);
});

launchButton.addEventListener("click", launch);
canvas.addEventListener("pointerdown", launch);
restartButton.addEventListener("click", startGame);
window.addEventListener("blur", () => keys.clear());

startGame();
requestAnimationFrame(frame);
