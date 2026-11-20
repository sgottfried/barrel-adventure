const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
function game(blockStorage = false) {
  const elements = new Map();
  const draws = [];
  const drawing = new Proxy({}, { get: (_, name) => (...args) => draws.push([name, ...args]), set: () => true });
  const storage = new Map();
  const context = vm.createContext({
    document: { querySelector(id) {
      if (!elements.has(id)) elements.set(id, { width: 960, height: 540,
        getContext: () => drawing, addEventListener() {}, classList: { toggle() {} } });
      return elements.get(id);
    } },
    window: { addEventListener() {}, playSound() {}, unlockAudio() {} },
    localStorage: {
      getItem: key => { if (blockStorage) throw Error('blocked'); return storage.get(key) ?? null; },
      setItem: (key, value) => { if (blockStorage) throw Error('blocked'); storage.set(key, value); },
    },
    performance: { now: () => 0 }, requestAnimationFrame() {},
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../game.js'), 'utf8'), context);
  return { run: code => vm.runInContext(code, context), storage, elements, draws };
}
test('level size, barrel counts, deterministic generation and gate geometry', () => {
  const { run } = game();
  for (let level = 1; level <= 12; level++) {
    const difficulty = Math.min(8, level);
    assert.equal(run(`createLevel(${level}, 123).width`), 960 + (difficulty - 1) * 240);
    assert.equal(run(`createLevel(${level}, 123).barrels.length`), 3 + difficulty);
    assert.equal(run(`JSON.stringify(createLevel(${level}, 123)) === JSON.stringify(createLevel(${level}, 123))`), true);
    run(`state.levelData = createLevel(${level}, 123); resetPlayerToBarrel(); update(0.016)`);
    assert.equal(run('state.levelData.gates.every(g => Math.abs(g.lower.drawY - g.upper.h - g.openingHeight) < 1e-8)'), true);
    assert.equal(run('state.levelData.obstacles.every(o => Number.isFinite(o.drawY) && o.h >= 0)'), true);
  }
});
test('score, skipped barrels, multiple extra lives and persistent best', () => {
  const { run, storage } = game();
  run('state.skippedBarrels.add(1); state.skippedBarrels.add(2); completeLevel()');
  assert.equal(run('state.score'), 400);
  assert.equal(run('state.levelData.level'), 2);
  assert.equal(run('state.skippedBarrels.size'), 0);
  assert.equal(run('addPoints(1700)'), 2);
  assert.equal(run('state.lives'), 7);
  assert.equal(storage.get('BarrelAdventure.highScore'), '2100');
  run('startGame()');
  assert.equal(run('state.score'), 0);
  assert.equal(run('highScore'), 2100);
  assert.equal(run('state.hasBeatenHighScore'), false);
});
test('life loss clears pending skips and game over prevents launch', () => {
  const { run } = game();
  run('state.skippedBarrels.add(2); loseLife("hit", "hit")');
  assert.equal(run('state.skippedBarrels.size'), 0);
  assert.equal(run('state.lives'), 4);
  assert.equal(run('state.currentBarrel'), 0);
  run('state.lives = 1; loseLife("hit", "hit"); launch()');
  assert.equal(run('state.gameOver && !state.player.launched'), true);
});
test('above-screen flight survives and finish counts at any height', () => {
  const { run } = game();
  run('state.player = { x: 100, y: -100, vx: 0, vy: 0, launched: true }; updatePlayer(0)');
  assert.equal(run('state.lives'), 5);
  run('state.player.x = state.levelData.finish.x; updatePlayer(0)');
  assert.equal(run('state.levelData.level'), 2);
  assert.equal(run('state.score'), 550);
});
test('landing updates HUD, camera scrolls and drawing restores its transform', () => {
  const { run, elements, draws } = game();
  run('state.player = { ...state.levelData.barrels[1], vx: 0, vy: 0, launched: true }; updatePlayer(0)');
  assert.equal(run('state.currentBarrel'), 1);
  assert.equal(elements.get('#barrel').textContent, '2/4');
  run('state.levelData = createLevel(8, 123); resetPlayerToBarrel(10); update(0); draw()');
  assert.ok(draws.some(([name, x]) => name === 'translate' && x === -1680));
  assert.equal(draws.filter(d => d[0] === 'save').length, draws.filter(d => d[0] === 'restore').length);
});
test('unavailable storage does not prevent playing or scoring', () => {
  const { run } = game(true);
  run('addPoints(1000); startGame(); launch()');
  assert.equal(run('state.player.launched'), true);
  assert.equal(run('highScore'), 1000);
});
