const https = require('https');

const query = `[out:json][timeout:15];
(
  node["amenity"~"hospital|clinic|doctors|pharmacy|police|fire_station|school|college|university|townhall|community_centre"](around:2000,7.1002,124.824);
  way["amenity"~"hospital|clinic|doctors|pharmacy|police|fire_station|school|college|university|townhall|community_centre"](around:2000,7.1002,124.824);
  node["emergency"~"assembly_point|evacuation_centre"](around:2000,7.1002,124.824);
  way["emergency"~"assembly_point|evacuation_centre"](around:2000,7.1002,124.824);
  node["office"="government"](around:2000,7.1002,124.824);
  way["office"="government"](around:2000,7.1002,124.824);
  node["building"~"public|civic|hospital|school"](around:2000,7.1002,124.824);
  way["building"~"public|civic|hospital|school"](around:2000,7.1002,124.824);
);
out center tags 30;`;

const url = 'https://overpass-api.de/api/interpreter?data=' + encodeURIComponent(query);
console.log('Querying Overpass API...');

const req = https.get(url, { headers: { 'User-Agent': 'GabayX-DisasterResponse/1.0' } }, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        try {
            const json = JSON.parse(data);
            console.log('Elements returned:', json.elements.length);
            json.elements.forEach((e, idx) => {
                const name = e.tags?.name || 'Unnamed';
                const type = e.tags?.amenity || e.tags?.office || e.tags?.building || e.tags?.emergency || 'structure';
                const lat = e.lat || e.center?.lat;
                const lon = e.lon || e.center?.lon;
                console.log(`${idx + 1}. [${type}] ${name} @ (${lat}, ${lon})`);
            });
        } catch(e) {
            console.error('Parse error:', e.message, data.substring(0, 300));
        }
    });
});
req.on('error', err => console.error('Fetch error:', err.message));
