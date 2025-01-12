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
  const exchanges = ['NASDAQ', 'NYSE', 'AMEX', 'LSE', 'EURONEXT', 'TSX']; // Add other exchanges as needed
  const allowedTickersCollection = db.collection('allowed-tickers');

  try {
    console.log('Fetching all tickers...');
    let totalUpdated = 0;

    for (const exchange of exchanges) {
      console.log(`Fetching tickers for exchange: ${exchange}`);
      const url = `https://financialmodelingprep.com/api/v3/stock-screener?exchange=${exchange}&isActivelyTrading=true&apikey=${process.env.FMP_API_KEY}`;
      const response = await fetch(url);
      const tickers = await response.json();

      if (!response.ok) {
        console.error(`Failed to fetch data for exchange: ${exchange}, Status: ${response.status}`);
        continue;
      }

      console.log(`Fetched ${tickers.length} tickers for exchange: ${exchange}`);
      
      let processed = 0;

      for (const ticker of tickers) {
        if (!ticker.symbol || !ticker.exchange || !ticker.name) {
          continue; // Skip invalid data
        }

        const tickerData = {
          symbol: ticker.symbol,
          name: ticker.name,
          exchange: ticker.exchange,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        await allowedTickersCollection.doc(ticker.symbol).set(tickerData, { merge: true });
        processed++;

        if (processed % 500 === 0) {
          console.log(`Processed ${processed} tickers for exchange: ${exchange}`);
        }
      }

      console.log(`Processed ${processed} tickers for exchange: ${exchange}`);
      totalUpdated += processed;
    }

    console.log(`Successfully updated ${totalUpdated} tickers in total.`);
    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, message: `Successfully updated ${totalUpdated} tickers.` }),
    };
  } catch (error) {
    console.error('Error updating tickers:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: error.message }),
    };
  }
};
