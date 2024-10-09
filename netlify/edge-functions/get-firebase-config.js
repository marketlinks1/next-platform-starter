export default async (request, context) => {
  // Retrieve Firebase configuration from environment variables
  const firebaseConfig = {
    apiKey: Deno.env.get("FIREBASE_API_KEY"),
    authDomain: Deno.env.get("FIREBASE_AUTH_DOMAIN"),
    projectId: Deno.env.get("FIREBASE_PROJECT_ID"),
    storageBucket: Deno.env.get("FIREBASE_STORAGE_BUCKET"),
    messagingSenderId: Deno.env.get("FIREBASE_MESSAGING_SENDER_ID"),
    appId: Deno.env.get("FIREBASE_APP_ID"),
    measurementId: Deno.env.get("FIREBASE_MEASUREMENT_ID"),
  };

  // Check if the firebaseConfig exists
  if (!firebaseConfig.apiKey) {
    return new Response(JSON.stringify({ error: "Firebase config not found" }), {
      headers: {
        "content-type": "application/json",
      },
    });
  }

  // Respond with the Firebase configuration, with CORS headers
  return new Response(JSON.stringify(firebaseConfig), {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "content-type": "application/json",
    },
  });
};
