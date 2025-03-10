const { execSync } = require("child_process");
const { BigQuery } = require("@google-cloud/bigquery");

async function ensureDependencies() {
  try {
    require.resolve("@google-cloud/bigquery"); // Check if installed
  } catch (e) {
    console.log("🚀 Installing dependencies...");
    execSync("npm install @google-cloud/bigquery", { stdio: "inherit" });
  }
}

exports.handler = async (event) => {
  try {
    // Ensure dependencies are installed
    await ensureDependencies();

    // Set up BigQuery client
    const bigquery = new BigQuery();

    // Define the SQL query
    const query = `
      SELECT symbol, sentiment, publishedDate
      FROM \`the-market-links-12bef.news_analysis.news_sentiment\`
      WHERE publishedDate >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)
      ORDER BY publishedDate DESC
      LIMIT 30
    `;

    // Run query
    const [rows] = await bigquery.query(query);

    return {
      statusCode: 200,
      body: JSON.stringify(rows),
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
