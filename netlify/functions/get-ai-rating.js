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
    console.log('Handling CORS preflight request.');
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': 'https://yourwebflowsite.com', // Replace with your actual Webflow domain
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
        'Access-Control-Allow-Origin': 'https://yourwebflowsite.com', // Replace with your actual Webflow domain
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ error: 'Symbol is required' }),
    };
  }

  try {
    console.log(`Processing request for symbol: ${symbol.toUpperCase()}`);

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
            'Access-Control-Allow-Origin': 'https://yourwebflowsite.com', // Replace with your actual Webflow domain
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(data.recommendation),
        };
      } else {
        console.log(`Cached data for symbol: ${symbol.toUpperCase()} is older than 24 hours. Fetching new data.`);
      }
    } else {
      console.log(`No cached data found for symbol: ${symbol.toUpperCase()}. Fetching new data.`);
    }

    // Fetch comprehensive stock data from Financial Modeling Prep API using the Company Outlook endpoint
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

    // Prepare the data to feed into the AI
    // Remove any unnecessary data to keep the prompt within the token limit
    // For example, remove 'stockNews' and 'splitsHistory' if not needed

    // Remove 'stockNews' and 'splitsHistory' to reduce the data size
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

      **Stock Data (focus on the latest ESG data for this year and Technical Indicators for the past 30 days):**
      ${promptData}

      **Task:**
      Based on the above data, especially the recent data, provide an investment recommendation. The response should be in JSON format as shown below:

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
      - Focus on the most recent data in your analysis.
    `;

    /**
     * Function to call OpenAI API with controlled retry logic
     * @param {string} prompt - The prompt to send to OpenAI
     * @param {number} retries - Number of retry attempts
     * @param {number} delay - Initial delay in milliseconds
     * @returns {Response} - The fetch response from OpenAI
     */
    const callOpenAI = async (prompt, retries = 3, delay = 1000) => {
      for (let attempt = 1; attempt <= retries; attempt++) {
        try {
          console.log(`Attempt ${attempt}: Sending prompt to OpenAI`);
          // console.log(`Prompt: ${prompt}`);

          const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
            },
            body: JSON.stringify({
              model: 'gpt-4o-mini', // Updated model
              messages: [{ role: 'user', content: prompt }],
              max_tokens: 1000,
              temperature: 0.7,
            }),
          });

          console.log(`OpenAI Response Status: ${response.status}`);

          if (response.status === 429) {
            console.warn(`Rate limit hit on attempt ${attempt}. Retrying in ${delay}ms...`);
            if (attempt < retries) {
              await new Promise(res => setTimeout(res, delay));
              delay *= 2;
              continue;
            } else {
              throw new Error('Rate limit exceeded. Please try again later.');
            }
          }

          if (!response.ok) {
            const errorData = await response.text();
            console.error(`OpenAI API error: ${response.status} ${response.statusText} - ${errorData}`);
            throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
          }

          return response;
        } catch (error) {
          console.error(`Attempt ${attempt} failed: ${error.message}`);
          if (attempt === retries) {
            throw new Error('Exceeded maximum retries due to rate limits or other errors.');
          }
          console.log(`Waiting for ${delay}ms before next retry...`);
          await new Promise(res => setTimeout(res, delay));
          delay *= 2;
        }
      }
    };

    // Call OpenAI API with controlled retry logic
    const aiResponse = await callOpenAI(prompt);

    if (!aiResponse) {
      console.error('OpenAI API did not return a response.');
      throw new Error('OpenAI API did not return a response.');
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

    const aiContent = aiData.choices && aiData.choices[0] && aiData.choices[0].message && aiData.choices[0].message.content
      ? aiData.choices[0].message.content.trim()
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
    if (typeof parsedAiData.criteria_count !== 'number') {
      console.error('Invalid criteria count received from AI.');
      throw new Error('Invalid criteria count received from AI.');
    }

    // Store the AI Rating in Firestore for caching
    await docRef.set({
      symbol: symbolUpper,
      recommendation: parsedAiData,
      lastFetched: now,
      updatedAt: now
    });
    console.log(`Stored AI Rating for symbol: ${symbolUpper}`);

    // Return the AI Rating as JSON with CORS headers
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': 'https://yourwebflowsite.com', // Replace with your actual Webflow domain
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
        'Access-Control-Allow-Origin': 'https://yourwebflowsite.com', // Replace with your actual Webflow domain
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ error: error.message }),
    };
  }
};
