require('dotenv').config();
const cron = require('node-cron');
const TelegramBot = require('node-telegram-bot-api');
const config = require('./config');
const { formatNumber } = require('./utils');
const binanceService = require('./binanceService');
const okxService = require('./okxService');

// 检查OKX环境变量
const isOkxConfigured = process.env.OKX_API_KEY && 
                       process.env.OKX_SECRET_KEY && 
                       process.env.OKX_PASSPHRASE;

// 初始化 Telegram Bot
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, {
    polling: false, // 关闭轮询模式
    request: {
        timeout: 30000 // 增加超时时间到30秒
    }
});
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// 添加消息发送函数，增加重试机制
async function sendTelegramMessage(message, retries = 3) {
    if (!process.env.TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
        console.log('Telegram配置未完成，跳过消息推送');
        return;
    }

    for (let i = 0; i < retries; i++) {
        try {
            const MAX_LENGTH = 3000;
            if (message.length <= MAX_LENGTH) {
                await bot.sendMessage(TELEGRAM_CHAT_ID, message);
            } else {
                // 将消息分割成最大3000字符的块
                let remainingMessage = message;
                while (remainingMessage.length > 0) {
                    let chunk;
                    if (remainingMessage.length <= MAX_LENGTH) {
                        chunk = remainingMessage;
                        remainingMessage = '';
                    } else {
                        // 尝试在合适的位置分割消息（如换行符）
                        let splitPos = remainingMessage.substring(0, MAX_LENGTH).lastIndexOf('\n');
                        if (splitPos === -1 || splitPos < MAX_LENGTH / 2) {
                            // 如果没有找到合适的换行符，就在最大长度处截断
                            splitPos = MAX_LENGTH;
                        }
                        chunk = remainingMessage.substring(0, splitPos);
                        remainingMessage = remainingMessage.substring(splitPos);
                    }
                    
                    await bot.sendMessage(TELEGRAM_CHAT_ID, chunk);
                    await new Promise(resolve => setTimeout(resolve, 500)); // 增加消息间隔到500ms
                }
            }
            return; // 发送成功，退出函数
        } catch (error) {
            console.error(`Telegram消息发送失败(第${i + 1}次尝试):`, error.message);
            if (i === retries - 1) {
                console.error('Telegram消息发送最终失败');
            } else {
                await new Promise(resolve => setTimeout(resolve, 2000)); // 失败后等待2秒再重试
            }
        }
    }
}

async function formatAnalysisResults(klineResults, exchange) {
    const abnormalVolumes = klineResults
        .filter(result => result.volumeRatio >= config.VOLUME_MULTIPLIER)
        .sort((a, b) => b.volumeRatio - a.volumeRatio);

    let message = ``;
    
    if (abnormalVolumes.length > 0) {
        message += `${exchange} ${abnormalVolumes.length} 个交易对小时成交量异常：\n`;
        
        // 调整列顺序，币种放在最后
        message += 
            '异常比率'.padEnd(10) +
            '涨跌幅'.padEnd(10) +
            '币种\n';

        // 设置高阈值
        const HIGH_THRESHOLD = 5;
        
        abnormalVolumes.forEach(result => {
            const ratioStr = result.volumeRatio.toFixed(2);
            const changeStr = result.priceChange.toFixed(2);

            // 添加emoji标记
            let symbolWithEmoji = result.symbol;
            if (result.isFirstTrigger) {
                symbolWithEmoji = `⚡️${symbolWithEmoji}`; // 首次触发阈值的币种
            }
            if (result.volumeRatio >= HIGH_THRESHOLD) {
                symbolWithEmoji = `🔥${symbolWithEmoji}`; // 高于高阈值的币种
            }

            message += 
                `${ratioStr}`.padEnd(10) +
                `${changeStr}%`.padEnd(10) +
                `${symbolWithEmoji}\n`;
        });
    } else {
        message += `\n${exchange}未检测到异常成交量的交易对`;
    }
    
    message += `\n${exchange}检查完成时间：${new Date().toLocaleString()}`;

    return message;
}

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

        // 控制台打印
        await printAnalysisResults(klineResults, 'Binance');
        
        // Telegram推送
        const message = await formatAnalysisResults(klineResults, 'Binance');
        await sendTelegramMessage(message);

    } catch (error) {
        console.error('币安程序执行出错:', error.message);
        await sendTelegramMessage(`币安程序执行出错: ${error.message}`);
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
            .filter(symbol => {
                const volume = volume24h[symbol.instId] || 0;
                return volume > config.OKX_VOLUME_THRESHOLD;
            })
            .map(symbol => symbol.instId)
            .sort((a, b) => (volume24h[b] || 0) - (volume24h[a] || 0));

        console.log(`找到 ${highVolumeSymbols.length} 个交易量超过阈值的合约\n`);

        console.log('正在分析K线成交量...\n');
        const klineResults = await okxService.processKlinesInBatches(highVolumeSymbols);

        // 控制台打印
        await printAnalysisResults(klineResults, 'OKX');
        
        // Telegram推送
        const message = await formatAnalysisResults(klineResults, 'OKX');
        await sendTelegramMessage(message);

    } catch (error) {
        console.error('OKX程序执行出错:', error.message);
        await sendTelegramMessage(`OKX程序执行出错: ${error.message}`);
    }
}

async function printAnalysisResults(klineResults, exchange) {
    const abnormalVolumes = klineResults
        .filter(result => result.volumeRatio >= config.VOLUME_MULTIPLIER)
        .sort((a, b) => b.volumeRatio - a.volumeRatio);

    if (abnormalVolumes.length > 0) {
        console.log(`\n${exchange}检测到 ${abnormalVolumes.length} 个交易对当前小时成交量异常：`);
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
    
    console.log(`${exchange}检查完成时间：${new Date().toLocaleString()}`);
}

async function runAnalysis() {
    console.log('开始执行市场分析...');
    
    try {
        // 串行执行而不是并行，避免同时发起太多请求
        await analyzeBinanceMarketVolume().catch(error => {
            console.error('币安分析失败:', error.message);
        });
        
        await analyzeOkxMarketVolume().catch(error => {
            console.error('OKX分析失败:', error.message);
        });
    } catch (error) {
        console.error('市场分析执行出错:', error.message);
    }
}

// 设置定时任务：每小时的第55分钟执行
cron.schedule('55 * * * *', runAnalysis);

// 程序启动时执行一次
console.log('启动加密货币市场监控程序...\n');
runAnalysis().then(() => {
    console.log('\n初始化数据获取完成！');
}); 