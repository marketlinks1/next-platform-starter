export default async (request, context) => {
  // Your allowed origins - including both www and non-www versions
  const allowedOrigins = [
    "https://themarketlinks.com",
    "https://www.themarketlinks.com"  // Added the www version
  ];
  
  const requestOrigin = request.headers.get("origin");
  
  // Handle preflight OPTIONS requests
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": requestOrigin && allowedOrigins.includes(requestOrigin) 
          ? requestOrigin 
          : allowedOrigins[0],
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "86400", // 24 hours
      },
    });
  }
  
  // Check if the request's origin matches any of the allowed origins
  if (requestOrigin && !allowedOrigins.includes(requestOrigin)) {
    return new Response("Forbidden", {
      status: 403,
      headers: { "content-type": "application/json" },
    });
  }
  
  // Retrieve API key from environment variables securely using Deno.env.get
  const apiKey = Deno.env.get("FMP_API_KEY");
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "API Key not found" }), {
      status: 500,
      headers: { 
        "content-type": "application/json",
        "Access-Control-Allow-Origin": requestOrigin && allowedOrigins.includes(requestOrigin) 
          ? requestOrigin 
          : allowedOrigins[0],
      },
    });
  }
  
  // Respond with the API key, but ensure it's protected with CORS
  return new Response(JSON.stringify({ apiKey }), {
    headers: {
      "Access-Control-Allow-Origin": requestOrigin && allowedOrigins.includes(requestOrigin) 
        ? requestOrigin 
        : allowedOrigins[0],
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "content-type": "application/json",
    },
  });
};
