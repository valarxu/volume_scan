require('dotenv').config();  // 添加这行到文件最上方

module.exports = {
    VOLUME_THRESHOLD: 100000000,      // 币安24小时成交量阈值（USDT）
    OKX_VOLUME_THRESHOLD: 50000000,  // OKX24小时成交量阈值（USDT）
    VOLUME_MULTIPLIER: 2,           // 当前小时成交量与过去24小时平均值的倍数阈值
    BATCH_SIZE: 5,                 // 批量处理大小
    KLINE_LIMIT: 20, // K线数量
    BATCH_DELAY: 500, // 批处理延迟（毫秒）
    
    // 币安API基础URL
    BINANCE_FAPI_BASE: 'https://fapi.binance.com',
    
    // OKX API配置
    OKX_CONFIG: {
        apiKey: process.env.OKX_API_KEY || '',
        secretKey: process.env.OKX_SECRET_KEY || '',
        passphrase: process.env.OKX_PASSPHRASE || ''
    }
}; 