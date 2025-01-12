import { initializeApp } from "firebase/app";
import { getFirestore, collection, setDoc, doc } from "firebase/firestore";
import fetch from "node-fetch";

// Initialize Firebase
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
  measurementId: process.env.FIREBASE_MEASUREMENT_ID,
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Define stock markets and API details
const markets = [
  { region: "US", exchange: "NYSE" },
  { region: "US", exchange: "NASDAQ" },
  { region: "CA", exchange: "TSX" },
  { region: "EU", exchange: "EURONEXT" },
  { region: "UK", exchange: "LSE" },
];

const FMP_API_KEY = process.env.FMP_API_KEY;

async function fetchTickers(exchange) {
  const url = `https://financialmodelingprep.com/api/v3/stock-screener?exchange=${exchange}&apikey=${FMP_API_KEY}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch tickers for ${exchange}: ${response.statusText}`);
  }
  return await response.json();
}

async function saveToFirestore(region, tickers) {
  const collectionRef = collection(db, "allowed-tickers");
  for (const ticker of tickers) {
    const docRef = doc(collectionRef, `${region}-${ticker.symbol}`);
    await setDoc(docRef, { ...ticker, region });
  }
}

export default async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    for (const market of markets) {
      const tickers = await fetchTickers(market.exchange);
      await saveToFirestore(market.region, tickers);
    }
    res.status(200).json({ message: "Tickers updated successfully" });
  } catch (error) {
    console.error("Error updating tickers:", error);
    res.status(500).json({ error: "Failed to update tickers" });
  }
};
