// verify_fixes.js - automated verification for the audit report fixes
// Loads the real source files in a VM sandbox with a minimal DOM stub and
// exercises each reported defect. Run: node verify_fixes.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const { webcrypto } = require('crypto');

const ROOT = __dirname;
const results = [];
function test(id, name, fn) {
  try { fn(); results.push({ id, name, ok: true }); console.log('  PASS [' + id + '] ' + name); }
  catch (e) { results.push({ id, name, ok: false, err: e && e.stack || String(e) }); console.log('  FAIL [' + id + '] ' + name + '\n        ' + (e && e.message)); }
}
async function testAsync(id, name, fn) {
  try { await fn(); results.push({ id, name, ok: true }); console.log('  PASS [' + id + '] ' + name); }
  catch (e) { results.push({ id, name, ok: false, err: e && e.stack || String(e) }); console.log('  FAIL [' + id + '] ' + name + '\n        ' + (e && e.message)); }
}

// ---------- DOM / environment stubs ----------
let alerts = [];
let notifications = [];
let confirmReturn = true;
let promptReturn = 'replace';
let store = {};
let throwOnSet = false;
let setItemError = null;

const ctxStub = new Proxy({}, { get: (t, p) => { if (p in t) return t[p]; return () => {}; }, set: (t, p, v) => { t[p] = v; return true; } });

function makeEl() {
  const target = {
    value: '', textContent: '', innerHTML: '', className: '', placeholder: '', title: '',
    checked: false, disabled: false, files: [], dataset: {}, style: {},
    classList: { add() {}, remove() {}, contains() { return false; }, toggle() {} },
    addEventListener() {}, removeEventListener() {}, appendChild() {}, insertAdjacentHTML() {},
    after() {}, closest() { return null; }, querySelector() { return null; }, querySelectorAll() { return []; },
    focus() {}, click() {}, setAttribute() {}, getAttribute() { return null; },
    getBoundingClientRect() { return { left: 0, top: 0, width: 800, height: 400 }; },
    getContext() { return ctxStub; }
  };
  return new Proxy(target, {
    get(t, p) { if (p in t) return t[p]; return () => {}; },
    set(t, p, v) { t[p] = v; return true; }
  });
}
const elMap = new Map();
const documentStub = {
  getElementById(id) { if (!elMap.has(id)) elMap.set(id, makeEl()); return elMap.get(id); },
  querySelector() { return makeEl(); },
  querySelectorAll() { return []; },
  createElement() { return makeEl(); },
  addEventListener() {}, removeEventListener() {},
  documentElement: { lang: '' },
  body: makeEl()
};

let intervalId = 1;
const intervals = new Map();
function fakeSetInterval(fn, delay) { const id = intervalId++; intervals.set(id, { fn, delay }); return id; }
function fakeClearInterval(id) { intervals.delete(id); }
function activeIntervals() { return Array.from(intervals.keys()); }
function alertCount() { return alerts.length; }
function lastAlert() { return alerts[alerts.length - 1]; }
function showNotificationSpy() { return notifications; }

class DOMException extends Error {}

