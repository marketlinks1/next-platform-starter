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
    const apiKey = process.env.FMP_API_KEY;
    const url = `https://financialmodelingprep.com/api/v3/stock/list?apikey=${apiKey}`;

    console.log(`Fetching data from URL: ${url}`);
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`Failed to fetch data: ${response.statusText}`);
      return { statusCode: 500, body: JSON.stringify({ success: false, error: 'Failed to fetch data from FMP API' }) };
    }

    const tickers = await response.json();
    console.log(`Fetched ${tickers.length} tickers.`);

    // Allowed exchanges map
    const exchangeNameMap = {
      NASDAQ: 'NASDAQ',
      NYSE: 'NYSE',
      AMEX: 'AMEX',
      TSX: 'TSX',
      TSXV: 'TSXV',
      LSE: 'LSE',
      EURONEXT: 'EURONEXT',
    };

    const allowedExchanges = Object.keys(exchangeNameMap);

    // Log unmatched exchanges
    const unmatchedExchanges = new Set();
    const filteredTickers = tickers.filter((ticker) => {
      if (!ticker.exchange) {
        console.warn(`Missing exchange for ticker: ${ticker.symbol}`);
        return false;
      }
      if (!allowedExchanges.includes(ticker.exchange)) {
        unmatchedExchanges.add(ticker.exchange);
        return false;
      }
      return true;
    });

    console.log(`Unmatched exchanges: ${Array.from(unmatchedExchanges).join(', ')}`);
    console.log(`Filtered tickers count: ${filteredTickers.length}`);

    const batch = db.batch();
    const collectionRef = db.collection('allowed-tickers');

    // Add filtered tickers to Firestore
    filteredTickers.forEach((ticker) => {
      const docRef = collectionRef.doc(ticker.symbol);
      batch.set(docRef, {
        name: ticker.name,
        ticker: ticker.symbol,
        exchange: exchangeNameMap[ticker.exchange],
      });
    });

    await batch.commit();
    console.log(`Successfully updated ${filteredTickers.length} tickers in Firestore.`);

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: `Successfully updated ${filteredTickers.length} tickers.`,
      }),
    };
  } catch (error) {
    console.error('Error updating tickers:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: error.message,
      }),
    };
  }
};
