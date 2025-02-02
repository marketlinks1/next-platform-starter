const fetch = require('node-fetch');

// Helper function: Calculate Simple Moving Average (SMA)
function calculateSMA(data, period) {
  if (data.length < period) return null;
  const sum = data.slice(0, period).reduce((acc, day) => acc + (day.close || 0), 0);
  return sum / period;
}

// Helper function: Calculate RSI
function calculateRSI(data, period = 14) {
  if (data.length < period) return null;
  let gains = 0, losses = 0;

  for (let i = 1; i < period + 1; i++) {
    const currentClose = data[i - 1]?.close || 0;
    const previousClose = data[i]?.close || 0;
    const change = currentClose - previousClose;

    if (change > 0) gains += change;
    else losses -= change;
  }

  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100; // No losses, RSI = 100
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

// Helper function: Calculate MACD
function calculateMACD(data, shortPeriod = 12, longPeriod = 26, signalPeriod = 9) {
  if (data.length < longPeriod) return null;

  // Calculate EMAs
  const shortEMA = calculateEMA(data, shortPeriod);
  const longEMA = calculateEMA(data, longPeriod);
  const macdLine = shortEMA - longEMA;

  // Calculate Signal Line (EMA of the MACD Line)
  const macdSignalLine = calculateEMA([{ close: macdLine }], signalPeriod);
  return { macdLine, macdSignalLine };
}

// Helper function: Calculate EMA
function calculateEMA(data, period) {
  const smoothingFactor = 2 / (period + 1);
  let ema = data[0]?.close || 0; // Initial EMA is the first price

  for (let i = 1; i < period; i++) {
    ema = ((data[i]?.close || 0) - ema) * smoothingFactor + ema;
  }
  return ema;
}

// Helper function: Calculate Bollinger Bands
function calculateBollingerBands(data, period = 20) {
  if (data.length < period) return null;

  const sma = calculateSMA(data, period);
  const variance = data.slice(0, period).reduce((acc, day) => acc + Math.pow((day.close || 0) - sma, 2), 0) / period;
  const stdDev = Math.sqrt(variance);

  return {
    upperBand: sma + 2 * stdDev,
    lowerBand: sma - 2 * stdDev
  };
}

// Final recommendation based on weighted scores
function getRecommendation(scores) {
  const totalScore = scores.rsi + scores.ma + scores.macd + scores.bollinger;

  if (totalScore >= 3) return 'Strong Buy';
  if (totalScore >= 1) return 'Buy';
  if (totalScore === 0) return 'Hold';
  if (totalScore <= -1) return 'Sell';
  return 'Strong Sell';
}

exports.handler = async function (event, context) {
  const symbol = event.queryStringParameters.symbol || 'AAPL';

  const apiKey = process.env.FMP_API_KEY || 'YOUR_API_KEY';
  const historicalDataUrl = `https://financialmodelingprep.com/api/v3/historical-price-full/${symbol}?timeseries=200&apikey=${apiKey}`;

  try {
    const response = await fetch(historicalDataUrl);
    if (!response.ok) throw new Error('Failed to fetch historical data');

    const data = await response.json();
    if (!data || !data.historical || data.historical.length === 0) {
      throw new Error('No historical data available');
    }

    // Filter out any entries without valid 'close' prices
    const historicalPrices = data.historical.filter(day => day.close !== undefined && day.close !== null);
    if (historicalPrices.length < 50) {
      throw new Error('Insufficient historical data for technical analysis');
    }

    // Calculate indicators
    const rsi = calculateRSI(historicalPrices, 14);
    const shortSMA = calculateSMA(historicalPrices, 50);
    const longSMA = calculateSMA(historicalPrices, 200);
    const macd = calculateMACD(historicalPrices);
    const bollingerBands = calculateBollingerBands(historicalPrices);

    // Generate recommendation scores
    let scores = {
      rsi: rsi < 20 ? 2 : rsi < 30 ? 1 : rsi > 80 ? -2 : rsi > 70 ? -1 : 0,
      ma: shortSMA > longSMA ? 1 : shortSMA < longSMA ? -1 : 0,
      macd: macd && macd.macdLine > macd.macdSignalLine ? 1 : -1,
      bollinger: historicalPrices[0]?.close < bollingerBands.lowerBand ? 1 : historicalPrices[0]?.close > bollingerBands.upperBand ? -1 : 0
    };

    // Calculate final recommendation
    const finalRecommendation = getRecommendation(scores);

    // Return the response
    return {
      statusCode: 200,
      body: JSON.stringify({
        symbol,
        rsi: rsi?.toFixed(2) || 'N/A',
        shortSMA: shortSMA?.toFixed(2) || 'N/A',
        longSMA: longSMA?.toFixed(2) || 'N/A',
        macd: macd || 'N/A',
        bollingerBands: bollingerBands || 'N/A',
        finalRecommendation
      })
    };

  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
