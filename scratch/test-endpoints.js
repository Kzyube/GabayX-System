const https = require('https');

const endpoints = [
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass-api.de/api/interpreter',
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter'
];

const query = `[out:json][timeout:8];(node["amenity"](around:1500,7.1002,124.824););out tags 10;`;

async function testEndpoint(url) {
    return new Promise((resolve) => {
        const start = Date.now();
        const fullUrl = url + '?data=' + encodeURIComponent(query);
        console.log(`Testing ${url}...`);
        const req = https.get(fullUrl, { headers: { 'User-Agent': 'GabayX-NearbyPlaces/1.0' }, timeout: 8000 }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                const duration = Date.now() - start;
                try {
                    const json = JSON.parse(data);
                    console.log(`[SUCCESS] ${url} took ${duration}ms, returned ${json.elements?.length} items`);
                    resolve(true);
                } catch(e) {
                    console.log(`[PARSE ERR] ${url} took ${duration}ms (status ${res.statusCode}): ${e.message}`);
                    resolve(false);
                }
            });
        });
        req.on('timeout', () => {
            console.log(`[TIMEOUT] ${url} after ${Date.now() - start}ms`);
            req.destroy();
            resolve(false);
        });
        req.on('error', (err) => {
            console.log(`[ERROR] ${url}: ${err.message}`);
            resolve(false);
        });
    });
}

(async () => {
    for (const ep of endpoints) {
        await testEndpoint(ep);
    }
})();
