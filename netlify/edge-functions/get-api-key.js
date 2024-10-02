export default async (request, context) => {
  // Retrieve API key from Deno's environment
  const apiKey = Deno.env.get("FMP_API_KEY");

  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'API Key not found' }), {
      headers: { 'content-type': 'application/json' },
    });
  }

  // Return the API key securely in the response
  return new Response(JSON.stringify({ apiKey }), {
    headers: { 'content-type': 'application/json' },
  });
};
