const fetch = require('node-fetch');
const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      type: process.env.FIREBASE_TYPE,
      project_id: process.env.FIREBASE_PROJECT_ID,
      private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
      private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
      client_id: process.env.FIREBASE_CLIENT_ID,
      auth_uri: process.env.FIREBASE_AUTH_URI,
      token_uri: process.env.FIREBASE_TOKEN_URI,
      auth_provider_x509_cert_url: process.env.FIREBASE_AUTH_PROVIDER_X509_CERT_URL,
      client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL,
    }),
  });
}

const db = admin.firestore();

exports.handler = async (event) => {
  const { symbol } = event.queryStringParameters;
  const corsHeader = event.headers.origin || 'https://amldash.webflow.io';

  if (!symbol) {
    return {
      statusCode: 400,
      headers: { 'Access-Control-Allow-Origin': corsHeader },
      body: JSON.stringify({ error: 'Symbol is required' }),
    };
  }

  try {
    const symbolUpper = symbol.toUpperCase();
    const docRef = db.collection('aiPredictions').doc(symbolUpper);
    const docSnap = await docRef.get();
    const now = admin.firestore.Timestamp.now();

    if (docSnap.exists) {
      const data = docSnap.data();
      const lastFetched = data.lastFetched;
      const hoursElapsed = (now.toDate() - lastFetched.toDate()) / (1000 * 60 * 60);

      if (hoursElapsed < 24) {
        return {
          statusCode: 200,
          headers: { 'Access-Control-Allow-Origin': corsHeader },
          body: JSON.stringify(data),
        };
      }
    }

    const fmpApiKey = process.env.FMP_API_KEY;
    const fetchedData = await fetchData(symbolUpper, fmpApiKey);
    const prompt = createAIPrompt(fetchedData);

    const aiPrediction = await callOpenAI(prompt);

    await docRef.set({
      symbol: symbolUpper,
      recommendation: aiPrediction,
      fetchedData,
      lastFetched: now,
    });

    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': corsHeader },
      body: JSON.stringify({
        recommendation: aiPrediction,
        fetchedData,
      }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': corsHeader },
      body: JSON.stringify({ error: error.message }),
    };
  }
};

async function fetchData(symbol, apiKey) {
  const companyOutlookUrl = `https://financialmodelingprep.com/api/v4/company-outlook?symbol=${symbol}&apikey=${apiKey}`;
  const esgUrl = `https://financialmodelingprep.com/api/v4/esg-environmental-social-governance-data?symbol=${symbol}&year=${new Date().getFullYear()}&apikey=${apiKey}`;
  const sentimentUrl = `https://financialmodelingprep.com/api/v4/stock-news-sentiment?symbol=${symbol}&apikey=${apiKey}`;

  const today = new Date();
  const oneWeekAgo = new Date();
  const oneMonthAgo = new Date();
  oneWeekAgo.setDate(today.getDate() - 7);
  oneMonthAgo.setDate(today.getDate() - 30);

  const formatDate = (date) => date.toISOString().split('T')[0];

  const technical1WUrl = `https://financialmodelingprep.com/api/v3/technical_indicator/daily/${symbol}?from=${formatDate(oneWeekAgo)}&to=${formatDate(today)}&period=14&type=rsi&apikey=${apiKey}`;
  const technical1MUrl = `https://financialmodelingprep.com/api/v3/technical_indicator/daily/${symbol}?from=${formatDate(oneMonthAgo)}&to=${formatDate(today)}&period=14&type=rsi&apikey=${apiKey}`;
  const quoteUrl = `https://financialmodelingprep.com/api/v3/quote/${symbol}?apikey=${apiKey}`;

  const [outlookRes, esgRes, sentimentRes, tech1WRes, tech1MRes, quoteRes] = await Promise.all([
    fetch(companyOutlookUrl).then((res) => res.json()),
    fetch(esgUrl).then((res) => res.json()),
    fetch(sentimentUrl).then((res) => res.json()),
    fetch(technical1WUrl).then((res) => res.json()),
    fetch(technical1MUrl).then((res) => res.json()),
    fetch(quoteUrl).then((res) => res.json()),
  ]);

  const sentimentSummary = sentimentRes.sentiment ? `Positive: ${sentimentRes.sentiment.positive}, Negative: ${sentimentRes.sentiment.negative}` : "No recent news sentiment available.";

  return {
    companyOutlook: outlookRes || {},
    esgData: esgRes[0] || {},
    sentimentSummary,
    technical1W: tech1WRes.length > 0 ? tech1WRes : [],
    technical1M: tech1MRes.length > 0 ? tech1MRes : [],
    currentPrice: quoteRes[0]?.price || 0,
  };
}

function createAIPrompt(data) {
  const { companyOutlook, esgData, sentimentSummary, technical1W, technical1M, currentPrice } = data;

  const esgRisk = esgData.overallScore >= 70 ? "Low" : esgData.overallScore >= 40 ? "Moderate" : "High";

  return `
    Analyze the following stock (${companyOutlook.symbol || "Unknown Symbol"}) using recent data:
    - ESG Data: ${esgData.overallScore ? `Overall ESG Score: ${esgData.overallScore}, Risk: ${esgRisk}` : "No recent ESG data available."}
    - Current Price: $${currentPrice}
    - Technical Indicators (1 Week): ${technical1W.length > 0 ? JSON.stringify(technical1W.slice(0, 5)) : "No recent technical data available."}
    - Technical Indicators (1 Month): ${technical1M.length > 0 ? JSON.stringify(technical1M.slice(0, 5)) : "No recent technical data available."}
    - News Sentiment: ${sentimentSummary}

    Provide target prices for **1W** and **1M** and include:
    - Risk assessment (Low/Moderate/High)
    - Confidence score
    - Recommendation (Strong Buy, Buy, Hold, Sell, Strong Sell)

    Respond in this JSON format:
    {
      "1W": { "target_price": 0, "confidence_score": 0, "explanation": "Short explanation with mention of news, technicals, or ESG.", "risk_assessment": "Low/Moderate/High", "recommendation": "Buy" },
      "1M": { "target_price": 0, "confidence_score": 0, "explanation": "Short explanation with mention of news, technicals, or ESG.", "risk_assessment": "Low/Moderate/High", "recommendation": "Hold" }
    }
  `;
}

async function callOpenAI(prompt) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 500,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI API Error: ${response.statusText}`);
  }

  const responseData = await response.json();
  const aiContent = responseData.choices[0]?.message?.content?.trim();

  if (!aiContent) {
    throw new Error("Invalid or empty response from OpenAI.");
  }

  const jsonMatch = aiContent.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("No valid JSON found in AI response.");
  }

  try {
    return JSON.parse(jsonMatch[0]);
  } catch (error) {
    throw new Error("Failed to parse AI response as valid JSON.");
  }
}
