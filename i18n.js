/**
 * 国际化（i18n）核心模块
 *
 * 功能：
 *   1. 提供 t(key, params) 翻译函数，支持 {placeholder} 参数插值
 *   2. 管理 currentLanguage 状态，支持 setLanguage(lang) 即时切换
 *   3. 持久化语言偏好到 localStorage（未登录时使用）
 *   4. applyToDOM() 批量刷新页面所有 data-i18n / data-i18n-placeholder / data-i18n-title 节点
 *   5. 提供 onChange(callback) 注册语言变更回调（供动态生成的 DOM 重新渲染）
 *
 * DOM 标记约定：
 *   - data-i18n="key"               → 设置 textContent
 *   - data-i18n-placeholder="key"   → 设置 placeholder
 *   - data-i18n-title="key"         → 设置 title
 *   - data-i18n-html="key"          → 设置 innerHTML（用于含 <br> 等标签的文本）
 *
 * 兼容性：纯原生 JS，无依赖，符合项目原生 ES6+ 风格
 */
class I18nManager {
    constructor() {
        // 支持的语言列表
        this.locales = {
            'zh-CN': () => window.ZH_CN,
            'en-US': () => window.EN_US,
        };

        // 当前语言（默认中文）
        this.currentLanguage = 'zh-CN';

        // 当前语言资源对象（缓存）
        this.currentMessages = {};

        // localStorage 存储 key
        this.storageKey = 'stock_simulator_lang';

        // 语言变更回调列表（用于触发动态内容重新渲染）
        this.changeCallbacks = [];

        // 回退语言（找不到 key 时使用）
        this.fallbackLanguage = 'zh-CN';
    }

    /**
     * 初始化：从 localStorage 读取上次语言偏好
     * 必须在资源文件加载完成后调用
     */
    init() {
        const saved = this.getSavedLanguage();
        if (saved && this.locales[saved]) {
            this.setLanguageInternal(saved, false);
        } else {
            // 默认中文
            this.setLanguageInternal('zh-CN', false);
        }
    }

    /**
     * 获取 localStorage 中保存的语言
     * @returns {string|null}
     */
    getSavedLanguage() {
        return localStorage.getItem(this.storageKey);
    }

    /**
     * 设置当前语言（内部实现，不触发回调与持久化）
     * @param {string} lang - 语言代码 'zh-CN' / 'en-US'
     * @param {boolean} persist - 是否持久化到 localStorage
     */
    setLanguageInternal(lang, persist = true) {
        if (!this.locales[lang]) {
            console.warn(`[I18n] Unsupported language: ${lang}, fallback to ${this.fallbackLanguage}`);
            lang = this.fallbackLanguage;
        }

        this.currentLanguage = lang;
        this.currentMessages = this.locales[lang]() || {};

        if (persist) {
            // P2-8 Fix: storage may be disabled or full; a failed language-preference
            // write must not abort the language switch itself.
            try {
                localStorage.setItem(this.storageKey, lang);
            } catch (e) {
                console.warn('[I18n] 无法保存语言偏好:', e);
            }
        }

        // 同步 <html lang="..."> 属性
        document.documentElement.lang = lang;
    }

    /**
     * 设置当前语言并应用全页刷新
     * @param {string} lang - 语言代码 'zh-CN' / 'en-US'
     * @param {boolean} applyDOM - 是否立即刷新 DOM（默认 true）
     */
    setLanguage(lang, applyDOM = true) {
        const oldLang = this.currentLanguage;
        if (oldLang === lang) return;

        this.setLanguageInternal(lang, true);

        if (applyDOM) {
            this.applyToDOM();
        }

        // 触发所有注册的回调（让 game.js 等模块重新渲染动态内容）
        this.changeCallbacks.forEach(cb => {
            try {
                cb(lang, oldLang);
            } catch (e) {
                console.error('[I18n] Language change callback error:', e);
            }
        });
    }

    /**
     * 翻译函数
     * @param {string} key - 资源 key，如 'auth.login'
     * @param {Object} params - 插值参数，如 { name: '张三', count: 5 }
     * @returns {string} 翻译后的字符串；找不到时返回 key 本身
     */
    t(key, params = null) {
        let text = this.currentMessages[key];

        if (text === undefined) {
            // 回退到 fallback 语言
            const fallbackMessages = this.locales[this.fallbackLanguage]() || {};
            text = fallbackMessages[key];
        }

        if (text === undefined) {
            console.warn(`[I18n] Missing translation: ${key}`);
            return key;
        }

        // 参数插值：替换 {name} 形式的占位符
        if (params && typeof text === 'string') {
            text = text.replace(/\{(\w+)\}/g, (match, paramName) => {
                return params[paramName] !== undefined ? String(params[paramName]) : match;
            });
        }

        return text;
    }

    /**
     * 注册语言变更回调
     * @param {Function} callback - (newLang, oldLang) => void
     * @returns {Function} 取消注册函数
     */
    onChange(callback) {
        this.changeCallbacks.push(callback);
        return () => {
            const idx = this.changeCallbacks.indexOf(callback);
            if (idx > -1) this.changeCallbacks.splice(idx, 1);
        };
    }

    /**
     * 批量刷新 DOM 中所有标记了 data-i18n* 属性的节点
     * 在初始化和语言切换后调用
     */
    applyToDOM() {
        // Bug fix (#18): the <title> stayed Chinese in English mode. There is no element
        // to tag, so sync it from the same app.title key used by the header logo.
        try {
            document.title = this.t('app.title');
        } catch (e) {
            // title is cosmetic; never let it break the language switch
        }

        // 1. data-i18n: 设置 textContent
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            el.textContent = this.t(key);
        });

        // 2. data-i18n-placeholder: 设置 placeholder
        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            const key = el.getAttribute('data-i18n-placeholder');
            el.setAttribute('placeholder', this.t(key));
        });

        // 3. data-i18n-title: 设置 title
        document.querySelectorAll('[data-i18n-title]').forEach(el => {
            const key = el.getAttribute('data-i18n-title');
            el.setAttribute('title', this.t(key));
        });

        // 3b. data-i18n-aria-label: 设置 aria-label（无障碍标签，L15 Fix）
        document.querySelectorAll('[data-i18n-aria-label]').forEach(el => {
            const key = el.getAttribute('data-i18n-aria-label');
            el.setAttribute('aria-label', this.t(key));
        });

        // 4. data-i18n-html: 设置 innerHTML
        document.querySelectorAll('[data-i18n-html]').forEach(el => {
            const key = el.getAttribute('data-i18n-html');
            el.innerHTML = this.t(key);
        });
    }

    /**
     * 获取当前语言代码
     * @returns {string}
     */
    getCurrentLanguage() {
        return this.currentLanguage;
    }

    /**
     * 判断当前是否为中文
     * @returns {boolean}
     */
    isChinese() {
        return this.currentLanguage === 'zh-CN';
    }

    /**
     * 切换语言（中英文互切，便捷方法）
     */
    toggleLanguage() {
        this.setLanguage(this.currentLanguage === 'zh-CN' ? 'en-US' : 'zh-CN');
    }
}

// 创建全局单例（注意：类名使用 I18nManager 避免与 window.I18n 实例名冲突）
window.I18n = new I18nManager();
