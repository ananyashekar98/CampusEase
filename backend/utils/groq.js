// Groq's API is OpenAI-compatible, so this is just a plain fetch call —
// no SDK dependency needed. Get a free key at https://console.groq.com
//
// Model note: llama-3.3-70b-versatile was deprecated/shut down by Groq on
// 2026-08-16. Using openai/gpt-oss-120b (Groq's recommended replacement) —
// if that ever gets deprecated too, check https://console.groq.com/docs/deprecations
// and update the default below (or just set GROQ_MODEL in .env, no code change needed).

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

async function askGroq(messages) {
  if (!process.env.GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY is not set in .env — get a free one at console.groq.com');
  }

  const response = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
      messages,
      temperature: 0.2,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Groq API error (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('Groq API returned an empty response');
  }
  return content;
}

module.exports = { askGroq };
