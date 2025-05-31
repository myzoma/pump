// إعدادات API
const CONFIG = {
    OKX_API: {
        BASE_URL: 'https://www.okx.com/api/v5',
        API_KEY: 'b20c667d-ae40-48a6-93f4-a11a64185068',
        SECRET_KEY: 'BD7C76F71D1A4E01B4C7E1A23B620365',
        PASSPHRASE: '212160Nm$#'
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
    UPDATE_INTERVAL: 900000 // 30 ثانية
};
