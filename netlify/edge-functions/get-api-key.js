export default async (request, context) => {
  // Your allowed Webflow domain
  const allowedOrigins = ["https://rusus-supercool-site-e2e39a.design.webflow.com"];
  const requestOrigin = request.headers.get("origin");

  // Check if the request's origin matches the allowed origin
  if (!allowedOrigins.includes(requestOrigin)) {
    return new Response("Forbidden", {
      status: 403,
      headers: { "content-type": "application/json" },
    });
  }

  // Retrieve API key from environment variables securely using Deno.env.get
  const apiKey = Deno.env.get("FMP_API_KEY");

  if (!apiKey) {
    return new Response(JSON.stringify({ error: "API Key not found" }), {
      headers: { "content-type": "application/json" },
    });
  }

  // Respond with the API key, but ensure it's protected with CORS
  return new Response(JSON.stringify({ apiKey }), {
    headers: {
      "Access-Control-Allow-Origin": requestOrigin, // Only allow the specific Webflow domain
      "Access-Control-Allow-Methods": "GET, OPTIONS", // Specify allowed methods
      "content-type": "application/json",
    },
  });
};
