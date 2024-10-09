export default async (request, context) => {
  // Your allowed Webflow domain
  const allowedOrigins = ["https://amldash.webflow.io"];
  const requestOrigin = request.headers.get("origin");

  // Set CORS headers
  if (!allowedOrigins.includes(requestOrigin)) {
    return new Response("Forbidden", {
      status: 403,
      headers: {
        "content-type": "application/json",
        "Access-Control-Allow-Origin": requestOrigin,
      },
    });
  }

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

  // Check if firebaseConfig exists
  if (!firebaseConfig.apiKey) {
    return new Response(JSON.stringify({ error: "Firebase config not found" }), {
      headers: {
        "content-type": "application/json",
        "Access-Control-Allow-Origin": requestOrigin,
      },
    });
  }

  // Respond with the Firebase config, with CORS headers
  return new Response(JSON.stringify(firebaseConfig), {
    headers: {
      "Access-Control-Allow-Origin": requestOrigin,
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "content-type": "application/json",
    },
  });
};
