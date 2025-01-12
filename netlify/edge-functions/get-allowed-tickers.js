import fetch from "node-fetch";
import admin from "firebase-admin";

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }),
  });
}

const db = admin.firestore();

// Supported exchanges
const exchanges = [
  { code: "NASDAQ", name: "US - NASDAQ" },
  { code: "NYSE", name: "US - NYSE" },
  { code: "TSX", name: "Canada - TSX" },
  { code: "EURONEXT", name: "Euronext" },
  { code: "LSE", name: "London Stock Exchange" },
];

export default async (request) => {
  try {
    const url = new URL(request.url);
    const action = url.searchParams.get("action");

    if (action === "updateAllowedTickers") {
      const apiKey = process.env.FMP_API_KEY;
      const batch = db.batch();

      for (const exchange of exchanges) {
        // Fetch tickers for the current exchange
        const response = await fetch(
          `https://financialmodelingprep.com/api/v3/stock/list?apikey=${apiKey}`
        );

        if (!response.ok) {
          throw new Error(`Failed to fetch data for ${exchange.name}`);
        }

        const data = await response.json();

        // Filter by exchange
        const filteredTickers = data.filter(
          (stock) => stock.exchange === exchange.code
        );

        // Add tickers to Firestore
        filteredTickers.forEach((stock) => {
          const docRef = db
            .collection("allowed-tickers")
            .doc(stock.symbol.toUpperCase());
          batch.set(docRef, {
            name: stock.name,
            exchange: exchange.name,
            lastUpdated: admin.firestore.Timestamp.now(),
          });
        });

        console.log(`Added ${filteredTickers.length} tickers for ${exchange.name}`);
      }

      await batch.commit();

      return new Response(
        JSON.stringify({ message: "Allowed tickers updated successfully" }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    } else if (action === "getAllowedTickers") {
      const snapshot = await db.collection("allowed-tickers").get();
      const tickers = snapshot.docs.map((doc) => ({
        symbol: doc.id,
        ...doc.data(),
      }));

      return new Response(
        JSON.stringify({ tickers }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    return new Response(
      JSON.stringify({ error: "Invalid action" }),
      {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (error) {
    console.error("Error in get-allowed-tickers:", error);

    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }
};
