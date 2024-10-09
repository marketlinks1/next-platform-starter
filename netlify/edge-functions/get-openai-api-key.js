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

  // Retrieve OpenAI API key from environment variables
  const openAiApiKey = Deno.env.get("OPENAI_API_KEY");

  // Check if OpenAI API Key exists
  if (!openAiApiKey) {
    return new Response(JSON.stringify({ error: "OpenAI API Key not found" }), {
      headers: {
        "content-type": "application/json",
        "Access-Control-Allow-Origin": requestOrigin,
      },
    });
  }

  // Respond with the OpenAI API key, but ensure it's protected with CORS
  return new Response(JSON.stringify({ apiKey: openAiApiKey }), {
    headers: {
      "Access-Control-Allow-Origin": requestOrigin,
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "content-type": "application/json",
    },
  });
};
