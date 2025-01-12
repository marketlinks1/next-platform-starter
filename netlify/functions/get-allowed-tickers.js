import fetch from 'node-fetch';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Initialize Firebase Admin SDK
const app = initializeApp({
  credential: cert({
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

const db = getFirestore(app);

// Edge Function Default Export
export default async (request) => {
  const allowedOrigins = ['https://amldash.webflow.io'];
  const origin = request.headers.get('origin');

  let corsHeader = '';
  if (allowedOrigins.includes(origin)) {
    corsHeader = origin;
  } else {
    corsHeader = 'https://amldash.webflow.io';
  }

  // Handle CORS preflight requests
  if (request.method === 'OPTIONS') {
    return new Response('', {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': corsHeader,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  try {
    console.log('Fetching allowed tickers from Financial Modeling Prep API');

    const fmpApiKey = process.env.FMP_API_KEY;
    const endpoint = `https://financialmodelingprep.com/api/v3/stock/list?apikey=${fmpApiKey}`;
    const response = await fetch(endpoint);

    if (!response.ok) {
      throw new Error(`Failed to fetch allowed tickers. Status: ${response.status}`);
    }

    const tickers = await response.json();

    // Prepare batch write to Firestore
    const batch = db.batch();
    const collectionRef = db.collection('allowedTickers');

    tickers.forEach((ticker) => {
      if (ticker.symbol && ticker.name) {
        const docRef = collectionRef.doc(ticker.symbol);
        batch.set(docRef, {
          symbol: ticker.symbol,
          name: ticker.name,
          exchange: ticker.exchange,
          price: ticker.price,
          currency: ticker.currency,
          updatedAt: new Date(),
        });
      }
    });

    // Commit batch to Firestore
    await batch.commit();
    console.log(`Successfully saved ${tickers.length} tickers to Firestore`);

    return new Response(JSON.stringify({ success: true, message: `${tickers.length} tickers saved successfully` }), {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': corsHeader,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    console.error('Error in get-allowed-tickers function:', error);

    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: {
        'Access-Control-Allow-Origin': corsHeader,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Content-Type': 'application/json',
      },
    });
  }
};
