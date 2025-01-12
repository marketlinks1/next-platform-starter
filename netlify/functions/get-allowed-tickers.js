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
  const exchanges = ['NASDAQ', 'NYSE', 'AMEX', 'LSE', 'EURONEXT', 'TSX'];
  const apiKey = process.env.FMP_API_KEY;
  const allowedTickersCollection = db.collection('allowed-tickers');

  let totalTickers = 0;

  try {
    console.log('Fetching all tickers...');
    const response = await fetch(`https://financialmodelingprep.com/api/v3/stock/list?apikey=${apiKey}`);
    if (!response.ok) {
      console.error(`Error fetching tickers: ${response.statusText}`);
      return {
        statusCode: 500,
        body: JSON.stringify({ success: false, error: 'Failed to fetch tickers from API.' }),
      };
    }

    const data = await response.json();
    console.log(`Fetched ${data.length} total tickers.`);

    for (const exchange of exchanges) {
      console.log(`Processing tickers for exchange: ${exchange}`);
      const filteredTickers = data.filter((ticker) => ticker.exchangeShortName === exchange);

      console.log(`Found ${filteredTickers.length} tickers for exchange: ${exchange}`);
      for (const ticker of filteredTickers) {
        if (ticker.symbol && ticker.name) {
          const tickerData = {
            name: ticker.name,
            symbol: ticker.symbol,
            exchange: ticker.exchangeShortName,
            addedAt: admin.firestore.FieldValue.serverTimestamp(),
          };

          await allowedTickersCollection.doc(ticker.symbol).set(tickerData, { merge: true });
          totalTickers++;
        } else {
          console.log(`Skipping ticker with missing data:`, ticker);
        }
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: `Successfully updated ${totalTickers} tickers.`,
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
