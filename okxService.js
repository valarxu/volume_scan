require('dotenv').config();
const axios = require('axios');
const config = require('./config');
const { sleep, formatNumber } = require('./utils');
const crypto = require('crypto');

// 生成OKX API所需的签名
function generateSignature(timestamp, method, requestPath, body = '') {
    const message = timestamp + method + requestPath + body;
    return crypto
        .createHmac('sha256', config.OKX_CONFIG.secretKey)
        .update(message)
        .digest('base64');
}

// 创建OKX专用的axios实例
const okxAxiosInstance = axios.create({
    baseURL: 'https://www.okx.com',
    timeout: 10000,
    headers: {
        'OK-ACCESS-KEY': process.env.OKX_API_KEY,
        'OK-ACCESS-PASSPHRASE': process.env.OKX_PASSPHRASE
    }
});

// 添加请求拦截器，注入OKX API所需的头信息
okxAxiosInstance.interceptors.request.use((reqConfig) => {
    const timestamp = new Date().toISOString();
    const method = reqConfig.method.toUpperCase();
    const requestPath = reqConfig.url;
    const body = reqConfig.data || '';

    reqConfig.headers = reqConfig.headers || {};
    reqConfig.headers['OK-ACCESS-TIMESTAMP'] = timestamp;
    reqConfig.headers['OK-ACCESS-SIGN'] = generateSignature(timestamp, method, requestPath, body);

    return reqConfig;
});

class OkxService {
    // 获取所有活跃合约信息
    async getActiveSymbols() {
        try {
            const response = await okxAxiosInstance.get('/api/v5/public/instruments', {
                params: {
                    instType: 'SWAP'
                }
            });
            
            return response.data.data.filter(symbol => 
                symbol.state === 'live' && 
                symbol.instId.includes('USDT')
            );
        } catch (error) {
            console.error('获取OKX交易对信息失败:', error.message);
            return [];
        }
    }

    // 获取24小时成交量数据
    async get24hVolume() {
        try {
            const response = await okxAxiosInstance.get('/api/v5/market/tickers', {
                params: {
                    instType: 'SWAP'
                }
            });
            
            const volumeMap = {};
            response.data.data.forEach(ticker => {
                if (ticker.instId.includes('USDT')) {
                    const volume = parseFloat(ticker.volCcy24h) * parseFloat(ticker.open24h);
                    volumeMap[ticker.instId] = volume;
                }
            });
            
            return volumeMap;
        } catch (error) {
            console.error('获取OKX 24小时成交量数据失败:', error.message);
            return {};
        }
    }

    // 获取K线数据
    async getKlineData(symbol) {
        try {
            const response = await okxAxiosInstance.get('/api/v5/market/candles', {
                params: {
                    instId: symbol,
                    bar: '1H',
                    limit: config.KLINE_LIMIT
                }
            });
            
            if (response.data.data && response.data.data.length > 0) {
                const klines = response.data.data.reverse();
                const volumes = klines.map(k => parseFloat(k[5]));
                
                const lastKline = klines[klines.length - 1];
                const openPrice = parseFloat(lastKline[1]);
                const closePrice = parseFloat(lastKline[4]);
                const priceChange = ((closePrice - openPrice) / openPrice) * 100;
                
                const avgVolume = volumes.slice(0, -1).reduce((a, b) => a + b, 0) / (volumes.length - 1);
                const currentVolume = volumes[volumes.length - 1];
                
                // 移除 -USDT-SWAP 后缀
                const cleanSymbol = symbol.replace('-USDT-SWAP', '');
                
                return {
                    symbol: cleanSymbol,
                    currentVolume,
                    avgVolume,
                    volumeRatio: currentVolume / avgVolume,
                    priceChange,
                    closePrice
                };
            }
            return null;
        } catch (error) {
            console.error(`获取OKX ${symbol} K线数据失败:`, error.message);
            return null;
        }
    }

    // 批量处理K线数据
    async processKlinesInBatches(symbols) {
        const results = [];
        
        for (let i = 0; i < symbols.length; i += config.BATCH_SIZE) {
            const batch = symbols.slice(i, i + config.BATCH_SIZE);
            const promises = batch.map(symbol => this.getKlineData(symbol));
            
            const batchResults = await Promise.all(promises);
            results.push(...batchResults.filter(r => r !== null));
            
            if (i + config.BATCH_SIZE < symbols.length) {
                await sleep(config.BATCH_DELAY);
            }
        }
        
        return results;
    }
}

module.exports = new OkxService(); 