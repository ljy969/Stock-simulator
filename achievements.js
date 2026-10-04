// 成就系统配置
const AchievementSystem = {
    // 成就列表
    achievements: [
        // 青铜级 - 入门成就
        { id: 'first_trade', name: '初入股市', desc: '完成第一笔交易', level: 'bronze', icon: '🌱', condition: (stats) => stats.tradeCount >= 1 },
        { id: 'first_profit', name: '小试牛刀', desc: '首次盈利', level: 'bronze', icon: '💰', condition: (stats) => stats.totalProfit > 0 },
        { id: 'first_loss', name: '交学费了', desc: '首次亏损', level: 'bronze', icon: '📉', condition: (stats) => stats.totalLoss > 0 },
        { id: 'hold_5', name: '分散投资', desc: '同时持有5只股票', level: 'bronze', icon: '📊', condition: (stats) => stats.maxHoldings >= 5 },
        { id: 'trade_10', name: '活跃交易者', desc: '累计交易10次', level: 'bronze', icon: '🔥', condition: (stats) => stats.tradeCount >= 10 },
        { id: 'profit_1k', name: '千元户', desc: '累计净盈利1000元', level: 'bronze', icon: '💵', condition: (stats) => stats.netProfit >= 1000 },
        { id: 'day_trader', name: '日内交易', desc: '同一天买入并卖出', level: 'bronze', icon: '⚡', condition: (stats) => stats.dayTrades >= 1 },
        { id: 'watchlist_10', name: '自选股达人', desc: '添加10只股票到自选', level: 'bronze', icon: '⭐', condition: (stats) => stats.watchlistCount >= 10 },
        
        // 白银级 - 进阶成就
        { id: 'profit_10k', name: '万元户', desc: '累计净盈利1万元', level: 'silver', icon: '💎', condition: (stats) => stats.netProfit >= 10000 },
        { id: 'trade_50', name: '交易老手', desc: '累计交易50次', level: 'silver', icon: '📈', condition: (stats) => stats.tradeCount >= 50 },
        { id: 'hold_10', name: '投资组合', desc: '同时持有10只股票', level: 'silver', icon: '📁', condition: (stats) => stats.maxHoldings >= 10 },
        { id: 'return_10', name: '收益率10%', desc: '单局收益率超过10%', level: 'silver', icon: '🚀', condition: (stats) => stats.maxReturn >= 0.10 },
        { id: 'profit_streak_3', name: '三连盈', desc: '连续3笔交易盈利', level: 'silver', icon: '🏃', condition: (stats) => stats.profitStreak >= 3 },
        { id: 'all_sectors', name: '行业通', desc: '交易过15个不同行业', level: 'silver', icon: '🏭', condition: (stats) => stats.sectorsTraded >= 15 },
        { id: 'large_trade', name: '大单交易', desc: '单笔交易金额超过10万', level: 'silver', icon: '💼', condition: (stats) => stats.largeTrades >= 1 },
        { id: 'maotai_holder', name: '茅台股东', desc: '持有过贵州茅台', level: 'silver', icon: '🍶', condition: (stats) => stats.holdMaotai },
        
        // 黄金级 - 高手成就
        { id: 'profit_100k', name: '十万元户', desc: '累计净盈利10万元', level: 'gold', icon: '👑', condition: (stats) => stats.netProfit >= 100000 },
        { id: 'return_50', name: '收益率50%', desc: '单局收益率超过50%', level: 'gold', icon: '🦄', condition: (stats) => stats.maxReturn >= 0.50 },
        { id: 'trade_200', name: '交易大师', desc: '累计交易200次', level: 'gold', icon: '🎯', condition: (stats) => stats.tradeCount >= 200 },
        { id: 'profit_streak_10', name: '十连盈', desc: '连续10笔交易盈利', level: 'gold', icon: '🔥', condition: (stats) => stats.profitStreak >= 10 },
        { id: 'double_bagger', name: '翻倍股', desc: '单只股票盈利翻倍', level: 'gold', icon: '📊', condition: (stats) => stats.doubleBaggers >= 1 },
        { id: 'market_beater', name: '跑赢大盘', desc: '收益率超过同期上证指数50%', level: 'gold', icon: '🏆', condition: (stats) => stats.beatMarket, comingSoon: true },
        { id: 'diversified', name: '全能选手', desc: '交易过40个不同行业', level: 'gold', icon: '🌍', condition: (stats) => stats.sectorsTraded >= 40 },
        { id: 'day_trader_pro', name: '日内高手', desc: '完成20次日内交易', level: 'gold', icon: '⚡', condition: (stats) => stats.dayTrades >= 20 },
        
        // 传说级 - 大神成就
        { id: 'profit_1m', name: '百万富翁', desc: '累计净盈利100万元', level: 'legend', icon: '🏰', condition: (stats) => stats.netProfit >= 1000000 },
        { id: 'return_100', name: '翻倍大神', desc: '单局收益率超过100%', level: 'legend', icon: '🐉', condition: (stats) => stats.maxReturn >= 1.00 },
        { id: 'trade_1000', name: '千次交易', desc: '累计交易1000次', level: 'legend', icon: '⚔️', condition: (stats) => stats.tradeCount >= 1000 },
        { id: 'perfect_game', name: '完美一局', desc: '单局所有交易均盈利', level: 'legend', icon: '💎', condition: (stats) => stats.perfectGame },
        { id: 'stock_god', name: '股神降临', desc: '单只股票盈利超过500%', level: 'legend', icon: '👑', condition: (stats) => stats.stockGodTrade },
        { id: 'all_achievements', name: '成就猎人', desc: '解锁所有其他成就', level: 'legend', icon: '🎖️', condition: (stats) => stats.allAchievements },
        
        // 彩蛋成就 - 搞笑类
        { id: 'standing_guard', name: '山顶站岗纪念奖', desc: '买入后股价连续下跌10%', level: 'bronze', icon: '⛰️', condition: (stats) => stats.standingGuard, comingSoon: true },
        { id: 'buy_high_sell_low', name: '反向操作大师', desc: '高买低卖亏损超过20%', level: 'bronze', icon: '🙃', condition: (stats) => stats.buyHighSellLow, comingSoon: true },
        { id: 'fomo_master', name: 'FOMO患者', desc: '在涨停价买入', level: 'bronze', icon: '😱', condition: (stats) => stats.fomoTrades >= 1 },
        { id: 'panic_seller', name: '恐慌抛售', desc: '在跌停价卖出', level: 'bronze', icon: '😰', condition: (stats) => stats.panicSells >= 1 },
        { id: 'bagholder', name: '长期股东', desc: '持有一只股票超过30天', level: 'silver', icon: '📅', condition: (stats) => stats.longHolds >= 1 },
        { id: 'yo_yo_trader', name: '摇摆不定', desc: '同一天内对同一只股票买卖3次以上', level: 'silver', icon: '🎪', condition: (stats) => stats.yoYoTrades >= 1 },
        { id: 'all_in_gambler', name: '梭哈选手', desc: '单笔交易使用90%以上资金', level: 'silver', icon: '🎲', condition: (stats) => stats.allInTrades >= 1 },
        { id: 'comeback_kid', name: '逆风翻盘', desc: '亏损50%后最终盈利', level: 'gold', icon: '🌈', condition: (stats) => stats.comeback, comingSoon: true },
        { id: 'diamond_hands', name: '钻石手', desc: '单只股票持仓期间波动超过50%但未卖出', level: 'gold', icon: '💎', condition: (stats) => stats.diamondHands, comingSoon: true },
        { id: 'paper_hands', name: '纸手', desc: '卖出后股价立即上涨20%', level: 'bronze', icon: '🧻', condition: (stats) => stats.paperHands >= 1 },
        { id: 'lucky_star', name: '幸运星', desc: '买入后股价立即涨停', level: 'silver', icon: '🍀', condition: (stats) => stats.luckyTrades >= 1 },
        { id: 'unlucky_star', name: '倒霉蛋', desc: '买入后股价立即跌停', level: 'bronze', icon: '🌧️', condition: (stats) => stats.unluckyTrades >= 1 },
        { id: 'weekend_warrior', name: '周末战士', desc: '周五买入周一卖出', level: 'bronze', icon: '📆', condition: (stats) => stats.weekendTrades >= 1 },
        { id: 'round_number', name: '强迫症', desc: '同一只股票的买卖价格均为整数', level: 'bronze', icon: '🔢', condition: (stats) => stats.roundNumberTrades >= 1 },
        { id: 'palindrome_profit', name: '对称美学', desc: '盈利金额是回文数(如1221)', level: 'silver', icon: '🎨', condition: (stats) => stats.palindromeProfit },
        { id: 'tax_payer', name: '纳税大户', desc: '累计缴纳手续费超过1万元', level: 'silver', icon: '🏛️', condition: (stats) => stats.totalFees >= 10000 },
        { id: 'market_crash_survivor', name: '股灾幸存者', desc: '单日亏损超过10%但未清仓', level: 'gold', icon: '🛡️', condition: (stats) => stats.crashSurvivor, comingSoon: true },
        { id: 'contrarian', name: '逆向投资者', desc: '在市场大跌日买入', level: 'silver', icon: '🦅', condition: (stats) => stats.contrarianTrades >= 5, comingSoon: true },
        { id: 'momentum_chaser', name: '趋势追逐者', desc: '连续追涨3只涨停股', level: 'silver', icon: '🌊', condition: (stats) => stats.momentumTrades >= 3 },
        { id: 'value_investor', name: '价值投资者', desc: '持有单只股票盈利超过100%', level: 'gold', icon: '📚', condition: (stats) => stats.valueInvestor },
        { id: 'technical_trader', name: '技术派', desc: '根据K线形态交易盈利10次', level: 'silver', icon: '📐', condition: (stats) => stats.technicalWins >= 10, comingSoon: true },
        { id: 'news_trader', name: '消息派', desc: '在"利好消息"后买入并盈利', level: 'bronze', icon: '📰', condition: (stats) => stats.newsTrades >= 1, comingSoon: true },
        { id: 'early_bird', name: '早起的鸟儿', desc: '在开盘后5分钟内完成交易', level: 'bronze', icon: '🐦', condition: (stats) => stats.earlyTrades >= 1 },
        { id: 'night_owl', name: '夜猫子', desc: '在收盘前5分钟完成交易', level: 'bronze', icon: '🦉', condition: (stats) => stats.lateTrades >= 1 },
    ],

    // 获取成就等级名称（支持国际化）
    getLevelName(level) {
        const keyMap = {
            bronze: 'profile.levelBronze',
            silver: 'profile.levelSilver',
            gold: 'profile.levelGold',
            legend: 'profile.levelLegend'
        };
        const key = keyMap[level];
        if (key && window.I18n) {
            return I18n.t(key);
        }
        return level;
    },

    // 获取成就名称（支持国际化）
    getName(ach) {
        if (window.I18n) {
            return I18n.t(`achievement.${ach.id}.name`);
        }
        return ach.name;
    },

    // 获取成就描述（支持国际化）
    getDesc(ach) {
        if (window.I18n) {
            return I18n.t(`achievement.${ach.id}.desc`);
        }
        return ach.desc;
    },

    // 获取成就等级颜色
    getLevelColor(level) {
        const colors = {
            bronze: '#cd7f32',
            silver: '#c0c0c0',
            gold: '#ffd700',
            legend: 'linear-gradient(135deg, #ff6b6b, #feca57)'
        };
        return colors[level] || '#888';
    },

    // 检查成就解锁
    checkAchievements(stats, unlockedIds) {
        const newAchievements = [];
        this.achievements.forEach(ach => {
            if (!unlockedIds.includes(ach.id) && ach.condition(stats)) {
                newAchievements.push(ach);
            }
        });
        return newAchievements;
    },

    // Bug fix (#19): draw text at the requested size, shrinking it until it fits the
    // given width. The English "🏆 Achievement Unlocked" title measured 602px on a
    // 600px canvas (inner frame 560px) and was clipped by the border.
    drawFittedText(ctx, text, x, y, maxWidth, size, options = {}) {
        const weight = options.bold ? 'bold ' : '';
        const family = options.family || 'Arial';
        let current = size;
        const min = options.min || 14;
        ctx.font = weight + current + 'px ' + family;
        while (current > min && ctx.measureText(text).width > maxWidth) {
            current -= 1;
            ctx.font = weight + current + 'px ' + family;
        }
        ctx.fillText(text, x, y);
    },

    // 生成成就海报
    generatePoster(achievement, username) {
        const canvas = document.getElementById('poster-canvas');
        const ctx = canvas.getContext('2d');
        
        // 设置画布尺寸
        canvas.width = 600;
        canvas.height = 800;
        
        // 背景渐变
        const gradient = ctx.createLinearGradient(0, 0, 600, 800);
        gradient.addColorStop(0, '#1a1a2e');
        gradient.addColorStop(1, '#16213e');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 600, 800);
        
        // 边框
        ctx.strokeStyle = this.getLevelColor(achievement.level);
        ctx.lineWidth = 8;
        ctx.strokeRect(20, 20, 560, 760);
        
        // 标题（#19: 自适应缩字号，避免超出 560px 内框）
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        this.drawFittedText(ctx, '🏆 ' + (window.I18n ? I18n.t('achievement.unlocked') : '成就解锁'), 300, 100, 500, 48, { bold: true, min: 20 });

        // 成就图标
        ctx.font = '120px Arial';
        ctx.fillText(achievement.icon, 300, 280);

        // 成就名称
        ctx.fillStyle = this.getLevelColor(achievement.level);
        this.drawFittedText(ctx, this.getName(achievement), 300, 380, 500, 42, { bold: true, min: 18 });
        
        // 等级标签
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        ctx.fillRect(200, 410, 200, 40);
        ctx.fillStyle = '#ffffff';
        ctx.font = '24px Arial';
        ctx.fillText(this.getLevelName(achievement.level), 300, 438);
        
        // 描述
        ctx.fillStyle = '#aaaaaa';
        this.drawFittedText(ctx, this.getDesc(achievement), 300, 520, 500, 28, { min: 14 });

        // 用户名
        ctx.fillStyle = '#58a6ff';
        ctx.font = '32px Arial';
        ctx.fillText(`@${username}`, 300, 620);

        // 底部
        ctx.fillStyle = '#666666';
        this.drawFittedText(ctx, window.I18n ? I18n.t('app.title') : '股市模拟器 - 纯娱乐版', 300, 720, 500, 20, { min: 12 });

        // 日期（使用当前语言区域格式）
        const locale = window.I18n ? I18n.getCurrentLanguage() : 'zh-CN';
        const date = new Date().toLocaleDateString(locale);
        ctx.fillText(date, 300, 750);
        
        return canvas.toDataURL('image/png');
    }
};
