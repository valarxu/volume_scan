const config = require('./config');
const { axiosInstance, sleep } = require('./utils');

class BinanceService {
    // 获取所有活跃合约信息
    async getActiveSymbols() {
        try {
            const response = await axiosInstance.get(`${config.BINANCE_FAPI_BASE}/fapi/v1/exchangeInfo`);
            return response.data.symbols.filter(symbol => 
                symbol.status === 'TRADING' && 
                symbol.contractType === 'PERPETUAL'
            );
        } catch (error) {
            console.error('获取交易对信息失败:', error.message);
            return [];
        }
    }

    // 获取24小时成交量数据
    async get24hVolume() {
        try {
            const response = await axiosInstance.get(`${config.BINANCE_FAPI_BASE}/fapi/v1/ticker/24hr`);
            const volumeMap = {};
            response.data.forEach(ticker => {
                volumeMap[ticker.symbol] = parseFloat(ticker.quoteVolume);
            });
            return volumeMap;
        } catch (error) {
            console.error('获取24小时成交量数据失败:', error.message);
            return {};
        }
    }

    // 获取K线数据
    async getKlineData(symbol) {
        try {
            const response = await axiosInstance.get(`${config.BINANCE_FAPI_BASE}/fapi/v1/klines`, {
                params: {
                    symbol: symbol,
                    interval: '1d',  // 改为日线
                    limit: 21
                }
            });
            
            if (response.data && response.data.length >= 21) {
                const klines = response.data;
                const volumes = klines.map(k => parseFloat(k[5]));
                
                const lastKline = klines[klines.length - 1];
                const openPrice = parseFloat(lastKline[1]);
                const closePrice = parseFloat(lastKline[4]);
                const priceChange = ((closePrice - openPrice) / openPrice) * 100;
                
                // 计算前20根K线的平均成交量
                const previousVolumes = volumes.slice(0, -1);
                const avgVolume = previousVolumes.reduce((a, b) => a + b, 0) / previousVolumes.length;
                const currentVolume = volumes[volumes.length - 1];
                const volumeRatio = currentVolume / avgVolume;

                // 检查是否是第一个触发阈值的K线
                const isFirstTrigger = volumeRatio >= config.VOLUME_MULTIPLIER && 
                    !previousVolumes.some(vol => vol >= avgVolume * config.VOLUME_MULTIPLIER);
                
                // 移除 USDT 后缀
                const cleanSymbol = symbol.replace('USDT', '');
                
                return {
                    symbol: cleanSymbol,
                    currentVolume,
                    avgVolume,
                    volumeRatio,
                    priceChange,
                    closePrice,
                    isFirstTrigger
                };
            }
            return null;
        } catch (error) {
            console.error(`获取${symbol} K线数据失败:`, error.message);
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

module.exports = new BinanceService();