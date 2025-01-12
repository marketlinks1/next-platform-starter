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

exports.handler = async (event, context) => {
  const { exchange } = event.queryStringParameters;

  // Validate the presence of the 'exchange' query parameter
  if (!exchange || exchange.toUpperCase() !== 'NASDAQ') {
    return {
      statusCode: 400,
      body: JSON.stringify({
        success: false,
        message: 'Exchange parameter is required and must be "NASDAQ".',
      }),
    };
  }

  try {
    console.log(`Fetching tickers for exchange: ${exchange.toUpperCase()}`);

    const fmpApiKey = process.env.FMP_API_KEY;
    const baseUrl = `https://financialmodelingprep.com/api/v3/stock-screener`;
    const pageSize = 1000; // Maximum tickers per request
    let page = 1;
    let fetchedTickers = [];
    let totalFetched = 0;

    // Fetch all tickers using pagination
    while (true) {
      const apiUrl = `${baseUrl}?exchange=${exchange.toUpperCase()}&limit=${pageSize}&offset=${
        (page - 1) * pageSize
      }&apikey=${fmpApiKey}`;
      console.log(`Fetching page ${page} from URL: ${apiUrl}`);

      const response = await fetch(apiUrl);

      if (!response.ok) {
        throw new Error(`Failed to fetch data from API: ${response.statusText}`);
      }

      const tickers = await response.json();
      if (!tickers || tickers.length === 0) {
        console.log(`No more tickers to fetch. Total fetched: ${totalFetched}`);
        break;
      }

      fetchedTickers = fetchedTickers.concat(tickers);
      totalFetched += tickers.length;
      console.log(`Fetched ${tickers.length} tickers from page ${page}`);
      page++;
    }

    console.log(`Total tickers fetched for ${exchange.toUpperCase()}: ${fetchedTickers.length}`);

    // Filter out tickers that are not actively trading, ETFs, or funds
    const filteredTickers = fetchedTickers.filter(
      (ticker) => ticker.isActivelyTrading === true && ticker.isEtf === false && ticker.isFund === false
    );

    console.log(`Filtered down to ${filteredTickers.length} active tickers for exchange: ${exchange.toUpperCase()}`);

    if (filteredTickers.length === 0) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          success: true,
          message: 'No valid tickers found to update.',
        }),
      };
    }

    // Save tickers to Firestore collection 'tickers'
    let processedCount = 0;
    const batch = db.batch();

    filteredTickers.forEach((ticker) => {
      const docRef = db.collection('tickers').doc(ticker.symbol); // Use the stock symbol as the document ID
      batch.set(docRef, {
        name: ticker.name || null,
        symbol: ticker.symbol || null,
        exchange: ticker.exchangeShortName || exchange.toUpperCase(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      processedCount++;
    });

    // Commit the batch
    await batch.commit();

    console.log(`Successfully updated ${processedCount} tickers in the "tickers" collection.`);

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: `Successfully updated ${processedCount} tickers.`,
      }),
    };
  } catch (error) {
    console.error("Error updating tickers:", error.message);
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        message: error.message,
      }),
    };
  }
};
