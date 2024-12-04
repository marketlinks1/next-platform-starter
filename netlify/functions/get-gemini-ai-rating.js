const fetch = require('node-fetch');
const admin = require('firebase-admin');
const { GoogleAuth } = require('google-auth-library');

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      // Your Firebase credentials
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
    // Add other Firebase configurations if necessary
  });
}

const db = admin.firestore();

exports.handler = async (event, context) => {
  const { symbol } = event.queryStringParameters || {};

  // Get the origin from the request headers
  const origin = event.headers.origin;
  const allowedOrigins = ['https://amldash.webflow.io']; // Add any other allowed origins here

  let corsHeader = '';

  if (allowedOrigins.includes(origin)) {
    corsHeader = origin;
  } else {
    corsHeader = 'https://amldash.webflow.io'; // Default to your main domain
  }

  // Handle CORS preflight requests
  if (event.httpMethod === 'OPTIONS') {
    console.log('Handling CORS preflight request.');
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': corsHeader,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
      body: '',
    };
  }

  // Validate the presence of the 'symbol' query parameter
  if (!symbol) {
    console.warn('No symbol provided in the query parameters.');
    return {
      statusCode: 400,
      headers: {
        'Access-Control-Allow-Origin': corsHeader,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ error: 'Symbol is required' }),
    };
  }

  try {
    const symbolUpper = symbol.toUpperCase();
    console.log(`Processing request for symbol: ${symbolUpper}`);

    // Reference to the new Firestore collection for caching
    const docRef = db.collection('geminiAiRatings').doc(symbolUpper);
    const docSnap = await docRef.get();
    const now = admin.firestore.Timestamp.now();

    // Check if cached data exists and is less than 24 hours old
    if (docSnap.exists) {
      const data = docSnap.data();
      const lastFetched = data.lastFetched;
      const hoursElapsed = (now.toDate() - lastFetched.toDate()) / (1000 * 60 * 60);

      if (hoursElapsed < 24) {
        console.log(`Returning cached data for symbol: ${symbolUpper}`);
        return {
          statusCode: 200,
          headers: {
            'Access-Control-Allow-Origin': corsHeader,
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ...data.recommendation,
            current_price: data.current_price,
          }),
        };
      } else {
        console.log(`Cached data for symbol: ${symbolUpper} is older than 24 hours. Fetching new data.`);
      }
    } else {
      console.log(`No cached data found for symbol: ${symbolUpper}. Fetching new data.`);
    }

    // Fetch essential stock data from Financial Modeling Prep API
    const fmpApiKey = process.env.FMP_API_KEY;

    // Fetch Current Price
    const quoteUrl = `https://financialmodelingprep.com/api/v3/quote/${symbolUpper}?apikey=${fmpApiKey}`;
    console.log(`Fetching current price from URL: ${quoteUrl}`);

    const quoteResponse = await fetch(quoteUrl);
    console.log(`Quote API response status: ${quoteResponse.status}`);

    if (!quoteResponse.ok) {
      const errorText = await quoteResponse.text();
      console.error(`Quote API error: ${quoteResponse.status} ${quoteResponse.statusText} - ${errorText}`);
      throw new Error(`Quote API error: ${quoteResponse.status} ${quoteResponse.statusText}`);
    }

    const quoteData = await quoteResponse.json();
    console.log(`Quote data received: ${JSON.stringify(quoteData)}`);

    let currentPrice = null;
    if (quoteData && quoteData.length > 0) {
      currentPrice = quoteData[0].price;
    } else {
      console.log('No current price data available.');
    }

    // Fetch ESG data for the current year
    const currentYear = new Date().getFullYear();
    const esgApiUrl = `https://financialmodelingprep.com/api/v4/esg-environmental-social-governance-data?symbol=${symbolUpper}&year=${currentYear}&apikey=${fmpApiKey}`;
    console.log(`Fetching ESG data from URL: ${esgApiUrl}`);

    const esgResponse = await fetch(esgApiUrl);
    console.log(`ESG data API response status: ${esgResponse.status}`);

    let esgScore = null;
    if (esgResponse.ok) {
      const esgDataArray = await esgResponse.json();
      console.log(`ESG data received: ${JSON.stringify(esgDataArray)}`);

      if (esgDataArray && esgDataArray.length > 0) {
        const latestEsgData = esgDataArray[0];
        esgScore = latestEsgData.totalEsg;
      } else {
        console.log('No ESG data available for the current year.');
      }
    } else {
      const errorText = await esgResponse.text();
      console.error(`ESG data API error: ${esgResponse.status} ${esgResponse.statusText} - ${errorText}`);
    }

    // Fetch latest RSI (14-day)
    const today = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(today.getDate() - 30);

    const formatDate = (date) => {
      const year = date.getFullYear();
      const month = ('0' + (date.getMonth() + 1)).slice(-2);
      const day = ('0' + date.getDate()).slice(-2);
      return `${year}-${month}-${day}`;
    };

    const fromDate = formatDate(thirtyDaysAgo);
    const toDate = formatDate(today);

    const technicalIndicatorsUrl = `https://financialmodelingprep.com/api/v3/technical_indicator/daily/${symbolUpper}?period=14&type=rsi&from=${fromDate}&to=${toDate}&apikey=${fmpApiKey}`;
    console.log(`Fetching Technical Indicators data from URL: ${technicalIndicatorsUrl}`);

    const technicalIndicatorsResponse = await fetch(technicalIndicatorsUrl);
    console.log(`Technical Indicators API response status: ${technicalIndicatorsResponse.status}`);

    let latestRsi = null;
    if (technicalIndicatorsResponse.ok) {
      const technicalIndicatorsData = await technicalIndicatorsResponse.json();
      console.log(`Technical Indicators data received: ${JSON.stringify(technicalIndicatorsData)}`);

      if (technicalIndicatorsData && technicalIndicatorsData.length > 0) {
        latestRsi = technicalIndicatorsData[0].rsi;
      } else {
        console.log('No Technical Indicators data available for the past 30 days.');
      }
    } else {
      const errorText = await technicalIndicatorsResponse.text();
      console.error(`Technical Indicators API error: ${technicalIndicatorsResponse.status} ${technicalIndicatorsResponse.statusText} - ${errorText}`);
    }

    // Prepare a concise summary
    const summaryData = {
      symbol: symbolUpper,
      currentPrice,
      esgScore,
      latestRsi,
    };

    // Prepare the prompt
    const prompt = `
You are an AI investment analyst. Based on the following data for ${symbolUpper}, provide an investment recommendation:

- **Current Price**: $${summaryData.currentPrice ?? 'N/A'}
- **Total ESG Score**: ${summaryData.esgScore ?? 'N/A'}
- **Latest RSI (14-day)**: ${summaryData.latestRsi ?? 'N/A'}

Respond in JSON format as shown:

\`\`\`json
{
  "rating": "Buy/Sell/Hold",
  "target_price": "target price in USD",
  "reason": "a very short reason",
  "confidence": 95
}
\`\`\`

**Guidelines:**
- The "rating" should be "Buy", "Sell", or "Hold".
- "target_price" should be a numerical value in USD.
- "reason" should be concise, up to two sentences.
- "confidence" should be a numerical value between 1 and 100.
`;

    // Function to call the Gemini API (PaLM API) using a service account
    const callGeminiAPI = async (prompt) => {
      try {
        console.log(`Sending prompt to Gemini API`);

        // Authenticate using a service account
        const auth = new GoogleAuth({
          scopes: ['https://www.googleapis.com/auth/generative-language'],
        });

        const client = await auth.getClient();

        const apiUrl = 'https://generativelanguage.googleapis.com/v1beta2/models/text-bison-001:generateText';

        const response = await client.request({
          url: apiUrl,
          method: 'POST',
          params: {
            key: process.env.GEMINI_API_KEY, // If needed, or remove if using service account only
          },
          data: {
            prompt: {
              text: prompt,
            },
            temperature: 0.7,
            candidateCount: 1,
            maxOutputTokens: 500,
            topP: 0.95,
            topK: 40,
          },
        });

        console.log(`Gemini API Response Status: ${response.status}`);

        return response;
      } catch (error) {
        console.error(`Gemini API call failed: ${error.message}`);
        throw new Error(`Gemini API call failed: ${error.message}`);
      }
    };

    // Call Gemini API
    const aiResponse = await callGeminiAPI(prompt);

    if (!aiResponse) {
      console.error('Gemini API did not return a response.');
      throw new Error('Gemini API did not return a response.');
    }

    // Parse the AI response
    let aiData;
    try {
      aiData = aiResponse.data;
      console.log(`AI Response Data: ${JSON.stringify(aiData)}`);
    } catch (parseError) {
      console.error('Failed to parse AI response as JSON:', parseError);
      throw new Error('Failed to parse AI response as JSON.');
    }

    const aiContent =
      aiData.candidates &&
      aiData.candidates[0] &&
      aiData.candidates[0].output
        ? aiData.candidates[0].output.trim()
        : null;
    console.log(`AI Content: ${aiContent}`);

    if (!aiContent) {
      console.error('AI response is empty or malformed.');
      throw new Error('AI response is empty or malformed.');
    }

    // Extract JSON from AI response
    const jsonMatch = aiContent.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('No JSON object found in AI response.');
      throw new Error('No JSON object found in AI response.');
    }
    let parsedAiData;
    try {
      parsedAiData = JSON.parse(jsonMatch[0]);
      console.log(`Parsed AI Data: ${JSON.stringify(parsedAiData)}`);
    } catch (jsonParseError) {
      console.error('Failed to parse JSON from AI response:', jsonParseError);
      throw new Error('Failed to parse JSON from AI response.');
    }

    // Validate AI response structure and content
    if (!["Buy", "Sell", "Hold"].includes(parsedAiData.rating)) {
      console.error('Invalid rating value received from AI.');
      throw new Error('Invalid rating value received from AI.');
    }
    if (isNaN(parseFloat(parsedAiData.target_price))) {
      console.error('Invalid target price value received from AI.');
      throw new Error('Invalid target price value received from AI.');
    }
    if (typeof parsedAiData.reason !== 'string') {
      console.error('Invalid reason format received from AI.');
      throw new Error('Invalid reason format received from AI.');
    }
    if (
      typeof parsedAiData.confidence !== 'number' ||
      parsedAiData.confidence < 1 ||
      parsedAiData.confidence > 100
    ) {
      console.error('Invalid confidence value received from AI.');
      throw new Error('Invalid confidence value received from AI.');
    }

    // Store the AI Rating along with current price in Firestore for caching
    await docRef.set({
      symbol: symbolUpper,
      recommendation: parsedAiData,
      current_price: currentPrice,
      lastFetched: now,
      updatedAt: now,
    });
    console.log(`Stored AI Rating for symbol: ${symbolUpper} in 'geminiAiRatings' collection`);

    // Return the AI Rating and current price as JSON with CORS headers
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': corsHeader,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...parsedAiData,
        current_price: currentPrice,
      }),
    };
  } catch (error) {
    console.error('Error in function:', error);
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': corsHeader,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ error: error.message }),
    };
  }
};
