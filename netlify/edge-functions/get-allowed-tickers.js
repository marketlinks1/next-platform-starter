import fetch from 'node-fetch'; // Import fetch for API requests
import admin from 'firebase-admin'; // Import Firebase Admin SDK

// Initialize Firebase Admin SDK (ensure it's only initialized once)
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

const db = admin.firestore(); // Initialize Firestore

export default async (request) => {
  try {
    const url = new URL(request.url);
    const action = url.searchParams.get('action'); // Get the 'action' query parameter

    // Validate the action parameter
    if (!action || action !== 'getAllowedTickers') {
      return new Response(JSON.stringify({ error: 'Invalid action' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Fetch data from Firestore
    const allowedTickersSnapshot = await db.collection('allowed-tickers').get();
    const allowedTickers = allowedTickersSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    // Return the allowed tickers as a JSON response
    return new Response(JSON.stringify(allowedTickers), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*', // CORS Header
      },
    });
  } catch (error) {
    console.error('Error in get-allowed-tickers:', error);

    // Return a 500 response on error
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*', // CORS Header
      },
    });
  }
};
