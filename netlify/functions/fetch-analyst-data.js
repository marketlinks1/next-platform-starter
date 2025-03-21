const fetch = require('node-fetch');

exports.handler = async function (event) {
  const symbol = event.queryStringParameters.symbol || 'AAPL';
  const API_KEY = process.env.FMP_API_KEY;

  const allowedOrigins = [
    'https://amldash.webflow.io',
    'https://www.themarketlinks.com'
  ];

  const origin = event.headers.origin;
  const corsOrigin = allowedOrigins.includes(origin) ? origin : '';

  const priceTargetUrl = `https://financialmodelingprep.com/api/v4/price-target-consensus?symbol=${symbol}&apikey=${API_KEY}`;
  const consensusUrl = `https://financialmodelingprep.com/api/v4/upgrades-downgrades-consensus?symbol=${symbol}&apikey=${API_KEY}`;
  const quoteUrl = `https://financialmodelingprep.com/api/v3/quote/${symbol}?apikey=${API_KEY}`;

  try {
    const [priceTargetRes, consensusRes, quoteRes] = await Promise.all([
      fetch(priceTargetUrl),
      fetch(consensusUrl),
      fetch(quoteUrl)
    ]);

    if (!priceTargetRes.ok || !consensusRes.ok || !quoteRes.ok) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Failed to fetch one or more API responses.' })
      };
    }

    const priceTargetData = await priceTargetRes.json();
    const consensusData = await consensusRes.json();
    const quoteData = await quoteRes.json();

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': corsOrigin,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      },
      body: JSON.stringify({ priceTargetData, consensusData, quoteData })
    };
  } catch (error) {
    console.error('Error fetching data:', error);
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': corsOrigin,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      },
      body: JSON.stringify({ error: 'Server error while fetching data.' })
    };
  }
};
