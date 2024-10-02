export default async (request, context) => {
  // Retrieve API key from environment variables
  const apiKey = process.env.FMP_API_KEY;

  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'API Key not found' }), {
      headers: {
        'content-type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  // Return the API key securely in the response
  return new Response(JSON.stringify({ apiKey }), {
    headers: {
      'content-type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
};
