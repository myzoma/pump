class CryptoPumpDetector {
    constructor() {
        this.coins = [];
        this.init();
    }

    async init() {
        await this.loadData();
    }

    async loadData() {
        try {
            const response = await fetch('https://www.okx.com/api/v5/market/tickers?instType=SPOT');
            const data = await response.json();
            
            this.coins = data.data
                .filter(ticker => ticker.instId.endsWith('-USDT'))
                .slice(0, 10)
                .map(ticker => ({
                    symbol: ticker.instId.replace('-USDT', ''),
                    price: parseFloat(ticker.last),
                    change24h: parseFloat(ticker.chg24h) * 100
                }));
            
            this.renderCoins();
        } catch (error) {
            console.error('خطأ:', error);
        }
    }

    renderCoins() {
        const container = document.getElementById('coinsContainer');
        container.innerHTML = this.coins.map(coin => `
            <div class="coin-card">
                <h3>${coin.symbol}</h3>
                <p>السعر: $${coin.price}</p>
                <p>التغيير: ${coin.change24h.toFixed(2)}%</p>
            </div>
        `).join('');
    }
}

const detector = new CryptoPumpDetector();
