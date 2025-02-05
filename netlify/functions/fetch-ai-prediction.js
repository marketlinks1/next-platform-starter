const fetch = require('node-fetch');
const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
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
    console.log(`Processing AI prediction for: ${symbol.toUpperCase()}`);
    const symbolUpper = symbol.toUpperCase();
    const docRef = db.collection('aiPredictions').doc(symbolUpper);
    const docSnap = await docRef.get();
    const now = admin.firestore.Timestamp.now();

    if (docSnap.exists) {
      const data = docSnap.data();
      const lastFetched = data.lastFetched;
      const hoursElapsed = (now.toDate() - lastFetched.toDate()) / (1000 * 60 * 60);

      if (hoursElapsed < 24) {
        console.log(`Returning cached data for symbol: ${symbolUpper}`);
        return {
          statusCode: 200,
          headers: { 'Access-Control-Allow-Origin': corsHeader },
          body: JSON.stringify(data),
        };
      }
    }

    const fmpApiKey = process.env.FMP_API_KEY;
    const companyOutlookData = await fetchData(symbolUpper, fmpApiKey);
    const prompt = createAIPrompt(companyOutlookData);

    const aiPrediction = await callOpenAI(prompt);
    await docRef.set({
      symbol: symbolUpper,
      recommendation: aiPrediction,
      lastFetched: now,
    });

    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': corsHeader },
      body: JSON.stringify(aiPrediction),
    };
  } catch (error) {
    console.error('Error:', error);
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
  const technicalIndicatorsUrl = `https://financialmodelingprep.com/api/v3/technical_indicator/daily/${symbol}?period=14&type=rsi&apikey=${apiKey}`;
  const quoteUrl = `https://financialmodelingprep.com/api/v3/quote/${symbol}?apikey=${apiKey}`;

  const [outlookRes, esgRes, techRes, quoteRes] = await Promise.all([
    fetch(companyOutlookUrl).then((res) => res.json()),
    fetch(esgUrl).then((res) => res.json()),
    fetch(technicalIndicatorsUrl).then((res) => res.json()),
    fetch(quoteUrl).then((res) => res.json()),
  ]);

  return {
    companyOutlook: outlookRes || {},
    esgData: esgRes[0] || {},
    technicalIndicators: Array.isArray(techRes) && techRes.length > 0 ? techRes.slice(0, 30) : [],
    currentPrice: quoteRes[0]?.price || 0,
  };
}

function createAIPrompt(data) {
  const { companyOutlook, esgData, technicalIndicators, currentPrice } = data;

  const esgDescription = esgData.environmentalScore
    ? `ESG scores available with environmental: ${esgData.environmentalScore}, social: ${esgData.socialScore}, governance: ${esgData.governanceScore}`
    : "No recent ESG data available.";

  const technicalDescription = technicalIndicators.length > 0
    ? JSON.stringify(technicalIndicators)
    : "No recent technical indicators available.";

  return `
    Analyze the following stock (${companyOutlook.symbol || "Unknown Symbol"}) using recent data:
    - ESG Data: ${esgDescription}
    - Current Price: $${currentPrice}
    - Recent Technical Indicators: ${technicalDescription}
    
    Provide target prices for **1W** and **1M**, confidence scores, a short explanation, and a recommendation (Strong Buy, Buy, Hold, Sell, or Strong Sell).

    Format:
    {
      "1W": { "target_price": 0, "confidence_score": 0, "explanation": "Short explanation", "recommendation": "Buy" },
      "1M": { "target_price": 0, "confidence_score": 0, "explanation": "Short explanation", "recommendation": "Hold" }
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

  try {
    return JSON.parse(aiContent);
  } catch (error) {
    throw new Error("Failed to parse AI response as valid JSON.");
  }
}
