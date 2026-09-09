export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

export async function onRequestPost(context) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  try {
    const body = await context.request.json();
    const message = body.message || '';
    const apiKey = context.env.OPENAI_API_KEY || context.env.GEMINI_API_KEY;

    // Appel OpenAI
    const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'Tu es un assistant support client direct, court et poli.' },
          { role: 'user', content: message },
        ],
      }),
    });

    const aiData = await aiRes.json();
    const reply = aiData.choices?.[0]?.message?.content || 'Merci pour votre message !';

    return new Response(JSON.stringify({ reply }), {
      status: 200,
      headers: corsHeaders,
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Erreur interne' }), {
      status: 500,
      headers: corsHeaders,
    });
  }
}
