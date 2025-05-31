class CryptoPumpDetector {
    constructor() {
        this.coins = [];
        this.marketData = {};
        this.isLoading = false;
        this.currentFilter = 'all';
        this.init();
    }

    async init() {
        this.setupEventListeners();
        await this.loadData();
        this.startAutoUpdate();
    }

    setupEventListeners() {
        // فلاتر التقييم
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.currentFilter = e.target.dataset.score;
                this.renderCoins();
            });
        });

        // النافذة المنبثقة
        document.getElementById('closeModal').addEventListener('click', () => {
            document.getElementById('coinModal').style.display = 'none';
        });

        window.addEventListener('click', (e) => {
            if (e.target === document.getElementById('coinModal')) {
                document.getElementById('coinModal').style.display = 'none';
            }
        });
    }

    async loadData() {
        if (this.isLoading) return;
        
        this.isLoading = true;
        this.showLoading(true);

        try {
            // جلب قائمة العملات
            const tickers = await this.fetchTickers();
            
            // جلب بيانات الشموع للتحليل الفني
            const analysisPromises = tickers.map(ticker => this.analyzeCoins(ticker));
            const analysisResults = await Promise.all(analysisPromises);
            
            // فلترة وتقييم العملات
            this.coins = analysisResults
                .filter(coin => coin && this.isValidCoin(coin))
                .map(coin => this.calculateScore(coin))
                .sort((a, b) => b.score - a.score)
                .slice(0, CONFIG.MAX_COINS);

            // تحديد المراكز
            this.coins.forEach((coin, index) => {
                coin.rank = index + 1;
            });

            this.updateMarketStatus();
            this.renderCoins();
            
        } catch (error) {
            console.error('خطأ في تحميل البيانات:', error);
            this.showError('فشل في تحميل البيانات. يرجى المحاولة مرة أخرى.');
        } finally {
            this.isLoading = false;
            this.showLoading(false);
        }
    }

    async fetchTickers() {
        const response = await fetch(`${CONFIG.OKX_API.BASE_URL}/market/tickers?instType=SPOT`);
        const data = await response.json();
        
        if (data.code !== '0') {
            throw new Error('فشل في جلب بيانات العملات');
        }

        return data.data
            .filter(ticker => ticker.instId.endsWith('-USDT'))
            .filter(ticker => !this.isExcludedCoin(ticker.instId))
            .filter(ticker => parseFloat(ticker.last) >= CONFIG.MIN_PRICE)
            .filter(ticker => parseFloat(ticker.vol24h) >= CONFIG.ANALYSIS_SETTINGS.MIN_VOLUME_USDT);
    }

    async analyzeCoins(ticker) {
        try {
            const symbol = ticker.instId;
            const baseSymbol = symbol.replace('-USDT', '');

            // جلب بيانات الشموع للتحليل
            const candleData = await this.fetchCandleData(symbol);
            if (!candleData || candleData.length < 200) return null;

            // التحليل الفني
            const technicalAnalysis = this.performTechnicalAnalysis(candleData);
            
            // تحليل السيولة والحجم
            const liquidityAnalysis = this.analyzeLiquidity(candleData);
            
            // تحليل القوة الشرائية
            const buyingPowerAnalysis = this.analyzeBuyingPower(candleData, ticker);

            return {
                symbol: baseSymbol,
                fullSymbol: symbol,
                price: parseFloat(ticker.last),
                change24h: parseFloat(ticker.chgUtc),
                volume24h: parseFloat(ticker.vol24h),
                volumeUsdt: parseFloat(ticker.volCcy24h),
                ...technicalAnalysis,
                ...liquidityAnalysis,
                ...buyingPowerAnalysis,
                timestamp: Date.now()
            };
        } catch (error) {
            console.error(`خطأ في تحليل ${ticker.instId}:`, error);
            return null;
        }
    }

    async fetchCandleData(symbol, timeframe = '1H', limit = 200) {
    const response = await fetch(
        `${CONFIG.OKX_API.BASE_URL}/market/history-candles?instId=${symbol}&bar=${timeframe}&limit=${limit}`
    );
        const data = await response.json();
        
        if (data.code !== '0') return null;
        
        return data.data.map(candle => ({
            timestamp: parseInt(candle[0]),
            open: parseFloat(candle[1]),
            high: parseFloat(candle[2]),
            low: parseFloat(candle[3]),
            close: parseFloat(candle[4]),
            volume: parseFloat(candle[5]),
            volumeUsdt: parseFloat(candle[6])
        })).reverse();
    }

    performTechnicalAnalysis(candleData) {
        const closes = candleData.map(c => c.close);
        const highs = candleData.map(c => c.high);
        const lows = candleData.map(c => c.low);
        const volumes = candleData.map(c => c.volume);

        // حساب RSI
        const rsi = this.calculateRSI(closes, CONFIG.ANALYSIS_SETTINGS.RSI_PERIOD);
        
        // حساب MACD
        const macd = this.calculateMACD(closes);
        
        // حساب المتوسطات المتحركة
        const ma20 = this.calculateMA(closes, 20);
        const ma50 = this.calculateMA(closes, 50);
        const ma200 = this.calculateMA(closes, 200);
        
        // تحليل اتجاه المتوسطات
        const maAlignment = this.analyzeMATrend(closes[closes.length - 1], ma20, ma50, ma200);
        
        return {
            rsi: rsi[rsi.length - 1],
            macd: {
                macd: macd.macd[macd.macd.length - 1],
                signal: macd.signal[macd.signal.length - 1],
                histogram: macd.histogram[macd.histogram.length - 1]
            },
            ma: {
                ma20: ma20[ma20.length - 1],
                ma50: ma50[ma50.length - 1],
                ma200: ma200[ma200.length - 1]
            },
            maAlignment,
            volatility: this.calculateVolatility(closes.slice(-20))
        };
    }

    analyzeLiquidity(candleData) {
        const last7Days = candleData.slice(-168); // آخر 7 أيام (ساعة واحدة × 24 × 7)
        
        const totalVolume = last7Days.reduce((sum, candle) => sum + candle.volumeUsdt, 0);
        const avgVolume = totalVolume / last7Days.length;
        
        // تحليل تدفق السيولة
        const liquidityFlow = this.calculateLiquidityFlow(last7Days);
        
        // نسبة التجميع والتصريف
        const accumulationDistribution = this.calculateAccumulationDistribution(last7Days);
        
        return {
            liquidityScore: Math.min(100, (totalVolume / 10000000) * 100), // تطبيع النتيجة
            avgVolume7d: avgVolume,
            liquidityFlow,
            accumulationDistribution,
            volumeTrend: this.calculateVolumeTrend(last7Days)
        };
    }

    analyzeBuyingPower(candleData, ticker) {
        const last7Days = candleData.slice(-168);
        
        // حساب نسبة الشراء مقابل البيع
        let buyVolume = 0;
        let sellVolume = 0;
        
        last7Days.forEach(candle => {
            if (candle.close > candle.open) {
                buyVolume += candle.volumeUsdt;
            } else {
                sellVolume += candle.volumeUsdt;
            }
        });
        
        const totalVolume = buyVolume + sellVolume;
        const buyingPressure = totalVolume > 0 ? (buyVolume / totalVolume) * 100 : 50;
        
        return {
            buyingPressure,
            buyVolume7d: buyVolume,
            sellVolume7d: sellVolume,
            netBuyingPower: buyVolume - sellVolume
        };
    }

    calculateScore(coin) {
        let score = 0;
        const factors = [];

        // نقاط RSI (20 نقطة)
        if (coin.rsi > 30 && coin.rsi < 70) {
            score += 15;
            factors.push('RSI متوازن');
        } else if (coin.rsi < 30) {
            score += 20; // منطقة تشبع بيعي - فرصة شراء
            factors.push('RSI تشبع بيعي');
        }

        // نقاط MACD (20 نقطة)
        if (coin.macd.macd > coin.macd.signal && coin.macd.histogram > 0) {
            score += 20;
            factors.push('MACD إيجابي');
        } else if (coin.macd.macd > coin.macd.signal) {
            score += 10;
            factors.push('MACD محايد');
        }

        // نقاط السيولة (20 نقطة)
        if (coin.liquidityScore > 70) {
            score += 20;
            factors.push('سيولة عالية');
        } else if (coin.liquidityScore > 40) {
            score += 15;
            factors.push('سيولة متوسطة');
        }

        // نقاط القوة الشرائية (20 نقطة)
        if (coin.buyingPressure > 60) {
            score += 20;
            factors.push('قوة شرائية عالية');
        } else if (coin.buyingPressure > 50) {
            score += 10;
            factors.push('قوة شرائية متوسطة');
        }

        // نقاط المتوسطات المتحركة (15 نقطة)
        if (coin.maAlignment === 'bullish') {
            score += 15;
            factors.push('ترتيب صاعد للمتوسطات');
        } else if (coin.maAlignment === 'neutral') {
            score += 8;
            factors.push('ترتيب محايد للمتوسطات');
        }

        // نقاط الأداء (5 نقاط)
        if (coin.change24h > 10) {
            score += 5;
            factors.push('أداء قوي 24 ساعة');
        }

        coin.score = Math.min(100, score);
        coin.scoreFactors = factors;
        
        return coin;
    }
    calculateRSI(prices, period = 14) {
        const gains = [];
        const losses = [];
        
        for (let i = 1; i < prices.length; i++) {
            const change = prices[i] - prices[i - 1];
            gains.push(change > 0 ? change : 0);
            losses.push(change < 0 ? Math.abs(change) : 0);
        }
        
        const rsi = [];
        for (let i = period - 1; i < gains.length; i++) {
            const avgGain = gains.slice(i - period + 1, i + 1).reduce((a, b) => a + b) / period;
            const avgLoss = losses.slice(i - period + 1, i + 1).reduce((a, b) => a + b) / period;
            
            if (avgLoss === 0) {
                rsi.push(100);
            } else {
                const rs = avgGain / avgLoss;
                rsi.push(100 - (100 / (1 + rs)));
            }
        }
        
        return rsi;
    }

    calculateMACD(prices) {
        const ema12 = this.calculateEMA(prices, 12);
        const ema26 = this.calculateEMA(prices, 26);
        
        const macdLine = ema12.map((val, i) => val - ema26[i]);
        const signalLine = this.calculateEMA(macdLine, 9);
        const histogram = macdLine.map((val, i) => val - signalLine[i]);
        
        return {
            macd: macdLine,
            signal: signalLine,
            histogram: histogram
        };
    }

    calculateEMA(prices, period) {
        const multiplier = 2 / (period + 1);
        const ema = [prices[0]];
        
        for (let i = 1; i < prices.length; i++) {
            ema.push((prices[i] * multiplier) + (ema[i - 1] * (1 - multiplier)));
        }
        
        return ema;
    }

    calculateMA(prices, period) {
        const ma = [];
        for (let i = period - 1; i < prices.length; i++) {
            const sum = prices.slice(i - period + 1, i + 1).reduce((a, b) => a + b);
            ma.push(sum / period);
        }
        return ma;
    }

    analyzeMATrend(currentPrice, ma20, ma50, ma200) {
        if (currentPrice > ma20 && ma20 > ma50 && ma50 > ma200) {
            return 'bullish';
        } else if (currentPrice < ma20 && ma20 < ma50 && ma50 < ma200) {
            return 'bearish';
        }
        return 'neutral';
    }

    calculateVolatility(prices) {
        const returns = [];
        for (let i = 1; i < prices.length; i++) {
            returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
        }
        
        const mean = returns.reduce((a, b) => a + b) / returns.length;
        const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - mean, 2), 0) / returns.length;
        
        return Math.sqrt(variance) * 100;
    }

    calculateLiquidityFlow(candleData) {
        let inflow = 0;
        let outflow = 0;
        
        candleData.forEach(candle => {
            const typicalPrice = (candle.high + candle.low + candle.close) / 3;
            const moneyFlow = typicalPrice * candle.volume;
            
            if (candle.close > candle.open) {
                inflow += moneyFlow;
            } else {
                outflow += moneyFlow;
            }
        });
        
        const totalFlow = inflow + outflow;
        return totalFlow > 0 ? (inflow / totalFlow) * 100 : 50;
    }

    calculateAccumulationDistribution(candleData) {
        let accumulation = 0;
        let distribution = 0;
        
        candleData.forEach(candle => {
            const range = candle.high - candle.low;
            if (range > 0) {
                const clv = ((candle.close - candle.low) - (candle.high - candle.close)) / range;
                const adValue = clv * candle.volume;
                
                if (adValue > 0) {
                    accumulation += adValue;
                } else {
                    distribution += Math.abs(adValue);
                }
            }
        });
        
        const total = accumulation + distribution;
        return total > 0 ? (accumulation / total) * 100 : 50;
    }

    calculateVolumeTrend(candleData) {
        const volumes = candleData.map(c => c.volume);
        const firstHalf = volumes.slice(0, Math.floor(volumes.length / 2));
        const secondHalf = volumes.slice(Math.floor(volumes.length / 2));
        
        const firstAvg = firstHalf.reduce((a, b) => a + b) / firstHalf.length;
        const secondAvg = secondHalf.reduce((a, b) => a + b) / secondHalf.length;
        
        return ((secondAvg - firstAvg) / firstAvg) * 100;
    }

    isValidCoin(coin) {
        return coin && 
               coin.price > CONFIG.MIN_PRICE &&
               coin.volume24h > CONFIG.ANALYSIS_SETTINGS.MIN_VOLUME_USDT &&
               !this.isExcludedCoin(coin.fullSymbol);
    }

    isExcludedCoin(symbol) {
        const baseSymbol = symbol.replace('-USDT', '');
        return CONFIG.EXCLUDED_COINS.includes(baseSymbol) ||
               baseSymbol.includes('UP') ||
               baseSymbol.includes('DOWN') ||
               baseSymbol.includes('BEAR') ||
               baseSymbol.includes('BULL');
    }

    updateMarketStatus() {
        const avgScore = this.coins.reduce((sum, coin) => sum + coin.score, 0) / this.coins.length;
        const positiveCoins = this.coins.filter(coin => coin.change24h > 0).length;
        const totalCoins = this.coins.length;
        
        let status = '';
        let statusClass = '';
        
        if (avgScore > 70 && (positiveCoins / totalCoins) > 0.6) {
            status = 'السوق في حالة صعود قوي 📈';
            statusClass = 'trend-up';
        } else if (avgScore > 50 && (positiveCoins / totalCoins) > 0.4) {
            status = 'السوق في حالة محايدة ↔️';
            statusClass = 'trend-neutral';
        } else {
            status = 'السوق في حالة هبوط 📉';
            statusClass = 'trend-down';
        }
        
        const statusElement = document.getElementById('marketStatus');
        statusElement.textContent = status;
        statusElement.className = statusClass;
    }

    renderCoins() {
        const grid = document.getElementById('coinsGrid');
        const filteredCoins = this.filterCoins();
        
        if (filteredCoins.length === 0) {
            grid.innerHTML = '<div class="no-results">لا توجد عملات تطابق المعايير المحددة</div>';
            return;
        }
        
        grid.innerHTML = filteredCoins.map(coin => this.createCoinCard(coin)).join('');
        
        // إضافة مستمعي الأحداث للبطاقات
        document.querySelectorAll('.coin-card').forEach(card => {
            card.addEventListener('click', () => {
                const symbol = card.dataset.symbol;
                const coin = this.coins.find(c => c.symbol === symbol);
                this.showCoinDetails(coin);
            });
        });
    }

    filterCoins() {
        if (this.currentFilter === 'all') {
            return this.coins;
        }
        
        const minScore = parseInt(this.currentFilter);
        return this.coins.filter(coin => coin.score >= minScore);
    }

    createCoinCard(coin) {
        const changeClass = coin.change24h >= 0 ? 'positive' : 'negative';
        const changeIcon = coin.change24h >= 0 ? '↗' : '↘';
        
        return `
            <div class="coin-card fade-in" data-symbol="${coin.symbol}">
                <div class="coin-header">
                    <div class="coin-logo">
                        ${coin.symbol.charAt(0)}
                    </div>
                    <div class="coin-info">
                        <h3>${coin.symbol}</h3>
                        <span class="coin-rank">المركز ${coin.rank}</span>
                    </div>
                </div>
                
                <div class="coin-metrics">
                    <div class="metric-row">
                        <span class="metric-label">السعر:</span>
                        <span class="metric-value">$${coin.price.toFixed(6)}</span>
                    </div>
                    <div class="metric-row">
                        <span class="metric-label">التغيير 24س:</span>
                        <span class="metric-value ${changeClass}">
                            ${changeIcon} ${coin.change24h.toFixed(2)}%
                        </span>
                    </div>
                    <div class="metric-row">
                        <span class="metric-label">الحجم:</span>
                        <span class="metric-value">$${this.formatNumber(coin.volumeUsdt)}</span>
                    </div>
                    <div class="metric-row">
                        <span class="metric-label">RSI:</span>
                        <span class="metric-value ${coin.rsi > 70 ? 'negative' : coin.rsi < 30 ? 'positive' : ''}">
                            ${coin.rsi.toFixed(1)}
                        </span>
                    </div>
                </div>
                
                <div class="score-bar">
                    <div class="score-fill" style="width: ${coin.score}%"></div>
                </div>
                <div class="score-text" style="color: ${this.getScoreColor(coin.score)}">
                    ${coin.score.toFixed(0)}/100
                </div>
            </div>
        `;
    }

    showCoinDetails(coin) {
        const modal = document.getElementById('coinModal');
        const modalTitle = document.getElementById('modalTitle');
        const modalBody = document.getElementById('modalBody');
        
        modalTitle.textContent = `تحليل مفصل - ${coin.symbol}`;
        
        // حساب الأهداف والدعوم
        const targets = this.calculateTargets(coin);
        const supports = this.calculateSupports(coin);
        const entryPoint = this.calculateEntryPoint(coin);
        const stopLoss = this.calculateStopLoss(coin, entryPoint);
        
        modalBody.innerHTML = `
            <div class="analysis-section">
                <h3><i class="fas fa-chart-line"></i> معلومات أساسية</h3>
                <div class="analysis-grid">
                    <div class="analysis-item">
                        <div class="label">السعر الحالي</div>
                        <div class="value">$${coin.price.toFixed(6)}</div>
                    </div>
                    <div class="analysis-item">
                        <div class="label">التغيير 24 ساعة</div>
                        <div class="value ${coin.change24h >= 0 ? 'positive' : 'negative'}">
                            ${coin.change24h.toFixed(2)}%
                        </div>
                    </div>
                    <div class="analysis-item">
                        <div class="label">حجم التداول</div>
                        <div class="value">$${this.formatNumber(coin.volumeUsdt)}</div>
                    </div>
                    <div class="analysis-item">
                        <div class="label">التقييم الإجمالي</div>
                        <div class="value" style="color: ${this.getScoreColor(coin.score)}">
                            ${coin.score.toFixed(0)}/100
                        </div>
                    </div>
                </div>
            </div>

            <div class="analysis-section">
                <h3><i class="fas fa-chart-area"></i> التحليل الفني</h3>
                <div class="analysis-grid">
                    <div class="analysis-item">
                        <div class="label">مؤشر RSI</div>
                        <div class="value ${coin.rsi > 70 ? 'negative' : coin.rsi < 30 ? 'positive' : ''}">
                            ${coin.rsi.toFixed(1)}
                            ${coin.rsi > 70 ? '(تشبع شرائي)' : coin.rsi < 30 ? '(تشبع بيعي)' : '(متوازن)'}
                        </div>
                    </div>
                    <div class="analysis-item">
                        <div class="label">MACD</div>
                        <div class="value ${coin.macd.macd > coin.macd.signal ? 'positive' : 'negative'}">
                            ${coin.macd.macd > coin.macd.signal ? 'إيجابي ↗' : 'سلبي ↘'}
                        </div>
                    </div>
                    <div class="analysis-item">
                        <div class="label">المتوسطات المتحركة</div>
                        <div class="value ${coin.maAlignment === 'bullish' ? 'positive' : coin.maAlignment === 'bearish' ? 'negative' : ''}">
                            ${coin.maAlignment === 'bullish' ? 'ترتيب صاعد' : coin.maAlignment === 'bearish' ? 'ترتيب هابط' : 'محايد'}
                        </div>
                    </div>
                    <div class="analysis-item">
                        <div class="label">التقلبات</div>
                        <div class="value">
                            ${coin.volatility.toFixed(2)}%
                        </div>
                    </div>
                </div>
            </div>

            <div class="analysis-section">
                <h3><i class="fas fa-tint"></i> تحليل السيولة</h3>
                <div class="liquidity-bar">
                    <div class="liquidity-fill" style="width: ${coin.liquidityFlow}%"></div>
                </div>
                <p>تدفق السيولة: ${coin.liquidityFlow.toFixed(1)}%</p>
                
                <div class="analysis-grid">
                    <div class="analysis-item">
                        <div class="label
                        <div class="label">نقاط السيولة</div>
                        <div class="value">${coin.liquidityScore.toFixed(1)}/100</div>
                    </div>
                    <div class="analysis-item">
                        <div class="label">التجميع/التصريف</div>
                        <div class="value ${coin.accumulationDistribution > 50 ? 'positive' : 'negative'}">
                            ${coin.accumulationDistribution.toFixed(1)}%
                            ${coin.accumulationDistribution > 50 ? '(تجميع)' : '(تصريف)'}
                        </div>
                    </div>
                    <div class="analysis-item">
                        <div class="label">القوة الشرائية</div>
                        <div class="value ${coin.buyingPressure > 50 ? 'positive' : 'negative'}">
                            ${coin.buyingPressure.toFixed(1)}%
                        </div>
                    </div>
                    <div class="analysis-item">
                        <div class="label">اتجاه الحجم</div>
                        <div class="value ${coin.volumeTrend > 0 ? 'positive' : 'negative'}">
                            ${coin.volumeTrend > 0 ? 'متزايد ↗' : 'متناقص ↘'}
                        </div>
                    </div>
                </div>
            </div>

            <div class="analysis-section">
                <h3><i class="fas fa-bullseye"></i> الأهداف والدعوم</h3>
                <div class="targets-section">
                    ${targets.map((target, index) => `
                        <div class="target-item">
                            <div class="label">الهدف ${index + 1}</div>
                            <div class="value positive">$${target.toFixed(6)}</div>
                        </div>
                    `).join('')}
                    
                    ${supports.map((support, index) => `
                        <div class="target-item support-item">
                            <div class="label">الدعم ${index + 1}</div>
                            <div class="value negative">$${support.toFixed(6)}</div>
                        </div>
                    `).join('')}
                </div>
            </div>

            <div class="analysis-section">
                <h3><i class="fas fa-crosshairs"></i> نقاط الدخول والخروج</h3>
                <div class="entry-point">
                    <h4>أفضل نقطة دخول</h4>
                    <div class="value" style="font-size: 1.2rem; color: #ffd700;">
                        $${entryPoint.toFixed(6)}
                    </div>
                </div>
                
                <div class="analysis-grid" style="margin-top: 15px;">
                    <div class="analysis-item support-item">
                        <div class="label">وقف الخسارة</div>
                        <div class="value">$${stopLoss.toFixed(6)}</div>
                    </div>
                    <div class="analysis-item">
                        <div class="label">نسبة المخاطرة</div>
                        <div class="value">${(((entryPoint - stopLoss) / entryPoint) * 100).toFixed(2)}%</div>
                    </div>
                </div>
            </div>

            <div class="analysis-section">
                <h3><i class="fas fa-star"></i> عوامل التقييم</h3>
                <ul style="list-style: none; padding: 0;">
                    ${coin.scoreFactors.map(factor => `
                        <li style="padding: 5px 0; color: #00ff88;">
                            <i class="fas fa-check-circle"></i> ${factor}
                        </li>
                    `).join('')}
                </ul>
            </div>

            <div class="analysis-section">
                <h3><i class="fas fa-lightbulb"></i> التوصية</h3>
                <div style="padding: 20px; background: ${this.getRecommendationColor(coin.score)}; border-radius: 10px; text-align: center;">
                    <h4>${this.getRecommendation(coin)}</h4>
                    <p style="margin-top: 10px; font-size: 0.9rem;">
                        ${this.getRecommendationDetails(coin)}
                    </p>
                </div>
            </div>
        `;
        
        modal.style.display = 'block';
    }

    calculateTargets(coin) {
        const currentPrice = coin.price;
        const volatility = coin.volatility / 100;
        
        // حساب الأهداف بناءً على المقاومات الفنية والتقلبات
        const targets = [];
        const baseIncrease = Math.max(0.05, volatility * 2); // 5% كحد أدنى
        
        for (let i = 1; i <= 3; i++) {
            const targetPrice = currentPrice * (1 + (baseIncrease * i * 1.5));
            targets.push(targetPrice);
        }
        
        return targets;
    }

    calculateSupports(coin) {
        const currentPrice = coin.price;
        const ma20 = coin.ma.ma20;
        const ma50 = coin.ma.ma50;
        
        const supports = [];
        
        // الدعم الأول: المتوسط المتحرك 20
        if (ma20 < currentPrice) {
            supports.push(ma20);
        }
        
        // الدعم الثاني: المتوسط المتحرك 50
        if (ma50 < currentPrice && ma50 < ma20) {
            supports.push(ma50);
        }
        
        // الدعم الثالث: مستوى فني بناءً على التقلبات
        const technicalSupport = currentPrice * (1 - (coin.volatility / 100) * 2);
        supports.push(technicalSupport);
        
        return supports.sort((a, b) => b - a); // ترتيب تنازلي
    }

    calculateEntryPoint(coin) {
        const currentPrice = coin.price;
        const rsi = coin.rsi;
        const macdPositive = coin.macd.macd > coin.macd.signal;
        
        // تحديد نقطة الدخول بناءً على المؤشرات
        if (rsi < 40 && macdPositive) {
            // دخول فوري - العملة في منطقة تشبع بيعي مع إشارة إيجابية
            return currentPrice;
        } else if (rsi > 60) {
            // انتظار تصحيح - دخول عند مستوى أقل
            return currentPrice * 0.95;
        } else {
            // دخول عند المستوى الحالي أو قريب منه
            return currentPrice * 0.98;
        }
    }

    calculateStopLoss(coin, entryPoint) {
        const volatility = coin.volatility / 100;
        const riskPercentage = Math.max(0.08, volatility * 1.5); // 8% كحد أدنى
        
        return entryPoint * (1 - riskPercentage);
    }

    getRecommendation(coin) {
        if (coin.score >= 80) {
            return 'شراء قوي 🚀';
        } else if (coin.score >= 65) {
            return 'شراء 📈';
        } else if (coin.score >= 50) {
            return 'مراقبة 👀';
        } else {
            return 'تجنب ⚠️';
        }
    }

    getRecommendationDetails(coin) {
        if (coin.score >= 80) {
            return 'العملة تظهر إشارات قوية للصعود مع مؤشرات فنية إيجابية وسيولة عالية. فرصة استثمارية ممتازة.';
        } else if (coin.score >= 65) {
            return 'العملة تظهر إشارات إيجابية مع بعض المخاطر المحدودة. مناسبة للاستثمار مع إدارة المخاطر.';
        } else if (coin.score >= 50) {
            return 'العملة في منطقة محايدة. يُنصح بالمراقبة وانتظار إشارات أوضح قبل الدخول.';
        } else {
            return 'العملة تظهر إشارات سلبية أو مخاطر عالية. يُنصح بتجنب الاستثمار حالياً.';
        }
    }

    getRecommendationColor(score) {
        if (score >= 80) {
            return 'rgba(0, 255, 136, 0.2)';
        } else if (score >= 65) {
            return 'rgba(255, 165, 2, 0.2)';
        } else if (score >= 50) {
            return 'rgba(255, 215, 0, 0.2)';
        } else {
            return 'rgba(255, 71, 87, 0.2)';
        }
    }

    getScoreColor(score) {
        if (score >= 80) return '#00ff88';
        if (score >= 65) return '#ffa502';
        if (score >= 50) return '#ffd700';
        return '#ff4757';
    }

    formatNumber(num) {
        if (num >= 1e9) {
            return (num / 1e9).toFixed(2) + 'B';
        } else if (num >= 1e6) {
            return (num / 1e6).toFixed(2) + 'M';
        } else if (num >= 1e3) {
            return (num / 1e3).toFixed(2) + 'K';
        }
        return num.toFixed(2);
    }

    showLoading(show) {
        const loading = document.getElementById('loading');
        const grid = document.getElementById('coinsGrid');
        
        if (show) {
            loading.style.display = 'block';
            grid.style.display = 'none';
        } else {
            loading.style.display = 'none';
            grid.style.display = 'grid';
        }
    }

    showError(message) {
        const grid = document.getElementById('coinsGrid');
        grid.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 50px; color: #ff4757;">
                <i class="fas fa-exclamation-triangle" style="font-size: 3rem; margin-bottom: 20px;"></i>
                <h3>حدث خطأ</h3>
                <p>${message}</p>
                <button onclick="location.reload()" style="margin-top: 20px; padding: 10px 20px; background: #ffd700; color: #000; border: none; border-radius: 5px; cursor: pointer;">
                    إعادة المحاولة
                </button>
            </div>
        `;
    }

    startAutoUpdate() {
        // تحديث البيانات كل 30 ثانية
        setInterval(() => {
            if (!this.isLoading) {
                this.loadData();
            }
        }, CONFIG.UPDATE_INTERVAL);
    }

    // إزالة العملات التي تفقد التقييم
    removeUnderperformingCoins() {
        const threshold = 40; // الحد الأدنى للنقاط
        const initialCount = this.coins.length;
        
        this.coins = this.coins.filter(coin => coin.score >= threshold);
        
        if (this.coins.length < initialCount) {
            console.log(`تم إزالة ${initialCount - this.coins.length} عملة لعدم استيفاء المعايير`);
            this.renderCoins();
        }
    }

    // تحديث ترتيب العملات
    updateRankings() {
        this.coins.sort((a, b) => b.score - a.score);
        this.coins.forEach((coin, index) => {
            coin.rank = index + 1;
        });
    }
}

// تشغيل التطبيق
document.addEventListener('DOMContentLoaded', () => {
    new CryptoPumpDetector();
});

// إضافة مستمع للأخطاء العامة
window.addEventListener('error', (e) => {
    console.error('خطأ في التطبيق:', e.error);
});

// إضافة دعم للتحديث اليدوي
document.addEventListener('keydown', (e) => {
    if (e.key === 'F5' || (e.ctrlKey && e.key === 'r')) {
        e.preventDefault();
        location.reload();
    }
});
