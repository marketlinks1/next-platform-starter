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
  const { exchange } = event.queryStringParameters || {};

  const allowedExchanges = ['NASDAQ', 'NYSE', 'AMEX', 'LSE', 'EURONEXT', 'TSX'];
  const corsHeader = 'https://amldash.webflow.io'; // Replace with your allowed origin

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': corsHeader,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
      body: '',
    };
  }

  if (!exchange || !allowedExchanges.includes(exchange.toUpperCase())) {
    return {
      statusCode: 400,
      headers: { 'Access-Control-Allow-Origin': corsHeader },
      body: JSON.stringify({ error: 'Invalid or missing exchange parameter' }),
    };
  }

  try {
    console.log(`Fetching tickers for exchange: ${exchange.toUpperCase()}`);

    const apiKey = process.env.FMP_API_KEY;
    const url = `https://financialmodelingprep.com/api/v3/stock-screener?isEtf=false&isFund=false&isActivelyTrading=true&exchange=${exchange.toUpperCase()}&limit=10000&apikey=${apiKey}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to fetch tickers: ${response.statusText}`);
    }

    const tickers = await response.json();

    if (!tickers.length) {
      console.warn(`No tickers found for exchange: ${exchange.toUpperCase()}`);
      return {
        statusCode: 200,
        headers: { 'Access-Control-Allow-Origin': corsHeader },
        body: JSON.stringify({ success: true, message: `No tickers found for ${exchange.toUpperCase()}` }),
      };
    }

    console.log(`Fetched ${tickers.length} tickers for exchange: ${exchange.toUpperCase()}`);

    const batch = db.batch();
    const collectionRef = db.collection('tickers');

    tickers.forEach((ticker) => {
      const docRef = collectionRef.doc(ticker.symbol);
      batch.set(docRef, {
        name: ticker.companyName || null,
        symbol: ticker.symbol,
        exchange: exchange.toUpperCase(),
        isActive: ticker.isActivelyTrading,
      });
    });

    await batch.commit();
    console.log(`Successfully saved ${tickers.length} tickers to Firestore.`);

    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': corsHeader },
      body: JSON.stringify({ success: true, message: `Saved ${tickers.length} tickers for ${exchange.toUpperCase()}` }),
    };
  } catch (error) {
    console.error('Error:', error.message);
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': corsHeader },
      body: JSON.stringify({ success: false, message: error.message }),
    };
  }
};
