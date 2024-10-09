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

  // Retrieve Firebase API key from environment variables
  const firebaseApiKey = Deno.env.get("FIREBASE_API_KEY");

  // Check if firebaseApiKey exists
  if (!firebaseApiKey) {
    return new Response(JSON.stringify({ error: "Firebase API key not found" }), {
      headers: {
        "content-type": "application/json",
        "Access-Control-Allow-Origin": requestOrigin,
      },
    });
  }

  // Respond with the Firebase API key, with CORS headers
  return new Response(JSON.stringify({ apiKey: firebaseApiKey }), {
    headers: {
      "Access-Control-Allow-Origin": requestOrigin,
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "content-type": "application/json",
    },
  });
};
