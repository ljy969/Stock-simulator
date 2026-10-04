<p align="right">
  <a href="README.md">
    <img src="https://img.shields.io/badge/Language-中文-red?style=for-the-badge" alt="Chinese README" />
  </a>
</p>

# Stock Simulator

A pure-entertainment, zero-stress Chinese A-share stock trading simulator platform. All data is generated and stored locally inside your browser without connecting to real market APIs. Users can learn trading rules, experience market fluctuations, and test strategies in a risk-free environment.

> Version: v2.13.2
> Updated: 2026-10

---
<div align="center">
  <a href="https://www.bilibili.com/video/BV1sWNwzVEek/" target="_blank">
    <img src="./images/cover-en.png" width="600" alt="全新股票模拟器演示视频">
  </a>
  <p>📺 <b><a href="https://www.bilibili.com/video/BV1sWNwzVEek/" target="_blank">Click here to watch the full demonstration video on Bilibili.</a></b></p>
  <p>▶️ <b><a href="https://youtu.be/SESTTuLqTi4?si=GlUPLyUWA1FDomzB" target="_blank">Click here to watch the full demonstration video on YouTube.</a></b></p>
</div>

---

## Table of Contents

- [Project Overview](#project-overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Quick Start](#quick-start)
- [Core Features Detailed](#core-features-detailed)
  - [User System](#user-system)
  - [Save System](#save-system)
  - [Market Simulation System](#market-simulation-system)
  - [Trading System](#trading-system)
  - [Automated Trading System](#automated-trading-system)
  - [Achievement System](#achievement-system)
  - [Time Control System](#time-control-system)
  - [K-Line Charting System](#k-line-charting-system)
  - [Debug Panel](#debug-panel)
  - [Themes & UI](#themes--ui)
  - [Internationalization (i18n)](#internationalization-i18n)
  - [Beginner Tutorial](#beginner-tutorial)
  - [Data Security & Backup](#data-security--backup)
- [Trading Rules](#trading-rules)
- [UI Navigation Guide](#ui-navigation-guide)
- [Frequently Asked Questions](#frequently-asked-questions)
- [Changelog](#changelog)
- [Developer Information](#developer-information)
- [Future Roadmap](#future-roadmap)
- [Contact & Credits](#contact--credits)
- [Contributing](#contributing)
- [License](#license)
- [Star History](#star-history)

---

## Project Overview

Stock Simulator is a zero-dependency web application built purely with frontend web technologies (HTML5 + CSS3 + JavaScript). No backend server or database is required—simply open `index.html` to run. The project simulates core mechanisms of the Chinese A-share market, including daily price limits, circuit breakers, T+1 settlement, transaction fees, and stamp duties. It features a built-in pool of over 300 stocks across 80+ industries to provide a realistic trading experience.

Positioned as a "pure entertainment" tool, it involves no real capital. All market data is generated locally by algorithms in real-time, designed to help users:

- Learn the basic process and rules of stock trading
- Understand mechanisms like daily price limits, T+1, and commission fees
- Test trading strategies (especially via the automated trading feature)
- Experience the psychological dynamics of market fluctuations with zero stress

---

## Features

### Core Features

- **Full User System**: Supports registration, login, password changes, account deletion, and remembering the last username
- **Multi-Save Management**: Each user can manage up to 50 independent saves (create, load, rename, delete, switch); the save list shows current storage usage and warns as the browser's LocalStorage quota is approached
- **300+ A-Share Stock Pool**: Covers 80+ sectors including Banking, Brokerages, Spirits, Pharma, Semiconductors, Clean Energy, Defense, etc.
- **Realistic Market Simulation**: Random price fluctuations, volume linkages, 5-level Order Book, and K-line chart data
- **Complete Trading Cycle**: Buy, sell, position management, order history, and real-time floating P&L calculation
- **T+0 / T+1 Dual Modes**: Choose whether to enable intraday turnaround trading at game startup
- **Configurable Fees**: Customizable buy/sell commissions (including stamp duty)

### Advanced Features

- **Automated Trading System**: Multi-stock, multi-condition automated strategies, including price thresholds, percentage changes, target profits, interval triggers, and stop-loss / take-profit risk controls
- **Achievement System**: 50+ achievements across Bronze, Silver, Gold, and Legendary tiers, plus easter eggs
- **K-Line Charts**: Custom Canvas-rendered candlestick charts with wheel zoom, drag pan, box zoom, touch support, and volume histograms
- **K-Line & Price Reset**: Re-roll the price and K-line of one, several, or all stocks; each stock's random sequence is independent and persists with the save
- **Time Control System**: Simulates trading hours with support for manual adjustments, presets, and random jumps
- **Debug Panel**: Hidden developer dashboard to modify capital, unlock achievements, control time, and reset market state
- **Multi-Theme Support**: Dark (default), Light, and Festival themes
- **Bilingual UI (Chinese/English)**: Built-in internationalization (i18n) system with one-click language switching; preferences are automatically saved
- **Beginner Tutorial**: Guided 9-step walkthrough automatically triggered for new users
- **Save File Import/Export**: Import/export encrypted backups two ways — a single save or an entire user's data — for flexible cross-device migration
- **Responsive Design**: Compatible with desktop and mobile screens

---

## Tech Stack

| Category | Technology |
| --- | --- |
| Frontend Structure | HTML5 |
| Styling | CSS3 (CSS Variables, Flexbox, Grid, Responsive Layout) |
| Logic | Vanilla JavaScript (ES6+, Class, Map, Set, Promise) |
| Charts | Canvas 2D API (Custom K-line and volume rendering) |
| Data Storage | LocalStorage |
| Data Encryption (v2.5.0) | XOR + Base64 custom encryption; **passwords use PBKDF2-SHA-256 (100k iterations + random salt)** |
| Dependencies | No third-party libraries, zero dependencies |

---

## Project Structure

```
Stock simulator/
├── index.html              # Main page containing all UI structure
├── game.js                 # Core game logic (8000+ lines)
│   ├── LimitManager class           # Price limit and circuit breaker management
│   └── StockSimulator class         # Main controller containing all business logic
├── stockData.js            # A-share stock pool data (387 stocks)
├── achievements.js         # Achievement system configuration and logic
├── crypto.js               # Encryption utilities (XOR + Base64 + hashing + UUID)
├── i18n.js                 # Internationalization core module (I18nManager class)
├── locales/                # Language resource files directory
│   ├── zh-CN.js            # Chinese language resources (570 translations)
│   └── en-US.js            # English language resources (570 translations)
├── styles.css              # All styles (including 3 themes + language switching UI)
├── images/                 # Project image resources
│   ├── cover.jpg           # Chinese version cover image
│   └── cover-en.png        # English version cover image
└── LICENSE                 # MIT open source license
```

### Script Loading Order

`index.html` loads scripts at the end of the page in the following order. There are dependencies and the order cannot be changed:

```html
<script src="stockData.js"></script>     <!-- Global variable StockPool -->
<script src="crypto.js"></script>        <!-- Global object Crypto -->
<script src="achievements.js"></script>  <!-- Global object AchievementSystem -->
<script src="locales/zh-CN.js"></script> <!-- Global object ZH_CN (Chinese resources) -->
<script src="locales/en-US.js"></script> <!-- Global object EN_US (English resources) -->
<script src="i18n.js"></script>          <!-- Global object I18n (i18n instance) -->
<script src="game.js"></script>          <!-- Main program, depends on all above -->
```

---

## Quick Start

### System Requirements

- Any modern web browser (Chrome, Firefox, Edge, Safari, recent versions)
- LocalStorage and Canvas API support
- No runtime or dependencies to install

### Installation and Running

1. Download the entire project folder to your local machine
2. Double-click `index.html`, or open it via your browser's "Open File" dialog
3. Click the "Register" button on the login screen, enter a username (2-20 characters) and password (6-20 characters)
4. Log in with the registered account
5. Click "+ New Game" on the save selection screen
6. Configure initial capital, fees, and trading rules, then click "Start Game"
7. Enter the main interface to start simulated trading

> Tip: The first-time beginner tutorial will trigger automatically; you can click "Skip Tutorial" to bypass it.

---

## Core Features Detailed

### User System

All user data is stored in the browser's LocalStorage under the key `stock_simulator_users`. Data is encrypted with XOR + Base64 before being saved.

**User Data Structure**:

```javascript
{
  username: String,              // Username
  passwordHash: String,          // Password hash (generated by Crypto.hash)
  createdAt: Number,             // Registration timestamp
  saves: Array,                  // Save array
  achievements: Array,           // User-level achievements (cross-save)
  tutorialCompleted: Boolean,    // Whether tutorial is completed
  theme: 'dark' | 'light' | 'festival',  // Theme preference
  refreshRate: Number,           // Market refresh speed (milliseconds)
  lang: 'zh-CN' | 'en-US'        // Language preference (i18n)
}
```

**Feature List**:

- Registration: Username 2-20 characters, password 6-20 characters, requires confirmation; usernames cannot be duplicated (case-insensitively — "Admin" and "admin" count as the same username). Usernames may only contain Chinese characters, letters, digits, underscores, and hyphens, and reserved names such as `__proto__` / `constructor` are rejected (since v2.6.0)
- Login: Password verified via hash comparison; supports Enter key for quick login; username lookup is case-insensitive (different capitalization still signs in to the same account; legacy accounts that differ only by case still require an exact match)
- Remember last user: records the most recent username after a successful login and prefills it next time (the password is never stored, so you still sign in manually)
- Change Password: Requires verification of current password, new password requires confirmation
- Delete Account: Requires typing `DELETE` to confirm; operation is irreversible
- Data Migration: Old user data is automatically completed with missing fields (`tutorialCompleted`, `theme`, `refreshRate`) on load

### Save System

Each user can create multiple independent saves. Data between saves is completely isolated.

**Save Data Structure**:

```javascript
{
  id: String,                    // UUID
  createdAt: Number,             // Creation timestamp
  fund: Number,                  // Current available funds (yuan)
  initialFund: Number,           // Initial capital
  holdings: Object,              // Holdings dictionary, keyed by stock code
  records: Array,                // Trade records (with game dayIndex / game clock, up to 100 retained)
  watchlist: Array,              // Watchlist stock codes
  achievements: Array,           // Save-level achievements
  settings: {                    // Current game trading rules
    buyFee: Number,              // Buy commission rate
    sellFee: Number,             // Sell commission rate (including stamp duty)
    t0Mode: Boolean,             // Whether T+0 is enabled
    tradeUnit: 1 | 100           // Minimum trade unit (1 share or 1 lot)
  },
  dayTrades: Object,             // Daily trade records (for T+1 validation)
  gameStats: Object,             // Current game statistics (for achievements)
  autoTrade: Object              // Auto-trading configuration and records
}
```

**Holding Structure**:

```javascript
{
  '600519': {
    name: '贵州茅台 (Kweichow Moutai)',
    quantity: Number,            // Holding quantity
    avgPrice: Number,            // Average holding price
    totalCost: Number            // Total holding cost
  }
}
```

**Auto-save**: The market and the game clock are written to localStorage on every market tick (throttled to roughly once every 2 seconds), and also immediately when the tab is hidden (`visibilitychange`) or the page is closed/reloaded (`beforeunload`). Idling and then refreshing therefore no longer rewinds time or prices, and the last candle of the day matches the live price.

**Multi-tab Merge (v2.10.0)**: When the same account is played in two tabs at once, `saveUsers()` reads the latest ciphertext from storage before writing and performs a three-way merge ("baseline when this session loaded" / "this tab's in-memory save" / "the save on disk"), adding deltas for funds, holding quantity and cost, trade records, daily trade counters, statistics, and auto-trade cooldowns, so the tab that writes last no longer overwrites the other tab's progress. A `storage` event listener also notifies and refreshes the UI when another tab writes; if another window deletes the current account, this tab immediately stops its market and auto-trade timers, clears the session, returns to the login screen with a notice, and never writes the account back (v2.13.2). The merge only sums deltas and does not resolve the same action performed twice inside one save (for example selling the same position in both tabs); in extreme cases a quantity is clamped to 0.

**Save Operations**: Create, load, rename (1-20 characters), delete, switch. Import/export live on the **save-selection screen**: export any single save as an encrypted text file, or export/import a backup. Exported backups carry no password hash. **Import a Save** appends one chosen save (a fresh id is assigned) into the current account; **Import All Data** merges every save in the backup into the current account, automatically skipping saves whose id already exists. Neither import creates a new account, changes the current password or preferences, or requires re-login. Imports keep the backup's market snapshot (game clock, K-lines, random seed) and auto-trade cooldowns/records; each account holds at most 50 saves, and any excess is truncated with an explicit notice.

### Market Simulation System

Market data is periodically generated by the `updateMarket()` method in [game.js](file:///c:/Users/Administrator/Documents/trae_projects/Stock%20simulator/game.js) at the configured refresh speed (default 3 seconds).

**Stock Data Structure**:

```javascript
{
  code: '600519',
  name: '贵州茅台',
  industry: '白酒',
  price: Number,                 // Current price
  prevClose: Number,             // Previous closing price
  open: Number,                  // Opening price
  high: Number,                  // Daily high
  low: Number,                   // Daily low
  volume: Number,                // Current volume
  dailyVolume: Number,           // Daily volume
  prevDailyVolume: Number,       // Previous day volume
  avgVolume: Number,             // 5-day average volume
  history: Array,                // K-line history (up to 60 bars)
  bid: Array,                    // Bid 5 levels
  ask: Array                     // Ask 5 levels
}
```

**Price Fluctuation Algorithm**:

- Normal stocks: Each tick produces a random fluctuation of `(-2% ~ +2%)`, formula: `(Math.random() - 0.5) * 0.04`
- Easter egg stock "MediaStorm" (code `999999`): 70% chance of rising (0.5% ~ 3%), 30% chance of falling (-0.5% ~ -2%), performs better than normal stocks
- After price fluctuation, `LimitManager.clampPrice()` immediately clamps the price within the daily limit range and rounds to 0.01 yuan

**Volume Algorithm**: Daily volume = Previous day volume × (1 + price change % × 1.5), price change limited to `[-20%, +20%]`, with an additional ±3% random fluctuation.

**Trading Day Switch**: The trading day is derived from the game clock — a new day begins when the clock crosses midnight and enters the next trading session. On switch: saves previous close, resets circuit breaker state, clears `dayTrades` (lifting the T+1 restriction), updates 5-day average volume, resets daily data, and adds a new K-line.

**Five-Level Order Book**: Each tick regenerates buy/sell five-level quotes based on the current price with 0.01 yuan increments, plus random quantities.

### Trading System

The trading system includes a complete buy, sell, validation, recording, and statistics flow.

**Trading Flow**:

1. User enters stock code, price, and quantity on the trade page
2. `validateTradeParameters()` validates parameter validity
3. `executeTrade()` executes the trade and deducts/credits funds
4. `recordTrade()` writes trade records
5. `updateAfterTrade()` refreshes holdings and UI

**Order Price Fields**: After a stock code is validated the current market price is filled in automatically. Once you edit a price yourself, market refresh no longer overwrites it (the field keeps your limit price) until you re-enter/switch the stock code or complete a trade.

**Parameter Validation Rules**:

- Must be within trading hours (9:30-11:30, 13:00-15:00)
- Price must be greater than 0
- Buy price must not exceed limit-up price; sell price must not be below limit-down price
- The stock must not be in circuit breaker state
- If the input price deviates from market price by more than 10%, user confirmation is required
- Stock code must exist in the stock pool

**T+1 Rules** (default mode, matching real A-shares):

- Stocks bought on the same day cannot be sold on the same day (only when `t0Mode = false`)
- After selling on the same day you may buy the same stock back (as on the real A-share market); the re-bought portion is still subject to the rule above and only becomes sellable the next day
- The `dayTrades` field records daily buy/sell quantities per stock

**Commission Calculation**:

- Buy commission = Buy amount × Buy fee rate (default 0.03%)
- Sell commission = Sell amount × Sell fee rate (default 0.13%, including stamp duty)
- Fee rates can be customized in the initial game setup

**Trade Unit**: At game start, you can choose "1 share" or "100 shares (1 lot)" as the minimum trade unit. All quantities are automatically rounded to this unit.

**Trade Records**: Each trade records the game day (`dayIndex`), the game clock (shown as "Day N HH:MM"), code, name, direction, price, quantity, amount, commission, and P&L. Up to 100 records per save.

### Automated Trading System

Automated trading is an advanced feature that allows users to configure automated trading strategies for multiple stocks. The system automatically triggers buy/sell orders based on set conditions.

**Configuration Parameters**:

| Parameter | Description |
| --- | --- |
| Stock Code | Must be a code that exists in the stock pool |
| Trade Direction | Buy / Sell |
| Trigger Condition Type | Price threshold / Percentage change / Profit target / Time interval |
| Trigger Condition | Higher than / Lower than / Equal to a certain value |
| Trade Quantity | Can be quickly filled as 1/4, 1/2, or full position |
| Trade Price | Market price or Limit price |
| Stop-loss Amount | Auto-sell when loss reaches threshold (leave blank to disable) |
| Take-profit Amount | Auto-sell when profit reaches threshold |
| Max Trade Amount | Maximum trade amount per order |

**Parameter Validation**: Trade quantity must be a positive integer no larger than 1,000,000,000 and a multiple of the trade unit; the profit target and take-profit amount must be positive; an empty optional risk-control field means "no limit". The full-position shortcut (manual and auto) reserves the buy fee.

**Trigger Condition Explanation**:

- **Price Threshold**: Triggers when current price is higher than/lower than/equal to the set value
- **Percentage Change**: Triggers when daily price change is higher than/lower than/equal to the set percentage
- **Profit Target**: Only applies to selling; triggers when profit/loss amount based on holding cost reaches the set value
- **Time Interval**: Automatically triggers every 30 seconds (not constrained by condition values)

**Cooldown Mechanism**: To prevent repeated trades, each stock has a cooldown period after each trigger. Default is 5 seconds; 30 seconds in interval mode. Cooldowns are persisted with the save: pausing, resuming, or switching saves never resets them, and only "Stop" clears them.

**Risk Control**: In addition to basic trigger conditions, sell operations also check stop-loss and take-profit. When the profit/loss amount reaches the stop-loss threshold (negative) or take-profit threshold (positive), a sell is automatically triggered. 20 consecutive failures trip a breaker that pauses auto trading and shows a notice (the status indicator refreshes immediately after pausing, and the breaker count resets on resume), preventing a never-satisfiable condition from spinning forever.

**Statistics and Records**: Automated trading maintains its own statistics (total trades, success/failure count, total P&L) and trade records (up to 50). You can view them on the "Trade Records" tab. Auto-trade buys also count toward save statistics (trade count, sector coverage, and max holdings), so holding-based achievements can be unlocked normally.

**Operations**: Add, edit, delete single configurations, one-click reset all configurations, start, pause, and stop automated trading. Pausing game time freezes both the market and auto trading, so no trades execute on the real clock.

### Achievement System

The achievement system is defined in [achievements.js](file:///c:/Users/Administrator/Documents/trae_projects/Stock%20simulator/achievements.js), with 50+ achievements divided into four tiers and many easter egg achievements.

**Achievement Tiers**:

| Tier | Color | Positioning |
| --- | --- | --- |
| Bronze | `#cd7f32` | Beginner achievements, unlocked by completing basic operations |
| Silver | `#c0c0c0` | Intermediate achievements, requiring a certain trading volume and skill |
| Gold | `#ffd700` | Advanced achievements, requiring significant investment returns and experience |
| Legendary | Gradient red-yellow | God-tier achievements, extremely difficult to achieve |

**Achievement Categories**:

- **Regular Achievements**: First trade, first profit, cumulative trade count, cumulative profit amount, return rate, consecutive win streak, industry coverage, intraday trading, etc.
- **Easter Egg Achievements**: Top-of-mountain guard, reverse operation master, FOMO patient, panic selling, long-term shareholder, indecisive, all-in player, turnaround, diamond hands, paper hands, lucky star, unlucky one, weekend warrior, OCD, symmetrical aesthetics, tax payer, market crash survivor, contrarian investor, trend chaser, value investor, technician, news trader, early bird, night owl, etc.

> Note: 9 achievements (`standing_guard`, `buy_high_sell_low`, `comeback_kid`, `diamond_hands`, `market_crash_survivor`, `contrarian`, `technical_trader`, `news_trader`, `market_beater`) rely on statistics that are not recorded yet, so they are shown as "Coming soon" on the achievement wall and do not unlock.

**Detection Mechanism**: After each trade, `calculateSaveStats()` is called to calculate current save statistics, then `checkAchievements()` compares against unlock conditions for unearned achievements. Newly unlocked achievements trigger a notification and can be viewed on the profile page. Date/time-based achievements (intraday trading, indecisive, long-term shareholder, weekend warrior, early bird, night owl, etc.) are all judged on the **game calendar**: trade records store the game day (`dayIndex`) and the game clock, and game day 0 maps to the weekday of the save's creation date, independent of the real date.

**Achievement Poster**: Each achievement can generate a 600×800 shareable poster via Canvas, including the achievement icon, name, tier, description, username, and date.

### Time Control System

The simulated market uses a simplified time progression mechanism that does not correspond to real-world time.

**Time Structure**:

```javascript
gameTime = {
  hour: 9,                       // Hour
  minute: 30,                    // Minute
  minutesPerTick: 1,             // Minutes advanced per tick
  manualSet: Boolean,            // Whether time was manually set
  dayIndex: Number               // Game calendar day, incremented on crossing midnight
}
```

**Trading Session Detection**:

- Morning session: 9:30 - 11:30
- Afternoon session: 13:00 - 15:00
- Like the real A-share market the intervals are half-open: trading already stops exactly at 11:30 and 15:00, so the last tradable moments are 11:29 / 14:59
- Outside these hours is non-trading time; the market stops updating and trading is disabled

**Time Advancement**: Each market tick advances the clock by 1 game minute, running continuously through the full 24 hours from 9:30. Outside trading sessions the clock keeps moving but market data is completely frozen and trading is disabled; crossing midnight increments the game calendar day, and the new trading day is applied when the next session begins.

**Time Control**: In the debug panel, you can manually set any time or use preset buttons to jump:

- Morning open (9:30)
- Early bird (9:35)
- Before morning close (11:25)
- Lunch Break (11:35)
- Afternoon open (13:00)
- Before close (14:55)
- Random time

> Pausing game time freezes market updates and auto trading together; both resume when unpaused.

### K-Line Charting System

The K-line chart is fully self-implemented using the Canvas 2D API, with no third-party charting libraries.

**Chart State**:

```javascript
chartState = {
  scaleX: Number,                // X-axis zoom scale
  scaleY: Number,                // Y-axis zoom scale
  offsetX: Number,               // X-axis offset (drag)
  offsetY: Number,               // Y-axis offset
  isDragging: Boolean,           // Whether currently dragging
  isSelecting: Boolean,          // Whether currently selecting
  dragStartX: Number,
  dragStartY: Number,
  selectionStart: Object,        // Selection start point
  selectionEnd: Object           // Selection end point
}
```

**Supported Interactions**:

- Wheel zoom: Scroll the mouse wheel on the chart to zoom the X-axis
- Drag pan: Hold the left mouse button to drag the chart horizontally
- Box zoom: Hold Shift or right mouse button to zoom into a selected area
- Touch operations: Single-finger drag, two-finger pinch zoom (mobile)
- Toolbar buttons: Three shortcut buttons for zoom in, zoom out, and reset

**Chart Composition**:

- Main chart: K-line (candlestick), red for up and green for down (A-share convention)
- Sub-chart: Volume histogram
- Historical data: Each stock retains the most recent 60 K-lines
- Five-level order book: Buy and sell five-level quotes with quantities

**K-Line Reset**:

The left sidebar of the market page provides a "Reset K-Line" entry that re-rolls the price and K-line of one, several, or all stocks:

- Scope: the current stock only, all stocks, or any set hand-picked in the dialog
- Shortcuts: select all, clear all, the current watchlist, or preselect from the current search results
- Filtering: search the pending list by code or name
- What changes: 60 K-lines are rebuilt from a new random base price, the whole history is rescaled to that base, and today's candle is flattened to a flat open, so the change percentage is 0 right after the reset and the limit band is not hit immediately
- Isolation: unselected stocks keep their price and K-line untouched
- Unrelated data: cash, position size and cost, trade records, fees, realised P&L, and achievements are all unaffected
- Persistence: each stock's reset salt is stored with the save, so the K-line stays identical after a refresh or reload

### Debug Panel

The debug panel is a hidden feature for development debugging and fun gameplay.

**How to Open**: On the "Profile" page, click your username 5 times in a row to open the debug panel.

**Features**:

- **Fund Editing**: Directly set the available funds for the current save
- **Achievement Unlock**: One-click unlock all achievements, unlock a single achievement, cancel all unlocks, select and cancel unlocks
- **Time Control**: Manually set time or use preset buttons
- **Market Control**: Reset market data, clear current save data

### Themes & UI

Three themes are provided, switched via CSS variables:

| Theme | Description | Primary Color |
| --- | --- | --- |
| Dark | Default theme | `#0d1117` background, GitHub style |
| Light | Daytime mode | `#f5f5f5` background |
| Festival | Special theme | `#1a0a2e` deep purple background, gold primary color |

**Up/Down Colors**: Following A-share convention, red (`#ff4d4f`) indicates price increase, and green (`#52c41a`) indicates price decrease.

**Market Refresh Speed**: Three options are available in settings: 1 second, 3 seconds, and 5 seconds, affecting market update frequency.

**Responsive**: Adapted to different screen sizes via viewport meta and CSS media queries. Mobile devices support touch operations.

### Internationalization (i18n)

The project includes a complete Chinese-English internationalization system, implemented by the `I18nManager` class in [i18n.js](file:///c:/Users/Administrator/Documents/trae_projects/Stock%20simulator/i18n.js), with language resources stored in the [locales/](file:///c:/Users/Administrator/Documents/trae_projects/Stock%20simulator/locales/) directory.

**Core Mechanism**:

- **Translation Function**: `I18n.t(key, params)` retrieves translation text by key name, supports `{placeholder}` parameter interpolation
- **DOM Auto-Refresh**: `I18n.applyToDOM()` batch-updates all nodes marked with `data-i18n` / `data-i18n-placeholder` / `data-i18n-title` / `data-i18n-html` attributes
- **Instant Switching**: Call `I18n.setLanguage(lang)` or `I18n.toggleLanguage()` to instantly switch language and refresh the entire page
- **Callback Notification**: `I18n.onChange(callback)` registers a language change callback for dynamic content re-rendering

**DOM Marking Convention**:

| Attribute | Purpose |
| --- | --- |
| `data-i18n="key"` | Sets the element's `textContent` |
| `data-i18n-placeholder="key"` | Sets the input's `placeholder` |
| `data-i18n-title="key"` | Sets the element's `title` |
| `data-i18n-html="key"` | Sets the element's `innerHTML` (for text containing HTML tags) |

**Language Switching UI**:

- Login page top-right 🌐 circular button: click to quickly toggle between Chinese and English
- Settings panel language dropdown: select "Chinese" or "English"

**Language Preference Persistence**:

- Logged-in users: Language preference is saved in the user data's `lang` field and automatically restored on login
- Guest users: Language preference is saved in LocalStorage (key: `stock_simulator_lang`)
- Fallback mechanism: Automatically falls back to Chinese when a translation key is not found

**Localization Adaptation**:

- Amount formatting: Chinese uses "万/亿/万亿" units; English uses "K/M/B/T" units. The sign of a negative amount precedes the currency symbol (-¥42.33), and a negative that rounds to zero is shown unsigned (0.00%, ¥0.00)
- Date formatting: Uses `toLocaleString()` to format according to the current language locale
- Achievement system: Achievement names and descriptions both support bilingual switching (poster title/name/description font sizes shrink to fit the canvas width so long English text is not clipped by the border)
- Page title: `document.title` is updated when the language changes
- Auto-trade notice: the maximum-trade-count notification is localized instead of hard-coded Chinese

### Beginner Tutorial

First-time users are automatically prompted with a 9-step guided tutorial covering:

1. Welcome introduction
2. Market page and stock list
3. Five-level order book explanation
4. Navigation bar switching
5. Trade page order placement process
6. Holdings page explanation
7. Profile page features
8. Debug panel activation tip
9. Closing remarks

The tutorial is presented by highlighting target elements, floating tooltips, and arrow guides. It supports skipping, previous step, and next step; the last step's button reads "Finish", which ends the tutorial and switches back to the market page. The tooltip measures its own size and is clamped to the viewport, scrolling when the content is long. After completion, `tutorialCompleted = true` is marked in user data and the tutorial will no longer trigger automatically.

### Data Security & Backup

**Local Encrypted Storage**: All user data is processed by `Crypto.encrypt()` (XOR encryption + Base64 encoding) before being written to LocalStorage. The key is `stock-simulator-2024`.

> ⚠️ **Important Security Notice (effective v2.5.0)**: This project is a **pure frontend** application. All encryption and hashing run in **the user's own browser**. This means anyone who can execute JavaScript in the browser (i.e., the user themselves, including via DevTools console) can read LocalStorage and call `Crypto.decrypt` to decrypt all data. The purpose of `Crypto.encrypt/decrypt` is to **prevent unrelated users from accidentally seeing LocalStorage contents** (e.g., shared computers, screenshots, backup files). **It is not an adversarial security mechanism**. Do not use this application's password in any truly sensitive scenarios.

**Password Hashing (v2.5.0 Upgrade)**: Starting from v2.5.0, new user passwords are derived using **PBKDF2-SHA-256**, with **100,000 iterations + per-user random 16-byte salt** (storage format: `pbkdf2-sha256-100k$<saltHex>$<derivedHex>`). Users registered before v2.5.0 use the old 32-bit weak hash. After the first successful login, the password hash is **automatically upgraded** to the PBKDF2 format without any user action.

**Save Export**: Export entries live on the save-selection screen. Click "Export" on a save card to export just that save (filename `stock_simulator_save_{username}_{saveName}_{timestamp}.txt`), or click "Export All Data" below for the entire account (filename `stock_simulator_backup_{username}_{timestamp}.txt`). Both payloads strips `passwordHash`, so backups never contain a password hash; export uses the same serializer as local storage, so the market snapshot (game clock, K-lines, random seed), daily trade counters, and the auto-trade configuration/counters/records are all included.

**Save Import (v2.5.0 Hardened)**: On the save-selection screen, choose **Import a Save** to append one save from a backup (if the file holds several saves, a picker lists them) into the current account, or **Import All Data** to import the backup's full user data. Both flows include:

- **5 MB file size limit** (to prevent DoS)
- **User data schema validation** (rejects malformed JSON, incorrect field types)
- **Per-save field whitelist** (save name limited to Chinese/letters/numbers/common symbols, 1-20 characters; `tradeUnit` only accepts `{1, 100}`; `buyFee`/`sellFee` limited to `[0, 0.01]`)
- **Merge limit**: a single backup contributes at most 50 saves; any excess is truncated with a notice
- **Full state preserved**: the market snapshot (game clock, K-lines, random seed), auto-trade cooldowns (per-stock last trigger time), and auto-trade records are all restored on import
- **All user-controllable strings are HTML-escaped before rendering** to prevent script injection via malicious save names
- **Merge into current account**: both imports only append/merge saves into the currently signed-in account (saves with existing ids are skipped); no new account is created, the current password/preferences stay untouched, and no re-login is needed

**Write-Failure Protection (v2.6.0)**: If LocalStorage is not writable (private mode, quota exceeded, etc.), `saveUsers()` reports failure, the trade is rolled back to its pre-trade snapshot, and the user is notified — so the UI never shows a completed trade that was not persisted. The trade-success toast is likewise shown only after the data is successfully written.

**Corrupted-Data Protection (v2.6.0)**: When `loadUsers()` fails to decrypt or parse, it first backs up the raw ciphertext to the fixed key `stock_simulator_users_corrupted_backup` (only the earliest copy is kept, so refreshing does not write a new copy every time) before continuing, instead of overwriting it, preventing irreversible data loss.

**Right-click Menu**: The browser right-click menu is globally disabled to prevent users from copying page content.

**Browser Back**: Listens for `popstate` events. When a user has logged out, they are forced to stay on the login page to prevent entering a logged-out page via the back button.

---

## Trading Rules

### Trading Hours

| Period | Time |
| --- | --- |
| Morning Session | 9:30 - 11:30 |
| Midday Break | 11:30 - 13:00 |
| Afternoon Session | 13:00 - 15:00 |
| Non-Trading Period | No trading allowed, market data stops updating |

### Price Limits

- Limit-up threshold: +10%
- Limit-down threshold: -10%
- Limit-up price = Previous close × 1.10, rounded to 0.01 yuan
- Limit-down price = Previous close × 0.90, rounded to 0.01 yuan
- Buy price must not exceed limit-up; sell price must not be below limit-down

### Circuit Breaker Mechanism

- Circuit breaker threshold: a single-tick move of ±5% (abnormal flash move)
- Normal per-tick movement is banded within ±2% (up to +3% for the easter-egg stock), while a rare abnormal jump of ±4%~7% occurs with roughly 0.1% probability; the breaker exists to catch exactly this kind of anomaly
- When triggered, trading for that stock is paused for 3 tick cycles (adjustable via `LimitManager.circuitBreakerCooldown`)
- Circuit breaker state resets on trading day switch

### T+1 Settlement Rules

- Default T+1 rule (matching real A-shares): stocks bought on the same day can only be sold the next day; after selling you may buy the stock back the same day, but the re-bought portion is likewise only sellable the next day
- T+0 mode can be enabled in initial game settings to remove intraday turnaround restrictions

### Commissions

- Buy commission rate: Default 0.03% (customizable, 0% - 1%)
- Sell commission rate: Default 0.13% (including stamp duty, customizable, 0% - 1%)
- Commissions are deducted in real time during trading

### Trade Unit

- Optional 1 share or 100 shares (1 lot) as the minimum trade unit
- All trade quantities are automatically rounded to this unit

---

## UI Navigation Guide

The application uses a Single Page Application (SPA) architecture, switching between multiple views via screens and pages.

### Screen Flow

```
Login/Register Screen → Save Selection Screen → Game Setup Screen → Main Game Screen
                                                          ↓
                              Market | Trade | Auto-Trade | Portfolio | Profile
```

### Login/Register Screen (auth-screen)

- Login form: Username, password, supports Enter to login
- Registration form: Username, password, confirm password, supports Enter to switch between fields
- Language switch: Top-right 🌐 button for quick Chinese/English toggle
- Error prompts: Real-time display of login/registration errors

### Save Selection Screen (save-select-screen)

- Save list: Displays existing saves with name, creation time, and capital overview
- Operations: Load, rename, delete, export (per save), new game, import a save / import all data, export all data, change password, delete account, log out

### Game Setup Screen (game-setup-screen)

- Initial capital: Randomly generated (500k-2M) or custom (minimum 100k)
- Trade fees: Buy commission, sell commission (including stamp duty)
- Trading rules: T+0 toggle, minimum trade unit

### Main Game Screen (main-screen)

The top navigation bar contains five main pages:

#### Market Page (market-page)

- Left side: search box, watchlist switch, sortable stock list (by name/price/change), and a "Reset K-Line" button
- Right side: stock details, including name/code, current price, change amount, limit-up/down prices, market time, and status
- K-line area: includes toolbar (zoom in, zoom out, reset), main chart, and volume sub-chart
- Five-level order book: five bid and ask levels each
- Shortcut actions: buy, sell, add to watchlist

#### Trade Page (trade-page)

- Left side: buy/sell form (code, price, quantity, quick ratio buttons, available funds/estimated amount)
- Right side: current positions list, including market time and status

#### Auto-Trade Page (auto-trade-page)

- Three tabs: trigger conditions, risk control, trading records
- Trigger conditions: stock list + add stock form
- Risk control: stop loss, take profit, max trade amount per order
- Trading records: auto-trading history and statistics
- Top status indicator: not started / running / paused

#### Portfolio Page (portfolio-page)

- Asset overview: total assets, market value, available cash, floating P&L, total return rate
- Position table: stock, holdings, cost price, current price, market value, P&L, profit rate
- Transaction record table: game day and time (Day N HH:MM), stock, direction, price, quantity, amount

#### Profile Page (profile-page)

- User info: avatar, username, registration time
- Statistics: session count, transaction count, achievement count
- Achievement wall: unlocked achievements grouped by rarity, can expand all
- Action buttons: new game, switch save, change password, log out, delete account (save import/export and change-password/delete-account are also available on the save-selection screen)

### Modal Windows and Panels

- Settings panel: theme switching, market refresh rate, language selection
- Password change panel: current password, new password, confirmation
- Debug panel: fund editing, achievement unlock, time control, market control
- Reset K-Line panel: pick stocks by scope or search, with select-all / clear-all / watchlist / search-result shortcuts
- Achievement popup: new achievement unlock notification
- Beginner tutorial: 9-step overlay guide
- Rename save modal
- Generic input modal: import conflict/auth and rename all reuse one masked input dialog with password masking and required-field validation

---

## Frequently Asked Questions

### How do I register a new account?

Click the Register tab on the login screen, enter a username (2-20 characters), password (6-20 characters), confirm the password, and then click Register.

### What if I forget my password?

Password recovery is not supported. Please keep your password safe. If you forget it, you must delete the account and re-register, which will permanently delete all stored data.

### Where is my data stored?

All data is stored in the browser's LocalStorage and is not uploaded to any server. Clearing browser data or using private/incognito mode may delete your save data. Back up with "Export All Data" on the save-selection screen (you can also export a single save). If the same account is open in several tabs, each tab merges its deltas on write so progress is not silently overwritten — but playing one account in a single tab is still recommended.

### How do I migrate saves across devices?

On the source device's save-selection screen, click "Export All Data" to download a `.txt` file. On the target device, sign up or log in to the target account, open the save-selection screen, and click "Import All Data" to merge every save in the backup into that account (saves already there are skipped). To move just one save into an existing account, click "Export" on that save on the source device and use "Import a Save" on the target device. Imports stay inside the current account — no extra password setup or re-login is needed.

### Why can't I trade outside market hours?

The system simulates real A-share trading hours (9:30-11:30 and 13:00-15:00). Outside those hours, the market stops updating and trading is disabled. You can adjust the time manually in the debug panel if needed.

### How do I open the Debug Panel?

On the Profile page, click your username 5 times quickly in a row to open the debug panel.

### How are achievements unlocked?

Achievements unlock automatically when specific conditions are met, such as your first trade, cumulative profit, continuous winning streaks, holding certain stocks, and similar actions. You can view all conditions in the achievement wall.

### Why didn't my auto-trade trigger?

Possible reasons include:

- The market was not in a trading session
- The cooldown period had not expired (default 5s; 30s in interval mode)
- The trigger condition was not met
- Available funds or holdings were insufficient
- Game time is paused (both the market and auto trading are frozen)

### What is the "影视飓风" stock?

Stock code `999999` is an Easter-egg stock named "影视飓风" (Yingshi Jufeng / MediaStorm). It has a special market algorithm with a 70% chance of rising and behaves better than ordinary stocks.

### How do I switch between Chinese and English?

There are two ways to switch languages:

- Click the 🌐 button in the top-right corner of the login page for a quick toggle
- Use the "Language" dropdown in the Settings panel after entering the game

Your language preference is automatically saved and applied on your next visit.

---

## Changelog

### v2.13.1

- **Bugfix**: Fixed imported saves silently resetting funds above 1 billion yuan to 1 million. The unified money ceiling MAX_SAVE_FUND is raised from 1e9 to 1e15, so only impossible values (e.g. 1e308) are rejected; an invalid fund now falls back to a valid initialFund instead of fabricating a -99% return. The debug panel fund cap follows the same constant and the error message now receives {max} for interpolation.
- **Bugfix**: Fixed the multi-tab merge dropping distinct trades that shared the same minute/stock/quantity/price. Trade records (manual and auto-trade log) now carry a Crypto.uuid() unique id, and mergeRecordLists deduplicates by id (legacy id-less records still fall back to a content key).
- **Docs**: Removed 3 duplicate translation keys in zh-CN.js; both locales now report 569 entries, consistent with the README. Noted that empty/unsafe save names fall back to the "Save N" label in the save list.

### v2.13.0

- **Feature Removal**: Auto trading no longer caps the trade count — both the per-stock max trade count (`maxTrades`) and the global max trade count (`maxTotalTrades`, previously default 100) are removed, along with their config fields, limit notices, and save-data fields. Auto trading is now governed only by cooldowns, stop-loss/take-profit, per-order max amount, and the consecutive-failure breaker (20 failures). Legacy `maxTrades` / `maxTotalTrades` / `stockTradeCounts` / `maxTradesNotified` fields in old saves are ignored on load; cooldowns and trade records are unaffected.
- **Docs**: fixed stale line-number references in the developer notes, locale key counts, and save-data field comments.

### v2.12.1

- **P2-10 Fix**: Fixed volume chart not refreshing after box zoom. All zoom operations (wheel, mouse box selection, touch) now synchronize K-line and volume chart updates.
- **P2-11 Fix**: Fixed NaN poisoning of `scaleX` caused by zero starting distance when two fingers land on the same pixel during touch pinch zoom. Invalid zoom calculations are now safely skipped.
- **P2-10 Fix**: Fixed volume chart not syncing during touch drag and pinch zoom by adding `drawVolume` calls in touch operations, matching mouse behavior.
- **P2-12 Fix**: Fixed volume chart not refreshing during touch drag operations.

### v2.12.0

- Initial release version with complete stock simulation functionality.

---

## Developer Information

### Core Class Design

The project is centered around two core classes:

**`LimitManager`** ([game.js:4-108](file:///c:/Users/Administrator/Documents/trae_projects/Stock%20simulator/game.js#L4-L108)): manages price limits and circuit breakers, calculates price boundaries, and tracks breaker states.

**`StockSimulator`** ([game.js:563-8333](file:///c:/Users/Administrator/Documents/trae_projects/Stock%20simulator/game.js#L563-L8333)): the main controller running as the singleton `window.game`, containing the complete business logic. The main method groups are as follows:

| Module | Main Methods |
| --- | --- |
| User Management | `loadUsers`, `saveUsers`, `login`, `register`, `logout`, `deleteAccount`, `checkAutoLogin` |
| Save Management | `showSaveSelect`, `renderSaveList`, `startGame`, `loadSave`, `deleteSave`, `showRenameSaveModal` |
| Market Simulation | `initMarketData`, `generateBasePrice`, `generateHistory`, `startMarketSimulation`, `updateMarket`, `generateOrderBook` |
| Time System | `updateGameTime`, `updateTimeDisplay`, `isTradingTime`, `randomizeGameTime` |
| Stock List | `renderStockList`, `handleSortClick`, `searchStocks`, `toggleWatchlistMode`, `selectStock` |
| Trading System | `executeTrade`, `validateTradeParameters`, `executeBuyTrade`, `executeSellTrade`, `recordTrade`, `updateAfterTrade` |
| Position Management | `updatePortfolio`, `updatePortfolioRealTime`, `calculateStockValue` |
| Achievement System | `updateProfile`, `checkAchievements`, `calculateSaveStats`, `calculateStats`, `showAchievementPopup` |
| K-Line Chart | `drawKLine`, `drawVolume`, `chartZoomIn`, `chartZoomOut`, `chartReset`, `onChartWheel`, `onChartMouseDown`, `onChartTouchStart`, `resetKLineCharts`, `regenerateStockMarket`, `openResetKLineModal` |
| Auto-Trade | `addAutoTradeStock`, `editAutoTradeStock`, `removeAutoTradeStock`, `startAutoTrade`, `pauseAutoTrade`, `stopAutoTrade`, `checkAutoTradeCondition`, `executeAutoTrade` |
| Debug Panel | `showDebugPanel`, `debugSetTime`, `debugSetFund`, `debugUnlockAchievement`, `debugResetMarket` |
| Tutorial System | `startTutorial`, `showTutorialStep`, `nextTutorial`, `endTutorial` |
| Internationalization | `applyUserLanguage`, `onLanguageChanged`, `toggleLanguage` |
| Utility Methods | `formatMoney`, `formatCurrency`, `formatPercent`, `showScreen`, `switchTab`, `setTheme`, `exportAllData`, `exportSingleSave`, `importSave` |

### Startup Flow

The application startup logic is located in [game.js:8336-8358](file:///c:/Users/Administrator/Documents/trae_projects/Stock%20simulator/game.js#L8336-L8358):

1. `DOMContentLoaded` event fires
2. Right-click menu is disabled globally
3. `StockSimulator` is instantiated, and the constructor calls `init()`
4. `init()` calls `I18n.init()` (initialize i18n), `I18n.applyToDOM()` (refresh static text), `loadUsers()` (load data and migrate), `bindEvents()` (bind all events), `applyUserLanguage()` (apply user language preference), and `checkAutoLogin()` (prefill the last username)
5. Registers `I18n.onChange()` callback to auto-refresh all dynamic content on language switch
6. Browser back-button behavior is handled via `popstate`

### Data Flow

```text
User action → Event listener → StockSimulator method
                            ↓
                       Modify currentSave / currentUser
                            ↓
                      saveUsers() encrypts and writes LocalStorage
                            ↓
                       Refresh UI rendering
```

### Extension Guide

**Add a new stock**: append an object to the `StockPool` array in [stockData.js](file:///c:/Users/Administrator/Documents/trae_projects/Stock%20simulator/stockData.js) using the format `{ code: '6-digit code', name: 'Name', industry: 'Industry' }`.

**Add a new achievement**: append a new object to the `achievements` array in [achievements.js](file:///c:/Users/Administrator/Documents/trae_projects/Stock%20simulator/achievements.js), including fields like `id`, `name`, `desc`, `level`, `icon`, and `condition`. Add corresponding stats in `calculateSaveStats()`.

**Modify price limit rules**: adjust the `LimitManager` constructor parameters in [game.js:5-20](file:///c:/Users/Administrator/Documents/trae_projects/Stock%20simulator/game.js#L5-L20) for `limitUpPercent`, `limitDownPercent`, `circuitBreakerThreshold`, and `circuitBreakerCooldown`.

**Add a new theme**: create a new selector in [styles.css](file:///c:/Users/Administrator/Documents/trae_projects/Stock%20simulator/styles.css), such as `body.{theme-name}-theme`, and update the theme dropdown in [index.html](file:///c:/Users/Administrator/Documents/trae_projects/Stock%20simulator/index.html) and the `setTheme()` logic in [game.js](file:///c:/Users/Administrator/Documents/trae_projects/Stock%20simulator/game.js).

**Add a new language or translations**:

1. Create a new language resource file in the [locales/](file:///c:/Users/Administrator/Documents/trae_projects/Stock%20simulator/locales/) directory (e.g., `ja-JP.js`), exporting a global object (e.g., `window.JA_JP`) with the same key structure as `zh-CN.js`
2. Register the new language in the `locales` object in [i18n.js](file:///c:/Users/Administrator/Documents/trae_projects/Stock%20simulator/i18n.js)
3. Add the corresponding `<script>` tag and language dropdown option in [index.html](file:///c:/Users/Administrator/Documents/trae_projects/Stock%20simulator/index.html)
4. Add `data-i18n` attributes to new UI text elements and add corresponding keys to both language resource files
5. Replace hardcoded strings in dynamically generated text with `I18n.t('key')` calls

---

## Future Roadmap

- [x] Expand stock universe (300+ stocks added)
- [ ] Implement more complex market simulation
- [ ] Add multiplayer competition mode
- [x] Increase achievement variety (50+ items added)
- [x] Optimize the user interface
- [x] Add beginner tutorial support
- [x] Chinese-English bilingual switching (full i18n system implemented)
- [ ] Support more languages (Japanese, Korean, etc.)

---

## Contact & Credits

If you have questions or suggestions, please contact the developer:

- Bilibili: Moke Xintu (莫客星图)
- YouTube: @moke_xingtu

---

## Contributing

Issues and Pull Requests are welcome! Please follow these guidelines:

### Submitting Issues

- Before submitting a new issue, please search for existing similar issues
- Clearly describe the problem, reproduction steps, and browser type/version
- If there are error messages, please include the full console error output

### Submitting Pull Requests

1. Fork this repository and create a feature branch: `git checkout -b feature/your-feature`
2. Follow the existing coding style: vanilla ES6+ JavaScript, modular design, Chinese comments
3. If adding new UI text, add corresponding translation keys to both `locales/zh-CN.js` and `locales/en-US.js`
4. If adding features that change the user data structure, add backward-compatible migration logic in `loadUsers()`
5. Test in mainstream browsers (Chrome, Firefox, Edge) before submitting
6. In the PR description, explain the changes, testing performed, and whether there are breaking changes

### Coding Standards

- JavaScript: ES6+ syntax, class-based OOP design, camelCase method names
- CSS: Use CSS variables for theme colors, BEM-like naming convention
- HTML: Semantic tags, all translatable text must have `data-i18n` attributes
- Comments: Add Chinese comments for core logic; functions should document parameters and return values

---

## License

This project is open-sourced under the [MIT License](file:///c:/Users/Administrator/Documents/trae_projects/Stock%20simulator/LICENSE). You are free to use, modify, and distribute it.

Copyright (c) 2026 MOX

---

**Version**: v2.13.2
**Developer**: Moke Xintu (Bilibili)

---

### 🔒 User Data Migration

- **Pre-v2.4.x users' legacy password hashes are automatically upgraded to PBKDF2** on their first successful login in v2.5.0. No manual action required.
- The upgrade requires Web Crypto API support (`crypto.subtle.deriveBits`). All modern browsers (Chrome 66+, Firefox 57+, Safari 10.1+, Edge 79+) qualify.
- If Web Crypto is unavailable, the legacy hash is **preserved** (no upgrade) and the user can still log in normally.

---

## Star History

<a href="https://www.star-history.com/?repos=ljy969%2FStock-simulator&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=ljy969/Stock-simulator&type=date&theme=dark&legend=top-left&sealed_token=-XxWGc_j93mihOeFBD_uLH8LUOGXrnCG3rfpaH0KGlF3EAsN4gi39zb_Cgv-owfEiStKCJYBQIcgUzDAtLl37CTZnVn1SeYblkwf1AaRcGmopZRz5u-6rg" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=ljy969/Stock-simulator&type=date&legend=top-left&sealed_token=-XxWGc_j93mihOeFBD_uLH8LUOGXrnCG3rfpaH0KGlF3EAsN4gi39zb_Cgv-owfEiStKCJYBQIcgUzDAtLl37CTZnVn1SeYblkwf1AaRcGmopZRz5u-6rg" />
   <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=ljy969/Stock-simulator&type=date&legend=top-left&sealed_token=-XxWGc_j93mihOeFBD_uLH8LUOGXrnCG3rfpaH0KGlF3EAsN4gi39zb_Cgv-owfEiStKCJYBQIcgUzDAtLl37CTZnVn1SeYblkwf1AaRcGmopZRz5u-6rg" />
 </picture>
</a>