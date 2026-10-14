const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { createClient } = require('@supabase/supabase-js');
const webpush = require('web-push'); 
const bodyParser = require('body-parser');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } });

// --- 1. CONFIGURATION (GABAYX DB & LOCAL STORE FALLBACK) ---
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://pvmgvuvhhdvqhwfrejaf.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB2bWd2dXZoaGR2cWh3ZnJlamFmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyOTcyMjcsImV4cCI6MjA5MTg3MzIyN30.1nrc9_XupIDXpU4qXHKcTET-5pbtXSErs_MD31Z0RAM';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Persistent Local Store for offline / disconnected DB testing
const STORE_FILE = path.join(__dirname, 'local_store.json');
let localStore = {
    students: [
        {
            email: 'student@gabayx.edu.ph',
            password: 'student123',
            name: 'Juan Dela Cruz',
            phone_number: '09123456789',
            last_seen: new Date().toLocaleString(),
            last_status: 'SAFE'
        },
        {
            email: 'maria@gabayx.edu.ph',
            password: 'student123',
            name: 'Maria Santos',
            phone_number: '09987654321',
            last_seen: new Date().toLocaleString(),
            last_status: 'SAFE'
        }
    ],
    donations: [],
    disaster_logs: [
        { type: 'SYSTEM TEST', created_at: new Date().toISOString() }
    ],
    disaster_history: [],
    sos_messages: []
};

// Initialize / load stored data
if (fs.existsSync(STORE_FILE)) {
    try {
        const raw = fs.readFileSync(STORE_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        localStore = { ...localStore, ...parsed };
    } catch (e) {
        console.warn('⚠️ Could not load local_store.json, using defaults:', e.message);
    }
}

function saveLocalStore() {
    try {
        fs.writeFileSync(STORE_FILE, JSON.stringify(localStore, null, 2), 'utf-8');
    } catch (e) {
        console.error('❌ Failed to save local store:', e.message);
    }
}

// --- 2. NOTIFICATIONS ---
const publicVapidKey = 'BO2TCO8NgiwHgW9vd2eDfMv3xu5n68NHwseA2YntRGQH_KlUWp-47npfemKC7gNjcTUD_m7tazM19Gh9yAO-UUg';
const privateVapidKey = 'XmYMsQ79u1ne_xu0PIKmk_d5FnqVHcleo6Q8vmeh2zE';

try {
    webpush.setVapidDetails(
        'mailto:admin@gabayx.edu.ph',
        publicVapidKey,
        privateVapidKey
    );
} catch (e) {
    console.warn("⚠️ VAPID details notice:", e.message);
}

// --- 3. MIDDLEWARE ---
app.set('trust proxy', 1);
app.use(express.urlencoded({ extended: true }));
app.use(express.json()); 
app.use(bodyParser.json());
app.use(session({
    secret: 'gabayx_secret_key_2026',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } 
}));
app.use(express.static(path.join(__dirname, 'public')));

// --- 4. ROUTES ---

// Home Page Logic
app.get('/', (req, res) => {
    if (req.session.role === 'admin') return res.redirect('/admin');
    if (req.session.role === 'student') return res.redirect('/student');
    res.sendFile(path.join(__dirname, 'public', 'index.html')); 
});

// PUSH NOTIFICATION: Get Public Key
app.get('/api/vapid-key', (req, res) => {
    res.json({ publicKey: publicVapidKey });
});

// PUSH NOTIFICATION: Subscribe User
app.post('/subscribe', (req, res) => {
    const subscription = req.body;
    if (!global.subscriptions) global.subscriptions = [];
    
    const exists = global.subscriptions.find(sub => sub.endpoint === subscription.endpoint);
    if (!exists) {
        global.subscriptions.push(subscription);
        console.log("✅ New Device Subscribed! Total:", global.subscriptions.length);
    }
    res.status(201).json({});
});

