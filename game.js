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
function round2(n) {
    if (typeof n !== 'number' || !isFinite(n)) return 0;
    const sign = n < 0 ? -1 : 1;
    return Math.round((n + sign * Number.EPSILON) * 100) / 100;
}

// P0-1 Fix: HTML escape utility to prevent XSS when rendering user-controlled data via innerHTML
function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value).replace(/[&<>"']/g, function (c) {
        return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
}

// P0-1 Fix: Sanitize import data to reject malformed/malicious payloads
function sanitizeUserData(raw) {
    if (!raw || typeof raw !== 'object') throw new Error('Invalid data');
    if (typeof raw.username !== 'string' || raw.username.length < 2 || raw.username.length > 20) {
        throw new Error('Invalid username');
    }
    // Username whitelist: letters, digits, Chinese, underscore, hyphen (mirrors register() validation)
    if (!/^[\u4e00-\u9fa5a-zA-Z0-9_\-]+$/.test(raw.username)) {
        throw new Error('Invalid username characters');
    }
    if (typeof raw.passwordHash !== 'string' || !/^[0-9a-f]{1,16}$/.test(raw.passwordHash)) {
        throw new Error('Invalid password hash');
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

// P0-1 Fix: Validate a single save object to reject malicious content
function sanitizeSaveData(raw) {
    if (!raw || typeof raw !== 'object') throw new Error('Invalid save');
    const save = {};
    save.id = typeof raw.id === 'string' ? raw.id : (Crypto && Crypto.uuid ? Crypto.uuid() : Date.now().toString());
    save.createdAt = typeof raw.createdAt === 'number' && isFinite(raw.createdAt) ? raw.createdAt : Date.now();
    save.fund = Number.isFinite(raw.fund) ? Number(raw.fund) : 1000000;
    save.initialFund = Number.isFinite(raw.initialFund) ? Number(raw.initialFund) : save.fund;
    save.name = (typeof raw.name === 'string' && raw.name.length >= 1 && raw.name.length <= 20)
        ? raw.name : '';
    // Name: restrict to safe character set (Chinese, letters, digits, limited punctuation)
    if (save.name && !/^[\u4e00-\u9fa5a-zA-Z0-9\s\-_\.，。！？、：""''（）【】]+$/.test(save.name)) {
        save.name = '';
    }
    save.holdings = (raw.holdings && typeof raw.holdings === 'object') ? raw.holdings : {};
    save.records = Array.isArray(raw.records) ? raw.records.slice(0, 100) : [];
    save.watchlist = Array.isArray(raw.watchlist) ? raw.watchlist.filter(c => typeof c === 'string' && /^\d{6}$/.test(c)) : [];
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
    save.dayTrades = (raw.dayTrades && typeof raw.dayTrades === 'object') ? raw.dayTrades : {};
    save.gameStats = (raw.gameStats && typeof raw.gameStats === 'object') ? raw.gameStats : {
        tradeCount: 0, profitCount: 0, lossCount: 0, maxHoldings: 0, sectorsTraded: new Set(), dayTrades: 0
    };
    save.autoTrade = (raw.autoTrade && typeof raw.autoTrade === 'object') ? raw.autoTrade : { enabled: false, paused: false, configs: [], stats: {}, records: [] };
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
            minutesPerTick: 1
        };
        
        // 时间控制（设置面板新增功能）
        this.gameTimePaused = false;  // 是否暂停游戏时间推进
        this.skipMode = false;        // 是否正在加速跳过时间
        this.skipTicksRemaining = 0;  // 跳过剩余需要推进的tick数
        
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
            stockTradeCounts: {},  // 每只股票的交易次数
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

        // 4. 更新自选按钮文本
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
        const data = localStorage.getItem('stock_simulator_users');
        this.users = data ? JSON.parse(Crypto.decrypt(data) || '{}') : {};
        
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

    saveUsers() {
        try {
            localStorage.setItem('stock_simulator_users', Crypto.encrypt(JSON.stringify(this.users)));
        } catch (error) {
            console.error('保存用户数据失败:', error);
            this.showNotification(I18n.t('save.saveFailedStorage'), 'error');
        }
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
        document.getElementById('buy-price').addEventListener('input', () => this.updateTradeEstimate('buy'));
        document.getElementById('buy-quantity').addEventListener('input', () => this.updateTradeEstimate('buy'));
        document.getElementById('sell-price').addEventListener('input', () => this.updateTradeEstimate('sell'));
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

        // 存档操作
        document.getElementById('export-save-btn').addEventListener('click', () => this.exportSave());
        document.getElementById('import-save-btn').addEventListener('click', () => this.importSave());
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
    async login() {
        const username = document.getElementById('login-username').value.trim();
        const password = document.getElementById('login-password').value;
        const errorEl = document.getElementById('login-error');

        if (!username || !password) {
            errorEl.textContent = I18n.t('auth.loginError.empty');
            return;
        }

        const user = this.users[username];
        if (!user) {
            errorEl.textContent = I18n.t('auth.loginError.userNotFound');
            return;
        }

        let verifyResult;
        try {
            verifyResult = await Crypto.verifyPassword(password, user.passwordHash);
        } catch (e) {
            errorEl.textContent = I18n.t('auth.loginError.wrongPassword');
            return;
        }
        if (!verifyResult || !verifyResult.valid) {
            errorEl.textContent = I18n.t('auth.loginError.wrongPassword');
            return;
        }

        // P1-4 Fix: if the stored hash was legacy, transparently upgrade it.
        if (verifyResult.upgradedHash) {
            user.passwordHash = verifyResult.upgradedHash;
            this.users[username] = user;
            try { this.saveUsers(); } catch (_) { /* best-effort */ }
        }

        this.currentUser = { username, ...user };
        localStorage.setItem('stock_simulator_last_user', username);
        
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

        if (!username || username.length < 2 || username.length > 20) {
            errorEl.textContent = I18n.t('auth.regError.usernameLength');
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

        if (this.users[username]) {
            errorEl.textContent = I18n.t('auth.regError.userExists');
            return;
        }

        let passwordHash;
        try {
            passwordHash = await Crypto.hashAsync(password);
        } catch (e) {
            errorEl.textContent = I18n.t('auth.regError.generic');
            return;
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

        this.saveUsers();
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
        
        // 清除自动交易定时器
        if (this.autoTrade.interval) {
            clearInterval(this.autoTrade.interval);
            this.autoTrade.interval = null;
        }
        
        // 清除市场模拟定时器
        if (this.marketInterval) {
            clearInterval(this.marketInterval);
            this.marketInterval = null;
        }
        
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
            stockTradeCounts: {},
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
        
        // 重置主题到默认状态（可选）
        // document.body.className = '';
        
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

        // 验证用户输入
        if (userInput !== 'DELETE') {
            alert(I18n.t('deleteAccount.inputMismatch'));
            return;
        }

        // 再次确认
        if (!confirm(I18n.t('deleteAccount.warning'))) {
            return;
        }

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
        console.log('showSaveSelect被调用');
        this.showScreen('save-select-screen');
        console.log('showScreen调用完成');
        this.renderSaveList();
        console.log('renderSaveList调用完成');
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

        saves.forEach((save, index) => {
            const item = document.createElement('div');
            item.className = 'save-item';
            // P0-1 Fix: escape user-controlled save name to prevent XSS
            const saveName = escapeHtml(save.name || I18n.t('save.defaultName', { index: index + 1 }));
            const dateStr = escapeHtml(new Date(save.createdAt).toLocaleDateString(I18n.getCurrentLanguage()));
            const fundText = escapeHtml(this.formatMoney(save.fund));
            const enterText = escapeHtml(I18n.t('common.enter'));
            const renameText = escapeHtml(I18n.t('common.rename'));
            const deleteText = escapeHtml(I18n.t('common.delete'));
            item.innerHTML = `
                <div class="save-info">
                    <h4>${saveName}</h4>
                    <p>${I18n.t('save.info', { fund: fundText, date: dateStr })}</p>
                </div>
                <div class="save-actions">
                    <button class="btn-enter" data-index="${index}">${enterText}</button>
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
        this.showScreen('game-setup-screen');
    }

    // 开始游戏
    startGame() {
        const fundType = document.querySelector('input[name="fund-type"]:checked').value;
        let initialFund = 0;

        if (fundType === 'random') {
            initialFund = Math.floor(Math.random() * 150 + 50) * 10000; // 50-200万
        } else {
            const custom = parseFloat(document.getElementById('custom-fund').value);
            if (!custom || custom < 10) {
                alert(I18n.t('setup.fundInvalid'));
                return;
            }
            initialFund = custom * 10000;
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
                buyFee: parseFloat(document.getElementById('buy-fee').value) / 100,
                sellFee: parseFloat(document.getElementById('sell-fee').value) / 100,
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
                dayTrades: 0
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
                records: []
            }
        };

        this.currentUser.saves.push(save);
        this.saveUsers();
        // 仅新开局时随机设置一个交易时段内的游戏时间
        // （切换/加载已有存档时不再重置时间，避免时间被强行重置引发一系列问题）
        this.randomizeGameTime();
        this.loadSave(this.currentUser.saves.length - 1);
    }

    // 加载存档
    loadSave(index) {
        this.currentSave = this.currentUser.saves[index];
        this.currentSaveIndex = index;
        
        // 取消进行中的时间跳过，避免跳过流程与新存档互相干扰
        this.cancelSkip();
        
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
                dayTrades: 0
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
        // Set类型在JSON序列化后会变成{}，需要重新转换
        if (!(this.currentSave.gameStats.sectorsTraded instanceof Set)) {
            const sectors = this.currentSave.gameStats.sectorsTraded || {};
            this.currentSave.gameStats.sectorsTraded = new Set(
                Object.keys(sectors).filter(k => sectors[k] === true)
            );
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
            this.autoTrade.stockTradeCounts = {};  // 重置交易次数计数器，不从存档加载
            this.autoTrade.lastTradeTimes = {};
            
            // 加载自动交易状态
            this.autoTrade.enabled = this.currentSave.autoTrade.enabled || false;
            this.autoTrade.paused = this.currentSave.autoTrade.paused || false;
            
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
        
        // 恢复用户刷新速度设置
        this.refreshRate = this.currentUser.refreshRate || 3000;
        const refreshRateSelect = document.getElementById('refresh-rate');
        if (refreshRateSelect) {
            refreshRateSelect.value = this.refreshRate;
        }
        
        this.initMarketData();
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
        const currentName = save.name || I18n.t('save.defaultName', { index: index + 1 });
        
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
        const validPattern = /^[\u4e00-\u9fa5a-zA-Z0-9\s\-_\.，。！？、：""''（）【】]+$/;
        if (!validPattern.test(newName)) {
            errorEl.textContent = I18n.t('rename.error.invalid');
            return;
        }
        
        // 更新存档名称
        if (this.renameSaveIndex !== null && this.renameSaveIndex >= 0) {
            this.currentUser.saves[this.renameSaveIndex].name = newName;
            
            // 同步到 users 对象
            if (this.currentUser.username && this.users[this.currentUser.username]) {
                this.users[this.currentUser.username].saves[this.renameSaveIndex].name = newName;
            }
            
            // 保存到本地存储
            this.saveUsers();
            
            // 刷新存档列表
            this.renderSaveList();
            
            // 显示成功提示
            this.showNotification(I18n.t('save.renameSuccess'));
            
            // 关闭模态窗口
            this.hideRenameSaveModal();
        }
    }

    // 初始化市场数据
    initMarketData() {
        this.stockData.clear();
        // P0-2 Fix: build a code -> stock cache once so O(n) `StockPool.find` calls become O(1) lookups
        if (!this._stockPoolByCode) {
            this._stockPoolByCode = new Map();
        }
        this._stockPoolByCode.clear();
        StockPool.forEach(stock => {
            this._stockPoolByCode.set(stock.code, stock);
            const basePrice = this.generateBasePrice(stock);
            const history = this.generateHistory(basePrice);
            const lastHistory = history[history.length - 1];
            
            // 计算历史成交量的移动平均（最近5日）
            const recentVolumes = history.slice(-5).map(h => h.volume);
            const avgVolume = recentVolumes.length > 0 
                ? Math.floor(recentVolumes.reduce((a, b) => a + b, 0) / recentVolumes.length)
                : Math.floor(Math.random() * 1000000);
            
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

    // 生成基础价格
    generateBasePrice(stock) {
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
        return parseFloat((Math.random() * (range[1] - range[0]) + range[0]).toFixed(2));
    }

    // 生成历史K线数据
    generateHistory(basePrice) {
        const history = [];
        let price = basePrice;
        let prevVolume = Math.floor(Math.random() * 1000000);  // 初始基准成交量
        
        // 生成日期标签（从今天往前推60天）
        const today = new Date();
        
        for (let i = 0; i < 60; i++) {
            const change = (Math.random() - 0.5) * 0.04;
            const open = price;
            const close = price * (1 + change);
            const high = Math.max(open, close) * (1 + Math.random() * 0.02);
            const low = Math.min(open, close) * (1 - Math.random() * 0.02);
            
            // 计算当日内涨跌幅
            const dailyChange = (close - open) / open;
            
            // 计算当日成交量（基于前一成交量和当日内涨跌幅）
            // 使用线性关系：当日成交量 = 前一成交量 * (1 + 涨跌幅 * 1.5)
            // 限制涨跌幅在 -20% ~ +20% 范围内，避免成交量异常
            const clampedChange = Math.max(-0.2, Math.min(0.2, dailyChange));
            const targetVolume = prevVolume * (1 + clampedChange * 1.5);
            
            // 添加随机波动（±3%），确保不会改变方向
            const randomFactor = 0.97 + Math.random() * 0.06;
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

    // 启动市场模拟
    startMarketSimulation() {
        if (this.marketInterval) {
            clearInterval(this.marketInterval);
        }
        this.updateMarket();
        this.marketInterval = setInterval(() => this.updateMarket(), this.refreshRate);
    }

    // 更新游戏时间
    updateGameTime() {
        // P2-6 Fix: read the per-tick minute increment from the field rather than hardcoding.
        // Default to 1 to preserve prior behavior; tests can lower it to speed up the clock.
        const step = (this.gameTime.minutesPerTick | 0) || 1;
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
        } else if (totalMinutes >= 695 && totalMinutes <= 700) { // 11:35-11:40
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
        const isMorningSession = totalMinutes >= 570 && totalMinutes <= 690;  // 9:30 - 11:30
        const isAfternoonSession = totalMinutes >= 780 && totalMinutes <= 900; // 13:00 - 15:00
        return isMorningSession || isAfternoonSession;
    }

    // 随机设置游戏时间（在交易时间范围内）
    randomizeGameTime() {
        // 如果已经手动设置过时间，不再自动随机
        if (this.gameTime && this.gameTime.manualSet) {
            console.log('时间已手动设置，跳过自动随机');
            return;
        }
        
        // 交易时间范围：9:30 - 11:30
        // 转换为分钟：9*60+30=570 到 11*60+30=690
        const minMinutes = 570;
        const maxMinutes = 690;
        
        // 随机生成一个分钟数
        const randomMinutes = Math.floor(Math.random() * (maxMinutes - minMinutes + 1)) + minMinutes;
        
        // 转换为小时和分钟
        this.gameTime.hour = Math.floor(randomMinutes / 60);
        this.gameTime.minute = randomMinutes % 60;
        
        // 更新时间显示
        this.updateTimeDisplay();
        
        console.log(`随机设置游戏时间为: ${this.gameTime.hour}:${this.gameTime.minute.toString().padStart(2, '0')}`);
    }

    // 时间控制：暂停 / 继续
    toggleTimePause() {
        this.gameTimePaused = !this.gameTimePaused;
        this.updateTimeDisplay();
        this.showNotification(I18n.t(this.gameTimePaused ? 'notification.timePaused' : 'notification.timeResumed'));
    }

    // 计算跳过的目标时间（返回当天分钟数 0-1439；null 表示无需跳过）
    getSkipTargetMinutes() {
        const cur = this.gameTime.hour * 60 + this.gameTime.minute;

        // 处于交易时段（含夜猫）：跳至本轮交易结束前1分钟（游戏时间以分钟计，≈结束前10秒）
        if (cur >= 570 && cur <= 690) {      // 上午盘 9:30 - 11:30
            return cur < 689 ? 689 : null;   // → 11:29
        }
        if (cur >= 695 && cur <= 700) {      // 夜猫 11:35 - 11:40
            return cur < 699 ? 699 : null;   // → 11:39
        }
        if (cur >= 780 && cur <= 900) {      // 下午盘 13:00 - 15:00
            return cur < 899 ? 899 : null;   // → 14:59
        }

        // 非交易时间：跳至下一个交易时段开始前1分钟
        if (cur < 570) return 569;           // → 9:29（上午开盘前）
        if (cur < 695) return 694;           // → 11:34（夜猫开盘前）
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
        this.updatePortfolioRealTime();
        this.updateTradeAvailable();
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
        
        // 更新游戏时间
        this.updateGameTime();
        
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
                this.updatePortfolioRealTime();
                this.updateTradeAvailable();
            }
            return;
        }
        
        // 每20个周期切换一个交易日
        const isNewTradingDay = this.marketTickCount % 20 === 0;
        
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
            this.updatePortfolioRealTime();
            this.updateTradeAvailable();
        }
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
        const filterLower = filter.toLowerCase();
        const watchlist = this.currentSave ? this.currentSave.watchlist || [] : [];
        
        // 获取过滤后的股票列表
        let stocks = StockPool.filter(stock => {
            // 搜索过滤
            if (filter) {
                if (!stock.code.includes(filter) && !stock.name.includes(filter)) {
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
            const change = ((data.price - data.prevClose) / data.prevClose * 100).toFixed(2);
            const changeClass = change >= 0 ? 'up' : 'down';
            const changeSymbol = change >= 0 ? '+' : '';
            const activeClass = this.selectedStock && this.selectedStock.code === stock.code ? 'active' : '';
            const isWatched = watchlist.includes(stock.code);
            // P0-1 Fix: escape all user-controllable fields
            const stockName = escapeHtml(stock.name);
            const stockCode = escapeHtml(stock.code);
            const priceText = escapeHtml(data.price.toFixed(2));
            const changeText = escapeHtml(change);
            
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
        console.log('handleSortClick:', field, 'current:', this.stockSort);
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
        console.log('after:', this.stockSort);
        // 重新渲染列表，使用保存的搜索关键词
        this.renderStockList(this.stockSearch.keyword);
    }
    
    // 更新排序指示器
    updateSortIndicators() {
        console.log('updateSortIndicators:', this.stockSort);
        document.querySelectorAll('.stock-list-header .sortable').forEach(header => {
            const field = header.dataset.sort;
            const indicator = header.querySelector('.sort-indicator');
            console.log('header:', field, 'indicator:', indicator);
            
            if (this.stockSort.field === field) {
                header.classList.add('sorted');
                indicator.textContent = this.stockSort.order === 'asc' ? '▲' : '▼';
                console.log('set indicator for', field, 'to', this.stockSort.order);
            } else {
                header.classList.remove('sorted');
                indicator.textContent = '';
                console.log('clear indicator for', field);
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
        const change = ((data.price - data.prevClose) / data.prevClose * 100).toFixed(2);
        const changeClass = change >= 0 ? 'up' : 'down';
        const changeSymbol = change >= 0 ? '+' : '';

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
        
        // 更新交易界面价格字段
        const buyCode = document.getElementById('buy-code').value;
        const sellCode = document.getElementById('sell-code').value;
        
        if (buyCode === this.selectedStock.code) {
            const buyPriceEl = document.getElementById('buy-price');
            buyPriceEl.value = data.price.toFixed(2);
            this.updateTradeEstimate('buy');
        }
        
        if (sellCode === this.selectedStock.code) {
            const sellPriceEl = document.getElementById('sell-price');
            sellPriceEl.value = data.price.toFixed(2);
            this.updateTradeEstimate('sell');
        }
        
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
            console.log('Volume canvas not found');
            return;
        }
        
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            console.log('Volume canvas context not found');
            return;
        }
        
        const rect = canvas.parentElement.getBoundingClientRect();
        console.log('Volume container rect:', rect);
        
        if (rect.width === 0 || rect.height === 0) {
            console.log('Volume container has no size');
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
        
        console.log('Volume chart params:', { leftPadding, topPadding, rightPadding, bottomPadding, chartWidth, chartHeight });
        
        if (chartHeight <= 0) {
            console.log('Chart height is negative:', chartHeight);
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

        console.log('Volume data:', { volumes, maxVolume, visibleData: visibleData.length });
        
        visibleData.forEach((candle, i) => {
            const x = leftPadding + i * (chartWidth / visibleCount) + (chartWidth / visibleCount) / 2;
            const barHeight = (candle.volume / maxVolume) * chartHeight;
            const y = topPadding + chartHeight - barHeight;

            const isUp = candle.close >= candle.open;
            ctx.fillStyle = isUp ? 'rgba(255, 77, 79, 1)' : 'rgba(82, 196, 26, 1)';

            console.log('Drawing bar:', { x, y, barWidth, barHeight, volume: candle.volume });
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
                }
            }
        } else if (e.touches.length === 2) {
            e.preventDefault();
            const distance = this.getPinchDistance(e.touches);
            const scale = distance / this.chartState.pinchStartDistance;
            this.chartState.scaleX = Math.max(1, Math.min(10, 
                this.chartState.pinchStartScale * scale));
            
            if (this.selectedStock) {
                const data = this.stockData.get(this.selectedStock.code);
                this.drawKLine(data);
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
    onTradeCodeInput(code, type) {
        const stock = StockPool.find(s => s.code === code);
        const nameEl = document.getElementById(`${type}-name`);
        const priceEl = document.getElementById(`${type}-price`);

        if (stock && this.stockData.has(stock.code)) {
            nameEl.textContent = stock.name;
            const data = this.stockData.get(stock.code);
            priceEl.value = data.price.toFixed(2);
            this.updateTradeEstimate(type);
        } else {
            nameEl.textContent = '';
        }
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
        if (type === 'buy') {
            maxQuantity = Math.floor(this.currentSave.fund / price / this.currentSave.settings.tradeUnit) * this.currentSave.settings.tradeUnit;
        } else {
            const holding = this.currentSave.holdings[code];
            maxQuantity = holding ? holding.quantity : 0;
        }

        const quantity = Math.floor(maxQuantity * ratio / this.currentSave.settings.tradeUnit) * this.currentSave.settings.tradeUnit;
        document.getElementById(`${type}-quantity`).value = quantity > 0 ? quantity : '';
        this.updateTradeEstimate(type);
    }

    // 更新可用资金和持仓显示
    updateTradeAvailable() {
        if (!this.currentSave) return;
        
        document.getElementById('buy-available').textContent = `¥${this.formatMoney(this.currentSave.fund)}`;
        
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
            const pnlSymbol = pnl >= 0 ? '+' : '';
            // P0-1 Fix: escape all user-controllable fields
            const codeEsc = escapeHtml(code);
            const nameEsc = escapeHtml(holding.name);
            const pnlText = escapeHtml(this.formatMoney(pnl));

            html += `
                <div class="holding-item" data-code="${codeEsc}">
                    <div class="holding-info">
                        <div class="name">${nameEsc}</div>
                        <div class="code">${codeEsc}</div>
                    </div>
                    <div class="holding-qty">
                        <div class="qty">${escapeHtml(I18n.t('trade.shares', { quantity: holding.quantity }))}</div>
                        <div class="pnl ${pnlClass}">${pnlSymbol}¥${pnlText}</div>
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

    // 执行交易
    executeTrade(type) {
        // 获取交易参数
        const code = document.getElementById(`${type}-code`).value;
        const priceRaw = document.getElementById(`${type}-price`).value;
        const quantityRaw = document.getElementById(`${type}-quantity`).value;

        // P2-3 Fix: parse with explicit Number() and validate type/range BEFORE using the value.
        // parseFloat("3.7") silently becomes 3, parseInt("100abc") silently becomes 100, and
        // 1e9 is silently accepted. Reject non-integer/negative/huge values to avoid mis-trades.
        const price = Number(priceRaw);
        const quantity = Number(quantityRaw);
        if (typeof priceRaw !== 'string' || priceRaw.trim() === '' || !Number.isFinite(price) || price <= 0 || price > 1e7) {
            alert(I18n.t('trade.invalidPrice'));
            return;
        }
        if (typeof quantityRaw !== 'string' || quantityRaw.trim() === '' || !Number.isInteger(quantity) || quantity <= 0 || quantity > 1e9) {
            alert(I18n.t('trade.invalidQuantity'));
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
        const amount = price * quantity;
        const fee = type === 'buy' ? amount * this.currentSave.settings.buyFee : amount * this.currentSave.settings.sellFee;

        // 执行交易操作
        const tradeResult = type === 'buy' 
            ? this.executeBuyTrade(code, stock, price, quantity, amount, fee)
            : this.executeSellTrade(code, stock, price, quantity, amount, fee);

        if (!tradeResult.success) {
            alert(tradeResult.message);
            return;
        }

        // 记录交易
        this.recordTrade(type, code, stock, price, quantity, amount, fee, tradeResult.pnl);

        // 保存并更新UI
        this.saveUsers();
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

        // 验证价格与市场价格的合理性
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

            // 涨跌停价格校验（基于昨收价）
            if (type === 'buy' && price > limitUpPrice) {
                return { valid: false, message: I18n.t('trade.exceedLimitUp', { price: limitUpPrice.toFixed(2) }) };
            }
            if (type === 'sell' && price < limitDownPrice) {
                return { valid: false, message: I18n.t('trade.belowLimitDown', { price: limitDownPrice.toFixed(2) }) };
            }

            // 委托价与当前市价偏离度校验
            const deviation = Math.abs(price - marketPrice) / marketPrice;
            const lowerBound = marketPrice * (1 - MAX_PRICE_DEVIATION);
            const upperBound = marketPrice * (1 + MAX_PRICE_DEVIATION);

            if (deviation > MAX_PRICE_DEVIATION) {
                // 偏离超过20%：硬阻断
                return { valid: false, message: I18n.t('trade.priceDeviationExceeded', {
                    price: marketPrice.toFixed(2),
                    percent: (MAX_PRICE_DEVIATION * 100).toFixed(0),
                    lower: lowerBound.toFixed(2),
                    upper: upperBound.toFixed(2)
                }) };
            } else if (deviation > WARN_PRICE_DEVIATION) {
                // 偏离10%-20%：警示确认
                if (!confirm(I18n.t('trade.priceDeviationWarn', {
                    price: marketPrice.toFixed(2),
                    percent: (deviation * 100).toFixed(1)
                }))) {
                    return { valid: false, message: I18n.t('trade.cancelled') };
                }
            }
        }

        const stock = StockPool.find(s => s.code === code);
        if (!stock) {
            return { valid: false, message: I18n.t('trade.stockNotExist') };
        }

        return { valid: true, stock };
    }

    // 执行买入交易
    executeBuyTrade(code, stock, price, quantity, amount, fee) {
        const totalCost = amount + fee;
        if (totalCost > this.currentSave.fund) {
            return { success: false, message: I18n.t('trade.insufficientFund') };
        }

        // T+1检查
        if (!this.currentSave.settings.t0Mode) {
            const dayTrades = this.currentSave.dayTrades[code] || { buy: 0, sell: 0 };
            if (dayTrades.sell > 0) {
                return { success: false, message: I18n.t('trade.t1BuyBlocked') };
            }
        }

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

        // 更新统计
        this.currentSave.gameStats.tradeCount++;
        if (!(this.currentSave.gameStats.sectorsTraded instanceof Set)) {
            this.currentSave.gameStats.sectorsTraded = new Set();
        }
        this.currentSave.gameStats.sectorsTraded.add(stock.industry);
        const holdingCount = Object.keys(this.currentSave.holdings).length;
        if (holdingCount > this.currentSave.gameStats.maxHoldings) {
            this.currentSave.gameStats.maxHoldings = holdingCount;
        }

        return { success: true, pnl: 0 };
    }

    // 执行卖出交易
    executeSellTrade(code, stock, price, quantity, amount, fee) {
        const holding = this.currentSave.holdings[code];
        if (!holding || holding.quantity < quantity) {
            return { success: false, message: I18n.t('trade.insufficientHolding') };
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

        // P1-5 Fix: include sell fee in PnL so that achievements/stop-loss reflect realized profit
        // pnl = (sell price - avg cost) * qty - sell fee (in cents precision)
        const pnl = round2((price - holding.avgPrice) * quantity - fee);

        holding.quantity -= quantity;
        // P1-2 Fix: round remaining cost basis to cents
        holding.totalCost = round2(holding.avgPrice * holding.quantity);

        if (holding.quantity === 0) {
            delete this.currentSave.holdings[code];
        }

        // 记录当日卖出
        if (!this.currentSave.dayTrades[code]) {
            this.currentSave.dayTrades[code] = { buy: 0, sell: 0 };
        }
        this.currentSave.dayTrades[code].sell += quantity;

        // 更新统计
        this.currentSave.gameStats.tradeCount++;
        if (pnl > 0) {
            this.currentSave.gameStats.profitCount++;
        } else {
            this.currentSave.gameStats.lossCount++;
        }

        return { success: true, pnl };
    }

    // 记录交易
    recordTrade(type, code, stock, price, quantity, amount, fee, pnl) {
        // 使用游戏时间创建交易记录时间
        const gameDate = new Date();
        gameDate.setHours(this.gameTime.hour, this.gameTime.minute, 0, 0);
        
        this.currentSave.records.unshift({
            time: gameDate.getTime(),
            code,
            name: stock.name,
            type,
            price,
            quantity,
            amount: type === 'buy' ? -(amount + fee) : (amount - fee),
            pnl
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
            this.updateStockList();
        }, 0);

        // 清空两个表单
        ['buy', 'sell'].forEach(tradeType => {
            document.getElementById(`${tradeType}-code`).value = '';
            document.getElementById(`${tradeType}-name`).textContent = '';
            document.getElementById(`${tradeType}-price`).value = '';
            document.getElementById(`${tradeType}-quantity`).value = '';
            document.getElementById(`${tradeType}-estimate`).textContent = '--';
        });
    }

    // 更新持仓页面
    updatePortfolio() {
        if (!this.currentSave) return;

        let stockValue = 0;
        let totalCost = 0;

        // 计算持仓市值和成本
        Object.entries(this.currentSave.holdings).forEach(([code, holding]) => {
            const data = this.stockData.get(code);
            console.log(`持仓数据: ${code} - 成本价: ${holding.avgPrice}, 现价: ${data.price}, 数量: ${holding.quantity}, 总成本: ${holding.totalCost}`);
            stockValue += data.price * holding.quantity;
            totalCost += holding.totalCost;
        });

        const totalAssets = this.currentSave.fund + stockValue;
        const floatingPnl = stockValue - totalCost;
        const totalReturn = (totalAssets - this.currentSave.initialFund) / this.currentSave.initialFund;

        // 更新摘要
        document.getElementById('total-assets').textContent = `¥${this.formatMoney(totalAssets)}`;
        document.getElementById('stock-value').textContent = `¥${this.formatMoney(stockValue)}`;
        document.getElementById('available-fund').textContent = `¥${this.formatMoney(this.currentSave.fund)}`;
        document.getElementById('floating-pnl').textContent = `${floatingPnl >= 0 ? '+' : ''}¥${this.formatMoney(floatingPnl)}`;
        document.getElementById('floating-pnl').className = `value ${floatingPnl >= 0 ? 'up' : 'down'}`;
        document.getElementById('total-return').textContent = `${(totalReturn * 100).toFixed(2)}%`;
        document.getElementById('total-return').className = `value ${totalReturn >= 0 ? 'up' : 'down'}`;

        // 更新持仓明细
        const tbody = document.getElementById('portfolio-holdings-tbody');
        const holdings = Object.entries(this.currentSave.holdings);

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
                const avgText = escapeHtml(holding.avgPrice.toFixed(2));
                const priceText = escapeHtml(data.price.toFixed(2));
                const mvText = escapeHtml(this.formatMoney(marketValue));
                const pnlText = escapeHtml(this.formatMoney(pnl));
                const rateText = escapeHtml(pnlRate.toFixed(2));

                return `
                    <tr data-code="${codeEsc}" style="cursor: pointer; hover: background-color: rgba(88, 166, 255, 0.1);">
                        <td>${nameEsc}<br><small>${codeEsc}</small></td>
                        <td>${qtyEsc}</td>
                        <td>¥${avgText}</td>
                        <td>¥${priceText}</td>
                        <td>¥${mvText}</td>
                        <td class="${pnlClass}">${pnl >= 0 ? '+' : ''}¥${pnlText}</td>
                        <td class="${pnlClass}">${pnl >= 0 ? '+' : ''}${rateText}%</td>
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
                // P0-1 Fix: escape all user-controllable fields
                const dateText = escapeHtml(date.toLocaleString(I18n.getCurrentLanguage()));
                const recName = escapeHtml(record.name);
                const recCode = escapeHtml(record.code);
                const recPrice = escapeHtml(Number(record.price || 0).toFixed(2));
                const recQty = escapeHtml(String(record.quantity || 0));
                const recAmt = escapeHtml(this.formatMoney(Math.abs(record.amount || 0)));
                const typeText = escapeHtml(I18n.t(record.type === 'buy' ? 'common.buy' : 'common.sell'));
                return `
                    <tr>
                        <td>${dateText}</td>
                        <td>${recName}<br><small>${recCode}</small></td>
                        <td class="${typeClass}">${typeText}</td>
                        <td>¥${recPrice}</td>
                        <td>${recQty}</td>
                        <td>¥${recAmt}</td>
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
        const achievements = this.currentSave.achievements || [];

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
            // P0-1 Fix: escape achievement fields (icon, name, desc) when rendered as HTML
            return `
                <div class="achievement-card ${unlocked ? 'unlocked' : 'locked'}">
                    <div class="achievement-icon-small">${escapeHtml(ach.icon)}</div>
                    <div class="achievement-info">
                        <h4>${escapeHtml(AchievementSystem.getName(ach))}</h4>
                        <p>${escapeHtml(AchievementSystem.getDesc(ach))}</p>
                    </div>
                    <span class="achievement-level-badge ${escapeHtml(ach.level)}">${escapeHtml(AchievementSystem.getLevelName(ach.level))}</span>
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
        console.log('开始检查成就...');
        const stats = this.calculateSaveStats();
        const unlocked = this.currentSave.achievements || [];
        
        console.log(`当前已解锁成就: ${unlocked.length}个`);
        console.log('已解锁成就列表:', unlocked);
        
        const newAchievements = AchievementSystem.checkAchievements(stats, unlocked);
        
        console.log(`新解锁成就: ${newAchievements.length}个`);
        
        if (newAchievements.length > 0) {
            newAchievements.forEach(ach => {
                console.log(`解锁成就: ${ach.name} (${ach.id})`);
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
            
            console.log(`成就检查完成，共解锁 ${newAchievements.length} 个新成就`);
        } else {
            console.log('没有新成就解锁');
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

        // 计算当前存档的盈亏
        const pnl = (save.fund + this.calculateStockValue(save)) - save.initialFund;
        if (pnl > 0) totalProfit = pnl;
        else totalLoss = Math.abs(pnl);

        // 计算收益率
        const maxReturn = save.initialFund > 0 ? pnl / save.initialFund : 0;

        // 获取自选股数量
        const watchlistCount = save.watchlist?.length || 0;

        // 计算连续盈利次数
        let profitStreak = 0;
        let currentStreak = 0;
        const records = save.records || [];
        
        // 只统计卖出记录（买入记录的pnl为0，不影响连续盈利计算）
        const sellRecords = records.filter(record => record.type === 'sell');
        
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
        const allAchievementsUnlocked = unlockedAchievements.length >= allAchievements.length - 1; // 排除成就猎人本身

        // 计算总手续费
        let totalFees = 0;
        records.forEach(record => {
            const amount = record.price * record.quantity;
            const fee = record.type === 'buy' ? amount * (save.settings?.buyFee || 0.0003) : amount * (save.settings?.sellFee || 0.0013);
            totalFees += fee;
        });

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
        let roundNumberTrades = 0;
        let weekendTrades = 0;
        let earlyTrades = 0;
        let lateTrades = 0;
        let paperHands = 0;
        let allInTrades = 0;
        let yoYoTrades = 0;
        let palindromeProfit = false;
        let momentumTrades = 0;
        let currentMomentumStreak = 0;
        
        // 计算日内交易统计
        const dayTradeMap = new Map(); // 记录每天的股票交易次数
        
        records.forEach((record, index) => {
            const amount = record.price * record.quantity;
            if (amount >= 100000) largeTrades++;
            if (record.price === Math.floor(record.price)) roundNumberTrades++;
            
            // 梭哈选手：单笔交易使用90%以上资金
            if (record.type === 'buy' && Math.abs(record.amount) >= save.fund * 0.9) {
                allInTrades++;
            }
            
            // 使用涨跌停管理器计算涨停和跌停价格
            const stockData = this.stockData.get(record.code);
            if (stockData) {
                const limitUpPrice = this.limitManager.calculateLimitUpPrice(stockData.prevClose);
                const limitDownPrice = this.limitManager.calculateLimitDownPrice(stockData.prevClose);
                
                // FOMO患者：在涨停价买入
                if (record.type === 'buy' && this.limitManager.isLimitUp(record.price, stockData.prevClose)) {
                    fomoTrades++;
                }
                
                // 恐慌抛售：在跌停价卖出
                if (record.type === 'sell' && this.limitManager.isLimitDown(record.price, stockData.prevClose)) {
                    panicSells++;
                }
                
                // 幸运星：买入后股价立即涨停
                if (record.type === 'buy') {
                    // 检查后续价格是否达到涨停
                    const afterRecords = records.slice(index + 1).filter(r => r.code === record.code);
                    for (const afterRecord of afterRecords) {
                        if (this.limitManager.isLimitUp(afterRecord.price, stockData.prevClose)) {
                            luckyTrades++;
                            break;
                        }
                    }
                }
                
                // 倒霉蛋：买入后股价立即跌停
                if (record.type === 'buy') {
                    // 检查后续价格是否达到跌停
                    const afterRecords = records.slice(index + 1).filter(r => r.code === record.code);
                    for (const afterRecord of afterRecords) {
                        if (this.limitManager.isLimitDown(afterRecord.price, stockData.prevClose)) {
                            unluckyTrades++;
                            break;
                        }
                    }
                }
                
                // 趋势追逐者：连续追涨3只涨停股
                if (record.type === 'buy' && this.limitManager.isLimitUp(record.price, stockData.prevClose)) {
                    currentMomentumStreak++;
                    if (currentMomentumStreak >= 3) {
                        momentumTrades++;
                    }
                } else {
                    currentMomentumStreak = 0;
                }
            }
            
            // 周末战士：周五买入周一卖出
            const tradeDate = new Date(record.time);
            const dayOfWeek = tradeDate.getDay();
            if (record.type === 'buy' && dayOfWeek === 5) {
                // 检查是否有对应的周一卖出记录
                const hasMondaySell = records.some(r => 
                    r.type === 'sell' && 
                    r.code === record.code &&
                    new Date(r.time).getDay() === 1 &&
                    Math.abs(new Date(r.time).getTime() - record.time) < 3 * 24 * 60 * 60 * 1000
                );
                if (hasMondaySell) weekendTrades++;
            }
            
            // 早起的鸟儿：在开盘前5分钟完成交易
            const hours = tradeDate.getHours();
            const minutes = tradeDate.getMinutes();
            const totalMinutes = hours * 60 + minutes;
            if (totalMinutes >= 570 && totalMinutes <= 575) { // 9:30-9:35
                earlyTrades++;
            }
            
            // 夜猫子：在收盘前5分钟完成交易
            if (totalMinutes >= 695 && totalMinutes <= 700) { // 11:35-11:40
                lateTrades++;
            }
            
            // 摇摆不定：同一天内对同一只股票买卖3次以上
            const dateKey = tradeDate.toDateString();
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
            
            // 检查是否达到3次以上
            if (stockTrades.buy + stockTrades.sell >= 3) {
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
        
        // 纸手：卖出后股价立即上涨20%
        records.forEach((record, index) => {
            if (record.type === 'sell' && record.pnl < 0) {
                // 检查后续是否有该股票的价格记录
                const data = this.stockData.get(record.code);
                if (data && index > 0) {
                    const nextRecord = records[index - 1];
                    if (nextRecord && nextRecord.code === record.code) {
                        // 简化判断：如果卖出价格低于当前价格20%
                        if (data.price > record.price * 1.2) {
                            paperHands++;
                        }
                    }
                }
            }
        });

        const stats = {
            tradeCount,
            totalProfit,
            totalLoss,
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
            longHolds: save.gameStats?.longHolds || 0,
            yoYoTrades: yoYoTrades > 0,
            allInTrades: allInTrades > 0,
            comeback: save.gameStats?.comeback || false,
            diamondHands: save.gameStats?.diamondHands || false,
            paperHands: paperHands > 0,
            weekendTrades: weekendTrades > 0,
            palindromeProfit: palindromeProfit,
            crashSurvivor: save.gameStats?.crashSurvivor || false,
            contrarianTrades: save.gameStats?.contrarianTrades || 0,
            momentumTrades: save.gameStats?.momentumTrades || 0,
            technicalWins: save.gameStats?.technicalWins || 0,
            newsTrades: save.gameStats?.newsTrades || 0,
            earlyTrades: earlyTrades > 0,
            lateTrades: lateTrades > 0,
            beatMarket: save.gameStats?.beatMarket || false,
            perfectGame: save.gameStats?.perfectGame || false
        };

        // 添加日志记录
        console.log('成就统计数据:', stats);

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
        document.getElementById('achievement-name').textContent = AchievementSystem.getName(achievement);
        popup.classList.add('show');
        
        // 绑定查看按钮事件
        const viewBtn = document.getElementById('view-achievement-btn');
        viewBtn.onclick = () => {
            popup.classList.remove('show');
            this.switchTab('profile');
        };
        
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
            { text: I18n.t('tutorial.step6'), element: '.position-list', tab: 'position' },
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

                // 定位提示框 - 智能选择位置
                const tooltipWidth = 320;
                const tooltipHeight = 150;
                const padding = 20;
                
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
            } else if (totalMinutes >= 695 && totalMinutes <= 700) {
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
        
        const hour = parseInt(hourInput.value);
        const minute = parseInt(minuteInput.value);
        
        if (isNaN(hour) || isNaN(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
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
        const fund = parseFloat(document.getElementById('debug-fund').value);
        if (fund && fund > 0) {
            this.currentSave.fund = fund;
            this.saveUsers();
            this.updateTradeAvailable();
            this.updatePortfolio();
            alert(I18n.t('debug.fundModified'));
        }
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
        const lockedAchievements = allAchievements.filter(ach => !currentAchievements.includes(ach.id));

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
        this.initMarketData();
        alert(I18n.t('debug.marketReset'));
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
                dayTrades: 0
            };
            this.saveUsers();
            this.updateTradeAvailable();
            this.updatePortfolio();
            alert(I18n.t('debug.gameCleared'));
        }
    }

    // 导出/导入存档
    exportSave() {
        const data = Crypto.encrypt(JSON.stringify(this.currentUser));
        const blob = new Blob([data], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `stock_simulator_backup_${this.currentUser.username}_${Date.now()}.txt`;
        a.click();
        URL.revokeObjectURL(url);
    }

    importSave() {
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
            reader.onload = (event) => {
                try {
                    const decrypted = Crypto.decrypt(event.target.result);
                    if (typeof decrypted !== 'string') throw new Error('Decryption failed');
                    const rawData = JSON.parse(decrypted);

                    // P0-1 Fix: schema-validate the imported payload to reject malicious/oversized structures
                    const userData = sanitizeUserData(rawData);
                    // P0-1 Fix: also sanitize each save (length-bounded, type-checked)
                    userData.saves = userData.saves.map(s => sanitizeSaveData(s));

                    const existing = this.users[userData.username];
                    // P2-4 Fix: when the username already exists, offer a non-destructive merge path
                    // (Replace or Cancel). Default to Replace only if user explicitly confirms.
                    if (existing) {
                        const choice = prompt(
                            I18n.t('notification.importConflict', { username: userData.username }),
                            'replace'
                        );
                        if (choice === null) return; // cancelled
                        const normalized = String(choice).trim().toLowerCase();
                        if (normalized !== 'replace' && normalized !== 'merge') {
                            return;
                        }
                        if (normalized === 'merge') {
                            // Merge: combine saves (skip dup ids), keep local achievements/themes
                            const existingSaves = new Set(existing.saves.map(s => s.id));
                            userData.saves = [...existing.saves, ...userData.saves.filter(s => !existingSaves.has(s.id))];
                            userData.saves = userData.saves.slice(0, 50);
                            // Preserve local user preferences when merging
                            userData.theme = existing.theme || userData.theme;
                            userData.refreshRate = existing.refreshRate || userData.refreshRate;
                            userData.lang = existing.lang || userData.lang;
                            userData.tutorialCompleted = existing.tutorialCompleted || userData.tutorialCompleted;
                        }
                    }

                    // P2-4 Fix: confirm before applying the (possibly destructive) import
                    const displayName = String(userData.username).replace(/[<>&"']/g, '');
                    if (!confirm(I18n.t('notification.importConfirm', { username: displayName }))) {
                        return;
                    }

                    this.users[userData.username] = userData;
                    this.saveUsers();
                    this.currentUser = userData;

                    // 恢复导入存档的主题偏好（不触发保存）
                    const savedTheme = this.currentUser.theme || 'dark';
                    document.body.className = savedTheme === 'light' ? 'light-theme' : savedTheme === 'festival' ? 'festival-theme' : '';
                    const themeToggle = document.getElementById('theme-toggle');
                    if (themeToggle) {
                        themeToggle.textContent = savedTheme === 'light' ? '☀️' : savedTheme === 'festival' ? '🎉' : '🌙';
                    }

                    // 恢复导入存档的语言偏好
                    if (this.currentUser.lang) {
                        I18n.setLanguage(this.currentUser.lang, true);
                    }

                    this.showSaveSelect();
                    alert(I18n.t('notification.importSuccess'));
                } catch (err) {
                    // P0-1 Fix: do not leak error details to console for user-controlled input
                    alert(I18n.t('notification.importFailed'));
                }
            };
            reader.readAsText(file);
        };
        input.click();
    }

    // 工具函数（支持国际化的金额格式化）
    formatMoney(amount) {
        if (window.I18n && I18n.getCurrentLanguage() === 'en-US') {
            // 英文：使用 K/M/B 体系
            if (Math.abs(amount) >= 1000000000) {
                return (amount / 1000000000).toFixed(2) + 'B';
            } else if (Math.abs(amount) >= 1000000) {
                return (amount / 1000000).toFixed(2) + 'M';
            } else if (Math.abs(amount) >= 1000) {
                return (amount / 1000).toFixed(2) + 'K';
            }
            return amount.toFixed(2);
        } else {
            // 中文：使用 万/亿 体系
            if (Math.abs(amount) >= 100000000) {
                return (amount / 100000000).toFixed(2) + '亿';
            } else if (Math.abs(amount) >= 10000) {
                return (amount / 10000).toFixed(2) + '万';
            }
            return amount.toFixed(2);
        }
    }

    showScreen(screenId) {
        console.log('showScreen被调用:', screenId);
        // 安全检查：如果用户未登录，只允许访问认证相关页面
        const protectedScreens = ['main-screen', 'save-select-screen', 'game-setup-screen'];
        if (protectedScreens.includes(screenId) && !this.currentUser) {
            console.warn('尝试在未登录状态下访问受保护页面:', screenId);
            screenId = 'auth-screen';
        }
        
        console.log('切换屏幕到:', screenId);
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        const targetScreen = document.getElementById(screenId);
        console.log('目标屏幕元素:', targetScreen);
        if (targetScreen) {
            targetScreen.classList.add('active');
            console.log('屏幕切换成功');
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
            if (!profitTip) {
                const tipDiv = document.createElement('div');
                tipDiv.id = 'profit-tip';
                tipDiv.className = 'form-tip';
                tipDiv.textContent = I18n.t('auto.profitTip');
                conditionTypeSelect.parentNode.appendChild(tipDiv);
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
        const code = document.getElementById('auto-code').value;
        const direction = document.querySelector('input[name="auto-direction"]:checked').value;
        
        if (!code) return;
        
        const stock = StockPool.find(s => s.code === code);
        if (!stock) return;
        
        let maxQuantity = 0;
        if (direction === 'buy') {
            const data = this.stockData.get(code);
            if (!data) return;
            const price = data.price;
            maxQuantity = Math.floor(this.currentSave.fund / price / this.currentSave.settings.tradeUnit) * this.currentSave.settings.tradeUnit;
        } else {
            const holding = this.currentSave.holdings[code];
            maxQuantity = holding ? holding.quantity : 0;
        }
        
        const quantity = Math.floor(maxQuantity * ratio / this.currentSave.settings.tradeUnit) * this.currentSave.settings.tradeUnit;
        document.getElementById('auto-quantity').value = quantity > 0 ? quantity : '';
    }

    // 添加自动交易股票
    addAutoTradeStock() {
        const code = document.getElementById('auto-code').value;
        const direction = document.querySelector('input[name="auto-direction"]:checked').value;
        const conditionType = document.getElementById('auto-condition-type').value;
        const conditionOperator = document.getElementById('auto-condition-operator').value;
        const conditionValue = parseFloat(document.getElementById('auto-condition-value').value);
        const quantity = parseInt(document.getElementById('auto-quantity').value);
        const priceType = document.getElementById('auto-price-type').value;
        const limitPrice = parseFloat(document.getElementById('auto-limit-price').value);
        const stopLoss = parseFloat(document.getElementById('auto-stop-loss').value);
        const takeProfit = parseFloat(document.getElementById('auto-take-profit').value);
        const maxTrades = parseInt(document.getElementById('auto-max-trades').value);
        const maxAmount = parseFloat(document.getElementById('auto-max-amount').value);

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

        if (!quantity || quantity <= 0) {
            alert(I18n.t('auto.invalidQuantity'));
            return;
        }

        // 时间间隔模式不需要条件值
        if (conditionType !== 'time' && isNaN(conditionValue)) {
            alert(I18n.t('auto.requireConditionValue'));
            return;
        }

        // 盈利目标模式只支持卖出操作
        if (conditionType === 'profit' && direction !== 'sell') {
            alert(I18n.t('auto.profitOnlyForSell'));
            return;
        }

        if (priceType === 'limit' && isNaN(limitPrice)) {
            alert(I18n.t('auto.requireLimitPrice'));
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
            limitPrice: priceType === 'limit' ? limitPrice : 0,
            stopLoss: isNaN(stopLoss) ? 0 : stopLoss,
            takeProfit: isNaN(takeProfit) ? 0 : takeProfit,
            maxTrades: isNaN(maxTrades) ? 0 : maxTrades,
            maxAmount: isNaN(maxAmount) ? 0 : maxAmount,
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
        document.getElementById('auto-max-trades').value = '';
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
        document.getElementById('auto-max-trades').value = config.maxTrades || '';
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
        
        // 保存配置到当前存档
        this.currentSave.autoTrade = {
            enabled: this.autoTrade.enabled,
            paused: this.autoTrade.paused,
            configs: this.autoTrade.configs,
            stats: this.autoTrade.stats,
            records: this.autoTrade.records,
            stockTradeCounts: this.autoTrade.stockTradeCounts
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
        this.autoTrade.stockTradeCounts = {};
        this.autoTrade.lastTradeTimes = {};
        
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
        this.autoTrade.stockTradeCounts = {};
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
            records: []
        };
        
        // 同步到用户数据
        this.currentUser.saves[this.currentSaveIndex] = this.currentSave;
        this.saveUsers();
        
        // 更新界面
        this.renderAutoTradeStockList();
        this.updateAutoTradeControlButtons();
        
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
        this.autoTrade.lastTradeTimes = {};  // 重置上次交易时间
        this.autoTrade.stockTradeCounts = {};  // 重置交易次数计数器
        this.autoTrade.interval = setInterval(() => this.checkAutoTradeCondition(), this.refreshRate);
        
        // 保存自动交易状态到存档
        if (this.currentSave) {
            this.currentSave.autoTrade = {
                enabled: true,
                paused: false,
                configs: this.autoTrade.configs,
                stats: this.autoTrade.stats,
                records: this.autoTrade.records,
                stockTradeCounts: this.autoTrade.stockTradeCounts
            };
            this.saveUsers();
        }
        
        this.updateAutoTradeStatus();
        this.showNotification(I18n.t('auto.started', { count: this.autoTrade.configs.length }));
    }

    pauseAutoTrade() {
        if (!this.autoTrade.enabled) return;
        
        this.autoTrade.paused = !this.autoTrade.paused;
        
        // 如果从暂停恢复，重置交易次数计数器并重新启动定时器
        if (!this.autoTrade.paused) {
            this.autoTrade.lastTradeTimes = {};
            this.autoTrade.stockTradeCounts = {};  // 重置交易次数计数器
            
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
                    stockTradeCounts: this.autoTrade.stockTradeCounts
                };
            } else {
                this.currentSave.autoTrade.paused = this.autoTrade.paused;
                this.currentSave.autoTrade.stockTradeCounts = this.autoTrade.stockTradeCounts;
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
        this.autoTrade.lastTradeTimes = {};
        this.autoTrade.stockTradeCounts = {};  // 重置交易次数计数器
        
        // 保存自动交易状态到存档（保留配置）
        this.saveAutoTradeState();
        
        this.updateAutoTradeStatus();
        this.showNotification(I18n.t('auto.stopped'));
    }

    checkAutoTradeCondition() {
        if (!this.autoTrade.enabled || this.autoTrade.paused || this.autoTrade.configs.length === 0) {
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
                            console.log(`盈利目标检查: ${config.name}(${config.code}), 当前价格: ${currentPrice}, 买入均价: ${holding.avgPrice}, 持仓数量: ${holding.quantity}, 盈亏金额: ${pnlAmount.toFixed(2)}, 触发条件: ${config.conditionOperator} ${config.conditionValue}元, shouldTrade初始值: ${shouldTrade}`);
                            if (config.conditionOperator === 'above' && pnlAmount >= config.conditionValue) {
                                shouldTrade = true;
                                console.log(`盈利目标触发: ${config.name} 盈亏金额${pnlAmount.toFixed(2)}元 >= ${config.conditionValue}元，触发卖出`);
                            }
                            else if (config.conditionOperator === 'below' && pnlAmount <= -config.conditionValue) {
                                shouldTrade = true;
                                console.log(`盈利目标触发: ${config.name} 盈亏金额${pnlAmount.toFixed(2)}元 <= -${config.conditionValue}元，触发卖出`);
                            }
                        } else {
                            console.log(`盈利目标检查失败: ${config.name} 没有持仓数据`);
                        }
                    } else {
                        console.log(`盈利目标检查跳过: ${config.name} 交易方向不是卖出`);
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
                    console.log(`止损止盈检查: ${config.name}, 当前盈亏金额=${pnlAmount.toFixed(2)}元, 止损设置=${config.stopLoss}元, 止盈设置=${config.takeProfit}元`);
                    
                    // 检查止损（支持正负数输入）
                    if (config.stopLoss !== 0) {
                        // 统一转换为正数阈值进行比较
                        const stopLossThreshold = Math.abs(config.stopLoss);
                        if (pnlAmount <= -stopLossThreshold) {
                            console.log(`止损触发: ${config.name} 亏损金额${pnlAmount.toFixed(2)}元 >= ${stopLossThreshold}元，触发卖出`);
                            shouldTrade = true;
                        }
                    }
                    
                    // 检查止盈
                    if (config.takeProfit > 0 && pnlAmount >= config.takeProfit) {
                        console.log(`止盈触发: ${config.name} 盈利金额${pnlAmount.toFixed(2)}元 >= ${config.takeProfit}元，触发卖出`);
                        shouldTrade = true;
                    }
                } else {
                    console.log(`止损止盈检查跳过: ${config.name} 没有持仓数据`);
                }
            } else if (config.direction === 'sell') {
                console.log(`止损止盈检查跳过: ${config.name} 已有基础触发条件或不是卖出操作, shouldTrade=${shouldTrade}`);
            }

            if (shouldTrade) {
                this.executeAutoTrade(config);
            }
        });
    }

    executeAutoTrade(config) {
        console.log(`executeAutoTrade开始执行: ${config.name}(${config.code}), 方向: ${config.direction}, 条件类型: ${config.conditionType}`);
        
        // 更新该股票的上次交易时间
        const tradeKey = config.code + '-' + config.direction;
        this.autoTrade.lastTradeTimes[tradeKey] = Date.now();
        
        // 检查该股票的最大交易次数
        const stockTradeKey = config.code + '-' + config.direction;
        const stockTradeCount = this.autoTrade.stockTradeCounts[stockTradeKey] || 0;
        
        if (config.maxTrades && stockTradeCount >= config.maxTrades) {
            console.log(`交易失败: ${config.name} 已达到最大交易次数 ${config.maxTrades}`);
            this.addAutoTradeRecord(false, 0, `已达到最大交易次数 ${config.maxTrades}`, 0, config);
            return;
        }

        const data = this.stockData.get(config.code);
        if (!data) {
            console.log(`交易失败: 无法获取股票数据 ${config.code}`);
            this.addAutoTradeRecord(false, 0, I18n.t('auto.noStockData'), 0, config);
            return;
        }

        const price = config.priceType === 'market' ? data.price : config.limitPrice;
        const amount = price * config.quantity;
        const fee = config.direction === 'buy'
            ? amount * this.currentSave.settings.buyFee
            : amount * this.currentSave.settings.sellFee;

        console.log(`交易详情: 价格=${price}, 数量=${config.quantity}, 金额=${amount.toFixed(2)}, 手续费=${fee.toFixed(2)}`);

        // 检查价格有效性
        if (price <= 0) {
            console.log(`交易失败: 价格无效 ${price}`);
            this.addAutoTradeRecord(false, 0, I18n.t('auto.invalidPrice'), 0, config);
            return;
        }

        // 数量有效性
        if (config.quantity <= 0) {
            console.log(`交易失败: 数量无效 ${config.quantity}`);
            this.addAutoTradeRecord(false, 0, I18n.t('auto.invalidQuantityMsg'), 0, config);
            return;
        }

        // 熔断状态检查
        if (this.limitManager.isCircuitBreakerActive(config.code)) {
            console.log(`交易失败: ${config.name} 处于熔断状态`);
            this.addAutoTradeRecord(false, 0, I18n.t('auto.circuitBreakerActive'), 0, config);
            return;
        }

        // 涨跌停价格校验
        const limitUpPrice = this.limitManager.calculateLimitUpPrice(data.prevClose);
        const limitDownPrice = this.limitManager.calculateLimitDownPrice(data.prevClose);
        if (config.direction === 'buy' && price > limitUpPrice) {
            console.log(`交易失败: 买入价 ${price} 超过涨停价 ${limitUpPrice.toFixed(2)}`);
            this.addAutoTradeRecord(false, 0, I18n.t('auto.buyExceedLimitUp', { price: limitUpPrice.toFixed(2) }), 0, config);
            return;
        }
        if (config.direction === 'sell' && price < limitDownPrice) {
            console.log(`交易失败: 卖出价 ${price} 低于跌停价 ${limitDownPrice.toFixed(2)}`);
            this.addAutoTradeRecord(false, 0, I18n.t('auto.sellBelowLimitDown', { price: limitDownPrice.toFixed(2) }), 0, config);
            return;
        }

        // 委托价与市价偏离度校验
        const MAX_PRICE_DEVIATION = 0.20;
        const lowerBound = data.price * (1 - MAX_PRICE_DEVIATION);
        const upperBound = data.price * (1 + MAX_PRICE_DEVIATION);
        if (price < lowerBound || price > upperBound) {
            console.log(`交易失败: 委托价 ${price} 与市价 ${data.price.toFixed(2)} 偏离超过${MAX_PRICE_DEVIATION * 100}%`);
            this.addAutoTradeRecord(false, 0, I18n.t('auto.priceDeviationExceeded', { percent: MAX_PRICE_DEVIATION * 100 }), 0, config);
            return;
        }

        if (config.maxAmount && amount > config.maxAmount) {
            console.log(`交易失败: 超过单次最大金额限制 ${config.maxAmount}`);
            this.addAutoTradeRecord(false, 0, I18n.t('auto.exceedMaxAmount'), 0, config);
            return;
        }

        // 检查全局交易次数限制
        const totalTrades = this.autoTrade.stats.totalTrades || 0;
        const maxTotal = this.autoTrade.maxTotalTrades || 100;
        if (totalTrades >= maxTotal) {
            console.log(`交易失败: 超过全局最大交易次数限制 ${maxTotal}`);
            this.addAutoTradeRecord(false, 0, I18n.t('auto.exceedMaxTotalTrades', { max: maxTotal }), 0, config);
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

            if (!this.currentSave.settings.t0Mode) {
                const dayTrades = this.currentSave.dayTrades[config.code] || { buy: 0, sell: 0 };
                if (dayTrades.sell > 0) {
                    this.addAutoTradeRecord(false, 0, I18n.t('auto.t1Blocked'), 0, config);
                    return;
                }
            }

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

            // 增加该股票的交易次数
            const stockTradeKey = config.code + '-' + config.direction;
            this.autoTrade.stockTradeCounts[stockTradeKey] = (this.autoTrade.stockTradeCounts[stockTradeKey] || 0) + 1;

            this.currentSave.gameStats.tradeCount++;
            if (!(this.currentSave.gameStats.sectorsTraded instanceof Set)) {
                this.currentSave.gameStats.sectorsTraded = new Set();
            }
            // P0-2 Fix: use cached Map instead of O(n) find for every auto-trade tick
            const stock = this._stockPoolByCode && this._stockPoolByCode.get(config.code);
            if (stock) this.currentSave.gameStats.sectorsTraded.add(stock.industry);

        } else {
            console.log(`执行卖出操作: ${config.name}(${config.code})`);
            holding = this.currentSave.holdings[config.code];
            console.log(`持仓检查: holding=${JSON.stringify(holding)}, 需要卖出数量=${config.quantity}`);
            
            if (!holding || holding.quantity < config.quantity) {
                console.log(`卖出失败: 持仓不足, 当前持仓=${holding?.quantity || 0}, 需要卖出=${config.quantity}`);
                this.addAutoTradeRecord(false, 0, I18n.t('auto.insufficientHolding'), 0, config);
                return;
            }

            if (!this.currentSave.settings.t0Mode) {
                const dayTrades = this.currentSave.dayTrades[config.code] || { buy: 0, sell: 0 };
                const availableQty = holding.quantity - dayTrades.buy;
                console.log(`T+1检查: 总持仓=${holding.quantity}, 当日买入=${dayTrades.buy}, 可卖数量=${availableQty}`);
                if (config.quantity > availableQty) {
                    console.log(`卖出失败: T+1规则限制, 可卖数量=${availableQty}, 需要卖出=${config.quantity}`);
                    this.addAutoTradeRecord(false, 0, I18n.t('auto.t1Blocked'), 0, config);
                    return;
                }
            }

            const totalIncome = amount - fee;
            // P1-2 Fix: round money to cents
            this.currentSave.fund = round2(this.currentSave.fund + totalIncome);

            // P1-5 Fix: include sell fee in PnL (consistent with manual sell)
            pnl = round2((price - holding.avgPrice) * config.quantity - fee);

            holding.quantity -= config.quantity;
            // P1-2 Fix: round remaining cost basis to cents
            holding.totalCost = round2(holding.avgPrice * holding.quantity);

            if (holding.quantity === 0) {
                delete this.currentSave.holdings[config.code];
                console.log(`持仓清零: ${config.name} 已从持仓列表中移除`);
            }

            if (!this.currentSave.dayTrades[config.code]) {
                this.currentSave.dayTrades[config.code] = { buy: 0, sell: 0 };
            }
            this.currentSave.dayTrades[config.code].sell += config.quantity;

            this.addAutoTradeRecord(true, totalIncome, I18n.t('auto.sellSuccess'), pnl, config, holding, price);
            
            // 增加该股票的交易次数
            const stockTradeKey = config.code + '-' + config.direction;
            this.autoTrade.stockTradeCounts[stockTradeKey] = (this.autoTrade.stockTradeCounts[stockTradeKey] || 0) + 1;
            
            this.currentSave.gameStats.tradeCount++;
            if (pnl > 0) {
                this.currentSave.gameStats.profitCount++;
            } else {
                this.currentSave.gameStats.lossCount++;
            }
        }

        this.currentSave.records.unshift({
            time: Date.now(),
            code: config.code,
            name: config.name,
            type: config.direction,
            price,
            quantity: config.quantity,
            amount: config.direction === 'buy' ? -(amount + fee) : (amount - fee),
            pnl: config.direction === 'sell' ? pnl : 0
        });

        if (this.currentSave.records.length > 100) {
            this.currentSave.records = this.currentSave.records.slice(0, 100);
        }

        this.saveUsers();
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

        this.autoTrade.stats.totalTrades++;
        
        if (success) {
            this.autoTrade.stats.successTrades++;
            this.autoTrade.stats.totalPnl += pnl;
        } else {
            this.autoTrade.stats.failedTrades++;
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
        totalPnlEl.textContent = `${this.autoTrade.stats.totalPnl >= 0 ? '+' : ''}¥${this.formatMoney(this.autoTrade.stats.totalPnl)}`;
        totalPnlEl.className = `stat-value ${this.autoTrade.stats.totalPnl >= 0 ? 'up' : 'down'}`;

        const recordsList = document.getElementById('auto-trade-records-list');
        
        if (this.autoTrade.records.length === 0) {
            recordsList.innerHTML = `<p style="text-align:center;color:var(--text-secondary);padding:20px;">${escapeHtml(I18n.t('auto.noRecords'))}</p>`;
        } else {
            recordsList.innerHTML = this.autoTrade.records.map(record => {
                const date = new Date(record.time);
                const pnlClass = record.pnl >= 0 ? 'up' : 'down';
                const pnlSymbol = record.pnl >= 0 ? '+' : '';
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
                        ${escapeHtml(I18n.t('auto.buyPriceLabel'))}: ¥${escapeHtml(Number(record.buyPrice).toFixed(2))} | ${escapeHtml(I18n.t('auto.sellPriceLabel'))}: ¥${escapeHtml(Number(record.sellPrice).toFixed(2))} | ${escapeHtml(I18n.t('auto.pnlLabel'))}: ${pnlSymbol}${escapeHtml(String(record.pnlPercent || 0))}%
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

                const amountText = record.pnl !== 0 ? `${pnlSymbol}¥${escapeHtml(this.formatMoney(record.pnl))}` : '--';
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
