import { initializeApp } from "firebase/app";
import { getFirestore, collection, setDoc, doc } from "firebase/firestore";
import fetch from "node-fetch";

// Firebase Configuration
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
  measurementId: process.env.FIREBASE_MEASUREMENT_ID,
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Markets Configuration
const markets = [
  { exchange: "US", region: "United States" },
  { exchange: "CA", region: "Canada" },
  { exchange: "EU", region: "Euronext" },
  { exchange: "LSE", region: "London" },
];

// Function to Fetch Tickers
async function fetchTickers(exchange) {
  const url = `https://financialmodelingprep.com/api/v3/stock/list?exchange=${exchange}&apikey=${process.env.FMP_API_KEY}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch tickers for exchange ${exchange}`);
  }
  return await response.json();
}

// Function to Save Tickers to Firestore
async function saveToFirestore(region, tickers) {
  const batch = collection(db, "allowed-tickers");
  for (const ticker of tickers) {
    const tickerDoc = doc(batch, ticker.symbol);
    await setDoc(tickerDoc, {
      name: ticker.name,
      exchange: ticker.exchange,
      region: region,
    });
  }
}

// Handler for Netlify Function
export default async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    for (const market of markets) {
      console.log(`Fetching tickers for ${market.exchange}...`);
      const tickers = await fetchTickers(market.exchange);
      console.log(`Fetched ${tickers.length} tickers for ${market.exchange}`);
      await saveToFirestore(market.region, tickers);
      console.log(`Saved tickers for ${market.region}`);
    }
    res.status(200).json({ message: "Tickers updated successfully" });
  } catch (error) {
    console.error("Error updating tickers:", error.message, error.stack);
    res.status(500).json({ error: "Failed to update tickers" });
  }
};
