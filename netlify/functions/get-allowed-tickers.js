const fetch = require("node-fetch");
const admin = require("firebase-admin");

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      type: process.env.FIREBASE_TYPE,
      project_id: process.env.FIREBASE_PROJECT_ID,
      private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
      private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
      client_id: process.env.FIREBASE_CLIENT_ID,
      auth_uri: process.env.FIREBASE_AUTH_URI,
      token_uri: process.env.FIREBASE_TOKEN_URI,
      auth_provider_x509_cert_url: process.env.FIREBASE_AUTH_PROVIDER_X509_CERT_URL,
      client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL,
    }),
  });

  admin.firestore().settings({ ignoreUndefinedProperties: true });
}

const db = admin.firestore();

exports.handler = async (event, context) => {
  const { exchange } = event.queryStringParameters || {};
  const allowedExchanges = ["NASDAQ", "NYSE", "AMEX", "LSE", "EURONEXT", "TSX"];

  if (!exchange || !allowedExchanges.includes(exchange.toUpperCase())) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        success: false,
        message: `Invalid or missing exchange. Allowed exchanges: ${allowedExchanges.join(", ")}`,
      }),
    };
  }

  try {
    console.log(`Fetching tickers for exchange: ${exchange.toUpperCase()}`);
    const collectionRef = db.collection("tickers");
    const batch = db.batch();
    const pageSize = 1000;
    let page = 0;
    let totalFetched = 0;
    let processedCount = 0;

    while (true) {
      const apiUrl = `https://financialmodelingprep.com/api/v3/stock-screener?exchange=${exchange}&isEtf=false&isFund=false&isActivelyTrading=true&apikey=${process.env.FMP_API_KEY}&limit=${pageSize}&offset=${page * pageSize}`;
      console.log(`Fetching page ${page + 1}: ${apiUrl}`);

      const response = await fetch(apiUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch data: ${response.statusText}`);
      }

      const tickers = await response.json();
      if (tickers.length === 0) break;

      console.log(`Fetched ${tickers.length} tickers for page ${page + 1}`);
      totalFetched += tickers.length;

      tickers.forEach((ticker) => {
        if (!ticker.symbol || !ticker.name || !ticker.exchange) {
          console.warn(`Skipping invalid ticker: ${JSON.stringify(ticker)}`);
          return;
        }

        const docRef = collectionRef.doc(ticker.symbol);
        batch.set(docRef, {
          symbol: ticker.symbol,
          name: ticker.name,
          exchange: ticker.exchange,
          industry: ticker.industry || null,
          sector: ticker.sector || null,
          isEtf: ticker.isEtf || false,
          isFund: ticker.isFund || false,
          isActivelyTrading: ticker.isActivelyTrading || false,
          updatedAt: admin.firestore.Timestamp.now(),
        });
        processedCount++;
      });

      page++;

      // Commit the batch after every 500 writes to avoid Firestore batch limits
      if (processedCount % 500 === 0) {
        console.log(`Committing batch of 500 tickers...`);
        await batch.commit();
        processedCount = 0;
      }
    }

    // Commit any remaining batch writes
    if (processedCount > 0) {
      console.log(`Committing final batch of ${processedCount} tickers...`);
      await batch.commit();
    }

    console.log(`Successfully processed ${totalFetched} tickers for exchange: ${exchange.toUpperCase()}`);
    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: `Successfully processed ${totalFetched} tickers for exchange: ${exchange.toUpperCase()}`,
      }),
    };
  } catch (error) {
    console.error(`Error processing tickers for exchange ${exchange}:`, error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        message: `Error processing tickers for exchange ${exchange}: ${error.message}`,
      }),
    };
  }
};
