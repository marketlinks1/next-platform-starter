export default async (request, context) => {
  // Retrieve API key from environment variables using Deno.env
  const apiKey = Deno.env.get("FMP_API_KEY");

  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'API Key not found' }), {
      headers: {
        'content-type': 'application/json',
        'Access-Control-Allow-Origin': '*', // Enable CORS
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  // Return the API key securely in the response
  return new Response(JSON.stringify({ apiKey }), {
    headers: {
      'content-type': 'application/json',
      'Access-Control-Allow-Origin': '*', // Enable CORS
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
};
