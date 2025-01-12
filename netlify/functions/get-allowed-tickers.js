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

// Mapping of short codes to full exchange names
const exchangeNameMap = {
  US: 'NASDAQ', // Or NYSE if needed
  TSX: 'Toronto Stock Exchange',
  LSE: 'London Stock Exchange',
  EURONEXT: 'Euronext',
};

exports.handler = async (event, context) => {
  const allowedExchanges = Object.keys(exchangeNameMap); // Use the keys from the exchange map
  const apiKey = process.env.FMP_API_KEY;

  try {
    // Fetch tickers from Financial Modeling Prep API
    const response = await fetch(
      `https://financialmodelingprep.com/api/v3/stock/list?apikey=${apiKey}`
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Error fetching tickers: ${response.status} - ${errorText}`);
      throw new Error(`Failed to fetch tickers: ${response.statusText}`);
    }

    const tickers = await response.json();

    // Filter tickers by allowed exchanges
    const filteredTickers = tickers.filter((ticker) =>
      allowedExchanges.includes(ticker.exchange)
    );

    console.log(`Filtered ${filteredTickers.length} tickers from allowed exchanges.`);

    for (const ticker of filteredTickers) {
      const data = {
        name: ticker.name || null,
        ticker: ticker.symbol || null,
        exchange: exchangeNameMap[ticker.exchange] || null,
      };

      // Validate required fields
      if (!data.name || !data.ticker || !data.exchange) {
        console.error(`Missing required fields for ticker: ${JSON.stringify(data)}`);
        continue;
      }

      // Save to Firestore
      await db.collection('allowedTickers').doc(data.ticker).set(data);
      console.log(`Saved ticker: ${data.ticker}`);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: `Successfully updated ${filteredTickers.length} tickers.`,
      }),
    };
  } catch (error) {
    console.error('Error updating tickers:', error.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: error.message }),
    };
  }
};
