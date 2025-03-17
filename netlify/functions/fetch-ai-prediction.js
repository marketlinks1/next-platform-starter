const fetch = require('node-fetch');
const admin = require('firebase-admin');

// Initialize Firebase only once
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

// Define allowed origins
const allowedOrigins = [
    'https://www.themarketlinks.com'
];

exports.handler = async (event) => {
  const origin = event.headers.origin;
  // Use the incoming origin if it's in our allowed list, otherwise default to the first allowed origin
  const corsHeader = origin && allowedOrigins.includes(origin) ? origin : allowedOrigins[0];

  // Handle preflight CORS requests
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': corsHeader,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
      body: '',
    };
  }

  const { symbol } = event.queryStringParameters || {};
  if (!symbol) {
    return createResponse(400, corsHeader, { error: 'Symbol is required.' });
  }

  try {
    const upperSymbol = symbol.toUpperCase();
    const docRef = db.collection('aiPredictions').doc(upperSymbol);
    const docSnap = await docRef.get();
    const now = admin.firestore.Timestamp.now();

    // Check Firestore for existing prediction (valid for 24 hours)
    if (docSnap.exists) {
      const { lastFetched, recommendation } = docSnap.data();
      const hoursElapsed = (now.toDate() - lastFetched.toDate()) / (1000 * 60 * 60);
      if (hoursElapsed < 24) {
        return createResponse(200, corsHeader, { recommendation });
      }
    }

    // Fetch fundamental and technical data
    const fetchedData = await fetchData(upperSymbol);
    if (!fetchedData) {
      throw new Error('Failed to fetch fundamental and technical data.');
    }

    // Generate AI prompt and get prediction
    const prompt = createAIPrompt(fetchedData, upperSymbol);
    const aiPrediction = await callOpenAI(prompt);

    // Save prediction to Firestore
    await docRef.set({
      symbol: upperSymbol,
      recommendation: aiPrediction,
      fetchedData,
      lastFetched: now,
    });

    return createResponse(200, corsHeader, { recommendation: aiPrediction, fetchedData });
  } catch (error) {
    console.error('Error:', error.message);
    return createResponse(500, corsHeader, { error: error.message });
  }
};

// Create JSON response with CORS headers
function createResponse(statusCode, corsHeader, body) {
  return {
    statusCode,
    headers: {
      'Access-Control-Allow-Origin': corsHeader,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  };
}

// Fetch fundamental and technical data from FMP
async function fetchData(symbol) {
  const apiKey = process.env.FMP_API_KEY;

  const endpoints = {
    fundamentals: `https://financialmodelingprep.com/api/v3/income-statement/${symbol}?limit=1&apikey=${apiKey}`,
    balanceSheet: `https://financialmodelingprep.com/api/v3/balance-sheet-statement/${symbol}?limit=1&apikey=${apiKey}`,
    technicals: `https://financialmodelingprep.com/api/v3/technical_indicator/daily/${symbol}?period=14&type=rsi&apikey=${apiKey}`,
  };

  try {
    const [fundamentalsRes, balanceSheetRes, technicalsRes] = await Promise.all([
      fetch(endpoints.fundamentals),
      fetch(endpoints.balanceSheet),
      fetch(endpoints.technicals),
    ]);

    if (!fundamentalsRes.ok || !balanceSheetRes.ok || !technicalsRes.ok) {
      throw new Error('Failed to fetch one or more data endpoints.');
    }

    const fundamentals = await fundamentalsRes.json();
    const balanceSheet = await balanceSheetRes.json();
    const technicals = await technicalsRes.json();

    return {
      fundamentals: fundamentals[0],
      balanceSheet: balanceSheet[0],
      technicals: technicals[0],
    };
  } catch (error) {
    console.error('Error fetching data:', error.message);
    return null;
  }
}

// Generate prompt for AI based on fetched data
function createAIPrompt({ fundamentals, balanceSheet, technicals }, symbol) {
  return `
You are an AI financial analyst. Based on the following data for ${symbol}, provide a recommendation: BUY, SELL, or HOLD. Consider the company's fundamentals, balance sheet, and technical indicators.

Fundamentals:
${JSON.stringify(fundamentals, null, 2)}

Balance Sheet:
${JSON.stringify(balanceSheet, null, 2)}

Technicals:
${JSON.stringify(technicals, null, 2)}

Respond in this JSON format:
{
  "recommendation": "BUY/SELL/HOLD",
  "reason": "Brief explanation of your recommendation."
}
  `;
}

// Call OpenAI API with the generated prompt
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
      max_tokens: 800,
      temperature: 0.5,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI API Error: ${response.statusText}`);
  }

  const { choices } = await response.json();
  const content = choices[0]?.message?.content?.trim();
  const jsonMatch = content.match(/\{[\s\S]*\}/);

  if (!jsonMatch) {
    console.error('AI Response:', content);
    throw new Error('Invalid AI response format.');
  }

  try {
    return JSON.parse(jsonMatch[0]);
  } catch (err) {
    console.error('Error parsing AI response:', err);
    throw new Error('Failed to parse AI response.');
  }
}
