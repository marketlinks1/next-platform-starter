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
  if (!exchange) {
    return {
      statusCode: 400,
      body: JSON.stringify({ success: false, message: "Exchange is required." }),
    };
  }

  try {
    console.log(`Fetching tickers for exchange: ${exchange.toUpperCase()}`);

    // Fetch data from the stock screener API
    const apiUrl = `https://financialmodelingprep.com/api/v3/stock-screener?exchange=${exchange.toUpperCase()}&isActivelyTrading=true&apikey=${process.env.FMP_API_KEY}`;
    const response = await fetch(apiUrl);

    if (!response.ok) {
      throw new Error(`Failed to fetch data from API: ${response.statusText}`);
    }

    const tickers = await response.json();
    console.log(`Fetched ${tickers.length} tickers for exchange: ${exchange.toUpperCase()}`);

    if (tickers.length === 0) {
      return {
        statusCode: 200,
        body: JSON.stringify({ success: true, message: "No tickers found to update." }),
      };
    }

    // Save tickers to Firestore collection 'tickers'
    let processedCount = 0;
    const batch = db.batch();

    tickers.forEach((ticker) => {
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
      body: JSON.stringify({ success: true, message: `Successfully updated ${processedCount} tickers.` }),
    };
  } catch (error) {
    console.error("Error updating tickers:", error.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, message: error.message }),
    };
  }
};
