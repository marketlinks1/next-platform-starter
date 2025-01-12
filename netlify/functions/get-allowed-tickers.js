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

exports.handler = async () => {
  try {
    const fmpApiKey = process.env.FMP_API_KEY;

    // Define the exchanges to fetch tickers for
    const exchanges = [
      { name: 'US', endpoint: `https://financialmodelingprep.com/api/v3/stock/list?apikey=${fmpApiKey}` },
      { name: 'Canada', endpoint: `https://financialmodelingprep.com/api/v3/stock/list?exchange=TSX&apikey=${fmpApiKey}` },
      { name: 'Euronext', endpoint: `https://financialmodelingprep.com/api/v3/stock/list?exchange=EURONEXT&apikey=${fmpApiKey}` },
      { name: 'London', endpoint: `https://financialmodelingprep.com/api/v3/stock/list?exchange=LSE&apikey=${fmpApiKey}` },
    ];

    // Loop through exchanges and fetch tickers
    for (const exchange of exchanges) {
      console.log(`Fetching tickers for ${exchange.name}`);
      const response = await fetch(exchange.endpoint);

      if (!response.ok) {
        throw new Error(`Failed to fetch tickers for ${exchange.name}: ${response.statusText}`);
      }

      const tickers = await response.json();
      console.log(`Fetched ${tickers.length} tickers for ${exchange.name}`);

      // Write tickers to Firestore
      const batch = db.batch();
      tickers.forEach((ticker) => {
        const docRef = db.collection('allowed-tickers').doc(ticker.symbol);
        batch.set(docRef, { ...ticker, exchange: exchange.name });
      });
      await batch.commit();
      console.log(`Stored tickers for ${exchange.name} in Firestore`);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Tickers populated successfully' }),
    };
  } catch (error) {
    console.error('Error populating tickers:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
