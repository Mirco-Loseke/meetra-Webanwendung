const https = require('https');

const apiKey = process.argv[2];
if (!apiKey) {
    console.error('API key required');
    process.exit(1);
}

const req = https.request({
    hostname: 'api.groq.com',
    path: '/openai/v1/models',
    method: 'GET',
    headers: {
        'Authorization': `Bearer ${apiKey}`
    }
}, (res) => {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
        try {
            const json = JSON.parse(data);
            console.log(JSON.stringify(json, null, 2));
        } catch (e) {
            console.error('Raw data:', data);
        }
    });
});

req.on('error', (e) => console.error(e));
req.end();
