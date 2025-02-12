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
  const today = new Date();
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(today.getDate() - 7);
  
  const formatDate = (date) => date.toISOString().split('T')[0];

  const newsUrl = `https://financialmodelingprep.com/stable/news/stock?symbols=${symbol}&from=${formatDate(oneWeekAgo)}&to=${formatDate(today)}&limit=10&apikey=${apiKey}`;

  const newsRes = await fetch(newsUrl).then(res => res.json());

  const aiGeneratedNewsSummary = await processNewsWithAI(newsRes);

  return {
    newsSummary: aiGeneratedNewsSummary
  };
}

async function processNewsWithAI(newsData) {
  const deduplicated = deduplicateArticles(newsData);

  const aiPrompt = generateNewsSentimentPrompt(deduplicated);

  const sentimentResponse = await callOpenAI(aiPrompt);

  return sentimentResponse;
}

function deduplicateArticles(articles) {
  const uniqueArticles = [];
  const seenTitles = new Set();

  articles.forEach(article => {
    const title = article.title.toLowerCase();
    if (![...seenTitles].some(existingTitle => similarity(title, existingTitle) > 0.85)) {
      uniqueArticles.push(article);
      seenTitles.add(title);
    }
  });

  return uniqueArticles;
}

function similarity(s1, s2) {
  const len1 = s1.length;
  const len2 = s2.length;
  const dp = Array.from({ length: len1 + 1 }, () => Array(len2 + 1).fill(0));

  for (let i = 0; i <= len1; i++) {
    for (let j = 0; j <= len2; j++) {
      if (i === 0) dp[i][j] = j;
      else if (j === 0) dp[i][j] = i;
      else if (s1[i - 1] === s2[j - 1]) dp[i][j] = dp[i - 1][j - 1];
      else dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }

  const distance = dp[len1][len2];
  const maxLen = Math.max(len1, len2);
  return 1 - distance / maxLen;
}

function generateNewsSentimentPrompt(articles) {
  let prompt = "Analyze the following news articles and respond ONLY in JSON format with sentiment scores and explanations:\n\n";
  articles.forEach((article, index) => {
    prompt += `${index + 1}. "${article.title}" - ${article.text}\n`;
  });
  prompt += `
  Respond in JSON format like this:
  {
    "articles": [
      {
        "title": "Title of Article",
        "sentiment": "Positive/Neutral/Negative",
        "sentimentScore": 85,
        "explanation": "Short explanation here"
      }
    ]
  }
  `;
  return prompt;
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
      max_tokens: 1000,
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
    console.error("AI response was not in valid JSON format:", aiContent);
    throw new Error("No valid JSON found in AI response.");
  }

  try {
    return JSON.parse(jsonMatch[0]);
  } catch (error) {
    console.error("Failed to parse AI response JSON:", aiContent);
    throw new Error("Failed to parse AI response as valid JSON.");
  }
}