// LOGIN AUTHENTICATION
app.post('/auth/login', async (req, res) => {
    const username = req.body.username ? req.body.username.trim() : '';
    const password = req.body.password ? req.body.password.trim() : '';
    
    // A. ADMIN LOGIN
    if (username.toLowerCase() === 'admin' && password === 'knhs2026') {
        req.session.loggedin = true;
        req.session.role = 'admin';
        return res.redirect('/admin');
    }
    
    // B. STUDENT LOGIN
    let student = null;
    try {
        const { data, error } = await supabase
            .from('students')
            .select('*')
            .eq('email', username)
            .single(); 
        if (!error && data) {
            student = data;
        }
    } catch (dbErr) {
        // Fallback to local store
    }

    if (!student) {
        student = localStore.students.find(s => 
            s.email.toLowerCase() === username.toLowerCase() && 
            (!password || !s.password || s.password === password)
        );
    }

    if (student) {
        req.session.loggedin = true;
        req.session.role = 'student';
        req.session.username = student.name;
        req.session.studentEmail = student.email;
        req.session.phoneNumber = student.phone_number;
        
        return req.session.save(() => {
            res.redirect('/student');
        });
    } else {
        return res.redirect('/?error=invalid_credentials');
    }
});

// REGISTER NEW STUDENT
app.post('/auth/register', async (req, res) => {
    const newId = req.body.username ? req.body.username.trim() : '';
    const newPassword = req.body.password ? req.body.password.trim() : '';
    const newName = req.body.fullname ? req.body.fullname.trim() : 'New Student';
    const newPhone = req.body.phone_number ? req.body.phone_number.trim() : '';

    if (!newId || !newPassword || !newPhone) return res.redirect('/register.html?error=missing_fields');

    // Attempt Supabase insert
    let supabaseSuccess = false;
    try {
        const { error } = await supabase
            .from('students')
            .insert([{ 
                email: newId, 
                password: newPassword, 
                name: newName,
                phone_number: newPhone
            }]);
        if (!error) supabaseSuccess = true;
    } catch (e) {
        // Supabase offline/error
    }

    // Check duplicate in local store
    const existsLocally = localStore.students.some(s => s.email.toLowerCase() === newId.toLowerCase());
    if (existsLocally && !supabaseSuccess) {
        // Already exists locally
        return res.redirect('/register.html?error=user_already_exists');
    }

    if (!existsLocally) {
        localStore.students.push({
            email: newId,
            password: newPassword,
            name: newName,
            phone_number: newPhone,
            last_seen: new Date().toLocaleString(),
            last_status: 'SAFE'
        });
        saveLocalStore();
        console.log(`✅ [REGISTER] New student registered: ${newName} (${newId})`);
    }

    res.redirect('/?success=registered');
});

// --- GCASH DONATION ROUTE ---
app.post('/api/donate', async (req, res) => {
    const donorName = req.body.donor_name ? req.body.donor_name.trim() : 'Anonymous Hero';
    const amount = parseFloat(req.body.amount) || 0;
    const targetZone = req.body.target_zone || 'ALL ZONES';
    const targetLat = req.body.target_lat ? parseFloat(req.body.target_lat) : null;
    const targetLng = req.body.target_lng ? parseFloat(req.body.target_lng) : null;
    
    // Generate a secure 8-character voucher code (e.g. GX-8F2B9A)
    const voucherCode = 'GX-' + Math.random().toString(36).substring(2, 8).toUpperCase();

    try {
        await supabase.from('donations').insert([{
            donor_name: donorName,
            amount: amount,
            target_zone: targetZone,
            voucher_code: voucherCode
        }]);
    } catch (e) {
        // Supabase offline/error
    }

    localStore.donations.unshift({
        donor_name: donorName,
        amount: amount,
        target_zone: targetZone,
        target_lat: targetLat,
        target_lng: targetLng,
        voucher_code: voucherCode,
        created_at: new Date().toISOString()
    });
    saveLocalStore();

    console.log(`💰 DONATION SECURED: ₱${amount} to ${targetZone} (Voucher: ${voucherCode})`);
    // Broadcast the voucher to the students live
    io.emit('donation-dropped', {
        donor: donorName,
        amount: amount,
        zone: targetZone,
        target_lat: targetLat,
        target_lng: targetLng,
        voucher: voucherCode
    });

    res.redirect(`/donate.html?success=true&voucher=${voucherCode}`);
});

