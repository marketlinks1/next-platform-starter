const fetch = require('node-fetch');

exports.handler = async (event, context) => {
  const openAIApiKey = process.env.OPENAI_API_KEY;
  console.log(`OpenAI API Key: ${openAIApiKey ? 'Exists' : 'Not Found'}`);

  if (!openAIApiKey) {
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': 'https://yourwebflowsite.com', // Replace with your actual Webflow domain
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ error: 'OpenAI API Key not found.' }),
    };
  }

  const prompt = "Hello, OpenAI!";

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openAIApiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo', // Use a more commonly accessible model for testing
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 50,
        temperature: 0.7,
      }),
    });

    console.log(`OpenAI Response Status: ${response.status}`);

    if (!response.ok) {
      const errorData = await response.text();
      console.error(`OpenAI API error: ${response.status} ${response.statusText} - ${errorData}`);
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    console.log(`OpenAI Response Data: ${JSON.stringify(data)}`);

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': 'https://yourwebflowsite.com', // Replace with your actual Webflow domain
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ success: true, data }),
    };

  } catch (error) {
    console.error('Error calling OpenAI:', error);
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': 'https://yourwebflowsite.com', // Replace with your actual Webflow domain
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ error: error.message }),
    };
  }
};
