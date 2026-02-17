// netlify/functions/classify.js
// Classifies transcribed text using Groq LLaMA — key stays server-side

exports.handler = async function(event) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const GROQ_KEY = process.env.GROQ_KEY;
    if (!GROQ_KEY) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'GROQ_KEY not set in Netlify environment variables' }),
        };
    }

    let text = '';
    try {
        const body = JSON.parse(event.body || '{}');
        text = body.text || '';
    } catch {
        return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
    }

    if (!text.trim()) {
        return { statusCode: 400, body: JSON.stringify({ error: 'No text provided' }) };
    }

    try {
        const { default: fetch } = await import('node-fetch');

        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${GROQ_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'llama3-8b-8192',
                temperature: 0.2,
                max_tokens: 120,
                messages: [
                    {
                        role: 'system',
                        content: `You are a thought classifier. Given a voice note transcript, return ONLY a JSON object with these exact fields:
- type: one of "idea", "task", "thought", "urgent", "goal"
- keywords: 3-4 key topics separated by " · "
- confidence: integer between 80-99

Classification rules:
- "idea" = creative ideas, inventions, "what if", new concepts, product ideas
- "task" = things to do, reminders, action items, "need to", "don't forget", "finish", "call"
- "urgent" = time-sensitive, deadlines, "asap", critical, "by tomorrow", "overdue"
- "goal" = ambitions, targets, "I want to", "I will", outcomes, achievements
- "thought" = everything else — observations, random thoughts, reflections, musings

Return ONLY raw JSON. No markdown. No backticks. No explanation. Just the object.`
                    },
                    {
                        role: 'user',
                        content: `Classify this voice note: "${text}"`,
                    }
                ],
            }),
        });

        const data = await res.json();

        if (!res.ok) {
            console.error('Groq classify error:', data);
            return {
                statusCode: res.status,
                body: JSON.stringify({ error: data.error?.message || 'Classification failed' }),
            };
        }

        const raw = data.choices?.[0]?.message?.content?.trim() || '{}';

        let parsed;
        try {
            parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
        } catch {
            // If LLaMA returns garbage, give a safe default
            parsed = { type: 'thought', keywords: 'General', confidence: 85 };
        }

        // Validate type
        const validTypes = ['idea', 'task', 'thought', 'urgent', 'goal'];
        if (!validTypes.includes(parsed.type)) parsed.type = 'thought';

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify(parsed),
        };

    } catch (err) {
        console.error('Function error:', err);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: err.message }),
        };
    }
};