app.get('/api/me', (req, res) => {
    if (req.session.loggedin && req.session.role === 'student') {
        res.json({ 
            id: req.session.studentEmail, 
            name: req.session.username,
            phone_number: req.session.phoneNumber
        });
    } else {
        res.status(401).json({ error: "Not logged in" });
    }
});

// Deduplication sets for offline reports and sync events
const processedReportIds = new Set();
const processedSyncHashes = new Set();

// HEALTH CHECK ENDPOINT (Active connectivity verification for PWA)
app.get('/api/health', (req, res) => {
    res.status(200).json({ ok: true, status: 'operational', timestamp: new Date().toISOString() });
});

// ROSTER & DATA API ENDPOINTS (Supports Admin fallback when Supabase is offline)
app.get('/api/students', (req, res) => {
    const roster = localStore.students.map(s => ({
        email: s.email,
        name: s.name,
        phone_number: s.phone_number,
        last_seen: s.last_seen || new Date().toLocaleString(),
        last_status: s.last_status || 'SAFE'
    }));
    res.json(roster);
});

app.get('/api/disaster-history', (req, res) => {
    res.json(localStore.disaster_history);
});

app.get('/api/sos-messages', (req, res) => {
    res.json(localStore.sos_messages);
});

app.get('/api/hotspots', (req, res) => {
    res.json(Array.from(activeHotspotHosts.values()));
});

function getLocalIp() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return '127.0.0.1';
}

app.get('/api/server-info', (req, res) => {
    const hostHeader = req.get('host') || '';
    const isLocalHost = hostHeader.includes('localhost') || hostHeader.includes('127.0.0.1');
    const localIp = getLocalIp();
    const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';

    let appBaseUrl = '';
    if (isLocalHost) {
        // If developer opened localhost on PC, return LAN IP so external phones on Wi-Fi can connect
        appBaseUrl = `http://${localIp}:${PORT}`;
    } else {
        // Render cloud domain or direct IP
        appBaseUrl = `${proto}://${hostHeader}`;
    }

    res.json({
        ip: localIp,
        port: PORT,
        url: appBaseUrl,
        hotspot_url: `${appBaseUrl}/student.html`,
        is_cloud: !isLocalHost && !hostHeader.startsWith('192.168.') && !hostHeader.startsWith('10.') && !hostHeader.startsWith('172.')
    });
});

// EMERGENCY INCIDENT REPORT SUBMISSION (Offline-first & Online reports)
app.post('/api/reports/submit', async (req, res) => {
    const report = req.body;
    if (!report || !report.id) {
        return res.status(400).json({ error: "Missing report id" });
    }

    // Deduplication: prevent duplicate processing on retries
    if (processedReportIds.has(report.id)) {
        console.log(`[DEDUP] Report ${report.id} already processed. Acknowledging client.`);
        return res.status(200).json({ status: 'success', duplicate: true, id: report.id });
    }
    processedReportIds.add(report.id);
    if (processedReportIds.size > 2000) {
        const oldest = processedReportIds.values().next().value;
        processedReportIds.delete(oldest);
    }

    console.log(`[REPORT] Received emergency report ${report.id} (${report.incident_type}) from ${report.student_id}`);

    // Broadcast rich incident report to admin dashboard via Socket.io
    io.emit('admin-receive-report', report);

    // If location exists, update telemetry and pin on map
    if (report.lat && report.lng) {
        io.emit('admin-dashboard-update', {
            id: report.student_id,
            status: 'DANGER',
            lat: report.lat,
            lng: report.lng,
            incidentType: report.incident_type
        });
    }

    const formattedMsg = `[${report.incident_type}]: ${report.description || 'Emergency reported'} (${report.nearest_building || 'Campus'})`;
    const newSos = {
        id: Date.now(),
        student_id: report.student_id || 'anonymous',
        message: formattedMsg,
        is_critical: true,
        replied: false,
        created_at: report.timestamp || new Date().toISOString()
    };
    localStore.sos_messages.unshift(newSos);
    saveLocalStore();

    try {
        await supabase.from('sos_messages').insert([newSos]);
    } catch (dbErr) {
        // Supabase offline/error
    }

    res.status(200).json({ status: 'success', id: report.id, receivedAt: new Date().toISOString() });
});

