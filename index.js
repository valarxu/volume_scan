const cron = require('node-cron');
const config = require('./config');
const { formatNumber } = require('./utils');
const binanceService = require('./binanceService');

async function analyzeMarketVolume() {
    try {
        console.log('开始市场成交量分析...\n');

        // 1. 获取所有活跃合约
        const activeSymbols = await binanceService.getActiveSymbols();
        console.log(`获取到 ${activeSymbols.length} 个活跃合约\n`);

        // 2. 获取24小时成交量
        const volume24h = await binanceService.get24hVolume();

        // 3. 筛选高成交量的交易对
        const highVolumeSymbols = activeSymbols
            .filter(symbol => 
                (volume24h[symbol.symbol] || 0) > config.VOLUME_THRESHOLD && 
                !symbol.symbol.includes('USDC')
            )
            .map(symbol => symbol.symbol)
            .sort((a, b) => (volume24h[b] || 0) - (volume24h[a] || 0));

        console.log(`找到 ${highVolumeSymbols.length} 个交易量超过100M的合约\n`);

        // 4. 获取K线数据并分析
        console.log('正在分析K线成交量...\n');
        const klineResults = await binanceService.processKlinesInBatches(highVolumeSymbols);

        // 5. 筛选出异常成交量的交易对
        const abnormalVolumes = klineResults
            .filter(result => result.volumeRatio >= config.VOLUME_MULTIPLIER)
            .sort((a, b) => b.volumeRatio - a.volumeRatio);

        // 6. 打印结果
        console.log('\n分析结果：');
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
            console.log('所有交易对的当前成交量都未超过过去200根K线平均成交量的2倍');
        }
        
        console.log('\n------------------------------------------------');
        console.log(`检查完成时间：${new Date().toLocaleString()}`);

    } catch (error) {
        console.error('程序执行出错:', error.message);
    }
}

// 设置定时任务：每小时的第55分钟执行
cron.schedule('55 * * * *', async () => {
    console.log('开始执行定时任务...');
    await analyzeMarketVolume();
});

// 程序启动时执行一次
console.log('启动币安合约市场监控程序...\n');
analyzeMarketVolume().then(() => {
    console.log('\n初始化数据获取完成！');
}); 