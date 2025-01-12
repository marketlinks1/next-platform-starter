export default async (request) => {
  try {
    // Get the URL search parameters
    const url = new URL(request.url);
    const action = url.searchParams.get("action");

    // Check if the 'action' parameter is valid
    if (action !== "getAllowedTickers") {
      return {
        statusCode: 400,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ error: "Invalid action" }),
      };
    }

    // Define the allowed tickers
    const allowedTickers = ["AAPL", "MSFT", "GOOGL", "AMZN", "TSLA"]; // Example tickers

    // Return the allowed tickers
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ tickers: allowedTickers }),
    };
  } catch (error) {
    console.error("Error in get-allowed-tickers:", error);

    // Handle unexpected errors
    return {
      statusCode: 500,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ error: "Internal Server Error" }),
    };
  }
};