app.post('/api/sync', async (req, res) => {
    const { id, logs } = req.body;
    
    if (!id || !logs || logs.length === 0) {
        return res.status(400).json({ status: 'no_data' });
    }

    console.log(`[SYNC] Receiving ${logs.length} offline logs from ${id}`);

    for (const log of logs) {
        const logHash = `${id}-${log.type}-${log.timestamp || ''}-${log.content}`;
        if (!processedSyncHashes.has(logHash)) {
            processedSyncHashes.add(logHash);
            if (processedSyncHashes.size > 3000) {
                const oldest = processedSyncHashes.values().next().value;
                processedSyncHashes.delete(oldest);
            }

            if (log.type === 'NOTE') {
                io.emit('admin-receive-note', { id: id, message: `[OFFLINE]: ${log.content}` });
            } else if (log.type === 'STATUS') {
                io.emit('admin-dashboard-update', { id: id, status: log.content, lat: log.lat, lng: log.lng });
            }
        }
    }

    io.emit('admin-sync-report', {
        id: id,
        logs: logs,
        lastSeen: new Date().toISOString(),
        count: logs.length
    });

    res.json({ status: 'success', count: logs.length });
});

// PROTECTED PAGES
app.get('/admin', (req, res) => {
    if (req.session.role === 'admin') res.sendFile(path.join(__dirname, 'public','admin.html'));
    else res.redirect('/');
});

