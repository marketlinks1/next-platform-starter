const fetch = require('node-fetch');
const admin = require('firebase-admin');

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
  const { symbol } = event.queryStringParameters;

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
    console.log(`Processing request for symbol: ${symbol.toUpperCase()}`);

    // Reference to the new Firestore collection for caching
    const docRef = db.collection('geminiAiRatings').doc(symbol.toUpperCase());
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
        console.log(`Cached data for symbol: ${symbol.toUpperCase()} is older than 24 hours. Fetching new data.`);
      }
    } else {
      console.log(`No cached data found for symbol: ${symbol.toUpperCase()}. Fetching new data.`);
    }

    // Fetch comprehensive stock data from Financial Modeling Prep API
    const fmpApiKey = process.env.FMP_API_KEY;
    const symbolUpper = symbol.toUpperCase();

    // Fetch Company Outlook data
    const companyOutlookUrl = `https://financialmodelingprep.com/api/v4/company-outlook?symbol=${symbolUpper}&apikey=${fmpApiKey}`;
    console.log(`Fetching Company Outlook data from URL: ${companyOutlookUrl}`);

    const companyOutlookResponse = await fetch(companyOutlookUrl);
    console.log(`Company Outlook API response status: ${companyOutlookResponse.status}`);

    if (!companyOutlookResponse.ok) {
      const errorText = await companyOutlookResponse.text();
      console.error(`Company Outlook API error: ${companyOutlookResponse.status} ${companyOutlookResponse.statusText} - ${errorText}`);
      throw new Error(`Company Outlook API error: ${companyOutlookResponse.status} ${companyOutlookResponse.statusText}`);
    }

    const companyOutlookData = await companyOutlookResponse.json();
    console.log(`Company Outlook data received: ${JSON.stringify(companyOutlookData)}`);

    // Remove 'insideTrades' from the response if present
    if (companyOutlookData.insideTrades) {
      delete companyOutlookData.insideTrades;
      console.log('Removed "insideTrades" from the Company Outlook data.');
    }

    // Fetch ESG data for the current year
    const currentYear = new Date().getFullYear();
    const esgApiUrl = `https://financialmodelingprep.com/api/v4/esg-environmental-social-governance-data?symbol=${symbolUpper}&year=${currentYear}&apikey=${fmpApiKey}`;
    console.log(`Fetching ESG data from URL: ${esgApiUrl}`);

    const esgResponse = await fetch(esgApiUrl);
    console.log(`ESG data API response status: ${esgResponse.status}`);

    if (!esgResponse.ok) {
      const errorText = await esgResponse.text();
      console.error(`ESG data API error: ${esgResponse.status} ${esgResponse.statusText} - ${errorText}`);
      throw new Error(`ESG data API error: ${esgResponse.status} ${esgResponse.statusText}`);
    }

    const esgDataArray = await esgResponse.json();
    console.log(`ESG data received: ${JSON.stringify(esgDataArray)}`);

    // Include ESG data into the companyOutlookData
    if (esgDataArray && esgDataArray.length > 0) {
      const latestEsgData = esgDataArray[0];
      companyOutlookData.esgData = latestEsgData;
    } else {
      console.log('No ESG data available for the current year.');
    }

    // Fetch Technical Indicators data for the past 30 days
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

    if (!technicalIndicatorsResponse.ok) {
      const errorText = await technicalIndicatorsResponse.text();
      console.error(`Technical Indicators API error: ${technicalIndicatorsResponse.status} ${technicalIndicatorsResponse.statusText} - ${errorText}`);
      throw new Error(`Technical Indicators API error: ${technicalIndicatorsResponse.status} ${technicalIndicatorsResponse.statusText}`);
    }

    const technicalIndicatorsData = await technicalIndicatorsResponse.json();
    console.log(`Technical Indicators data received: ${JSON.stringify(technicalIndicatorsData)}`);

    // Include Technical Indicators data into the companyOutlookData
    if (technicalIndicatorsData && technicalIndicatorsData.length > 0) {
      companyOutlookData.technicalIndicators = technicalIndicatorsData;
    } else {
      console.log('No Technical Indicators data available for the past 30 days.');
    }

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

    if (quoteData && quoteData.length > 0) {
      companyOutlookData.currentPrice = quoteData[0].price;
    } else {
      console.log('No current price data available.');
      companyOutlookData.currentPrice = null;
    }

    // Remove unnecessary data to reduce the size
    if (companyOutlookData.stockNews) {
      delete companyOutlookData.stockNews;
      console.log('Removed "stockNews" from the Company Outlook data.');
    }
    if (companyOutlookData.splitsHistory) {
      delete companyOutlookData.splitsHistory;
      console.log('Removed "splitsHistory" from the Company Outlook data.');
    }

    // Prepare the prompt for the AI
    const promptData = JSON.stringify(companyOutlookData, null, 2);

    const prompt = `
Analyze the following stock data with emphasis on the most recent information and provide an investment recommendation.

**Stock Data (focus on the latest ESG data for this year, Technical Indicators for the past 30 days, and current price):**
${promptData}

**Task:**
Based on the above data, especially the recent data, provide an investment recommendation. The response should be in JSON format as shown below:

\`\`\`json
{
  "rating": "Buy/Sell/Hold",
  "target_price": "target price in USD",
  "reason": "a very short reason",
  "confidence": 95
}
\`\`\`

**Guidelines:**
- Ensure the JSON structure is strictly followed.
- The "rating" should be one of "Buy", "Sell", or "Hold".
- "target_price" should be a numerical value representing the target price in USD.
- "reason" should be concise, no longer than two sentences.
- "confidence" should be a numerical value between 1 and 100 indicating the confidence level.
- Focus on the most recent data in your analysis.
`;

    // Function to call Google's PaLM API (Gemini)
    const callGeminiAPI = async (prompt, retries = 3, delay = 1000) => {
      for (let attempt = 1; attempt <= retries; attempt++) {
        try {
          console.log(`Attempt ${attempt}: Sending prompt to Gemini API`);

          const apiKey = process.env.GEMINI_API_KEY; // Use your Gemini API key
          const apiUrl = 'https://generativelanguage.googleapis.com/v1beta2/models/text-bison-001:generateText';

          const response = await fetch(`${apiUrl}?key=${apiKey}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              prompt: {
                text: prompt,
              },
              temperature: 0.7,
              candidateCount: 1,
              maxOutputTokens: 1000,
              topP: 0.95,
              topK: 40,
            }),
          });

          console.log(`Gemini API Response Status: ${response.status}`);

          if (response.status === 429) {
            console.warn(`Rate limit hit on attempt ${attempt}. Retrying in ${delay}ms...`);
            if (attempt < retries) {
              await new Promise((res) => setTimeout(res, delay));
              delay *= 2;
              continue;
            } else {
              throw new Error('Rate limit exceeded. Please try again later.');
            }
          }

          if (!response.ok) {
            const errorData = await response.text();
            console.error(`Gemini API error: ${response.status} ${response.statusText} - ${errorData}`);
            throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
          }

          return response;
        } catch (error) {
          console.error(`Attempt ${attempt} failed: ${error.message}`);
          if (attempt === retries) {
            throw new Error('Exceeded maximum retries due to rate limits or other errors.');
          }
          console.log(`Waiting for ${delay}ms before next retry...`);
          await new Promise((res) => setTimeout(res, delay));
          delay *= 2;
        }
      }
    };

    // Call Gemini API with controlled retry logic
    const aiResponse = await callGeminiAPI(prompt);

    if (!aiResponse) {
      console.error('Gemini API did not return a response.');
      throw new Error('Gemini API did not return a response.');
    }

    // Attempt to parse the AI response
    let aiData;
    try {
      aiData = await aiResponse.json();
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
      current_price: companyOutlookData.currentPrice,
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
        current_price: companyOutlookData.currentPrice,
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
