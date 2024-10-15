// netlify/functions/getNews.js

const fetch = require('node-fetch');

exports.handler = async (event, context) => {
  const { symbol } = event.queryStringParameters;

  if (!symbol) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Symbol query parameter is required.' }),
    };
  }

  const keyword = symbol.toUpperCase();

  const data = {
    "query": {
      "$query": {
        "$and": [
          {
            "$or": [
              { "keyword": keyword, "keywordLoc": "title" },
              { "keyword": keyword.toLowerCase(), "keywordLoc": "title" },
              { "keyword": "amzn", "keywordLoc": "body" },
              { "keyword": "amzn", "keywordLoc": "title" }
            ]
          },
          {
            "$or": [
              { "sourceUri": "reuters.com" },
              { "sourceUri": "seekingalpha.com" },
              { "sourceUri": "benzinga.com" },
              { "sourceUri": "bloomberg.com" },
              { "sourceUri": "marketwatch.com" },
              { "sourceUri": "barrons.com" }
            ]
          },
          { "lang": "eng" }
        ]
      },
      "$filter": {
        "forceMaxDataTimeWindow": "31"
      }
    },
    "resultType": "articles",
    "articlesSortBy": "date",
    "includeArticleSocialScore": true,
    "apiKey": process.env.NEWSAPI_KEY // Store your API key in environment variables
  };

  const url = 'https://newsapi.ai/api/v1/article/getArticles';

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const errorData = await response.json();
      return {
        statusCode: response.status,
        body: JSON.stringify({ error: errorData.message || 'Failed to fetch news data.' }),
      };
    }

    const result = await response.json();

    return {
      statusCode: 200,
      body: JSON.stringify(result),
    };
  } catch (error) {
    console.error('Error fetching news:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal Server Error.' }),
    };
  }
};
