module.exports = {
    BINANCE_FAPI_BASE: 'https://fapi.binance.com',
    VOLUME_THRESHOLD: 100000000, // 100M
    VOLUME_MULTIPLIER: 2, // 成交量倍数阈值
    KLINE_LIMIT: 20, // K线数量
    BATCH_SIZE: 5, // 批处理大小
    BATCH_DELAY: 500, // 批处理延迟（毫秒）
    
    // 代理配置
    PROXY_CONFIG: {
        host: '127.0.0.1',
        port: 4780
    }
}; 