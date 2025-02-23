const axios = require('axios');
const config = require('./config');
const { HttpsProxyAgent } = require('https-proxy-agent');

// 创建代理agent
const proxyAgent = new HttpsProxyAgent(`http://${config.PROXY_CONFIG.host}:${config.PROXY_CONFIG.port}`);

// 创建axios实例
const axiosInstance = axios.create({
    timeout: 10000,
    httpsAgent: proxyAgent,
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }
});

// 延时函数
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// 格式化数字
const formatNumber = (num, decimals = 2) => {
    if (num >= 1000000000) {
        return (num / 1000000000).toFixed(decimals) + 'B';
    } else if (num >= 1000000) {
        return (num / 1000000).toFixed(decimals) + 'M';
    } else if (num >= 1000) {
        return (num / 1000).toFixed(decimals) + 'K';
    }
    return num.toFixed(decimals);
};

module.exports = {
    axiosInstance,
    sleep,
    formatNumber
}; 