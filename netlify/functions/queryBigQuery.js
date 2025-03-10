const { google } = require("googleapis");
const { BigQuery } = require("@google-cloud/bigquery");

exports.handler = async (event) => {
  try {
    // Decode the Base64 Key from Netlify Environment Variable
    const credentialsBase64 = process.env.GOOGLE_APPLICATION_CREDENTIALS_BASE64;
    const credentialsJson = JSON.parse(Buffer.from(credentialsBase64, "base64").toString("utf8"));

    // Initialize BigQuery Client with Decoded Credentials
    const bigquery = new BigQuery({ credentials: credentialsJson });

    // Example Query: Fetch Sentiment Data
    const query = `
      SELECT symbol, sentiment, COUNT(*) as count
      FROM \`the-market-links-12bef.news_analysis.news_sentiment\`
      GROUP BY symbol, sentiment
      ORDER BY count DESC
    `;

    const [rows] = await bigquery.query(query);

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, data: rows }),
    };

  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: error.message }),
    };
  }
};
