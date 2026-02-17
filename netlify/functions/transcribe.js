// netlify/functions/transcribe.js
// Fixed - handles browser audio (webm/ogg) correctly

exports.handler = async function(event) {
    // Handle CORS preflight
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, X-Audio-Type',
            },
            body: '',
        };
    }

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const GROQ_KEY = process.env.GROQ_KEY;
    if (!GROQ_KEY) {
        return {
            statusCode: 500,
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ error: 'GROQ_KEY not configured in environment variables' }),
        };
    }

    try {
        const { default: fetch } = await import('node-fetch');
        const { default: FormData } = await import('form-data');

        // Audio comes as base64 encoded binary
        const audioBuffer = Buffer.from(event.body, 'base64');
        console.log('Received audio buffer:', audioBuffer.length, 'bytes');

        // Get the audio type from custom header or content-type
        const audioType = event.headers['x-audio-type']
            || event.headers['content-type']
            || 'audio/webm';

        // Map to supported Groq format
        // Groq Whisper supports: flac, mp3, mp4, mpeg, mpga, m4a, ogg, wav, webm
        let filename = 'audio.webm';
        let mimeType = 'audio/webm';

        if (audioType.includes('ogg')) {
            filename = 'audio.ogg';
            mimeType = 'audio/ogg';
        } else if (audioType.includes('wav')) {
            filename = 'audio.wav';
            mimeType = 'audio/wav';
        } else if (audioType.includes('mp4') || audioType.includes('m4a')) {
            filename = 'audio.mp4';
            mimeType = 'audio/mp4';
        } else if (audioType.includes('mpeg') || audioType.includes('mp3')) {
            filename = 'audio.mp3';
            mimeType = 'audio/mpeg';
        }
        // default stays as webm which Groq supports well

        console.log('Sending as:', filename, mimeType);

        const form = new FormData();
        form.append('file', audioBuffer, {
            filename,
            contentType: mimeType,
            knownLength: audioBuffer.length,
        });
        form.append('model', 'whisper-large-v3');
        form.append('response_format', 'json');
        form.append('language', 'en');

        const groqRes = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${GROQ_KEY}`,
                ...form.getHeaders(),
            },
            body: form,
        });

        const raw = await groqRes.text();
        console.log('Groq status:', groqRes.status, '| Response:', raw.substring(0, 200));

        if (!groqRes.ok) {
            return {
                statusCode: groqRes.status,
                headers: { 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({ error: raw }),
            };
        }

        const data = JSON.parse(raw);
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            },
            body: JSON.stringify({ text: data.text?.trim() || '' }),
        };

    } catch (err) {
        console.error('transcribe error:', err.message);
        return {
            statusCode: 500,
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ error: err.message }),
        };
    }
};
