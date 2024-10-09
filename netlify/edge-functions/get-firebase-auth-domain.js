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

  // Retrieve Firebase Auth Domain from environment variables
  const firebaseAuthDomain = Deno.env.get("FIREBASE_AUTH_DOMAIN");

  // Check if Firebase Auth Domain exists
  if (!firebaseAuthDomain) {
    return new Response(JSON.stringify({ error: "Firebase Auth Domain not found" }), {
      headers: {
        "content-type": "application/json",
        "Access-Control-Allow-Origin": requestOrigin,
      },
    });
  }

  // Respond with the Firebase Auth Domain, but ensure it's protected with CORS
  return new Response(JSON.stringify({ authDomain: firebaseAuthDomain }), {
    headers: {
      "Access-Control-Allow-Origin": requestOrigin,
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "content-type": "application/json",
    },
  });
};
