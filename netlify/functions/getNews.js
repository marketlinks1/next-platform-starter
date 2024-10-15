// netlify/functions/getNews.js

const fetch = require('node-fetch');

exports.handler = async (event, context) => {
  // Handle preflight OPTIONS request
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': 'https://amldash.webflow.io', // Replace with your actual Webflow site domain
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
      body: '',
    };
  }

  // Only allow GET requests
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: {
        'Access-Control-Allow-Origin': 'https://amldash.webflow.io', // Replace with your actual Webflow site domain
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
      },
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    };
  }

  const { symbol } = event.queryStringParameters;

  if (!symbol) {
    return {
      statusCode: 400,
      headers: {
        'Access-Control-Allow-Origin': 'https://amldash.webflow.io', // Replace with your actual Webflow site domain
      },
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
              { "keyword": keyword.toLowerCase(), "keywordLoc": "title" }
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
    "apiKey": process.env.NEWSAPI_KEY // Ensure this environment variable is set in Netlify
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
        headers: {
          'Access-Control-Allow-Origin': 'https://amldash.webflow.io', // Replace with your actual Webflow site domain
        },
        body: JSON.stringify({ error: errorData.message || 'Failed to fetch news data.' }),
      };
    }

    const result = await response.json();

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': 'https://amldash.webflow.io', // Replace with your actual Webflow site domain
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(result),
    };
  } catch (error) {
    console.error('Error fetching news:', error);
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': 'https://amldash.webflow.io', // Replace with your actual Webflow site domain
      },
      body: JSON.stringify({ error: 'Internal Server Error.' }),
    };
  }
};
