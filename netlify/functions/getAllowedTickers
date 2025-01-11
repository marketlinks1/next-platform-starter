const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      // Your Firebase credentials
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

exports.handler = async (event) => {
  // Enable CORS
  const allowedOrigins = ['https://amldash.webflow.io', 'https://your-site-url.com'];
  const origin = event.headers.origin || '';
  const corsHeader = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': corsHeader,
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
      body: '',
    };
  }

  try {
    console.log(`Fetching allowed tickers...`);

    // Fetch allowed tickers from Firestore
    const allowedTickersRef = db.collection('allowed-tickers');
    const snapshot = await allowedTickersRef.get();

    if (snapshot.empty) {
      console.warn('No allowed tickers found in Firestore.');
      return {
        statusCode: 404,
        headers: {
          'Access-Control-Allow-Origin': corsHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ error: 'No allowed tickers found.' }),
      };
    }

    const tickers = [];
    snapshot.forEach((doc) => {
      tickers.push({ id: doc.id, ...doc.data() });
    });

    console.log(`Allowed tickers fetched: ${JSON.stringify(tickers)}`);

    // Return the allowed tickers
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': corsHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(tickers),
    };
  } catch (error) {
    console.error('Error fetching allowed tickers:', error);
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': corsHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ error: 'Internal Server Error' }),
    };
  }
};
