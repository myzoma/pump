// إعدادات API
const CONFIG = {
    OKX_API: {
        BASE_URL: 'https://www.okx.com/api/v5',
        API_KEY: 'YOUR_API_KEY_HERE',
        SECRET_KEY: 'YOUR_SECRET_KEY_HERE',
        PASSPHRASE: 'YOUR_PASSPHRASE_HERE'
    },
    
    // إعدادات التحليل
    ANALYSIS_SETTINGS: {
        LIQUIDITY_DAYS: 7,
        MIN_VOLUME_USDT: 1000000, // حد أدنى للحجم
        RSI_PERIOD: 14,
        MACD_FAST: 12,
        MACD_SLOW: 26,
        MACD_SIGNAL: 9,
        MA_PERIODS: [20, 50, 200]
    },
    
    // العملات المستبعدة
    EXCLUDED_COINS: [
        'USDT', 'USDC', 'BUSD', 'DAI', 'TUSD', 'USDP', 'USDD',
        'FDUSD', 'PYUSD'
    ],
    
    // حد أدنى للسعر لاستبعاد العملات الصفرية
    MIN_PRICE: 0.000001,
    
    // عدد العملات المعروضة
    MAX_COINS: 100,
    
    // فترة التحديث بالميلي ثانية
    UPDATE_INTERVAL: 30000 // 30 ثانية
};
