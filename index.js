require('dotenv').config();
const cron = require('node-cron');
const config = require('./config');
const { formatNumber } = require('./utils');
const binanceService = require('./binanceService');
const okxService = require('./okxService');

// 检查OKX环境变量
const isOkxConfigured = process.env.OKX_API_KEY && 
                       process.env.OKX_SECRET_KEY && 
                       process.env.OKX_PASSPHRASE;

async function analyzeBinanceMarketVolume() {
    try {
        console.log('开始币安市场成交量分析...\n');

        const activeSymbols = await binanceService.getActiveSymbols();
        console.log(`获取到 ${activeSymbols.length} 个活跃合约\n`);

        const volume24h = await binanceService.get24hVolume();

        const highVolumeSymbols = activeSymbols
            .filter(symbol => 
                (volume24h[symbol.symbol] || 0) > config.VOLUME_THRESHOLD && 
                !symbol.symbol.includes('USDC')
            )
            .map(symbol => symbol.symbol)
            .sort((a, b) => (volume24h[b] || 0) - (volume24h[a] || 0));

        console.log(`找到 ${highVolumeSymbols.length} 个交易量超过阈值的合约\n`);

        console.log('正在分析K线成交量...\n');
        const klineResults = await binanceService.processKlinesInBatches(highVolumeSymbols);

        await printAnalysisResults(klineResults, 'Binance');

    } catch (error) {
        console.error('币安程序执行出错:', error.message);
    }
}

async function analyzeOkxMarketVolume() {
    try {
        if (!isOkxConfigured) {
            console.log('OKX API未配置，跳过OKX市场分析');
            return;
        }

        console.log('开始OKX市场成交量分析...\n');

        const activeSymbols = await okxService.getActiveSymbols();
        console.log(`获取到 ${activeSymbols.length} 个活跃合约\n`);

        const volume24h = await okxService.get24hVolume();

        const highVolumeSymbols = activeSymbols
            .filter(symbol => 
                (volume24h[symbol.instId] || 0) > config.OKX_VOLUME_THRESHOLD
            )
            .map(symbol => symbol.instId)
            .sort((a, b) => (volume24h[b] || 0) - (volume24h[a] || 0));

        console.log(`找到 ${highVolumeSymbols.length} 个交易量超过阈值的合约\n`);

        console.log('正在分析K线成交量...\n');
        const klineResults = await okxService.processKlinesInBatches(highVolumeSymbols);

        await printAnalysisResults(klineResults, 'OKX');

    } catch (error) {
        console.error('OKX程序执行出错:', error.message);
    }
}

async function printAnalysisResults(klineResults, exchange) {
    const abnormalVolumes = klineResults
        .filter(result => result.volumeRatio >= config.VOLUME_MULTIPLIER)
        .sort((a, b) => b.volumeRatio - a.volumeRatio);

    console.log(`\n${exchange}分析结果：`);
    console.log('------------------------------------------------');
    console.log(`总计分析了 ${klineResults.length} 个交易对`);
    console.log(`成交量比率阈值：${config.VOLUME_MULTIPLIER}倍`);
    
    if (abnormalVolumes.length > 0) {
        console.log(`\n检测到 ${abnormalVolumes.length} 个交易对当前小时成交量异常：`);
        console.log('交易对      成交量比率    当前成交量    平均成交量    涨跌幅    收盘价');
        console.log('--------------------------------------------------------------------------------');
        
        abnormalVolumes.forEach(result => {
            console.log(
                `${result.symbol.padEnd(12)} ` +
                `${result.volumeRatio.toFixed(2).padEnd(12)} ` +
                `${formatNumber(result.currentVolume).padEnd(12)} ` +
                `${formatNumber(result.avgVolume).padEnd(12)} ` +
                `${result.priceChange.toFixed(2).padStart(6)}% ` +
                `${result.closePrice.toFixed(4)}`
            );
        });
    } else {
        console.log('\n未检测到异常成交量的交易对');
    }
    
    console.log('\n------------------------------------------------');
    console.log(`${exchange}检查完成时间：${new Date().toLocaleString()}`);
}

async function runAnalysis() {
    console.log('开始执行市场分析...');
    
    // 并行执行两个交易所的分析
    await Promise.all([
        analyzeBinanceMarketVolume(),
        analyzeOkxMarketVolume()
    ]);
}

// 设置定时任务：每小时的第55分钟执行
cron.schedule('55 * * * *', runAnalysis);

// 程序启动时执行一次
console.log('启动加密货币市场监控程序...\n');
runAnalysis().then(() => {
    console.log('\n初始化数据获取完成！');
}); 