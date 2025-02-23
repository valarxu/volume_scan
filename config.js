require('dotenv').config();  // 添加这行到文件最上方

module.exports = {
    BINANCE_FAPI_BASE: 'https://fapi.binance.com',
    OKX_API_BASE: 'https://www.okx.com',  // 添加OKX API地址
    VOLUME_THRESHOLD: 100000000, // 币安 100M
    OKX_VOLUME_THRESHOLD: 100000000, // OKX 100M
    VOLUME_MULTIPLIER: 2, // 成交量倍数阈值
    KLINE_LIMIT: 20, // K线数量
    BATCH_SIZE: 5, // 批处理大小
    BATCH_DELAY: 500, // 批处理延迟（毫秒）
    
    // 代理配置
    PROXY_CONFIG: {
        host: '127.0.0.1',
        port: 4780
    },

    // OKX API配置
    OKX_CONFIG: {
        apiKey: process.env.OKX_API_KEY || '',
        secretKey: process.env.OKX_SECRET_KEY || '',
        passphrase: process.env.OKX_PASSPHRASE || ''
    }
}; 