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

exports.handler = async (event) => {
  const corsHeader = event.headers.origin || 'https://amldash.webflow.io';

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

    // If prediction exists and is less than 24 hours old, return cached result
    if (docSnap.exists) {
      const { lastFetched, recommendation } = docSnap.data();
      const hoursElapsed = (now.toDate() - lastFetched.toDate()) / (1000 * 60 * 60);
      if (hoursElapsed < 24) {
        return createResponse(200, corsHeader, { recommendation });
      }
    }

    // Fetch new data and generate prediction
    const fetchedData = await fetchData(upperSymbol);
    const prompt = createAIPrompt(fetchedData, upperSymbol);
    const aiPrediction = await callOpenAI(prompt);

    // Save to Firestore
    await docRef.set({ symbol: upperSymbol, recommendation: aiPrediction, fetchedData, lastFetched: now });

    return createResponse(200, corsHeader, { recommendation: aiPrediction, fetchedData });
  } catch (error) {
    console.error('Error:', error.message);
    return createResponse(500, corsHeader, { error: error.message });
  }
};

// Helper: Create JSON response
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

// Fetch stock news and process with AI
async function fetchData(symbol) {
  const today = new Date();
  const oneWeekAgo = new Date(today.setDate(today.getDate() - 7));
  const formattedDate = (date) => date.toISOString().split('T')[0];

  const newsUrl = `https://financialmodelingprep.com/api/v3/stock_news?tickers=${symbol}&from=${formattedDate(oneWeekAgo)}&to=${formattedDate(new Date())}&limit=10&apikey=${process.env.FMP_API_KEY}`;

  const newsRes = await fetch(newsUrl);
  if (!newsRes.ok) throw new Error('Failed to fetch news data.');
  const newsData = await newsRes.json();

  const processedNews = await processNewsWithAI(newsData);
  return { newsSummary: processedNews };
}

// Process news data through OpenAI for sentiment
async function processNewsWithAI(newsArticles) {
  const deduplicated = deduplicateArticles(newsArticles);
  const prompt = generateNewsSentimentPrompt(deduplicated);
  return await callOpenAI(prompt);
}

// Deduplicate articles based on title similarity
function deduplicateArticles(articles) {
  const unique = [];
  const titles = new Set();

  articles.forEach(({ title }) => {
    const lowerTitle = title.toLowerCase();
    if (![...titles].some((t) => similarity(lowerTitle, t) > 0.85)) {
      unique.push({ title });
      titles.add(lowerTitle);
    }
  });

  return unique;
}

// Similarity check using Levenshtein distance
function similarity(a, b) {
  const dp = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));

  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }

  return 1 - dp[a.length][b.length] / Math.max(a.length, b.length);
}

// Generate prompt for AI sentiment analysis
function generateNewsSentimentPrompt(articles) {
  return `
Analyze the sentiment of these news headlines. Respond in JSON format only:
${articles.map((a, i) => `${i + 1}. "${a.title}"`).join('\n')}

Response format:
{
  "articles": [
    {
      "title": "Example Title",
      "sentiment": "Positive/Neutral/Negative",
      "sentimentScore": 85,
      "explanation": "Brief explanation."
    }
  ]
}
  `;
}

// Create final AI prompt for recommendation
function createAIPrompt(fetchedData, symbol) {
  return `
You are an AI stock advisor. Based on the news summary below for ${symbol}, give a final recommendation: BUY, SELL, or HOLD. Consider news sentiment and market trends.

News Summary:
${JSON.stringify(fetchedData.newsSummary, null, 2)}

Response format:
{
  "recommendation": "BUY/SELL/HOLD",
  "reason": "Short explanation."
}
  `;
}

// Call OpenAI API
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

  if (!response.ok) throw new Error(`OpenAI API Error: ${response.statusText}`);

  const { choices } = await response.json();
  const content = choices[0]?.message?.content?.trim();
  const jsonMatch = content.match(/\{[\s\S]*\}/);

  if (!jsonMatch) throw new Error('Invalid AI response format.');

  try {
    return JSON.parse(jsonMatch[0]);
  } catch {
    throw new Error('Failed to parse AI response.');
  }
}