const sandbox = {
  document: documentStub,
  localStorage: {
    getItem(k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem(k, v) { if (throwOnSet) { const e = setItemError || new DOMException('QuotaExceededError'); throw e; } store[k] = String(v); },
    removeItem(k) { delete store[k]; },
    clear() { store = {}; }
  },
  console,
  alert(msg) { alerts.push(msg); },
  confirm() { return confirmReturn; },
  prompt() { return promptReturn; },
  setTimeout() { return 0; },
  clearTimeout() {},
  setInterval: fakeSetInterval,
  clearInterval: fakeClearInterval,
  structuredClone,
  TextEncoder: global.TextEncoder,
  TextDecoder: global.TextDecoder,
  crypto: webcrypto,
  btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
  atob: (s) => Buffer.from(s, 'base64').toString('binary'),
  DOMException,
  Blob: class Blob { constructor(parts) { this.parts = parts; } },
  URL: { createObjectURL() { return 'blob:x'; }, revokeObjectURL() {} },
  FileReader: class FileReader {},
  navigator: { language: 'zh-CN' },
  requestAnimationFrame() { return 0; },
  cancelAnimationFrame() {},
  addEventListener() {}, removeEventListener() {},
  location: { hash: '', href: 'http://localhost/' }
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;

vm.createContext(sandbox);

// Load in the same order as index.html, then retrieve the bindings we need.
const files = ['stockData.js', 'crypto.js', 'achievements.js', 'locales/zh-CN.js', 'locales/en-US.js', 'i18n.js', 'game.js'];
let combined = files.map(f => '//@@FILE ' + f + '\n' + fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n;\n');
combined += '\n;globalThis.__exports = { Crypto, StockPool, AchievementSystem, I18n, StockSimulator, sanitizeUserData, sanitizeSaveData, isValidUsername, isValidPasswordHash, debugLog };';
combined += '\n;StockSimulator.prototype.init = function(){};';
vm.runInContext(combined, sandbox, { filename: 'bundle.js' });

const X = sandbox.__exports;
X.I18n.init();

function newGame() {
  const g = new X.StockSimulator();
  g.showNotification = function (msg, type) { notifications.push({ msg, type }); };
  g.marketInterval = null;
  g.users = Object.create(null);
  return g;
}

function baseSave(over) {
  return Object.assign({
    id: 's1', createdAt: Date.now(), fund: 1000000, initialFund: 1000000,
    holdings: {}, records: [], watchlist: [], achievements: [],
    settings: { buyFee: 0.0003, sellFee: 0.0013, t0Mode: false, tradeUnit: 1 },
    dayTrades: {},
    gameStats: { tradeCount: 0, profitCount: 0, lossCount: 0, maxHoldings: 0, sectorsTraded: new Set(), dayTrades: 0 },
    autoTrade: { enabled: false, paused: false, configs: [], stats: {}, records: [] }
  }, over || {});
}

console.log('\n=== Stock Simulator fix verification ===\n');

// ---------------- P0-3 ----------------
(async () => {
  await testAsync('P0-3', 'modern PBKDF2 hash passes import sanitization', async () => {
    const modern = await X.Crypto.hashAsync('secret123');
    assert.ok(/^\$/.test(modern) === false && modern.startsWith('pbkdf2-sha256-100k$'), 'hash shape');
    assert.strictEqual(X.isValidPasswordHash(modern), true, 'isValidPasswordHash(modern)');
    X.sanitizeUserData({ username: 'alice', passwordHash: modern }); // must not throw
  });
  await testAsync('P0-3', 'legacy hash still accepted', async () => {
    assert.strictEqual(X.isValidPasswordHash('deadbeef'), true);
    X.sanitizeUserData({ username: 'bob', passwordHash: 'deadbeef' });
  });
  await testAsync('P0-3', '8-hex WebCrypto-fallback derived hash accepted', async () => {
    const fb = X.Crypto.HASH_VERSION + '$' + 'ab'.repeat(16) + '$' + 'deadbeef';
    assert.strictEqual(X.isValidPasswordHash(fb), true);
  });
  test('P0-3', 'garbage hash rejected', () => {
    assert.strictEqual(X.isValidPasswordHash('not-a-hash!!'), false);
    assert.throws(() => X.sanitizeUserData({ username: 'bob', passwordHash: 'not-a-hash!!' }), /Invalid password hash/);
  });

  // ---------------- P1-6 ----------------
  test('P1-6', 'updateStockList reference removed, renderStockList exists', () => {
    const src = fs.readFileSync(path.join(ROOT, 'game.js'), 'utf8');
    assert.ok(!/this\.updateStockList\s*\(/.test(src), 'no this.updateStockList call');
    assert.strictEqual(typeof X.StockSimulator.prototype.renderStockList, 'function');
  });

  // ---------------- P1-7 ----------------
  test('P1-7', 'reserved usernames rejected by sanitizer and validator', () => {
    for (const n of ['__proto__', 'constructor', 'prototype', 'hasOwnProperty', 'toString']) {
      assert.strictEqual(X.isValidUsername(n), false, n);
      assert.throws(() => X.sanitizeUserData({ username: n, passwordHash: 'deadbeef' }), /Invalid username characters/);
    }
    assert.strictEqual(X.isValidUsername('normalUser'), true);
    assert.throws(() => X.sanitizeUserData({ username: 'bad name', passwordHash: 'deadbeef' }), /Invalid username characters/);
  });
  test('P1-7', 'loadUsers cannot be prototype-hijacked (null-prototype dict)', () => {
    store = {};
    const payload = JSON.stringify({ __proto__: { marker: 'INJECTED' }, alice: { username: 'alice', saves: [] } });
    store['stock_simulator_users'] = X.Crypto.encrypt(payload);
    const g = newGame(); g.loadUsers();
    assert.strictEqual(Object.getPrototypeOf(g.users), null, 'users has null prototype');
    assert.strictEqual(g.users.marker, undefined, 'no inherited marker');
    assert.ok(g.users.alice, 'legit user still loaded');
  });
  test('P1-7', 'register source enforces charset + reserved list', () => {
    const src = fs.readFileSync(path.join(ROOT, 'game.js'), 'utf8');
    assert.ok(/USERNAME_PATTERN\.test\(username\) \|\| RESERVED_USERNAMES\.has\(username\)/.test(src), 'register validation present');
  });

  // ---------------- P1-8 ----------------
  test('P1-8', 'startAutoTrade does not stack intervals', () => {
    const g = newGame();
    intervals.clear();
    g.currentSave = baseSave();
    g.currentUser = { username: 'u', saves: [g.currentSave] };
    g.autoTrade.configs = [{ code: '600519', direction: 'buy' }];
    g.updateAutoTradeStatus = function () {};
    g.checkAutoTradeCondition = function () {};
    confirmReturn = true;
    g.startAutoTrade();
    g.startAutoTrade();
    assert.strictEqual(activeIntervals().length, 1, 'exactly one auto-trade interval after two starts');
  });
  test('P1-8', 'showSaveSelect stops all timers', () => {
    const g = newGame();
    intervals.clear();
    g.marketInterval = fakeSetInterval(() => {}, 1000);
    g.autoTrade.interval = fakeSetInterval(() => {}, 1000);
    g.showScreen = function () {}; g.renderSaveList = function () {};
    g.showSaveSelect();
    assert.strictEqual(activeIntervals().length, 0, 'all timers cleared');
    assert.strictEqual(g.marketInterval, null);
    assert.strictEqual(g.autoTrade.interval, null);
  });
  test('P1-8', 'loadSave twice leaves a single auto-trade interval', () => {
    const g = newGame();
    intervals.clear();
    const save = baseSave({ autoTrade: { enabled: true, paused: false, configs: [{ code: '600519', direction: 'buy' }], stats: {}, records: [] } });
    g.currentUser = { username: 'u', saves: [save], refreshRate: 1000, theme: 'dark' };
    g.currentSaveIndex = 0;
    // stub out all DOM-heavy / side-effecting collaborators
    g.cancelSkip = function () {};
    g.initMarketData = function () {};
    g.showScreen = function () {};
    g.updateAutoTradeStatus = function () {};
    g.renderStockList = function () {};
    g.selectStock = function () {};
    g.startMarketSimulation = function () {};
    g.updateTradeAvailable = function () {};
    g.renderAutoTradeStockList = function () {};
    g.updateAutoTradeStats = function () {};
    g.onAutoTradeDirectionChange = function () {};
    g.updateProfile = function () {};
    g.startTutorial = function () {};
    g.loadSave(0);
    const first = activeIntervals().slice();
    g.loadSave(0);
    assert.strictEqual(activeIntervals().length, 1, 'one interval after reload, active=' + activeIntervals().length);
    assert.ok(!first.includes(-1));
  });
  test('P1-8', 'loadSave restores refreshRate before creating timer', () => {
    const g = newGame();
    intervals.clear();
    const save = baseSave({ autoTrade: { enabled: true, paused: false, configs: [{ code: '600519', direction: 'buy' }], stats: {}, records: [] } });
    g.currentUser = { username: 'u', saves: [save], refreshRate: 777, theme: 'dark' };
    g.currentSaveIndex = 0;
    g.cancelSkip = function () {}; g.initMarketData = function () {}; g.showScreen = function () {};
    g.updateAutoTradeStatus = function () {}; g.renderStockList = function () {}; g.selectStock = function () {};
    g.startMarketSimulation = function () {}; g.updateTradeAvailable = function () {}; g.renderAutoTradeStockList = function () {};
    g.updateAutoTradeStats = function () {}; g.onAutoTradeDirectionChange = function () {}; g.updateProfile = function () {}; g.startTutorial = function () {};
    g.loadSave(0);
    const id = activeIntervals()[0];
    assert.strictEqual(intervals.get(id).delay, 777, 'interval uses current refresh rate');
  });

  // ---------------- P1-9 ----------------
  test('P1-9', 'no duplicate codes and lookup paths agree', () => {
    const codes = X.StockPool.map(s => s.code);
    const dups = codes.filter((c, i) => codes.indexOf(c) !== i);
    assert.strictEqual(dups.length, 0, 'no duplicates: ' + dups.join(','));
    const g = newGame();
    g.initMarketData();
    const viaFind = X.StockPool.find(s => s.code === '300144');
    const viaMap = g._stockPoolByCode.get('300144');
    assert.strictEqual(viaFind.industry, viaMap.industry, 'industry consistent across lookup paths');
    assert.strictEqual(g.stockData.size, new Set(codes).size, 'stockData has no duplicate keys');
  });

  // ---------------- P1-10 ----------------
  test('P1-10', 'saveUsers returns true on success / false on quota error', () => {
    store = {}; throwOnSet = false;
    const g = newGame();
    g.users = { a: { username: 'a' } };
    assert.strictEqual(g.saveUsers(), true);
    throwOnSet = true;
    notifications = [];
    assert.strictEqual(g.saveUsers(), false);
    assert.ok(notifications.some(n => /storage|存储/i.test(n.msg)), 'failure notification emitted');
    throwOnSet = false;
  });
  test('P1-10', 'loadUsers backs up corrupted storage and does not overwrite', () => {
    store = {}; alerts = [];
    store['stock_simulator_users'] = 'corrupted-garbage';
    const g = newGame();
    g.loadUsers();
    assert.strictEqual(Object.getPrototypeOf(g.users), null);
    assert.ok(alerts.some(a => /损坏|corrupt/i.test(String(a))), 'corruption alert shown');
    const backups = Object.keys(store).filter(k => k.startsWith('stock_simulator_users_corrupted_backup_'));
    assert.strictEqual(backups.length, 1, 'raw data backed up');
    assert.strictEqual(store['stock_simulator_users'], 'corrupted-garbage', 'original not overwritten');
    alerts = [];
  });
  test('P1-10', 'loadUsers restores valid data with null prototype', () => {
    store = {};
    store['stock_simulator_users'] = X.Crypto.encrypt(JSON.stringify({ alice: { username: 'alice', saves: [], tutorialCompleted: true, theme: 'dark', refreshRate: 3000 } }));
    const g = newGame(); alerts = [];
    g.loadUsers();
    assert.ok(g.users.alice);
    assert.strictEqual(Object.getPrototypeOf(g.users), null);
  });
  test('P1-10', 'clone/restore snapshot preserves Set and deep state', () => {
    const g = newGame();
    const save = baseSave();
    save.gameStats.sectorsTraded = new Set(['银行', '医药']);
    const snap = g.cloneSaveData(save);
    save.fund = 5;
    save.gameStats.sectorsTraded.add('科技');
    g.currentSave = save;
    g.currentUser = { username: 'u', saves: [save] };
    g.users = { u: g.currentUser };
    g.currentSaveIndex = 0;
    g.restoreSaveSnapshot(snap);
    assert.strictEqual(g.currentSave.fund, 1000000, 'fund restored');
    assert.ok(g.currentSave.gameStats.sectorsTraded instanceof Set, 'Set preserved');
    assert.strictEqual(g.currentSave.gameStats.sectorsTraded.size, 2, 'Set contents restored');
    assert.strictEqual(g.currentUser.saves[0], g.currentSave, 'user slot updated');
  });
  test('P1-10', 'executeTrade rolls back when persistence fails', () => {
    const g = newGame();
    g.currentSave = baseSave();
    g.currentUser = { username: 'u', saves: [g.currentSave] };
    g.users = { u: g.currentUser };
    g.currentSaveIndex = 0;
    elMap.clear();
    documentStub.getElementById('buy-code').value = '600519';
    documentStub.getElementById('buy-price').value = '100';
    documentStub.getElementById('buy-quantity').value = '100';
    g.validateTradeParameters = () => ({ valid: true, stock: { code: '600519', name: '贵州茅台' } });
    g.executeBuyTrade = () => { g.currentSave.fund -= 1234; return { success: true }; };
    g.recordTrade = () => { g.currentSave.records.push({ type: 'buy', code: '600519' }); };
    g.updateAfterTrade = () => {};
    g.checkAchievements = () => {};
    g.saveUsers = () => false;
    alerts = [];
    g.executeTrade('buy');
    assert.strictEqual(g.currentSave.fund, 1000000, 'fund rolled back');
    assert.strictEqual(g.currentSave.records.length, 0, 'records rolled back');
    assert.ok(g.currentUser.saves[0].fund === 1000000, 'user slot rolled back');
    assert.ok(alerts.some(a => /回滚|rolled back/i.test(String(a))), 'rollback alert');
  });
  test('P1-10', 'executeTrade succeeds normally when persistence works', () => {
    const g = newGame();
    g.currentSave = baseSave();
    g.currentUser = { username: 'u', saves: [g.currentSave] };
    g.currentSaveIndex = 0;
    elMap.clear();
    documentStub.getElementById('buy-code').value = '600519';
    documentStub.getElementById('buy-price').value = '100';
    documentStub.getElementById('buy-quantity').value = '100';
    g.validateTradeParameters = () => ({ valid: true, stock: { code: '600519', name: '贵州茅台' } });
    g.executeBuyTrade = () => { g.currentSave.fund -= 1234; return { success: true }; };
    g.recordTrade = () => { g.currentSave.records.push({ type: 'buy', code: '600519' }); };
    g.updateAfterTrade = () => {};
    g.checkAchievements = () => {};
    g.saveUsers = () => true;
    alerts = [];
    g.executeTrade('buy');
    assert.strictEqual(g.currentSave.fund, 998766, 'fund debited');
    assert.strictEqual(g.currentSave.records.length, 1, 'record kept');
    assert.ok(alerts.some(a => /成功/i.test(String(a))), 'success alert');
  });

  // ---------------- P2-8 ----------------
  test('P2-8', 'O(n^2) slice+filter scan removed', () => {
    const src = fs.readFileSync(path.join(ROOT, 'game.js'), 'utf8').replace(/\/\/[^\n]*/g, '');
    assert.ok(!/records\.slice\(index \+ 1\)\.filter/.test(src), 'no per-record slice/filter scan');
    assert.ok(/futureLimitUpByCode/.test(src) && /futureLimitDownByCode/.test(src), 'O(n) maps present');
  });
  test('P2-8', 'calculateSaveStats lucky/unlucky matches reference algorithm', () => {
    const g = newGame();
    g.calculateStockValue = () => 0;
    function reference(records) {
      let lucky = 0, unlucky = 0;
      records.forEach((record, index) => {
        const sd = g.stockData.get(record.code);
        if (!sd) return;
        if (record.type !== 'buy') return;
        const after = records.slice(index + 1).filter(r => r.code === record.code);
        for (const a of after) { if (g.limitManager.isLimitUp(a.price, sd.prevClose)) { lucky++; break; } }
        for (const a of after) { if (g.limitManager.isLimitDown(a.price, sd.prevClose)) { unlucky++; break; } }
      });
      return { lucky, unlucky };
    }
    // deterministic pseudo-random datasets
    let seed = 42;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    for (const trial of [0, 1, 2]) {
      const codes = ['AAA', 'BBB', 'CCC'];
      codes.forEach(code => {
        const prev = 10 + rnd() * 40;
        g.stockData.set(code, { code, prevClose: prev, price: prev });
      });
      const records = [];
      for (let i = 0; i < 40; i++) {
        const code = codes[Math.floor(rnd() * codes.length)];
        const sd = g.stockData.get(code);
        const roll = rnd();
        let price = sd.prevClose * (1 + (rnd() - 0.5) * 0.1);
        if (roll > 0.9) price = g.limitManager.calculateLimitUpPrice(sd.prevClose);
        else if (roll < 0.1) price = g.limitManager.calculateLimitDownPrice(sd.prevClose);
        records.push({ type: rnd() > 0.5 ? 'buy' : 'sell', code, price, quantity: 100, amount: -1000, pnl: 0, time: Date.now() });
      }
      g.currentSave = baseSave({ records });
      const stats = g.calculateSaveStats();
      const ref = reference(records);
      assert.strictEqual(stats.luckyTrades, ref.lucky, 'trial ' + trial + ' lucky');
      assert.strictEqual(stats.unluckyTrades, ref.unlucky, 'trial ' + trial + ' unlucky');
    }
  });

  // ---------------- P2-9 ----------------
  test('P2-9', 'DEBUG_LOG off and all console.log gated behind debugLog', () => {
    const src = fs.readFileSync(path.join(ROOT, 'game.js'), 'utf8');
    assert.strictEqual(sandbox.__exports.debugLog === undefined ? false : (sandbox.DEBUG_LOG === undefined), true);
    assert.strictEqual(vm.runInContext('DEBUG_LOG', sandbox), false, 'DEBUG_LOG is false');
    const defs = (src.match(/console\.log\(/g) || []).length;
    assert.strictEqual(defs, 1, 'exactly one console.log (inside debugLog), found ' + defs);
    const logs = [];
    const savedConsole = sandbox.console;
    sandbox.console = { log: (...a) => logs.push(a), error() {} };
    vm.runInContext('debugLog("should not print")', sandbox);
    sandbox.console = savedConsole;
    assert.strictEqual(logs.length, 0, 'debugLog silent when disabled');
  });

  // ---------------- P2-10 ----------------
  test('P2-10', 'selection zoom redraws both K-line and volume', () => {
    const g = newGame();
    let k = 0, v = 0;
    g.drawKLine = () => { k++; };
    g.drawVolume = () => { v++; };
    g.selectedStock = { code: '600519' };
    g.stockData.set('600519', { price: 10 });
    g.chartRenderParams = { padding: 40, chartWidth: 600, startIndex: 0, endIndex: 60, visibleCount: 60 };
    g.chartState.selectionStart = { x: 100, y: 10 };
    g.chartState.selectionEnd = { x: 400, y: 200 };
    g.handleSelectionZoom();
    assert.strictEqual(k, 1, 'drawKLine called');
    assert.strictEqual(v, 1, 'drawVolume called');
  });

  // ---------------- P2-11 ----------------
  test('P2-11', 'zero pinch distance does not poison scaleX with NaN', () => {
    const g = newGame();
    g.selectedStock = { code: '600519' };
    g.stockData.set('600519', { price: 10 });
    g.chartState.scaleX = 1;
    g.chartState.pinchStartScale = 1;
    g.chartState.pinchStartDistance = 0;
    let draws = 0; g.drawKLine = () => { draws++; };
    const sameTouch = { touches: [{ clientX: 5, clientY: 5 }, { clientX: 5, clientY: 5 }], preventDefault() {}, target: { getBoundingClientRect: () => ({ left: 0, top: 0 }) } };
    g.onChartTouchMove(sameTouch);
    assert.ok(!Number.isNaN(g.chartState.scaleX), 'scaleX is not NaN');
    assert.strictEqual(g.chartState.scaleX, 1, 'scaleX unchanged');
  });
  test('P2-11', 'normal pinch still updates scaleX', () => {
    const g = newGame();
    g.selectedStock = { code: '600519' };
    g.stockData.set('600519', { price: 10 });
    g.chartState.scaleX = 1;
    g.chartState.pinchStartScale = 1;
    g.chartState.pinchStartDistance = 100;
    g.drawKLine = () => {};
    const ev = { touches: [{ clientX: 0, clientY: 0 }, { clientX: 200, clientY: 0 }], preventDefault() {}, target: { getBoundingClientRect: () => ({ left: 0, top: 0 }) } };
    g.onChartTouchMove(ev);
    assert.strictEqual(g.chartState.scaleX, 2, 'scale doubled');
  });

  // ---------------- i18n ----------------
  test('i18n', 'new/used keys exist in both locales', () => {
    const zh = sandbox.ZH_CN, en = sandbox.EN_US;
    for (const k of ['auth.regError.generic', 'auth.regError.usernameInvalidChars', 'trade.saveFailedRollback', 'load.dataCorrupted']) {
      assert.ok(Object.prototype.hasOwnProperty.call(zh, k), 'zh missing ' + k);
      assert.ok(Object.prototype.hasOwnProperty.call(en, k), 'en missing ' + k);
    }
  });
  test('i18n', 'every I18n.t() key literal exists in locale files', () => {
    const codeFiles = ['game.js', 'achievements.js', 'i18n.js', 'crypto.js'];
    const keys = new Set();
    for (const f of codeFiles) {
      const src = fs.readFileSync(path.join(ROOT, f), 'utf8')
        .split('\n').map(line => line.replace(/\/\/.*$/, '')).join('\n');
      const re = /I18n\.t\(\s*['"\`]([^'"\`]+)['"\`]/g;
      let m;
      while ((m = re.exec(src))) keys.add(m[1]);
    }
    const zh = sandbox.ZH_CN;
    const missing = [...keys].filter(k => !k.includes('${') && !Object.prototype.hasOwnProperty.call(zh, k));
    assert.strictEqual(missing.length, 0, 'missing zh keys: ' + missing.join(', '));
  });

  // ---------------- Auto-trade audit fixes (report round 2) ----------------
  function autoDeps(g, save) {
    g.currentSave = save;
    g.currentUser = { username: 'u', saves: [save] };
    g.users = { u: g.currentUser };
    g.currentSaveIndex = 0;
    g.saveUsers = () => true;
    g.updateTradeAvailable = () => {};
    g.updatePortfolio = () => {};
    g.checkAchievements = () => {};
    g.updateAutoTradeStatus = () => {};
    g.updateAutoTradeStats = () => {};
    return g;
  }

  test('P1-auto', 'paused game time freezes auto trade (no real-clock trading)', () => {
    const g = newGame();
    g.currentSave = baseSave();
    g.autoTrade.enabled = true;
    g.autoTrade.paused = false;
    g.autoTrade.configs = [{ code: '600519', direction: 'buy', conditionType: 'time', quantity: 100, priceType: 'market', name: '贵州茅台' }];
    g.stockData.set('600519', { code: '600519', price: 100, prevClose: 100 });
    let calls = 0;
    g.executeAutoTrade = () => { calls++; };
    g.gameTimePaused = true;      // still inside the 9:30-11:30 window
    g.checkAutoTradeCondition();
    assert.strictEqual(calls, 0, 'must not trade while game time is paused');
    g.gameTimePaused = false;
    g.checkAutoTradeCondition();
    assert.strictEqual(calls, 1, 'trades again once resumed');
  });

  test('P1-auto', 'pause/resume does not reset maxTrades / cooldown counters', () => {
    const g = newGame();
    autoDeps(g, baseSave());
    g.autoTrade.enabled = true;
    g.autoTrade.stockTradeCounts = { '600519-buy': 1 };
    g.autoTrade.lastTradeTimes = { '600519-buy': 12345 };
    g.autoTrade.interval = null;
    g.pauseAutoTrade();   // pause
    g.pauseAutoTrade();   // resume
    assert.strictEqual(g.autoTrade.stockTradeCounts['600519-buy'], 1, 'maxTrades counter survives pause/resume');
    assert.strictEqual(g.autoTrade.lastTradeTimes['600519-buy'], 12345, 'cooldown survives pause/resume');
    if (g.autoTrade.interval) { clearInterval(g.autoTrade.interval); g.autoTrade.interval = null; }
  });

  test('P1-auto', 'loadSave restores risk-control counters (no bypass by switching saves)', () => {
    const g = newGame();
    intervals.clear();
    const save = baseSave({ autoTrade: { enabled: false, paused: false, configs: [], stats: {}, records: [], stockTradeCounts: { '600519-buy': 2 }, lastTradeTimes: { '600519-buy': 999 }, maxTotalTrades: 37 } });
    g.currentUser = { username: 'u', saves: [save], refreshRate: 1000, theme: 'dark' };
    g.currentSaveIndex = 0;
    g.cancelSkip = function () {}; g.initMarketData = function () {}; g.showScreen = function () {};
    g.updateAutoTradeStatus = function () {}; g.renderStockList = function () {}; g.selectStock = function () {};
    g.startMarketSimulation = function () {}; g.updateTradeAvailable = function () {}; g.renderAutoTradeStockList = function () {};
    g.updateAutoTradeStats = function () {}; g.onAutoTradeDirectionChange = function () {}; g.updateProfile = function () {}; g.startTutorial = function () {};
    g.loadSave(0);
    assert.strictEqual(g.autoTrade.stockTradeCounts['600519-buy'], 2, 'stockTradeCounts restored');
    assert.strictEqual(g.autoTrade.lastTradeTimes['600519-buy'], 999, 'lastTradeTimes restored');
    assert.strictEqual(g.autoTrade.maxTotalTrades, 37, 'maxTotalTrades restored');
  });

  test('P1-auto', 'maxTrades cannot be bypassed by pause/resume', () => {
    const g = newGame();
    autoDeps(g, baseSave({ fund: 1000000 }));
    g._stockPoolByCode = new Map([['600519', { code: '600519', name: '贵州茅台', industry: '白酒' }]]);
    g.stockData.set('600519', { code: '600519', price: 100, prevClose: 100 });
    const config = { code: '600519', name: '贵州茅台', direction: 'buy', conditionType: 'time', quantity: 100, priceType: 'market', maxTrades: 1 };
    g.executeAutoTrade(config);
    assert.strictEqual(g.autoTrade.stockTradeCounts['600519-buy'], 1, 'first trade counted');
    const fundAfterFirst = g.currentSave.fund;
    g.autoTrade.interval = setInterval(() => {}, 1000);
    g.pauseAutoTrade();
    g.pauseAutoTrade();
    if (g.autoTrade.interval) { clearInterval(g.autoTrade.interval); g.autoTrade.interval = null; }
    g.executeAutoTrade(config);
    assert.strictEqual(g.autoTrade.stockTradeCounts['600519-buy'], 1, 'second trade still blocked by maxTrades');
    assert.strictEqual(g.currentSave.fund, fundAfterFirst, 'no extra trade after resume');
  });

  test('P2-auto', 'auto-trade buy updates gameStats.maxHoldings (achievements/statistics)', () => {
    const g = newGame();
    autoDeps(g, baseSave({ fund: 100000000 }));
    const codes = [];
    const pool = [];
    for (let i = 0; i < 5; i++) {
      const code = '60' + String(1000 + i);
      g.stockData.set(code, { code, price: 10, prevClose: 10 });
      pool.push([code, { code, name: 'S' + i, industry: '行业' + i }]);
      codes.push(code);
    }
    g._stockPoolByCode = new Map(pool);
    for (const code of codes) {
      g.executeAutoTrade({ code, name: 'S', direction: 'buy', conditionType: 'time', quantity: 100, priceType: 'market' });
    }
    assert.strictEqual(Object.keys(g.currentSave.holdings).length, 5, 'five holdings opened');
    assert.strictEqual(g.currentSave.gameStats.maxHoldings, 5, 'maxHoldings tracks auto-trade holdings');
  });

  test('P2-auto', 'global trade cap notifies once and shows a distinct status', () => {
    const g = newGame();
    autoDeps(g, baseSave());
    g.stockData.set('600519', { code: '600519', price: 100, prevClose: 100 });
    g.autoTrade.enabled = true;
    g.autoTrade.stats.totalTrades = 100;   // default global cap
    g.updateAutoTradeStatus = X.StockSimulator.prototype.updateAutoTradeStatus.bind(g);
    notifications = [];
    const config = { code: '600519', direction: 'buy', conditionType: 'time', quantity: 100, priceType: 'market', name: '贵州茅台' };
    g.executeAutoTrade(config);
    g.executeAutoTrade(config);
    assert.strictEqual(notifications.filter(n => /上限|limit/i.test(n.msg)).length, 1, 'cap notice emitted exactly once');
    const el = documentStub.getElementById('auto-trade-status-text');
    assert.strictEqual(el.textContent, X.I18n.t('auto.statusLimitReached'), 'distinct limit status rendered');
    g.setAutoTradeMaxTotal(250);
    assert.strictEqual(g.autoTrade.maxTotalTrades, 250, 'global limit is configurable');
    assert.strictEqual(g.currentSave.autoTrade.maxTotalTrades, 250, 'configured limit persisted to save');
  });

  test('P2-auto', 'remaining quota is rendered in the stats panel', () => {
    const g = newGame();
    g.currentSave = baseSave();
    g.autoTrade.stats.totalTrades = 30;
    g.autoTrade.maxTotalTrades = 100;
    g.autoTrade.records = [];
    g.updateAutoTradeStats();
    const el = documentStub.getElementById('auto-remaining-trades');
    assert.strictEqual(el.textContent, '70 / 100');
  });

  test('P2-auto', 'resetAutoTradeConfig no longer crashes on an undefined method', () => {
    const g = newGame();
    autoDeps(g, baseSave());
    g.renderAutoTradeStockList = () => {};
    g.updateAutoTradeStatus = () => {};
    confirmReturn = true;
    assert.strictEqual(g.resetAutoTradeConfig(), true);
  });

  // ---------- summary ----------
  const failed = results.filter(r => !r.ok);
  console.log('\n=== Summary ===');
  console.log('  total: ' + results.length + ', passed: ' + (results.length - failed.length) + ', failed: ' + failed.length);
  if (failed.length) {
    console.log('\nFAILURES:');
    failed.forEach(f => console.log('  [' + f.id + '] ' + f.name + '\n' + f.err));
    process.exitCode = 1;
  } else {
    console.log('  ALL CHECKS PASSED');
  }
})();
