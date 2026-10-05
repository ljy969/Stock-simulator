<p align="right">
  <a href="README_EN.md">
    <img src="https://img.shields.io/badge/Language-English-blue?style=for-the-badge" alt="English README" />
  </a>
</p>

# 股市模拟器

一个纯娱乐、零压力的 A 股模拟炒股平台。所有数据均在浏览器本地生成与存储，不连接任何真实行情接口，用户可在无资金风险的环境中学习股票交易规则、体验市场波动并测试自己的交易策略。

> 版本：v2.13.5
> 更新时间：2026-10

> 开发者：莫客星图（Bilibili）

---
<div align="center">
  <a href="https://www.bilibili.com/video/BV1sWNwzVEek/" target="_blank">
    <img src="./images/cover.jpg" width="600" alt="全新股票模拟器演示视频">
  </a>
  <p>📺 <b><a href="https://www.bilibili.com/video/BV1sWNwzVEek/" target="_blank">点击此处在 Bilibili 上观看完整演示视频。</a></b></p>
  <p>▶️ <b><a href="https://youtu.be/SESTTuLqTi4?si=GlUPLyUWA1FDomzB" target="_blank">点击此处在 YouTube 上观看完整的演示视频。</a></b></p>
</div>

---

## 目录

- [项目简介](#项目简介)
- [功能特性](#功能特性)
- [技术栈](#技术栈)
- [项目结构](#项目结构)
- [快速开始](#快速开始)
- [核心功能详解](#核心功能详解)
  - [用户系统](#用户系统)
  - [存档系统](#存档系统)
  - [市场模拟系统](#市场模拟系统)
  - [交易系统](#交易系统)
  - [自动交易系统](#自动交易系统)
  - [成就系统](#成就系统)
  - [时间系统](#时间系统)
  - [K 线图表系统](#k-线图表系统)
  - [调试面板](#调试面板)
  - [主题与界面](#主题与界面)
  - [国际化系统（i18n）](#国际化系统i18n)
  - [新手教程](#新手教程)
  - [数据安全与备份](#数据安全与备份)
- [交易规则](#交易规则)
- [界面导览](#界面导览)
- [常见问题](#常见问题)
- [开发者说明](#开发者说明)
- [贡献规范](#贡献规范)
- [许可证](#许可证)
- [未来计划](#未来计划)
- [贡献规范](#贡献规范)
- [Star历史](#Star历史)

---

## 项目简介

股市模拟器是一个基于纯前端技术（HTML5 + CSS3 + JavaScript）构建的零依赖 Web 应用，无需后端服务器，无需数据库，打开 `index.html` 即可运行。项目模拟了 A 股市场的核心交易机制，包括涨跌停板、熔断、T+1 交收、手续费、印花税等真实规则，同时内置 300 余只涵盖 80 多个行业的 A 股股票池，让用户能够在一个相对真实的环境中进行模拟交易训练。

项目定位为「纯娱乐」工具，不涉及任何真实资金，所有行情数据均由算法在本地实时生成，旨在帮助用户：

- 学习股票交易的基本流程与规则
- 理解涨跌停、T+1、手续费等市场机制
- 测试交易策略（特别是通过自动交易功能）
- 在零压力环境中体验市场波动的心理博弈

---

## 功能特性

### 基础功能

- **完整的用户系统**：支持注册、登录、修改密码、注销账户、记住上次用户名
- **多存档管理**：每个用户最多可拥有 50 个独立存档，支持创建、加载、重命名、删除、切换；存档列表实时显示已用容量，接近浏览器 LocalStorage 配额时会给出提示
- **300+ 只 A 股股票池**：覆盖银行、券商、白酒、医药、半导体、新能源、军工等 80+ 个行业
- **较为真实的市场模拟**：随机价格波动、成交量联动、五档行情、K 线数据
- **完整的交易闭环**：买入、卖出、持仓管理、成交记录、浮动盈亏实时计算
- **T+0 / T+1 双模式**：可在开局时选择是否开启当日回转交易
- **可配置的手续费体系**：买入手续费与卖出手续费（含印花税）均可自定义

### 进阶功能

- **自动交易系统**：支持多股票、多条件策略，包含价格阈值、涨跌幅、盈利目标、时间间隔等触发条件，以及止损止盈风险控制
- **成就系统**：50+ 项成就，分为青铜、白银、黄金、传说四个等级，另含大量彩蛋成就
- **K 线图表**：自绘 Canvas K 线图，支持滚轮缩放、拖拽平移、框选放大、触摸操作，并附带成交量柱状图
- **K 线与价格重置**：可按单只、多只或全部股票重新掷出价格与 K 线，每只股票的随机序列彼此独立并随存档持久化
- **时间控制系统**：模拟市场交易时间，支持手动调整、预设时间、随机时间
- **调试面板**：隐藏的开发者面板，可修改资金、解锁成就、控制时间、重置行情
- **多主题支持**：深色、浅色、节日限定三套主题
- **中英文双语切换**：内置完整的国际化（i18n）系统，支持一键切换中英文界面，语言偏好自动保存
- **新手教程**：9 步引导式教程，首次进入游戏自动触发
- **存档导入导出**：支持按「单个存档」或「整个用户全部数据」两种方式加密导入/导出，跨设备迁移更灵活
- **响应式设计**：适配桌面端与移动端

---

## 技术栈

| 类别 | 技术 |
| --- | --- |
| 前端结构 | HTML5 |
| 样式 | CSS3（CSS 变量、Flexbox、Grid、响应式布局） |
| 逻辑 | 原生 JavaScript（ES6+，Class、Map、Set、Promise） |
| 图表 | Canvas 2D API（自实现 K 线与成交量绘制） |
| 数据存储 | LocalStorage（本地存储） |
| 数据加密（v2.5.0）| XOR + Base64 自实现加密；**密码使用 PBKDF2-SHA-256（10 万轮 + 随机盐）** |
| 依赖 | 无任何第三方库，零依赖 |

---

## 项目结构

```
Stock simulator/
├── index.html              # 主页面，包含所有界面结构
├── game.js                 # 核心游戏逻辑（8000+ 行）
│   ├── LimitManager 类           # 涨跌停与熔断管理
│   └── StockSimulator 类         # 主控制器，包含全部业务逻辑
├── stockData.js            # A 股股票池数据（387 只股票）
├── achievements.js         # 成就系统配置与逻辑
├── crypto.js               # 加密工具（XOR + Base64 + 哈希 + UUID）
├── i18n.js                 # 国际化核心模块（I18nManager 类）
├── locales/                # 语言资源文件目录
│   ├── zh-CN.js            # 中文语言资源（570 条翻译）
│   └── en-US.js            # 英文语言资源（570 条翻译）
├── styles.css              # 全部样式（含三套主题 + 语言切换 UI）
├── images/                 # 项目图片资源
│   ├── cover.jpg           # 中文版封面图
│   └── cover-en.png        # 英文版封面图
└── LICENSE                 # MIT 开源许可证
```

### 文件加载顺序

`index.html` 在页面末尾按以下顺序加载脚本，存在依赖关系，不可调整顺序：

```html
<script src="stockData.js"></script>     <!-- 全局变量 StockPool -->
<script src="crypto.js"></script>        <!-- 全局对象 Crypto -->
<script src="achievements.js"></script>  <!-- 全局对象 AchievementSystem -->
<script src="locales/zh-CN.js"></script> <!-- 全局对象 ZH_CN（中文资源） -->
<script src="locales/en-US.js"></script> <!-- 全局对象 EN_US（英文资源） -->
<script src="i18n.js"></script>          <!-- 全局对象 I18n（国际化实例） -->
<script src="game.js"></script>          <!-- 主程序，依赖上述全部 -->
```

---

## 快速开始

### 系统要求

- 任意现代 Web 浏览器（Chrome、Firefox、Edge、Safari 等近期版本）
- 支持 LocalStorage 与 Canvas API
- 无需安装任何运行时或依赖

### 安装与运行

1. 将整个项目文件夹下载到本地
2. 双击 `index.html`，或在浏览器中通过「打开文件」选择该文件
3. 在登录界面点击「注册」按钮，填写用户名（2-20 位）与密码（6-20 位）
4. 注册成功后使用该账号登录
5. 在存档选择界面点击「+ 开启新局」
6. 配置初始资金、手续费、交易规则后点击「开始游戏」
7. 进入主界面后即可开始模拟交易

> 提示：首次进入游戏会自动触发新手教程，可点击「跳过教程」略过。

---

## 核心功能详解

### 用户系统

用户数据全部存储于浏览器的 LocalStorage 中，键名为 `stock_simulator_users`，存储前会经过 XOR + Base64 加密。

**用户数据结构**：

```javascript
{
  username: String,              // 用户名
  passwordHash: String,          // 密码哈希（Crypto.hash 生成）
  createdAt: Number,             // 注册时间戳
  saves: Array,                  // 存档数组
  achievements: Array,           // 用户级成就（跨存档）
  tutorialCompleted: Boolean,    // 是否完成教程
  theme: 'dark' | 'light' | 'festival',  // 主题偏好
  refreshRate: Number,           // 行情刷新速度（毫秒）
  lang: 'zh-CN' | 'en-US'        // 语言偏好（国际化）
}
```

**功能列表**：

- 注册：用户名 2-20 位，密码 6-20 位，需二次确认；用户名不可重复（忽略大小写，"Admin" 与 "admin" 视为同一用户名）。用户名仅允许中文、字母、数字、下划线、连字符，且禁止 `__proto__`、`constructor` 等保留名（v2.6.0 起）
- 登录：密码经哈希比对验证；支持回车键快速登录；用户名大小写不敏感解析（输入大小写不同也能登录到同一账号，仅大小写不同且并存的旧账号仍要求精确匹配）
- 记住上次用户：登录成功后记录最近用户名，下次打开登录页自动预填该用户名（出于安全考虑不保存密码，仍需手动输入密码登录）
- 修改密码：需验证当前密码，新密码需二次确认
- 注销账户：需输入 `DELETE` 确认，操作不可恢复
- 数据迁移：旧用户数据在加载时自动补齐缺失字段（`tutorialCompleted`、`theme`、`refreshRate`）

### 存档系统

每个用户可创建多个独立存档，存档间数据完全隔离。

**存档数据结构**：

```javascript
{
  id: String,                    // UUID
  createdAt: Number,             // 创建时间戳
  fund: Number,                  // 当前可用资金（元）
  initialFund: Number,           // 初始资金
  holdings: Object,              // 持仓字典，键为股票代码
  records: Array,                // 成交记录（含游戏日 dayIndex / 游戏时钟，最多保留 100 条）
  watchlist: Array,              // 自选股代码列表
  achievements: Array,           // 本存档成就
  settings: {                    // 本局交易规则设置
    buyFee: Number,              // 买入手续费率
    sellFee: Number,             // 卖出手续费率（含印花税）
    t0Mode: Boolean,             // 是否开启 T+0
    tradeUnit: 1 | 100           // 最小交易单位（1 股或 1 手）
  },
  dayTrades: Object,             // 当日交易记录（用于 T+1 校验）
  gameStats: Object,             // 本局统计数据（用于成就判定）
  autoTrade: Object              // 自动交易配置与记录
}
```

**持仓结构**：

```javascript
{
  '600519': {
    name: '贵州茅台',
    quantity: Number,            // 持仓数量
    avgPrice: Number,            // 持仓均价
    totalCost: Number            // 持仓总成本
  }
}
```

**自动存档**：行情与游戏时钟会随每次 market tick 自动写入 localStorage（并节流为约 2 秒一次），切换标签页（`visibilitychange`）与关闭/刷新页面（`beforeunload`）时也会立即保存；因此空转一段时间后刷新不会回退时间或价格，重开当天最后一根 K 线也与现价一致。

**多标签页合并（v2.10.0）**：同一账号在两个标签页同时游玩时，`saveUsers()` 会在写入前读取磁盘上的最新密文，以「本次会话开始时的基线 / 本标签页内存中的存档 / 磁盘上的存档」做三方合并，按增量累加资金、持仓数量与成本、成交记录、当日交易计数、统计数据与自动交易冷却时间，避免后写入的标签页整体覆盖前一个标签页的进度。此外还监听 `storage` 事件：其它标签页写入后会立即提示并刷新界面；若其它窗口删除了当前账号，本标签页会立刻停止行情与自动交易定时器、清除会话并返回登录页，且不会再把它写回存储（v2.13.2）；若其它窗口删除的是**别的账号**（本标签页登录的是另一个账号），本标签页也会在收到存储变更后以磁盘为准，把该账号从内存中一并移除，因此后续的自动保存、交易保存都不会把已删除的账号写回、复活（v2.13.3）。合并只累加增量、不解决同一存档内的重复操作（例如两个标签页同时卖出同一笔持仓），极端情况下数量会被夹紧到 0。

**存档操作**：创建、加载、重命名（1-20 字符）、删除、切换。导入/导出集中**在“选择存档”页**：可为任意单个存档单独导出加密文本文件，也可导出/导入备份。导出的备份不包含密码哈希。「导入单个存档」把备份中选定的一个存档追加到当前账号（自动生成新存档 id）；「导入所有数据」把备份中的全部存档合并进当前账号，与当前账号 id 相同的存档自动跳过。两种导入都不创建新账号、不修改当前账号的密码或偏好、**不需要重新登录**。导入会保留备份中的行情快照（游戏时钟、K 线、随机种子）与自动交易冷却时间/记录；单个账号存档上限 50 个，超出部分会被截断并明确提示。

### 市场模拟系统

市场数据由 [game.js](file:///c:/Users/Administrator/Documents/trae_projects/Stock%20simulator/game.js) 中的 `updateMarket()` 方法按设定的刷新速度（默认 3 秒）周期性生成。

**股票数据结构**：

```javascript
{
  code: '600519',
  name: '贵州茅台',
  industry: '白酒',
  price: Number,                 // 当前价
  prevClose: Number,             // 前一交易日收盘价
  open: Number,                  // 当日开盘价
  high: Number,                  // 当日最高价
  low: Number,                   // 当日最低价
  volume: Number,                // 当日成交量
  dailyVolume: Number,           // 当日成交量
  prevDailyVolume: Number,       // 前一交易日成交量
  avgVolume: Number,             // 5 日平均成交量
  history: Array,                // K 线历史（最多 60 根）
  bid: Array,                    // 买五档
  ask: Array                     // 卖五档
}
```

**价格波动算法**：

- 普通股票：每个 tick 产生 `(-2% ~ +2%)` 的随机波动，公式为 `(Math.random() - 0.5) * 0.04`
- 彩蛋股票「影视飓风」（代码 `999999`）：70% 概率上涨（0.5% ~ 3%），30% 概率下跌（-0.5% ~ -2%），表现优于普通股票
- 价格波动后立即通过 `LimitManager.clampPrice()` 限制在涨跌停范围内，并四舍五入到 0.01 元

**成交量算法**：当日成交量 = 前一交易日成交量 × (1 + 涨跌幅 × 1.5)，涨跌幅限制在 `[-20%, +20%]` 内，并附加 ±3% 的随机波动。

**交易日切换**：交易日由游戏时钟推导——游戏时钟跨过午夜、进入下一个交易时段时触发换日。切换时保存前一日收盘价、重置熔断状态、清空 `dayTrades`（解除 T+1 限制）、更新 5 日均量、重置当日数据并新增一根 K 线。

**五档行情**：每个 tick 重新生成买卖各五档报价，以当前价为基础按 0.01 元价差递推，附加随机量。

### 交易系统

交易系统包含完整的买入、卖出、校验、记录、统计流程。

**交易流程**：

1. 用户在交易页面输入股票代码、价格、数量
2. `validateTradeParameters()` 校验参数合法性
3. `executeTrade()` 执行交易并扣款/入账
4. `recordTrade()` 写入成交记录
5. `updateAfterTrade()` 刷新持仓与界面

**下单价格输入框**：股票代码校验通过后会自动填入当前市价；此后只要你手动改动过价格，行情刷新就不会再覆盖它（价格框保持你输入的限价），重新输入/切换股票代码或成交后会自动恢复跟随市价。

**参数校验规则**：

- 必须在交易时间内（9:30-11:30、13:00-15:00）
- 价格必须大于 0
- 买入价不得超过涨停价，卖出价不得低于跌停价
- 该股票不得处于熔断状态
- 若输入价格与市价偏差超过 10%，需用户二次确认
- 股票代码必须存在于股票池中

**T+1 规则**（默认模式，对齐真实 A 股）：

- 当日买入的股票，当日不得卖出（仅 `t0Mode = false` 时）
- 当日卖出后，当日可以再买回同一只股票（与真实 A 股一致）；但当日重新买入的部分仍受上一条限制，次日才可卖出
- 通过 `dayTrades` 字段记录每只股票当日买卖数量

**手续费计算**：

- 买入手续费 = 买入金额 × 买入费率（默认 0.03%）
- 卖出手续费 = 卖出金额 × 卖出费率（默认 0.13%，含印花税）
- 费率在开局设置中可自定义

**交易单位**：开局可选「1 股」或「100 股（1 手）」作为最小交易单位，所有数量自动按此单位取整。

**成交记录**：每笔交易记录游戏日（`dayIndex`）、游戏时间（显示为「第 N 天 HH:MM」）、代码、名称、方向、价格、数量、金额、手续费、盈亏，单存档最多保留 100 条。

### 自动交易系统

自动交易是本项目的进阶功能，允许用户配置多只股票的自动化交易策略，由系统按设定的条件自动触发买卖。

**配置参数**：

| 参数 | 说明 |
| --- | --- |
| 股票代码 | 必须为股票池中存在的代码 |
| 交易方向 | 买入 / 卖出 |
| 触发条件类型 | 价格阈值 / 涨跌幅 / 盈利目标 / 时间间隔 |
| 触发条件 | 高于 / 低于 / 等于 某个数值 |
| 交易数量 | 可按 1/4、1/2、全仓快速填充 |
| 交易价格 | 市价 或 限价 |
| 止损金额 | 亏损达到阈值时自动卖出（留空则不设置） |
| 止盈金额 | 盈利达到阈值时自动卖出 |
| 最大交易金额 | 单笔交易金额上限 |

**参数校验**：交易数量必须为不超过 10 亿的正整数，且为交易单位的整数倍；盈利目标与止盈金额必须为正数；留空的可选风控项表示不限制。手动与自动交易的「全仓」均按买入费率预留手续费。

**触发条件说明**：

- **价格阈值**：当前价高于/低于/等于设定值时触发
- **涨跌幅**：当日涨跌幅高于/低于/等于设定百分比时触发
- **盈利目标**：仅适用于卖出，基于持仓成本的盈亏金额达到设定值时触发
- **时间间隔**：每 30 秒自动触发一次（不受条件值约束）

**冷却机制**：为防止重复交易，每只股票每次触发后有冷却时间，默认 5 秒，时间间隔模式为 30 秒。冷却时间随存档持久化，暂停、继续或切换存档都不会重置，只有「停止」自动交易才会清零。

**风险控制**：卖出操作除基础触发条件外，还会检查止损止盈。当盈亏金额达到止损阈值（负数）或止盈阈值（正数）时，自动触发卖出。连续失败达到 20 次会触发熔断，自动暂停并弹出一次提示（暂停后界面状态即时刷新，「继续」时熔断计数清零），防止恒不满足的条件无限空转。

**统计与记录**：自动交易单独维护统计数据（总交易数、成功/失败数、总盈亏）与交易记录（最多 50 条），可在「交易记录」标签页查看。自动交易买入同样计入本局统计（交易次数、行业覆盖与最大持仓数），可正常解锁持仓类成就。

**操作**：添加、编辑、删除单条配置，一键重置全部配置，启动、暂停、停止自动交易。暂停游戏时间会同时冻结行情与自动交易，不会按真实时钟继续成交。

### 成就系统

成就系统定义于 [achievements.js](file:///c:/Users/Administrator/Documents/trae_projects/Stock%20simulator/achievements.js)，共 50+ 项成就，分为四个等级及大量彩蛋成就。

**成就等级**：

| 等级 | 颜色 | 定位 |
| --- | --- | --- |
| 青铜（bronze） | `#cd7f32` | 入门成就，完成基础操作即可解锁 |
| 白银（silver） | `#c0c0c0` | 进阶成就，需要一定的交易量与技巧 |
| 黄金（gold） | `#ffd700` | 高手成就，需要显著的投资回报与经验 |
| 传说（legend） | 渐变红黄 | 大神成就，极难达成 |

**成就类别**：

- **常规成就**：首次交易、首次盈利、累计交易次数、累计盈利金额、收益率、连盈次数、行业覆盖、日内交易等
- **彩蛋成就**：山顶站岗、反向操作大师、FOMO 患者、恐慌抛售、长期股东、摇摆不定、梭哈选手、逆风翻盘、钻石手、纸手、幸运星、倒霉蛋、周末战士、强迫症、对称美学、纳税大户、股灾幸存者、逆向投资者、趋势追逐者、价值投资者、技术派、消息派、早起的鸟儿、夜猫子等

> 注：`山顶站岗`、`反向操作大师`、`逆风翻盘`、`钻石手`、`股灾幸存者`、`逆向投资者`、`技术派`、`消息派`、`跑赢大盘` 共 9 项成就对应的统计字段尚未落库，当前在成就墙显示为「暂未开放」，不会解锁。

**判定机制**：每次交易后调用 `calculateSaveStats()` 计算当前存档统计数据，再由 `checkAchievements()` 比对未解锁成就的触发条件。新解锁成就会弹出通知，可在个人主页查看。日期/时间类成就（日内交易、摇摆不定、长期股东、周末战士、早起的鸟儿、夜猫子等）统一按**游戏日历**判定：成交记录保存游戏日 `dayIndex` 与游戏时钟，游戏第 0 天对应存档创建当天的星期，与真实日期无关。

**成就海报**：每项成就可通过 Canvas 生成一张 600×800 的分享海报，包含成就图标、名称、等级、描述、用户名与日期。

### 时间系统

模拟市场采用简化的时间流逝机制，与真实时间无对应关系。

**时间结构**：

```javascript
gameTime = {
  hour: 9,                       // 小时
  minute: 30,                    // 分钟
  minutesPerTick: 1,             // 每个 tick 推进的分钟数
  manualSet: Boolean,            // 是否手动设置过
  dayIndex: Number               // 游戏日历天数，跨过午夜时递增
}
```

**交易时段判定**：

- 上午盘：9:30 - 11:30
- 下午盘：13:00 - 15:00
- 与真实 A 股一致采用左闭右开区间：11:30 与 15:00 收盘整点即停止交易，最后可交易时刻为 11:29 / 14:59
- 非上述时段为非交易时间，市场停止更新，无法交易

**时间推进**：每个 market tick 推进 1 游戏分钟，从 9:30 开始连续走完整个 24 小时。非交易时段时钟照常推进，但行情数据完全冻结、无法交易；跨过午夜后游戏日历天数递增，下一个交易时段开始时执行换日。

**时间控制**：在调试面板中可手动设置任意时间，或使用预设按钮一键跳转：

- 上午开盘（9:30）
- 早起的鸟儿（9:35）
- 上午收盘前（11:25）
- 午间休市（11:35）
- 下午开盘（13:00）
- 收盘前（14:55）
- 随机时间

> 暂停游戏时间时，行情更新与自动交易会一并冻结，恢复后继续。

### K 线图表系统

K 线图完全基于 Canvas 2D API 自实现，无任何第三方图表库。

**图表状态**：

```javascript
chartState = {
  scaleX: Number,                // X 轴缩放比例
  scaleY: Number,                // Y 轴缩放比例
  offsetX: Number,               // X 轴偏移（拖拽）
  offsetY: Number,               // Y 轴偏移
  isDragging: Boolean,           // 是否正在拖拽
  isSelecting: Boolean,          // 是否正在框选
  dragStartX: Number,
  dragStartY: Number,
  selectionStart: Object,        // 框选起点
  selectionEnd: Object           // 框选终点
}
```

**支持的交互**：

- 滚轮缩放：在图表上滚动鼠标滚轮缩放 X 轴
- 拖拽平移：按住鼠标左键拖拽图表横向移动
- 框选放大：按住 Shift 或鼠标右键框选区域放大
- 触摸操作：单指拖拽、双指捏合缩放（移动端）
- 工具栏按钮：放大、缩小、重置三个快捷按钮

**图表组成**：

- 主图：K 线（蜡烛图），红涨绿跌（A 股惯例）
- 副图：成交量柱状图
- 历史数据：每只股票保留最近 60 根 K 线
- 五档行情：买卖各五档报价与挂单量

**K 线重置**：

行情页面左侧栏提供「重置K线」入口，可对一只、多只或全部股票重新掷出价格与 K 线：

- 重置范围：仅当前股票、全部股票，或在弹窗中任意勾选若干只
- 快捷选择：全选、全不选、当前自选列表、按当前搜索结果预选
- 列表过滤：按代码或名称搜索过滤待重置股票
- 重置内容：以新的随机基价重建 60 根 K 线，整段历史重缩放到该基价，今日 K 线压平为平开，因此重置瞬间涨跌幅为 0，不会立即触及涨跌停
- 相互隔离：未选中的股票价格与 K 线完全不变
- 无关数据：资金、持仓数量与成本、成交记录、手续费、已实现盈亏与成就均不受影响
- 持久化：每只股票的重置盐值随存档保存，刷新或重新载入后 K 线保持一致

### 调试面板

调试面板为隐藏功能，用于开发调试与趣味玩法。

**开启方式**：在「我的」页面连续点击个人用户名 5 下即可打开。

**功能**：

- **资金修改**：直接设置当前存档的可用资金
- **成就解锁**：一键解锁全部成就、解锁单个成就、取消解锁全部、选择取消解锁
- **时间控制**：手动设置时间或使用预设按钮
- **行情控制**：重置行情数据、清空本局存档

### 主题与界面

提供三套主题，通过 CSS 变量实现切换：

| 主题 | 说明 | 主色调 |
| --- | --- | --- |
| 深色（dark） | 默认主题 | `#0d1117` 背景，GitHub 风格 |
| 浅色（light） | 日间模式 | `#f5f5f5` 背景 |
| 节日限定（festival） | 特殊主题 | `#1a0a2e` 深紫背景，金色主色 |

**涨跌配色**：遵循 A 股惯例，红色（`#ff4d4f`）表示上涨，绿色（`#52c41a`）表示下跌。

**行情刷新速度**：可在设置中选择 1 秒、3 秒、5 秒三档，影响市场更新频率。

**响应式**：通过 viewport meta 与 CSS 媒体查询适配不同屏幕尺寸，移动端支持触摸操作。

### 国际化系统（i18n）

项目内置完整的中英文国际化系统，由 [i18n.js](file:///c:/Users/Administrator/Documents/trae_projects/Stock%20simulator/i18n.js) 中的 `I18nManager` 类实现，语言资源存放于 [locales/](file:///c:/Users/Administrator/Documents/trae_projects/Stock%20simulator/locales/) 目录。

**核心机制**：

- **翻译函数**：`I18n.t(key, params)` 通过键名获取翻译文本，支持 `{placeholder}` 参数插值
- **DOM 自动刷新**：`I18n.applyToDOM()` 批量更新所有标记了 `data-i18n` / `data-i18n-placeholder` / `data-i18n-title` / `data-i18n-html` 属性的节点
- **即时切换**：调用 `I18n.setLanguage(lang)` 或 `I18n.toggleLanguage()` 即时切换语言并刷新全页
- **回调通知**：`I18n.onChange(callback)` 注册语言变更回调，供动态内容重新渲染

**DOM 标记约定**：

| 属性 | 作用 |
| --- | --- |
| `data-i18n="key"` | 设置元素的 `textContent` |
| `data-i18n-placeholder="key"` | 设置输入框的 `placeholder` |
| `data-i18n-title="key"` | 设置元素的 `title` |
| `data-i18n-html="key"` | 设置元素的 `innerHTML`（用于含 HTML 标签的文本） |

**语言切换 UI**：

- 登录页右上角 🌐 圆形按钮：单击即可在中英文间快速切换
- 设置面板语言下拉框：可选择「中文」或「English」

**语言偏好持久化**：

- 已登录用户：语言偏好保存在用户数据的 `lang` 字段，登录时自动恢复
- 未登录用户：语言偏好保存在 LocalStorage（键名 `stock_simulator_lang`）
- 回退机制：找不到翻译键时自动回退到中文

**本地化适配**：

- 金额格式化：中文使用「万/亿/万亿」单位，英文使用「K/M/B/T」单位；单位按四舍五入后的数值选择，进位边界会自动升档（如 99999999.99 → ¥1.00亿、9999.996 → ¥1.00万）；负数金额的符号写在货币符号之前（-¥42.33），四舍五入后为 0 的负数不显示负号（0.00%、¥0.00）
- 明细表金额：持仓明细、成交记录等需要逐行对比的表格不做单位缩写，统一保留到分（如 ¥12.51、¥1200.96），同一行内风格一致；总资产、总市值、浮动盈亏等汇总项仍按上述单位缩写显示
- 日期格式化：使用 `toLocaleString()` 根据当前语言区域格式化
- 成就系统：成就名称与描述均支持双语切换（成就海报中的标题/名称/描述会按画布宽度自动缩放字号，避免长英文被边框裁切）
- 页面标题：`document.title` 随语言切换同步更新

### 新手教程

首次进入游戏的用户会自动触发 9 步引导教程，覆盖以下内容：

1. 欢迎介绍
2. 行情页面与股票列表
3. 五档行情说明
4. 导航栏切换
5. 交易页面下单流程
6. 持仓页面说明
7. 个人主页功能
8. 调试面板开启提示
9. 结束语

教程通过高亮目标元素、悬浮提示框、箭头指引的方式呈现，支持跳过、上一步、下一步；最后一步按钮显示为「完成」，点击后结束教程并自动切回行情页面。悬浮提示框会自动测量自身尺寸并限制在视口内，过长内容可滚动。教程完成后会在用户数据中标记 `tutorialCompleted = true`，不再自动触发。

### 数据安全与备份

**本地加密存储**：所有用户数据写入 LocalStorage 前经过 `Crypto.encrypt()` 处理（XOR 加密 + Base64 编码），密钥为 `stock-simulator-2024`。

> ⚠️ **重要安全声明（v2.5.0 起明确）**：本项目是**纯前端**应用，所有加密和哈希都在**用户自己的浏览器**中运行。这意味着任何能在浏览器中执行 JavaScript 的人（即用户自己，包括通过 DevTools 控制台）都能读写 LocalStorage、调用 `Crypto.decrypt` 解密所有数据。`Crypto.encrypt/decrypt` 的目的是**防止无关用户偶然看到 LocalStorage 内容**（例如家庭共享电脑、截图、备份文件），**它不是对抗性安全机制**。请勿在任何真正敏感的场景下使用本应用的密码。

**密码哈希（v2.5.0 升级）**：自 v2.5.0 起，新用户密码使用 **PBKDF2-SHA-256** 派生，**10 万轮迭代 + 每用户随机 16 字节盐**（存储格式：`pbkdf2-sha256-100k$<saltHex>$<derivedHex>`）。v2.5.0 之前注册的用户使用旧的 32 位弱哈希；首次登录成功后，密码哈希将**自动升级**到 PBKDF2 格式，无需任何用户操作。

**存档导出**：导出入口都在「选择存档」页。点击存档卡片上的「导出」可只导出该存档（文件名格式 `stock_simulator_save_{用户名}_{存档名}_{时间戳}.txt`）；点击下方「导出所有数据」导出当前用户全部数据（文件名格式 `stock_simulator_backup_{用户名}_{时间戳}.txt`）。两种导出内容都会剥离 `passwordHash`，备份文件不携带任何密码哈希；导出走与本地存储相同的序列化逻辑，因此行情快照（游戏时钟、K 线、随机种子）、当日交易计数与自动交易配置/计数器/记录都会一并包含。

**存档导入（v2.5.0 加固）**：入口在「选择存档」页，分两种模式：「导入单个存档」从备份中挑一个存档（文件含多个存档时会弹出列表供选择）追加到当前登录账号；「导入所有数据」导入备份中的完整用户数据。两种导入流程都包含：
- **5 MB 文件大小上限**（防止 DoS）
- **用户数据 schema 校验**（拒绝畸形 JSON、错误字段类型）
- **每条存档的字段白名单**（存档名限制为中文/字母/数字/常用符号，限制 1-20 字符；`tradeUnit` 仅接受 `{1, 100}`；`buyFee`/`sellFee` 限制在 `[0, 0.01]`）
- **合并上限**：单个备份最多导入 50 个存档，超出部分会被截断并提示
- **状态完整保留**：导入后行情快照（游戏时钟、K 线、随机种子）、自动交易冷却时间（每只股票的上次触发时间）与自动交易记录均会恢复
- **所有用户可控字符串在渲染前进行 HTML 转义**，防止通过恶意存档名注入脚本
- **合并进当前账号**：两种导入都只把存档追加/合并进当前登录账号（id 相同的存档自动跳过），不创建新账号、不改动当前账号的密码/偏好、不需要重新登录

**存档写入失败保护（v2.6.0）**：若 LocalStorage 不可写（隐私模式、配额已满等），`saveUsers()` 会返回失败，交易将回滚到操作前的快照并提示用户，不会出现「界面已成交但数据未落盘」；交易成功提示也仅在数据成功落盘后展示。

**损坏数据保护（v2.6.0）**：`loadUsers()` 在解密/解析失败时，会先把原始密文备份到固定键名 `stock_simulator_users_corrupted_backup`（只保留最早的一份，避免每次刷新都写入新副本）再继续，不再直接覆盖，避免用户数据被不可逆地丢失。

**右键菜单**：全局禁用浏览器右键菜单，防止用户复制页面内容。

**浏览器后退**：监听 `popstate` 事件，当用户已退出登录时强制保持在登录页面，防止通过后退按钮进入已退出的页面。

---

## 交易规则

### 交易时间

| 时段 | 时间 |
| --- | --- |
| 上午盘 | 9:30 - 11:30 |
| 午间休市 | 11:30 - 13:00 |
| 下午盘 | 13:00 - 15:00 |
| 非交易时段 | 无法进行任何交易，市场数据停止更新 |

### 涨跌停限制

- 涨停幅度：+10%
- 跌停幅度：-10%
- 涨停价 = 前收盘价 × 1.10，四舍五入到 0.01 元
- 跌停价 = 前收盘价 × 0.90，四舍五入到 0.01 元
- 买入价不得超过涨停价，卖出价不得低于跌停价

### 熔断机制

- 熔断阈值：单 tick 波动达到 ±5%（异常闪涨 / 闪崩）
- 行情引擎的常规单 tick 波动被限制在 ±2% 以内（彩蛋股最高 +3%），同时以约 0.1% 的概率出现 ±4%~7% 的异常跳价，熔断正是用于捕捉这类异常波动
- 触发后该股票暂停交易 3 个 tick 周期（可通过 `LimitManager.circuitBreakerCooldown` 调整）
- 熔断状态在交易日切换时重置

### T+1 交收规则

- 默认采用 T+1 规则（对齐真实 A 股）：当日买入的股票次日方可卖出；当日卖出后可以再买回，但当日新买回的部分同样次日才可卖出
- 可在开局设置中开启 T+0 模式，解除当日回转交易限制

### 手续费

- 买入手续费率：默认 0.03%（可自定义，0% - 1%）
- 卖出手续费率：默认 0.13%（含印花税，可自定义，0% - 1%）
- 手续费在交易时实时扣除

### 交易单位

- 可选 1 股或 100 股（1 手）作为最小交易单位
- 所有交易数量自动按此单位取整

---

## 界面导览

应用采用单页应用（SPA）架构，通过屏幕（screen）与页面（page）切换实现多视图。

### 屏幕流程

```
登录/注册界面 → 存档选择界面 → 开局设置界面 → 主游戏界面
                                                          ↓
                              行情 | 交易 | 自动交易 | 持仓 | 我的
```

### 登录/注册界面（auth-screen）

- 登录表单：用户名、密码，支持回车登录
- 注册表单：用户名、密码、确认密码，支持回车在输入框间切换
- 语言切换：右上角 🌐 按钮，一键切换中英文
- 错误提示：实时显示登录/注册错误

### 存档选择界面（save-select-screen）

- 存档列表：展示已有存档，含名称、创建时间、资金概况
- 操作：加载、重命名、删除、导出（单个存档）、开启新局、导入单个存档/导入所有数据、导出所有数据、修改密码、注销账户、退出登录

### 开局设置界面（game-setup-screen）

- 初始资金：随机生成（50-200 万）或自定义（最低 10 万）
- 交易费率：买入手续费、卖出手续费（含印花税）
- 交易规则：T+0 开关、最小交易单位

### 主游戏界面（main-screen）

顶部导航栏包含五个主页面：

#### 行情页面（market-page）

- 左侧：搜索框、自选切换、可排序的股票列表（按名称/价格/涨跌幅）、「重置K线」按钮
- 右侧：股票详情，含名称代码、当前价、涨跌额、涨停/跌停价、市场时间与状态
- K 线图区：含工具栏（放大、缩小、重置）、K 线主图、成交量副图
- 五档行情：买卖各五档
- 快捷操作：买入、卖出、加入自选

#### 交易页面（trade-page）

- 左侧：买入/卖出表单（代码、价格、数量、快捷比例按钮、可用资金/预估金额）
- 右侧：当前持仓列表，含市场时间与状态

#### 自动交易页面（auto-trade-page）

- 三个标签页：触发条件、风险控制、交易记录
- 触发条件：已添加股票列表 + 添加股票表单
- 风险控制：止损、止盈、单次最大交易金额
- 交易记录：自动交易历史与统计数据
- 顶部状态指示器：未启动/运行中/已暂停

#### 持仓页面（portfolio-page）

- 资产概览：总资产、总市值、可用资金、浮动盈亏、总收益率
- 持仓明细表：股票、持仓、成本价、现价、市值、盈亏、盈亏率
- 成交记录表：游戏日与时间（第 N 天 HH:MM）、股票、方向、价格、数量、金额

#### 个人主页（profile-page）

- 用户信息：头像、用户名、注册时间
- 统计数据：局数、交易次数、成就数
- 成就墙：按等级展示已解锁成就，可展开全部
- 操作按钮：开启新局、切换存档、修改密码、退出登录、注销账户（存档导入/导出与修改密码/注销账户在「选择存档」页也有入口）

### 弹窗与面板

- 设置面板：主题切换、行情刷新速度、语言选择
- 密码修改面板：当前密码、新密码、确认新密码
- 调试面板：资金修改、成就解锁、时间控制、行情控制
- 重置K线面板：按范围或搜索勾选待重置股票，含全选/全不选/自选/搜索结果快捷项
- 成就弹窗：新成就解锁通知
- 新手引导：9 步教程覆盖层
- 修改存档名称模态窗
- 通用输入模态窗：导入冲突询问/导入认证/重命名等复用同一个遮罩输入框，支持密码遮罩与必填校验

---

## 常见问题

### 如何注册新账号？

在登录界面点击「注册」标签，输入用户名（2-20 位）、密码（6-20 位）并确认密码，点击「注册」按钮即可。

### 忘记密码怎么办？

目前系统不支持密码找回功能，请妥善保管密码。如遗忘密码，只能通过注销账户后重新注册（会丢失所有数据）。

### 数据存储在哪里？

所有数据存储在浏览器的 LocalStorage 中，不会上传到任何服务器。清除浏览器缓存或使用隐私模式会导致数据丢失，请提前到「选择存档」页通过「导出所有数据」备份（也可只导出某个存档）。如果在多个标签页同时打开同一账号，各标签页会在写入时自动做增量合并，尽量避免互相覆盖进度；但仍建议同一账号只在一个标签页中游玩。

### 如何在多设备间迁移存档？

在源设备的「选择存档」页点击「导出所有数据」下载 `.txt` 文件；在目标设备先注册/登录目标账号，进入「选择存档」页点击「导入所有数据」选择该文件，备份中的全部存档就会合并进该账号（相同的存档自动跳过）。如果只想把某一个存档搬到现有账号下，在源设备对该存档点「导出」，在目标设备点「导入单个存档」并选择该文件即可。导入都在当前账号内完成，无需额外设置密码或重新登录。

### 为什么非交易时间无法交易？

系统模拟真实 A 股交易时段（9:30-11:30、13:00-15:00），非交易时段市场停止更新且禁止交易。可通过调试面板手动调整时间。

### 如何打开调试面板？

在「我的」页面连续点击个人用户名 5 下即可打开调试面板。

### 成就如何解锁？

成就通过完成特定交易行为自动解锁，如首次交易、累计盈利达到金额、连续盈利次数、持有特定股票等。详情可在个人主页成就墙查看。

### 自动交易为什么不触发？

可能的原因：

- 当前不在交易时间内
- 距离上次触发未过冷却时间（默认 5 秒，时间间隔模式 30 秒）
- 触发条件未满足
- 可用资金或持仓不足
- 游戏时间处于「暂停」状态（行情与自动交易均被冻结）

### 「影视飓风」是什么股票？

代码 `999999` 的「影视飓风」是项目内置的彩蛋股票，具有 70% 上涨概率的特殊行情算法，表现优于普通股票。

### 如何切换中英文界面？

有两种方式切换语言：

- 在登录页面点击右上角的 🌐 按钮快速切换
- 进入游戏后在「设置」面板中的「语言」下拉框中选择

语言偏好会自动保存，下次打开时自动应用上次选择的语言。

---

## 开发者说明

### 核心类设计

项目由两个核心类构成：

**`LimitManager`**（[game.js:4-108](file:///c:/Users/Administrator/Documents/trae_projects/Stock%20simulator/game.js#L4-L108)）：涨跌停与熔断管理器，负责价格边界计算、熔断状态维护。

**`StockSimulator`**（[game.js:563-8375](file:///c:/Users/Administrator/Documents/trae_projects/Stock%20simulator/game.js#L563-L8375)）：主控制器，单例运行于 `window.game`，包含全部业务逻辑，主要方法分组如下：

| 模块 | 主要方法 |
| --- | --- |
| 用户管理 | `loadUsers`、`saveUsers`、`login`、`register`、`logout`、`deleteAccount`、`checkAutoLogin` |
| 存档管理 | `showSaveSelect`、`renderSaveList`、`startGame`、`loadSave`、`deleteSave`、`showRenameSaveModal` |
| 市场模拟 | `initMarketData`、`generateBasePrice`、`generateHistory`、`startMarketSimulation`、`updateMarket`、`generateOrderBook` |
| 时间系统 | `updateGameTime`、`updateTimeDisplay`、`isTradingTime`、`randomizeGameTime` |
| 股票列表 | `renderStockList`、`handleSortClick`、`searchStocks`、`toggleWatchlistMode`、`selectStock` |
| 交易系统 | `executeTrade`、`validateTradeParameters`、`executeBuyTrade`、`executeSellTrade`、`recordTrade`、`updateAfterTrade` |
| 持仓管理 | `updatePortfolio`、`updatePortfolioRealTime`、`calculateStockValue` |
| 成就系统 | `updateProfile`、`checkAchievements`、`calculateSaveStats`、`calculateStats`、`showAchievementPopup` |
| K 线图表 | `drawKLine`、`drawVolume`、`chartZoomIn`、`chartZoomOut`、`chartReset`、`onChartWheel`、`onChartMouseDown`、`onChartTouchStart`、`resetKLineCharts`、`regenerateStockMarket`、`openResetKLineModal` |
| 自动交易 | `addAutoTradeStock`、`editAutoTradeStock`、`removeAutoTradeStock`、`startAutoTrade`、`pauseAutoTrade`、`stopAutoTrade`、`checkAutoTradeCondition`、`executeAutoTrade` |
| 调试面板 | `showDebugPanel`、`debugSetTime`、`debugSetFund`、`debugUnlockAchievement`、`debugResetMarket` |
| 教程系统 | `startTutorial`、`showTutorialStep`、`nextTutorial`、`endTutorial` |
| 国际化 | `applyUserLanguage`、`onLanguageChanged`、`toggleLanguage` |
| 工具方法 | `formatMoney`、`formatCurrency`、`formatPercent`、`showScreen`、`switchTab`、`setTheme`、`exportAllData`、`exportSingleSave`、`importSave` |

### 启动流程

应用启动逻辑位于 [game.js:8378-8400](file:///c:/Users/Administrator/Documents/trae_projects/Stock%20simulator/game.js#L8378-L8400)：

1. `DOMContentLoaded` 事件触发
2. 全局禁用右键菜单
3. 实例化 `StockSimulator`，构造函数中调用 `init()`
4. `init()` 依次调用 `I18n.init()`（初始化国际化）、`I18n.applyToDOM()`（刷新静态文本）、`loadUsers()`（加载数据并执行迁移）、`bindEvents()`（绑定所有事件）、`applyUserLanguage()`（应用用户语言偏好）、`checkAutoLogin()`（预填上次登录的用户名）
5. 注册 `I18n.onChange()` 回调，语言切换时自动刷新所有动态内容
6. 注册 `popstate` 事件处理浏览器后退

### 数据流

```
用户操作 → 事件监听 → StockSimulator 方法
                            ↓
                      修改 currentSave / currentUser
                            ↓
                      saveUsers() 加密写入 LocalStorage
                            ↓
                      更新界面渲染
```

### 扩展指南

**添加新股票**：在 [stockData.js](file:///c:/Users/Administrator/Documents/trae_projects/Stock%20simulator/stockData.js) 的 `StockPool` 数组中追加对象，格式为 `{ code: '六位代码', name: '名称', industry: '行业' }`。

**添加新成就**：在 [achievements.js](file:///c:/Users/Administrator/Documents/trae_projects/Stock%20simulator/achievements.js) 的 `achievements` 数组中追加对象，包含 `id`、`name`、`desc`、`level`、`icon`、`condition` 字段，并在 `calculateSaveStats()` 中计算对应的统计数据字段。

**修改涨跌停规则**：调整 [game.js:5-20](file:///c:/Users/Administrator/Documents/trae_projects/Stock%20simulator/game.js#L5-L20) 中 `LimitManager` 构造函数的 `limitUpPercent`、`limitDownPercent`、`circuitBreakerThreshold`、`circuitBreakerCooldown` 参数。

**添加新主题**：在 [styles.css](file:///c:/Users/Administrator/Documents/trae_projects/Stock%20simulator/styles.css) 中新增 `body.{主题名}-theme` 选择器并覆盖 CSS 变量，同时在 `index.html` 主题下拉框与 `game.js` 的 `setTheme()` 方法中补充对应分支。

**添加新语言或翻译**：

1. 在 [locales/](file:///c:/Users/Administrator/Documents/trae_projects/Stock%20simulator/locales/) 目录下新建语言资源文件（如 `ja-JP.js`），导出全局对象（如 `window.JA_JP`），键名结构与 `zh-CN.js` 保持一致
2. 在 [i18n.js](file:///c:/Users/Administrator/Documents/trae_projects/Stock%20simulator/i18n.js) 的 `locales` 对象中注册新语言
3. 在 [index.html](file:///c:/Users/Administrator/Documents/trae_projects/Stock%20simulator/index.html) 中添加对应的 `<script>` 标签和语言下拉选项
4. 为新增的 UI 文本添加 `data-i18n` 属性，并在两个语言资源文件中补充对应键值
5. 动态生成的文本使用 `I18n.t('key')` 替代硬编码字符串

## 未来计划

- [x] 添加更多股票种类（已实现 300+ 只）
- [ ] 实现更复杂的市场模拟
- [ ] 添加多人对战功能
- [x] 增加更多成就类型（已实现 50+ 项）
- [x] 优化用户界面
- [x] 添加教程模式（已实现基础版新手引导）
- [x] 中英文双语切换（已实现完整 i18n 系统）
- [ ] 支持更多语言（日文、韩文等）

---

## 联系方式

如有问题或建议，请联系开发者：

- Bilibili：莫客星图
- YouTube: @moke_xingtu

---

## 贡献规范

欢迎对本项目提交 Issue 和 Pull Request！请遵循以下规范：

### 提交 Issue

- 在提交新 Issue 前，请先搜索是否已有类似问题
- 请清晰描述问题现象、复现步骤、浏览器类型与版本
- 如有报错信息，请附上浏览器控制台的完整错误输出

### 提交 Pull Request

1. Fork 本仓库并创建特性分支：`git checkout -b feature/your-feature`
2. 遵循项目现有编码风格：原生 ES6+ JavaScript，模块化设计，中文注释
3. 如新增 UI 文本，须同时在 `locales/zh-CN.js` 和 `locales/en-US.js` 中添加对应翻译键
4. 如新增功能涉及用户数据结构变更，须在 `loadUsers()` 中添加向后兼容的数据迁移逻辑
5. 提交前请确保在主流浏览器（Chrome、Firefox、Edge）中测试通过
6. PR 描述中请说明改动内容、测试情况及是否涉及破坏性变更

### 编码规范

- JavaScript：ES6+ 语法，Class 面向对象设计，方法名使用驼峰命名
- CSS：使用 CSS 变量管理主题色，BEM-like 命名风格
- HTML：语义化标签，所有可翻译文本须添加 `data-i18n` 属性
- 注释：核心逻辑添加中文注释说明，函数需标注参数与返回值

---

## 许可证

本项目基于 [MIT License](file:///c:/Users/Administrator/Documents/trae_projects/Stock%20simulator/LICENSE) 开源，欢迎自由使用、修改和分发。

Copyright (c) 2026 MOX

---

**版本信息**：v2.13.5
**开发人员**：莫客星图

---

### 🔒 用户数据迁移说明

- **v2.4.x 用户的旧密码哈希在 v2.5.0 首次成功登录后自动升级**为 PBKDF2 格式。无需任何手动操作。
- 升级前请确保浏览器支持 Web Crypto API（`crypto.subtle.deriveBits`），所有现代浏览器（Chrome 66+、Firefox 57+、Safari 10.1+、Edge 79+）均支持。
- 若浏览器不支持 Web Crypto，旧密码哈希将**保留**（不会升级），用户仍可正常登录。

---

## Star历史

<a href="https://www.star-history.com/?repos=ljy969%2FStock-simulator&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=ljy969/Stock-simulator&type=date&theme=dark&legend=top-left&sealed_token=-XxWGc_j93mihOeFBD_uLH8LUOGXrnCG3rfpaH0KGlF3EAsN4gi39zb_Cgv-owfEiStKCJYBQIcgUzDAtLl37CTZnVn1SeYblkwf1AaRcGmopZRz5u-6rg" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=ljy969/Stock-simulator&type=date&legend=top-left&sealed_token=-XxWGc_j93mihOeFBD_uLH8LUOGXrnCG3rfpaH0KGlF3EAsN4gi39zb_Cgv-owfEiStKCJYBQIcgUzDAtLl37CTZnVn1SeYblkwf1AaRcGmopZRz5u-6rg" />
   <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=ljy969/Stock-simulator&type=date&legend=top-left&sealed_token=-XxWGc_j93mihOeFBD_uLH8LUOGXrnCG3rfpaH0KGlF3EAsN4gi39zb_Cgv-owfEiStKCJYBQIcgUzDAtLl37CTZnVn1SeYblkwf1AaRcGmopZRz5u-6rg" />
 </picture>
</a>