app.get('/student', (req, res) => {
    if (req.session.loggedin && req.session.role === 'student') {
        res.sendFile(path.join(__dirname, 'public', 'student.html'));
    } else {
        console.log("Session Check Failed. Redirecting to login...");
        res.redirect('/');
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

// --- 5. SOCKET.IO & PUSH LOGIC ---
const activeSockets = new Map();
const activeHotspotPeers = new Map();
const activeHotspotHosts = new Map();

io.on('connection', async (socket) => {
    console.log(`[SOCKET] User connected: ${socket.id}`);

    let logs = [];
    try {
        const { data: dbLogs } = await supabase.from('disaster_logs').select('*').order('created_at', { ascending: false });
        if (dbLogs && dbLogs.length) logs = dbLogs;
    } catch (e) {}
    if (!logs.length) logs = localStore.disaster_logs;
    socket.emit('log-history', logs);

    socket.on('broadcast-alert', async (data) => {
        console.log("📢 GABAYX ALERT TRIGGERED:", data.type);
        
        let newLog = null;
        try {
            const { data: logRes, error } = await supabase.from('disaster_logs').insert([{ type: data.type }]).select().single();
            if (!error && logRes) newLog = logRes;
        } catch (e) {}

        if (!newLog) {
            newLog = { type: data.type, created_at: new Date().toISOString() };
            localStore.disaster_logs.unshift(newLog);
            saveLocalStore();
        }

        localStore.disaster_history.unshift({
            type: data.type,
            instructions: data.message,
            count_safe: 0,
            count_danger: 0,
            created_at: new Date().toISOString()
        });
        saveLocalStore();

        io.emit('update-logs', { type: newLog.type, time: new Date(newLog.created_at).toLocaleTimeString() });
        io.emit('receive-alert', data);

        const payload = JSON.stringify({ 
            title: `⚠️ ${data.type} ALERT!`, 
            body: data.message 
        });
        
        if (global.subscriptions) {
            console.log(`Sending Push to ${global.subscriptions.length} devices...`);
            global.subscriptions.forEach(sub => {
                webpush.sendNotification(sub, payload).catch(err => {
                    if (err.statusCode === 410) {
                        console.log("Subscription expired, removing...");
                    } else {
                        console.error("Push Error:", err);
                    }
                });
            });
        }
    });

    socket.on('register-student', (studentId) => {
        if(studentId) {
            socket.join(studentId);
            activeSockets.set(socket.id, studentId);
            console.log(`[ONLINE] Student ${studentId}`);
        }
    });

    socket.on('student-update', async (data) => {
        io.emit('admin-dashboard-update', data);
        
        // update local roster last seen
        const student = localStore.students.find(s => s.email === data.id);
        if (student) {
            student.last_seen = new Date().toLocaleString();
            student.last_status = data.status || 'SAFE';
            saveLocalStore();
        }

        try {
            await supabase.rpc('update_last_seen', { student_id_param: data.id });
        } catch (err) {
            // DB Update Error catch
        }
    });

    socket.on('student-note', (data) => { 
        socket.join(data.id); 
        io.emit('admin-receive-note', data); 
        const newSos = {
            id: Date.now(),
            student_id: data.id,
            message: data.message,
            is_critical: false,
            replied: false,
            created_at: new Date().toISOString()
        };
        localStore.sos_messages.unshift(newSos);
        saveLocalStore();
    });

    socket.on('student-status', (data) => { 
        if(data.id) socket.join(data.id); 
        io.emit('admin-dashboard-update', data); 
    });

    socket.on('admin-reply', (data) => { 
        io.to(data.targetId).emit('receive-reply', { message: data.message }); 
    });

    // --- HOTSPOT / LOCAL PEER-TO-PEER MESSAGING (Zero Internet LAN) ---
    if (!localStore.hotspot_messages) localStore.hotspot_messages = [];

    socket.on('hotspot-join', (peer) => {
        if (!peer) return;
        const peerId = peer.id || peer.email || peer.studentEmail || socket.id;
        socket.join('hotspot-room');
        socket.join(peerId);
        activeHotspotPeers.set(socket.id, {
            socketId: socket.id,
            id: peerId,
            name: peer.name || 'Resident',
            sector: peer.sector || 'Campus Zone',
            coords: peer.coords || null,
            isHost: !!peer.isHost,
            joinedAt: Date.now()
        });
        io.emit('hotspot-peers-updated', Array.from(activeHotspotPeers.values()));
        socket.emit('hotspot-history', localStore.hotspot_messages.slice(0, 50));
        console.log(`[HOTSPOT] Peer joined: ${peer.name} (${peerId})`);
    });

    socket.on('hotspot-get-peers', () => {
        socket.emit('hotspot-peers-updated', Array.from(activeHotspotPeers.values()));
    });

    // --- REAL HOTSPOT HOST REGISTRATION & DISCOVERY ---
    socket.on('hotspot-register-host', (hostData) => {
        if (!hostData) return;
        const hostId = hostData.host_id || hostData.id || socket.id;
        const hostRecord = {
            socketId: socket.id,
            ssid: hostData.ssid || `GABAYX-${(hostData.name || hostData.host_name || 'NODE').toUpperCase().replace(/[^A-Z0-9]/g, '')}-${socket.id.substring(0, 4)}`,
            name: hostData.name || `${hostData.host_name || 'Resident'}'s Hotspot`,
            host_name: hostData.host_name || hostData.name || 'Resident',
            host_id: hostId,
            role: hostData.role || 'Victim Relay',
            sector: hostData.sector || 'Campus Zone',
            coords: hostData.coords || null,
            created_at: Date.now()
        };
        activeHotspotHosts.set(socket.id, hostRecord);
        console.log(`[HOTSPOT] Real host registered: ${hostRecord.ssid} by ${hostRecord.host_name} (${hostRecord.role})`);
        io.emit('hotspots-list-updated', Array.from(activeHotspotHosts.values()));
    });

    socket.on('hotspot-get-hosts', () => {
        socket.emit('hotspots-list-updated', Array.from(activeHotspotHosts.values()));
    });

    socket.on('hotspot-stop-hosting', () => {
        if (activeHotspotHosts.has(socket.id)) {
            const h = activeHotspotHosts.get(socket.id);
            console.log(`[HOTSPOT] Host stopped: ${h.ssid}`);
            activeHotspotHosts.delete(socket.id);
            io.emit('hotspots-list-updated', Array.from(activeHotspotHosts.values()));
        }
    });

    socket.on('hotspot-get-history', () => {
        socket.emit('hotspot-history', localStore.hotspot_messages.slice(0, 50));
    });

    socket.on('hotspot-send-msg', (data) => {
        const channel = data.channel || 'broadcast';
        const msg = {
            id: 'HM-' + Date.now(),
            sender: data.sender || 'Anonymous Resident',
            sender_id: data.sender_id || 'unknown',
            channel: channel,
            recipient_id: data.recipient_id || null,
            recipient_name: data.recipient_name || null,
            text: data.text || '',
            sector: data.sector || 'Campus Zone',
            coords: data.coords || null,
            is_emergency: !!data.is_emergency,
            created_at: new Date().toISOString()
        };
        localStore.hotspot_messages.unshift(msg);
        if (localStore.hotspot_messages.length > 100) localStore.hotspot_messages.pop();
        saveLocalStore();

        if (channel === 'broadcast' || !msg.recipient_id) {
            io.emit('hotspot-receive-msg', msg);
        } else {
            // Direct message: emit to target peer and back to sender
            io.to(msg.recipient_id).emit('hotspot-receive-msg', msg);
            socket.emit('hotspot-receive-msg', msg);
        }

        // Also notify admin feed if it's an emergency
        if (msg.is_emergency) {
            io.emit('admin-receive-note', {
                id: msg.sender_id,
                message: `[HOTSPOT ${channel.toUpperCase()}]: ${msg.text} (${msg.sector})`,
                timestamp: msg.created_at
            });
        }
    });

    socket.on('hotspot-sync-sos', (records) => {
        if (Array.isArray(records)) {
            records.forEach(r => {
                localStore.sos_messages.unshift({
                    id: Date.now() + Math.floor(Math.random() * 1000),
                    student_id: r.student_id || r.id || 'Offline Student',
                    message: r.content || r.message,
                    coords: [r.lat, r.lng],
                    is_critical: true,
                    replied: false,
                    created_at: r.timestamp || new Date().toISOString()
                });
            });
            saveLocalStore();
            io.emit('admin-dashboard-update', { type: 'OFFLINE_SYNC_BATCH', count: records.length });
        }
    });

    socket.on('disconnect', () => {
        if (activeHotspotHosts.has(socket.id)) {
            const h = activeHotspotHosts.get(socket.id);
            console.log(`[HOTSPOT] Host disconnected: ${h.ssid}`);
            activeHotspotHosts.delete(socket.id);
            io.emit('hotspots-list-updated', Array.from(activeHotspotHosts.values()));
        }

        if (activeHotspotPeers.has(socket.id)) {
            const peer = activeHotspotPeers.get(socket.id);
            console.log(`[HOTSPOT] Peer left: ${peer.name}`);
            activeHotspotPeers.delete(socket.id);
            io.emit('hotspot-peers-updated', Array.from(activeHotspotPeers.values()));
        }

        if (activeSockets.has(socket.id)) {
            const studentId = activeSockets.get(socket.id);
            io.emit('student-disconnected', { id: studentId });
            console.log(`[OFFLINE] Student ${studentId}`);
            activeSockets.delete(socket.id);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`\n✅ GABAYX SERVER READY! Access here: http://localhost:${PORT}`);
});