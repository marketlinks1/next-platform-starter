export default async (request) => {
  try {
    // Define the allowed tickers
    const allowedTickers = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA']; // Example tickers

    // Construct the JSON response
    const response = {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*', // Allow cross-origin requests; adjust as needed
        'Content-Type': 'application/json', // Return as JSON
      },
      body: JSON.stringify({ tickers: allowedTickers }), // Return the tickers
    };

    return response;
  } catch (error) {
    // Catch and log errors
    console.error('Error in get-allowed-tickers:', error);

    // Return an error response
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*', // Allow cross-origin requests
        'Content-Type': 'application/json', // Return as JSON
      },
      body: JSON.stringify({ error: 'Internal Server Error' }), // Error message
    };
  }
};
