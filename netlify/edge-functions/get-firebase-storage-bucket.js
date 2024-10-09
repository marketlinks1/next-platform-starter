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

  // Retrieve Firebase Storage Bucket from environment variables
  const firebaseStorageBucket = Deno.env.get("FIREBASE_STORAGE_BUCKET");

  // Check if Firebase Storage Bucket exists
  if (!firebaseStorageBucket) {
    return new Response(JSON.stringify({ error: "Firebase Storage Bucket not found" }), {
      headers: {
        "content-type": "application/json",
        "Access-Control-Allow-Origin": requestOrigin,
      },
    });
  }

  // Respond with the Firebase Storage Bucket, but ensure it's protected with CORS
  return new Response(JSON.stringify({ storageBucket: firebaseStorageBucket }), {
    headers: {
      "Access-Control-Allow-Origin": requestOrigin,
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "content-type": "application/json",
    },
  });
};
