export default async (request) => {
  try {
    // Parse the URL for query parameters
    const url = new URL(request.url);
    const action = url.searchParams.get("action");

    if (action !== "getAllowedTickers") {
      return new Response(
        JSON.stringify({ error: "Invalid action" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    // Allowed tickers array
    const allowedTickers = ["AAPL", "MSFT", "GOOGL", "AMZN", "TSLA"];

    return new Response(
      JSON.stringify({ tickers: allowedTickers }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (error) {
    console.error("Error in get-allowed-tickers:", error);

    return new Response(
      JSON.stringify({ error: "Internal Server Error" }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }
};
