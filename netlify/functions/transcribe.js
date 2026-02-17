// netlify/functions/transcribe.js
// This runs on Netlify's servers — the GROQ_KEY never reaches the browser

const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));
const FormData = (...args) => import('form-data').then(({default: F}) => new F(...args));

exports.handler = async function(event) {
    // Only allow POST
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const GROQ_KEY = process.env.GROQ_KEY;
    if (!GROQ_KEY) {
        return { statusCode: 500, body: JSON.stringify({ error: 'GROQ_KEY not configured in Netlify environment variables' }) };
    }

    try {
        // Parse the multipart form data from the browser
        // The audio blob comes in as base64 in the body
        const contentType = event.headers['content-type'] || '';

        let audioBuffer;
        let audioType = 'audio/webm';

        if (event.isBase64Encoded) {
            audioBuffer = Buffer.from(event.body, 'base64');
        } else {
            audioBuffer = Buffer.from(event.body);
        }

        // Build FormData to send to Groq
        const { default: FD } = await import('form-data');
        const form = new FD();
        form.append('file', audioBuffer, {
            filename: 'recording.webm',
            contentType: audioType,
        });
        form.append('model', 'whisper-large-v3');
        form.append('language', 'en');
        form.append('response_format', 'json');

        const { default: fetch } = await import('node-fetch');
        const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${GROQ_KEY}`,
                ...form.getHeaders(),
            },
            body: form,
        });

        const data = await res.json();

        if (!res.ok) {
            console.error('Groq transcription error:', data);
            return {
                statusCode: res.status,
                body: JSON.stringify({ error: data.error?.message || 'Transcription failed' }),
            };
        }

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ text: data.text }),
        };

    } catch (err) {
        console.error('Function error:', err);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: err.message }),
        };
    }
};
