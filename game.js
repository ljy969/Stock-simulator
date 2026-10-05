// 股市模拟器主程序

// 涨跌停管理器类
class LimitManager {
    constructor() {
        this.limitUpPercent = 0.10;  // 涨停幅度 10%
        this.limitDownPercent = 0.10; // 跌停幅度 10%
        // P2-1 Fix: previous threshold (0.20 = 20%) was unreachable because prices are
        // already clamped to +/-10% by the daily price limit. The circuit breaker is
        // meant to detect abnormal single-tick volatility (e.g. a fat-finger or stale
        // data spike), so use a threshold based on per-tick move instead of intraday
        // move vs prevClose.
        // Bug-fix note: the ordinary per-tick band is only +/-2% (+3% for the easter-egg
        // stock), so a 5% threshold could still never fire. updateMarket() now injects a
        // rare +/-4%~7% "flash" move (p ~= 0.1% per tick) which this threshold catches,
        // making the documented circuit breaker a real (and rare) event instead of dead code.
        this.circuitBreakerThreshold = 0.05; // 5% per-tick move (was 20% intraday)
        this.circuitBreakerCooldown = 3; // 熔断冷却周期数
        this.circuitBreakerStatus = new Map(); // 记录每只股票的熔断状态
    }

    // 计算涨停价（精确到分）
    calculateLimitUpPrice(prevClose) {
        const limitUp = prevClose * (1 + this.limitUpPercent);
        return this.roundToTick(limitUp);
    }

    // 计算跌停价（精确到分）
    calculateLimitDownPrice(prevClose) {
        const limitDown = prevClose * (1 - this.limitDownPercent);
        return this.roundToTick(limitDown);
    }

    // 精确到分（0.01元）
    roundToTick(price) {
        return Math.round(price * 100) / 100;
    }

    // 检查价格是否在涨跌停范围内
    isPriceWithinLimits(price, prevClose) {
        const limitUp = this.calculateLimitUpPrice(prevClose);
        const limitDown = this.calculateLimitDownPrice(prevClose);
        return price >= limitDown && price <= limitUp;
    }

    // 检查是否涨停
    isLimitUp(price, prevClose) {
        const limitUp = this.calculateLimitUpPrice(prevClose);
        return Math.abs(price - limitUp) < 0.005;
    }

    // 检查是否跌停
    isLimitDown(price, prevClose) {
        const limitDown = this.calculateLimitDownPrice(prevClose);
        return Math.abs(price - limitDown) < 0.005;
    }

    // 限制价格在涨跌停范围内
    clampPrice(price, prevClose) {
        const limitUp = this.calculateLimitUpPrice(prevClose);
        const limitDown = this.calculateLimitDownPrice(prevClose);
        return Math.min(Math.max(price, limitDown), limitUp);
    }

    // 检查是否需要熔断
    // P2-1 Fix: judge based on the per-tick move (price vs prevPrice) rather than the
    // per-day move (price vs prevClose). The per-day move is bounded by the +/-10%
    // limit, so the previous comparison (threshold 0.20) could never fire.
    checkCircuitBreaker(code, price, prevPrice) {
        if (!prevPrice || prevPrice <= 0) return false;
        const change = Math.abs((price - prevPrice) / prevPrice);
        if (change >= this.circuitBreakerThreshold) {
            return true;
        }
        return false;
    }

    // 触发熔断
    triggerCircuitBreaker(code) {
        this.circuitBreakerStatus.set(code, {
            triggered: true,
            cooldown: this.circuitBreakerCooldown
        });
    }

    // 检查熔断状态
    isCircuitBreakerActive(code) {
        const status = this.circuitBreakerStatus.get(code);
        if (!status) return false;
        return status.triggered && status.cooldown > 0;
    }

    // 更新熔断冷却
    updateCircuitBreakerCooldown(code) {
        const status = this.circuitBreakerStatus.get(code);
        if (status && status.cooldown > 0) {
            status.cooldown--;
            if (status.cooldown <= 0) {
                status.triggered = false;
            }
        }
    }

    // 重置熔断状态（交易日切换时）
    resetCircuitBreaker(code) {
        this.circuitBreakerStatus.delete(code);
    }
}

// P1-2 Fix: round to 2 decimals (cents) to prevent IEEE754 float drift on money.
// Naive `Math.round(n * 100) / 100` has the classic JS bug where 1.005 * 100 is
// actually 100.49999999999999, so it rounds down to 1.00 instead of 1.01. We use
// sign-aware epsilon to nudge borderline values in the right direction.
//
// P0-2 Fix: a non-finite input used to be silently coerced to 0. That turned any
// upstream NaN/Infinity contamination (e.g. a blank fee input) into a deterministic
// fund wipe-out while the UI still looked normal. Money helpers must "shout", not
// "swallow": report the bad value and return it unchanged so callers can detect it.
function round2(n) {
    if (typeof n !== 'number' || !isFinite(n)) {
        console.error('[round2] 收到非有限金额，拒绝静默归零:', n);
        return n;
    }
    const sign = n < 0 ? -1 : 1;
    return Math.round((n + sign * Number.EPSILON) * 100) / 100;
}

// Return true when `code` is a valid 6-digit stock code that exists in the pool.
// Used by the import sanitizer to reject holdings/trades for stocks the game does
// not know about (which would later crash the portfolio renderer).
function isKnownStockCode(code) {
    if (typeof code !== 'string' || !/^\d{6}$/.test(code)) return false;
    if (typeof StockPool === 'undefined' || !Array.isArray(StockPool)) return true;
    return StockPool.some(s => s && s.code === code);
}

// L9 Fix: normalise a user-typed stock code. Trim surrounding whitespace and convert
// full-width digits/letters (common when typing with a Chinese IME) to ASCII so that
// lookups and searches still match. Returns '' for empty input.
// #16 Fix: one save carries a full market snapshot (~80KB once encoded), so a handful of
// saves can exhaust the ~5MB localStorage quota and then *every* write fails. Cap the
// list and warn before the quota is reached instead of silently losing all saves.
const MAX_SAVES_PER_USER = 50;
const STORAGE_WARN_BYTES = 4 * 1024 * 1024;
// Round-3 fix: unified money ceiling for imported saves. The new-game screen only
// caps the STARTING funds at 10000万, so a save that is played well can legitimately
// grow past 10亿. The old 1e9 ceiling therefore treated honest exports as tampered
// data and silently reset them to 100万 (a 25亿 save came back as 1,000,000 with a
// fake -99% return). The ceiling now only rejects values that are impossible in real
// play (1e15), while still stopping fund: 1e308 payloads from flowing into
// total-asset math and money formatting.
const MAX_SAVE_FUND = 1e15;

function normalizeStockCode(value) {
    if (value === null || value === undefined) return '';
    let s = String(value);
    // U+3000 ideographic space and regular spaces/tabs
    s = s.replace(/\u3000/g, ' ').trim();
    // Full-width ASCII range U+FF01..U+FF5E maps to U+0021..U+007E
    s = s.replace(/[\uFF01-\uFF5E]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));
    return s.trim();
}

// S2 Fix: deterministic PRNG (mulberry32). The market's base prices and K-line
// history used to be re-randomised on every load; deriving them from a per-save seed
// keeps the chart history stable across reloads while staying tiny in storage.
// Intraday movement still uses Math.random but its result (the price) is persisted.
function makeRng(seed) {
    let a = (Number(seed) || 0) >>> 0;
    return function () {
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// Per-stock K-line reset: each stock needs a seed of its own so one stock can be
// re-rolled without disturbing the others. FNV-1a gives a stable uint32 for a code.
function hashStringToSeed(str) {
    let h = 0x811c9dc5;
    const s = String(str);
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
}

// Combine the per-save seed with a stock code and an optional reset salt. salt === 0
// means "never reset", which is the state every stock starts in.
function deriveStockSeed(seed, code, salt) {
    return (hashStringToSeed(code) ^ (Number(seed) || 0) ^ ((Number(salt) || 0) >>> 0)) >>> 0;
}

// Rehydrate a persisted `sectorsTraded` value. Accepts a Set, an array (the format
// saveUsers() now writes) or the legacy `{sector: true}` dictionary. Anything else
// yields an empty Set rather than throwing.
function normalizeSectorsTraded(value) {
    let list = [];
    if (value instanceof Set) {
        list = Array.from(value);
    } else if (Array.isArray(value)) {
        list = value;
    } else if (value && typeof value === 'object') {
        list = Object.keys(value).filter(k => value[k] === true);
    }
    return new Set(list.filter(s => typeof s === 'string' && s.length > 0 && s.length <= 32));
}

// Serialize the users dictionary for localStorage. `JSON.stringify` turns a Set into
// `{}`, which silently dropped gameStats.sectorsTraded on every save; this replacer
// converts Sets to arrays so the data survives a round-trip.
function serializeUsersData(users) {
    return JSON.stringify(users, (key, value) => value instanceof Set ? Array.from(value) : value);
}

// P0-1 Fix: HTML escape utility to prevent XSS when rendering user-controlled data via innerHTML
function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value).replace(/[&<>"']/g, function (c) {
        return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
}

// Report fix #2: a save name made of whitespace only (legacy data predating the trim)
// used to pass the 1-20 char check and render as an invisible blank row in the save
// list. Trim the name on display and fall back to the localized default ("存档 N" /
// "Save N") when nothing remains, so every row always shows a readable name.
function displaySaveName(save, index) {
    const raw = (save && typeof save.name === 'string') ? save.name.trim() : '';
    return raw !== '' ? raw : I18n.t('save.defaultName', { index: index + 1 });
}

// P2-9 Fix: gate business/debug logging behind one flag. High-frequency paths
// (per-tick portfolio refresh, auto-trade condition checks) used to print holdings
// and P&L detail on every tick, costing I/O and exposing the player's strategy.
// Set to true locally when debugging.
const DEBUG_LOG = false;
function debugLog(...args) {
    if (DEBUG_LOG) console.log(...args);
}

// P1-7 Fix: reserved property names that must never be accepted as a username.
// Assigning this.users['__proto__'] triggers the inherited accessor and replaces
// the prototype of the users dictionary; 'constructor'/'hasOwnProperty'/... are
// likewise unsafe object keys.
const RESERVED_USERNAMES = new Set([
    '__proto__', 'constructor', 'prototype',
    'hasOwnProperty', 'toString', 'valueOf', '__defineGetter__', '__defineSetter__'
]);

// P1-7 Fix: single source of truth for the username character whitelist, shared by
// sanitizeUserData() (import path) and register() (auth path).
const USERNAME_PATTERN = /^[\u4e00-\u9fa5a-zA-Z0-9_\-]+$/;

function isValidUsername(name) {
    return typeof name === 'string'
        && name.length >= 2 && name.length <= 20
        && USERNAME_PATTERN.test(name)
        && !RESERVED_USERNAMES.has(name);
}

// P0-3 Fix: derive the accepted modern hash shape from Crypto.HASH_VERSION instead of
// hard-coding it, so a future KDF upgrade does not silently break import again. The
// derived part allows 8-64 hex chars because Crypto.hashAsync() falls back to a short
// legacy-derived value when Web Crypto is unavailable.
function isValidPasswordHash(hash) {
    if (typeof hash !== 'string') return false;
    if (/^[0-9a-f]{1,16}$/.test(hash)) return true; // legacy single-pass hash
    const version = (typeof Crypto !== 'undefined' && Crypto.HASH_VERSION) ? String(Crypto.HASH_VERSION) : '';
    if (!version) return false;
    const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp('^' + escaped + '\\$[0-9a-f]{32}\\$[0-9a-f]{8,64}$').test(hash);
}

// P0-1 Fix: Sanitize import data to reject malformed/malicious payloads
function sanitizeUserData(raw) {
    if (!raw || typeof raw !== 'object') throw new Error('Invalid data');
    if (typeof raw.username !== 'string' || raw.username.length < 2 || raw.username.length > 20) {
        throw new Error('Invalid username');
    }
    // Username whitelist: letters, digits, Chinese, underscore, hyphen (mirrors register() validation)
    if (!USERNAME_PATTERN.test(raw.username) || RESERVED_USERNAMES.has(raw.username)) {
        throw new Error('Invalid username characters');
    }
    // P2-5 Fix: exports no longer carry passwordHash. A missing/invalid hash is not
    // fatal for an import: importSave() asks the user to set a fresh password instead.
    if (!isValidPasswordHash(raw.passwordHash)) {
        raw.passwordHash = null;
    }
    if (!Array.isArray(raw.saves)) raw.saves = [];
    if (!Array.isArray(raw.achievements)) raw.achievements = [];
    if (typeof raw.createdAt !== 'number' || !isFinite(raw.createdAt)) raw.createdAt = Date.now();
    if (typeof raw.tutorialCompleted !== 'boolean') raw.tutorialCompleted = false;
    if (typeof raw.theme !== 'string' || !['dark', 'light', 'festival'].includes(raw.theme)) raw.theme = 'dark';
    if (typeof raw.refreshRate !== 'number' || !isFinite(raw.refreshRate) || raw.refreshRate <= 0) raw.refreshRate = 3000;
    if (typeof raw.lang !== 'string' || !['zh-CN', 'en-US'].includes(raw.lang)) raw.lang = 'zh-CN';
    return raw;
}

// #14 Fix: validate the persisted live-market snapshot. Imported backups used to lose
// `market`/`marketSeed` entirely, so an import re-randomised every price (e.g. Maotai
// 1036.97 -> 1925.88) and reset the game clock. Only finite, non-negative scalars and
// known stock codes survive; anything malformed is dropped, never trusted.
function sanitizeMarketState(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
    const out = {};
    const nonNegInt = (v) => {
        const n = Number(v);
        return Number.isFinite(n) && n >= 0 ? Math.floor(n) : undefined;
    };
    const gt = raw.gameTime;
    if (gt && typeof gt === 'object') {
        const hour = Number(gt.hour), minute = Number(gt.minute);
        if (Number.isFinite(hour) && Number.isFinite(minute)) {
            out.gameTime = {
                hour: ((hour | 0) % 24 + 24) % 24,
                minute: ((minute | 0) % 60 + 60) % 60,
                manualSet: !!gt.manualSet,
                dayIndex: nonNegInt(gt.dayIndex) || 0
            };
        }
    }
    ['lastTradingDayIndex', 'marketTickCount', 'tradingDayCount'].forEach(k => {
        const v = nonNegInt(raw[k]);
        if (v !== undefined) out[k] = v;
    });
    if (typeof raw.gameTimePaused === 'boolean') out.gameTimePaused = raw.gameTimePaused;

    if (raw.historySeeds && typeof raw.historySeeds === 'object' && !Array.isArray(raw.historySeeds)) {
        const seeds = {};
        Object.entries(raw.historySeeds).slice(0, 2000).forEach(([code, v]) => {
            if (isKnownStockCode(code) && Number.isFinite(Number(v))) seeds[code] = Number(v) >>> 0;
        });
        if (Object.keys(seeds).length) out.historySeeds = seeds;
    }

    if (raw.stocks && typeof raw.stocks === 'object' && !Array.isArray(raw.stocks)) {
        const scalarKeys = ['price', 'prevClose', 'open', 'high', 'low', 'volume', 'dailyVolume', 'prevDailyVolume', 'avgVolume'];
        const barKeys = ['open', 'close', 'high', 'low', 'volume'];
        const stocks = {};
        Object.entries(raw.stocks).slice(0, 2000).forEach(([code, s]) => {
            if (!isKnownStockCode(code) || !s || typeof s !== 'object') return;
            const entry = {};
            scalarKeys.forEach(k => {
                const n = Number(s[k]);
                if (Number.isFinite(n) && n >= 0) entry[k] = n;
            });
            if (s.lastBar && typeof s.lastBar === 'object') {
                const bar = {};
                barKeys.forEach(k => {
                    const n = Number(s.lastBar[k]);
                    if (Number.isFinite(n) && n >= 0) bar[k] = n;
                });
                if (Object.keys(bar).length) entry.lastBar = bar;
            }
            if (Object.keys(entry).length) stocks[code] = entry;
        });
        out.stocks = stocks;
    }
    return out;
}

// P0-1 Fix: Validate a single save object to reject malicious content
function sanitizeSaveData(raw) {
    if (!raw || typeof raw !== 'object') throw new Error('Invalid save');
    const save = {};
    save.id = typeof raw.id === 'string' ? raw.id : (Crypto && Crypto.uuid ? Crypto.uuid() : Date.now().toString());
    save.createdAt = typeof raw.createdAt === 'number' && isFinite(raw.createdAt) ? raw.createdAt : Date.now();
    // Round-3 fix: enforce the money ceiling on imported saves (see MAX_SAVE_FUND).
    // Only values past the (very loose) ceiling are rejected; a rejected fund falls
    // back to a valid initialFund rather than 100万, so a corrupt number can no longer
    // fabricate a -99% return on an otherwise healthy save.
    const rawInitialFund = Number.isFinite(raw.initialFund) && raw.initialFund > 0 && raw.initialFund <= MAX_SAVE_FUND
        ? Number(raw.initialFund) : null;
    save.fund = Number.isFinite(raw.fund) && raw.fund >= 0 && raw.fund <= MAX_SAVE_FUND
        ? Number(raw.fund) : (rawInitialFund !== null ? rawInitialFund : 1000000);
    // P1-3b Fix: initialFund must be positive AND finite. The old Number.isFinite(0)
    // check let 0 through, making the portfolio divide by zero ("Infinity%").
    save.initialFund = rawInitialFund !== null ? rawInitialFund : save.fund;
    // Report fix #2: trim before validating, so a whitespace-only name ("   ") can no
    // longer slip through the 1-20 char check and later render as a blank row. An
    // empty result falls back to the default name at render time (displaySaveName).
    const trimmedSaveName = (typeof raw.name === 'string') ? raw.name.trim() : '';
    save.name = (trimmedSaveName.length >= 1 && trimmedSaveName.length <= 20)
        ? trimmedSaveName : '';
    // Name: restrict to safe character set (Chinese, letters, digits, limited punctuation)
    if (save.name && !/^[\u4e00-\u9fa5a-zA-Z0-9 \-_\.，。！？、：\u201c\u201d\u2018\u2019（）【】]+$/.test(save.name)) {
        save.name = '';
    }
    // #14 Fix: keep the deterministic market seed + live snapshot so export/import (and a
    // merge) is a real migration instead of a fresh random market with a reset clock.
    const marketSeed = Number(raw.marketSeed);
    save.marketSeed = Number.isFinite(marketSeed) ? Math.floor(marketSeed) : undefined;
    save.market = sanitizeMarketState(raw.market);

    // P1-4 Fix: deep-validate nested structures. The old sanitizer only checked the
    // top-level scalars and passed holdings/dayTrades/gameStats/autoTrade straight
    // through, so a crafted backup could inject a holding for an unknown stock code
    // and crash the portfolio renderer on every subsequent load ("account bricking").
    save.holdings = {};
    if (raw.holdings && typeof raw.holdings === 'object') {
        Object.entries(raw.holdings).forEach(([code, h]) => {
            if (!isKnownStockCode(code) || !h || typeof h !== 'object') return;
            const quantity = Number(h.quantity);
            const avgPrice = Number(h.avgPrice);
            const totalCost = Number(h.totalCost);
            if (!Number.isInteger(quantity) || quantity <= 0) return;
            if (!Number.isFinite(avgPrice) || avgPrice < 0) return;
            if (!Number.isFinite(totalCost) || totalCost < 0) return;
            save.holdings[code] = {
                name: typeof h.name === 'string' ? h.name.slice(0, 40) : code,
                quantity,
                avgPrice,
                totalCost
            };
        });
    }

    // Records: keep only well-formed buy/sell entries, rebuild each with a fixed shape.
    save.records = [];
    (Array.isArray(raw.records) ? raw.records : []).slice(0, 100).forEach(r => {
        if (!r || typeof r !== 'object') return;
        if (r.type !== 'buy' && r.type !== 'sell') return;
        const price = Number(r.price);
        const quantity = Number(r.quantity);
        const time = Number(r.time);
        if (!Number.isFinite(price) || price < 0) return;
        if (!Number.isFinite(quantity) || quantity < 0) return;
        if (!Number.isFinite(time)) return;
        save.records.push({
            // #24 Fix: give every record a stable identity so multi-tab merges can tell
            // two *distinct* trades apart even when time/code/type/quantity/price match
            // (two identical orders in the same game minute used to collapse into one).
            id: (typeof r.id === 'string' && r.id.length > 0 && r.id.length <= 64)
                ? r.id
                : ((Crypto && Crypto.uuid) ? Crypto.uuid() : 'r-' + time + '-' + Math.random().toString(36).slice(2, 10)),
            time,
            // Game-day fields (see recordTrade). Optional so exports from older builds
            // still import; calculateSaveStats() falls back to the real date when absent.
            dayIndex: Number.isFinite(Number(r.dayIndex)) ? Math.max(0, Math.floor(Number(r.dayIndex))) : undefined,
            gameMinutes: Number.isFinite(Number(r.gameMinutes)) ? Math.min(1439, Math.max(0, Math.floor(Number(r.gameMinutes)))) : undefined,
            fundBefore: Number.isFinite(Number(r.fundBefore)) && Number(r.fundBefore) >= 0 ? Number(r.fundBefore) : undefined,
            code: typeof r.code === 'string' ? r.code : '',
            name: typeof r.name === 'string' ? r.name.slice(0, 40) : '',
            type: r.type,
            price,
            quantity,
            amount: Number.isFinite(Number(r.amount)) ? Number(r.amount) : 0,
            pnl: Number.isFinite(Number(r.pnl)) ? Number(r.pnl) : 0
        });
    });

    save.watchlist = Array.isArray(raw.watchlist) ? raw.watchlist.filter(c => isKnownStockCode(c)) : [];
    save.achievements = Array.isArray(raw.achievements) ? raw.achievements.filter(a => typeof a === 'string' && a.length < 64) : [];
    // P1-3 Fix: Validate settings. A sane fee must be in [0, 0.01] (1% is already an
    // absurd upper bound for any real exchange). Out-of-range values reset to the
    // default rather than being silently clamped, to prevent an attacker from
    // setting a "valid" but attacker-chosen value.
    const rawSettings = (raw.settings && typeof raw.settings === 'object') ? raw.settings : {};
    const saneFee = (v) => Number.isFinite(v) && v >= 0 && v <= 0.01 ? Number(v) : null;
    save.settings = {
        buyFee: saneFee(rawSettings.buyFee) !== null ? saneFee(rawSettings.buyFee) : 0.0003,
        sellFee: saneFee(rawSettings.sellFee) !== null ? saneFee(rawSettings.sellFee) : 0.0013,
        t0Mode: !!rawSettings.t0Mode,
        tradeUnit: [1, 100].includes(rawSettings.tradeUnit) ? rawSettings.tradeUnit : 1
    };

    save.dayTrades = {};
    if (raw.dayTrades && typeof raw.dayTrades === 'object') {
        Object.entries(raw.dayTrades).forEach(([code, dt]) => {
            if (!isKnownStockCode(code) || !dt || typeof dt !== 'object') return;
            const buy = Number(dt.buy);
            const sell = Number(dt.sell);
            if (Number.isFinite(buy) && buy >= 0 && Number.isFinite(sell) && sell >= 0) {
                save.dayTrades[code] = { buy, sell };
            }
        });
    }

    const rawStats = (raw.gameStats && typeof raw.gameStats === 'object') ? raw.gameStats : {};
    const nonNegInt = (v, fallback = 0) => Number.isFinite(Number(v)) && Number(v) >= 0 ? Math.floor(Number(v)) : fallback;
    save.gameStats = {
        tradeCount: nonNegInt(rawStats.tradeCount),
        profitCount: nonNegInt(rawStats.profitCount),
        lossCount: nonNegInt(rawStats.lossCount),
        maxHoldings: nonNegInt(rawStats.maxHoldings),
        sectorsTraded: normalizeSectorsTraded(rawStats.sectorsTraded),
        dayTrades: nonNegInt(rawStats.dayTrades),
        totalFees: Number.isFinite(Number(rawStats.totalFees)) && Number(rawStats.totalFees) >= 0 ? Number(rawStats.totalFees) : 0,
        realizedProfit: Number.isFinite(Number(rawStats.realizedProfit)) && Number(rawStats.realizedProfit) >= 0 ? Number(rawStats.realizedProfit) : 0,
        realizedLoss: Number.isFinite(Number(rawStats.realizedLoss)) && Number(rawStats.realizedLoss) >= 0 ? Number(rawStats.realizedLoss) : 0
    };

    // Auto-trade: rebuild configs with validated fields, never trust nested objects.
    const rawAuto = (raw.autoTrade && typeof raw.autoTrade === 'object') ? raw.autoTrade : {};
    const rawConfigs = Array.isArray(rawAuto.configs) ? rawAuto.configs : [];
    const configs = [];
    rawConfigs.slice(0, 50).forEach(c => {
        if (!c || typeof c !== 'object' || !isKnownStockCode(c.code)) return;
        if (c.direction !== 'buy' && c.direction !== 'sell') return;
        const quantity = Number(c.quantity);
        if (!Number.isFinite(quantity) || quantity <= 0) return;
        configs.push({
            code: c.code,
            name: typeof c.name === 'string' ? c.name.slice(0, 40) : c.code,
            direction: c.direction,
            conditionType: ['price', 'percentage', 'profit', 'time'].includes(c.conditionType) ? c.conditionType : 'price',
            conditionOperator: ['above', 'below', 'equal'].includes(c.conditionOperator) ? c.conditionOperator : 'above',
            conditionValue: Number.isFinite(Number(c.conditionValue)) ? Number(c.conditionValue) : 0,
            quantity,
            priceType: c.priceType === 'limit' ? 'limit' : 'market',
            limitPrice: Number.isFinite(Number(c.limitPrice)) && Number(c.limitPrice) > 0 ? Number(c.limitPrice) : 0,
            stopLoss: Number.isFinite(Number(c.stopLoss)) ? Number(c.stopLoss) : 0,
            takeProfit: Number.isFinite(Number(c.takeProfit)) && Number(c.takeProfit) > 0 ? Number(c.takeProfit) : 0,
            maxAmount: Number.isFinite(Number(c.maxAmount)) && Number(c.maxAmount) > 0 ? Number(c.maxAmount) : 0,
            createdAt: Number.isFinite(Number(c.createdAt)) ? Number(c.createdAt) : Date.now()
        });
    });
    const rawAutoStats = (rawAuto.stats && typeof rawAuto.stats === 'object') ? rawAuto.stats : {};
    const rawTotalPnl = rawAutoStats.totalPnl !== undefined ? rawAutoStats.totalPnl : rawAutoStats.totalProfit;
    // #14 Fix: keep the auto-trade history. Dropping it on export/import would lose
    // the trade log, so it is always rebuilt from the raw data.
    const autoRecords = (Array.isArray(rawAuto.records) ? rawAuto.records : []).slice(0, 50).map(r => {
        if (!r || typeof r !== 'object') return null;
        const num = (v) => Number.isFinite(Number(v)) ? Number(v) : 0;
        return {
            // #24 Fix: same unique identity treatment as trade records (see mergeRecordLists).
            id: (typeof r.id === 'string' && r.id.length > 0 && r.id.length <= 64)
                ? r.id
                : ((Crypto && Crypto.uuid) ? Crypto.uuid() : ('a-' + (num(r.time) || Date.now()) + '-' + Math.random().toString(36).slice(2, 10))),
            time: num(r.time) || Date.now(),
            success: !!r.success,
            amount: num(r.amount),
            message: typeof r.message === 'string' ? r.message.slice(0, 200) : '',
            pnl: num(r.pnl),
            code: typeof r.code === 'string' ? r.code.slice(0, 16) : '',
            name: typeof r.name === 'string' ? r.name.slice(0, 40) : '',
            direction: (r.direction === 'buy' || r.direction === 'sell') ? r.direction : '',
            conditionType: typeof r.conditionType === 'string' ? r.conditionType.slice(0, 20) : '',
            conditionValue: num(r.conditionValue),
            buyPrice: num(r.buyPrice),
            sellPrice: num(r.sellPrice),
            pnlPercent: (typeof r.pnlPercent === 'number' || typeof r.pnlPercent === 'string') ? r.pnlPercent : 0
        };
    }).filter(Boolean);
    const readFloatMap = (value) => {
        const out = {};
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            Object.entries(value).slice(0, 1000).forEach(([key, v]) => {
                if (typeof key === 'string' && key.length > 0 && key.length <= 40 && Number.isFinite(Number(v)) && Number(v) >= 0) {
                    out[key] = Number(v);
                }
            });
        }
        return out;
    };
    const autoTimes = readFloatMap(rawAuto.lastTradeTimes);
    save.autoTrade = {
        enabled: !!rawAuto.enabled,
        paused: !!rawAuto.paused,
        configs,
        stats: {
            totalTrades: nonNegInt(rawAutoStats.totalTrades),
            successTrades: nonNegInt(rawAutoStats.successTrades !== undefined ? rawAutoStats.successTrades : rawAutoStats.profitTrades),
            failedTrades: nonNegInt(rawAutoStats.failedTrades !== undefined ? rawAutoStats.failedTrades : rawAutoStats.lossTrades),
            totalPnl: Number.isFinite(Number(rawTotalPnl)) ? Number(rawTotalPnl) : 0
        },
        records: autoRecords,
        lastTradeTimes: autoTimes
    };
    return save;
}

class StockSimulator {
    constructor() {
        this.currentUser = null;
        this.currentSave = null;
        this.stockData = new Map();
        this.selectedStock = null;
        this.marketInterval = null;
        this.refreshRate = 3000;
        this.tutorialStep = 0;
        this.debugClickCount = 0;
        this.debugClickTimer = null;
        // Bug fix: market/clock persistence is throttled to whole ticks and also runs
        // on tab-hide / page-unload (see autoSaveMarket()).
        this.autoSaveThrottleMs = 2000;
        this.lastAutoSaveAt = 0;
        // #13 Fix: multi-tab coordination. The last ciphertext we wrote, plus a clone of
        // the active save as it was last persisted, let saveUsers() detect a write from
        // another tab and three-way-merge it instead of clobbering it.
        this.lastStoredCipher = null;
        this.saveBaseline = null;
        // #15 Fix: whether the player typed their own price into the trade form. While it
        // is false the field follows the live market; once true it is never overwritten.
        this.tradePriceTouched = { buy: false, sell: false };
        
        // 涨跌停管理器
        this.limitManager = new LimitManager();
        
        // 市场更新计数器
        this.marketTickCount = 0;
        this.tradingDayCount = 0;  // 交易日计数
        
        // 游戏时间系统
        // P2-6 Fix: previously `tickPerMinute` was declared but never read. Time was always
        // advanced by 1 minute per tick (game.js updateGameTime). Document the actual
        // cadence and drop the dead field so future maintainers don't expect different behavior.
        this.gameTime = {
            hour: 9,
            minute: 30,
            manualSet: false,  // 标记是否手动设置过时间
            // 1 tick = 1 minute of game time. Market is open 9:30-11:30 / 13:00-15:00.
            minutesPerTick: 1,
            // P1-6 Fix: monotonic day counter, incremented when the clock wraps past
            // midnight. The trading-day boundary is derived from this (the game clock)
            // instead of from a raw tick count. Not persisted - it is session state.
            dayIndex: 0
        };
        // Last game-clock day index for which the new-trading-day logic has run.
        this.lastTradingDayIndex = 0;
        
        // 时间控制（设置面板新增功能）
        this.gameTimePaused = false;  // 是否暂停游戏时间推进
        this.skipMode = false;        // 是否正在加速跳过时间
        this.skipTicksRemaining = 0;  // 跳过剩余需要推进的tick数
        
        // 每只股票K线重置用的盐（code -> uint32）。0/缺失表示从未重置；非 0 时
        // initMarketData() 用 deriveStockSeed() 为该股单独派生随机序列，从而做到
        // 「只重置某几只」且刷新后仍可复现。
        this.historySeeds = {};
        
        // 图表缩放状态
        this.chartState = {
            scaleX: 1,        // X轴缩放比例
            scaleY: 1,        // Y轴缩放比例
            offsetX: 0,       // X轴偏移（用于拖拽）
            offsetY: 0,       // Y轴偏移
            isDragging: false,
            isSelecting: false,
            dragStartX: 0,
            dragStartY: 0,
            selectionStart: null,
            selectionEnd: null
        };
        
        // 自动交易状态
        this.autoTrade = {
            enabled: false,
            paused: false,
            configs: [],  // 多只股票配置数组
            stats: {
                totalTrades: 0,
                successTrades: 0,
                failedTrades: 0,
                totalPnl: 0
            },
            records: [],
            interval: null,
            lastTradeTimes: {},  // 每只股票的上次交易时间，防止重复交易
            // P2-6 Fix: a misconfigured condition that never fires would otherwise
            // keep producing failure records forever. Consecutive failures instead
            // trip a separate circuit breaker.
            consecutiveFailures: 0,
            maxConsecutiveFailures: 20,
            editingIndex: null  // 当前正在编辑的配置索引
        };

        // 股票列表排序状态
        this.stockSort = {
            field: null,  // 'name', 'price', 'change'
            order: 'asc'  // 'asc', 'desc'
        };

        // 股票列表搜索状态
        this.stockSearch = {
            keyword: '',  // 当前搜索关键词
            isSearching: false  // 是否处于搜索状态
        };

        // 股票列表自选模式
        this.watchlistMode = false;  // 是否只显示自选股票

        this.init();
    }

    init() {
        // 初始化国际化模块（必须在 bindEvents 之前，确保 DOM 渲染时语言已就绪）
        I18n.init();
        I18n.applyToDOM();

        this.loadUsers();
        this.bindEvents();
        this.applyUserLanguage();
        this.checkAutoLogin();

        // 注册语言变更回调：切换语言后刷新所有动态生成的内容
        I18n.onChange((newLang) => {
            this.onLanguageChanged(newLang);
        });
    }

    /**
     * 应用用户语言偏好（登录后从用户数据读取；未登录时使用 localStorage 中的偏好）
     */
    applyUserLanguage() {
        // 优先使用当前用户已保存的语言偏好
        if (this.currentUser && this.currentUser.lang) {
            if (I18n.getCurrentLanguage() !== this.currentUser.lang) {
                I18n.setLanguage(this.currentUser.lang, true);
            }
        }
        // 同步设置面板中的语言下拉值
        const langSelect = document.getElementById('language-select');
        if (langSelect) {
            langSelect.value = I18n.getCurrentLanguage();
        }
    }

    /**
     * 语言切换回调：刷新所有动态生成的 DOM 内容
     * @param {string} newLang
     */
    onLanguageChanged(newLang) {
        // 1. 保存语言偏好到用户数据（若已登录）
        if (this.currentUser && this.currentUser.username && this.users[this.currentUser.username]) {
            this.users[this.currentUser.username].lang = newLang;
            this.currentUser.lang = newLang;
            this.saveUsers();
        }

        // 2. 同步语言下拉选择器
        const langSelect = document.getElementById('language-select');
        if (langSelect) {
            langSelect.value = newLang;
        }

        // 3. 刷新所有动态生成内容的渲染
        if (this.currentUser) {
            // 已登录：刷新存档列表/持仓/记录等动态内容
            if (document.getElementById('save-select-screen').classList.contains('active')) {
                this.renderSaveList();
            }
            if (this.currentSave) {
                this.renderStockList(this.stockSearch.keyword);
                if (this.selectedStock) {
                    this.updateStockDetail();
                }
                this.updatePortfolio();
                this.updateTradeAvailable();
                this.updateAutoTradeStatus();
                this.updateAutoTradeStats();
                this.renderAutoTradeStockList();
                this.updateProfile();
                this.updateTimeDisplay();

                // 刷新自动交易方向相关的动态文本（盈利目标选项等）
                const checkedDirection = document.querySelector('input[name="auto-direction"]:checked');
                if (checkedDirection) {
                    this.onAutoTradeDirectionChange(checkedDirection.value);
                }
            }
        }

        // 4. 成就弹窗是动态填充的节点：切换语言时若弹窗正显示，刷新成就名称，
        //    否则弹窗里的成就名称会停留在原语言。
        const achPopup = document.getElementById('achievement-popup');
        if (achPopup && achPopup.classList.contains('show') && this._popupAchievement) {
            const achNameEl = document.getElementById('achievement-name');
            if (achNameEl) {
                achNameEl.textContent = AchievementSystem.getName(this._popupAchievement);
            }
        }

        // 5. 更新自选按钮文本
        const watchlistBtn = document.getElementById('watchlist-toggle-btn');
        if (watchlistBtn) {
            watchlistBtn.textContent = I18n.t(this.watchlistMode ? 'market.allView' : 'market.watchlistView');
        }

        // 5. 更新暂停按钮文本
        const pauseBtn = document.getElementById('time-pause-btn');
        if (pauseBtn) {
            pauseBtn.textContent = I18n.t(this.gameTimePaused ? 'settings.resume' : 'settings.pause');
        }
    }

    // 用户数据管理
    loadUsers() {
        // P1-7 Fix: prototype-less dictionary so a '__proto__' key can never reach the
        // inherited accessor and swap the users object's prototype.
        const data = localStorage.getItem('stock_simulator_users');
        // #13 Fix: remember what we read so saveUsers() can tell whether another tab has
        // written since (and only decrypt/merge when it actually has).
        this.lastStoredCipher = data;
        if (!data) {
            this.users = Object.create(null);
            return;
        }

        // P1-10 Fix: distinguish "no data" from "corrupted data". Previously a decrypt or
        // JSON failure silently degraded to {}, making all accounts appear to vanish and
        // letting the next write overwrite the (possibly recoverable) ciphertext.
        let parsed = null;
        try {
            const decrypted = Crypto.decrypt(data);
            parsed = decrypted ? JSON.parse(decrypted) : null;
        } catch (e) {
            parsed = null;
        }
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
            try {
                // #23 Fix: keep exactly ONE backup. A timestamped key added a fresh copy
                // on every refresh, so 3 refreshes produced 3 identical backups.
                const backupKey = 'stock_simulator_users_corrupted_backup';
                if (!localStorage.getItem(backupKey)) {
                    localStorage.setItem(backupKey, data);
                }
            } catch (backupError) {
                console.error('备份损坏数据失败:', backupError);
            }
            alert(I18n.t('load.dataCorrupted'));
            this.users = Object.create(null);
            return;
        }
        this.users = Object.assign(Object.create(null), parsed);
        
        // 数据迁移：为旧用户添加缺失字段
        let needSave = false;
        Object.keys(this.users).forEach(username => {
            const user = this.users[username];
            if (user.tutorialCompleted === undefined) {
                // 如果用户已有存档，认为已完成教程
                user.tutorialCompleted = user.saves && user.saves.length > 0;
                needSave = true;
            }
            // 为主题字段设置默认值
            if (user.theme === undefined) {
                user.theme = 'dark';
                needSave = true;
            }
            // 为刷新速度字段设置默认值
            if (user.refreshRate === undefined) {
                user.refreshRate = 3000;  // 默认 3秒
                needSave = true;
            }
        });
        
        // 如果有数据迁移，保存更新
        if (needSave) {
            this.saveUsers();
        }
    }

    // P1-10 Fix: report persistence success to the caller. Callers that mutate game
    // state must not tell the user "success" when the write actually threw (quota,
    // private mode, disabled storage).
    saveUsers() {
        try {
            // S2 Fix: attach the live market + game clock to the active save so a reload
            // restores prices instead of re-randomising them (which made P&L meaningless).
            if (this.currentSave && this.currentUser && Array.isArray(this.currentUser.saves)) {
                this.currentSave.market = this.captureMarketState();
            }
            // P1-5 Fix: serialize through serializeUsersData() so gameStats.sectorsTraded
            // (a Set) is written as an array instead of degrading to {}. The previous
            // JSON.stringify silently dropped it, so sector-based achievements could
            // never accumulate across page reloads.
            // #13 Fix: if another tab wrote since our last write, fold its changes into
            // our in-memory copy before encrypting. Decrypting is only done when the
            // stored ciphertext actually changed, so the hot auto-save path stays cheap.
            let storedRaw = null;
            try { storedRaw = localStorage.getItem('stock_simulator_users'); } catch (_) { storedRaw = null; }
            // #24 Fix: never write an account back to storage after another tab deleted it.
            // Before this guard the deleted account stayed in this tab's in-memory map and
            // the next auto-save (or trade, or visibilitychange flush) re-created it with
            // its password hash and every save. The disk check only runs when the stored
            // ciphertext changed since our last read/write, so the hot auto-save path
            // stays cheap (a save we just wrote is proof the account is still there).
            const currentUsername = this.currentUser && this.currentUser.username;
            if (currentUsername && (!storedRaw || storedRaw !== this.lastStoredCipher)) {
                const storedUsers = storedRaw ? this.readStoredUsers(storedRaw) : null;
                if (!storedUsers || !Object.prototype.hasOwnProperty.call(storedUsers, currentUsername)) {
                    // Account deleted elsewhere (or storage cleared): end the session
                    // instead of resurrecting it.
                    this.onAccountRemovedExternally(storedUsers || Object.create(null), storedRaw);
                    return false;
                }
                this.reconcileWithStorage(storedUsers);
            } else if (storedRaw && storedRaw !== this.lastStoredCipher) {
                this.reconcileWithStorage(this.readStoredUsers(storedRaw));
            }
            const cipher = Crypto.encrypt(serializeUsersData(this.users));
            localStorage.setItem('stock_simulator_users', cipher);
            this.lastStoredCipher = cipher;
            this.syncSaveBaseline();
            return true;
        } catch (error) {
            console.error('保存用户数据失败:', error);
            this.showNotification(I18n.t('save.saveFailedStorage'), 'error');
            return false;
        }
    }

    // #13 Fix: decrypt + parse the persisted users map. Returns null for absent or
    // unreadable data (never throws) so a merge can always fall back to a plain write.
    readStoredUsers(raw) {
        let storedRaw = raw;
        if (storedRaw === undefined) {
            try { storedRaw = localStorage.getItem('stock_simulator_users'); } catch (_) { storedRaw = null; }
        }
        if (!storedRaw) return null;
        try {
            const decrypted = Crypto.decrypt(storedRaw);
            if (!decrypted) return null;
            const parsed = JSON.parse(decrypted);
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
            return parsed;
        } catch (e) {
            return null;
        }
    }

    // #13 Fix: merge what is on disk into the in-memory users map.
    //   - users that exist only on disk (registered in another tab) are kept
    //   - saves that exist only on disk (created in another tab) are kept
    //   - the save this tab has open is three-way-merged against the baseline snapshot
    //   - users deleted on disk are dropped from memory too, except the account this tab
    //     is currently playing, so this tab's next write cannot bring a deleted account
    //     back (#25). Deleting one *save* still keeps the local copy: only account
    //     deletion is one-way.
    reconcileWithStorage(stored) {
        if (!stored) return false;
        let changed = false;
        const username = this.currentUser && this.currentUser.username;
        // #25 Fix: storage is authoritative for every account this tab is NOT playing.
        // Previously only additions were merged, never deletions, so an account deleted
        // in another tab stayed in this tab's memory and the next save (auto-save, trade,
        // visibilitychange flush) wrote it, its password hash and every save straight
        // back - deleting in one tab resurrected the account from another, even though
        // the tab was logged in as a different user the whole time.
        // Registration persists immediately, so there is never a user that exists only
        // in memory and still needs to be kept here.
        Object.keys(stored).forEach(diskUsername => {
            if (!Object.prototype.hasOwnProperty.call(this.users, diskUsername)) {
                this.users[diskUsername] = stored[diskUsername];
                changed = true;
            }
        });
        Object.keys(this.users).forEach(localUsername => {
            if (localUsername !== username && !Object.prototype.hasOwnProperty.call(stored, localUsername)) {
                delete this.users[localUsername];
                changed = true;
            }
        });
        if (!username) return changed;
        const local = this.users[username];
        const remote = stored[username];
        if (!local || !remote || !Array.isArray(local.saves) || !Array.isArray(remote.saves)) return changed;

        const remoteById = new Map();
        remote.saves.forEach(s => { if (s && typeof s.id === 'string') remoteById.set(s.id, s); });
        local.saves.forEach((save, index) => {
            if (!save || typeof save.id !== 'string') return;
            const remoteSave = remoteById.get(save.id);
            if (!remoteSave) return;
            remoteById.delete(save.id);
            const base = (this.saveBaseline && this.saveBaseline.id === save.id) ? this.saveBaseline : null;
            const merged = this.mergeSaveData(base, save, remoteSave);
            if (merged !== save) {
                local.saves[index] = merged;
                if (this.currentSave && this.currentSave.id === save.id) {
                    this.currentSave = merged;
                }
                changed = true;
            }
        });
        remoteById.forEach(save => {
            if (local.saves.length >= MAX_SAVES_PER_USER * 3) return;
            local.saves.push(save);
            changed = true;
        });
        // The runtime auto-trade state shares its arrays with currentSave by reference.
        // Replacing the save object above broke that aliasing, so new records would have
        // landed on an orphaned array and the merged history would never be written.
        if (this.currentSave && this.currentSave.autoTrade && this.autoTrade) {
            this.autoTrade.configs = this.currentSave.autoTrade.configs || [];
            this.autoTrade.stats = this.currentSave.autoTrade.stats || this.autoTrade.stats;
            this.autoTrade.records = this.currentSave.autoTrade.records || [];
            this.autoTrade.lastTradeTimes = this.currentSave.autoTrade.lastTradeTimes || {};
        }
        return changed;
    }

    // #24 Fix: single entry point for cross-tab storage events (the inline listener in
    // bindEvents() delegates here). Handles the case the old code ignored: the shared
    // database still exists but the account this tab is playing is no longer in it.
    handleStorageEvent(e) {
        if (!e || e.key !== 'stock_simulator_users') return;

        // Unchanged ciphertext (e.g. an echo of a write we already know about): nothing
        // to do. This keeps the decrypt below off the common path.
        if (e.newValue && e.newValue === this.lastStoredCipher) return;

        // A null newValue means the whole key was removed (removeItem /
        // localStorage.clear()), which is equivalent to an empty user database.
        const stored = e.newValue ? this.readStoredUsers(e.newValue) : Object.create(null);
        if (!stored) return; // unreadable ciphertext: never act on it

        if (!this.currentUser) {
            // Sitting on the login / save-select screens: just mirror the database so a
            // newly registered account appears and a deleted one disappears.
            if (e.newValue) {
                this.loadUsers();
            } else {
                this.users = Object.create(null);
                this.lastStoredCipher = null;
            }
            const saveSelect = document.getElementById('save-select-screen');
            if (saveSelect && saveSelect.classList.contains('active')) this.renderSaveList();
            return;
        }

        // #24 Fix: the account this tab is playing no longer exists on disk. Previously
        // the event was ignored (the key was present, just without our user), so the tab
        // kept playing and the next auto-save wrote the account, its password hash and
        // every save straight back into storage - deleting in one tab resurrected the
        // account from another.
        const username = this.currentUser.username;
        if (!Object.prototype.hasOwnProperty.call(stored, username)) {
            this.onAccountRemovedExternally(stored, e.newValue);
            return;
        }

        if (e.newValue === this.lastStoredCipher) return;
        const changed = this.reconcileWithStorage(stored);
        // Round-3 critical fix: re-baseline the merge ancestor to the REMOTE copy
        // that is now in storage. The old code only refreshed lastStoredCipher and
        // left saveBaseline at the pre-merge snapshot. One player action commonly
        // writes storage twice (the trade save plus the first-achievement save),
        // so the second storage event three-way-merged against the stale ancestor
        // and applied the other tab's delta a SECOND time: holdings and cash were
        // double-counted in memory and the next save wrote the corruption back
        // for every tab to absorb. The persisted state after this event is exactly
        // `stored`, so that copy is the correct common ancestor for the next merge.
        this.rebaseSaveBaseline(stored);
        this.lastStoredCipher = e.newValue;
        if (changed) {
            this.showNotification(I18n.t('notification.multiTabMerged'));
            if (this.currentSave) {
                this.updateTradeAvailable();
                this.updatePortfolio();
                this.renderStockList(this.stockSearch.keyword);
            } else {
                const saveSelect = document.getElementById('save-select-screen');
                if (saveSelect && saveSelect.classList.contains('active')) this.renderSaveList();
            }
        }
    }

    // #24 Fix: another tab deleted the account this tab was playing (detected either from
    // a storage event or by the guard in saveUsers()). Tear the session down completely so
    // no code path can write the account back, then return to the login screen.
    onAccountRemovedExternally(storedUsers, storedCipher) {
        if (!this.currentUser && !this.currentSave) return;

        // Stops the market / auto-trade intervals and any pending skip chain.
        this.teardownSession();

        // Mirror what is on disk: never keep holding an account that no longer exists.
        if (storedUsers && typeof storedUsers === 'object') {
            this.users = Object.assign(Object.create(null), storedUsers);
        } else {
            this.users = Object.create(null);
        }
        this.currentUser = null;
        this.currentSave = null;
        this.currentSaveIndex = undefined;
        this.saveBaseline = null;
        this.lastStoredCipher = storedCipher || null;
        this.selectedStock = null;
        this.stockData.clear();
        this.marketTickCount = 0;
        this.autoTrade = {
            enabled: false,
            paused: false,
            configs: [],
            stats: { totalTrades: 0, successTrades: 0, failedTrades: 0, totalPnl: 0 },
            records: [],
            lastTradeTimes: {},
            interval: null
        };

        try { localStorage.removeItem('stock_simulator_last_user'); } catch (_) { /* best-effort */ }

        // Do not let the login screen inherit the deleted account's theme.
        document.body.className = '';
        const themeToggleEl = document.getElementById('theme-toggle');
        if (themeToggleEl) themeToggleEl.textContent = '🌙';

        this.showNotification(I18n.t('notification.accountDeletedElsewhere'));
        this.showScreen('auth-screen');
        const loginUsername = document.getElementById('login-username');
        if (loginUsername) loginUsername.value = '';
        const loginPassword = document.getElementById('login-password');
        if (loginPassword) loginPassword.value = '';
        const errorEl = document.getElementById('login-error');
        if (errorEl) errorEl.textContent = '';
    }

    // #13 Fix: three-way merge of one save. Numeric deltas are summed on top of the
    // common ancestor, so two tabs each buying a different stock end up with both
    // holdings and a consistent cash balance. Fields the live tab owns (name, settings,
    // market/clock) always follow the local copy.
    mergeSaveData(base, local, remote) {
        if (!base || !local || !remote) return local;
        if (base.id !== local.id || base.id !== remote.id) return local;
        const merged = this.cloneSaveData(base);
        ['id', 'createdAt', 'name', 'settings', 'market', 'marketSeed', 'initialFund'].forEach(k => {
            merged[k] = local[k];
        });
        const asNumber = (v) => Number.isFinite(Number(v)) ? Number(v) : 0;
        merged.fund = round2(asNumber(base.fund) + (asNumber(local.fund) - asNumber(base.fund)) + (asNumber(remote.fund) - asNumber(base.fund)));

        const baseHoldings = base.holdings || {}, localHoldings = local.holdings || {}, remoteHoldings = remote.holdings || {};
        const codes = new Set([...Object.keys(baseHoldings), ...Object.keys(localHoldings), ...Object.keys(remoteHoldings)]);
        const holdings = {};
        codes.forEach(code => {
            const b = baseHoldings[code], l = localHoldings[code], r = remoteHoldings[code];
            const bq = b ? asNumber(b.quantity) : 0, lq = l ? asNumber(l.quantity) : 0, rq = r ? asNumber(r.quantity) : 0;
            const quantity = Math.max(0, Math.round(bq + (lq - bq) + (rq - bq)));
            if (quantity <= 0) return;
            const bc = b ? asNumber(b.totalCost) : 0, lc = l ? asNumber(l.totalCost) : 0, rc = r ? asNumber(r.totalCost) : 0;
            let totalCost = bc + (lc - bc) + (rc - bc);
            if (!Number.isFinite(totalCost) || totalCost < 0) totalCost = 0;
            totalCost = round2(totalCost);
            const source = l || r || b;
            holdings[code] = {
                name: source && typeof source.name === 'string' ? source.name : code,
                quantity,
                totalCost,
                avgPrice: round2(totalCost / quantity)
            };
        });
        merged.holdings = holdings;

        merged.records = this.mergeRecordLists(base.records, local.records, remote.records);
        merged.watchlist = Array.from(new Set([...(base.watchlist || []), ...(local.watchlist || []), ...(remote.watchlist || [])]));
        merged.achievements = Array.from(new Set([...(base.achievements || []), ...(local.achievements || []), ...(remote.achievements || [])]));

        const baseDay = base.dayTrades || {}, localDay = local.dayTrades || {}, remoteDay = remote.dayTrades || {};
        const dayCodes = new Set([...Object.keys(baseDay), ...Object.keys(localDay), ...Object.keys(remoteDay)]);
        const dayTrades = {};
        dayCodes.forEach(code => {
            const b = baseDay[code] || {}, l = localDay[code] || {}, r = remoteDay[code] || {};
            const buy = Math.max(0, Math.round(asNumber(b.buy) + (asNumber(l.buy) - asNumber(b.buy)) + (asNumber(r.buy) - asNumber(b.buy))));
            const sell = Math.max(0, Math.round(asNumber(b.sell) + (asNumber(l.sell) - asNumber(b.sell)) + (asNumber(r.sell) - asNumber(b.sell))));
            if (buy || sell) dayTrades[code] = { buy, sell };
        });
        merged.dayTrades = dayTrades;

        const baseStats = base.gameStats || {}, localStats = local.gameStats || {}, remoteStats = remote.gameStats || {};
        const delta = (key) => asNumber(baseStats[key]) + (asNumber(localStats[key]) - asNumber(baseStats[key])) + (asNumber(remoteStats[key]) - asNumber(baseStats[key]));
        merged.gameStats = {
            tradeCount: Math.max(0, Math.round(delta('tradeCount'))),
            profitCount: Math.max(0, Math.round(delta('profitCount'))),
            lossCount: Math.max(0, Math.round(delta('lossCount'))),
            maxHoldings: Math.max(asNumber(baseStats.maxHoldings), asNumber(localStats.maxHoldings), asNumber(remoteStats.maxHoldings)),
            sectorsTraded: new Set([...(baseStats.sectorsTraded || []), ...(localStats.sectorsTraded || []), ...(remoteStats.sectorsTraded || [])]),
            dayTrades: Math.max(0, Math.round(delta('dayTrades'))),
            totalFees: Math.max(0, round2(delta('totalFees'))),
            realizedProfit: Math.max(0, round2(delta('realizedProfit'))),
            realizedLoss: Math.max(0, round2(delta('realizedLoss')))
        };

        // Auto-trade: runtime flags follow the live tab, configs and cooldowns are merged.
        const baseAuto = base.autoTrade || {}, localAuto = local.autoTrade || {}, remoteAuto = remote.autoTrade || {};
        const configs = [];
        const seenConfigs = new Set();
        [...(localAuto.configs || []), ...(remoteAuto.configs || [])].forEach(cfg => {
            if (!cfg || typeof cfg !== 'object') return;
            const key = String(cfg.code) + '|' + String(cfg.direction) + '|' + String(cfg.createdAt);
            if (seenConfigs.has(key)) return;
            seenConfigs.add(key);
            configs.push(cfg);
        });
        const mergedTimes = Object.assign({}, baseAuto.lastTradeTimes || {});
        [localAuto.lastTradeTimes, remoteAuto.lastTradeTimes].forEach(map => {
            Object.entries(map || {}).forEach(([key, value]) => {
                const t = asNumber(value);
                if (t > asNumber(mergedTimes[key])) mergedTimes[key] = t;
            });
        });
        const baseAutoStats = baseAuto.stats || {};
        const localAutoStats = localAuto.stats || {};
        const remoteAutoStats = remoteAuto.stats || {};
        const mergeCounter = (key) => Math.max(0, Math.round(asNumber(baseAutoStats[key]) + (asNumber(localAutoStats[key]) - asNumber(baseAutoStats[key])) + (asNumber(remoteAutoStats[key]) - asNumber(baseAutoStats[key]))));
        merged.autoTrade = {
            enabled: !!localAuto.enabled,
            paused: !!localAuto.paused,
            configs,
            stats: {
                totalTrades: mergeCounter('totalTrades'),
                successTrades: mergeCounter('successTrades'),
                failedTrades: mergeCounter('failedTrades'),
                totalPnl: round2(asNumber(baseAutoStats.totalPnl) + (asNumber(localAutoStats.totalPnl) - asNumber(baseAutoStats.totalPnl)) + (asNumber(remoteAutoStats.totalPnl) - asNumber(baseAutoStats.totalPnl)))
            },
            records: this.mergeRecordLists(baseAuto.records, localAuto.records, remoteAuto.records, 50),
            lastTradeTimes: mergedTimes
        };
        return merged;
    }

    // Union record lists by identity, newest first, capped.
    // #24 Fix: identity is the record's unique id. The old key was the record's *content*
    // (time|code|type|quantity|price|pnl) and 'time' is the in-game clock rounded to the
    // minute, so two genuinely different orders placed on the same stock, size and price
    // in the same game minute were treated as one and silently dropped on merge.
    // Records from older builds have no id; those fall back to the content key so a
    // legacy record still dedupes against its counterpart from another tab.
    mergeRecordLists(baseList, localList, remoteList, cap = 100) {
        const seenIds = new Set();
        const seenLegacy = new Set();
        const contentKey = (r) => [r && r.time, r && r.code, r && r.type, r && r.quantity, r && r.price, r && r.pnl].join('|');
        const merged = [];
        [...(localList || []), ...(remoteList || [])].forEach(record => {
            if (!record || typeof record !== 'object') return;
            const id = (typeof record.id === 'string' && record.id.length > 0) ? record.id : '';
            if (id) {
                if (seenIds.has(id)) return;
                seenIds.add(id);
            } else {
                const key = contentKey(record);
                if (seenLegacy.has(key)) return;
                seenLegacy.add(key);
            }
            merged.push(record);
        });
        merged.sort((a, b) => (Number(b.time) || 0) - (Number(a.time) || 0));
        return merged.slice(0, cap);
    }

    // #13 Fix: remember the persisted state of the active save so the next merge has a
    // common ancestor to diff against.
    syncSaveBaseline() {
        this.saveBaseline = this.currentSave ? this.cloneSaveData(this.currentSave) : null;
    }

    // Round-3 critical fix: after folding a remote write into memory, what is actually
    // PERSISTED is still the remote copy, not our merged in-memory state. Point the
    // merge baseline at a clone of that remote save so the next three-way merge diffs
    // both tabs' changes against the true common ancestor. Without this, consecutive
    // remote writes (a trade save followed by an achievement save) were each merged on
    // top of the same stale baseline, so the remote delta was counted twice - holdings
    // and cash doubled and the corruption was then written back to storage.
    // The remote save comes from JSON, so sectorsTraded arrives as an array;
    // mergeSaveData() only ever spreads it into a Set, which accepts arrays fine.
    rebaseSaveBaseline(stored) {
        if (!stored || !this.currentSave || typeof this.currentSave.id !== 'string') return;
        const username = this.currentUser && this.currentUser.username;
        if (!username || !Object.prototype.hasOwnProperty.call(stored, username)) return;
        const remote = stored[username];
        if (!remote || !Array.isArray(remote.saves)) return;
        const remoteSave = remote.saves.find(s => s && typeof s.id === 'string' && s.id === this.currentSave.id);
        // The other tab deleted the active save: keep the local copy (and the existing
        // baseline) - reconcileWithStorage() already treats deletion as "not seen yet".
        if (!remoteSave) return;
        this.saveBaseline = this.cloneSaveData(remoteSave);
    }

    // Bug fix: persist the live market + game clock on a cadence so idle play is not
    // lost on refresh (previously everything was only written on trade/rename/...), and
    // also when the tab is hidden or the page is about to unload.
    autoSaveMarket(force = false) {
        if (!this.currentUser || !this.currentSave) return;
        // finishSkip() performs a single save at the end of a fast-forward, so skip the
        // per-tick writes while thousands of ticks are being simulated.
        if (this.skipMode) return;
        const now = Date.now();
        if (!force && now - this.lastAutoSaveAt < this.autoSaveThrottleMs) return;
        this.lastAutoSaveAt = now;
        this.saveUsers();
    }

    // 事件绑定
    /**
     * 为所有数字输入框注入自定义步进按钮（替代原生上下箭头）
     * 原生箭头在各主题下配色突兀（白色块），改用主题化按钮保持视觉统一
     */
    enhanceNumberInputs() {
        document.querySelectorAll('input[type="number"]').forEach(input => {
            // 防止重复包装
            if (input.closest('.num-stepper')) return;
            const wrap = document.createElement('div');
            wrap.className = 'num-stepper';
            input.after(wrap);
            wrap.appendChild(input);
            wrap.insertAdjacentHTML('beforeend', `
                <div class="num-stepper-btns">
                    <button type="button" class="num-step-btn num-step-up" tabindex="-1" aria-label="+">
                        <svg viewBox="0 0 10 6" width="10" height="6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M1 5l4-4 4 4"/></svg>
                    </button>
                    <button type="button" class="num-step-btn num-step-down" tabindex="-1" aria-label="-">
                        <svg viewBox="0 0 10 6" width="10" height="6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M1 1l4 4 4-4"/></svg>
                    </button>
                </div>
            `);
        });
    }

    /**
     * 自定义步进按钮点击处理（事件委托）
     * 调用原生 stepUp/stepDown 以自动遵守 min/max/step，并派发事件
     * 触发 game.js 中已有的 input/change 监听（如预估金额实时计算）
     */
    handleNumberStepperClick(e) {
        const btn = e.target.closest('.num-step-btn');
        if (!btn) return;
        const input = btn.closest('.num-stepper')?.querySelector('input');
        if (!input || input.disabled || input.readOnly) return;
        if (btn.classList.contains('num-step-up')) {
            input.stepUp();
        } else {
            input.stepDown();
        }
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
    }

    bindEvents() {
        // 数字输入框统一注入主题化步进按钮（需在绑定其他事件前完成包装）
        this.enhanceNumberInputs();
        document.addEventListener('click', (e) => this.handleNumberStepperClick(e));

        // Bug fix: flush the active save when the tab is hidden or the page is closing,
        // so a refresh / close never rewinds the game clock or prices.
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) this.autoSaveMarket(true);
        });
        window.addEventListener('beforeunload', () => {
            if (this.currentUser && this.currentSave) this.saveUsers();
        });

        // #13 Fix: another tab wrote to the shared database. Fold its changes in instead
        // of ignoring them, otherwise the last tab to save silently wins and the other
        // tab's trades are lost on the next refresh.
        // #24 Fix: the handler was extracted into handleStorageEvent() so the
        // account-deletion path is explicit and can be exercised by tests.
        window.addEventListener('storage', (e) => this.handleStorageEvent(e));

        // 登录/注册标签切换
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
                e.target.classList.add('active');
                document.getElementById(`${e.target.dataset.tab}-form`).classList.add('active');
            });
        });

        // 登录
        document.getElementById('login-btn').addEventListener('click', () => this.login());
        document.getElementById('register-btn').addEventListener('click', () => this.register());
        
        // 回车键提交登录表单
        const loginUsername = document.getElementById('login-username');
        const loginPassword = document.getElementById('login-password');
        
        loginUsername.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                if (loginUsername.value.trim()) {
                    // 有内容，跳转到密码输入框
                    loginPassword.focus();
                } else {
                    // 无内容，显示提示
                    document.getElementById('login-error').textContent = I18n.t('auth.loginError.usernameRequired');
                }
            }
        });
        
        loginPassword.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.login();
            }
        });
        
        // 回车键提交注册表单
        const regUsername = document.getElementById('reg-username');
        const regPassword = document.getElementById('reg-password');
        const regConfirm = document.getElementById('reg-confirm');
        
        regUsername.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                if (regUsername.value.trim()) {
                    // 有内容，跳转到密码输入框
                    regPassword.focus();
                } else {
                    // 无内容，显示提示
                    document.getElementById('reg-error').textContent = I18n.t('auth.loginError.usernameRequired');
                }
            }
        });
        
        regPassword.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                regConfirm.focus();
            }
        });
        
        regConfirm.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.register();
            }
        });

        // 登出
        document.getElementById('logout-btn').addEventListener('click', () => this.logout());

        // 新游戏
        document.getElementById('new-game-btn').addEventListener('click', () => this.showSetup());

        // 修改存档名称模态窗口
        document.getElementById('cancel-rename-btn').addEventListener('click', () => this.hideRenameSaveModal());
        document.getElementById('confirm-rename-btn').addEventListener('click', () => this.confirmRenameSave());
        
        // 回车键提交修改名称
        document.getElementById('rename-save-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.confirmRenameSave();
            }
        });
        document.getElementById('new-game-from-profile').addEventListener('click', () => this.showSetup());

        // 设置页面
        document.getElementById('setup-back-btn').addEventListener('click', () => this.showSaveSelect());
        document.getElementById('start-game-btn').addEventListener('click', () => this.startGame());

        // 资金类型选择
        document.querySelectorAll('input[name="fund-type"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                document.getElementById('custom-fund').disabled = e.target.value === 'random';
            });
        });

        // 导航
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
                e.target.classList.add('active');
                document.getElementById(`${e.target.dataset.page}-page`).classList.add('active');
                if (e.target.dataset.page === 'portfolio') this.updatePortfolio();
                if (e.target.dataset.page === 'trade') this.updateTradeAvailable();
                if (e.target.dataset.page === 'profile') this.updateProfile();
            });
        });

        // 交易标签
        document.querySelectorAll('.trade-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                document.querySelectorAll('.trade-tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.trade-form').forEach(f => f.classList.remove('active'));
                e.target.classList.add('active');
                document.getElementById(`${e.target.dataset.trade}-panel`).classList.add('active');
            });
        });

        // 股票搜索
        document.getElementById('stock-search').addEventListener('input', (e) => {
            const keyword = e.target.value;
            this.stockSearch.keyword = keyword;
            this.stockSearch.isSearching = keyword.length > 0;
            this.searchStocks(keyword);
        });

        // 查看自选按钮
        document.getElementById('watchlist-toggle-btn').addEventListener('click', () => this.toggleWatchlistMode());

        // 股票列表排序
        document.querySelectorAll('.stock-list-header .sortable').forEach(header => {
            header.addEventListener('click', (e) => {
                const field = e.currentTarget.dataset.sort;
                this.handleSortClick(field);
            });
        });

        // 交易输入
        document.getElementById('buy-code').addEventListener('input', (e) => this.onTradeCodeInput(e.target.value, 'buy'));
        document.getElementById('sell-code').addEventListener('input', (e) => this.onTradeCodeInput(e.target.value, 'sell'));
        document.getElementById('buy-price').addEventListener('input', () => { this.markTradePriceTouched('buy'); this.updateTradeEstimate('buy'); });
        document.getElementById('buy-quantity').addEventListener('input', () => this.updateTradeEstimate('buy'));
        document.getElementById('sell-price').addEventListener('input', () => { this.markTradePriceTouched('sell'); this.updateTradeEstimate('sell'); });
        document.getElementById('sell-quantity').addEventListener('input', () => this.updateTradeEstimate('sell'));

        // 数量快捷按钮
        document.querySelectorAll('.quantity-btns button').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const panel = e.target.closest('.trade-form');
                const type = panel.id === 'buy-panel' ? 'buy' : 'sell';
                this.setTradeQuantity(type, parseFloat(e.target.dataset.ratio));
            });
        });

        // 交易确认
        document.getElementById('confirm-buy-btn').addEventListener('click', () => this.executeTrade('buy'));
        document.getElementById('confirm-sell-btn').addEventListener('click', () => this.executeTrade('sell'));

        // 快捷交易
        document.getElementById('quick-buy-btn').addEventListener('click', () => {
            this.switchTab('trade');
            document.querySelector('[data-trade="buy"]').click();
            if (this.selectedStock) {
                document.getElementById('buy-code').value = this.selectedStock.code;
                this.onTradeCodeInput(this.selectedStock.code, 'buy');
            }
        });

        document.getElementById('quick-sell-btn').addEventListener('click', () => {
            this.switchTab('trade');
            document.querySelector('[data-trade="sell"]').click();
            if (this.selectedStock) {
                document.getElementById('sell-code').value = this.selectedStock.code;
                this.onTradeCodeInput(this.selectedStock.code, 'sell');
            }
        });

        // 添加自选
        document.getElementById('add-watch-btn').addEventListener('click', () => this.toggleWatchlist());

        // 设置
        document.getElementById('settings-btn').addEventListener('click', () => {
            // 同步当前主题到选择器
            const themeSelect = document.getElementById('theme-select');
            if (themeSelect && this.currentUser) {
                themeSelect.value = this.currentUser.theme || 'dark';
            }
            document.getElementById('settings-modal').classList.add('active');
        });
        document.getElementById('close-settings').addEventListener('click', () => {
            document.getElementById('settings-modal').classList.remove('active');
        });
        document.getElementById('theme-select').addEventListener('change', (e) => this.setTheme(e.target.value));
        document.getElementById('refresh-rate').addEventListener('change', (e) => {
            this.refreshRate = parseInt(e.target.value);
            // 保存刷新速度设置到用户数据
            if (this.currentUser) {
                // 修改原始用户数据
                this.users[this.currentUser.username].refreshRate = this.refreshRate;
                // 同时更新当前用户对象
                this.currentUser.refreshRate = this.refreshRate;
                this.saveUsers();
            }
            this.startMarketSimulation();
        });

        // 时间控制（设置面板）
        document.getElementById('time-pause-btn').addEventListener('click', () => this.toggleTimePause());
        document.getElementById('time-skip-btn').addEventListener('click', () => this.skipTime());

        // 主题切换
        document.getElementById('theme-toggle').addEventListener('click', () => this.toggleTheme());

        // 自动交易标签切换
        document.querySelectorAll('.auto-trade-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                document.querySelectorAll('.auto-trade-tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.auto-trade-form').forEach(f => f.classList.remove('active'));
                e.target.classList.add('active');
                document.getElementById(`${e.target.dataset.tab}-panel`).classList.add('active');
                
                // 当切换到交易记录标签时，更新统计数据和交易记录
                if (e.target.dataset.tab === 'history') {
                    this.updateAutoTradeStats();
                }
            });
        });

        // 自动交易输入
        document.getElementById('auto-code').addEventListener('input', (e) => this.onAutoTradeCodeInput(e.target.value));
        document.getElementById('auto-price-type').addEventListener('change', (e) => {
            document.getElementById('auto-limit-price').disabled = e.target.value === 'market';
        });

        // 交易方向改变时更新触发条件类型选项
        document.querySelectorAll('input[name="auto-direction"]').forEach(radio => {
            radio.addEventListener('change', (e) => this.onAutoTradeDirectionChange(e.target.value));
        });

        // 自动交易数量快捷按钮
        document.querySelectorAll('#condition-panel .quantity-btns button').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.setAutoTradeQuantity(parseFloat(e.target.dataset.ratio));
            });
        });

        // 自动交易控制按钮
        document.getElementById('start-auto-trade-btn').addEventListener('click', () => this.startAutoTrade());
        document.getElementById('pause-auto-trade-btn').addEventListener('click', () => this.pauseAutoTrade());
        document.getElementById('stop-auto-trade-btn').addEventListener('click', () => this.stopAutoTrade());
        document.getElementById('add-auto-stock-btn').addEventListener('click', () => this.addAutoTradeStock());
        document.getElementById('reset-auto-trade-config-btn').addEventListener('click', () => this.resetAutoTradeConfig());

        // 存档操作（导入/导出入口集中在选择存档页）
        document.getElementById('import-single-save-btn').addEventListener('click', () => this.importSave('single'));
        document.getElementById('import-all-data-btn').addEventListener('click', () => this.importSave('all'));
        document.getElementById('export-all-data-btn').addEventListener('click', () => this.exportAllData());
        // 修改密码 / 注销账户在选择存档页同样可用
        document.getElementById('change-password-btn-save').addEventListener('click', () => this.showChangePasswordModal());
        document.getElementById('delete-account-btn-save').addEventListener('click', () => this.deleteAccount());
        document.getElementById('switch-save-btn').addEventListener('click', () => this.showSaveSelect());
        document.getElementById('logout-from-profile-btn').addEventListener('click', () => this.logout());
        document.getElementById('delete-account-btn').addEventListener('click', () => this.deleteAccount());

        // 调试面板
        document.getElementById('close-debug').addEventListener('click', () => {
            document.getElementById('debug-modal').classList.remove('active');
        });
        document.getElementById('set-fund-btn').addEventListener('click', () => this.debugSetFund());
        document.getElementById('unlock-achievement-btn').addEventListener('click', () => this.debugUnlockAchievement());
        document.getElementById('unlock-all-achievements-btn').addEventListener('click', () => this.debugUnlockAllAchievements());
        document.getElementById('clear-all-achievements-btn').addEventListener('click', () => this.debugClearAllAchievements());
        document.getElementById('clear-selected-achievements-btn').addEventListener('click', () => this.debugClearSelectedAchievements());
        document.getElementById('reset-kline-btn').addEventListener('click', () => this.openResetKLineModal());
        document.getElementById('reset-market-btn').addEventListener('click', () => this.debugResetMarket());
        document.getElementById('clear-game-btn').addEventListener('click', () => this.debugClearGame());
        
        // 时间控制
        document.getElementById('set-time-btn').addEventListener('click', () => this.debugSetTime());
        document.getElementById('time-preset-morning-open').addEventListener('click', () => this.debugSetTimePreset('morning-open'));
        document.getElementById('time-preset-early').addEventListener('click', () => this.debugSetTimePreset('early'));
        document.getElementById('time-preset-morning-close').addEventListener('click', () => this.debugSetTimePreset('morning-close'));
        document.getElementById('time-preset-late').addEventListener('click', () => this.debugSetTimePreset('late'));
        document.getElementById('time-preset-afternoon').addEventListener('click', () => this.debugSetTimePreset('afternoon'));
        document.getElementById('time-preset-close').addEventListener('click', () => this.debugSetTimePreset('close'));
        document.getElementById('time-preset-random').addEventListener('click', () => this.debugSetTimePreset('random'));

        // 个人主页调试入口 (连续点击5次)
        const profileHeader = document.querySelector('.profile-header');
        profileHeader.addEventListener('click', () => {
            this.debugClickCount++;
            if (this.debugClickTimer) clearTimeout(this.debugClickTimer);
            this.debugClickTimer = setTimeout(() => {
                this.debugClickCount = 0;
            }, 2000);
            if (this.debugClickCount >= 5) {
                this.debugClickCount = 0;
                this.showDebugPanel();
            }
        });
        // 禁用右键菜单
        profileHeader.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            return false;
        });

        // 密码修改功能
        document.getElementById('change-password-btn').addEventListener('click', () => this.showChangePasswordModal());
        document.getElementById('cancel-password-change').addEventListener('click', () => this.hideChangePasswordModal());
        document.getElementById('submit-password-change').addEventListener('click', () => this.changePassword());

        // 新手教程
        document.getElementById('skip-tutorial').addEventListener('click', () => this.endTutorial());
        document.getElementById('next-tutorial').addEventListener('click', () => this.nextTutorial());

        // 语言切换：设置面板下拉
        const languageSelect = document.getElementById('language-select');
        if (languageSelect) {
            languageSelect.addEventListener('change', (e) => {
                I18n.setLanguage(e.target.value);
            });
        }

        // 语言切换：登录页右上角图标按钮（中英文互切）
        const authLangToggle = document.getElementById('auth-lang-toggle');
        if (authLangToggle) {
            authLangToggle.addEventListener('click', () => {
                I18n.toggleLanguage();
            });
        }

        // 图表控制按钮
        document.getElementById('chart-zoom-in').addEventListener('click', () => this.chartZoomIn());
        document.getElementById('chart-zoom-out').addEventListener('click', () => this.chartZoomOut());
        document.getElementById('chart-reset').addEventListener('click', () => this.chartReset());

        // 键盘事件监听（用于Shift键框选提示）
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Shift') {
                const canvas = document.getElementById('kline-canvas');
                if (canvas) canvas.classList.add('shift-key');
                const volumeCanvas = document.getElementById('volume-canvas');
                if (volumeCanvas) volumeCanvas.classList.add('shift-key');
            }
        });
        document.addEventListener('keyup', (e) => {
            if (e.key === 'Shift') {
                const canvas = document.getElementById('kline-canvas');
                if (canvas) canvas.classList.remove('shift-key');
                const volumeCanvas = document.getElementById('volume-canvas');
                if (volumeCanvas) volumeCanvas.classList.remove('shift-key');
            }
        });

        // 图表交互事件
        const canvas = document.getElementById('kline-canvas');
        if (canvas) {
            // 禁用右键菜单
            canvas.addEventListener('contextmenu', (e) => e.preventDefault());
            
            // 鼠标滚轮缩放
            canvas.addEventListener('wheel', (e) => this.onChartWheel(e), { passive: false });
            
            // 鼠标拖拽和框选
            canvas.addEventListener('mousedown', (e) => this.onChartMouseDown(e));
            canvas.addEventListener('mousemove', (e) => this.onChartMouseMove(e));
            canvas.addEventListener('mouseup', (e) => this.onChartMouseUp(e));
            canvas.addEventListener('mouseleave', (e) => this.onChartMouseUp(e));
            
            // 触摸支持
            canvas.addEventListener('touchstart', (e) => this.onChartTouchStart(e), { passive: false });
            canvas.addEventListener('touchmove', (e) => this.onChartTouchMove(e), { passive: false });
            canvas.addEventListener('touchend', (e) => this.onChartTouchEnd(e));
        }

        // 成交量图表交互事件
        const volumeCanvas = document.getElementById('volume-canvas');
        if (volumeCanvas) {
            volumeCanvas.addEventListener('contextmenu', (e) => e.preventDefault());
            volumeCanvas.addEventListener('wheel', (e) => this.onChartWheel(e), { passive: false });
            volumeCanvas.addEventListener('mousedown', (e) => this.onChartMouseDown(e));
            volumeCanvas.addEventListener('mousemove', (e) => this.onChartMouseMove(e));
            volumeCanvas.addEventListener('mouseup', (e) => this.onChartMouseUp(e));
            volumeCanvas.addEventListener('mouseleave', (e) => this.onChartMouseUp(e));
            volumeCanvas.addEventListener('touchstart', (e) => this.onChartTouchStart(e), { passive: false });
            volumeCanvas.addEventListener('touchmove', (e) => this.onChartTouchMove(e), { passive: false });
            volumeCanvas.addEventListener('touchend', (e) => this.onChartTouchEnd(e));
        }

        // 股票列表独立滚动处理
        const stockList = document.getElementById('stock-list');
        if (stockList) {
            // 阻止滚轮事件冒泡到父元素
            stockList.addEventListener('wheel', (e) => {
                const isAtTop = stockList.scrollTop === 0;
                const isAtBottom = stockList.scrollTop + stockList.clientHeight >= stockList.scrollHeight - 1;
                
                // 如果向上滚动且在顶部，或向下滚动且在底部，阻止默认行为
                if ((e.deltaY < 0 && isAtTop) || (e.deltaY > 0 && isAtBottom)) {
                    e.preventDefault();
                } else {
                    // 否则阻止事件冒泡，实现独立滚动
                    e.stopPropagation();
                }
            }, { passive: false });
            
            // 触摸设备处理
            let touchStartY = 0;
            let touchStartScrollTop = 0;
            
            stockList.addEventListener('touchstart', (e) => {
                touchStartY = e.touches[0].clientY;
                touchStartScrollTop = stockList.scrollTop;
            }, { passive: true });
            
            stockList.addEventListener('touchmove', (e) => {
                const touchY = e.touches[0].clientY;
                const deltaY = touchStartY - touchY;
                const newScrollTop = touchStartScrollTop + deltaY;
                
                const isAtTop = newScrollTop <= 0;
                const isAtBottom = newScrollTop + stockList.clientHeight >= stockList.scrollHeight;
                
                // 只有在列表内部滚动时才阻止默认行为
                if (!isAtTop && !isAtBottom) {
                    e.stopPropagation();
                }
            }, { passive: true });
        }

        // 窗口大小改变时重新绘制图表（带防抖）
        let resizeTimeout;
        let lastWidth = window.innerWidth;
        let lastHeight = window.innerHeight;
        
        const handleResize = () => {
            const currentWidth = window.innerWidth;
            const currentHeight = window.innerHeight;
            
            if (currentWidth !== lastWidth || currentHeight !== lastHeight) {
                lastWidth = currentWidth;
                lastHeight = currentHeight;
                
                if (this.selectedStock) {
                    const data = this.stockData.get(this.selectedStock.code);
                    if (data) {
                        requestAnimationFrame(() => {
                            this.drawKLine(data);
                            this.drawVolume(data);
                        });
                    }
                }
            }
        };
        
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(handleResize, 50);
        }, { passive: true });
        
        // 使用MutationObserver检测DOM变化
        const observer = new MutationObserver(() => {
            handleResize();
        });
        
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['style', 'class']
        });
    }

    // 登录
    // P1-4 Fix: never log password, username, or password hashes to console.
    // Uses async PBKDF2 verification; legacy 8-char hashes are auto-upgraded on success.
    // 大小写不敏感地查找已有用户名，返回 { key, user }；找不到返回 null。
    // requireUnique=true 时，若历史数据中存在多个仅大小写不同的账号（本修复
    // 之前注册的），则返回 null，避免大小写不敏感登录产生歧义。
    findUserIgnoreCase(username, requireUnique = false) {
        if (typeof username !== 'string' || !username) return null;
        const lower = username.toLowerCase();
        const matches = Object.keys(this.users || {}).filter(k => k.toLowerCase() === lower);
        if (matches.length === 0) return null;
        if (requireUnique && matches.length > 1) return null;
        const key = matches.includes(username) ? username : matches[0];
        return { key, user: this.users[key] };
    }

    async login() {
        const username = document.getElementById('login-username').value.trim();
        const password = document.getElementById('login-password').value;
        const errorEl = document.getElementById('login-error');
        // Bug fix: clear the stale error immediately (the PBKDF2 verify below is async and
        // used to leave the previous message on screen for ~360ms).
        errorEl.textContent = '';
        errorEl.style.color = '';

        if (!username || !password) {
            errorEl.textContent = I18n.t('auth.loginError.empty');
            return;
        }

        // Bug fix: 用户名大小写不敏感解析。精确匹配优先；未命中时若忽略大小写后
        // 恰好对应唯一已有账号，则登录到该账号。currentUser.username 使用存储键，
        // 保证后续 this.users[currentUser.username] 的键值查找依然一致。
        const exactUser = this.users[username];
        let user = null;
        let userKey = username;
        if (exactUser) {
            user = exactUser;
        } else {
            const ci = this.findUserIgnoreCase(username, true);
            if (ci) {
                userKey = ci.key;
                user = ci.user;
            }
        }
        if (!user) {
            // P2-9 Fix: do not reveal whether a username exists (account enumeration).
            // Use the same message as a wrong password.
            errorEl.textContent = I18n.t('auth.loginError.wrongPassword');
            return;
        }

        // Bug fix: show a loading state while the async KDF runs, and keep the button
        // disabled so a double click cannot queue two verifications.
        const loginBtn = document.getElementById('login-btn');
        if (loginBtn) loginBtn.disabled = true;
        errorEl.textContent = I18n.t('auth.processing');
        let verifyResult;
        try {
            verifyResult = await Crypto.verifyPassword(password, user.passwordHash);
        } catch (e) {
            errorEl.textContent = I18n.t('auth.loginError.wrongPassword');
            return;
        } finally {
            if (loginBtn) loginBtn.disabled = false;
        }
        errorEl.textContent = '';
        if (!verifyResult || !verifyResult.valid) {
            errorEl.textContent = I18n.t('auth.loginError.wrongPassword');
            return;
        }

        // P1-4 Fix: if the stored hash was legacy, transparently upgrade it.
        if (verifyResult.upgradedHash) {
            user.passwordHash = verifyResult.upgradedHash;
            this.users[userKey] = user;
            try { this.saveUsers(); } catch (_) { /* best-effort */ }
        }

        this.currentUser = { username: userKey, ...user };
        localStorage.setItem('stock_simulator_last_user', userKey);
        
        // 恢复用户主题偏好（不触发保存，避免循环）
        const savedTheme = this.currentUser.theme || 'dark';
        document.body.className = savedTheme === 'light' ? 'light-theme' : savedTheme === 'festival' ? 'festival-theme' : '';
        const themeToggle = document.getElementById('theme-toggle');
        if (themeToggle) {
            themeToggle.textContent = savedTheme === 'light' ? '☀️' : savedTheme === 'festival' ? '🎉' : '🌙';
        }
        
        // 恢复用户刷新速度设置
        this.refreshRate = this.currentUser.refreshRate || 3000;
        const refreshRateSelect = document.getElementById('refresh-rate');
        if (refreshRateSelect) {
            refreshRateSelect.value = this.refreshRate;
        }

        // 恢复用户语言偏好
        if (this.currentUser.lang) {
            I18n.setLanguage(this.currentUser.lang, true);
        }

        this.showSaveSelect();
    }

    // 注册
    // P1-4 Fix: never log password/username/confirm length to console.
    // Uses async PBKDF2 hashing (with random per-user salt).
    async register() {
        const username = document.getElementById('reg-username').value.trim();
        const password = document.getElementById('reg-password').value;
        const confirm = document.getElementById('reg-confirm').value;
        const errorEl = document.getElementById('reg-error');
        // Bug fix: clear the stale error immediately; the PBKDF2 hash below takes ~360ms
        // and used to leave the previous message visible with no loading feedback.
        errorEl.textContent = '';
        errorEl.style.color = '';

        if (!username || username.length < 2 || username.length > 20) {
            errorEl.textContent = I18n.t('auth.regError.usernameLength');
            return;
        }

        // P1-7 Fix: enforce the same character whitelist / reserved-name blacklist as the
        // import path. register() previously only checked length, so '__proto__' could be
        // registered directly and hijack this.users' prototype.
        if (!USERNAME_PATTERN.test(username) || RESERVED_USERNAMES.has(username)) {
            errorEl.textContent = I18n.t('auth.regError.usernameInvalidChars');
            return;
        }

        if (!password || password.length < 6 || password.length > 20) {
            errorEl.textContent = I18n.t('auth.regError.passwordLength');
            return;
        }

        if (password !== confirm) {
            errorEl.textContent = I18n.t('auth.regError.passwordMismatch');
            return;
        }

        // Bug fix: 用户名大小写不敏感去重。此前 "Admin"/"admin"/"ADMIN" 可以同时
        // 注册，存在冒名风险；现在只要忽略大小写后与已有用户名相同即拒绝。
        if (this.users[username] || this.findUserIgnoreCase(username)) {
            errorEl.textContent = I18n.t('auth.regError.userExists');
            return;
        }

        // Bug fix: loading state + disabled button while the async KDF runs.
        const regBtn = document.getElementById('register-btn');
        if (regBtn) regBtn.disabled = true;
        errorEl.textContent = I18n.t('auth.processing');
        let passwordHash;
        try {
            passwordHash = await Crypto.hashAsync(password);
        } catch (e) {
            errorEl.textContent = I18n.t('auth.regError.generic');
            return;
        } finally {
            if (regBtn) regBtn.disabled = false;
        }

        this.users[username] = {
            passwordHash,
            createdAt: Date.now(),
            saves: [],
            achievements: [],
            tutorialCompleted: false,
            theme: 'dark',  // 默认主题
            refreshRate: 3000,  // 默认刷新速度 3秒
            lang: I18n.getCurrentLanguage(),  // 默认语言：跟随当前选择
            stats: {
                totalGames: 0,
                totalTrades: 0,
                totalProfit: 0,
                totalLoss: 0
            }
        };

        // P1-10 Fix: surface a persistence failure instead of leaving a phantom in-memory
        // account that disappears on reload.
        if (!this.saveUsers()) {
            delete this.users[username];
            errorEl.textContent = I18n.t('auth.regError.generic');
            return;
        }
        errorEl.textContent = I18n.t('auth.regSuccess');
        errorEl.style.color = '#52c41a';

        setTimeout(() => {
            document.querySelector('[data-tab="login"]').click();
            errorEl.textContent = '';
            errorEl.style.color = '';
        }, 1500);
    }

    // 登出
    logout() {
        // 显示确认对话框
        if (!confirm(I18n.t('logout.confirm'))) {
            return;
        }
        
        // P1-7 Fix: tear down every timer *and* any pending skip chain through the
        // shared helper. Leaving skipMode alive let finishSkip() rebuild the market
        // interval after logout, ticking against an empty stockData forever.
        this.teardownSession();
        
        // 清除当前用户会话数据
        this.currentUser = null;
        this.currentSave = null;
        
        // 清除自动交易状态
        this.autoTrade = {
            enabled: false,
            paused: false,
            configs: [],
            stats: {
                totalTrades: 0,
                successTrades: 0,
                failedTrades: 0,
                totalPnl: 0
            },
            records: [],
            lastTradeTimes: {},
            interval: null
        };
        
        // 清除市场数据
        this.stockData.clear();
        this.marketTickCount = 0;
        
        // 清除本地存储中的身份验证信息
        localStorage.removeItem('stock_simulator_last_user');
        
        // 清除可能存在的临时数据
        this.currentTab = 'position';
        this.selectedStock = null;
        
        // #23 Fix: the login screen must not inherit the previous account's theme.
        document.body.className = '';
        const themeToggleEl = document.getElementById('theme-toggle');
        if (themeToggleEl) themeToggleEl.textContent = '🌙';
        
        // 显示成功提示
        this.showNotification(I18n.t('auth.logoutSuccess'));
        
        // 重定向到登录页面
        this.showScreen('auth-screen');
        
        // 清空登录表单
        document.getElementById('login-username').value = '';
        document.getElementById('login-password').value = '';
        const errorEl = document.getElementById('login-error');
        if (errorEl) {
            errorEl.textContent = '';
        }
    }

    // 删除用户账户
    deleteAccount() {
        // 显示确认对话框
        const confirmMessage = I18n.t('deleteAccount.confirmText');
        const userInput = prompt(confirmMessage);

        // #23 Fix: cancelling the prompt (null) is not a wrong input and must not raise
        // the "输入不正确" error; just abort silently.
        if (userInput === null) {
            return;
        }

        // 验证用户输入
        if (userInput.trim() !== 'DELETE') {
            alert(I18n.t('deleteAccount.inputMismatch'));
            return;
        }

        // 再次确认
        if (!confirm(I18n.t('deleteAccount.warning'))) {
            return;
        }

        // P1-7 Fix: deleting an account is a session exit too. Without this the
        // auto-trade interval survived with currentSave === null and threw a TypeError
        // on every tick until the page was closed.
        this.teardownSession();

        // 删除用户账户
        if (this.currentUser && this.currentUser.username) {
            const username = this.currentUser.username;
            delete this.users[username];
            this.saveUsers();

            // 清除当前用户状态
            this.currentUser = null;
            this.currentSave = null;
            localStorage.removeItem('stock_simulator_last_user');

            // 显示成功消息
            alert(I18n.t('deleteAccount.success'));

            // 重定向到登录页面
            this.showScreen('auth-screen');
        }
    }

    // 检查自动登录
    checkAutoLogin() {
        const lastUser = localStorage.getItem('stock_simulator_last_user');
        if (lastUser && this.users[lastUser]) {
            document.getElementById('login-username').value = lastUser;
        }
    }

    // 显示存档选择
    showSaveSelect() {
        // P1-8 Fix: leaving the game for the save list must stop every running timer,
        // otherwise the previous save keeps ticking (and may stack on the next load).
        // P1-7 Fix: route through teardownSession() so a pending skip chain is cancelled too.
        this.teardownSession();
        debugLog('showSaveSelect called');
        this.showScreen('save-select-screen');
        this.renderSaveList();
    }

    // 渲染存档列表
    renderSaveList() {
        const listEl = document.getElementById('save-list');
        listEl.innerHTML = '';

        const saves = this.currentUser.saves || [];
        if (saves.length === 0) {
            listEl.innerHTML = `<p style="text-align:center;color:var(--text-secondary);padding:40px;">${I18n.t('save.empty')}</p>`;
            return;
        }

        // #16 Fix: surface capacity. A save carries the whole market snapshot (~80KB once
        // encoded), so the quota is reached long before the theoretical limit; warning the
        // player up front avoids the situation where every write suddenly fails.
        const capacity = document.createElement('p');
        capacity.className = 'save-capacity';
        const usedSlots = Array.isArray(saves) ? saves.length : 0;
        let storedBytes = 0;
        try {
            const raw = localStorage.getItem('stock_simulator_users');
            storedBytes = raw ? raw.length : 0;
        } catch (_) { storedBytes = 0; }
        capacity.textContent = I18n.t(storedBytes >= STORAGE_WARN_BYTES ? 'save.capacityWarn' : 'save.capacity', { used: usedSlots, max: MAX_SAVES_PER_USER });
        listEl.appendChild(capacity);

        saves.forEach((save, index) => {
            const item = document.createElement('div');
            item.className = 'save-item';
            // P0-1 Fix: escape user-controlled save name to prevent XSS
            // Report fix #1/#2: displaySaveName() trims and falls back to the default
            // name ("存档 N") for blank/whitespace-only legacy names; the title
            // attribute exposes the full name when the CSS ellipsis truncates it.
            const saveName = escapeHtml(displaySaveName(save, index));
            const dateStr = escapeHtml(new Date(save.createdAt).toLocaleDateString(I18n.getCurrentLanguage()));
            const fundText = escapeHtml(this.formatMoney(save.fund));
            const enterText = escapeHtml(I18n.t('common.enter'));
            const exportText = escapeHtml(I18n.t('common.export'));
            const renameText = escapeHtml(I18n.t('common.rename'));
            const deleteText = escapeHtml(I18n.t('common.delete'));
            item.innerHTML = `
                <div class="save-info">
                    <h4 class="save-name" title="${saveName}">${saveName}</h4>
                    <p>${I18n.t('save.info', { fund: fundText, date: dateStr })}</p>
                </div>
                <div class="save-actions">
                    <button class="btn-enter" data-index="${index}">${enterText}</button>
                    <button class="btn-export" data-index="${index}">${exportText}</button>
                    <button class="btn-rename" data-index="${index}">${renameText}</button>
                    <button class="btn-delete" data-index="${index}">${deleteText}</button>
                </div>
            `;
            listEl.appendChild(item);
        });

        listEl.querySelectorAll('.btn-enter').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.loadSave(parseInt(e.target.dataset.index));
            });
        });

        listEl.querySelectorAll('.btn-export').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.exportSingleSave(parseInt(e.target.dataset.index));
            });
        });

        listEl.querySelectorAll('.btn-rename').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.showRenameSaveModal(parseInt(e.target.dataset.index));
            });
        });

        listEl.querySelectorAll('.btn-delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (confirm(I18n.t('save.deleteConfirm'))) {
                    this.deleteSave(parseInt(e.target.dataset.index));
                }
            });
        });
    }

    // 显示设置界面
    showSetup() {
        // #16 Fix: refuse to open the setup screen once the list is full instead of
        // creating a save that pushes localStorage over quota (after which *every* write
        // fails, including the ones for existing saves).
        if (this.currentUser && Array.isArray(this.currentUser.saves) &&
            this.currentUser.saves.length >= MAX_SAVES_PER_USER) {
            alert(I18n.t('save.limitReached', { max: MAX_SAVES_PER_USER }));
            this.showSaveSelect();
            return;
        }
        this.showScreen('game-setup-screen');
    }

    // 开始游戏
    startGame() {
        const fundType = document.querySelector('input[name="fund-type"]:checked').value;
        let initialFund = 0;

        if (fundType === 'random') {
            initialFund = Math.floor(Math.random() * 150 + 50) * 10000; // 50-200万
        } else {
            const customRaw = document.getElementById('custom-fund').value;
            const custom = Number(customRaw);
            // P0-1 Fix: validate the raw string and require a finite value in [10, 10000].
            // The HTML max attribute does not stop hand-typed input, and 1e400 parses to
            // Infinity; either one previously slipped through as a "valid" initial fund.
            if (typeof customRaw !== 'string' || customRaw.trim() === '' ||
                !Number.isFinite(custom) || custom < 10 || custom > 10000) {
                alert(I18n.t('setup.fundInvalid'));
                return;
            }
            initialFund = custom * 10000;
        }
        if (!Number.isFinite(initialFund) || initialFund <= 0) {
            alert(I18n.t('setup.fundInvalid'));
            return;
        }

        // P0-1 Fix: validate the fee inputs BEFORE building the save. A blank field
        // (parseFloat('') === NaN) or '1e400' (Infinity) used to enter settings.buyFee
        // unchecked. Every later buy then computed totalCost = amount + NaN, and
        // `NaN > fund` is always false, silently bypassing the funds check; round2()
        // then zeroed the balance. parseFee returns null for anything invalid.
        const parseFee = (id) => {
            const raw = document.getElementById(id).value;
            const percent = Number(raw);
            if (typeof raw !== 'string' || raw.trim() === '' ||
                !Number.isFinite(percent) || percent < 0 || percent > 1) {
                return null;
            }
            return percent / 100;
        };
        const buyFee = parseFee('buy-fee');
        const sellFee = parseFee('sell-fee');
        if (buyFee === null || sellFee === null) {
            alert(I18n.t('setup.feeInvalid'));
            return;
        }

        const save = {
            id: Crypto.uuid(),
            createdAt: Date.now(),
            fund: initialFund,
            initialFund: initialFund,
            holdings: {},
            records: [],
            watchlist: [],
            achievements: [],
            settings: {
                buyFee: buyFee,
                sellFee: sellFee,
                t0Mode: document.getElementById('t0-mode').checked,
                tradeUnit: parseInt(document.querySelector('input[name="trade-unit"]:checked').value)
            },
            dayTrades: {},
            gameStats: {
                tradeCount: 0,
                profitCount: 0,
                lossCount: 0,
                maxHoldings: 0,
                sectorsTraded: new Set(),
                dayTrades: 0,
                totalFees: 0,
                realizedProfit: 0,
                realizedLoss: 0
            },
            autoTrade: {
                enabled: false,
                paused: false,
                configs: [],
                stats: {
                    totalTrades: 0,
                    successTrades: 0,
                    failedTrades: 0,
                    totalPnl: 0
                },
                records: [],
                lastTradeTimes: {}
            }
        };

        // #16 Fix: belt-and-braces guard (the setup screen is normally blocked first).
        if (Array.isArray(this.currentUser.saves) && this.currentUser.saves.length >= MAX_SAVES_PER_USER) {
            alert(I18n.t('save.limitReached', { max: MAX_SAVES_PER_USER }));
            return;
        }
        this.currentUser.saves.push(save);
        this.saveUsers();
        // 新开局的随机起始时间由 loadSave() 在“无持久化行情”时统一处理，
        // 避免与 loadSave() 内部的状态重置相互覆盖。
        this.loadSave(this.currentUser.saves.length - 1);
    }

    // 加载存档
    loadSave(index) {
        this.currentSave = this.currentUser.saves[index];
        this.currentSaveIndex = index;
        
        // 取消进行中的时间跳过，避免跳过流程与新存档互相干扰
        this.cancelSkip();
        // P1-7/P1-8: 切换存档前先停掉所有定时器，避免旧存档的行情/自动交易继续运行
        this.stopAllTimers();

        // Bug fix: reset every session-scoped clock/pause field BEFORE restoring the new
        // save. Previously a save paused in slot A left gameTimePaused = true, so a freshly
        // created save B opened already "paused" with a frozen market.
        this.gameTime = {
            hour: 9,
            minute: 30,
            manualSet: false,
            minutesPerTick: 1,
            dayIndex: 0
        };
        this.lastTradingDayIndex = 0;
        this.marketTickCount = 0;
        this.tradingDayCount = 0;
        this.gameTimePaused = false;
        this.historySeeds = {};
        this.limitManager.circuitBreakerStatus.clear();
        
        // 确保必要字段存在（兼容旧存档）
        if (!this.currentSave.watchlist) {
            this.currentSave.watchlist = [];
        }
        if (!this.currentSave.holdings) {
            this.currentSave.holdings = {};
        }
        if (!this.currentSave.records) {
            this.currentSave.records = [];
        }
        if (!this.currentSave.achievements) {
            this.currentSave.achievements = [];
        }
        if (!this.currentSave.gameStats) {
            this.currentSave.gameStats = {
                tradeCount: 0,
                profitCount: 0,
                lossCount: 0,
                maxHoldings: 0,
                sectorsTraded: new Set(),
                dayTrades: 0,
                totalFees: 0,
                realizedProfit: 0,
                realizedLoss: 0
            };
        }
        // P1-3 Fix: validate settings (tradeUnit, fees) on load. Defensive: bad settings here would
        // later cause division-by-zero or NaN quantities. Default to safe values.
        if (!this.currentSave.settings || typeof this.currentSave.settings !== 'object') {
            this.currentSave.settings = { buyFee: 0.0003, sellFee: 0.0013, t0Mode: false, tradeUnit: 1 };
        } else {
            const s = this.currentSave.settings;
            if (typeof s.buyFee !== 'number' || !isFinite(s.buyFee) || s.buyFee < 0 || s.buyFee > 0.01) s.buyFee = 0.0003;
            if (typeof s.sellFee !== 'number' || !isFinite(s.sellFee) || s.sellFee < 0 || s.sellFee > 0.01) s.sellFee = 0.0013;
            if (typeof s.t0Mode !== 'boolean') s.t0Mode = false;
            if (![1, 100].includes(s.tradeUnit)) s.tradeUnit = 1;
        }
        // P1-5 Fix: rehydrate sectorsTraded from the persisted array form (see
        // serializeUsersData). normalizeSectorsTraded also accepts a Set or the legacy
        // `{sector: true}` dictionary, so old and new saves both load correctly.
        if (!(this.currentSave.gameStats.sectorsTraded instanceof Set)) {
            this.currentSave.gameStats.sectorsTraded = normalizeSectorsTraded(this.currentSave.gameStats.sectorsTraded);
        }
        
        // 确保自动交易配置存在（兼容旧存档）
        if (!this.currentSave.autoTrade) {
            this.currentSave.autoTrade = {
                enabled: false,
                paused: false,
                configs: [],
                stats: {
                    totalTrades: 0,
                    successTrades: 0,
                    failedTrades: 0,
                    totalPnl: 0
                },
                records: []
            };
        }
        
        // P1-8 Fix: restore the user's refresh rate BEFORE starting any timer that uses it.
        // Previously this happened further down, so the auto-trade interval was created with
        // the previous save's rate.
        this.refreshRate = this.currentUser.refreshRate || 3000;

        // 恢复自动交易状态
        if (this.currentSave.autoTrade) {
            this.autoTrade.configs = this.currentSave.autoTrade.configs || [];
            // 正确映射统计数据，处理旧格式的字段名称
            const savedStats = this.currentSave.autoTrade.stats || {};
            this.autoTrade.stats = {
                totalTrades: savedStats.totalTrades || 0,
                successTrades: savedStats.successTrades || savedStats.profitTrades || 0,
                failedTrades: savedStats.failedTrades || savedStats.lossTrades || 0,
                totalPnl: savedStats.totalPnl || savedStats.totalProfit || 0
            };
            this.autoTrade.records = this.currentSave.autoTrade.records || [];
            // P1 Fix: 冷却时间属于自动交易运行期状态，必须随存档恢复，
            // 否则切换存档即可把冷却时间清零、立即重复触发交易。
            this.autoTrade.lastTradeTimes = this.currentSave.autoTrade.lastTradeTimes || {};
            
            // 加载自动交易状态
            this.autoTrade.enabled = this.currentSave.autoTrade.enabled || false;
            this.autoTrade.paused = this.currentSave.autoTrade.paused || false;
            
            // P1-8 Fix: always clear any timer inherited from the previous save before
            // creating a new one, so switching saves cannot stack intervals.
            if (this.autoTrade.interval) {
                clearInterval(this.autoTrade.interval);
                this.autoTrade.interval = null;
            }
            // 如果自动交易是启用状态且未暂停，启动定时器
            if (this.autoTrade.enabled && !this.autoTrade.paused && this.autoTrade.configs.length > 0) {
                this.autoTrade.interval = setInterval(() => this.checkAutoTradeCondition(), this.refreshRate);
            }
        }
        
        // 加载用户主题偏好（跨浏览器持久化）
        const savedTheme = this.currentUser.theme || 'dark';
        document.body.className = savedTheme === 'light' ? 'light-theme' : savedTheme === 'festival' ? 'festival-theme' : '';
        const themeToggle = document.getElementById('theme-toggle');
        if (themeToggle) {
            themeToggle.textContent = savedTheme === 'light' ? '☀️' : savedTheme === 'festival' ? '🎉' : '🌙';
        }
        
        // 同步主题选择器的值
        const themeSelect = document.getElementById('theme-select');
        if (themeSelect) {
            themeSelect.value = savedTheme;
        }
        
        // 恢复用户刷新速度设置（this.refreshRate 已在启动自动交易定时器之前恢复）
        const refreshRateSelect = document.getElementById('refresh-rate');
        if (refreshRateSelect) {
            refreshRateSelect.value = this.refreshRate;
        }
        
        // S2 Fix: ensure a per-save market seed exists, rebuild the deterministic base,
        // then overlay the persisted live market and game clock.
        if (!Number.isFinite(this.currentSave.marketSeed)) {
            this.currentSave.marketSeed = Math.floor(Math.random() * 0x7FFFFFFF);
        }
        this.initMarketData(this.currentSave.marketSeed);
        this.restoreMarketState();
        // Bug fix: a brand-new save has no persisted market/clock, so give it a random
        // in-session start time here (previously startGame() randomised first, but that
        // value was then discarded by the reset above).
        if (!this.currentSave.market) {
            this.randomizeGameTime();
        }
        this.showScreen('main-screen');
        
        // 更新自动交易状态UI
        this.updateAutoTradeStatus();
        // 重置搜索状态
        this.stockSearch.keyword = '';
        this.stockSearch.isSearching = false;
        // 清空搜索框
        const searchInput = document.getElementById('stock-search');
        if (searchInput) {
            searchInput.value = '';
        }
        this.renderStockList();
        this.selectStock(StockPool[0]);
        this.startMarketSimulation();
        this.updateTradeAvailable();
        
        // 恢复自动交易界面状态
        this.renderAutoTradeStockList();
        this.updateAutoTradeStatus();
        this.updateAutoTradeStats();
        
        // 初始化交易方向触发条件类型选项
        const defaultDirection = document.querySelector('input[name="auto-direction"]:checked');
        if (defaultDirection) {
            this.onAutoTradeDirectionChange(defaultDirection.value);
        }
        
        // 重置自选模式
        this.watchlistMode = false;
        const watchlistBtn = document.getElementById('watchlist-toggle-btn');
        if (watchlistBtn) {
            watchlistBtn.classList.remove('active');
            watchlistBtn.textContent = I18n.t('market.watchlistView');
        }
        
        // 刷新个人资料页面数据（包括成就墙）
        this.updateProfile();
        
        // 检查是否首次游戏 - 延迟启动教程确保DOM已渲染
        // 使用 !! 确保 undefined 也被视为 false
        if (this.currentUser.tutorialCompleted !== true) {
            setTimeout(() => this.startTutorial(), 500);
        }

        // #15 Fix: a freshly loaded save starts with market-following price fields.
        this.tradePriceTouched = { buy: false, sell: false };
        // #13 Fix: this is the persisted state subsequent merges diff against.
        this.syncSaveBaseline();
    }

    // 删除存档
    deleteSave(index) {
        this.currentUser.saves.splice(index, 1);
        this.saveUsers();
        this.renderSaveList();
    }

    // 显示修改存档名称模态窗口
    showRenameSaveModal(index) {
        this.renameSaveIndex = index;
        const save = this.currentUser.saves[index];
        // Report fix #2: show a trimmed name (or the default) so a whitespace-only
        // legacy name never ends up as an invisible prefill in the input.
        const currentName = displaySaveName(save, index);
        
        const modal = document.getElementById('rename-save-modal');
        const input = document.getElementById('rename-save-input');
        const errorEl = document.getElementById('rename-save-error');
        
        input.value = currentName;
        errorEl.textContent = '';
        modal.classList.add('active');
        
        // 聚焦输入框
        setTimeout(() => input.focus(), 100);
    }

    // 隐藏修改存档名称模态窗口
    hideRenameSaveModal() {
        const modal = document.getElementById('rename-save-modal');
        modal.classList.remove('active');
        this.renameSaveIndex = null;
    }

    // 确认修改存档名称
    confirmRenameSave() {
        const input = document.getElementById('rename-save-input');
        const errorEl = document.getElementById('rename-save-error');
        const newName = input.value.trim();
        
        // 验证输入
        if (!newName) {
            errorEl.textContent = I18n.t('rename.error.empty');
            return;
        }

        if (newName.length < 1 || newName.length > 20) {
            errorEl.textContent = I18n.t('rename.error.length');
            return;
        }

        // 验证字符（允许中英文、数字及常用符号）
        // Bug fix: \s allowed tabs and the literal ""'' were ASCII quotes, so the
        // rename rejected Chinese curly quotes while accepting straight quotes/tabs.
        // Allow curly quotes (U+201C/D, U+2018/9) and a plain space only.
        const validPattern = /^[\u4e00-\u9fa5a-zA-Z0-9 \-_\.，。！？、：\u201c\u201d\u2018\u2019（）【】]+$/;
        if (!validPattern.test(newName)) {
            errorEl.textContent = I18n.t('rename.error.invalid');
            return;
        }
        
        // 更新存档名称
        if (this.renameSaveIndex !== null && this.renameSaveIndex >= 0) {
            const saveRef = this.currentUser.saves[this.renameSaveIndex];
            const previousName = saveRef ? saveRef.name : '';
            const userRef = (this.currentUser.username && this.users[this.currentUser.username])
                ? this.users[this.currentUser.username] : null;

            saveRef.name = newName;
            // 同步到 users 对象
            if (userRef && userRef.saves && userRef.saves[this.renameSaveIndex]) {
                userRef.saves[this.renameSaveIndex].name = newName;
            }

            // #17 Fix: check the write result. Previously "保存数据失败" and "存档名称修改成功"
            // were shown together and the UI kept the new name even though nothing persisted.
            if (!this.saveUsers()) {
                saveRef.name = previousName;
                if (userRef && userRef.saves && userRef.saves[this.renameSaveIndex]) {
                    userRef.saves[this.renameSaveIndex].name = previousName;
                }
                this.renderSaveList();
                errorEl.textContent = I18n.t('save.saveFailedStorage');
                return;
            }

            // 刷新存档列表
            this.renderSaveList();

            // 显示成功提示
            this.showNotification(I18n.t('save.renameSuccess'));

            // 关闭模态窗口
            this.hideRenameSaveModal();
        }
    }

    // 初始化市场数据
    initMarketData(seed) {
        this.stockData.clear();
        // S2 Fix: when a per-save seed is supplied, derive base prices and K-line
        // history from it so they reproduce exactly on reload. Without a seed (first
        // run / debug reset) fall back to Math.random.
        const seeded = Number.isFinite(seed);
        // K-line reset: a stock with a reset salt gets a stream of its own, so re-rolling
        // one stock never shifts any other stock's history.
        const savedSeeds = (this.currentSave && this.currentSave.market && this.currentSave.market.historySeeds) || {};
        this.historySeeds = { ...savedSeeds };
        // P0-2 Fix: build a code -> stock cache once so O(n) `StockPool.find` calls become O(1) lookups
        if (!this._stockPoolByCode) {
            this._stockPoolByCode = new Map();
        }
        this._stockPoolByCode.clear();
        const seenCodes = new Set();
        StockPool.forEach(stock => {
            // P1-9 Fix: fail loudly if the static data ever reintroduces a duplicate code.
            // Array.find() returns the first match while a Map assignment keeps the last,
            // so duplicates silently make manual and auto trades disagree about a stock's
            // industry. Skip any later copy so all lookup paths stay consistent.
            if (seenCodes.has(stock.code)) {
                console.error(`Duplicate stock code detected: ${stock.code} (${stock.name})`);
                return;
            }
            seenCodes.add(stock.code);
            this._stockPoolByCode.set(stock.code, stock);
            const salt = Number(this.historySeeds[stock.code]) || 0;
            const stockRng = seeded ? makeRng(deriveStockSeed(seed, stock.code, salt)) : Math.random;
            const basePrice = this.generateBasePrice(stock, stockRng);
            const history = this.generateHistory(basePrice, stockRng);
            // Reproduce the reset transform so a re-rolled K-line survives a reload
            // byte-for-byte instead of reverting to the raw (un-anchored) walk.
            if (salt) this.applyResetShape(history, basePrice);
            const lastHistory = history[history.length - 1];
            
            // 计算历史成交量的移动平均（最近5日）
            const recentVolumes = history.slice(-5).map(h => h.volume);
            const avgVolume = recentVolumes.length > 0 
                ? Math.floor(recentVolumes.reduce((a, b) => a + b, 0) / recentVolumes.length)
                : Math.floor(stockRng() * 1000000);
            
            this.stockData.set(stock.code, {
                ...stock,
                price: basePrice,
                prevClose: lastHistory ? lastHistory.close : basePrice,
                open: basePrice,
                high: basePrice,
                low: basePrice,
                volume: 0,
                dailyVolume: 0,
                prevDailyVolume: avgVolume,
                avgVolume: avgVolume,
                history: history,
                bid: [],
                ask: []
            });
        });
    }

    // S2 Fix: snapshot the live market + game clock into a compact serialisable object
    // stored on the save. Base prices/K-lines are rebuilt from `marketSeed`; only the
    // evolving scalars need persisting, which keeps the save tiny (a few tens of KB).
    captureMarketState() {
        if (!this.currentSave) return null;
        const stocks = {};
        this.stockData.forEach((d, code) => {
            // Bug fix: persist the in-progress daily K-line bar too. Without it, a reload
            // rebuilt the (seeded) history whose last close was yesterday's close, while
            // the live price was restored separately - so the last candle disagreed with
            // the displayed price (close = prevClose, high < price).
            const bar = d.history && d.history[d.history.length - 1];
            stocks[code] = {
                price: d.price,
                prevClose: d.prevClose,
                open: d.open,
                high: d.high,
                low: d.low,
                volume: d.volume,
                dailyVolume: d.dailyVolume,
                prevDailyVolume: d.prevDailyVolume,
                avgVolume: d.avgVolume,
                lastBar: bar ? {
                    open: bar.open,
                    close: bar.close,
                    high: bar.high,
                    low: bar.low,
                    volume: bar.volume
                } : null
            };
        });
        // K-line reset: persist only the stocks that were actually re-rolled. An empty
        // map means "every stock still derives from the plain save seed", so untouched
        // saves stay byte-for-byte the same size as before.
        const seedKeys = Object.keys(this.historySeeds);
        return {
            gameTime: {
                hour: this.gameTime.hour,
                minute: this.gameTime.minute,
                manualSet: !!this.gameTime.manualSet,
                dayIndex: this.gameTime.dayIndex || 0
            },
            lastTradingDayIndex: this.lastTradingDayIndex || 0,
            marketTickCount: this.marketTickCount || 0,
            tradingDayCount: this.tradingDayCount || 0,
            gameTimePaused: !!this.gameTimePaused,
            ...(seedKeys.length ? { historySeeds: { ...this.historySeeds } } : {}),
            stocks
        };
    }

    // S2 Fix: apply a captured market state after initMarketData() rebuilt the
    // deterministic base. Legacy saves without one keep the freshly generated state.
    restoreMarketState() {
        if (!this.currentSave || !this.currentSave.market) return;
        const m = this.currentSave.market;
        const gt = m.gameTime;
        if (gt && Number.isFinite(gt.hour) && Number.isFinite(gt.minute)) {
            this.gameTime.hour = ((gt.hour | 0) % 24 + 24) % 24;
            this.gameTime.minute = ((gt.minute | 0) % 60 + 60) % 60;
            this.gameTime.manualSet = !!gt.manualSet;
            this.gameTime.dayIndex = Number.isFinite(gt.dayIndex) ? gt.dayIndex : 0;
        }
        if (Number.isFinite(m.lastTradingDayIndex)) this.lastTradingDayIndex = m.lastTradingDayIndex;
        if (Number.isFinite(m.marketTickCount)) this.marketTickCount = m.marketTickCount;
        if (Number.isFinite(m.tradingDayCount)) this.tradingDayCount = m.tradingDayCount;
        if (typeof m.gameTimePaused === 'boolean') this.gameTimePaused = m.gameTimePaused;

        if (m.stocks && typeof m.stocks === 'object') {
            const scalarKeys = ['price', 'prevClose', 'open', 'high', 'low', 'volume', 'dailyVolume', 'prevDailyVolume', 'avgVolume'];
            this.stockData.forEach((d, code) => {
                const s = m.stocks[code];
                if (!s || typeof s !== 'object') return;
                scalarKeys.forEach(k => {
                    if (Number.isFinite(s[k]) && s[k] >= 0) d[k] = s[k];
                });
                // Bug fix: restore the in-progress daily bar so the last candle matches
                // the restored live price (see captureMarketState).
                if (s.lastBar && typeof s.lastBar === 'object' && Array.isArray(d.history) && d.history.length > 0) {
                    const bar = d.history[d.history.length - 1];
                    ['open', 'close', 'high', 'low', 'volume'].forEach(k => {
                        if (Number.isFinite(s.lastBar[k]) && s.lastBar[k] >= 0) bar[k] = s.lastBar[k];
                    });
                }
                if (Number.isFinite(d.prevClose) && d.prevClose > 0) {
                    d.price = this.limitManager.roundToTick(this.limitManager.clampPrice(d.price, d.prevClose));
                }
                // Guard against a stale persisted bar whose high/low missed the price.
                if (Array.isArray(d.history) && d.history.length > 0) {
                    const bar = d.history[d.history.length - 1];
                    if (Number.isFinite(bar.high) && bar.high < d.price) bar.high = d.price;
                    if (Number.isFinite(bar.low) && bar.low > d.price) bar.low = d.price;
                }
            });
        }
        this.updateTimeDisplay();
    }

    // L13 Fix: game-minutes remaining until the next session opens, used to fast-forward
    // the clock through lunch/overnight without ever skipping past an open.
    minutesUntilNextTradingStart() {
        const total = this.gameTime.hour * 60 + this.gameTime.minute;
        if (total < 570) return 570 - total;          // before the morning open
        if (total < 780) return 780 - total;          // lunch break
        return (1440 - total) + 570;                   // after close -> next 9:30
    }

    // 生成基础价格
    generateBasePrice(stock, rng = Math.random) {
        // 根据行业生成合理的价格范围
        const ranges = {
            '银行': [5, 15],
            '白酒': [50, 2000],
            '医药': [20, 200],
            '科技': [10, 100],
            '新能源': [30, 300],
            '券商': [8, 30],
            '保险': [20, 80],
            'default': [5, 100]
        };
        const range = ranges[stock.industry] || ranges.default;
        return parseFloat((rng() * (range[1] - range[0]) + range[0]).toFixed(2));
    }

    // 生成历史K线数据
    generateHistory(basePrice, rng = Math.random) {
        const history = [];
        let price = basePrice;
        let prevVolume = Math.floor(rng() * 1000000);  // 初始基准成交量
        
        // 生成日期标签（从今天往前推60天）
        const today = new Date();
        
        for (let i = 0; i < 60; i++) {
            const change = (rng() - 0.5) * 0.04;
            const open = price;
            const close = price * (1 + change);
            const high = Math.max(open, close) * (1 + rng() * 0.02);
            const low = Math.min(open, close) * (1 - rng() * 0.02);
            
            // 计算当日内涨跌幅
            const dailyChange = (close - open) / open;
            
            // 计算当日成交量（基于前一成交量和当日内涨跌幅）
            // 使用线性关系：当日成交量 = 前一成交量 * (1 + 涨跌幅 * 1.5)
            // 限制涨跌幅在 -20% ~ +20% 范围内，避免成交量异常
            const clampedChange = Math.max(-0.2, Math.min(0.2, dailyChange));
            const targetVolume = prevVolume * (1 + clampedChange * 1.5);
            
            // 添加随机波动（±3%），确保不会改变方向
            const randomFactor = 0.97 + rng() * 0.06;
            const volume = Math.floor(targetVolume * randomFactor);
            
            // 生成日期（从今天往前推）
            const date = new Date(today);
            date.setDate(date.getDate() - (59 - i));
            const timeStr = `${date.getMonth() + 1}/${date.getDate()}`;
            
            history.push({
                open: parseFloat(open.toFixed(2)),
                close: parseFloat(close.toFixed(2)),
                high: parseFloat(high.toFixed(2)),
                low: parseFloat(low.toFixed(2)),
                volume: volume,
                time: timeStr
            });
            
            price = close;
            prevVolume = volume;
        }
        return history;
    }

    // P1-8 Fix: single place to tear down every long-lived timer. Any code path that
    // leaves a save (switch save, logout, reload) must use this instead of ad-hoc
    // clearInterval patches: overwriting this.autoTrade.interval without clearing the
    // old handle leaks a background setInterval that keeps trading against the new save.
    stopAllTimers() {
        if (this.marketInterval) {
            clearInterval(this.marketInterval);
            this.marketInterval = null;
        }
        if (this.autoTrade && this.autoTrade.interval) {
            clearInterval(this.autoTrade.interval);
            this.autoTrade.interval = null;
        }
    }

    // P1-7 Fix: single teardown path for every way of leaving a session. stopAllTimers
    // only cleared intervals, so deleteAccount and "logout while skipping" left the
    // auto-trade interval / pending skip chain alive against a null currentSave,
    // producing a permanent background exception loop.
    teardownSession() {
        this.stopAllTimers();
        this.cancelSkip();
    }

    // 启动市场模拟
    startMarketSimulation() {
        if (this.marketInterval) {
            clearInterval(this.marketInterval);
        }
        this.updateMarket();
        this.marketInterval = setInterval(() => this.updateMarket(), this.refreshRate);
    }

    // 更新游戏时间
    updateGameTime(stepOverride) {
        // P2-6 Fix: read the per-tick minute increment from the field rather than hardcoding.
        // Default to 1 to preserve prior behavior; tests can lower it to speed up the clock.
        // L13 Fix: an explicit override lets updateMarket fast-forward through non-trading
        // hours without changing the normal 1-minute cadence.
        const step = Number.isFinite(stepOverride) && stepOverride > 0
            ? Math.floor(stepOverride)
            : ((this.gameTime.minutesPerTick | 0) || 1);
        const prevTotalMinutes = this.gameTime.hour * 60 + this.gameTime.minute;
        this.gameTime.minute += step;

        // 处理分钟进位
        if (this.gameTime.minute >= 60) {
            this.gameTime.hour += Math.floor(this.gameTime.minute / 60);
            this.gameTime.minute = this.gameTime.minute % 60;
        }

        // 处理小时进位（24小时制）
        if (this.gameTime.hour >= 24) {
            this.gameTime.hour = this.gameTime.hour % 24;
        }

        // P1-6 Fix: crossing midnight advances the calendar day. updateMarket() uses
        // this monotonic counter to decide when a new trading day begins.
        const newTotalMinutes = this.gameTime.hour * 60 + this.gameTime.minute;
        if (newTotalMinutes < prevTotalMinutes) {
            this.gameTime.dayIndex = (this.gameTime.dayIndex || 0) + 1;
        }

        // 更新时间显示
        this.updateTimeDisplay();
    }

    // 更新时间显示
    updateTimeDisplay() {
        const timeEl = document.getElementById('market-time');
        const statusEl = document.getElementById('market-status');
        const portfolioTimeEl = document.getElementById('portfolio-time');
        const portfolioStatusEl = document.getElementById('portfolio-status');
        
        // 格式化时间显示
        const hour = this.gameTime.hour.toString().padStart(2, '0');
        const minute = this.gameTime.minute.toString().padStart(2, '0');
        const timeStr = `${hour}:${minute}`;
        
        // 计算总分钟数，用于判断是否在特殊时间窗口
        const totalMinutes = this.gameTime.hour * 60 + this.gameTime.minute;
        
        // 获取当前状态文本
        let statusText = I18n.t('marketStatus.normal');
        let statusClass = 'status';
        if (this.gameTimePaused) {
            statusText = I18n.t('marketStatus.paused');
            statusClass = 'status paused';
        } else if (totalMinutes >= 570 && totalMinutes <= 575) { // 9:30-9:35
            statusText = I18n.t('marketStatus.earlyBird');
            statusClass = 'status early';
        } else if (totalMinutes >= 895 && totalMinutes <= 900) { // 14:55-15:00 收盘前5分钟
            statusText = I18n.t('marketStatus.nightOwl');
            statusClass = 'status late';
        } else if (totalMinutes >= 780 && totalMinutes <= 785) { // 13:00-13:05 下午开盘
            statusText = I18n.t('marketStatus.afternoonOpen');
            statusClass = 'status afternoon';
        } else if (!this.isTradingTime()) {
            statusText = I18n.t('marketStatus.notTrading');
            statusClass = 'status';
        }

        if (timeEl && statusEl) {
            timeEl.textContent = timeStr;
            statusEl.textContent = statusText;
            statusEl.className = statusClass;
        }

        // 更新持仓区域的时间和状态显示
        if (portfolioTimeEl) {
            portfolioTimeEl.textContent = timeStr;
        }
        if (portfolioStatusEl) {
            portfolioStatusEl.textContent = statusText;
        }

        // 同步设置面板暂停/继续按钮的文案
        const pauseBtn = document.getElementById('time-pause-btn');
        if (pauseBtn) {
            pauseBtn.textContent = I18n.t(this.gameTimePaused ? 'settings.resume' : 'settings.pause');
        }
    }

    // 检查是否在交易时间内
    isTradingTime() {
        const totalMinutes = this.gameTime.hour * 60 + this.gameTime.minute;
        // 交易时间：上午盘 9:30 - 11:30，下午盘 13:00 - 15:00
        // Bug fix: 真实 A 股在 11:30 / 15:00 收盘整点即停止交易（连续竞价结束），
        // 此前闭区间让整点仍可下单。改为左闭右开：最后可交易时刻为 11:29 / 14:59。
        const isMorningSession = totalMinutes >= 570 && totalMinutes < 690;  // [9:30, 11:30)
        const isAfternoonSession = totalMinutes >= 780 && totalMinutes < 900; // [13:00, 15:00)
        return isMorningSession || isAfternoonSession;
    }

    // 随机设置游戏时间（在交易时间范围内）
    randomizeGameTime() {
        // 如果已经手动设置过时间，不再自动随机
        if (this.gameTime && this.gameTime.manualSet) {
            debugLog('时间已手动设置，跳过自动随机');
            return;
        }
        
        // L12 Fix: pick a start with a comfortable runway. Previously the range ran to
        // 11:29, so a "few seconds later" the clock hit 11:30 and the player was stuck in
        // the lunch break. Cap at 11:00 so at least 30 game-minutes remain.
        // 交易时间范围：9:30 - 11:00（分钟：570 到 660）
        const minMinutes = 570;
        const maxMinutes = 660;
        
        // 随机生成一个分钟数
        const randomMinutes = Math.floor(Math.random() * (maxMinutes - minMinutes + 1)) + minMinutes;
        
        // 转换为小时和分钟
        this.gameTime.hour = Math.floor(randomMinutes / 60);
        this.gameTime.minute = randomMinutes % 60;
        
        // 更新时间显示
        this.updateTimeDisplay();
        
        debugLog(`随机设置游戏时间为: ${this.gameTime.hour}:${this.gameTime.minute.toString().padStart(2, '0')}`);
    }

    // 时间控制：暂停 / 继续
    toggleTimePause() {
        this.gameTimePaused = !this.gameTimePaused;
        this.updateTimeDisplay();
        // Bug fix: persist the pause flag so it is not silently lost (and later restored)
        // on an unrelated refresh.
        this.autoSaveMarket(true);
        this.showNotification(I18n.t(this.gameTimePaused ? 'notification.timePaused' : 'notification.timeResumed'));
    }

    // 计算跳过的目标时间（返回当天分钟数 0-1439；null 表示无需跳过）
    getSkipTargetMinutes() {
        const cur = this.gameTime.hour * 60 + this.gameTime.minute;

        // 处于交易时段（含夜猫）：跳至本轮交易结束前1分钟（游戏时间以分钟计，≈结束前10秒）
        // 边界与 isTradingTime 一致（左闭右开）：停在 11:29 / 14:59 这一最后可交易分钟。
        if (cur >= 570 && cur < 690) {       // 上午盘 [9:30, 11:30)
            return cur < 689 ? 689 : null;   // → 11:29
        }
        if (cur >= 780 && cur < 900) {       // 下午盘 [13:00, 15:00)
            return cur < 899 ? 899 : null;   // → 14:59
        }

        // 非交易时间：跳至下一个交易时段开始前1分钟
        // P2-4 Fix: the fictional "夜猫 11:35-11:40" window was not a trading session,
        // so it is no longer treated as one here.
        if (cur < 570) return 569;           // → 9:29（上午开盘前）
        if (cur < 780) return 779;           // → 12:59（下午开盘前）
        return 569;                          // → 次日 9:29（上午开盘前）
    }

    // 时间控制：跳过（加速推进游戏时间，不忽略正常进程）
    skipTime() {
        if (this.skipMode) {
            this.showNotification(I18n.t('notification.skipping'));
            return;
        }
        if (!this.currentSave) {
            this.showNotification(I18n.t('notification.requireGame'));
            return;
        }

        const target = this.getSkipTargetMinutes();
        if (target === null) {
            this.showNotification(I18n.t('notification.noSkipNeeded'));
            return;
        }

        const cur = this.gameTime.hour * 60 + this.gameTime.minute;
        const advance = (target - cur + 1440) % 1440;
        if (advance <= 0) {
            this.showNotification(I18n.t('notification.arrivedTarget'));
            return;
        }

        // 跳过期间停止常规市场定时器，避免重复推进
        if (this.marketInterval) {
            clearInterval(this.marketInterval);
            this.marketInterval = null;
        }

        this.skipMode = true;
        this.skipTicksRemaining = advance;
        this.showNotification(I18n.t('notification.startSkip', { minutes: advance }));

        // 加速执行完整市场流程，直至到达目标时间
        setTimeout(() => this.skipTick(), 0);
    }

    // 跳过的单步推进：每次调用执行完整 updateMarket，直至剩余tick数为0
    skipTick() {
        if (!this.skipMode) return;

        if (this.skipTicksRemaining <= 0) {
            this.finishSkip();
            return;
        }

        // 剩余较多时批量推进以加快跳过（不影响正常流程，每个tick均完整执行市场更新）
        const batch = this.skipTicksRemaining > 300 ? 10 : this.skipTicksRemaining > 60 ? 5 : 1;
        const count = Math.min(batch, this.skipTicksRemaining);
        for (let i = 0; i < count; i++) {
            this.updateMarket();
            this.skipTicksRemaining--;
            if (this.skipTicksRemaining <= 0) break;
        }

        if (this.skipTicksRemaining <= 0) {
            this.finishSkip();
        } else {
            setTimeout(() => this.skipTick(), 0);
        }
    }

    // 结束跳过：恢复常规市场定时器并做最终刷新
    finishSkip() {
        // P1-7 Fix: a skip can still be in flight when the user logs out / deletes the
        // account. Never rebuild timers or touch the market without a live session.
        if (!this.currentUser || !this.currentSave) {
            this.skipMode = false;
            this.skipTicksRemaining = 0;
            return;
        }
        this.skipMode = false;
        this.skipTicksRemaining = 0;

        // 恢复常规市场定时器（不额外推进一次）
        if (this.marketInterval) {
            clearInterval(this.marketInterval);
        }
        this.marketInterval = setInterval(() => this.updateMarket(), this.refreshRate);

        // 完成后的最终界面刷新
        this.updateTimeDisplay();
        this.renderStockList(this.stockSearch.keyword);
        if (this.selectedStock) {
            this.updateStockDetail();
        }
        this.syncTradePriceFields();
        this.updatePortfolioRealTime();
        this.updateTradeAvailable();
        // 跳过结束：一次性持久化推进后的行情与时钟
        this.saveUsers();
        this.showNotification(I18n.t('notification.skipCompleted'));
    }

    // 取消进行中的跳过（例如切换存档时调用）
    cancelSkip() {
        this.skipMode = false;
        this.skipTicksRemaining = 0;
    }

    // 更新市场数据
    updateMarket() {
        if (!this.marketTickCount) {
            this.marketTickCount = 0;
        }
        
        // 暂停时冻结整个市场（游戏时间与行情均不推进）；跳过期间除外
        if (this.gameTimePaused && !this.skipMode) {
            return;
        }
        
        this.marketTickCount++;

        // L13 Fix: advance the clock 1 game-minute while trading, but fast-forward
        // through lunch/overnight (capped so the next open is never skipped). Skip mode
        // keeps 1-minute granularity so every minute is processed faithfully.
        let timeStep = 1;
        if (!this.skipMode && !this.isTradingTime()) {
            timeStep = Math.max(1, Math.min(30, this.minutesUntilNextTradingStart()));
        }

        // 更新游戏时间
        this.updateGameTime(timeStep);
        
        // 检查是否在交易时间内，非交易时间完全禁止市场更新
        const isTradingTime = this.isTradingTime();
        
        // 非交易时间：完全不更新市场数据
        if (!isTradingTime) {
            // 只更新UI显示，不更新任何价格或K线数据（跳过期间暂缓重绘以加速）
            if (!this.skipMode) {
                this.renderStockList(this.stockSearch.keyword);
                if (this.selectedStock) {
                    this.updateStockDetail();
                }
                this.syncTradePriceFields();
                this.updatePortfolioRealTime();
                this.updateTradeAvailable();
            }
            // 非交易时段只有游戏时钟在推进，同样需要持久化
            this.autoSaveMarket();
            return;
        }
        
        // P1-6 Fix: the trading day is driven by the game clock, not a raw tick count.
        // The old `marketTickCount % 20` fired every 20 game-minutes (~12 times per
        // displayed session), so T+1 reset ~12x/day and the +/-10% limit re-based
        // ~12x/day. now the day rolls when the clock crosses midnight; because this
        // block sits after the isTradingTime() early-return it only takes effect on the
        // first tick of the next session.
        const isNewTradingDay = this.gameTime.dayIndex !== this.lastTradingDayIndex;
        if (isNewTradingDay) {
            this.lastTradingDayIndex = this.gameTime.dayIndex;
            this.tradingDayCount++;
        }

        if (isNewTradingDay && this.currentSave) {
            // 新交易日：清空上一交易日的T+1交易记录
            this.currentSave.dayTrades = {};
        }
        
        this.stockData.forEach((data, code) => {
            if (isNewTradingDay) {
                // 交易日切换：保存前一日的数据
                data.prevClose = data.price;
                data.prevDailyVolume = data.dailyVolume;
                
                // 重置熔断状态
                this.limitManager.resetCircuitBreaker(code);
                
                // 更新移动平均成交量（最近5日）
                const recentVolumes = data.history.slice(-5).map(h => h.volume);
                recentVolumes.push(data.dailyVolume);
                data.avgVolume = Math.floor(recentVolumes.reduce((a, b) => a + b, 0) / recentVolumes.length);
                
                // 重置当日数据
                data.dailyVolume = 0;
                data.open = data.price;
                data.high = data.price;
                data.low = data.price;
                
                // 添加新的历史K线
                data.history.push({
                    open: data.price,
                    close: data.price,
                    high: data.price,
                    low: data.price,
                    volume: 0
                });
                
                // 保持历史数据长度为60
                if (data.history.length > 60) {
                    data.history.shift();
                }
            }
            
            // 随机价格波动
            let change;
            // 为影视飓风设置更高的上涨概率
            if (data.code === '999999' && data.name === '影视飓风') {
                // 上涨概率70%，下跌概率30%
                if (Math.random() < 0.7) {
                    // 上涨：0.5% ~ 3%
                    change = (Math.random() * 0.025 + 0.005);
                } else {
                    // 下跌：-0.5% ~ -2%
                    change = (Math.random() * 0.015 - 0.02);
                }
            } else {
                // 普通股票：(-2% ~ +2%)
                change = (Math.random() - 0.5) * 0.04;
            }
            // Bug fix: the normal per-tick band is bounded at +/-2% (+3% for the
            // easter-egg stock), so the 5% circuit-breaker threshold could never fire and
            // was dead code. Real feeds occasionally deliver a stale / fat-finger quote
            // spike; inject one rarely so the breaker detects a genuine abnormal move
            // (~0.1% of ticks) instead of never. Direction is symmetric.
            if (Math.random() < 0.0015) {
                const spikeDir = Math.random() < 0.5 ? -1 : 1;
                change = spikeDir * (0.04 + Math.random() * 0.03); // +/-4% ~ 7%
            }
            const newPrice = Math.max(0.01, data.price * (1 + change));
            // P2-1 Fix: capture the pre-clamp price for per-tick circuit-breaker check
            const preClampPrice = data.price;

            // 使用涨跌停管理器限制价格
            data.price = this.limitManager.clampPrice(newPrice, data.prevClose);
            data.price = this.limitManager.roundToTick(data.price);

            // 实时验证价格是否在涨跌停范围内
            if (!this.limitManager.isPriceWithinLimits(data.price, data.prevClose)) {
                console.warn(`股票 ${code} 价格 ${data.price} 超出涨跌停范围，已自动调整`);
                data.price = this.limitManager.clampPrice(data.price, data.prevClose);
                data.price = this.limitManager.roundToTick(data.price);
            }

            // P2-1 Fix: judge circuit breaker on the per-tick move (pre-clamp price vs new
            // attempted price), not on the per-day move vs prevClose (which is bounded
            // by the +/-10% daily limit and so the previous 0.20 threshold was unreachable).
            if (this.limitManager.checkCircuitBreaker(code, newPrice, preClampPrice)) {
                this.limitManager.triggerCircuitBreaker(code);
            }
            
            // 更新熔断冷却
            this.limitManager.updateCircuitBreakerCooldown(code);
            
            data.high = Math.max(data.high, data.price);
            data.low = Math.min(data.low, data.price);
            
            // 计算涨跌幅（相对于前一交易日收盘价，与涨跌幅显示保持一致）
            const dailyChange = (data.price - data.prevClose) / data.prevClose;
            // 使用线性关系：当日成交量 = 前一交易日成交量 * (1 + 涨跌幅 * 1.5)
            // 限制涨跌幅在 -20% ~ +20% 范围内，避免成交量异常
            const clampedChange = Math.max(-0.2, Math.min(0.2, dailyChange));
            const targetDailyVolume = data.prevDailyVolume * (1 + clampedChange * 1.5);
            
            // 添加随机波动（±3%），确保不会改变方向
            const randomFactor = 0.97 + Math.random() * 0.06;
            data.dailyVolume = Math.floor(targetDailyVolume * randomFactor);
            
            // 更新累积成交量
            data.volume = data.dailyVolume;

            // 更新当前K线
            const lastHistory = data.history[data.history.length - 1];
            if (lastHistory) {
                lastHistory.close = data.price;
                lastHistory.high = Math.max(lastHistory.high, data.price);
                lastHistory.low = Math.min(lastHistory.low, data.price);
                lastHistory.volume = data.dailyVolume;
            }

            // 生成五档行情
            this.generateOrderBook(data);
        });

        // 使用保存的搜索关键词重新渲染列表，保留搜索状态（跳过期间暂缓重绘以加速）
        if (!this.skipMode) {
            this.renderStockList(this.stockSearch.keyword);
            if (this.selectedStock) {
                this.updateStockDetail();
            }
            this.syncTradePriceFields();
            this.updatePortfolioRealTime();
            this.updateTradeAvailable();
        }
        // Bug fix: persist the tick so a refresh resumes here instead of rolling back.
        this.autoSaveMarket();
    }

    // 生成五档行情
    generateOrderBook(data) {
        const spread = 0.01;
        data.bid = [];
        data.ask = [];
        
        for (let i = 0; i < 5; i++) {
            data.bid.push({
                price: parseFloat((data.price - spread * (i + 1) - Math.random() * 0.01).toFixed(2)),
                volume: Math.floor(Math.random() * 10000) + 100
            });
            data.ask.push({
                price: parseFloat((data.price + spread * (i + 1) + Math.random() * 0.01).toFixed(2)),
                volume: Math.floor(Math.random() * 10000) + 100
            });
        }
        data.bid.sort((a, b) => b.price - a.price);
        data.ask.sort((a, b) => a.price - b.price);
    }

    // 渲染股票列表
    renderStockList(filter = '') {
        const listEl = document.getElementById('stock-list');
        // L9 Fix: trim / normalise the query. A whitespace-only search used to be truthy
        // and therefore matched nothing ("0 results"); now it falls back to the full list.
        filter = normalizeStockCode(filter);
        const filterLower = filter.toLowerCase();
        const watchlist = this.currentSave ? this.currentSave.watchlist || [] : [];
        
        // 获取过滤后的股票列表
        let stocks = StockPool.filter(stock => {
            // 搜索过滤
            if (filter) {
                if (!stock.code.includes(filter) && !stock.name.toLowerCase().includes(filterLower)) {
                    return false;
                }
            }
            
            // 自选模式过滤
            if (this.watchlistMode) {
                return watchlist.includes(stock.code);
            }
            
            return true;
        });
        
        // 排序逻辑
        if (this.stockSort.field) {
            stocks.sort((a, b) => {
                let comparison = 0;
                const dataA = this.stockData.get(a.code);
                const dataB = this.stockData.get(b.code);
                
                switch (this.stockSort.field) {
                    case 'name':
                        comparison = a.name.localeCompare(b.name, I18n.getCurrentLanguage());
                        break;
                    case 'price':
                        comparison = dataA.price - dataB.price;
                        break;
                    case 'change':
                        const changeA = (dataA.price - dataA.prevClose) / dataA.prevClose;
                        const changeB = (dataB.price - dataB.prevClose) / dataB.prevClose;
                        comparison = changeA - changeB;
                        break;
                }
                
                return this.stockSort.order === 'asc' ? comparison : -comparison;
            });
        }
        
        let html = '';
        stocks.forEach(stock => {
            const data = this.stockData.get(stock.code);
            // Bug fix: derive the sign from the numeric change, not from the toFixed()
            // string. A price a hair below prevClose produced "-0.00", which string-compared
            // as >= 0 and rendered the impossible "+-0.00%".
            const changeNumRaw = (data.price - data.prevClose) / data.prevClose * 100;
            const changeNum = Math.abs(changeNumRaw) < 0.005 ? 0 : changeNumRaw;
            const changeClass = changeNum >= 0 ? 'up' : 'down';
            const changeSymbol = changeNum > 0 ? '+' : '';
            const activeClass = this.selectedStock && this.selectedStock.code === stock.code ? 'active' : '';
            const isWatched = watchlist.includes(stock.code);
            // P0-1 Fix: escape all user-controllable fields
            const stockName = escapeHtml(stock.name);
            const stockCode = escapeHtml(stock.code);
            const priceText = escapeHtml(data.price.toFixed(2));
            const changeText = escapeHtml(changeNum.toFixed(2));
            
            html += `
                <div class="stock-item ${activeClass}" data-code="${stockCode}">
                    <div class="stock-item-info">
                        <div class="name">${stockName}</div>
                        <div class="code">${stockCode}</div>
                    </div>
                    <div class="stock-item-price ${changeClass}">${priceText}</div>
                    <div class="stock-item-change ${changeClass}">${changeSymbol}${changeText}%</div>
                    ${isWatched ? '<div class="watch-badge">★</div>' : ''}
                </div>
            `;
        });

        // Bug fix: an empty result set used to render as a blank panel. Show a hint for
        // "no search results" and for an empty watchlist.
        if (stocks.length === 0) {
            const emptyKey = (this.watchlistMode && !filter) ? 'market.watchlistEmpty' : 'market.noResults';
            listEl.innerHTML = '<p style="text-align:center;color:var(--text-secondary);padding:40px;">'
                + escapeHtml(I18n.t(emptyKey)) + '</p>';
            this.updateSortIndicators();
            return;
        }

        listEl.innerHTML = html;

        listEl.querySelectorAll('.stock-item').forEach(item => {
            item.addEventListener('click', () => {
                const code = item.dataset.code;
                const stock = StockPool.find(s => s.code === code);
                this.selectStock(stock);
            });
        });
        
        // 更新排序指示器
        this.updateSortIndicators();
    }
    
    // 处理排序点击
    handleSortClick(field) {
        debugLog('handleSortClick:', field, 'current:', this.stockSort);
        if (this.stockSort.field === field) {
            // 同一字段：升序 -> 降序 -> 取消排序 -> 升序 ...
            if (this.stockSort.order === 'asc') {
                this.stockSort.order = 'desc';
            } else if (this.stockSort.order === 'desc') {
                // 第三次点击，取消排序
                this.stockSort.field = null;
                this.stockSort.order = 'asc';
            }
        } else {
            // 新字段，默认升序
            this.stockSort.field = field;
            this.stockSort.order = 'asc';
        }
        debugLog('after:', this.stockSort);
        // 重新渲染列表，使用保存的搜索关键词
        this.renderStockList(this.stockSearch.keyword);
    }
    
    // 更新排序指示器
    updateSortIndicators() {
        debugLog('updateSortIndicators:', this.stockSort);
        document.querySelectorAll('.stock-list-header .sortable').forEach(header => {
            const field = header.dataset.sort;
            const indicator = header.querySelector('.sort-indicator');
            debugLog('header:', field, 'indicator:', indicator);
            
            if (this.stockSort.field === field) {
                header.classList.add('sorted');
                indicator.textContent = this.stockSort.order === 'asc' ? '▲' : '▼';
                debugLog('set indicator for', field, 'to', this.stockSort.order);
            } else {
                header.classList.remove('sorted');
                indicator.textContent = '';
                debugLog('clear indicator for', field);
            }
        });
    }

    // 搜索股票
    searchStocks(keyword) {
        this.renderStockList(keyword);
    }

    // 切换自选模式
    toggleWatchlistMode() {
        this.watchlistMode = !this.watchlistMode;
        const btn = document.getElementById('watchlist-toggle-btn');
        
        if (this.watchlistMode) {
            btn.classList.add('active');
            btn.textContent = I18n.t('market.allView');
            this.showNotification(I18n.t('notification.switchToWatchlist'), 'success');
        } else {
            btn.classList.remove('active');
            btn.textContent = I18n.t('market.watchlistView');
            this.showNotification(I18n.t('notification.switchToAll'), 'success');
        }
        
        // 重新渲染股票列表
        this.renderStockList(this.stockSearch.keyword);
    }

    // 选择股票
    selectStock(stock) {
        this.selectedStock = stock;
        // 使用保存的搜索关键词重新渲染列表
        this.renderStockList(this.stockSearch.keyword);
        // 重置图表状态
        this.chartReset();
        this.updateStockDetail();
        
        // 延迟绘制图表，确保DOM完全渲染
        setTimeout(() => {
            if (this.selectedStock) {
                const data = this.stockData.get(this.selectedStock.code);
                if (data) {
                    this.drawKLine(data);
                    this.drawVolume(data);
                }
            }
        }, 100);
    }

    // 切换自选状态
    toggleWatchlist() {
        if (!this.selectedStock || !this.currentSave) return;
        
        const watchlist = this.currentSave.watchlist || [];
        const code = this.selectedStock.code;
        const index = watchlist.indexOf(code);
        
        if (index === -1) {
            // 添加到自选
            watchlist.push(code);
            this.showNotification(I18n.t('notification.watchlistAdded'));
        } else {
            // 从自选移除
            watchlist.splice(index, 1);
            this.showNotification(I18n.t('notification.watchlistRemoved'));
        }
        
        this.currentSave.watchlist = watchlist;
        this.saveUsers();
        this.updateWatchButton();
        // 检查成就（自选股相关）
        this.checkAchievements();
        // 使用保存的搜索关键词重新渲染列表
        this.renderStockList(this.stockSearch.keyword);
    }

    // 更新自选按钮状态
    updateWatchButton() {
        if (!this.selectedStock || !this.currentSave) return;
        
        const watchlist = this.currentSave.watchlist || [];
        const code = this.selectedStock.code;
        const btn = document.getElementById('add-watch-btn');
        
        if (watchlist.includes(code)) {
            btn.textContent = I18n.t('market.removeWatch');
            btn.classList.add('active');
        } else {
            btn.textContent = I18n.t('market.addWatch');
            btn.classList.remove('active');
        }
    }

    // 显示通知
    showNotification(message) {
        const notification = document.createElement('div');
        notification.className = 'notification';
        notification.textContent = message;
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.classList.add('show');
        }, 10);
        
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        }, 2000);
    }

    // 显示密码修改模态窗口
    showChangePasswordModal() {
        document.getElementById('change-password-modal').classList.add('active');
        // 清空表单和错误信息
        document.getElementById('current-password').value = '';
        document.getElementById('new-password').value = '';
        document.getElementById('confirm-password').value = '';
        document.getElementById('change-password-error').textContent = '';
        document.getElementById('change-password-error').style.display = 'none';
    }

    // 隐藏密码修改模态窗口
    hideChangePasswordModal() {
        document.getElementById('change-password-modal').classList.remove('active');
        // #23 Fix: never leave plaintext passwords behind in the form after closing.
        const fields = ['current-password', 'new-password', 'confirm-password'];
        fields.forEach(id => {
            const input = document.getElementById(id);
            if (input) input.value = '';
        });
        // Round-3 fix: the success path used to close the modal without clearing a
        // previously shown error (e.g. "当前密码错误"), leaving the stale red message
        // attached to the (now reset) form. Clear it on every close so the modal is
        // always pristine when it is reopened.
        const errorEl = document.getElementById('change-password-error');
        if (errorEl) {
            errorEl.textContent = '';
            errorEl.style.display = 'none';
        }
    }

    // 修改密码
    // P1-4 Fix: use async PBKDF2 verification (and persist the new hash)
    async changePassword() {
        const currentPassword = document.getElementById('current-password').value;
        const newPassword = document.getElementById('new-password').value;
        const confirmPassword = document.getElementById('confirm-password').value;
        const errorEl = document.getElementById('change-password-error');

        // 验证输入
        if (!currentPassword) {
            errorEl.textContent = I18n.t('password.requireCurrent');
            errorEl.style.display = 'block';
            return;
        }

        if (!newPassword || newPassword.length < 6 || newPassword.length > 20) {
            errorEl.textContent = I18n.t('password.invalidNewLength');
            errorEl.style.display = 'block';
            return;
        }

        if (newPassword !== confirmPassword) {
            errorEl.textContent = I18n.t('password.mismatch');
            errorEl.style.display = 'block';
            return;
        }

        // 验证当前密码（使用 async 验证）
        let verifyResult;
        try {
            verifyResult = await Crypto.verifyPassword(currentPassword, this.currentUser.passwordHash);
        } catch (e) {
            errorEl.textContent = I18n.t('password.wrongCurrent');
            errorEl.style.display = 'block';
            return;
        }
        if (!verifyResult || !verifyResult.valid) {
            errorEl.textContent = I18n.t('password.wrongCurrent');
            errorEl.style.display = 'block';
            return;
        }

        // 验证新密码与当前密码是否相同
        if (currentPassword === newPassword) {
            errorEl.textContent = I18n.t('password.sameAsCurrent');
            errorEl.style.display = 'block';
            return;
        }

        // 更新密码（使用新算法生成新哈希）
        let hashedNewPassword;
        try {
            hashedNewPassword = await Crypto.hashAsync(newPassword);
        } catch (e) {
            errorEl.textContent = I18n.t('password.updateFailed');
            errorEl.style.display = 'block';
            return;
        }
        this.currentUser.passwordHash = hashedNewPassword;

        // 同步到 users 对象
        if (this.currentUser.username && this.users[this.currentUser.username]) {
            this.users[this.currentUser.username].passwordHash = hashedNewPassword;
        }

        // 保存到本地存储
        this.saveUsers();

        // Round-3 fix: clear any error left over from a previous failed attempt
        // before reporting success and closing the modal (hideChangePasswordModal()
        // now also clears it, this keeps the success path explicit).
        errorEl.textContent = '';
        errorEl.style.display = 'none';

        // 显示成功提示
        this.showNotification(I18n.t('password.success'));

        // 关闭模态窗口
        this.hideChangePasswordModal();
    }

    // 更新股票详情
    updateStockDetail() {
        if (!this.selectedStock) return;
        
        const data = this.stockData.get(this.selectedStock.code);
        if (!data) return;
        // Bug fix: sign from the numeric change (see renderStockList) so "-0.00" never
        // renders as "+-0.00%".
        const changeNumRaw = (data.price - data.prevClose) / data.prevClose * 100;
        const changeNum = Math.abs(changeNumRaw) < 0.005 ? 0 : changeNumRaw;
        const change = changeNum.toFixed(2);
        const changeClass = changeNum >= 0 ? 'up' : 'down';
        const changeSymbol = changeNum > 0 ? '+' : '';

        document.getElementById('detail-name').textContent = data.name;
        document.getElementById('detail-code').textContent = data.code;
        document.getElementById('detail-price').textContent = data.price.toFixed(2);
        document.getElementById('detail-price').className = `price ${changeClass}`;
        document.getElementById('detail-change').textContent = `${changeSymbol}${change}%`;
        document.getElementById('detail-change').className = `change ${changeClass}`;
        
        // 显示涨跌停价格
        const limitUpPrice = this.limitManager.calculateLimitUpPrice(data.prevClose);
        const limitDownPrice = this.limitManager.calculateLimitDownPrice(data.prevClose);
        document.getElementById('limit-up-price').textContent = limitUpPrice.toFixed(2);
        document.getElementById('limit-down-price').textContent = limitDownPrice.toFixed(2);
        
        // 计算成交量百分比（相对于前一交易日成交量）
        let volumeChange = '0.00';
        let volumeChangeNum = 0;
        if (data.prevDailyVolume > 0) {
            if (data.dailyVolume > 0) {
                volumeChange = ((data.dailyVolume - data.prevDailyVolume) / data.prevDailyVolume * 100).toFixed(2);
                volumeChangeNum = parseFloat(volumeChange);
            } else {
                volumeChange = '-100.00';
                volumeChangeNum = -100;
            }
        }
        // 更新五档
        for (let i = 0; i < 5; i++) {
            const ask = data.ask[i] || { price: '--', volume: '--' };
            const bid = data.bid[i] || { price: '--', volume: '--' };
            
            document.getElementById(`ask${5-i}-price`).textContent = typeof ask.price === 'number' ? ask.price.toFixed(2) : '--';
            document.getElementById(`ask${5-i}-vol`).textContent = ask.volume;
            document.getElementById(`bid${i+1}-price`).textContent = typeof bid.price === 'number' ? bid.price.toFixed(2) : '--';
            document.getElementById(`bid${i+1}-vol`).textContent = bid.volume;
        }
        
        // #15 Fix: follow the market only for fields the player has not edited. This
        // replaces the old block that overwrote buy-price/sell-price on every tick
        // whenever the typed code happened to equal the selected stock.
        this.syncTradePriceFields();
        
        // 更新自选按钮状态
        this.updateWatchButton();

        this.drawKLine(data);
        this.drawVolume(data);
    }

    // 绘制K线图（支持缩放）
    drawKLine(data) {
        if (!data) return;
        
        const canvas = document.getElementById('kline-canvas');
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        
        const rect = canvas.parentElement.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        
        // 设置canvas的实际像素尺寸（考虑设备像素比）
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        
        // 缩放上下文以匹配设备像素比
        ctx.scale(dpr, dpr);
        
        // CSS尺寸保持不变
        canvas.style.width = rect.width + 'px';
        canvas.style.height = rect.height + 'px';

        const padding = 40;
        const chartWidth = rect.width - padding * 2;
        const chartHeight = rect.height - padding * 2;
        
        const state = this.chartState;
        const history = data.history;
        if (!history || history.length === 0) return;
        
        // 计算可见的数据范围
        const totalCandles = history.length;
        const visibleCount = Math.max(10, Math.floor(totalCandles / state.scaleX));
        const maxOffset = Math.max(0, totalCandles - visibleCount);
        
        // 限制偏移范围
        state.offsetX = Math.max(0, Math.min(state.offsetX, maxOffset));
        
        const startIndex = Math.floor(state.offsetX);
        const endIndex = Math.min(startIndex + visibleCount, totalCandles);
        const visibleData = history.slice(startIndex, endIndex);
        
        // 计算价格范围（包含当前价格）
        const prices = visibleData.flatMap(h => [h.high, h.low]);
        prices.push(data.price); // 添加当前价格
        const dataMinPrice = Math.min(...prices);
        const dataMaxPrice = Math.max(...prices);
        const pricePadding = (dataMaxPrice - dataMinPrice) * 0.1;
        const minPrice = dataMinPrice - pricePadding;
        const maxPrice = dataMaxPrice + pricePadding;
        const priceRange = maxPrice - minPrice;

        // 清空画布
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // 保存绘图参数供交互使用
        this.chartRenderParams = {
            padding, chartWidth, chartHeight,
            minPrice, maxPrice, priceRange,
            startIndex, endIndex, visibleCount,
            candleSpacing: chartWidth / visibleCount
        };

        // 绘制网格
        ctx.strokeStyle = 'rgba(128, 128, 128, 0.2)';
        ctx.lineWidth = 1;
        for (let i = 0; i <= 5; i++) {
            const y = padding + (chartHeight / 5) * i;
            ctx.beginPath();
            ctx.moveTo(padding, y);
            ctx.lineTo(canvas.width - padding, y);
            ctx.stroke();

            // 价格标签
            const price = maxPrice - (priceRange / 5) * i;
            ctx.fillStyle = '#888';
            ctx.font = '12px Arial';
            ctx.textAlign = 'right';
            ctx.fillText(price.toFixed(2), padding - 5, y + 4);
        }

        // 绘制K线
        const candleWidth = Math.max(2, (chartWidth / visibleCount) * 0.7);

        visibleData.forEach((candle, i) => {
            const actualIndex = startIndex + i;
            const x = padding + i * (chartWidth / visibleCount) + (chartWidth / visibleCount) / 2;
            const openY = padding + (maxPrice - candle.open) / priceRange * chartHeight;
            const closeY = padding + (maxPrice - candle.close) / priceRange * chartHeight;
            const highY = padding + (maxPrice - candle.high) / priceRange * chartHeight;
            const lowY = padding + (maxPrice - candle.low) / priceRange * chartHeight;

            const isUp = candle.close >= candle.open;
            ctx.strokeStyle = isUp ? '#ff4d4f' : '#52c41a';
            ctx.fillStyle = isUp ? '#ff4d4f' : '#52c41a';

            // 影线
            ctx.beginPath();
            ctx.moveTo(x, highY);
            ctx.lineTo(x, lowY);
            ctx.stroke();

            // 实体
            const bodyTop = Math.min(openY, closeY);
            const bodyHeight = Math.max(1, Math.abs(closeY - openY));
            ctx.fillRect(x - candleWidth / 2, bodyTop, candleWidth, bodyHeight);
        });

        // 绘制当前价格线（总是显示）
        const currentY = padding + (maxPrice - data.price) / priceRange * chartHeight;
        ctx.strokeStyle = '#58a6ff';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(padding, currentY);
        ctx.lineTo(canvas.width - padding, currentY);
        ctx.stroke();
        ctx.setLineDash([]);

        // 绘制框选区域
        if (state.isSelecting && state.selectionStart && state.selectionEnd) {
            const selX = Math.min(state.selectionStart.x, state.selectionEnd.x);
            const selY = Math.min(state.selectionStart.y, state.selectionEnd.y);
            const selW = Math.abs(state.selectionEnd.x - state.selectionStart.x);
            const selH = Math.abs(state.selectionEnd.y - state.selectionStart.y);
            
            ctx.fillStyle = 'rgba(88, 166, 255, 0.2)';
            ctx.strokeStyle = 'rgba(88, 166, 255, 0.8)';
            ctx.lineWidth = 1;
            ctx.fillRect(selX, selY, selW, selH);
            ctx.strokeRect(selX, selY, selW, selH);
        }

        // 绘制时间标签
        ctx.fillStyle = '#888';
        ctx.font = '10px Arial';
        ctx.textAlign = 'center';
        const timeStep = Math.max(1, Math.floor(visibleCount / 5));
        for (let i = 0; i < visibleData.length; i += timeStep) {
            const x = padding + i * (chartWidth / visibleCount) + (chartWidth / visibleCount) / 2;
            const time = visibleData[i].time || `${i + 1}`;
            ctx.fillText(time, x, canvas.height - 10);
        }
    }

    // 图表缩放控制
    chartZoomIn() {
        this.chartState.scaleX = Math.min(10, this.chartState.scaleX * 1.2);
        if (this.selectedStock) {
            const data = this.stockData.get(this.selectedStock.code);
            this.drawKLine(data);
            this.drawVolume(data);
        }
    }

    chartZoomOut() {
        this.chartState.scaleX = Math.max(1, this.chartState.scaleX / 1.2);
        this.chartState.offsetX = 0;
        if (this.selectedStock) {
            const data = this.stockData.get(this.selectedStock.code);
            this.drawKLine(data);
            this.drawVolume(data);
        }
    }

    chartReset() {
        this.chartState = {
            scaleX: 1,
            scaleY: 1,
            offsetX: 0,
            offsetY: 0,
            isDragging: false,
            isSelecting: false,
            dragStartX: 0,
            dragStartY: 0,
            selectionStart: null,
            selectionEnd: null
        };
        if (this.selectedStock) {
            const data = this.stockData.get(this.selectedStock.code);
            if (data && data.history) {
                const totalCandles = data.history.length;
                const visibleCount = Math.max(10, Math.floor(totalCandles / this.chartState.scaleX));
                this.chartState.offsetX = Math.max(0, totalCandles - visibleCount);
            }
            this.drawKLine(data);
            this.drawVolume(data);
        }
    }

    // 绘制成交量柱状图
    drawVolume(data) {
        const canvas = document.getElementById('volume-canvas');
        if (!canvas) {
            debugLog('Volume canvas not found');
            return;
        }
        
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            debugLog('Volume canvas context not found');
            return;
        }
        
        const rect = canvas.parentElement.getBoundingClientRect();
        debugLog('Volume container rect:', rect);
        
        if (rect.width === 0 || rect.height === 0) {
            debugLog('Volume container has no size');
            return;
        }
        
        const dpr = window.devicePixelRatio || 1;
        
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        
        ctx.scale(dpr, dpr);
        
        canvas.style.width = rect.width + 'px';
        canvas.style.height = rect.height + 'px';

        const leftPadding = 60;
        const topPadding = 10;
        const rightPadding = 10;
        const bottomPadding = 20;
        const chartWidth = rect.width - leftPadding - rightPadding;
        const chartHeight = rect.height - topPadding - bottomPadding;
        
        debugLog('Volume chart params:', { leftPadding, topPadding, rightPadding, bottomPadding, chartWidth, chartHeight });
        
        if (chartHeight <= 0) {
            debugLog('Chart height is negative:', chartHeight);
            return;
        }
        
        const state = this.chartState;
        const history = data.history;
        if (!history || history.length === 0) return;
        
        const totalCandles = history.length;
        const visibleCount = Math.max(10, Math.floor(totalCandles / state.scaleX));
        const maxOffset = Math.max(0, totalCandles - visibleCount);
        
        state.offsetX = Math.max(0, Math.min(state.offsetX, maxOffset));
        
        const startIndex = Math.floor(state.offsetX);
        const endIndex = Math.min(startIndex + visibleCount, totalCandles);
        const visibleData = history.slice(startIndex, endIndex);
        
        const volumes = visibleData.map(h => h.volume);
        const maxVolume = Math.max(...volumes, 1);
        const minVolume = 0;
        const volumeRange = maxVolume - minVolume;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        this.volumeRenderParams = {
            leftPadding, topPadding, rightPadding, bottomPadding, chartWidth, chartHeight,
            minVolume, maxVolume, volumeRange,
            startIndex, endIndex, visibleCount,
            barSpacing: chartWidth / visibleCount
        };

        ctx.strokeStyle = 'rgba(128, 128, 128, 0.2)';
        ctx.lineWidth = 1;
        for (let i = 0; i <= 3; i++) {
            const y = topPadding + (chartHeight / 3) * i;
            ctx.beginPath();
            ctx.moveTo(leftPadding, y);
            ctx.lineTo(canvas.width - rightPadding, y);
            ctx.stroke();

            const volume = (volumeRange / 3) * i;
            ctx.fillStyle = '#888';
            ctx.font = '11px Arial';
            ctx.textAlign = 'right';
            // 成交量格式化（根据语言使用不同的单位体系）
            let volumeText;
            if (I18n.getCurrentLanguage() === 'en-US') {
                volumeText = volume >= 1000000000 ? (volume / 1000000000).toFixed(2) + 'B' :
                             volume >= 1000000 ? (volume / 1000000).toFixed(2) + 'M' :
                             volume >= 1000 ? (volume / 1000).toFixed(2) + 'K' :
                             volume.toFixed(0);
            } else {
                volumeText = volume >= 100000000 ? (volume / 100000000).toFixed(2) + '亿' :
                             volume >= 10000 ? (volume / 10000).toFixed(2) + '万' :
                             volume.toFixed(0);
            }
            ctx.fillText(volumeText, leftPadding - 5, y + 4);
        }

        const barWidth = Math.max(2, (chartWidth / visibleCount) * 0.7);

        debugLog('Volume data:', { volumes, maxVolume, visibleData: visibleData.length });
        
        visibleData.forEach((candle, i) => {
            const x = leftPadding + i * (chartWidth / visibleCount) + (chartWidth / visibleCount) / 2;
            const barHeight = (candle.volume / maxVolume) * chartHeight;
            const y = topPadding + chartHeight - barHeight;

            const isUp = candle.close >= candle.open;
            ctx.fillStyle = isUp ? 'rgba(255, 77, 79, 1)' : 'rgba(82, 196, 26, 1)';

            debugLog('Drawing bar:', { x, y, barWidth, barHeight, volume: candle.volume });
            ctx.fillRect(x - barWidth / 2, y, barWidth, barHeight);
        });

        ctx.fillStyle = '#888';
        ctx.font = '10px Arial';
        ctx.textAlign = 'center';
        const timeStep = Math.max(1, Math.floor(visibleCount / 5));
        for (let i = 0; i < visibleData.length; i += timeStep) {
            const x = leftPadding + i * (chartWidth / visibleCount) + (chartWidth / visibleCount) / 2;
            const time = visibleData[i].time || `${i + 1}`;
            ctx.fillText(time, x, canvas.height - 5);
        }
    }

    // 鼠标滚轮缩放
    onChartWheel(e) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        const newScale = Math.max(1, Math.min(10, this.chartState.scaleX * delta));
        
        // 以鼠标位置为中心缩放
        if (newScale !== this.chartState.scaleX) {
            const canvas = e.target;
            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const params = this.chartRenderParams;
            
            if (params) {
                const relativeX = (x - params.padding) / params.chartWidth;
                const visibleCount = params.endIndex - params.startIndex;
                const focusIndex = params.startIndex + relativeX * visibleCount;
                
                this.chartState.scaleX = newScale;
                
                const newVisibleCount = Math.max(10, Math.floor(params.visibleCount / delta));
                const newStartIndex = Math.max(0, focusIndex - relativeX * newVisibleCount);
                this.chartState.offsetX = newStartIndex;
            }
            
            if (this.selectedStock) {
                const data = this.stockData.get(this.selectedStock.code);
                this.drawKLine(data);
                this.drawVolume(data);
            }
        }
    }

    // 鼠标按下
    onChartMouseDown(e) {
        const canvas = e.target;
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        // 右键或按住Shift键进行框选
        if (e.button === 2 || e.shiftKey) {
            this.chartState.isSelecting = true;
            this.chartState.selectionStart = { x, y };
            this.chartState.selectionEnd = { x, y };
        } else {
            this.chartState.isDragging = true;
            this.chartState.dragStartX = x;
            this.chartState.lastOffsetX = this.chartState.offsetX;
        }
    }

    // 鼠标移动
    onChartMouseMove(e) {
        const canvas = e.target;
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        // 更新光标样式
        if (e.shiftKey) {
            canvas.classList.add('shift-key');
        } else {
            canvas.classList.remove('shift-key');
        }
        
        if (this.chartState.isSelecting) {
            this.chartState.selectionEnd = { x, y };
            if (this.selectedStock) {
                const data = this.stockData.get(this.selectedStock.code);
                this.drawKLine(data);
                this.drawVolume(data);
            }
        } else if (this.chartState.isDragging) {
            const params = this.chartRenderParams;
            if (params) {
                const deltaX = x - this.chartState.dragStartX;
                const candleWidth = params.chartWidth / (params.endIndex - params.startIndex);
                const candleDelta = deltaX / candleWidth;
                
                this.chartState.offsetX = Math.max(0, 
                    this.chartState.lastOffsetX - candleDelta);
                
                if (this.selectedStock) {
                    const data = this.stockData.get(this.selectedStock.code);
                    this.drawKLine(data);
                    this.drawVolume(data);
                }
            }
        }
    }

    // 鼠标释放
    onChartMouseUp(e) {
        if (this.chartState.isSelecting) {
            // 处理框选放大
            this.handleSelectionZoom();
        }
        
        this.chartState.isDragging = false;
        this.chartState.isSelecting = false;
        this.chartState.selectionStart = null;
        this.chartState.selectionEnd = null;
    }

    // 处理框选放大
    handleSelectionZoom() {
        const state = this.chartState;
        const params = this.chartRenderParams;
        
        if (!state.selectionStart || !state.selectionEnd || !params) return;
        
        const selLeft = Math.min(state.selectionStart.x, state.selectionEnd.x);
        const selRight = Math.max(state.selectionStart.x, state.selectionEnd.x);
        
        // 确保框选区域足够大
        if (selRight - selLeft < 20) return;
        
        // 计算框选对应的数据范围
        const leftRatio = Math.max(0, Math.min(1, (selLeft - params.padding) / params.chartWidth));
        const rightRatio = Math.max(0, Math.min(1, (selRight - params.padding) / params.chartWidth));
        
        const visibleCount = params.endIndex - params.startIndex;
        const newStartIndex = params.startIndex + leftRatio * visibleCount;
        const newEndIndex = params.startIndex + rightRatio * visibleCount;
        const newVisibleCount = newEndIndex - newStartIndex;
        
        // 更新缩放和偏移
        if (newVisibleCount >= 5) {
            state.scaleX = Math.min(10, params.visibleCount / newVisibleCount);
            state.offsetX = newStartIndex;
            
            if (this.selectedStock) {
                const data = this.stockData.get(this.selectedStock.code);
                this.drawKLine(data);
                // P2-10 Fix: keep the volume chart in sync with the K-line chart,
                // matching every other zoom entry point.
                this.drawVolume(data);
            }
        }
    }

    // 触摸事件支持
    onChartTouchStart(e) {
        if (e.touches.length === 1) {
            e.preventDefault();
            const touch = e.touches[0];
            const canvas = e.target;
            const rect = canvas.getBoundingClientRect();
            this.chartState.isDragging = true;
            this.chartState.dragStartX = touch.clientX - rect.left;
            this.chartState.lastOffsetX = this.chartState.offsetX;
        } else if (e.touches.length === 2) {
            // 双指缩放
            e.preventDefault();
            this.chartState.pinchStartDistance = this.getPinchDistance(e.touches);
            this.chartState.pinchStartScale = this.chartState.scaleX;
        }
    }

    onChartTouchMove(e) {
        if (e.touches.length === 1 && this.chartState.isDragging) {
            e.preventDefault();
            const touch = e.touches[0];
            const canvas = e.target;
            const rect = canvas.getBoundingClientRect();
            const x = touch.clientX - rect.left;
            
            const params = this.chartRenderParams;
            if (params) {
                const deltaX = x - this.chartState.dragStartX;
                const candleWidth = params.chartWidth / (params.endIndex - params.startIndex);
                const candleDelta = deltaX / candleWidth;
                
                this.chartState.offsetX = Math.max(0, 
                    this.chartState.lastOffsetX - candleDelta);
                
                if (this.selectedStock) {
                    const data = this.stockData.get(this.selectedStock.code);
                    this.drawKLine(data);
                    // P2-10 Fix: keep the volume chart in sync with the K-line chart
                    // during touch drag, matching the mouse drag handler.
                    this.drawVolume(data);
                }
            }
        } else if (e.touches.length === 2) {
            e.preventDefault();
            const distance = this.getPinchDistance(e.touches);
            // P2-11 Fix: guard against a zero starting distance (two fingers landing on
            // the same pixel) which would divide by zero and poison scaleX with NaN.
            if (this.chartState.pinchStartDistance > 0) {
                const scale = distance / this.chartState.pinchStartDistance;
                this.chartState.scaleX = Math.max(1, Math.min(10, 
                    this.chartState.pinchStartScale * scale));
            }
            
            if (this.selectedStock) {
                const data = this.stockData.get(this.selectedStock.code);
                this.drawKLine(data);
                // P2-10 Fix: keep the volume chart in sync with the K-line chart
                // during touch pinch zoom, matching the mouse zoom handler.
                this.drawVolume(data);
            }
        }
    }

    onChartTouchEnd(e) {
        this.chartState.isDragging = false;
    }

    getPinchDistance(touches) {
        const dx = touches[0].clientX - touches[1].clientX;
        const dy = touches[0].clientY - touches[1].clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }

    // 交易代码输入
    onTradeCodeInput(rawCode, type) {
        // L9 Fix: accept full-width digits / surrounding spaces in the code field.
        const code = normalizeStockCode(rawCode);
        const stock = this._stockPoolByCode ? this._stockPoolByCode.get(code) : StockPool.find(s => s.code === code);
        const nameEl = document.getElementById(`${type}-name`);
        const priceEl = document.getElementById(`${type}-price`);

        if (stock && this.stockData.has(stock.code)) {
            nameEl.textContent = stock.name;
            const data = this.stockData.get(stock.code);
            priceEl.value = data.price.toFixed(2);
            // #15 Fix: entering a code re-arms the auto-fill for this side.
            if (this.tradePriceTouched) this.tradePriceTouched[type] = false;
            this.updateTradeEstimate(type);
        } else {
            nameEl.textContent = '';
        }
    }

    // #15 Fix: the player typed a price of their own, so stop following the market.
    markTradePriceTouched(type) {
        if (!this.tradePriceTouched) this.tradePriceTouched = { buy: false, sell: false };
        this.tradePriceTouched[type] = true;
    }

    // #15 Fix: keep the trade price field in step with the live market *only while the
    // player has not typed a price*. Previously updateStockDetail() overwrote the field
    // on every tick (a typed limit order such as 12.43 silently became 14.24), while a
    // code that was not the selected stock kept a stale auto-filled price and the order
    // then failed to fill. A per-side "touched" flag fixes both directions.
    syncTradePriceFields() {
        if (!this.currentSave) return;
        if (!this.tradePriceTouched) this.tradePriceTouched = { buy: false, sell: false };
        ['buy', 'sell'].forEach(type => {
            if (this.tradePriceTouched[type]) return;
            const codeEl = document.getElementById(type + '-code');
            const priceEl = document.getElementById(type + '-price');
            if (!codeEl || !priceEl) return;
            const code = normalizeStockCode(codeEl.value || '');
            if (!code) return;
            const data = this.stockData.get(code);
            if (!data || !Number.isFinite(data.price)) return;
            const next = data.price.toFixed(2);
            if (priceEl.value !== next) {
                priceEl.value = next;
                this.updateTradeEstimate(type);
            }
        });
    }

    // 更新交易预估
    updateTradeEstimate(type) {
        const code = document.getElementById(`${type}-code`).value;
        const price = parseFloat(document.getElementById(`${type}-price`).value) || 0;
        const quantity = parseInt(document.getElementById(`${type}-quantity`).value) || 0;

        if (!code || !price || !quantity) return;

        const amount = price * quantity;
        const fee = type === 'buy' 
            ? amount * this.currentSave.settings.buyFee
            : amount * this.currentSave.settings.sellFee;
        const total = type === 'buy' ? amount + fee : amount - fee;

        // P1-2 Fix: round estimated fee/total to cents to match actual charge
        const feeRounded = round2(fee);
        const totalRounded = round2(total);
        document.getElementById(`${type}-estimate`).textContent = I18n.t('trade.estimateWithFee', { total: this.formatMoney(totalRounded), fee: feeRounded.toFixed(2) });
    }

    // 设置交易数量
    setTradeQuantity(type, ratio) {
        const code = document.getElementById(`${type}-code`).value;
        const price = parseFloat(document.getElementById(`${type}-price`).value) || 0;
        
        if (!code || !price) return;

        let maxQuantity = 0;
        const tradeUnit = (this.currentSave.settings && this.currentSave.settings.tradeUnit) || 1;
        if (type === 'buy') {
            // Bug fix: reserve the buy fee. floor(fund / price) ignored the commission,
            // so "all in" produced an order whose amount + fee exceeded the available
            // cash and the buy was rejected with "insufficient funds".
            const feeRate = (this.currentSave.settings && this.currentSave.settings.buyFee) || 0;
            const perShareCost = price * (1 + feeRate);
            maxQuantity = perShareCost > 0
                ? Math.floor(this.currentSave.fund / perShareCost / tradeUnit) * tradeUnit
                : 0;
        } else {
            const holding = this.currentSave.holdings[code];
            maxQuantity = holding ? holding.quantity : 0;
        }

        const quantity = Math.floor(maxQuantity * ratio / this.currentSave.settings.tradeUnit) * this.currentSave.settings.tradeUnit;
        // Assign a string: HTMLInputElement.value always coerces, but keeping it explicit
        // means the value can never leak a number into the Number()/typeof validation.
        document.getElementById(`${type}-quantity`).value = quantity > 0 ? String(quantity) : '';
        this.updateTradeEstimate(type);
    }

    // 更新可用资金和持仓显示
    updateTradeAvailable() {
        if (!this.currentSave) return;
        
        document.getElementById('buy-available').textContent = this.formatCurrency(this.currentSave.fund);
        
        // 更新持仓列表
        const holdingsList = document.getElementById('trade-holdings-list');
        if (!holdingsList) return;
        
        const holdings = Object.entries(this.currentSave.holdings || {});
        
        if (holdings.length === 0) {
            holdingsList.innerHTML = `<p style="text-align:center;color:var(--text-secondary);padding:20px;">${I18n.t('portfolio.noHoldings')}</p>`;
            return;
        }

        let html = '';
        holdings.forEach(([code, holding]) => {
            const data = this.stockData.get(code);
            if (!data) return;
            const pnl = (data.price - holding.avgPrice) * holding.quantity;
            const pnlClass = pnl >= 0 ? 'up' : 'down';
            // P0-1 Fix: escape all user-controllable fields
            const codeEsc = escapeHtml(code);
            const nameEsc = escapeHtml(holding.name);
            // P1-2b Fix: sign before the currency symbol (-¥42.33), never ¥-42.33.
            const pnlText = escapeHtml(this.formatCurrency(pnl, true));

            html += `
                <div class="holding-item" data-code="${codeEsc}">
                    <div class="holding-info">
                        <div class="name">${nameEsc}</div>
                        <div class="code">${codeEsc}</div>
                    </div>
                    <div class="holding-qty">
                        <div class="qty">${escapeHtml(I18n.t('trade.shares', { quantity: holding.quantity }))}</div>
                        <div class="pnl ${pnlClass}">${pnlText}</div>
                    </div>
                </div>
            `;
        });

        holdingsList.innerHTML = html;

        holdingsList.querySelectorAll('.holding-item').forEach(item => {
            item.addEventListener('click', () => {
                const code = item.dataset.code;
                
                // 判断当前激活的交易标签
                const activeTab = document.querySelector('.trade-tab.active');
                const tradeType = activeTab ? activeTab.dataset.trade : 'sell'; // 默认为卖出
                
                // 同时填充到买入和卖出输入框
                const buyCodeInput = document.getElementById('buy-code');
                const sellCodeInput = document.getElementById('sell-code');
                if (buyCodeInput) {
                    buyCodeInput.value = code;
                    this.onTradeCodeInput(code, 'buy');
                }
                if (sellCodeInput) {
                    sellCodeInput.value = code;
                    this.onTradeCodeInput(code, 'sell');
                }
                
                // 添加视觉反馈
                item.style.background = 'rgba(88, 166, 255, 0.2)';
                setTimeout(() => {
                    item.style.background = '';
                }, 200);
            });
        });
    }

    // P1-10 Fix: deep-clone a save so a failed persistence write can be rolled back.
    // structuredClone preserves the Set used by gameStats.sectorsTraded; the JSON
    // fallback rehydrates it explicitly for older environments.
    cloneSaveData(save) {
        if (!save) return null;
        if (typeof structuredClone === 'function') {
            try {
                return structuredClone(save);
            } catch (e) {
                // fall through to the JSON path
            }
        }
        const copy = JSON.parse(JSON.stringify(save, (key, value) => {
            if (value instanceof Set) return { __setValues: Array.from(value) };
            return value;
        }));
        if (copy.gameStats && copy.gameStats.sectorsTraded && copy.gameStats.sectorsTraded.__setValues) {
            copy.gameStats.sectorsTraded = new Set(copy.gameStats.sectorsTraded.__setValues);
        }
        return copy;
    }

    // Restore a snapshot produced by cloneSaveData() for the active save slot.
    restoreSaveSnapshot(snapshot) {
        if (!snapshot) return;
        // #24 Fix: a failed save caused by another tab deleting the account has already
        // torn the session down. Reviving currentSave here would leave a save object with
        // no currentUser behind the login screen.
        if (!this.currentUser) return;
        this.currentSave = snapshot;
        if (this.currentUser && this.currentUser.username && this.users &&
            this.users[this.currentUser.username]) {
            this.users[this.currentUser.username].saves[this.currentSaveIndex] = snapshot;
        }
    }

    // 执行交易
    executeTrade(type) {
        // 获取交易参数
        // L9 Fix: normalise the stock code (trim + full-width digits) before lookup.
        const code = normalizeStockCode(document.getElementById(`${type}-code`).value);
        const priceRaw = document.getElementById(`${type}-price`).value;
        const quantityRaw = document.getElementById(`${type}-quantity`).value;

        // P2-3 Fix: parse with explicit Number() and validate type/range BEFORE using the value.
        // parseFloat("3.7") silently becomes 3, parseInt("100abc") silently becomes 100, and
        // 1e9 is silently accepted. Reject non-integer/negative/huge values to avoid mis-trades.
        const parsedPrice = Number(priceRaw);
        if (typeof priceRaw !== 'string' || priceRaw.trim() === '' || !Number.isFinite(parsedPrice) || parsedPrice <= 0) {
            alert(I18n.t('trade.invalidPrice'));
            return;
        }
        // L8 Fix: a price above the ceiling used to report "must be > 0"; give the real reason.
        if (parsedPrice > 1e7) {
            alert(I18n.t('trade.priceTooHigh', { max: '10000000' }));
            return;
        }
        // L7 Fix: A-share quotes tick in 0.01, so round the entered price to cents.
        const price = this.limitManager.roundToTick(parsedPrice);
        const quantity = Number(quantityRaw);
        if (typeof quantityRaw !== 'string' || quantityRaw.trim() === '' || !Number.isInteger(quantity) || quantity <= 0) {
            alert(I18n.t('trade.invalidQuantity'));
            return;
        }
        // Bug fix: an oversized quantity (e.g. 1e10) used to be reported with the generic
        // "enter a valid integer" message; give the real reason, like the price ceiling does.
        if (quantity > 1e9) {
            alert(I18n.t('trade.quantityTooHigh', { max: '1000000000' }));
            return;
        }
        // P2-3 Fix: quantity must be a multiple of the configured trade unit
        const tradeUnit = (this.currentSave.settings && this.currentSave.settings.tradeUnit) || 1;
        if (quantity % tradeUnit !== 0) {
            alert(I18n.t('trade.invalidQuantityUnit', { unit: tradeUnit }));
            return;
        }

        // 验证交易参数
        const validationResult = this.validateTradeParameters(type, code, price, quantity);
        if (!validationResult.valid) {
            alert(validationResult.message);
            return;
        }

        const stock = validationResult.stock;
        // S1 Fix: fill at the matched market price returned by validateTradeParameters,
        // never at the typed limit price (which permitted risk-free arbitrage).
        const fillPrice = validationResult.fillPrice;
        const amount = fillPrice * quantity;
        const fee = type === 'buy' ? amount * this.currentSave.settings.buyFee : amount * this.currentSave.settings.sellFee;

        // P1-10 Fix: snapshot the save so the in-memory trade can be rolled back if the
        // subsequent localStorage write fails.
        const saveSnapshot = this.cloneSaveData(this.currentSave);

        // 执行交易操作
        const tradeResult = type === 'buy' 
            ? this.executeBuyTrade(code, stock, fillPrice, quantity, amount, fee)
            : this.executeSellTrade(code, stock, fillPrice, quantity, amount, fee);

        if (!tradeResult.success) {
            alert(tradeResult.message);
            return;
        }

        // 记录交易（传入下单前资金，供「梭哈选手」成就按真实仓位比例判定）
        this.recordTrade(type, code, stock, fillPrice, quantity, amount, fee, tradeResult.pnl,
            saveSnapshot ? saveSnapshot.fund : null);

        // P1-10 Fix: do not report success unless the trade actually persisted. On a
        // failed write, roll the trade back so the UI matches what is on disk.
        if (!this.saveUsers()) {
            this.restoreSaveSnapshot(saveSnapshot);
            this.updateAfterTrade();
            alert(I18n.t('trade.saveFailedRollback'));
            return;
        }

        // 保存并更新UI
        this.updateAfterTrade();

        // 检查成就
        this.checkAchievements();

        alert(I18n.t(type === 'buy' ? 'trade.buySuccess' : 'trade.sellSuccess'));
    }

    // 验证交易参数
    validateTradeParameters(type, code, price, quantity) {
        if (!code || !price || !quantity) {
            return { valid: false, message: I18n.t('trade.incompleteInfo') };
        }

        // 验证交易时间
        if (!this.isTradingTime()) {
            return { valid: false, message: I18n.t('trade.notInTradingTime') };
        }

        // 验证价格合理性
        if (price <= 0) {
            return { valid: false, message: I18n.t('trade.invalidPrice') };
        }

        // Validate that the code exists before reasoning about prices. L9 Fix: codes are
        // already normalised by executeTrade; _stockPoolByCode is the O(1) index.
        const stock = this._stockPoolByCode ? this._stockPoolByCode.get(code) : StockPool.find(s => s.code === code);
        if (!stock) {
            return { valid: false, message: I18n.t('trade.stockNotExist') };
        }

        // Bug fix: check the sellable position before reasoning about prices, so selling a
        // stock the player does not own reports "insufficient holdings" (not a price error).
        if (type === 'sell') {
            const holding = this.currentSave.holdings[code];
            if (!holding || holding.quantity < quantity) {
                return { valid: false, message: I18n.t('trade.insufficientHolding') };
            }
        }

        // 验证价格与市场价格的合理性
        let fillPrice = price;
        let stockData = this.stockData.get(code);
        if (stockData) {
            const marketPrice = stockData.price;
            const limitUpPrice = this.limitManager.calculateLimitUpPrice(stockData.prevClose);
            const limitDownPrice = this.limitManager.calculateLimitDownPrice(stockData.prevClose);
            const MAX_PRICE_DEVIATION = 0.20; // 委托价与市价最大偏离度 20%（硬阻断）
            const WARN_PRICE_DEVIATION = 0.10; // 委托价与市价偏离度 10%（警示确认）

            // 检查熔断状态
            if (this.limitManager.isCircuitBreakerActive(code)) {
                return { valid: false, message: I18n.t('trade.circuitBreakerActive') };
            }

            // S1 Fix: enforce the daily band on BOTH sides. Previously a buy below
            // limit-down or a sell above limit-up was not blocked, and because orders
            // filled at the typed price this was risk-free money.
            if (price > limitUpPrice) {
                return { valid: false, message: I18n.t('trade.priceAboveLimitUp', { price: limitUpPrice.toFixed(2) }) };
            }
            if (price < limitDownPrice) {
                return { valid: false, message: I18n.t('trade.priceBelowLimitDown', { price: limitDownPrice.toFixed(2) }) };
            }

            // S1 Fix: match the limit order against the current market. A buy fills only
            // when the market is at or below the limit; a sell only when it is at or above.
            // The fill price is the market price, so the typed price can never be better
            // than the market and no risk-free arbitrage is possible.
            if (type === 'buy') {
                if (marketPrice > price + 1e-9) {
                    return { valid: false, message: I18n.t('trade.limitBuyNotFilled', {
                        price: marketPrice.toFixed(2),
                        limit: price.toFixed(2)
                    }) };
                }
            } else if (marketPrice < price - 1e-9) {
                return { valid: false, message: I18n.t('trade.limitSellNotFilled', {
                    price: marketPrice.toFixed(2),
                    limit: price.toFixed(2)
                }) };
            }
            fillPrice = marketPrice;

            // 委托价与当前市价偏离度校验（针对已能成交的委托，作为防误触保护）
            const deviation = Math.abs(price - marketPrice) / marketPrice;
            const lowerBound = marketPrice * (1 - MAX_PRICE_DEVIATION);
            const upperBound = marketPrice * (1 + MAX_PRICE_DEVIATION);

            if (deviation > MAX_PRICE_DEVIATION) {
                return { valid: false, message: I18n.t('trade.priceDeviationExceeded', {
                    price: marketPrice.toFixed(2),
                    percent: (MAX_PRICE_DEVIATION * 100).toFixed(0),
                    lower: lowerBound.toFixed(2),
                    upper: upperBound.toFixed(2)
                }) };
            } else if (deviation > WARN_PRICE_DEVIATION) {
                if (!confirm(I18n.t('trade.priceDeviationWarn', {
                    price: marketPrice.toFixed(2),
                    percent: (deviation * 100).toFixed(1)
                }))) {
                    return { valid: false, message: I18n.t('trade.cancelled') };
                }
            }
        }

        return { valid: true, stock, fillPrice };
    }

    // 买入成功后统一的统计更新（手动交易与自动交易共用，避免两处逻辑分叉）
    // stock 可能为 undefined（自动交易找不到缓存股票时），此时跳过行业统计
    updateStatsAfterBuy(stock) {
        const stats = this.currentSave.gameStats;
        stats.tradeCount++;
        if (!(stats.sectorsTraded instanceof Set)) {
            stats.sectorsTraded = new Set();
        }
        if (stock && stock.industry) {
            stats.sectorsTraded.add(stock.industry);
        }
        const holdingCount = Object.keys(this.currentSave.holdings).length;
        if (holdingCount > stats.maxHoldings) {
            stats.maxHoldings = holdingCount;
        }
    }

    // 执行买入交易
    executeBuyTrade(code, stock, price, quantity, amount, fee) {
        const totalCost = amount + fee;
        // P0-2 Fix: depth defense. If any upstream value is not finite, refuse the trade
        // instead of letting `NaN > fund` silently pass and round2() zero the balance.
        if (!Number.isFinite(totalCost) || totalCost < 0 || !Number.isFinite(this.currentSave.fund)) {
            console.error('[executeBuyTrade] 非有限金额，拒绝交易:', { amount, fee, totalCost, fund: this.currentSave.fund });
            return { success: false, message: I18n.t('trade.invalidAmount') };
        }
        if (totalCost > this.currentSave.fund) {
            return { success: false, message: I18n.t('trade.insufficientFund') };
        }

        // T+1 规则说明：真实 A 股只限制“当日买入的股票当日不得卖出”，并不限制
        // “当日卖出后再买回同一只股票”。此前这里禁止当日卖出后买回，与真实规则
        // 不符（买回后，当日新买入的部分依然受卖出侧 T+1 限制约束，无套利空间）。
        // 卖出侧限制见 executeSellTrade。

        // 执行买入
        // P1-2 Fix: round money to cents to prevent float drift
        this.currentSave.fund = round2(this.currentSave.fund - totalCost);

        if (!this.currentSave.holdings[code]) {
            this.currentSave.holdings[code] = {
                name: stock.name,
                quantity: 0,
                avgPrice: 0,
                totalCost: 0
            };
        }

        const holding = this.currentSave.holdings[code];
        const newTotalCost = round2(holding.totalCost + totalCost);
        holding.quantity += quantity;
        holding.avgPrice = round2(newTotalCost / holding.quantity);
        holding.totalCost = newTotalCost;

        // 记录当日买入
        if (!this.currentSave.dayTrades[code]) {
            this.currentSave.dayTrades[code] = { buy: 0, sell: 0 };
        }
        this.currentSave.dayTrades[code].buy += quantity;

        // 更新统计（与自动交易共用，含 maxHoldings）
        this.updateStatsAfterBuy(stock);

        return { success: true, pnl: 0 };
    }

    // 执行卖出交易
    executeSellTrade(code, stock, price, quantity, amount, fee) {
        const holding = this.currentSave.holdings[code];
        // Bug fix: check holdings FIRST. Selling a stock that is not held used to fall
        // through to the non-finite guard below (because holding.avgPrice was undefined),
        // which logged a console.error and reported "invalid trade amount" instead of the
        // correct "insufficient holdings".
        if (!holding || holding.quantity < quantity) {
            return { success: false, message: I18n.t('trade.insufficientHolding') };
        }
        // P0-2 Fix: reject non-finite proceeds/fund before mutating any state.
        if (!Number.isFinite(amount) || !Number.isFinite(fee) ||
            !Number.isFinite(this.currentSave.fund) ||
            !Number.isFinite(holding.avgPrice)) {
            console.error('[executeSellTrade] 非有限金额，拒绝交易:', { amount, fee, fund: this.currentSave.fund });
            return { success: false, message: I18n.t('trade.invalidAmount') };
        }

        // T+1检查
        if (!this.currentSave.settings.t0Mode) {
            const dayTrades = this.currentSave.dayTrades[code] || { buy: 0, sell: 0 };
            const availableQty = holding.quantity - dayTrades.buy;
            if (quantity > availableQty) {
                return { success: false, message: I18n.t('trade.t1SellBlocked', { bought: dayTrades.buy, available: availableQty }) };
            }
        }

        // 执行卖出
        const totalIncome = amount - fee;
        // P1-2 Fix: round money to cents
        this.currentSave.fund = round2(this.currentSave.fund + totalIncome);

        // P1-5 Fix: include sell fee in PnL so that achievements/stop-loss reflect realized profit.
        // Bug fix: the sold cost basis used to be recomputed from the cents-rounded
        // avgPrice (round2(avgPrice * remainingQty)), so a partial sell made totalCost
        // drift (e.g. 4213.27 -> 4212). Remove the exact proportional share of the stored
        // total cost instead and re-derive the display average.
        const removedCost = round2(holding.totalCost * quantity / holding.quantity);
        const pnl = round2((price * quantity) - removedCost - fee);

        holding.quantity -= quantity;
        holding.totalCost = round2(holding.totalCost - removedCost);

        if (holding.quantity === 0) {
            delete this.currentSave.holdings[code];
        } else {
            holding.avgPrice = round2(holding.totalCost / holding.quantity);
        }

        // 记录当日卖出
        if (!this.currentSave.dayTrades[code]) {
            this.currentSave.dayTrades[code] = { buy: 0, sell: 0 };
        }
        this.currentSave.dayTrades[code].sell += quantity;

        // 更新统计
        this.currentSave.gameStats.tradeCount++;
        // Bug fix: 盈亏恰好为 0 的卖出既不算盈利也不算亏损（此前被计入亏损次数）
        if (pnl > 0) {
            this.currentSave.gameStats.profitCount++;
        } else if (pnl < 0) {
            this.currentSave.gameStats.lossCount++;
        }

        return { success: true, pnl };
    }

    // Bug fix: a single source of truth for "when did this happen in game time".
    // The real calendar date is kept for display, but the game day (dayIndex) and the
    // game-clock minutes are what every day/time-based achievement must use.
    getGameTimestamp() {
        const d = new Date();
        d.setHours(this.gameTime.hour, this.gameTime.minute, 0, 0);
        return {
            time: d.getTime(),
            dayIndex: this.gameTime.dayIndex || 0,
            gameMinutes: this.gameTime.hour * 60 + this.gameTime.minute
        };
    }

    // 记录交易
    recordTrade(type, code, stock, price, quantity, amount, fee, pnl, fundBefore = null) {
        // 使用游戏时间创建交易记录时间
        const stamp = this.getGameTimestamp();

        // M6 Fix: accumulate fees + realized P&L in dedicated counters so the 100-record
        // cap cannot undercount the fee/profit achievements.
        if (this.currentSave.gameStats) {
            this.currentSave.gameStats.totalFees = round2((this.currentSave.gameStats.totalFees || 0) + fee);
            if (pnl > 0) {
                this.currentSave.gameStats.realizedProfit = round2((this.currentSave.gameStats.realizedProfit || 0) + pnl);
            } else if (pnl < 0) {
                this.currentSave.gameStats.realizedLoss = round2((this.currentSave.gameStats.realizedLoss || 0) + Math.abs(pnl));
            }
        }

        // Bug fix: persist the game day + game-clock minutes (for day-based achievements
        // and the "第 N 天 HH:MM" display) and the pre-trade cash (for 梭哈选手). Amounts
        // are rounded to cents so records no longer carry values like 7730.83683.
        const signedAmount = type === 'buy' ? -(amount + fee) : (amount - fee);
        this.currentSave.records.unshift({
            // #24 Fix: unique id so a multi-tab merge never collapses two identical trades.
            id: (Crypto && Crypto.uuid) ? Crypto.uuid() : ('r-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10)),
            time: stamp.time,
            dayIndex: stamp.dayIndex,
            gameMinutes: stamp.gameMinutes,
            fundBefore: Number.isFinite(fundBefore) ? round2(fundBefore) : null,
            code,
            name: stock.name,
            type,
            price,
            quantity,
            amount: round2(signedAmount),
            pnl: round2(pnl)
        });

        // 限制记录数量
        if (this.currentSave.records.length > 100) {
            this.currentSave.records = this.currentSave.records.slice(0, 100);
        }
    }

    // 交易后更新
    updateAfterTrade() {
        // 更新UI - 同时更新交易页面的持仓列表和持仓页面
        setTimeout(() => {
            this.updateTradeAvailable();
            this.updatePortfolio();
            // P1-6 Fix: updateStockList() was never defined anywhere; use the real
            // renderStockList() (which expects the current search keyword).
            this.renderStockList(this.stockSearch.keyword);
        }, 0);

        // 清空两个表单
        ['buy', 'sell'].forEach(tradeType => {
            document.getElementById(`${tradeType}-code`).value = '';
            document.getElementById(`${tradeType}-name`).textContent = '';
            document.getElementById(`${tradeType}-price`).value = '';
            document.getElementById(`${tradeType}-quantity`).value = '';
            document.getElementById(`${tradeType}-estimate`).textContent = '--';
        });
        // #15 Fix: the forms are empty again, so the price fields may follow the market.
        this.tradePriceTouched = { buy: false, sell: false };
    }

    // 更新持仓页面
    updatePortfolio() {
        if (!this.currentSave) return;

        let stockValue = 0;
        let totalCost = 0;

        // 计算持仓市值和成本
        Object.entries(this.currentSave.holdings).forEach(([code, holding]) => {
            const data = this.stockData.get(code);
            // P1-4 Fix: mirror the guard already present in updateTradeAvailable() and
            // calculateStockValue(). A holding for an unknown/corrupt code made this line
            // throw on every portfolio render, permanently "bricking" the account view.
            if (!data || !holding || !Number.isFinite(holding.quantity)) return;
            debugLog(`持仓数据: ${code} - 成本价: ${holding.avgPrice}, 现价: ${data.price}, 数量: ${holding.quantity}, 总成本: ${holding.totalCost}`);
            stockValue += data.price * holding.quantity;
            totalCost += holding.totalCost;
        });

        const totalAssets = this.currentSave.fund + stockValue;
        const floatingPnl = stockValue - totalCost;
        // P1-3b Fix: guard against initialFund === 0 to avoid a displayed "Infinity%".
        const totalReturn = this.currentSave.initialFund > 0
            ? (totalAssets - this.currentSave.initialFund) / this.currentSave.initialFund
            : 0;

        // 更新摘要
        document.getElementById('total-assets').textContent = this.formatCurrency(totalAssets);
        document.getElementById('stock-value').textContent = this.formatCurrency(stockValue);
        document.getElementById('available-fund').textContent = this.formatCurrency(this.currentSave.fund);
        document.getElementById('floating-pnl').textContent = this.formatCurrency(floatingPnl, true);
        document.getElementById('floating-pnl').className = `value ${floatingPnl >= 0 ? 'up' : 'down'}`;
        // P1-2b Fix: (totalReturn * 100).toFixed(2) rendered a ~-0.004% return as "-0.00%".
        document.getElementById('total-return').textContent = this.formatPercent(totalReturn * 100, false);
        document.getElementById('total-return').className = `value ${totalReturn >= 0 ? 'up' : 'down'}`;

        // 更新持仓明细
        const tbody = document.getElementById('portfolio-holdings-tbody');
        // P1-4 Fix: drop rows whose market data / cost basis is missing instead of
        // dereferencing undefined while building the table.
        const holdings = Object.entries(this.currentSave.holdings).filter(([code, holding]) => {
            const d = this.stockData.get(code);
            return d && holding && Number.isFinite(holding.quantity) && Number.isFinite(holding.avgPrice);
        });

        if (holdings.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:30px;">${I18n.t('portfolio.noHoldings')}</td></tr>`;
        } else {
            tbody.innerHTML = holdings.map(([code, holding]) => {
                const data = this.stockData.get(code);
                const marketValue = data.price * holding.quantity;
                const pnl = marketValue - holding.totalCost;
                const pnlRate = holding.totalCost > 0 ? (pnl / holding.totalCost * 100) : 0;
                const pnlClass = pnl >= 0 ? 'up' : 'down';
                // P0-1 Fix: escape all user-controllable fields
                const codeEsc = escapeHtml(code);
                const nameEsc = escapeHtml(holding.name);
                const qtyEsc = escapeHtml(String(holding.quantity));
                const avgText = escapeHtml(this.formatCurrencyExact(holding.avgPrice));
                const priceText = escapeHtml(this.formatCurrencyExact(data.price));
                const mvText = escapeHtml(this.formatCurrencyExact(marketValue));
                const pnlText = escapeHtml(this.formatCurrencyExact(pnl, true));
                const rateText = escapeHtml(this.formatPercent(pnlRate, true));

                return `
                    <tr data-code="${codeEsc}" style="cursor: pointer; hover: background-color: rgba(88, 166, 255, 0.1);">
                        <td>${nameEsc}<br><small>${codeEsc}</small></td>
                        <td>${qtyEsc}</td>
                        <td>${avgText}</td>
                        <td>${priceText}</td>
                        <td>${mvText}</td>
                        <td class="${pnlClass}">${pnlText}</td>
                        <td class="${pnlClass}">${rateText}</td>
                    </tr>
                `;
            }).join('');
            
            // 添加点击事件监听器
            tbody.querySelectorAll('tr[data-code]').forEach(row => {
                row.addEventListener('click', () => {
                    const code = row.dataset.code;
                    const stock = StockPool.find(s => s.code === code);
                    if (stock) {
                        // 切换到行情页面
                        document.querySelector('[data-page="market"]').click();
                        // 选择股票，跳转到实时行情界面
                        this.selectStock(stock);
                    }
                });
                
                // 添加右键菜单事件
                row.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    const code = row.dataset.code;
                    const rect = row.getBoundingClientRect();
                    
                    // 创建右键菜单
                    const menu = document.createElement('div');
                    menu.className = 'context-menu';
                    menu.style.position = 'fixed';
                    menu.style.left = `${e.clientX}px`;
                    menu.style.top = `${e.clientY}px`;
                    // P0-1 Fix: escape the code in data-code attribute
                    const codeEsc = escapeHtml(code);
                    menu.innerHTML = `
                        <div class="context-menu-item" data-action="trade" data-code="${codeEsc}">
                            ${escapeHtml(I18n.t('portfolio.contextMenu.trade'))}
                        </div>
                        <div class="context-menu-item" data-action="auto-trade" data-code="${codeEsc}">
                            ${escapeHtml(I18n.t('portfolio.contextMenu.autoTrade'))}
                        </div>
                        <div class="context-menu-item" data-action="view-detail" data-code="${codeEsc}">
                            ${escapeHtml(I18n.t('portfolio.contextMenu.viewDetail'))}
                        </div>
                    `;
                    
                    document.body.appendChild(menu);
                    
                    // 点击其他地方关闭菜单
                    const closeMenu = () => {
                        document.body.removeChild(menu);
                        document.removeEventListener('click', closeMenu);
                    };
                    
                    document.addEventListener('click', closeMenu);
                    
                    // 菜单项点击事件
                    menu.querySelectorAll('.context-menu-item').forEach(item => {
                        item.addEventListener('click', (e) => {
                            e.stopPropagation();
                            const action = item.dataset.action;
                            const stockCode = item.dataset.code;
                            const stock = StockPool.find(s => s.code === stockCode);
                            
                            if (action === 'trade' && stock) {
                                // 切换到交易页面
                                document.querySelector('[data-page="trade"]').click();
                                // 填充股票代码
                                document.getElementById('buy-code').value = stock.code;
                                document.getElementById('sell-code').value = stock.code;
                                // 触发代码输入事件，更新股票名称和价格
                                this.onTradeCodeInput(stock.code, 'buy');
                                this.onTradeCodeInput(stock.code, 'sell');
                                // 聚焦到交易相关操作区域
                                setTimeout(() => {
                                    document.getElementById('buy-code').focus();
                                }, 100);
                            } else if (action === 'auto-trade' && stock) {
                                // 切换到自动交易页面
                                document.querySelector('[data-page="auto-trade"]').click();
                                // 填充股票代码
                                document.getElementById('auto-code').value = stock.code;
                                // 触发代码输入事件，更新股票名称
                                this.onAutoTradeCodeInput(stock.code);
                            } else if (action === 'view-detail' && stock) {
                                // 切换到行情页面
                                document.querySelector('[data-page="market"]').click();
                                // 选择股票
                                this.selectStock(stock);
                            }
                            
                            closeMenu();
                        });
                    });
                });
            });
        }

        // 更新成交记录
        const recordsTbody = document.getElementById('trade-records-tbody');
        if (this.currentSave.records.length === 0) {
            recordsTbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:30px;">${I18n.t('portfolio.noRecords')}</td></tr>`;
        } else {
            recordsTbody.innerHTML = this.currentSave.records.slice(0, 20).map(record => {
                const date = new Date(record.time);
                const typeClass = record.type === 'buy' ? 'down' : 'up';
                // Bug fix: show the game day + game clock. Previously the real date was
                // shown, so trades made on different game days collapsed onto one date.
                let dateRaw;
                if (Number.isFinite(record.dayIndex)) {
                    const mins = Number.isFinite(record.gameMinutes) ? record.gameMinutes : 0;
                    const hh = String(Math.floor(mins / 60) % 24).padStart(2, '0');
                    const mm = String(mins % 60).padStart(2, '0');
                    dateRaw = I18n.t('portfolio.recordDayTime', { day: record.dayIndex, time: hh + ':' + mm });
                } else {
                    dateRaw = date.toLocaleString(I18n.getCurrentLanguage());
                }
                // P0-1 Fix: escape all user-controllable fields
                const dateText = escapeHtml(dateRaw);
                const recName = escapeHtml(record.name);
                const recCode = escapeHtml(record.code);
                const recPrice = escapeHtml(this.formatCurrencyExact(Number(record.price || 0)));
                const recQty = escapeHtml(String(record.quantity || 0));
                const recAmt = escapeHtml(this.formatCurrencyExact(Math.abs(Number(record.amount || 0))));
                const typeText = escapeHtml(I18n.t(record.type === 'buy' ? 'common.buy' : 'common.sell'));
                return `
                    <tr>
                        <td>${dateText}</td>
                        <td>${recName}<br><small>${recCode}</small></td>
                        <td class="${typeClass}">${typeText}</td>
                        <td>${recPrice}</td>
                        <td>${recQty}</td>
                        <td>${recAmt}</td>
                    </tr>
                `;
            }).join('');
        }
    }

    // 实时更新持仓
    updatePortfolioRealTime() {
        if (!document.getElementById('portfolio-page').classList.contains('active')) return;
        this.updatePortfolio();
    }

    // 更新个人主页
    updateProfile() {
        if (!this.currentUser) return;

        document.getElementById('profile-username').textContent = this.currentUser.username;
        document.getElementById('reg-time').textContent = new Date(this.currentUser.createdAt).toLocaleDateString(I18n.getCurrentLanguage());

        // 统计
        const saves = this.currentUser.saves || [];
        const totalTrades = saves.reduce((sum, s) => sum + (s.gameStats?.tradeCount || 0), 0);
        // Guard: updateProfile() can run while no save is loaded (e.g. save list).
        const achievements = (this.currentSave && this.currentSave.achievements) || [];

        document.getElementById('stat-games').textContent = saves.length;
        document.getElementById('stat-trades').textContent = totalTrades;
        document.getElementById('stat-achievements').textContent = `${achievements.length}/${AchievementSystem.achievements.length}`;

        // 成就统计
        const counts = { bronze: 0, silver: 0, gold: 0, legend: 0 };
        achievements.forEach(id => {
            const ach = AchievementSystem.achievements.find(a => a.id === id);
            if (ach) counts[ach.level]++;
        });

        document.getElementById('count-bronze').textContent = counts.bronze;
        document.getElementById('count-silver').textContent = counts.silver;
        document.getElementById('count-gold').textContent = counts.gold;
        document.getElementById('count-legend').textContent = counts.legend;

        // 成就列表
        const listEl = document.getElementById('achievements-list');
        const toggleBtn = document.getElementById('toggle-achievements-btn');
        
        // 从本地存储获取展开状态
        const isExpanded = localStorage.getItem('achievements-expanded') === 'true';
        
        // 渲染成就列表
        const allAchievements = AchievementSystem.achievements.map(ach => {
            const unlocked = achievements.includes(ach.id);
            // P2-4 Fix: surface intentionally-unimplemented achievements as "coming soon"
            // instead of leaving them silently locked forever.
            const comingSoon = !!ach.comingSoon;
            const soonBadge = comingSoon
                ? `<span class="achievement-level-badge coming-soon">${escapeHtml(I18n.t('achievement.comingSoon'))}</span>`
                : '';
            // P0-1 Fix: escape achievement fields (icon, name, desc) when rendered as HTML
            return `
                <div class="achievement-card ${unlocked ? 'unlocked' : 'locked'}${comingSoon ? ' coming-soon' : ''}">
                    <div class="achievement-icon-small">${escapeHtml(ach.icon)}</div>
                    <div class="achievement-info">
                        <h4>${escapeHtml(AchievementSystem.getName(ach))}</h4>
                        <p>${escapeHtml(AchievementSystem.getDesc(ach))}</p>
                    </div>
                    <span class="achievement-level-badge ${escapeHtml(ach.level)}">${escapeHtml(AchievementSystem.getLevelName(ach.level))}</span>
                    ${soonBadge}
                </div>
            `;
        }).join('');
        
        listEl.innerHTML = allAchievements;
        
        // 控制按钮显示/隐藏
        if (AchievementSystem.achievements.length <= 6) {
            toggleBtn.style.display = 'none';
        } else {
            toggleBtn.style.display = 'block';
            
            // 设置按钮文本
            toggleBtn.textContent = I18n.t(isExpanded ? 'profile.collapse' : 'profile.expandAll');

            // 应用展开/收缩状态
            this.toggleAchievements(isExpanded, false);

            // 绑定点击事件
            toggleBtn.onclick = () => {
                const currentState = localStorage.getItem('achievements-expanded') === 'true';
                const newState = !currentState;
                this.toggleAchievements(newState, true);
                toggleBtn.textContent = I18n.t(newState ? 'profile.collapse' : 'profile.expandAll');
                localStorage.setItem('achievements-expanded', newState);
            };
        }
    }

    // 切换成就墙展开/收缩状态
    toggleAchievements(expanded, animate = true) {
        const listEl = document.getElementById('achievements-list');
        if (!listEl) return;
        
        // 计算默认显示的高度（显示前6个成就）
        const cardHeight = 80; // 每个成就卡片的大致高度
        const defaultHeight = cardHeight * 6 + 15 * 5; // 6个卡片 + 5个间隙
        
        // 计算展开后的高度
        const totalCards = AchievementSystem.achievements.length;
        const expandedHeight = cardHeight * totalCards + 15 * (totalCards - 1);
        
        // 应用高度
        if (animate) {
            listEl.style.maxHeight = expanded ? expandedHeight + 'px' : defaultHeight + 'px';
        } else {
            // 无动画直接设置
            listEl.style.maxHeight = expanded ? '10000px' : defaultHeight + 'px';
        }
    }

    // 检查成就
    checkAchievements() {
        debugLog('开始检查成就...');
        const stats = this.calculateSaveStats();
        const unlocked = this.currentSave.achievements || [];
        
        debugLog(`当前已解锁成就: ${unlocked.length}个`);
        debugLog('已解锁成就列表:', unlocked);
        
        const newAchievements = AchievementSystem.checkAchievements(stats, unlocked);
        
        debugLog(`新解锁成就: ${newAchievements.length}个`);
        
        if (newAchievements.length > 0) {
            newAchievements.forEach(ach => {
                debugLog(`解锁成就: ${ach.name} (${ach.id})`);
                unlocked.push(ach.id);
                this.showAchievementPopup(ach);
            });
            this.currentSave.achievements = unlocked;
            // 同步到 users 对象，确保数据一致性
            if (this.currentUser.username && this.users[this.currentUser.username]) {
                this.users[this.currentUser.username].saves[this.currentSaveIndex] = this.currentSave;
            }
            this.saveUsers();
            
            // 实时更新成就墙显示
            this.updateProfile();
            
            debugLog(`成就检查完成，共解锁 ${newAchievements.length} 个新成就`);
        } else {
            debugLog('没有新成就解锁');
        }
    }

    // 计算当前存档的统计数据（用于成就检查）
    calculateSaveStats() {
        const save = this.currentSave;
        
        let totalProfit = 0;
        let totalLoss = 0;
        let tradeCount = save.gameStats?.tradeCount || 0;
        let maxHoldings = save.gameStats?.maxHoldings || 0;
        const sectorsTraded = new Set(save.gameStats?.sectorsTraded || []);
        let dayTrades = save.gameStats?.dayTrades || 0;

        // M6 Fix: base the profit/loss achievements on REALIZED results — the pnl stored
        // when a position is sold — instead of floating total assets. The old formula
        // counted the buy fee as a loss (so "first loss" unlocked on the first buy) and
        // let random price wiggles permanently unlock "profit" achievements without a sale.
        let realizedProfit = 0;
        let realizedLoss = 0;
        (save.records || []).forEach(r => {
            if (typeof r.pnl !== 'number' || !isFinite(r.pnl)) return;
            if (r.pnl > 0) realizedProfit += r.pnl;
            else if (r.pnl < 0) realizedLoss += Math.abs(r.pnl);
        });
        // Prefer the persisted cumulative counters (records are capped at 100); Math.max
        // keeps saves created before the counters existed working.
        totalProfit = Math.max(round2(realizedProfit), Number(save.gameStats && save.gameStats.realizedProfit) || 0);
        totalLoss = Math.max(round2(realizedLoss), Number(save.gameStats && save.gameStats.realizedLoss) || 0);

        // 计算收益率（基于已实现盈亏）
        const maxReturn = save.initialFund > 0 ? (realizedProfit - realizedLoss) / save.initialFund : 0;

        // 获取自选股数量
        const watchlistCount = save.watchlist?.length || 0;

        // 计算连续盈利次数
        let profitStreak = 0;
        let currentStreak = 0;
        const records = save.records || [];
        
        // 只统计卖出记录（买入记录的pnl为0，不影响连续盈利计算）
        const sellRecords = records.filter(record => record.type === 'sell');

        // Bug fix: records used to be stamped with "real calendar date + game clock", so
        // several game days shared one real date and every day-based achievement was
        // distorted ("same-day" trades, 30-day holds, weekend trades). Records now carry
        // the game day (dayIndex) and game-clock minutes; these helpers keep legacy
        // records working.
        const recDay = (r) => Number.isFinite(r.dayIndex)
            ? r.dayIndex
            : Math.floor((Number(r.time) || 0) / 86400000);
        const recMinutes = (r) => {
            if (Number.isFinite(r.gameMinutes)) return r.gameMinutes;
            const d = new Date(Number(r.time) || 0);
            return d.getHours() * 60 + d.getMinutes();
        };
        // Game calendar: game day 0 is the save's creation weekday, so the weekday-based
        // weekend achievement is deterministic and actually reachable.
        const saveBaseDay = (() => {
            const d = new Date(Number(save.createdAt) || Date.now());
            d.setHours(0, 0, 0, 0);
            return d.getTime();
        })();
        const recWeekday = (r) => new Date(saveBaseDay + recDay(r) * 86400000).getDay();

        // P2-4 Fix: perfect_game and bagholder (longHolds) were declared in the stats
        // object but never computed, so those two achievements could never unlock.
        // Bug fix: "perfect_game" unlocked on the very first profitable sell because it
        // only inspected the (100-entry, newest-first) record list. Require a meaningful
        // sample and zero realised losses across the whole save.
        const perfectGame = tradeCount >= 10 && totalProfit > 0 && totalLoss === 0
            && sellRecords.some(r => r.pnl > 0);
        let computedLongHolds = 0;
        {
            const firstBuyDay = new Map();
            [...records].sort((a, b) => recDay(a) - recDay(b)).forEach(r => {
                if (r.type === 'buy' && !firstBuyDay.has(r.code)) {
                    firstBuyDay.set(r.code, recDay(r));
                } else if (r.type === 'sell' && firstBuyDay.has(r.code)) {
                    const days = recDay(r) - firstBuyDay.get(r.code);
                    if (days > computedLongHolds) computedLongHolds = days;
                    firstBuyDay.delete(r.code);
                }
            });
        }
        
        // 按时间顺序遍历（从旧到新）
        for (let i = 0; i < sellRecords.length; i++) {
            const record = sellRecords[i];
            if (record.pnl > 0) {
                currentStreak++;
                profitStreak = Math.max(profitStreak, currentStreak);
            } else if (record.pnl < 0) {
                // 遇到亏损，重置当前连续计数
                currentStreak = 0;
            }
        }

        // 检查是否持有茅台
        const holdMaotai = save.holdings && save.holdings['600519'] !== undefined;

        // 计算已解锁成就数量（用于成就猎人）
        const unlockedAchievements = save.achievements || [];
        const allAchievements = AchievementSystem.achievements;
        // M6 Fix: "成就猎人" must only require achievements that are actually obtainable.
        // The old length-based check counted the 9 coming-soon placeholders (and itself),
        // making it impossible to unlock. Require every obtainable achievement except itself.
        const allAchievementsUnlocked = allAchievements.every(ach =>
            ach.comingSoon || ach.id === 'all_achievements' || unlockedAchievements.includes(ach.id)
        );

        // M6 Fix: prefer the persisted cumulative fee counter. Fees used to be derived from
        // `records`, which is capped at 100 entries, so "纳税大户" was undercounted once the
        // player traded more than 100 times. Math.max keeps old saves working.
        // Bug fix: `save.settings?.buyFee || 0.0003` treated a legitimate 0% fee as
        // "unset" and fell back to the default rate, so a 0-fee save accumulated phantom
        // fees and wrongly unlocked "纳税大户". Only fall back when the value is not a
        // finite number.
        const feeRateOf = (v, fallback) => (typeof v === 'number' && Number.isFinite(v)) ? v : fallback;
        const saveBuyFee = feeRateOf(save.settings && save.settings.buyFee, 0.0003);
        const saveSellFee = feeRateOf(save.settings && save.settings.sellFee, 0.0013);
        let recordsFees = 0;
        records.forEach(record => {
            const amount = record.price * record.quantity;
            const fee = record.type === 'buy' ? amount * saveBuyFee : amount * saveSellFee;
            recordsFees += fee;
        });
        const persistedFees = Number(save.gameStats && save.gameStats.totalFees);
        const totalFees = Number.isFinite(persistedFees) ? Math.max(persistedFees, recordsFees) : recordsFees;

        // 检查是否有翻倍股（单只股票盈利超过100%）
        let doubleBaggers = 0;
        let valueInvestor = false;
        let stockGodTrade = false;
        Object.entries(save.holdings || {}).forEach(([code, holding]) => {
            const data = this.stockData.get(code);
            if (data && holding.avgPrice > 0) {
                const returnRate = (data.price - holding.avgPrice) / holding.avgPrice;
                if (returnRate >= 1.0) doubleBaggers++;
                if (returnRate >= 1.0) valueInvestor = true;
                if (returnRate >= 5.0) stockGodTrade = true;
            }
        });

        // 检查交易记录中的特殊成就
        let largeTrades = 0;
        let fomoTrades = 0;
        let panicSells = 0;
        let luckyTrades = 0;
        let unluckyTrades = 0;
        let weekendTrades = 0;
        let earlyTrades = 0;
        let lateTrades = 0;
        let paperHands = 0;
        let allInTrades = 0;
        let yoYoTrades = 0;
        let palindromeProfit = false;
        let momentumTrades = 0;
        let currentMomentumStreak = 0;
        // 强迫症：按股票代码记录是否存在“整数价买入/卖出”，循环结束后再统计
        // 两者都存在的代码数（描述：同一只股票买、卖价格均为整数）。
        const roundBuyByCode = new Map();
        const roundSellByCode = new Map();
        
        // 计算日内交易统计
        const dayTradeMap = new Map(); // 记录每个游戏日、每只股票的交易次数
        // P2-4 Fix: gameStats.dayTrades was never written anywhere, so day_trader /
        // day_trader_pro were permanently stuck at 0. Derive it from the records.
        // Bug fix: 「日内交易」的描述是“同一天买入并卖出”，必须是同一只股票；
        // 此前只按“天”统计，买 A 卖 B 也算数。现在按 (游戏日, 股票代码) 统计。

        // K 线辅助：把游戏日映射到当日的 K 线。history 每个“交易日”恰好一根 K 线，
        // 最后一根是当日实时 K 线；lastTradingDayIndex 在收盘后、次日首个交易 tick
        // 之前的空档里仍指向上一个交易日（即最后一根 K 线所属日），因此以它为锚点
        // 才能在任意时刻正确换算。
        const lastBarDay = Number.isFinite(this.lastTradingDayIndex) && this.lastTradingDayIndex >= 0
            ? this.lastTradingDayIndex
            : (this.gameTime.dayIndex || 0);
        const dayBar = (code, day) => {
            const sd = this.stockData.get(code);
            if (!sd || !Array.isArray(sd.history) || sd.history.length === 0) return null;
            const offset = lastBarDay - day;
            if (!Number.isFinite(offset) || offset < 0 || offset > sd.history.length - 1) return null;
            const idx = sd.history.length - 1 - offset;
            return { sd, bar: sd.history[idx], idx, isCurrent: offset === 0 };
        };
        // 还原“某个游戏日”的昨收价（该日涨跌停价的基准）。当日以实时 prevClose
        // 为准（与交易校验使用的是同一个值）；历史日取其前一根 K 线的收盘价。
        // 首根 K 线没有前一根，无法还原时返回 null，该记录跳过涨跌停类判定。
        const dayPrevClose = (code, day) => {
            const e = dayBar(code, day);
            if (!e) return null;
            if (e.isCurrent) {
                return Number.isFinite(e.sd.prevClose) && e.sd.prevClose > 0 ? e.sd.prevClose : null;
            }
            if (e.idx <= 0) return null;
            const prev = e.sd.history[e.idx - 1].close;
            return Number.isFinite(prev) && prev > 0 ? prev : null;
        };

        records.forEach((record) => {
            const amount = record.price * record.quantity;
            // Bug fix: 描述是“超过10万”，恰好 100000 不算（此前 >= 会解锁）。
            if (amount > 100000) largeTrades++;
            if (Number.isFinite(record.price) && record.price === Math.floor(record.price)) {
                if (record.type === 'buy') roundBuyByCode.set(record.code, true);
                else roundSellByCode.set(record.code, true);
            }
            
            // 梭哈选手：单笔买入使用「下单前」可用资金的 90% 以上
            // Bug fix: save.fund is the post-trade balance, so a position using only
            // ~47% of the account could satisfy the old check. Use the recorded pre-trade
            // cash so the achievement matches its description.
            if (record.type === 'buy' &&
                Number.isFinite(record.fundBefore) && record.fundBefore > 0 &&
                Math.abs(record.amount) >= record.fundBefore * 0.9) {
                allInTrades++;
            }
            
            // 涨跌停类成就：全部改用“记录发生当日”的昨收价还原当日涨跌停价。
            // Bug fix: 此前一律使用当前时刻的 stockData.prevClose，历史记录的判定
            // 全部失真；幸运星/倒霉蛋更是拿玩家自己之后成交的另一条记录来冒充
            // “股价涨停/跌停”，与描述完全不符。
            const recPrevClose = dayPrevClose(record.code, recDay(record));
            if (recPrevClose) {
                // FOMO患者：在涨停价买入（按当日涨跌停价）
                if (record.type === 'buy' && this.limitManager.isLimitUp(record.price, recPrevClose)) {
                    fomoTrades++;
                }

                // 恐慌抛售：在跌停价卖出（按当日涨跌停价）
                if (record.type === 'sell' && this.limitManager.isLimitDown(record.price, recPrevClose)) {
                    panicSells++;
                }

                // 趋势追逐者：连续追涨3只涨停股（按当日涨跌停价）
                if (record.type === 'buy' && this.limitManager.isLimitUp(record.price, recPrevClose)) {
                    currentMomentumStreak++;
                    if (currentMomentumStreak >= 3) {
                        momentumTrades++;
                    }
                } else {
                    currentMomentumStreak = 0;
                }
            }

            // 幸运星/倒霉蛋：买入后股价（当日 K 线最高/最低价）真的触及当日
            // 涨停/跌停价，而不是依赖玩家自己后续的成交记录。
            if (record.type === 'buy') {
                const e = dayBar(record.code, recDay(record));
                if (e && recPrevClose) {
                    const limitUpPrice = this.limitManager.calculateLimitUpPrice(recPrevClose);
                    const limitDownPrice = this.limitManager.calculateLimitDownPrice(recPrevClose);
                    if (Number.isFinite(e.bar.high) && e.bar.high >= limitUpPrice - 1e-9) {
                        luckyTrades++;
                    }
                    if (Number.isFinite(e.bar.low) && e.bar.low <= limitDownPrice + 1e-9) {
                        unluckyTrades++;
                    }
                }
            }
            
            // 周末战士：周五买入、周一卖出（按游戏日历判定）
            // Bug fix: the old check used the real-calendar weekday of a timestamp that
            // mixed the real date with the game clock, and required the real date to
            // advance by ~3 days, so it was effectively impossible.
            if (record.type === 'buy' && recWeekday(record) === 5) {
                const buyDay = recDay(record);
                const hasMondaySell = records.some(r =>
                    r.type === 'sell' &&
                    r.code === record.code &&
                    recWeekday(r) === 1 &&
                    recDay(r) - buyDay === 3
                );
                if (hasMondaySell) weekendTrades++;
            }

            // 早起的鸟儿：开盘后 5 分钟内完成交易（9:30-9:35）
            // Bug fix: the Chinese description said "开盘前5分钟" while the check (and the
            // English text) is "within 5 min of open"; the description is now corrected to
            // match the logic instead of the other way around.
            const totalMinutes = recMinutes(record);
            if (totalMinutes >= 570 && totalMinutes <= 575) { // 9:30-9:35
                earlyTrades++;
            }

            // 夜猫子：在收盘前5分钟完成交易
            // Design note (round 3): the inclusive upper bound (15:00 exactly) is
            // unreachable now that trading sessions are left-closed/right-open, so it
            // is dead code for new records. It is intentionally kept so legacy saves
            // that legitimately traded at 15:00 (before the boundary fix) still count.
            // P2-4 Fix: the old window (11:35-11:40) is outside every trading session
            // (the morning close is 11:30), so executeTrade() always rejected it and the
            // achievement was mathematically unreachable. Use the real close window.
            if (totalMinutes >= 895 && totalMinutes <= 900) { // 14:55-15:00
                lateTrades++;
            }

            // 摇摆不定：同一游戏日内对同一只股票买卖3次以上
            // Bug fix: day grouping now uses the game day instead of the real date.
            const dateKey = recDay(record);
            if (!dayTradeMap.has(dateKey)) {
                dayTradeMap.set(dateKey, new Map());
            }
            const stockMap = dayTradeMap.get(dateKey);
            if (!stockMap.has(record.code)) {
                stockMap.set(record.code, { buy: 0, sell: 0 });
            }
            const stockTrades = stockMap.get(record.code);
            if (record.type === 'buy') stockTrades.buy++;
            else stockTrades.sell++;

            // 摇摆不定：描述是“买卖3次以上”，只买不卖（或只卖不买）不算。
            // Bug fix: 此前纯买入 3 次也会解锁。
            if (stockTrades.buy >= 1 && stockTrades.sell >= 1 && stockTrades.buy + stockTrades.sell >= 3) {
                yoYoTrades++;
            }
            
            // 对称美学：盈利金额是回文数
            if (record.pnl > 0) {
                const profitStr = Math.floor(record.pnl).toString();
                if (profitStr === profitStr.split('').reverse().join('')) {
                    palindromeProfit = true;
                }
            }
        });
        
        // P2-4 Fix: fold the computed day-trade count into the stat (fall back to the
        // persisted value for older saves that stored it directly).
        // Bug fix: 「日内交易」= 同一游戏日内对同一只股票既有买入又有卖出。
        const computedDayTrades = Array.from(dayTradeMap.values())
            .filter(stockMap => Array.from(stockMap.values()).some(t => t.buy > 0 && t.sell > 0))
            .length;
        dayTrades = Math.max(dayTrades, computedDayTrades);

        // 纸手：卖出后股价立即上涨20%
        // Bug fix: 旧逻辑拿“当前价”对比卖出价，还要求紧邻的下一条成交记录是同一
        // 只股票——判定的既不是“立即”，也不是真实行情。现在用 K 线还原：卖出当日
        // 与其后两个交易日内，最高价只要有一次超过卖出价 20% 即算（±10% 涨跌停
        // 下，卖出后连续两个涨停日即可达成 +21%）。
        records.forEach(record => {
            if (record.type !== 'sell') return;
            const sellDay = recDay(record);
            for (let d = 0; d <= 2; d++) {
                const e = dayBar(record.code, sellDay + d);
                if (e && Number.isFinite(e.bar.high) && e.bar.high >= record.price * 1.2 - 1e-9) {
                    paperHands++;
                    break;
                }
            }
        });

        // 强迫症：统计“买入与卖出都出现过整数价”的股票数量
        let roundNumberTrades = 0;
        roundBuyByCode.forEach((_, code) => {
            if (roundSellByCode.has(code)) roundNumberTrades++;
        });

        const stats = {
            tradeCount,
            totalProfit,
            totalLoss,
            // 累计净盈利 = 累计盈利 - 累计亏损。千元户/万元户等“累计盈利”类成就
            // 统一改用净额口径，与「单局收益率」一致（此前盈亏相抵净 0 也能解锁）。
            netProfit: round2(totalProfit - totalLoss),
            maxHoldings,
            sectorsTraded: Array.from(sectorsTraded).length,
            dayTrades,
            maxReturn,
            watchlistCount,
            profitStreak,
            holdMaotai,
            allAchievements: allAchievementsUnlocked,
            totalFees,
            doubleBaggers,
            valueInvestor,
            stockGodTrade,
            largeTrades,
            fomoTrades,
            panicSells,
            luckyTrades,
            unluckyTrades,
            roundNumberTrades,
            momentumTrades,
            // 以下成就需要更复杂的追踪，暂时使用默认值
            standingGuard: save.gameStats?.standingGuard || false,
            buyHighSellLow: save.gameStats?.buyHighSellLow || false,
            longHolds: computedLongHolds >= 30 ? 1 : (save.gameStats?.longHolds || 0),
            yoYoTrades: yoYoTrades > 0,
            allInTrades: allInTrades > 0,
            comeback: save.gameStats?.comeback || false,
            diamondHands: save.gameStats?.diamondHands || false,
            paperHands: paperHands > 0,
            weekendTrades: weekendTrades > 0,
            palindromeProfit: palindromeProfit,
            crashSurvivor: save.gameStats?.crashSurvivor || false,
            contrarianTrades: save.gameStats?.contrarianTrades || 0,
            // P2-4 Fix: keep the momentumTrades value computed above. The duplicate key
            // that used to sit here (reading the never-written gameStats field) won and
            // silently discarded the real calculation.
            momentumTrades,
            technicalWins: save.gameStats?.technicalWins || 0,
            newsTrades: save.gameStats?.newsTrades || 0,
            earlyTrades: earlyTrades > 0,
            lateTrades: lateTrades > 0,
            beatMarket: save.gameStats?.beatMarket || false,
            perfectGame: perfectGame || (save.gameStats?.perfectGame || false)
        };

        // 添加日志记录
        debugLog('成就统计数据:', stats);

        return stats;
    }

    // 计算所有存档的统计数据（用于用户级统计）
    calculateStats() {
        // P1-1 Fix: this function is called even when there's no active save; guard against undefined inputs
        if (!this.currentUser) {
            return { tradeCount: 0, totalProfit: 0, totalLoss: 0, maxHoldings: 0, sectorsTraded: 0, dayTrades: 0, currentGameTrades: 0, maxReturn: 0 };
        }
        const saves = this.currentUser.saves || [];
        // P1-1 Fix: previous code referenced a bare `currentSave` identifier (uncaught ReferenceError).
        // Use `this.currentSave` so it resolves to the active save (or null/undefined when none is loaded).
        const currentSave = this.currentSave;

        let totalProfit = 0;
        let totalLoss = 0;
        let tradeCount = 0;
        let maxHoldings = 0;
        const sectorsTraded = new Set();
        let dayTrades = 0;

        saves.forEach(save => {
            tradeCount += save.gameStats?.tradeCount || 0;
            maxHoldings = Math.max(maxHoldings, save.gameStats?.maxHoldings || 0);
            dayTrades += save.gameStats?.dayTrades || 0;

            (save.gameStats?.sectorsTraded || []).forEach(s => sectorsTraded.add(s));

            // 计算盈亏
            const pnl = (save.fund + this.calculateStockValue(save)) - save.initialFund;
            if (pnl > 0) totalProfit += pnl;
            else totalLoss += Math.abs(pnl);
        });

        // P1-1 Fix: when no save is active, return zeros for the per-save fields instead of throwing
        const currentGameTrades = currentSave ? (currentSave.gameStats?.tradeCount || 0) : 0;
        const maxReturn = currentSave && currentSave.initialFund > 0
            ? ((currentSave.fund + this.calculateStockValue(currentSave)) - currentSave.initialFund) / currentSave.initialFund
            : 0;

        return {
            tradeCount,
            totalProfit,
            totalLoss,
            maxHoldings,
            sectorsTraded: sectorsTraded.size,
            dayTrades,
            currentGameTrades,
            maxReturn
        };
    }

    // 计算持仓市值
    calculateStockValue(save) {
        if (!save || !this.stockData) return 0;
        let value = 0;
        Object.entries(save.holdings || {}).forEach(([code, holding]) => {
            const data = this.stockData.get(code);
            if (data) value += data.price * holding.quantity;
        });
        return value;
    }

    // 显示成就弹窗
    showAchievementPopup(achievement) {
        const popup = document.getElementById('achievement-popup');
        // 记录当前展示的成就：切换语言时据此刷新弹窗里的成就名称（见 onLanguageChanged）
        this._popupAchievement = achievement;
        document.getElementById('achievement-name').textContent = AchievementSystem.getName(achievement);
        popup.classList.add('show');
        
        // 绑定查看按钮事件
        const viewBtn = document.getElementById('view-achievement-btn');
        viewBtn.onclick = () => {
            popup.classList.remove('show');
            this.switchTab('profile');
        };

        // Wire the advertised poster feature: generate a shareable PNG and download it.
        const posterBtn = document.getElementById('poster-achievement-btn');
        if (posterBtn) {
            posterBtn.onclick = () => {
                try {
                    const dataUrl = AchievementSystem.generatePoster(
                        achievement,
                        this.currentUser ? this.currentUser.username : ''
                    );
                    const link = document.createElement('a');
                    link.href = dataUrl;
                    link.download = `achievement_${achievement.id}_${Date.now()}.png`;
                    link.click();
                    popup.classList.remove('show');
                } catch (e) {
                    console.error('生成成就海报失败:', e);
                    this.showNotification(I18n.t('achievement.posterFailed'), 'error');
                }
            };
        }
        
        // 3秒后自动隐藏
        setTimeout(() => {
            popup.classList.remove('show');
        }, 3000);
    }

    // 新手教程
    startTutorial() {
        // 确保在主界面才显示教程
        if (!document.getElementById('main-screen').classList.contains('active')) {
            return;
        }
        
        this.tutorialSteps = [
            { text: I18n.t('tutorial.step1'), element: null, tab: null },
            { text: I18n.t('tutorial.step2'), element: '.market-sidebar', tab: 'market' },
            { text: I18n.t('tutorial.step3'), element: '.detail-quote', tab: 'market' },
            { text: I18n.t('tutorial.step4'), element: '.main-nav', tab: null },
            { text: I18n.t('tutorial.step5'), element: '.trade-form', tab: 'trade' },
            // #20 Fix: '.position-list' does not exist anywhere in the DOM, so the
            // highlight box was 0x0. Point at the real holdings table instead.
            { text: I18n.t('tutorial.step6'), element: '.portfolio-holdings', tab: 'position' },
            { text: I18n.t('tutorial.step7'), element: '.profile-header', tab: 'profile' },
            { text: I18n.t('tutorial.step8'), element: null, tab: 'profile' },
            { text: I18n.t('tutorial.step9'), element: null, tab: null }
        ];
        this.tutorialStep = 0;
        this.showTutorialStep();
    }

    showTutorialStep() {
        if (!this.tutorialSteps || this.tutorialStep >= this.tutorialSteps.length) {
            this.endTutorial();
            return;
        }

        const step = this.tutorialSteps[this.tutorialStep];
        
        // 自动切换到对应标签页
        if (step.tab) {
            this.switchTab(step.tab);
        }
        
        // 延迟显示步骤，确保页面已渲染
        setTimeout(() => this.renderTutorialStep(step), 100);
    }

    renderTutorialStep(step) {
        const overlay = document.getElementById('tutorial-overlay');
        const highlight = document.querySelector('.tutorial-highlight');
        const tooltip = document.querySelector('.tutorial-tooltip');
        const arrow = document.querySelector('.tutorial-arrow');

        if (!overlay || !highlight || !tooltip) {
            console.error('Tutorial elements not found');
            return;
        }

        document.getElementById('tutorial-text').textContent = step.text;
        // #20 Fix: the last step must read "完成"/"Finish", not "下一步"/"Next".
        const tutorialNextBtn = document.getElementById('next-tutorial');
        if (tutorialNextBtn) {
            const isLastStep = this.tutorialStep === this.tutorialSteps.length - 1;
            tutorialNextBtn.textContent = I18n.t(isLastStep ? 'tutorial.finish' : 'tutorial.next');
        }
        const stepNumEl = document.getElementById('tutorial-step-num');
        const stepTotalEl = document.getElementById('tutorial-step-total');
        if (stepNumEl) {
            stepNumEl.textContent = this.tutorialStep + 1;
        }
        if (stepTotalEl) {
            stepTotalEl.textContent = this.tutorialSteps.length;
        }
        overlay.classList.add('active');

        // 重置tooltip样式
        tooltip.style.transform = '';

        if (step.element) {
            const el = document.querySelector(step.element);
            if (el && el.offsetParent !== null) {
                const rect = el.getBoundingClientRect();
                highlight.style.left = rect.left - 5 + 'px';
                highlight.style.top = rect.top - 5 + 'px';
                highlight.style.width = rect.width + 10 + 'px';
                highlight.style.height = rect.height + 10 + 'px';
                highlight.style.display = 'block';

                // Bug fix (#20): measure the real tooltip. The hardcoded 150px height was
                // too small for step 5, so the "clamped" position still ran past the
                // bottom of the viewport.
                const padding = 20;
                const tooltipWidth = Math.min(tooltip.offsetWidth || 320, Math.max(200, window.innerWidth - padding * 2));
                const tooltipHeight = Math.min(tooltip.offsetHeight || 150, Math.max(150, window.innerHeight - padding * 2));
                
                // 尝试在元素下方显示
                let tooltipTop = rect.bottom + padding;
                let tooltipLeft = rect.left + (rect.width - tooltipWidth) / 2;
                
                // 如果下方空间不足，尝试在上方显示
                if (tooltipTop + tooltipHeight > window.innerHeight - padding) {
                    tooltipTop = rect.top - tooltipHeight - padding;
                }
                
                // 如果上方也不足，尝试在右侧显示
                if (tooltipTop < padding) {
                    tooltipTop = rect.top;
                    tooltipLeft = rect.right + padding;
                    
                    // 如果右侧空间不足，尝试在左侧显示
                    if (tooltipLeft + tooltipWidth > window.innerWidth - padding) {
                        tooltipLeft = rect.left - tooltipWidth - padding;
                    }
                }
                
                // 确保不超出视口边界
                tooltipLeft = Math.max(padding, Math.min(tooltipLeft, window.innerWidth - tooltipWidth - padding));
                tooltipTop = Math.max(padding, Math.min(tooltipTop, window.innerHeight - tooltipHeight - padding));
                
                tooltip.style.left = tooltipLeft + 'px';
                tooltip.style.top = tooltipTop + 'px';
                
                // 定位箭头
                if (arrow) {
                    arrow.style.display = 'block';
                    const arrowOffset = 15;
                    
                    if (tooltipTop > rect.bottom) {
                        // 提示框在元素下方，箭头指向上方
                        arrow.style.left = (rect.left + rect.width / 2 - 10) + 'px';
                        arrow.style.top = (tooltipTop - arrowOffset) + 'px';
                        arrow.style.transform = 'rotate(0deg)';
                    } else if (tooltipTop + tooltipHeight < rect.top) {
                        // 提示框在元素上方，箭头指向下方
                        arrow.style.left = (rect.left + rect.width / 2 - 10) + 'px';
                        arrow.style.top = (tooltipTop + tooltipHeight) + 'px';
                        arrow.style.transform = 'rotate(180deg)';
                    } else if (tooltipLeft > rect.right) {
                        // 提示框在元素右侧，箭头指向左方
                        arrow.style.left = (tooltipLeft - arrowOffset) + 'px';
                        arrow.style.top = (rect.top + rect.height / 2 - 10) + 'px';
                        arrow.style.transform = 'rotate(-90deg)';
                    } else {
                        // 提示框在元素左侧，箭头指向右方
                        arrow.style.left = (tooltipLeft + tooltipWidth) + 'px';
                        arrow.style.top = (rect.top + rect.height / 2 - 10) + 'px';
                        arrow.style.transform = 'rotate(90deg)';
                    }
                }
            } else {
                // 元素未找到，居中显示
                highlight.style.display = 'none';
                if (arrow) arrow.style.display = 'none';
                tooltip.style.left = '50%';
                tooltip.style.top = '50%';
                tooltip.style.transform = 'translate(-50%, -50%)';
            }
        } else {
            highlight.style.display = 'none';
            if (arrow) arrow.style.display = 'none';
            tooltip.style.left = '50%';
            tooltip.style.top = '50%';
            tooltip.style.transform = 'translate(-50%, -50%)';
        }
    }

    nextTutorial() {
        this.tutorialStep++;
        this.showTutorialStep();
    }

    endTutorial() {
        const overlay = document.getElementById('tutorial-overlay');
        if (overlay) {
            overlay.classList.remove('active');
        }
        // #20 Fix: steps 7/8 switch to "我的"; finishing used to leave the player there.
        // Return to the market page (only while a live session is on the main screen).
        const mainScreen = document.getElementById('main-screen');
        if (this.currentUser && this.currentSave && mainScreen && mainScreen.classList.contains('active')) {
            this.switchTab('market');
        }
        const tutorialNextBtn = document.getElementById('next-tutorial');
        if (tutorialNextBtn) tutorialNextBtn.textContent = I18n.t('tutorial.next');
        if (this.currentUser) {
            this.currentUser.tutorialCompleted = true;
            // 同步到 users 对象
            if (this.currentUser.username && this.users[this.currentUser.username]) {
                this.users[this.currentUser.username].tutorialCompleted = true;
            }
            this.saveUsers();
        }
    }

    // 主题切换
    setTheme(theme) {
        document.body.className = theme === 'light' ? 'light-theme' : theme === 'festival' ? 'festival-theme' : '';
        document.getElementById('theme-toggle').textContent = theme === 'light' ? '☀️' : theme === 'festival' ? '🎉' : '🌙';
        if (this.currentUser) {
            this.currentUser.theme = theme;
            // 同步到 users 对象
            if (this.currentUser.username && this.users[this.currentUser.username]) {
                this.users[this.currentUser.username].theme = theme;
            }
            this.saveUsers();
        }
    }

    toggleTheme() {
        const current = document.body.className;
        const themes = ['', 'light-theme', 'festival-theme'];
        const currentIndex = themes.indexOf(current);
        const nextTheme = themes[(currentIndex + 1) % themes.length];
        this.setTheme(nextTheme === '' ? 'dark' : nextTheme === 'light-theme' ? 'light' : 'festival');
    }

    // 调试面板
    showDebugPanel() {
        const modal = document.getElementById('debug-modal');
        const select = document.getElementById('debug-achievement');
        
        // P0-1 Fix: escape achievement id and name in option value/text
        select.innerHTML = AchievementSystem.achievements.map(ach =>
            `<option value="${escapeHtml(ach.id)}">${escapeHtml(AchievementSystem.getName(ach))} (${escapeHtml(AchievementSystem.getLevelName(ach.level))})</option>`
        ).join('');
        
        // 更新当前时间显示
        this.updateDebugTimeDisplay();
        
        modal.classList.add('active');
    }
    
    // 更新调试面板中的时间显示
    updateDebugTimeDisplay() {
        const timeEl = document.getElementById('debug-current-time');
        const statusEl = document.getElementById('debug-time-status');
        
        if (timeEl && statusEl) {
            const hour = this.gameTime.hour.toString().padStart(2, '0');
            const minute = this.gameTime.minute.toString().padStart(2, '0');
            timeEl.textContent = `${hour}:${minute}`;

            const totalMinutes = this.gameTime.hour * 60 + this.gameTime.minute;
            if (totalMinutes >= 570 && totalMinutes <= 575) {
                statusEl.textContent = I18n.t('marketStatus.earlyBird');
                statusEl.style.color = '#2980b9';
            } else if (totalMinutes >= 895 && totalMinutes <= 900) {
                statusEl.textContent = I18n.t('marketStatus.nightOwl');
                statusEl.style.color = '#9b59b6';
            } else if (totalMinutes >= 780 && totalMinutes <= 785) {
                statusEl.textContent = I18n.t('marketStatus.afternoonOpen');
                statusEl.style.color = '#f39c12';
            } else if (!this.isTradingTime()) {
                statusEl.textContent = I18n.t('marketStatus.notTrading');
                statusEl.style.color = '#e74c3c';
            } else {
                statusEl.textContent = I18n.t('marketStatus.normal');
                statusEl.style.color = '#27ae60';
            }
        }
        
        // 更新输入框
        const hourInput = document.getElementById('debug-hour');
        const minuteInput = document.getElementById('debug-minute');
        if (hourInput && minuteInput) {
            hourInput.value = this.gameTime.hour;
            minuteInput.value = this.gameTime.minute;
        }
    }
    
    // 设置时间
    debugSetTime() {
        const hourInput = document.getElementById('debug-hour');
        const minuteInput = document.getElementById('debug-minute');
        
        if (!hourInput || !minuteInput) {
            console.error('找不到时间输入框元素');
            return;
        }
        
        // Round-3 fix: parseInt() silently truncated decimals, so typing "9.5" and
        // "30.7" was accepted as 09:30 with no warning. Parse with Number() and
        // require true integers (and non-empty fields) so fractional input is
        // rejected with the invalid-time message instead of being quietly floored.
        // Note Number('') === 0, so empty fields must be rejected explicitly.
        const hourRaw = hourInput.value;
        const minuteRaw = minuteInput.value;
        const hour = Number(hourRaw);
        const minute = Number(minuteRaw);

        if (typeof hourRaw !== 'string' || hourRaw.trim() === '' ||
            typeof minuteRaw !== 'string' || minuteRaw.trim() === '' ||
            !Number.isInteger(hour) || !Number.isInteger(minute) ||
            hour < 0 || hour > 23 || minute < 0 || minute > 59) {
            alert(I18n.t('debug.invalidTime'));
            return;
        }

        // 设置时间并标记为手动设置
        this.gameTime.hour = hour;
        this.gameTime.minute = minute;
        this.gameTime.manualSet = true;

        this.updateTimeDisplay();
        this.updateDebugTimeDisplay();

        alert(I18n.t('debug.timeSet', { time: `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}` }));
    }
    
    // 设置预设时间
    debugSetTimePreset(preset) {
        switch (preset) {
            case 'morning-open':
                this.gameTime.hour = 9;
                this.gameTime.minute = 30;
                break;
            case 'early':
                this.gameTime.hour = 9;
                this.gameTime.minute = 35;
                break;
            case 'morning-close':
                this.gameTime.hour = 11;
                this.gameTime.minute = 25;
                break;
            case 'late':
                this.gameTime.hour = 11;
                this.gameTime.minute = 35;
                break;
            case 'afternoon':
                this.gameTime.hour = 13;
                this.gameTime.minute = 0;
                break;
            case 'close':
                this.gameTime.hour = 14;
                this.gameTime.minute = 55;
                break;
            case 'random':
                // 随机生成0-23小时的任意时间
                this.gameTime.hour = Math.floor(Math.random() * 24);
                this.gameTime.minute = Math.floor(Math.random() * 60);
                break;
        }
        
        // 标记为手动设置
        this.gameTime.manualSet = true;
        
        this.updateTimeDisplay();
        this.updateDebugTimeDisplay();
        
        // 同步更新输入框的值
        const hourInput = document.getElementById('debug-hour');
        const minuteInput = document.getElementById('debug-minute');
        if (hourInput) hourInput.value = this.gameTime.hour;
        if (minuteInput) minuteInput.value = this.gameTime.minute;
        
        const hour = this.gameTime.hour.toString().padStart(2, '0');
        const minute = this.gameTime.minute.toString().padStart(2, '0');
        alert(I18n.t('debug.timeSet', { time: `${hour}:${minute}` }));
    }

    debugSetFund() {
        // L11 Fix: reject blank / non-finite / absurd values (0.001, 1e308). Previously
        // any truthy positive number was accepted, including values that break pricing.
        const raw = document.getElementById('debug-fund').value;
        const parsed = Number(raw);
        if (!this.currentSave || typeof raw !== 'string' || raw.trim() === '' ||
            !Number.isFinite(parsed) || parsed < 1 || parsed > MAX_SAVE_FUND) {
            alert(I18n.t('debug.fundInvalid', { max: MAX_SAVE_FUND }));
            return;
        }
        this.currentSave.fund = round2(parsed);
        this.saveUsers();
        this.updateTradeAvailable();
        this.updatePortfolio();
        alert(I18n.t('debug.fundModified'));
    }

    debugUnlockAchievement() {
        const id = document.getElementById('debug-achievement').value;
        if (!this.currentSave.achievements.includes(id)) {
            this.currentSave.achievements.push(id);
            // 同步到 users 对象，确保数据一致性
            if (this.currentUser.username && this.users[this.currentUser.username]) {
                this.users[this.currentUser.username].saves[this.currentSaveIndex] = this.currentSave;
            }
            this.saveUsers();
            const ach = AchievementSystem.achievements.find(a => a.id === id);
            this.showAchievementPopup(ach);
            // 实时更新成就墙
            this.updateProfile();
        }
    }

    debugUnlockAllAchievements() {
        // 获取所有成就
        const allAchievements = AchievementSystem.achievements;
        const currentAchievements = this.currentSave.achievements || [];

        // 筛选出未解锁的成就
        // Bug fix: never bulk-unlock the "coming soon" placeholders. The README documents
        // them as intentionally unobtainable, and unlocking them made "成就猎人" a lie.
        const lockedAchievements = allAchievements.filter(ach =>
            !ach.comingSoon && !currentAchievements.includes(ach.id));

        if (lockedAchievements.length === 0) {
            alert(I18n.t('debug.allUnlocked'));
            return;
        }

        // 用户确认
        const listText = lockedAchievements.map(ach => `• ${AchievementSystem.getName(ach)} (${AchievementSystem.getLevelName(ach.level)})`).join('\n');
        const confirmMsg = I18n.t('debug.unlockAllConfirm', { count: lockedAchievements.length, list: listText });

        if (!confirm(confirmMsg)) {
            return;
        }

        // 解锁所有成就
        let unlockedCount = 0;
        const newlyUnlocked = [];

        lockedAchievements.forEach(ach => {
            this.currentSave.achievements.push(ach.id);
            newlyUnlocked.push(ach);
            unlockedCount++;
        });

        // 同步到 users 对象，确保数据一致性
        if (this.currentUser.username && this.users[this.currentUser.username]) {
            this.users[this.currentUser.username].saves[this.currentSaveIndex] = this.currentSave;
        }

        // 保存数据
        this.saveUsers();

        // 显示成功提示
        const listPreview = newlyUnlocked.slice(0, 5).map(ach => `🏆 ${AchievementSystem.getName(ach)}`).join('\n') +
            (newlyUnlocked.length > 5 ? '\n' + I18n.t('debug.andMore', { count: newlyUnlocked.length - 5 }) : '');
        const successMsg = I18n.t('debug.unlockAllSuccess', { count: unlockedCount, list: listPreview });

        alert(successMsg);
        
        // 显示最后一个成就的弹窗（如果有）
        if (newlyUnlocked.length > 0) {
            const lastAch = newlyUnlocked[newlyUnlocked.length - 1];
            setTimeout(() => {
                this.showAchievementPopup(lastAch);
            }, 300);
        }
        
        // 实时更新成就墙
        this.updateProfile();
    }

    // 取消解锁全部成就
    debugClearAllAchievements() {
        const currentAchievements = this.currentSave.achievements || [];

        if (currentAchievements.length === 0) {
            alert(I18n.t('debug.noUnlocked'));
            return;
        }

        // 用户确认
        const confirmMsg = I18n.t('debug.clearAllConfirm', { count: currentAchievements.length });

        if (!confirm(confirmMsg)) {
            return;
        }

        // 清空成就
        this.currentSave.achievements = [];

        // 同步到 users 对象，确保数据一致性
        if (this.currentUser.username && this.users[this.currentUser.username]) {
            this.users[this.currentUser.username].saves[this.currentSaveIndex] = this.currentSave;
        }

        // 保存数据
        this.saveUsers();

        // 显示成功提示
        const successMsg = I18n.t('debug.clearAllSuccess');

        alert(successMsg);

        // 实时更新成就墙
        this.updateProfile();
    }

    // 选择取消解锁成就
    debugClearSelectedAchievements() {
        const currentAchievements = this.currentSave.achievements || [];

        if (currentAchievements.length === 0) {
            alert(I18n.t('debug.noUnlocked'));
            return;
        }
        
        // 生成选择界面
        let selectHtml = '<div style="max-height: 300px; overflow-y: auto; margin-bottom: 15px;">';
        currentAchievements.forEach(achId => {
            const ach = AchievementSystem.achievements.find(a => a.id === achId);
            if (ach) {
                // P0-1 Fix: escape achId in id/value attributes and names in label
                const achIdEsc = escapeHtml(achId);
                const nameEsc = escapeHtml(AchievementSystem.getName(ach));
                const levelEsc = escapeHtml(AchievementSystem.getLevelName(ach.level));
                selectHtml += `
                    <div style="margin-bottom: 8px; display: flex; align-items: center;">
                        <input type="checkbox" id="clear-ach-${achIdEsc}" value="${achIdEsc}" style="margin-right: 10px;">
                        <label for="clear-ach-${achIdEsc}" style="flex: 1;">${nameEsc} (${levelEsc})</label>
                    </div>
                `;
            }
        });
        selectHtml += '</div>';
        
        // 创建临时弹窗
        const modal = document.createElement('div');
        modal.className = 'modal active';
        modal.style.position = 'fixed';
        modal.style.top = '0';
        modal.style.left = '0';
        modal.style.width = '100%';
        modal.style.height = '100%';
        modal.style.background = 'rgba(0, 0, 0, 0.5)';
        modal.style.display = 'flex';
        modal.style.alignItems = 'center';
        modal.style.justifyContent = 'center';
        modal.style.zIndex = '2000';
        
        // P0-1 Fix: escape i18n text rendered as HTML (defense in depth - i18n is static, but hostile translators or a poisoned bundle could inject)
        modal.innerHTML = `
            <div class="modal-content" style="min-width: 300px; max-width: 400px;">
                <h3>${escapeHtml(I18n.t('debug.clearSelectedTitle'))}</h3>
                ${selectHtml}
                <div style="display: flex; gap: 10px;">
                    <button id="confirm-clear-btn" class="btn-primary" style="flex: 1;">${escapeHtml(I18n.t('debug.confirmClear'))}</button>
                    <button id="cancel-clear-btn" class="btn-secondary" style="flex: 1;">${escapeHtml(I18n.t('common.cancel'))}</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // 确认按钮事件
        document.getElementById('confirm-clear-btn').onclick = () => {
            const selectedAchievements = [];
            currentAchievements.forEach(achId => {
                const checkbox = document.getElementById(`clear-ach-${achId}`);
                if (checkbox && checkbox.checked) {
                    selectedAchievements.push(achId);
                }
            });
            
            if (selectedAchievements.length === 0) {
                alert(I18n.t('debug.requireSelect'));
                return;
            }

            // 二次确认
            const confirmMsg = I18n.t('debug.clearSelectedConfirm', { count: selectedAchievements.length });

            if (!confirm(confirmMsg)) {
                return;
            }

            // 取消解锁选中的成就
            this.currentSave.achievements = this.currentSave.achievements.filter(
                achId => !selectedAchievements.includes(achId)
            );

            // 同步到 users 对象，确保数据一致性
            if (this.currentUser.username && this.users[this.currentUser.username]) {
                this.users[this.currentUser.username].saves[this.currentSaveIndex] = this.currentSave;
            }

            // 保存数据
            this.saveUsers();

            // 显示成功提示
            const successMsg = I18n.t('debug.clearSelectedSuccess', { count: selectedAchievements.length });

            alert(successMsg);
            
            // 移除弹窗
            document.body.removeChild(modal);
            
            // 实时更新成就墙
            this.updateProfile();
        };
        
        // 取消按钮事件
        document.getElementById('cancel-clear-btn').onclick = () => {
            document.body.removeChild(modal);
        };
    }

    debugResetMarket() {
        // S2 Fix: resetting the market is an explicit new random market — mint a fresh
        // seed and drop the stored market so it is not restored.
        // K-line reset: also drop every per-stock salt so the new seed re-rolls all stocks.
        this.historySeeds = {};
        if (this.currentSave) {
            this.currentSave.marketSeed = Math.floor(Math.random() * 0x7FFFFFFF);
            this.currentSave.market = null;
            this.initMarketData(this.currentSave.marketSeed);
            this.saveUsers();
        } else {
            this.initMarketData();
        }
        alert(I18n.t('debug.marketReset'));
    }

    // ==================== 重置K线图 ====================
    // 把一次随机游走「锚定」到指定基价：整段重缩放，使最后一根收在 base，再把今日
    // K线压平为平开（涨跌幅 0）。重置路径与 initMarketData 重建路径必须共用它，否则
    // 刷新后重建的K线会和刚重置时看到的不一致。
    applyResetShape(history, base) {
        if (!Array.isArray(history) || !Number.isFinite(base) || base <= 0) return history;

        const last = history[history.length - 1];
        if (last && last.close > 0) {
            const factor = base / last.close;
            history.forEach(c => {
                const open = parseFloat((c.open * factor).toFixed(2));
                const close = parseFloat((c.close * factor).toFixed(2));
                let high = parseFloat((c.high * factor).toFixed(2));
                let low = parseFloat((c.low * factor).toFixed(2));
                high = Math.max(high, open, close);
                low = Math.min(low, open, close);
                c.open = open;
                c.close = close;
                c.high = high;
                c.low = low;
            });
        }

        const today = history[history.length - 1];
        if (today) {
            today.open = base;
            today.close = base;
            today.high = base;
            today.low = base;
            today.volume = 0;
        }
        return history;
    }

    // 单只股票重掷：用新的盐重新派生基础价与K线，并锚定到新基价。
    regenerateStockMarket(code, salt, seed) {
        const data = this.stockData.get(code);
        if (!data) return false;

        const seeded = Number.isFinite(seed);
        const rng = seeded ? makeRng(deriveStockSeed(seed, code, salt)) : Math.random;
        const base = this.generateBasePrice(data, rng);
        if (!Number.isFinite(base) || base <= 0) return false;
        const history = this.generateHistory(base, rng);
        this.applyResetShape(history, base);

        const recentVolumes = history.slice(-5).map(h => h.volume);
        const avgVolume = recentVolumes.length > 0
            ? Math.floor(recentVolumes.reduce((a, b) => a + b, 0) / recentVolumes.length)
            : Math.floor(rng() * 1000000);

        data.history = history;
        data.price = base;
        data.prevClose = base;
        data.open = base;
        data.high = base;
        data.low = base;
        data.volume = 0;
        data.dailyVolume = 0;
        data.prevDailyVolume = avgVolume;
        data.avgVolume = avgVolume;

        this.limitManager.resetCircuitBreaker(code);
        this.generateOrderBook(data);
        return true;
    }

    // 重置若干只股票的K线。codes 为空/省略表示全部。返回 { reset, skipped }。
    // 二次确认由调用方（弹窗）负责，便于直接测试本方法。
    resetKLineCharts(codes) {
        const targets = (Array.isArray(codes) && codes.length) ? codes : Array.from(this.stockData.keys());
        const seed = (this.currentSave && Number.isFinite(this.currentSave.marketSeed))
            ? this.currentSave.marketSeed
            : null;

        const reset = [];
        const skipped = [];
        targets.forEach(code => {
            if (!this.stockData.has(code)) { skipped.push(code); return; }
            const salt = (Math.floor(Math.random() * 0x7FFFFFFF) + 1) >>> 0;
            this.historySeeds[code] = salt;
            if (this.regenerateStockMarket(code, salt, seed)) {
                reset.push(code);
            } else {
                delete this.historySeeds[code];
                skipped.push(code);
            }
        });

        if (!reset.length) return { reset, skipped };

        if (this.currentSave) {
            this.currentSave.market = this.captureMarketState();
            this.saveUsers();
        }

        this.renderStockList(this.stockSearch.keyword);
        if (this.selectedStock) this.updateStockDetail();
        this.updateTradeAvailable();
        if (this.selectedStock && reset.indexOf(this.selectedStock.code) >= 0) this.chartReset();
        this.showNotification(I18n.t('notification.klineReset', { count: reset.length }));
        return { reset, skipped };
    }

    // 只读取当前列表里真正勾选的复选框（以 DOM 为准，过滤后仍可用）
    collectResetKLineSelection() {
        const selected = [];
        StockPool.forEach(stock => {
            const el = document.getElementById('reset-kline-code-' + stock.code);
            if (el && el.checked) selected.push(stock.code);
        });
        return selected;
    }

    // 当前搜索关键字过滤后的股票（列表、全选、范围操作共用同一口径）
    getResetKLineFilteredStocks() {
        const state = this._resetKLineState;
        const keyword = normalizeStockCode((state && state.keyword) || '');
        const keywordLower = keyword.toLowerCase();
        return StockPool.filter(stock => {
            if (!keyword) return true;
            return stock.code.indexOf(keyword) >= 0 || stock.name.toLowerCase().indexOf(keywordLower) >= 0;
        });
    }

    // 同步三处反馈：已选数量、确认按钮文案/禁用态、表头全选复选框状态
    updateResetKLineCount() {
        const state = this._resetKLineState;
        if (!state) return;
        const count = state.selected.size;

        const countEl = document.getElementById('reset-kline-count');
        if (countEl) countEl.textContent = I18n.t('market.resetKlineSelected', { count });

        const btn = document.getElementById('confirm-reset-kline');
        if (btn) {
            btn.textContent = I18n.t('market.resetKlineConfirmBtn', { count });
            btn.disabled = count === 0;
        }

        const master = document.getElementById('reset-kline-select-all');
        if (master) {
            const visibleCodes = this.getResetKLineFilteredStocks().map(s => s.code);
            const selectedCount = visibleCodes.filter(code => state.selected.has(code)).length;
            master.checked = visibleCodes.length > 0 && selectedCount === visibleCodes.length;
            master.indeterminate = selectedCount > 0 && selectedCount < visibleCodes.length;
        }
    }

    // 表头全选复选框：勾选/取消当前过滤结果中的全部股票
    toggleResetKLineSelectAll(checked) {
        const state = this._resetKLineState;
        if (!state) return;
        const codes = this.getResetKLineFilteredStocks().map(s => s.code);
        codes.forEach(code => {
            if (checked) state.selected.add(code);
            else state.selected.delete(code);
        });
        this.renderResetKLineList();
    }

    renderResetKLineList() {
        const state = this._resetKLineState;
        const listEl = document.getElementById('reset-kline-list');
        if (!state || !listEl) return;

        const matches = this.getResetKLineFilteredStocks();

        const rows = [];
        matches.forEach(stock => {
            const data = this.stockData.get(stock.code);
            const price = data ? data.price.toFixed(2) : '--';
            const codeEsc = escapeHtml(stock.code);
            const isSelected = state.selected.has(stock.code);
            // 整行就是 label：点击行内任意位置都能切换勾选
            rows.push('<label class="reset-kline-row' + (isSelected ? ' selected' : '') + '" for="reset-kline-code-' + codeEsc + '">');
            rows.push('<input type="checkbox" class="reset-kline-check" id="reset-kline-code-' + codeEsc + '" value="' + codeEsc + '"' + (isSelected ? ' checked' : '') + '>');
            rows.push('<span class="reset-kline-name">' + escapeHtml(stock.name) + ' <span class="reset-kline-code">' + codeEsc + '</span></span>');
            rows.push('<span class="reset-kline-price">' + escapeHtml(price) + '</span>');
            rows.push('</label>');
        });
        listEl.innerHTML = rows.length
            ? rows.join('')
            : '<div class="reset-kline-empty">' + escapeHtml(I18n.t('market.resetKlineEmpty')) + '</div>';

        listEl.querySelectorAll('.reset-kline-check').forEach(cb => {
            cb.addEventListener('change', () => {
                if (cb.checked) state.selected.add(cb.value);
                else state.selected.delete(cb.value);
                const row = cb.closest('.reset-kline-row');
                if (row) row.classList.toggle('selected', cb.checked);
                this.updateResetKLineCount();
            });
        });
        this.updateResetKLineCount();
    }

    // 快捷范围：current（当前查看的股票）/ watchlist（自选股）/ search（当前搜索结果）
    setResetKLineScope(scope) {
        const state = this._resetKLineState;
        if (!state) return;
        if (scope === 'current') {
            if (!this.selectedStock) { alert(I18n.t('market.resetKlineNoCurrent')); return; }
            state.selected = new Set([this.selectedStock.code]);
        } else if (scope === 'watchlist') {
            const watchlist = (this.currentSave && this.currentSave.watchlist) || [];
            state.selected = new Set(watchlist);
            if (!state.selected.size) alert(I18n.t('market.resetKlineEmpty'));
        } else if (scope === 'search') {
            state.selected = new Set(this.getResetKLineFilteredStocks().map(s => s.code));
            if (!state.selected.size) alert(I18n.t('market.resetKlineEmpty'));
        }
        this.renderResetKLineList();
    }

    closeResetKLineModal() {
        const modal = document.getElementById('reset-kline-modal');
        if (modal) modal.remove();
    }

    confirmResetKLine() {
        const state = this._resetKLineState;
        if (!state) return;
        // 合并当前可见的勾选，使本方法不依赖 change 事件也能正确工作
        this.collectResetKLineSelection().forEach(code => state.selected.add(code));
        const codes = Array.from(state.selected);
        if (!codes.length) { alert(I18n.t('market.resetKlineNoneSelected')); return; }
        if (!confirm(I18n.t('market.resetKlineConfirm', { count: codes.length }))) return;
        const result = this.resetKLineCharts(codes);
        this.closeResetKLineModal();
        return result;
    }

    openResetKLineModal() {
        this.closeResetKLineModal();

        const keyword = (this.stockSearch && this.stockSearch.keyword)
            ? normalizeStockCode(this.stockSearch.keyword)
            : '';
        const state = { selected: new Set(), keyword: keyword };
        this._resetKLineState = state;

        // 预选：有搜索词时预选全部匹配结果，否则预选当前正在查看的股票
        if (keyword) {
            this.getResetKLineFilteredStocks().forEach(stock => state.selected.add(stock.code));
        } else if (this.selectedStock) {
            state.selected.add(this.selectedStock.code);
        }

        const clearTitle = escapeHtml(I18n.t('market.resetKlineClearSearch'));
        const parts = [];
        parts.push('<div class="modal-content reset-kline-content">');
        parts.push('<h3>' + escapeHtml(I18n.t('market.resetKlineTitle')) + '</h3>');
        parts.push('<p class="reset-kline-desc">' + escapeHtml(I18n.t('market.resetKlineDesc')) + '</p>');
        // 搜索框 + 清空按钮
        parts.push('<div class="reset-kline-search-wrap">');
        parts.push('<input type="text" id="reset-kline-search" autocomplete="off" placeholder="' + escapeHtml(I18n.t('market.resetKlineSearchPlaceholder')) + '" value="' + escapeHtml(keyword) + '">');
        parts.push('<button type="button" id="reset-kline-search-clear" class="reset-kline-search-clear' + (keyword ? ' visible' : '') + '" title="' + clearTitle + '" aria-label="' + clearTitle + '">&times;</button>');
        parts.push('</div>');
        // 表头：全选复选框 + 已选数量
        parts.push('<div class="reset-kline-listbar">');
        parts.push('<label class="reset-kline-selectall"><input type="checkbox" id="reset-kline-select-all"><span>' + escapeHtml(I18n.t('market.resetKlineSelectAll')) + '</span></label>');
        parts.push('<span class="reset-kline-count" id="reset-kline-count"></span>');
        parts.push('</div>');
        // 快捷选择范围（胶囊按钮组）
        parts.push('<div class="reset-kline-scopes">');
        parts.push('<button type="button" class="reset-kline-scope-btn" data-scope="current">' + escapeHtml(I18n.t('market.resetKlineScopeCurrent')) + '</button>');
        parts.push('<button type="button" class="reset-kline-scope-btn" data-scope="watchlist">' + escapeHtml(I18n.t('market.resetKlineScopeWatchlist')) + '</button>');
        parts.push('<button type="button" class="reset-kline-scope-btn" data-scope="search">' + escapeHtml(I18n.t('market.resetKlineScopeSearch')) + '</button>');
        parts.push('</div>');
        parts.push('<div class="reset-kline-list" id="reset-kline-list"></div>');
        // 风险提示紧贴操作区
        parts.push('<p class="reset-kline-warning">' + escapeHtml(I18n.t('market.resetKlineWarning')) + '</p>');
        parts.push('<div class="reset-kline-actions">');
        parts.push('<button type="button" id="cancel-reset-kline" class="btn-secondary">' + escapeHtml(I18n.t('common.cancel')) + '</button>');
        parts.push('<button type="button" id="confirm-reset-kline" class="btn-primary"></button>');
        parts.push('</div>');
        parts.push('</div>');

        const modal = document.createElement('div');
        modal.id = 'reset-kline-modal';
        modal.className = 'modal active';
        modal.innerHTML = parts.join('');
        document.body.appendChild(modal);

        // 快捷范围：当前查看 / 自选股 / 搜索结果
        document.querySelectorAll('#reset-kline-modal [data-scope]').forEach(btn => {
            btn.addEventListener('click', () => this.setResetKLineScope(btn.dataset.scope));
        });

        // 搜索：实时过滤 + 清空按钮显隐
        const searchEl = document.getElementById('reset-kline-search');
        const clearEl = document.getElementById('reset-kline-search-clear');
        if (searchEl) {
            searchEl.addEventListener('input', () => {
                state.keyword = searchEl.value;
                if (clearEl) clearEl.classList.toggle('visible', !!searchEl.value);
                this.renderResetKLineList();
            });
        }
        if (clearEl) {
            clearEl.addEventListener('click', () => {
                if (searchEl) {
                    searchEl.value = '';
                    searchEl.focus();
                }
                state.keyword = '';
                clearEl.classList.remove('visible');
                this.renderResetKLineList();
            });
        }

        // 表头全选复选框（支持半选态）
        const masterEl = document.getElementById('reset-kline-select-all');
        if (masterEl) {
            masterEl.addEventListener('click', () => this.toggleResetKLineSelectAll(masterEl.checked));
        }

        document.getElementById('confirm-reset-kline').addEventListener('click', () => this.confirmResetKLine());
        document.getElementById('cancel-reset-kline').addEventListener('click', () => this.closeResetKLineModal());

        this.renderResetKLineList();
    }


    debugClearGame() {
        if (confirm(I18n.t('debug.clearGameConfirm'))) {
            this.currentSave.fund = this.currentSave.initialFund;
            this.currentSave.holdings = {};
            this.currentSave.records = [];
            this.currentSave.dayTrades = {};
            this.currentSave.gameStats = {
                tradeCount: 0,
                profitCount: 0,
                lossCount: 0,
                maxHoldings: 0,
                sectorsTraded: new Set(),
                dayTrades: 0,
                totalFees: 0,
                realizedProfit: 0,
                realizedLoss: 0
            };
            this.saveUsers();
            this.updateTradeAvailable();
            this.updatePortfolio();
            alert(I18n.t('debug.gameCleared'));
        }
    }

    // #23 Fix: a small promise-based input modal. window.prompt() echoed passwords in
    // clear text and could not be styled; this follows the app's existing modal pattern.
    askInputModal(options = {}) {
        return new Promise((resolve) => {
            const modal = document.getElementById('input-prompt-modal');
            if (!modal) { resolve(null); return; }
            const titleEl = document.getElementById('input-prompt-title');
            const msgEl = document.getElementById('input-prompt-message');
            const field = document.getElementById('input-prompt-field');
            const errorEl = document.getElementById('input-prompt-error');
            const confirmBtn = document.getElementById('input-prompt-confirm');
            const cancelBtn = document.getElementById('input-prompt-cancel');

            if (titleEl) titleEl.textContent = options.title || I18n.t('prompt.title');
            if (msgEl) msgEl.textContent = options.message || '';
            field.type = options.password ? 'password' : 'text';
            field.value = options.value || '';
            field.setAttribute('placeholder', options.placeholder || '');
            errorEl.textContent = '';
            errorEl.style.display = 'none';
            modal.classList.add('active');
            setTimeout(() => field.focus(), 50);

            const finish = (value) => {
                modal.classList.remove('active');
                confirmBtn.onclick = null;
                cancelBtn.onclick = null;
                field.onkeydown = null;
                resolve(value);
            };
            confirmBtn.onclick = () => {
                const value = field.value;
                if (options.required && value.trim() === '') {
                    errorEl.textContent = I18n.t('prompt.required');
                    errorEl.style.display = 'block';
                    return;
                }
                finish(value);
            };
            cancelBtn.onclick = () => finish(null);
            field.onkeydown = (e) => {
                if (e.key === 'Enter') { e.preventDefault(); confirmBtn.click(); }
                else if (e.key === 'Escape') { e.preventDefault(); cancelBtn.click(); }
            };
        });
    }

    // 导出/导入存档（入口都在选择存档页）
    exportAllData() {
        // P2-5 Fix: never put the password hash inside a shareable backup file. It is
        // stripped here and a fresh password is set on import.
        const exportUser = Object.assign({}, this.currentUser);
        delete exportUser.passwordHash;
        // #14 Fix: serialize through serializeUsersData() like saveUsers() does. Plain
        // JSON.stringify wrote gameStats.sectorsTraded (a Set) as {}, so sector-based
        // achievement progress was lost from every exported backup.
        const data = Crypto.encrypt(serializeUsersData(exportUser));
        const blob = new Blob([data], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `stock_simulator_backup_${this.currentUser.username}_${Date.now()}.txt`;
        a.click();
        URL.revokeObjectURL(url);
    }

    importSave(mode = 'all') {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.txt';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;

            // P0-1 / P2-4 Fix: cap file size to prevent memory/CPU abuse from maliciously large backups
            if (file.size > 5 * 1024 * 1024) {
                alert(I18n.t('notification.importTooLarge'));
                return;
            }

            const reader = new FileReader();
            // P2-5 Fix: async so the import can await password verification before it is
            // allowed to overwrite or merge into an existing account.
            reader.onload = async (event) => {
                try {
                    const decrypted = Crypto.decrypt(event.target.result);
                    if (typeof decrypted !== 'string') throw new Error('Decryption failed');
                    const rawData = JSON.parse(decrypted);

                    // P0-1 Fix: schema-validate the imported payload to reject malicious/oversized structures
                    const userData = sanitizeUserData(rawData);
                    // P0-1 Fix: also sanitize each save (length-bounded, type-checked)
                    userData.saves = userData.saves.map(s => sanitizeSaveData(s));

                    // 单个存档导入：从文件里挑一个存档加入“当前账号”，不新建/覆盖账号
                    if (mode === 'single') {
                        await this.importSingleSaveFrom(userData);
                        return;
                    }

                    // 导入所有数据：把备份中的全部存档合并进当前登录账号。
                    // 不创建新账号、不覆盖当前账号的密码/偏好、不需要重新登录。
                    // （存档级合并：与当前账号已有存档 id 相同的视为同一份，跳过）
                    await this.importAllDataFrom(userData);
                } catch (err) {
                    // P0-1 Fix: do not leak error details to console for user-controlled input
                    alert(I18n.t('notification.importFailed'));
                }
            };
            reader.readAsText(file);
        };
        input.click();
    }

    // 导出单个存档：与整包导出同一文件格式（无密码的用户数据，只含一个存档）
    exportSingleSave(index) {
        const saves = (this.currentUser && this.currentUser.saves) || [];
        const save = saves[index];
        if (!save) return;
        // P2-5 Fix: 同样不导出密码哈希
        const exportUser = Object.assign({}, this.currentUser, { saves: [save] });
        delete exportUser.passwordHash;
        const data = Crypto.encrypt(serializeUsersData(exportUser));
        const blob = new Blob([data], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        // Report fix #2: use the trimmed/fallback display name so a whitespace-only
        // legacy name cannot produce an all-underscores filename.
        const safeName = String(displaySaveName(save, index)).replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 30);
        a.download = `stock_simulator_save_${this.currentUser.username}_${safeName}_${Date.now()}.txt`;
        a.click();
        URL.revokeObjectURL(url);
    }

    // 单个存档导入：把备份文件中的一个存档追加到当前账号
    async importSingleSaveFrom(userData) {
        if (!this.currentUser) return;
        const fileSaves = (userData && Array.isArray(userData.saves)) ? userData.saves : [];
        if (fileSaves.length === 0) {
            alert(I18n.t('notification.importNoSaves'));
            return;
        }
        const currentSaves = Array.isArray(this.currentUser.saves) ? this.currentUser.saves : (this.currentUser.saves = []);
        if (currentSaves.length >= MAX_SAVES_PER_USER) {
            alert(I18n.t('save.limitReached', { max: MAX_SAVES_PER_USER }));
            return;
        }
        let picked = fileSaves[0];
        if (fileSaves.length > 1) {
            const pickedIndex = await this.pickSaveFromBackup(fileSaves);
            if (pickedIndex === null || pickedIndex === undefined) return;
            picked = fileSaves[pickedIndex];
        }
        const newSave = this.cloneSaveForImport(picked);
        // 总是换一个全新的 id：导入自己导出的存档时 id 必然撞车
        newSave.id = (Crypto && Crypto.uuid) ? Crypto.uuid()
            : (Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
        currentSaves.push(newSave);
        if (!this.saveUsers()) {
            currentSaves.splice(currentSaves.indexOf(newSave), 1);
            alert(I18n.t('save.saveFailedStorage'));
            return;
        }
        this.renderSaveList();
        this.showNotification(I18n.t('notification.importSingleSuccess', { name: displaySaveName(newSave, currentSaves.length - 1) }));
    }
    // 导入所有数据：把备份中的全部存档追加到当前登录账号（不创建新账号、不修改偏好、不重登）
    importAllDataFrom(userData) {
        if (!this.currentUser) return;
        const fileSaves = (userData && Array.isArray(userData.saves)) ? userData.saves : [];
        if (fileSaves.length === 0) {
            alert(I18n.t('notification.importNoSaves'));
            return;
        }
        const currentSaves = Array.isArray(this.currentUser.saves) ? this.currentUser.saves : (this.currentUser.saves = []);
        // 已存在的存档 id 直接跳过，避免把同一份存档导入两遍
        const existingIds = new Set(currentSaves.map(s => s.id));
        const fresh = [];
        for (const s of fileSaves) {
            if (!existingIds.has(s.id)) { existingIds.add(s.id); fresh.push(s); }
        }
        if (fresh.length === 0) {
            alert(I18n.t('notification.importAllNoNew'));
            return;
        }
        const room = MAX_SAVES_PER_USER - currentSaves.length;
        if (room <= 0) {
            alert(I18n.t('save.limitReached', { max: MAX_SAVES_PER_USER }));
            return;
        }
        const toAdd = fresh.slice(0, room);
        const dropped = fresh.length - toAdd.length;
        if (!confirm(I18n.t('notification.importAllConfirm', { count: toAdd.length, username: this.currentUser.username }))) {
            return;
        }
        const added = [];
        for (const src of toAdd) {
            const cloned = this.cloneSaveForImport(src);
            // 保留原 id（与当前账号不冲突），让多标签合并能识别“同一份存档”
            added.push(cloned);
            currentSaves.push(cloned);
        }
        if (!this.saveUsers()) {
            currentSaves.splice(currentSaves.length - added.length, added.length);
            alert(I18n.t('save.saveFailedStorage'));
            return;
        }
        this.renderSaveList();
        let msg = I18n.t('notification.importAllDone', { added: added.length });
        const skipped = fileSaves.length - fresh.length;
        if (skipped > 0) msg += I18n.t('notification.importAllSkippedPart', { skipped });
        if (dropped > 0) msg += I18n.t('notification.importAllDroppedPart', { dropped, max: MAX_SAVES_PER_USER });
        this.showNotification(msg);
    }

    // 深拷贝一个从文件解析出来的存档：gameStats.sectorsTraded 是 Set，JSON 往返会变 {}，
    // 所以优先 structuredClone，降级时手动修复该字段。
    cloneSaveForImport(save) {
        if (typeof structuredClone === 'function') return structuredClone(save);
        const cloned = JSON.parse(JSON.stringify(save));
        if (cloned.gameStats) {
            cloned.gameStats.sectorsTraded = normalizeSectorsTraded(save.gameStats && save.gameStats.sectorsTraded);
        }
        return cloned;
    }

    // 备份里有多个存档时，弹出列表让用户挑一个；resolve 索引或 null（取消）
    pickSaveFromBackup(fileSaves) {
        return new Promise((resolve) => {
            const modal = document.getElementById('import-pick-modal');
            const list = document.getElementById('import-pick-list');
            const cancelBtn = document.getElementById('import-pick-cancel');
            list.innerHTML = '';
            fileSaves.forEach((save, index) => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'import-pick-item';
                const name = escapeHtml(displaySaveName(save, index));
                const dateStr = escapeHtml(new Date(save.createdAt).toLocaleDateString(I18n.getCurrentLanguage()));
                const fundText = escapeHtml(this.formatMoney(save.fund));
                btn.innerHTML = `<strong>${name}</strong><span>${I18n.t('save.info', { fund: fundText, date: dateStr })}</span>`;
                btn.addEventListener('click', () => {
                    this.hideImportPickModal();
                    resolve(index);
                });
                list.appendChild(btn);
            });
            cancelBtn.onclick = () => {
                this.hideImportPickModal();
                resolve(null);
            };
            modal.classList.add('active');
        });
    }

    hideImportPickModal() {
        const modal = document.getElementById('import-pick-modal');
        if (modal) modal.classList.remove('active');
    }
    // 工具函数（支持国际化的金额格式化）
    // 只格式化绝对值，符号交给调用方决定，这样负数可以写成 -¥42.33 而不是 ¥-42.33。
    formatMoneyMagnitude(amount) {
        const value = Number(amount);
        const abs = Math.abs(Number.isFinite(value) ? value : 0);
        // #26 Fix: the unit used to be chosen from the RAW value and the value was only
        // rounded afterwards, so a value on a carry boundary kept the smaller unit once
        // it rounded up: 99999999.99 printed "10000.00万" instead of "1.00亿", 9999.996
        // printed "10000.00" instead of "1.00万", and the English -9999.994 produced a
        // 9999.994 magnitude printed as "-¥10.00K".
        // Pick the largest unit the raw value reaches, round the mantissa to 2 decimals,
        // then promote a unit while the ROUNDED mantissa reaches the next unit. This
        // keeps 9999.00 as "9999.00" (only values that genuinely round up cross over).
        const isEn = window.I18n && I18n.getCurrentLanguage() === 'en-US';
        const tiers = isEn ? [1000, 1000000, 1000000000, 1000000000000]
                           : [10000, 100000000, 1000000000000];
        const suffixes = isEn ? ['K', 'M', 'B', 'T'] : ['万', '亿', '万亿'];
        let index = -1;
        for (let i = 0; i < tiers.length; i++) {
            if (abs >= tiers[i]) index = i;
        }
        for (;;) {
            const divisor = index < 0 ? 1 : tiers[index];
            const text = (abs / divisor).toFixed(2);
            const next = index + 1;
            if (next < tiers.length && Number(text) * divisor >= tiers[next]) {
                index = next;
                continue;
            }
            return text + (index < 0 ? '' : suffixes[index]);
        }
    }

    // 数值只会显示两位小数，所以 |amount| < 0.005 时会被渲染成 0.00；
    // 这种「负零」不应再带上负号。
    isZeroMoneyText(text) {
        return /^0\.00/.test(text);
    }

    // 保留原有语义：返回带符号、不带货币符号的金额文本（如 "-42.33"、"1.20万"）。
    formatMoney(amount) {
        const value = Number(amount);
        const safe = Number.isFinite(value) ? value : 0;
        const magnitude = this.formatMoneyMagnitude(safe);
        if (safe < 0 && !this.isZeroMoneyText(magnitude)) return '-' + magnitude;
        return magnitude;
    }

    // 货币显示：符号放在货币符号之前（-¥42.33 / +¥42.33 / ¥42.33）。
    formatCurrency(amount, showPlus = false) {
        const value = Number(amount);
        const safe = Number.isFinite(value) ? value : 0;
        const magnitude = this.formatMoneyMagnitude(safe);
        if (this.isZeroMoneyText(magnitude)) return '¥' + magnitude;
        const sign = safe < 0 ? '-' : (showPlus ? '+' : '');
        return sign + '¥' + magnitude;
    }

    // 明细表专用：不做 万/亿/万亿（英文 K/M/B/T）缩写，保留完整两位小数。
    // #27 Fix: 持仓明细要把成本价、现价、市值、盈亏放在同一行对比，缩写与不缩写混排
    // 会让同一行出现两种风格（英文模式尤其明显：成交价 ¥12.51 / 市值 ¥1.21K），
    // 因此这一整类明细行统一使用精确金额；金额缩写仍用于汇总卡片等场景。
    formatCurrencyExact(amount, showPlus = false) {
        const value = Number(amount);
        const safe = Number.isFinite(value) ? value : 0;
        const magnitude = Math.abs(safe).toFixed(2);
        if (this.isZeroMoneyText(magnitude)) return '¥' + magnitude;
        const sign = safe < 0 ? '-' : (showPlus ? '+' : '');
        return sign + '¥' + magnitude;
    }

    // 百分比显示：入参已经是百分比数值（3.2 表示 3.20%）。
    // 很小的负数四舍五入后是 0，显示 0.00% 而不是 -0.00%。
    formatPercent(percent, showPlus = false) {
        const value = Number(percent);
        const safe = Number.isFinite(value) ? value : 0;
        let text = safe.toFixed(2);
        if (text === '-0.00') text = '0.00';
        if (showPlus && text !== '0.00' && text.charAt(0) !== '-') text = '+' + text;
        return text + '%';
    }

    showScreen(screenId) {
        debugLog('showScreen被调用:', screenId);
        // 安全检查：如果用户未登录，只允许访问认证相关页面
        const protectedScreens = ['main-screen', 'save-select-screen', 'game-setup-screen'];
        if (protectedScreens.includes(screenId) && !this.currentUser) {
            console.warn('尝试在未登录状态下访问受保护页面:', screenId);
            screenId = 'auth-screen';
        }
        
        debugLog('切换屏幕到:', screenId);
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        const targetScreen = document.getElementById(screenId);
        debugLog('目标屏幕元素:', targetScreen);
        if (targetScreen) {
            targetScreen.classList.add('active');
            debugLog('屏幕切换成功');
        } else {
            console.error('目标屏幕不存在:', screenId);
        }
        
        // 更新浏览器历史记录，防止后退按钮问题
        if (screenId === 'auth-screen') {
            // 在登录页面添加历史记录标记
            history.pushState({ screen: 'auth', loggedOut: true }, '', '#login');
        }
    }

    // 切换主页面标签
    switchTab(tabName) {
        // 将内部名称映射到DOM使用的名称
        const tabMapping = {
            'position': 'portfolio'
        };
        const domTabName = tabMapping[tabName] || tabName;
        
        // 更新导航按钮状态
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.page === domTabName);
        });
        
        // 更新页面内容显示
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        const page = document.getElementById(`${domTabName}-page`);
        if (page) {
            page.classList.add('active');
        }
        
        // 更新当前标签
        this.currentTab = tabName;
        
        // 根据标签更新相应内容
        if (tabName === 'position') {
            this.updatePortfolio();
        } else if (tabName === 'trade') {
            this.updateTradeAvailable();
        } else if (tabName === 'profile') {
            this.updateProfile();
        }
    }

    // 自动交易相关方法
    onAutoTradeCodeInput(code) {
        const stock = StockPool.find(s => s.code === code);
        const nameEl = document.getElementById('auto-name');
        
        if (stock && this.stockData.has(stock.code)) {
            nameEl.textContent = stock.name;
        } else {
            nameEl.textContent = '';
        }
    }

    // 交易方向改变时更新触发条件类型选项
    onAutoTradeDirectionChange(direction) {
        const conditionTypeSelect = document.getElementById('auto-condition-type');
        const profitOption = conditionTypeSelect.querySelector('option[value="profit"]');
        const profitTip = document.getElementById('profit-tip');
        
        if (direction === 'buy') {
            // 买入方向：禁用盈利目标选项
            if (conditionTypeSelect.value === 'profit') {
                // 如果当前选中的是盈利目标，切换到价格阈值
                conditionTypeSelect.value = 'price';
                this.showNotification(I18n.t('auto.profitDisabledTip'), 'warning');
            }
            profitOption.disabled = true;
            profitOption.textContent = I18n.t('auto.profitDisabledOption');

            // 显示提示信息
            // Bug fix: 切换语言时提示节点已存在，旧代码因 "!profitTip" 判断直接
            // 跳过，导致英文界面残留中文提示。已存在时也要刷新其文案。
            if (!profitTip) {
                const tipDiv = document.createElement('div');
                tipDiv.id = 'profit-tip';
                tipDiv.className = 'form-tip';
                tipDiv.textContent = I18n.t('auto.profitTip');
                conditionTypeSelect.parentNode.appendChild(tipDiv);
            } else {
                profitTip.textContent = I18n.t('auto.profitTip');
            }
        } else {
            // 卖出方向：启用盈利目标选项
            profitOption.disabled = false;
            profitOption.textContent = I18n.t('auto.conditionTypeProfit');
            
            // 移除提示信息
            if (profitTip) {
                profitTip.remove();
            }
        }
    }

    setAutoTradeQuantity(ratio) {
        const code = normalizeStockCode(document.getElementById('auto-code').value);
        const direction = document.querySelector('input[name="auto-direction"]:checked').value;
        
        if (!code) return;
        
        const stock = this._stockPoolByCode ? this._stockPoolByCode.get(code) : StockPool.find(s => s.code === code);
        if (!stock) return;
        
        let maxQuantity = 0;
        const tradeUnit = (this.currentSave.settings && this.currentSave.settings.tradeUnit) || 1;
        if (direction === 'buy') {
            const data = this.stockData.get(code);
            if (!data) return;
            const price = data.price;
            // Bug fix: reserve the buy fee so "all in" cannot exceed available cash.
            const feeRate = (this.currentSave.settings && this.currentSave.settings.buyFee) || 0;
            const perShareCost = price * (1 + feeRate);
            maxQuantity = perShareCost > 0
                ? Math.floor(this.currentSave.fund / perShareCost / tradeUnit) * tradeUnit
                : 0;
        } else {
            const holding = this.currentSave.holdings[code];
            maxQuantity = holding ? holding.quantity : 0;
        }
        
        const quantity = Math.floor(maxQuantity * ratio / this.currentSave.settings.tradeUnit) * this.currentSave.settings.tradeUnit;
        document.getElementById('auto-quantity').value = quantity > 0 ? String(quantity) : '';
    }

    // 添加自动交易股票
    addAutoTradeStock() {
        // L9 Fix: accept full-width digits / spaces in the code field.
        const code = normalizeStockCode(document.getElementById('auto-code').value);
        const direction = document.querySelector('input[name="auto-direction"]:checked').value;
        const conditionType = document.getElementById('auto-condition-type').value;
        const conditionOperator = document.getElementById('auto-condition-operator').value;
        const conditionValueRaw = document.getElementById('auto-condition-value').value;
        const quantityRaw = document.getElementById('auto-quantity').value;
        const priceType = document.getElementById('auto-price-type').value;
        const limitPriceRaw = document.getElementById('auto-limit-price').value;
        const stopLossRaw = document.getElementById('auto-stop-loss').value;
        const takeProfitRaw = document.getElementById('auto-take-profit').value;
        const maxAmountRaw = document.getElementById('auto-max-amount').value;
        // Bug fix: parse every numeric field with Number() instead of parseInt/parseFloat.
        // parseInt silently turned "1.9", "1e3" and "1e20" into 1; blank fields became NaN
        // and were stored as 0 through isNaN() checks. All values are validated below.
        const conditionValue = Number(conditionValueRaw);
        const quantity = Number(quantityRaw);
        const limitPrice = Number(limitPriceRaw);
        const stopLoss = Number(stopLossRaw);
        const takeProfit = Number(takeProfitRaw);
        const maxAmount = Number(maxAmountRaw);
        const isBlankInput = (raw) => typeof raw !== 'string' || raw.trim() === '';

        if (!code) {
            alert(I18n.t('auto.requireStockCode'));
            return;
        }

        const stock = StockPool.find(s => s.code === code);
        if (!stock) {
            alert(I18n.t('auto.stockNotExist'));
            return;
        }

        // 检查是否处于编辑模式
        const isEditing = this.autoTrade.editingIndex !== undefined && this.autoTrade.editingIndex !== null;
        const editingIndex = this.autoTrade.editingIndex;

        // 检查是否已存在相同代码和方向的配置（编辑模式下排除当前编辑的配置）
        const existingConfig = this.autoTrade.configs.find((c, idx) =>
            c.code === code && c.direction === direction && (!isEditing || idx !== editingIndex)
        );
        if (existingConfig) {
            alert(I18n.t('auto.duplicateConfig', { direction: I18n.t(direction === 'buy' ? 'auto.directionBuy' : 'auto.directionSell') }));
            return;
        }

        // Bug fix: quantity used to be parseInt'd with only a "> 0" check, so "1.9",
        // "1e3" and "1e20" all silently became 1 with no upper bound. Mirror manual
        // trading: must be a finite positive integer within a sane ceiling.
        if (isBlankInput(quantityRaw) || !Number.isInteger(quantity) || quantity <= 0) {
            alert(I18n.t('auto.invalidQuantity'));
            return;
        }
        if (quantity > 1e9) {
            alert(I18n.t('trade.quantityTooHigh', { max: '1000000000' }));
            return;
        }

        // M4 Fix: enforce the minimum trading unit when the config is created, so the
        // user gets immediate feedback instead of a silent rejection at execution time.
        const autoTradeUnit = (this.currentSave.settings && this.currentSave.settings.tradeUnit) || 1;
        if (quantity % autoTradeUnit !== 0) {
            alert(I18n.t('trade.invalidQuantityUnit', { unit: autoTradeUnit }));
            return;
        }

        // 时间间隔模式不需要条件值
        if (conditionType !== 'time') {
            if (isBlankInput(conditionValueRaw) || !Number.isFinite(conditionValue)) {
                alert(I18n.t('auto.requireConditionValue'));
                return;
            }
            // Bug fix: a negative "profit target" (-500) used to invert the below
            // comparison and fire on the first tick after a buy. The field is a money
            // amount, so it must be positive.
            if (conditionType === 'profit' && conditionValue <= 0) {
                alert(I18n.t('auto.invalidProfitValue'));
                return;
            }
        }

        // 盈利目标模式只支持卖出操作
        if (conditionType === 'profit' && direction !== 'sell') {
            alert(I18n.t('auto.profitOnlyForSell'));
            return;
        }

        if (priceType === 'limit' &&
            (isBlankInput(limitPriceRaw) || !Number.isFinite(limitPrice) || limitPrice <= 0)) {
            alert(I18n.t('auto.requireLimitPrice'));
            return;
        }

        // 风控参数（可选）：留空表示不限制，一旦填写必须是合法数值
        if (!isBlankInput(stopLossRaw) && !Number.isFinite(stopLoss)) {
            alert(I18n.t('auto.invalidStopLoss'));
            return;
        }
        if (!isBlankInput(takeProfitRaw) && (!Number.isFinite(takeProfit) || takeProfit <= 0)) {
            alert(I18n.t('auto.invalidTakeProfit'));
            return;
        }
        if (!isBlankInput(maxAmountRaw) && (!Number.isFinite(maxAmount) || maxAmount <= 0)) {
            alert(I18n.t('auto.invalidMaxAmount'));
            return;
        }

        const config = {
            code,
            name: stock.name,
            direction,
            conditionType,
            conditionOperator,
            conditionValue: conditionType === 'time' ? 0 : conditionValue,
            quantity,
            priceType,
            // L7 Fix: limit prices tick in 0.01
            limitPrice: priceType === 'limit' && Number.isFinite(limitPrice)
                ? this.limitManager.roundToTick(limitPrice)
                : 0,
            stopLoss: isBlankInput(stopLossRaw) ? 0 : stopLoss,
            takeProfit: isBlankInput(takeProfitRaw) ? 0 : takeProfit,
            maxAmount: isBlankInput(maxAmountRaw) ? 0 : maxAmount,
            createdAt: isEditing ? this.autoTrade.configs[editingIndex].createdAt : Date.now()
        };

        if (isEditing) {
            // 更新原有配置
            this.autoTrade.configs[editingIndex] = config;
            this.showNotification(I18n.t('auto.configUpdated'));

            // 清除编辑状态
            this.autoTrade.editingIndex = null;

            // 恢复按钮文本
            const addBtn = document.getElementById('add-auto-stock-btn');
            if (addBtn) {
                addBtn.textContent = I18n.t('auto.addStockBtn');
                addBtn.dataset.editing = 'false';
            }
        } else {
            // 添加新配置
            this.autoTrade.configs.push(config);
            this.showNotification(I18n.t('auto.stockAdded'));
        }
        
        this.renderAutoTradeStockList();
        
        // 保存到存档
        this.saveAutoTradeState();
        
        // 清空表单
        document.getElementById('auto-code').value = '';
        document.getElementById('auto-name').textContent = '';
        document.getElementById('auto-quantity').value = '';
        document.getElementById('auto-condition-value').value = '';
        document.getElementById('auto-limit-price').value = '';
        // 清空风险控制参数
        document.getElementById('auto-stop-loss').value = '';
        document.getElementById('auto-take-profit').value = '';
        document.getElementById('auto-max-amount').value = '';
    }

    // 删除自动交易股票
    removeAutoTradeStock(index) {
        // 如果正在编辑被删除的配置，清除编辑状态
        if (this.autoTrade.editingIndex === index) {
            this.autoTrade.editingIndex = null;
            // 恢复按钮文本
            const addBtn = document.getElementById('add-auto-stock-btn');
            if (addBtn) {
                addBtn.textContent = I18n.t('auto.addStockBtn');
                addBtn.dataset.editing = 'false';
            }
            // 清空表单
            document.getElementById('auto-code').value = '';
            document.getElementById('auto-name').textContent = '';
            document.getElementById('auto-quantity').value = '';
            document.getElementById('auto-condition-value').value = '';
            document.getElementById('auto-limit-price').value = '';
        } else if (this.autoTrade.editingIndex !== null && this.autoTrade.editingIndex > index) {
            // 如果删除的配置在正在编辑的配置之前，调整编辑索引
            this.autoTrade.editingIndex--;
        }

        this.autoTrade.configs.splice(index, 1);
        this.renderAutoTradeStockList();
        this.saveAutoTradeState();
        this.showNotification(I18n.t('auto.stockRemoved'));
    }

    // 编辑自动交易股票
    editAutoTradeStock(index) {
        const config = this.autoTrade.configs[index];
        
        // 填充表单
        document.getElementById('auto-code').value = config.code;
        this.onAutoTradeCodeInput(config.code);
        
        // 设置交易方向
        document.querySelector(`input[name="auto-direction"][value="${config.direction}"]`).checked = true;
        
        // 根据交易方向更新触发条件类型选项
        this.onAutoTradeDirectionChange(config.direction);
        
        // 设置条件类型和操作符
        document.getElementById('auto-condition-type').value = config.conditionType;
        document.getElementById('auto-condition-operator').value = config.conditionOperator;
        document.getElementById('auto-condition-value').value = config.conditionValue || '';
        
        // 设置交易数量
        document.getElementById('auto-quantity').value = config.quantity;
        
        // 设置价格类型和限价
        document.getElementById('auto-price-type').value = config.priceType;
        document.getElementById('auto-limit-price').value = config.limitPrice || '';
        document.getElementById('auto-limit-price').disabled = config.priceType === 'market';
        
        // 设置风险控制参数
        document.getElementById('auto-stop-loss').value = config.stopLoss || '';
        document.getElementById('auto-take-profit').value = config.takeProfit || '';
        document.getElementById('auto-max-amount').value = config.maxAmount || '';
        
        // 保存编辑状态，但不从列表中移除
        this.autoTrade.editingIndex = index;
        
        // 更新按钮文本
        const addBtn = document.getElementById('add-auto-stock-btn');
        if (addBtn) {
            addBtn.textContent = I18n.t('common.saveEdit');
            addBtn.dataset.editing = 'true';
        }

        this.showNotification(I18n.t('auto.editLoaded'));
    }

    // 保存自动交易状态到存档
    saveAutoTradeState() {
        // 验证当前存档访问权限
        if (!this.currentSave) {
            console.error('保存自动交易状态失败：当前没有加载存档');
            this.showNotification(I18n.t('auto.saveFailedNoSave'), 'error');
            return false;
        }

        if (!this.currentUser || !this.currentUser.saves[this.currentSaveIndex]) {
            console.error('保存自动交易状态失败：存档访问越权');
            this.showNotification(I18n.t('auto.saveFailedAccess'), 'error');
            return false;
        }

        // 验证存档ID匹配
        if (this.currentSave.id !== this.currentUser.saves[this.currentSaveIndex].id) {
            console.error('保存自动交易状态失败：存档ID不匹配');
            this.showNotification(I18n.t('auto.saveFailedData'), 'error');
            return false;
        }
        
        // 确保自动交易配置对象存在
        if (!this.currentSave.autoTrade) {
            this.currentSave.autoTrade = {
                enabled: false,
                paused: false,
                configs: [],
                stats: {
                    totalTrades: 0,
                    successTrades: 0,
                    failedTrades: 0,
                    totalPnl: 0
                },
                records: []
            };
        }
        
        // 保存配置到当前存档（含冷却时间等运行期状态）
        this.currentSave.autoTrade = {
            enabled: this.autoTrade.enabled,
            paused: this.autoTrade.paused,
            configs: this.autoTrade.configs,
            stats: this.autoTrade.stats,
            records: this.autoTrade.records,
            lastTradeTimes: this.autoTrade.lastTradeTimes
        };
        
        // 同步到用户数据
        this.currentUser.saves[this.currentSaveIndex] = this.currentSave;
        this.saveUsers();
        
        return true;
    }
    
    // 加载当前存档的自动交易配置
    loadAutoTradeConfig() {
        // 验证当前存档访问权限
        if (!this.currentSave) {
            console.error('加载自动交易配置失败：当前没有加载存档');
            return false;
        }
        
        // 确保自动交易配置存在
        if (!this.currentSave.autoTrade) {
            this.currentSave.autoTrade = {
                enabled: false,
                paused: false,
                configs: [],
                stats: {
                    totalTrades: 0,
                    successTrades: 0,
                    failedTrades: 0,
                    totalPnl: 0
                },
                records: []
            };
        }
        
        // 加载配置到内存
        this.autoTrade.enabled = this.currentSave.autoTrade.enabled || false;
        this.autoTrade.paused = this.currentSave.autoTrade.paused || false;
        this.autoTrade.configs = this.currentSave.autoTrade.configs || [];
        this.autoTrade.stats = this.currentSave.autoTrade.stats || {
            totalTrades: 0,
            successTrades: 0,
            failedTrades: 0,
            totalPnl: 0
        };
        this.autoTrade.records = this.currentSave.autoTrade.records || [];
        // P1 Fix: 与 loadSave 保持一致，从存档恢复冷却时间
        this.autoTrade.lastTradeTimes = this.currentSave.autoTrade.lastTradeTimes || {};
        
        return true;
    }
    
    // 重置当前存档的自动交易配置
    resetAutoTradeConfig() {
        // 验证当前存档访问权限
        if (!this.currentSave) {
            console.error('重置自动交易配置失败：当前没有加载存档');
            this.showNotification(I18n.t('auto.resetFailedNoSave'), 'error');
            return false;
        }
        
        // 停止自动交易
        if (this.autoTrade.interval) {
            clearInterval(this.autoTrade.interval);
            this.autoTrade.interval = null;
        }
        
        // 重置配置
        this.autoTrade.enabled = false;
        this.autoTrade.paused = false;
        this.autoTrade.configs = [];
        this.autoTrade.stats = {
            totalTrades: 0,
            successTrades: 0,
            failedTrades: 0,
            totalPnl: 0
        };
        this.autoTrade.records = [];
        this.autoTrade.lastTradeTimes = {};
        this.autoTrade.editingIndex = null;
        
        // 保存到存档
        this.currentSave.autoTrade = {
            enabled: false,
            paused: false,
            configs: [],
            stats: {
                totalTrades: 0,
                successTrades: 0,
                failedTrades: 0,
                totalPnl: 0
            },
            records: [],
            lastTradeTimes: {}
        };
        
        // 同步到用户数据
        this.currentUser.saves[this.currentSaveIndex] = this.currentSave;
        this.saveUsers();
        
        // 更新界面
        this.renderAutoTradeStockList();
        this.updateAutoTradeStatus();
        
        this.showNotification(I18n.t('auto.configReset'));
        return true;
    }

    // 渲染自动交易股票列表
    renderAutoTradeStockList() {
        const container = document.getElementById('auto-trade-stocks-container');

        if (this.autoTrade.configs.length === 0) {
            container.innerHTML = `<p class="empty-tip">${escapeHtml(I18n.t('auto.emptyTip'))}</p>`;
            return;
        }

        // P0-1 Fix: escape all user-controllable config fields; also store the index in a data attribute
        // and use event delegation to avoid the global `game` reference and inline onclick handlers
        container.innerHTML = this.autoTrade.configs.map((config, index) => {
            const conditionText = this.getConditionText(config);
            // P0-1 Fix: whitelist direction / priceType to prevent attribute injection
            const dirClass = (config.direction === 'buy' || config.direction === 'sell') ? config.direction : 'buy';
            const nameEsc = escapeHtml(config.name);
            const codeEsc = escapeHtml(config.code);
            const condEsc = escapeHtml(conditionText);
            const qtyEsc = escapeHtml(String(config.quantity));
            const dirText = escapeHtml(I18n.t(config.direction === 'buy' ? 'auto.directionBuy' : 'auto.directionSell'));
            const priceTypeText = escapeHtml(I18n.t(config.priceType === 'market' ? 'auto.marketPriceLabel' : 'auto.limitPriceLabel'));
            const qtyLabel = escapeHtml(I18n.t('auto.quantityLabel'));
            const editText = escapeHtml(I18n.t('common.edit'));
            const delText = escapeHtml(I18n.t('common.delete'));
            return `
                <div class="auto-trade-stock-item ${dirClass}" data-idx="${index}">
                    <div class="auto-trade-stock-info">
                        <div class="stock-code">${nameEsc} (${codeEsc}) - ${dirText}</div>
                        <div class="stock-condition">${condEsc} | ${qtyLabel}: ${qtyEsc} | ${priceTypeText}</div>
                    </div>
                    <div class="auto-trade-stock-actions">
                        <button class="btn-edit" data-action="edit">${editText}</button>
                        <button class="btn-delete" data-action="delete">${delText}</button>
                    </div>
                </div>
            `;
        }).join('');

        // P0-1 Fix: replace inline onclick with event delegation
        container.querySelectorAll('.auto-trade-stock-item').forEach(item => {
            const idx = parseInt(item.dataset.idx, 10);
            const editBtn = item.querySelector('button[data-action="edit"]');
            const deleteBtn = item.querySelector('button[data-action="delete"]');
            if (editBtn) editBtn.addEventListener('click', (e) => { e.stopPropagation(); this.editAutoTradeStock(idx); });
            if (deleteBtn) deleteBtn.addEventListener('click', (e) => { e.stopPropagation(); this.removeAutoTradeStock(idx); });
        });
    }

    // 获取条件描述文本（支持国际化）
    getConditionText(config) {
        const operatorMap = { above: 'auto.operatorAbove', below: 'auto.operatorBelow', equal: 'auto.operatorEqual' };
        const typeMap = { price: 'auto.conditionTextPrice', percentage: 'auto.conditionTextPercentage', profit: 'auto.conditionTextProfit', time: 'auto.conditionTypeTime' };

        // P2-2 Fix: guard against unknown types/operators to avoid "undefined" rendering
        if (config.conditionType === 'time') {
            return I18n.t('auto.conditionTextTime');
        }
        if (!typeMap[config.conditionType] || !operatorMap[config.conditionOperator]) {
            return I18n.t('auto.conditionUnknown', { value: String(config.conditionValue || 0) });
        }

        return `${I18n.t(typeMap[config.conditionType])}${I18n.t(operatorMap[config.conditionOperator])}${config.conditionValue}${config.conditionType === 'percentage' ? '%' : I18n.t('auto.unitYuan')}`;
    }

    startAutoTrade() {
        const code = document.getElementById('auto-code').value;
        // 检查是否有股票配置
        if (this.autoTrade.configs.length === 0) {
            alert(I18n.t('auto.requireStock'));
            return;
        }

        if (!confirm(I18n.t('auto.startConfirm', { count: this.autoTrade.configs.length }))) {
            return;
        }

        this.autoTrade.enabled = true;
        this.autoTrade.paused = false;
        // 启动=新一轮运行：清零熔断计数（冷却时间 lastTradeTimes 仍保留，
        // 见 stopAutoTrade），否则上一轮残留的失败计数会让本轮很快再次自动暂停。
        this.autoTrade.consecutiveFailures = 0;
        // P1-8 Fix: clear any pre-existing interval before starting a new one.
        if (this.autoTrade.interval) {
            clearInterval(this.autoTrade.interval);
            this.autoTrade.interval = null;
        }
        this.autoTrade.interval = setInterval(() => this.checkAutoTradeCondition(), this.refreshRate);
        
        // 保存自动交易状态到存档
        if (this.currentSave) {
            this.currentSave.autoTrade = {
                enabled: true,
                paused: false,
                configs: this.autoTrade.configs,
                stats: this.autoTrade.stats,
                records: this.autoTrade.records,
                lastTradeTimes: this.autoTrade.lastTradeTimes
            };
            this.saveUsers();
        }
        
        this.updateAutoTradeStatus();
        this.showNotification(I18n.t('auto.started', { count: this.autoTrade.configs.length }));
    }

    pauseAutoTrade() {
        if (!this.autoTrade.enabled) return;
        
        this.autoTrade.paused = !this.autoTrade.paused;
        
        // 如果从暂停恢复，仅重新启动定时器；冷却时间必须保留，
        // 否则“暂停→继续”即可清零冷却时间、立即重复触发交易。
        if (!this.autoTrade.paused) {
            // Bug fix: 恢复运行时重置“连续失败”熔断计数（这是熔断器状态，不是
            // 冷却时间那类运行期计数器）。不重置的话，恢复后下一次失败
            // 就会立刻再次触发自动暂停。
            this.autoTrade.consecutiveFailures = 0;
            // 重新启动定时器（如果不存在）
            if (!this.autoTrade.interval) {
                this.autoTrade.interval = setInterval(() => this.checkAutoTradeCondition(), this.refreshRate);
            }
        } else {
            // 如果暂停，清除定时器
            if (this.autoTrade.interval) {
                clearInterval(this.autoTrade.interval);
                this.autoTrade.interval = null;
            }
        }
        
        // 保存自动交易状态到存档
        if (this.currentSave) {
            // 确保autoTrade对象存在
            if (!this.currentSave.autoTrade) {
                this.currentSave.autoTrade = {
                    enabled: this.autoTrade.enabled,
                    paused: this.autoTrade.paused,
                    configs: this.autoTrade.configs,
                    stats: this.autoTrade.stats,
                    records: this.autoTrade.records,
                    lastTradeTimes: this.autoTrade.lastTradeTimes
                };
            } else {
                this.currentSave.autoTrade.paused = this.autoTrade.paused;
                this.currentSave.autoTrade.lastTradeTimes = this.autoTrade.lastTradeTimes;
            }
            this.saveUsers();
        }
        
        this.updateAutoTradeStatus();
        this.showNotification(I18n.t(this.autoTrade.paused ? 'auto.paused' : 'auto.resumed'));
    }

    stopAutoTrade() {
        if (!this.autoTrade.enabled) return;
        
        if (!confirm(I18n.t('auto.stopConfirm'))) {
            return;
        }

        if (this.autoTrade.interval) {
            clearInterval(this.autoTrade.interval);
            this.autoTrade.interval = null;
        }

        this.autoTrade.enabled = false;
        this.autoTrade.paused = false;
        // 真正的停止才清零冷却时间（暂停/继续、加载存档都不应清零）
        this.autoTrade.lastTradeTimes = {};
        
        // 保存自动交易状态到存档（保留配置）
        this.saveAutoTradeState();
        
        this.updateAutoTradeStatus();
        this.showNotification(I18n.t('auto.stopped'));
    }

    checkAutoTradeCondition() {
        if (!this.autoTrade.enabled || this.autoTrade.paused || this.autoTrade.configs.length === 0) {
            return;
        }

        // P1 Fix: 游戏时间暂停时 updateMarket() 已冻结行情与游戏时间，自动交易必须
        // 共用同一“游戏是否在运行”的不变量，否则会按真实时钟在冻结价格上持续买卖。
        // 时间跳过（skipMode）是调试快速推进，与 updateMarket 保持一致放行。
        if (this.gameTimePaused && !this.skipMode) {
            return;
        }

        // 检查是否在交易时间内
        if (!this.isTradingTime()) {
            return;
        }

        const now = Date.now();

        // 遍历所有股票配置
        this.autoTrade.configs.forEach(config => {
            const data = this.stockData.get(config.code);
            if (!data) return;

            const tradeKey = config.code + '-' + config.direction;
            const lastTradeTime = this.autoTrade.lastTradeTimes[tradeKey] || 0;
            
            // 根据条件类型设置不同的冷却时间
            let cooldownTime = 5000; // 默认5秒
            if (config.conditionType === 'time') {
                cooldownTime = 30000; // 时间间隔模式30秒
            }
            
            // 防止重复交易：如果距离上次交易不到冷却时间，不执行
            if (now - lastTradeTime < cooldownTime) {
                return;
            }

            let shouldTrade = false;
            const currentPrice = data.price;
            const change = ((currentPrice - data.prevClose) / data.prevClose * 100);

            // 检查基础触发条件
            switch (config.conditionType) {
                case 'price':
                    if (config.conditionOperator === 'above' && currentPrice > config.conditionValue) shouldTrade = true;
                    else if (config.conditionOperator === 'below' && currentPrice < config.conditionValue) shouldTrade = true;
                    else if (config.conditionOperator === 'equal' && Math.abs(currentPrice - config.conditionValue) < 0.01) shouldTrade = true;
                    break;
                case 'percentage':
                    if (config.conditionOperator === 'above' && change > config.conditionValue) shouldTrade = true;
                    else if (config.conditionOperator === 'below' && change < config.conditionValue) shouldTrade = true;
                    else if (config.conditionOperator === 'equal' && Math.abs(change - config.conditionValue) < 0.01) shouldTrade = true;
                    break;
                case 'profit':
                    // 盈利目标模式：基于持仓成本的盈亏金额
                    if (config.direction === 'sell') {
                        const holding = this.currentSave.holdings[config.code];
                        if (holding) {
                            const pnlAmount = (currentPrice - holding.avgPrice) * holding.quantity;
                            debugLog(`盈利目标检查: ${config.name}(${config.code}), 当前价格: ${currentPrice}, 买入均价: ${holding.avgPrice}, 持仓数量: ${holding.quantity}, 盈亏金额: ${pnlAmount.toFixed(2)}, 触发条件: ${config.conditionOperator} ${config.conditionValue}元, shouldTrade初始值: ${shouldTrade}`);
                            if (config.conditionOperator === 'above' && pnlAmount >= config.conditionValue) {
                                shouldTrade = true;
                                debugLog(`盈利目标触发: ${config.name} 盈亏金额${pnlAmount.toFixed(2)}元 >= ${config.conditionValue}元，触发卖出`);
                            }
                            else if (config.conditionOperator === 'below' && pnlAmount <= -config.conditionValue) {
                                shouldTrade = true;
                                debugLog(`盈利目标触发: ${config.name} 盈亏金额${pnlAmount.toFixed(2)}元 <= -${config.conditionValue}元，触发卖出`);
                            }
                        } else {
                            debugLog(`盈利目标检查失败: ${config.name} 没有持仓数据`);
                        }
                    } else {
                        debugLog(`盈利目标检查跳过: ${config.name} 交易方向不是卖出`);
                    }
                    break;
                case 'time':
                    // 时间间隔模式：冷却时间已过，直接触发
                    shouldTrade = true;
                    break;
            }

            // 检查止损止盈条件（卖出操作）
            if (config.direction === 'sell' && !shouldTrade) {
                const holding = this.currentSave.holdings[config.code];
                if (holding) {
                    const pnlAmount = (currentPrice - holding.avgPrice) * holding.quantity;
                    debugLog(`止损止盈检查: ${config.name}, 当前盈亏金额=${pnlAmount.toFixed(2)}元, 止损设置=${config.stopLoss}元, 止盈设置=${config.takeProfit}元`);
                    
                    // 检查止损（支持正负数输入）
                    if (config.stopLoss !== 0) {
                        // 统一转换为正数阈值进行比较
                        const stopLossThreshold = Math.abs(config.stopLoss);
                        if (pnlAmount <= -stopLossThreshold) {
                            debugLog(`止损触发: ${config.name} 亏损金额${pnlAmount.toFixed(2)}元 >= ${stopLossThreshold}元，触发卖出`);
                            shouldTrade = true;
                        }
                    }
                    
                    // 检查止盈
                    if (config.takeProfit > 0 && pnlAmount >= config.takeProfit) {
                        debugLog(`止盈触发: ${config.name} 盈利金额${pnlAmount.toFixed(2)}元 >= ${config.takeProfit}元，触发卖出`);
                        shouldTrade = true;
                    }
                } else {
                    debugLog(`止损止盈检查跳过: ${config.name} 没有持仓数据`);
                }
            } else if (config.direction === 'sell') {
                debugLog(`止损止盈检查跳过: ${config.name} 已有基础触发条件或不是卖出操作, shouldTrade=${shouldTrade}`);
            }

            if (shouldTrade) {
                this.executeAutoTrade(config);
            }
        });
    }

    executeAutoTrade(config) {
        debugLog(`executeAutoTrade开始执行: ${config.name}(${config.code}), 方向: ${config.direction}, 条件类型: ${config.conditionType}`);

        // P2-7 Fix: snapshot before mutating so a failed persistence write can be rolled
        // back, matching the manual-trade path. Previously the in-memory fund/holdings
        // changed even when saveUsers() failed, diverging the UI from storage.
        const saveSnapshot = this.cloneSaveData(this.currentSave);
        const autoSnapshot = this.cloneSaveData(this.autoTrade);

        // 更新该股票的上次交易时间
        const tradeKey = config.code + '-' + config.direction;
        this.autoTrade.lastTradeTimes[tradeKey] = Date.now();

        const data = this.stockData.get(config.code);
        if (!data) {
            debugLog(`交易失败: 无法获取股票数据 ${config.code}`);
            this.addAutoTradeRecord(false, 0, I18n.t('auto.noStockData'), 0, config);
            return;
        }

        // M4 Fix: auto-trading must respect the configured minimum trading unit, exactly
        // like manual trading. It previously filled arbitrary quantities (e.g. 37 shares
        // with a 100-share lot).
        const tradeUnit = (this.currentSave.settings && this.currentSave.settings.tradeUnit) || 1;
        if (!Number.isInteger(config.quantity) || config.quantity <= 0) {
            debugLog(`交易失败: 数量无效 ${config.quantity}`);
            this.addAutoTradeRecord(false, 0, I18n.t('auto.invalidQuantityMsg'), 0, config);
            return;
        }
        if (config.quantity % tradeUnit !== 0) {
            debugLog(`交易失败: 数量 ${config.quantity} 不是交易单位 ${tradeUnit} 的整数倍`);
            this.addAutoTradeRecord(false, 0, I18n.t('trade.invalidQuantityUnit', { unit: tradeUnit }), 0, config);
            return;
        }

        // S1/L7 Fix: a market order uses the market price; a limit order uses the typed
        // limit, rounded to the 0.01 tick.
        const orderPrice = config.priceType === 'market'
            ? this.limitManager.roundToTick(data.price)
            : this.limitManager.roundToTick(Number(config.limitPrice));

        if (!Number.isFinite(orderPrice) || orderPrice <= 0) {
            debugLog(`交易失败: 价格无效 ${orderPrice}`);
            this.addAutoTradeRecord(false, 0, I18n.t('auto.invalidPrice'), 0, config);
            return;
        }

        // 熔断状态检查
        if (this.limitManager.isCircuitBreakerActive(config.code)) {
            debugLog(`交易失败: ${config.name} 处于熔断状态`);
            this.addAutoTradeRecord(false, 0, I18n.t('auto.circuitBreakerActive'), 0, config);
            return;
        }

        // 涨跌停价格校验（买卖双向）
        const limitUpPrice = this.limitManager.calculateLimitUpPrice(data.prevClose);
        const limitDownPrice = this.limitManager.calculateLimitDownPrice(data.prevClose);
        if (orderPrice > limitUpPrice) {
            debugLog(`交易失败: 委托价 ${orderPrice} 超过涨停价 ${limitUpPrice.toFixed(2)}`);
            this.addAutoTradeRecord(false, 0, I18n.t('trade.priceAboveLimitUp', { price: limitUpPrice.toFixed(2) }), 0, config);
            return;
        }
        if (orderPrice < limitDownPrice) {
            debugLog(`交易失败: 委托价 ${orderPrice} 低于跌停价 ${limitDownPrice.toFixed(2)}`);
            this.addAutoTradeRecord(false, 0, I18n.t('trade.priceBelowLimitDown', { price: limitDownPrice.toFixed(2) }), 0, config);
            return;
        }

        // S1 Fix: match a limit order against the market. A limit order that cannot fill
        // is skipped; it is never filled at the typed price (that was the arbitrage).
        let price = orderPrice;
        if (config.priceType === 'limit') {
            if (config.direction === 'buy') {
                if (data.price > orderPrice + 1e-9) {
                    debugLog(`限价买入未成交: 市价 ${data.price} 高于限价 ${orderPrice}`);
                    this.addAutoTradeRecord(false, 0, I18n.t('trade.limitBuyNotFilled', { price: data.price.toFixed(2), limit: orderPrice.toFixed(2) }), 0, config);
                    return;
                }
            } else if (data.price < orderPrice - 1e-9) {
                debugLog(`限价卖出未成交: 市价 ${data.price} 低于限价 ${orderPrice}`);
                this.addAutoTradeRecord(false, 0, I18n.t('trade.limitSellNotFilled', { price: data.price.toFixed(2), limit: orderPrice.toFixed(2) }), 0, config);
                return;
            }
            price = this.limitManager.roundToTick(data.price);
        }

        const amount = price * config.quantity;
        const fee = config.direction === 'buy'
            ? amount * this.currentSave.settings.buyFee
            : amount * this.currentSave.settings.sellFee;

        debugLog(`交易详情: 成交价=${price}, 委托价=${orderPrice}, 数量=${config.quantity}, 金额=${amount.toFixed(2)}, 手续费=${fee.toFixed(2)}`);

        // 委托价与市价偏离度校验（防误触）
        const MAX_PRICE_DEVIATION = 0.20;
        const lowerBound = data.price * (1 - MAX_PRICE_DEVIATION);
        const upperBound = data.price * (1 + MAX_PRICE_DEVIATION);
        if (orderPrice < lowerBound || orderPrice > upperBound) {
            debugLog(`交易失败: 委托价 ${orderPrice} 与市价 ${data.price.toFixed(2)} 偏离超过${MAX_PRICE_DEVIATION * 100}%`);
            this.addAutoTradeRecord(false, 0, I18n.t('auto.priceDeviationExceeded', { percent: MAX_PRICE_DEVIATION * 100 }), 0, config);
            return;
        }

        if (config.maxAmount && amount > config.maxAmount) {
            debugLog(`交易失败: 超过单次最大金额限制 ${config.maxAmount}`);
            this.addAutoTradeRecord(false, 0, I18n.t('auto.exceedMaxAmount'), 0, config);
            return;
        }

        // 更新上次交易时间
        this.autoTrade.lastTradeTime = Date.now();

        let holding = null;
        let pnl = 0;

        if (config.direction === 'buy') {
            const totalCost = amount + fee;
            if (totalCost > this.currentSave.fund) {
                this.addAutoTradeRecord(false, 0, I18n.t('trade.insufficientFund'), 0, config);
                return;
            }

            // T+1：与手动交易一致，仅限制“当日买入当日卖出”（见下方卖出数量
            // 校验），允许当日卖出后买回（对齐真实 A 股规则）。

            // P1-2 Fix: round money to cents
            this.currentSave.fund = round2(this.currentSave.fund - totalCost);
            
            if (!this.currentSave.holdings[config.code]) {
                this.currentSave.holdings[config.code] = {
                    name: config.name,
                    quantity: 0,
                    avgPrice: 0,
                    totalCost: 0
                };
            }

            holding = this.currentSave.holdings[config.code];
            // P0-2 Fix: include fee in the cost basis (match manual buy's behavior)
            // P1-2 Fix: round to cents
            const newTotalCost = round2(holding.totalCost + totalCost);
            holding.quantity += config.quantity;
            holding.avgPrice = round2(newTotalCost / holding.quantity);
            holding.totalCost = newTotalCost;

            if (!this.currentSave.dayTrades[config.code]) {
                this.currentSave.dayTrades[config.code] = { buy: 0, sell: 0 };
            }
            this.currentSave.dayTrades[config.code].buy += config.quantity;

            this.addAutoTradeRecord(true, -totalCost, I18n.t('auto.buySuccess'), 0, config);

            // P0-2 Fix: use cached Map instead of O(n) find for every auto-trade tick
            const stock = this._stockPoolByCode && this._stockPoolByCode.get(config.code);
            // P2 Fix: 复用统一的买入后统计更新，补上此前遗漏的 maxHoldings
            this.updateStatsAfterBuy(stock);

        } else {
            debugLog(`执行卖出操作: ${config.name}(${config.code})`);
            holding = this.currentSave.holdings[config.code];
            debugLog(`持仓检查: holding=${JSON.stringify(holding)}, 需要卖出数量=${config.quantity}`);
            
            if (!holding || holding.quantity < config.quantity) {
                debugLog(`卖出失败: 持仓不足, 当前持仓=${holding?.quantity || 0}, 需要卖出=${config.quantity}`);
                this.addAutoTradeRecord(false, 0, I18n.t('auto.insufficientHolding'), 0, config);
                return;
            }

            if (!this.currentSave.settings.t0Mode) {
                const dayTrades = this.currentSave.dayTrades[config.code] || { buy: 0, sell: 0 };
                const availableQty = holding.quantity - dayTrades.buy;
                debugLog(`T+1检查: 总持仓=${holding.quantity}, 当日买入=${dayTrades.buy}, 可卖数量=${availableQty}`);
                if (config.quantity > availableQty) {
                    debugLog(`卖出失败: T+1规则限制, 可卖数量=${availableQty}, 需要卖出=${config.quantity}`);
                    this.addAutoTradeRecord(false, 0, I18n.t('auto.t1Blocked'), 0, config);
                    return;
                }
            }

            const totalIncome = amount - fee;
            // P1-2 Fix: round money to cents
            this.currentSave.fund = round2(this.currentSave.fund + totalIncome);

            // P1-5 Fix: include sell fee in PnL (consistent with manual sell).
            // Bug fix: remove the exact proportional cost basis on a partial sell so the
            // remaining totalCost cannot drift (see executeSellTrade).
            const removedCost = round2(holding.totalCost * config.quantity / holding.quantity);
            pnl = round2((price * config.quantity) - removedCost - fee);

            holding.quantity -= config.quantity;
            holding.totalCost = round2(holding.totalCost - removedCost);

            if (holding.quantity === 0) {
                delete this.currentSave.holdings[config.code];
                debugLog(`持仓清零: ${config.name} 已从持仓列表中移除`);
            } else {
                holding.avgPrice = round2(holding.totalCost / holding.quantity);
            }

            if (!this.currentSave.dayTrades[config.code]) {
                this.currentSave.dayTrades[config.code] = { buy: 0, sell: 0 };
            }
            this.currentSave.dayTrades[config.code].sell += config.quantity;

            this.addAutoTradeRecord(true, totalIncome, I18n.t('auto.sellSuccess'), pnl, config, holding, price);
            
            this.currentSave.gameStats.tradeCount++;
            // Bug fix: 盈亏恰好为 0 的卖出既不算盈利也不算亏损（与手动交易一致）
            if (pnl > 0) {
                this.currentSave.gameStats.profitCount++;
            } else if (pnl < 0) {
                this.currentSave.gameStats.lossCount++;
            }
        }

        // M6 Fix: accumulate fees + realized P&L in dedicated counters (see recordTrade).
        if (this.currentSave.gameStats) {
            this.currentSave.gameStats.totalFees = round2((this.currentSave.gameStats.totalFees || 0) + fee);
            if (pnl > 0) {
                this.currentSave.gameStats.realizedProfit = round2((this.currentSave.gameStats.realizedProfit || 0) + pnl);
            } else if (pnl < 0) {
                this.currentSave.gameStats.realizedLoss = round2((this.currentSave.gameStats.realizedLoss || 0) + Math.abs(pnl));
            }
        }

        // Bug fix: auto trades must use the same game-time record shape as manual ones
        // (game day + game clock + pre-trade cash + cent-rounded amounts).
        const autoStamp = this.getGameTimestamp();
        const autoSignedAmount = config.direction === 'buy' ? -(amount + fee) : (amount - fee);
        this.currentSave.records.unshift({
            // #24 Fix: unique id so a multi-tab merge never collapses two identical trades.
            id: (Crypto && Crypto.uuid) ? Crypto.uuid() : ('r-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10)),
            time: autoStamp.time,
            dayIndex: autoStamp.dayIndex,
            gameMinutes: autoStamp.gameMinutes,
            fundBefore: saveSnapshot && Number.isFinite(saveSnapshot.fund) ? round2(saveSnapshot.fund) : null,
            code: config.code,
            name: config.name,
            type: config.direction,
            price,
            quantity: config.quantity,
            amount: round2(autoSignedAmount),
            pnl: config.direction === 'sell' ? round2(pnl) : 0
        });

        if (this.currentSave.records.length > 100) {
            this.currentSave.records = this.currentSave.records.slice(0, 100);
        }

        // P1-10 Fix: only announce the auto-trade after it persisted successfully.
        const persisted = this.saveUsers();

        // P2-7 Fix: on a failed write, roll the in-memory trade back so UI and storage
        // stay consistent (the manual-trade path already did this).
        if (!persisted) {
            this.restoreSaveSnapshot(saveSnapshot);
            this.autoTrade = autoSnapshot;
            this.updateTradeAvailable();
            this.updatePortfolio();
            this.showNotification(I18n.t('trade.saveFailedRollback'), 'error');
            return;
        }

        this.updateTradeAvailable();
        this.updatePortfolio();
        this.checkAchievements();

        // 显示交易通知
        this.showNotification(I18n.t('auto.tradeNotification', {
            direction: I18n.t(config.direction === 'buy' ? 'auto.directionBuy' : 'auto.directionSell'),
            name: config.name,
            quantity: config.quantity,
            price: price.toFixed(2)
        }));
    }

    addAutoTradeRecord(success, amount, message, pnl = 0, config = null, holding = null, currentPrice = 0) {
        const record = {
            // #24 Fix: unique id so a multi-tab merge never collapses two identical log lines.
            id: (Crypto && Crypto.uuid) ? Crypto.uuid() : ('a-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10)),
            time: Date.now(),
            success,
            amount,
            message,
            pnl,
            code: config?.code || '',
            name: config?.name || '',
            direction: config?.direction || '',
            conditionType: config?.conditionType || '',
            conditionValue: config?.conditionValue || 0,
            buyPrice: holding?.avgPrice || 0,
            sellPrice: currentPrice,
            pnlPercent: holding?.avgPrice ? ((currentPrice - holding.avgPrice) / holding.avgPrice * 100).toFixed(2) : 0
        };

        this.autoTrade.records.unshift(record);
        
        if (this.autoTrade.records.length > 50) {
            this.autoTrade.records = this.autoTrade.records.slice(0, 50);
        }

        // P2-6 Fix: only a successful trade increments totalTrades; failures feed a
        // separate consecutive-failure breaker instead.
        if (success) {
            this.autoTrade.stats.totalTrades = (this.autoTrade.stats.totalTrades || 0) + 1;
            this.autoTrade.stats.successTrades++;
            this.autoTrade.stats.totalPnl += pnl;
            this.autoTrade.consecutiveFailures = 0;
        } else {
            this.autoTrade.stats.failedTrades++;
            this.autoTrade.consecutiveFailures = (this.autoTrade.consecutiveFailures || 0) + 1;
            const maxFailures = this.autoTrade.maxConsecutiveFailures || 20;
            if (this.autoTrade.consecutiveFailures >= maxFailures && this.autoTrade.enabled) {
                if (this.autoTrade.interval) {
                    clearInterval(this.autoTrade.interval);
                    this.autoTrade.interval = null;
                }
                this.autoTrade.paused = true;
                this.showNotification(I18n.t('auto.failureLimitNotice', { max: maxFailures }), 'warning');
                // Bug fix: the breaker flipped the paused flag internally but the status
                // text / indicator / pause button kept showing "running", so clicking
                // "暂停" actually resumed. Re-render the status right after tripping.
                this.updateAutoTradeStatus();
            }
        }

        this.updateAutoTradeStats();
        this.saveAutoTradeState();
    }

    updateAutoTradeStatus() {
        const statusText = document.getElementById('auto-trade-status-text');
        const statusIndicator = document.getElementById('auto-trade-status-indicator');
        const startBtn = document.getElementById('start-auto-trade-btn');
        const pauseBtn = document.getElementById('pause-auto-trade-btn');
        const stopBtn = document.getElementById('stop-auto-trade-btn');

        if (!this.autoTrade.enabled) {
            statusText.textContent = I18n.t('auto.statusStopped');
            statusIndicator.className = 'status-indicator';
            startBtn.disabled = false;
            pauseBtn.disabled = true;
            stopBtn.disabled = true;
        } else if (this.autoTrade.paused) {
            statusText.textContent = I18n.t('auto.statusPaused');
            statusIndicator.className = 'status-indicator paused';
            startBtn.disabled = true;
            pauseBtn.disabled = false;
            pauseBtn.textContent = I18n.t('auto.resume');
            stopBtn.disabled = false;
        } else {
            statusText.textContent = I18n.t('auto.statusRunning');
            statusIndicator.className = 'status-indicator running';
            startBtn.disabled = true;
            pauseBtn.disabled = false;
            pauseBtn.textContent = I18n.t('auto.pause');
            stopBtn.disabled = false;
        }
    }

    updateAutoTradeStats() {
        document.getElementById('auto-total-trades').textContent = this.autoTrade.stats.totalTrades;
        document.getElementById('auto-success-trades').textContent = this.autoTrade.stats.successTrades;
        document.getElementById('auto-failed-trades').textContent = this.autoTrade.stats.failedTrades;
        
        const totalPnlEl = document.getElementById('auto-total-pnl');
        totalPnlEl.textContent = this.formatCurrency(this.autoTrade.stats.totalPnl, true);
        totalPnlEl.className = `stat-value ${this.autoTrade.stats.totalPnl >= 0 ? 'up' : 'down'}`;

        const recordsList = document.getElementById('auto-trade-records-list');
        
        if (this.autoTrade.records.length === 0) {
            recordsList.innerHTML = `<p style="text-align:center;color:var(--text-secondary);padding:20px;">${escapeHtml(I18n.t('auto.noRecords'))}</p>`;
        } else {
            recordsList.innerHTML = this.autoTrade.records.map(record => {
                const date = new Date(record.time);
                const pnlClass = record.pnl >= 0 ? 'up' : 'down';
                // P0-1 Fix: whitelist the class suffix and escape all fields
                const successClass = record.success ? 'success' : 'failed';

                // P0-1 Fix: escape every field before HTML interpolation
                let detailsHtml = `<div class="time">${escapeHtml(date.toLocaleString(I18n.getCurrentLanguage()))}</div>`;
                detailsHtml += `<div class="details">${escapeHtml(String(record.message || ''))}</div>`;

                if (record.code) {
                    detailsHtml += `<div class="stock-info">${escapeHtml(String(record.name || ''))} (${escapeHtml(String(record.code || ''))})</div>`;
                }

                if (record.direction === 'sell' && record.buyPrice > 0) {
                    detailsHtml += `<div class="trade-details">
                        ${escapeHtml(I18n.t('auto.buyPriceLabel'))}: ${escapeHtml(this.formatCurrencyExact(Number(record.buyPrice)))} | ${escapeHtml(I18n.t('auto.sellPriceLabel'))}: ${escapeHtml(this.formatCurrencyExact(Number(record.sellPrice)))} | ${escapeHtml(I18n.t('auto.pnlLabel'))}: ${escapeHtml(this.formatPercent(Number(record.pnlPercent || 0), true))}
                    </div>`;
                }

                if (record.conditionType) {
                    const conditionText = this.getConditionText({
                        conditionType: record.conditionType,
                        conditionOperator: record.conditionType === 'profit' ? 'above' : 'equal',
                        conditionValue: record.conditionValue
                    });
                    detailsHtml += `<div class="condition-info">${escapeHtml(I18n.t('auto.conditionTriggerLabel'))}: ${escapeHtml(conditionText)}</div>`;
                }

                // P1-2b Fix: sign before the currency symbol; a tiny negative shows as ¥0.00.
                const amountText = Math.abs(Number(record.pnl) || 0) >= 0.005
                    ? escapeHtml(this.formatCurrencyExact(record.pnl, true))
                    : '--';
                const statusText = record.success ? escapeHtml(I18n.t('common.statusSuccess')) : escapeHtml(I18n.t('common.statusFailed'));

                return `
                    <div class="record-item ${successClass}">
                        <div class="record-info">
                            ${detailsHtml}
                        </div>
                        <div class="record-result">
                            <div class="amount ${pnlClass}">${amountText}</div>
                            <div class="status">${statusText}</div>
                        </div>
                    </div>
                `;
            }).join('');
        }
    }

    // P2-5: verifyYingShiJuFeng and fixAbnormalHoldings removed (dead code; the latter silently
    // rewrote holding.avgPrice with the current market price, faking P&L).
}

// 启动应用
document.addEventListener('DOMContentLoaded', () => {
    // 全局禁用右键菜单
    document.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        return false;
    });
    
    window.game = new StockSimulator();
    
    // 处理浏览器后退按钮，防止返回到已退出的页面
    window.addEventListener('popstate', (event) => {
        const game = window.game;
        if (!game) return;
        
        // 如果用户已退出（currentUser为null），强制保持在登录页面
        if (!game.currentUser) {
            const currentScreen = document.querySelector('.screen.active');
            if (currentScreen && currentScreen.id !== 'auth-screen') {
                game.showScreen('auth-screen');
            }
        }
    });
});
