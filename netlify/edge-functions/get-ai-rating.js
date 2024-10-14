// netlify/functions/get-ai-rating.js
const fetch = require('node-fetch');
const admin = require('firebase-admin');

// Initialize Firebase Admin SDK without databaseURL since Realtime Database is not used
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
      client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL
    })
    // No databaseURL
  });
}

const db = admin.firestore();

exports.handler = async (event, context) => {
  const { symbol } = event.queryStringParameters;

  if (!symbol) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Symbol is required' }),
    };
  }

  try {
    // Check Firestore for cached AI Rating
    const docRef = db.collection('aiRatings').doc(symbol);
    const docSnap = await docRef.get();
    const now = admin.firestore.Timestamp.now();

    if (docSnap.exists) {
      const data = docSnap.data();
      const lastFetched = data.lastFetched;
      const hoursElapsed = (now.toDate() - lastFetched.toDate()) / (1000 * 60 * 60);

      if (hoursElapsed < 24) {
        // Return cached data
        return {
          statusCode: 200,
          body: JSON.stringify(data.recommendation),
        };
      }
    }

    // Fetch stock data from FMP
    const fmpApiKey = process.env.FMP_API_KEY;
    const stockDataResponse = await fetch(`https://financialmodelingprep.com/api/v3/quote/${symbol}?apikey=${fmpApiKey}`);
    const stockData = await stockDataResponse.json();

    if (stockData.length === 0) {
      throw new Error('No stock data found for the given symbol.');
    }

    // Generate AI Rating using OpenAI
    const openAiApiKey = process.env.OPENAI_API_KEY;
    const prompt = `
      Analyze the following stock data and provide an investment recommendation.

      **Stock Information:**
      - **Name:** ${stockData[0].name} (${stockData[0].symbol})
      - **Current Price:** $${stockData[0].price}
      - **Percentage Change:** ${stockData[0].changesPercentage}%
      - **Volume:** ${stockData[0].volume}
      - **Market Cap:** $${stockData[0].marketCap}
      - **P/E Ratio:** ${stockData[0].pe}

      **Task:**
      Based on the above data, provide an investment recommendation. The response should be in JSON format as shown below:

      \`\`\`json
      {
        "rating": "Buy/Sell/Hold",
        "target_price": "target price in USD",
        "reason": "a very short reason",
        "criteria_count": 10
      }
      \`\`\`

      **Guidelines:**
      - Ensure the JSON structure is strictly followed.
      - The "rating" should be one of "Buy", "Sell", or "Hold".
      - "target_price" should be a numerical value representing the target price in USD.
      - "reason" should be concise, no longer than two sentences.
    `;

    const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openAiApiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 200,
        temperature: 0.7,
      }),
    });

    if (!aiResponse.ok) {
      throw new Error(`OpenAI API error: ${aiResponse.statusText}`);
    }

    const aiData = await aiResponse.json();
    const aiContent = aiData.choices[0]?.message?.content.trim();

    // Parse AI response
    const jsonMatch = aiContent.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON object found in AI response');
    const parsedAiData = JSON.parse(jsonMatch[0]);

    // Validate AI response
    if (!["Buy", "Sell", "Hold"].includes(parsedAiData.rating)) {
      throw new Error('Invalid rating value');
    }
    if (isNaN(parseFloat(parsedAiData.target_price))) {
      throw new Error('Invalid target price');
    }
    if (typeof parsedAiData.reason !== 'string') {
      throw new Error('Invalid reason format');
    }
    if (typeof parsedAiData.criteria_count !== 'number') {
      throw new Error('Invalid criteria count');
    }

    // Store AI Rating in Firestore
    await docRef.set({
      symbol: symbol,
      recommendation: parsedAiData,
      lastFetched: now,
      updatedAt: now
    });

    return {
      statusCode: 200,
      body: JSON.stringify(parsedAiData),
    };

  } catch (error) {
    console.error('Error in get-ai-rating function:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
