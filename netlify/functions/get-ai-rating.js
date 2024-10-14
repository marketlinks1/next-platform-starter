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
      client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL
    }),
    // Add other Firebase configurations if necessary
  });
}

const db = admin.firestore();

exports.handler = async (event, context) => {
  const { symbol } = event.queryStringParameters;

  // Handle CORS preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*', // Replace '*' with your Webflow domain for enhanced security
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
      body: '',
    };
  }

  // Validate the presence of the 'symbol' query parameter
  if (!symbol) {
    return {
      statusCode: 400,
      headers: {
        'Access-Control-Allow-Origin': '*', // Replace '*' with your Webflow domain for enhanced security
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      },
      body: JSON.stringify({ error: 'Symbol is required' }),
    };
  }

  try {
    // Reference to the Firestore document for caching
    const docRef = db.collection('aiRatings').doc(symbol.toUpperCase());
    const docSnap = await docRef.get();
    const now = admin.firestore.Timestamp.now();

    // Check if cached data exists and is less than 24 hours old
    if (docSnap.exists) {
      const data = docSnap.data();
      const lastFetched = data.lastFetched;
      const hoursElapsed = (now.toDate() - lastFetched.toDate()) / (1000 * 60 * 60);

      if (hoursElapsed < 24) {
        console.log(`Returning cached data for symbol: ${symbol.toUpperCase()}`);
        return {
          statusCode: 200,
          headers: {
            'Access-Control-Allow-Origin': '*', // Replace '*' with your Webflow domain for enhanced security
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(data.recommendation),
        };
      }
    }

    // Fetch stock data from Financial Modeling Prep API
    const fmpApiKey = process.env.FMP_API_KEY;
    const stockDataResponse = await fetch(`https://financialmodelingprep.com/api/v3/quote/${symbol.toUpperCase()}?apikey=${fmpApiKey}`);
    
    if (!stockDataResponse.ok) {
      const errorText = await stockDataResponse.text();
      throw new Error(`Financial Modeling Prep API error: ${stockDataResponse.status} ${stockDataResponse.statusText} - ${errorText}`);
    }

    const stockData = await stockDataResponse.json();

    if (!Array.isArray(stockData) || stockData.length === 0) {
      throw new Error('No stock data found for the given symbol.');
    }

    // Define the prompt for OpenAI
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

    /**
     * Function to call OpenAI API with retry logic
     * @param {string} prompt - The prompt to send to OpenAI
     * @param {number} retries - Number of retry attempts
     * @param {number} delay - Initial delay in milliseconds
     * @returns {Response} - The fetch response from OpenAI
     */
    const callOpenAI = async (prompt, retries = 3, delay = 1000) => {
      for (let attempt = 1; attempt <= retries; attempt++) {
        try {
          console.log(`Attempt ${attempt}: Sending prompt to OpenAI`);
          console.log(`Prompt: ${prompt}`); // Logging the prompt sent to OpenAI

          const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
            },
            body: JSON.stringify({
              model: 'gpt-4o-mini-2024-07-18', // Updated model
              messages: [{ role: 'user', content: prompt }],
              max_tokens: 1000, // Increased from 200 to 1000
              temperature: 0.7,
            }),
          });

          console.log(`OpenAI Response Status: ${response.status}`);

          if (response.status === 429) { // Too Many Requests
            console.warn(`Rate limit hit on attempt ${attempt}. Retrying in ${delay}ms...`);
            await new Promise(res => setTimeout(res, delay));
            delay *= 2; // Exponential backoff
            continue;
          }

          if (!response.ok) {
            const errorData = await response.text(); // Use text() to capture error details
            throw new Error(`OpenAI API error: ${response.status} ${response.statusText} - ${errorData}`);
          }

          return response;
        } catch (error) {
          console.error(`Attempt ${attempt} failed: ${error.message}`);
          if (attempt === retries) {
            throw new Error('Exceeded maximum retries due to rate limits or other errors.');
          }
          // Wait before next retry
          await new Promise(res => setTimeout(res, delay));
          delay *= 2; // Exponential backoff
        }
      }
    };

    // Call OpenAI API with retry logic
    const aiResponse = await callOpenAI(prompt);
    const aiData = await aiResponse.json();
    const aiContent = aiData.choices[0]?.message?.content.trim();

    console.log(`AI Response Content: ${aiContent}`); // Logging the AI response

    // Extract JSON from AI response
    const jsonMatch = aiContent.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON object found in AI response.');
    }
    const parsedAiData = JSON.parse(jsonMatch[0]);

    // Validate AI response structure and content
    if (!["Buy", "Sell", "Hold"].includes(parsedAiData.rating)) {
      throw new Error('Invalid rating value received from AI.');
    }
    if (isNaN(parseFloat(parsedAiData.target_price))) {
      throw new Error('Invalid target price value received from AI.');
    }
    if (typeof parsedAiData.reason !== 'string') {
      throw new Error('Invalid reason format received from AI.');
    }
    if (typeof parsedAiData.criteria_count !== 'number') {
      throw new Error('Invalid criteria count received from AI.');
    }

    // Store the AI Rating in Firestore for caching
    await docRef.set({
      symbol: symbol.toUpperCase(),
      recommendation: parsedAiData,
      lastFetched: now,
      updatedAt: now
    });

    console.log(`Stored AI Rating for symbol: ${symbol.toUpperCase()}`);

    // Return the AI Rating as JSON with CORS headers
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*', // Replace '*' with your Webflow domain for enhanced security
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(parsedAiData),
    };

  } catch (error) {
    console.error('Error in get-ai-rating function:', error);
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*', // Replace '*' with your Webflow domain for enhanced security
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ error: error.message }),
    };
  }
};
