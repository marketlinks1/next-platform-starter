const fetch = require('node-fetch');
const admin = require('firebase-admin');

// Initialize Firebase Admin SDK if not already initialized
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      // Firebase credentials
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

const fetchTickers = async (exchange, startPage, endPage, limit = 100) => {
  let allTickers = [];
  for (let page = startPage; page <= endPage; page++) {
    console.log(`Fetching page ${page} for exchange: ${exchange}`);
    const url = `https://financialmodelingprep.com/api/v3/stock-screener?exchange=${exchange}&isEtf=false&isFund=false&isActivelyTrading=true&limit=${limit}&page=${page}&apikey=${process.env.FMP_API_KEY}`;

    const response = await fetch(url);
    const tickers = await response.json();

    if (!tickers || tickers.length === 0) {
      console.log(`No more tickers found on page ${page}`);
      break; // Stop if no more tickers are found
    }

    allTickers.push(...tickers);
    console.log(`Fetched ${tickers.length} tickers from page ${page}`);
  }
  return allTickers;
};

exports.handler = async (event) => {
  try {
    const exchange = event.queryStringParameters.exchange || 'NASDAQ';
    const startPage = parseInt(event.queryStringParameters.startPage, 10) || 1;
    const endPage = parseInt(event.queryStringParameters.endPage, 10) || 50;
    const limit = parseInt(event.queryStringParameters.limit, 10) || 100;

    console.log(`Fetching tickers from page ${startPage} to ${endPage} for exchange: ${exchange}`);
    const tickers = await fetchTickers(exchange, startPage, endPage, limit);

    console.log(`Fetched a total of ${tickers.length} tickers. Saving to Firestore...`);
    const batch = db.batch();
    const collectionRef = db.collection('tickers');

    tickers.forEach((ticker) => {
      const docRef = collectionRef.doc(ticker.symbol);
      batch.set(docRef, {
        symbol: ticker.symbol,
        name: ticker.name,
        exchange: ticker.exchange,
        industry: ticker.industry || null,
        sector: ticker.sector || null,
        isEtf: ticker.isEtf,
        isFund: ticker.isFund,
        isActivelyTrading: ticker.isActivelyTrading,
        updatedAt: admin.firestore.Timestamp.now(),
      });
    });

    await batch.commit();
    console.log(`Successfully saved ${tickers.length} tickers to Firestore.`);

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: `Processed ${tickers.length} tickers from page ${startPage} to ${endPage} for exchange: ${exchange}.`,
      }),
    };
  } catch (error) {
    console.error('Error processing tickers:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        message: error.message,
      }),
    };
  }
};
