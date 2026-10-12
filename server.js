const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const session = require('express-session');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const webpush = require('web-push'); 
const bodyParser = require('body-parser');
const admin = require('firebase-admin'); 

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } });

// --- 1. CONFIGURATION (GABAYX DB) ---
const SUPABASE_URL = 'https://pvmgvuvhhdvqhwfrejaf.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB2bWd2dXZoaGR2cWh3ZnJlamFmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyOTcyMjcsImV4cCI6MjA5MTg3MzIyN30.1nrc9_XupIDXpU4qXHKcTET-5pbtXSErs_MD31Z0RAM';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// --- 2. NOTIFICATIONS ---
const publicVapidKey = 'BO2TCO8NgiwHgW9vd2eDfMv3xu5n68NHwseA2YntRGQH_KlUWp-47npfemKC7gNjcTUD_m7tazM19Gh9yAO-UUg';
const privateVapidKey = 'XmYMsQ79u1ne_xu0PIKmk_d5FnqVHcleo6Q8vmeh2zE';

webpush.setVapidDetails(
  'mailto:admin@gabayx.edu.ph',
  publicVapidKey,
  privateVapidKey
);

// --- 3. MIDDLEWARE ---
app.use(express.urlencoded({ extended: true }));
app.use(express.json()); 
app.use(bodyParser.json());
app.use(session({
    secret: 'gabayx_secret_key_2026',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } 
}));
// ADMINISTRATIVE ACCESS PROTECTION (Checked before static files)
app.get(['/admin', '/admin.html'], (req, res) => {
    if (req.session && req.session.loggedin && req.session.role === 'admin') {
        res.sendFile(path.join(__dirname, 'public', 'admin.html'));
    } else {
        res.redirect('/admin-login');
    }
});

app.get('/admin-login', (req, res) => {
    if (req.session && req.session.loggedin && req.session.role === 'admin') {
        return res.redirect('/admin');
    }
    res.sendFile(path.join(__dirname, 'public', 'admin-login.html'));
});

// MAIN PUBLIC APPLICATION (DIRECT ACCESS WITHOUT LOGIN)
app.get(['/', '/student', '/student.html'], (req, res) => {
    if (req.session && req.session.role === 'admin') {
        return res.redirect('/admin');
    }
    res.sendFile(path.join(__dirname, 'public', 'student.html'));
});

// LEGACY ENTRY POINT REDIRECTS
app.get('/index.html', (req, res) => {
    res.redirect('/');
});

app.use(express.static(path.join(__dirname, 'public')));

// --- 4. ROUTES ---

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
    const { data: student } = await supabase
        .from('students')
        .select('*')
        .eq('email', username)
        .single(); 

    if (student) {
        req.session.loggedin = true;
        req.session.role = 'student';
        req.session.username = student.name;
        req.session.studentEmail = student.email;
        req.session.phoneNumber = student.phone_number;
        
        return req.session.save(() => {
            res.redirect('/');
        });
    } else {
        return res.redirect('/admin-login?error=invalid_credentials');
    }
});

// REGISTER NEW STUDENT
app.post('/auth/register', async (req, res) => {
    const newId = req.body.username ? req.body.username.trim() : '';
    const newPassword = req.body.password ? req.body.password.trim() : '';
    const newName = req.body.fullname ? req.body.fullname.trim() : 'New Student';
    const newPhone = req.body.phone_number ? req.body.phone_number.trim() : '';

    if (!newId || !newPassword || !newPhone) return res.redirect('/register.html?error=missing_fields');

    const { error } = await supabase
        .from('students')
        .insert([{ 
            email: newId, 
            password: newPassword, 
            name: newName,
            phone_number: newPhone
        }]);

    if (error) {
        console.error("Supabase Error:", error);
        return res.redirect('/register.html?error=user_already_exists');
    }

    res.redirect('/?success=registered');
});

// --- NEW GCASH DONATION ROUTE ---
app.post('/api/donate', async (req, res) => {
    const donorName = req.body.donor_name ? req.body.donor_name.trim() : 'Anonymous Hero';
    const amount = parseFloat(req.body.amount);
    const targetZone = req.body.target_zone;
    
    // Generate a secure 8-character voucher code (e.g. GX-8F2B9A)
    const voucherCode = 'GX-' + Math.random().toString(36).substring(2, 8).toUpperCase();

    const { error } = await supabase.from('donations').insert([{
        donor_name: donorName,
        amount: amount,
        target_zone: targetZone,
        voucher_code: voucherCode
    }]);

    if (!error) {
        console.log(`💰 DONATION SECURED: ₱${amount} to ${targetZone}`);
        // Broadcast the voucher to the students live
        io.emit('donation-dropped', {
            donor: donorName,
            amount: amount,
            zone: targetZone,
            voucher: voucherCode
        });
        res.redirect(`/donate.html?success=true&voucher=${voucherCode}`);
    } else {
        console.error("Donation DB Error:", error);
        res.redirect('/donate.html?error=true');
    }
});

app.get('/api/me', (req, res) => {
    if (req.session && req.session.loggedin && req.session.role === 'student') {
        res.json({ 
            authenticated: true,
            id: req.session.studentEmail, 
            name: req.session.username,
            phone_number: req.session.phoneNumber
        });
    } else if (req.session && req.session.loggedin && req.session.role === 'admin') {
        res.json({
            authenticated: true,
            role: 'admin',
            id: 'admin@gabayx.edu.ph',
            name: 'Command Center Admin'
        });
    } else {
        res.status(200).json({ 
            authenticated: false, 
            anonymous: true,
            message: 'Direct public access active. No account required.'
        });
    }
});

// Deduplication sets for offline reports and sync events
const processedReportIds = new Set();
const processedSyncHashes = new Set();

// HEALTH CHECK ENDPOINT (Active connectivity verification for PWA)
app.get('/api/health', (req, res) => {
    res.status(200).json({ ok: true, status: 'operational', timestamp: new Date().toISOString() });
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

    // Persist to Supabase sos_messages
    try {
        const formattedMsg = `[${report.incident_type}]: ${report.description || 'Emergency reported'} (${report.nearest_building || 'Campus'})`;
        await supabase.from('sos_messages').insert([{
            student_id: report.student_id || 'anonymous',
            message: formattedMsg,
            is_critical: true,
            replied: false,
            created_at: report.timestamp || new Date().toISOString()
        }]);
    } catch (dbErr) {
        console.error('[REPORT DB ERROR]:', dbErr);
    }

    res.status(200).json({ status: 'success', id: report.id, receivedAt: new Date().toISOString() });
});

// MESSAGE ADMINISTRATOR ENDPOINT (General inquiries - separate from emergency reports)
const processedMessageIds = new Set();
app.post('/api/messages/send', async (req, res) => {
    const { id, message, student_id, student_name, include_location, lat, lng, timestamp } = req.body;
    
    if (!message || !message.trim()) {
        return res.status(400).json({ error: "Message content cannot be empty" });
    }

    const msgId = id || `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    // Deduplication check
    if (processedMessageIds.has(msgId)) {
        console.log(`[DEDUP] Message ${msgId} already processed. Acknowledging client.`);
        return res.status(200).json({ status: 'success', duplicate: true, id: msgId });
    }
    processedMessageIds.add(msgId);
    if (processedMessageIds.size > 2000) {
        const oldest = processedMessageIds.values().next().value;
        processedMessageIds.delete(oldest);
    }

    const payload = {
        id: msgId,
        student_id: student_id || 'anonymous',
        student_name: student_name || 'Student / Citizen',
        message: message.trim(),
        include_location: !!include_location,
        lat: lat !== undefined ? lat : null,
        lng: lng !== undefined ? lng : null,
        timestamp: timestamp || new Date().toISOString(),
        type: 'INQUIRY'
    };

    console.log(`[MESSAGE] Administrator inquiry from ${payload.student_id}: "${payload.message.substring(0, 50)}..."`);

    // Broadcast distinct inquiry message to administrator command dashboard
    io.emit('admin-receive-message', payload);

    // Persist to Supabase sos_messages as non-critical general inquiry
    try {
        const locNote = payload.lat && payload.lng ? ` [Loc: ${payload.lat.toFixed(4)}, ${payload.lng.toFixed(4)}]` : '';
        await supabase.from('sos_messages').insert([{
            student_id: payload.student_id,
            message: `[INQUIRY]: ${payload.message}${locNote}`,
            is_critical: false,
            replied: false,
            created_at: payload.timestamp
        }]);
    } catch (dbErr) {
        console.error('[MESSAGE DB ERROR]:', dbErr);
    }

    res.status(200).json({ status: 'success', id: msgId, receivedAt: new Date().toISOString() });
});

// REPORT STATUS UPDATE & ACKNOWLEDGEMENT ENDPOINT
app.post('/api/reports/status', async (req, res) => {
    const { reportId, status } = req.body;
    if (!reportId || !status) {
        return res.status(400).json({ error: "Missing reportId or status" });
    }

    console.log(`[STATUS UPDATE] Report ${reportId} marked as ${status}`);

    const updateEvent = {
        reportId,
        status: status.toUpperCase(),
        updatedAt: new Date().toISOString()
    };

    io.emit('report-status-updated', updateEvent);
    res.status(200).json({ status: 'success', ...updateEvent });
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

app.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/');
    });
});

// --- 5. SOCKET.IO & PUSH LOGIC ---
const activeSockets = new Map();

io.on('connection', async (socket) => {
    
    console.log(`[SOCKET] User connected: ${socket.id}`);

    const { data: logs } = await supabase.from('disaster_logs').select('*').order('created_at', { ascending: false });
    socket.emit('log-history', logs || []);

    socket.on('broadcast-alert', async (data) => {
        console.log("📢 GABAYX ALERT TRIGGERED:", data.type);
        
        const { data: newLog, error } = await supabase.from('disaster_logs').insert([{ type: data.type }]).select().single();
        if (!error) {
            io.emit('update-logs', { type: newLog.type, time: new Date(newLog.created_at).toLocaleTimeString() });
        }

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
        
        try {
            await supabase.rpc('update_last_seen', { student_id_param: data.id });
        } catch (err) {
            console.error("DB Update Error:", err);
        }
    });

    socket.on('student-note', (data) => { 
        socket.join(data.id); 
        io.emit('admin-receive-note', data); 
    });

    socket.on('student-status', (data) => { 
        if(data.id) socket.join(data.id); 
        io.emit('admin-dashboard-update', data); 
    });

    socket.on('admin-reply', (data) => { 
        io.to(data.targetId).emit('receive-reply', { message: data.message }); 
    });

    socket.on('admin-acknowledge-report', (data) => {
        const reportId = data && data.reportId;
        const status = (data && data.status) || 'ACKNOWLEDGED';
        if (reportId) {
            console.log(`[SOCKET ACK] Report ${reportId} acknowledged (${status})`);
            io.emit('report-status-updated', {
                reportId: reportId,
                status: status,
                timestamp: new Date().toISOString()
            });
        }
    });

    socket.on('disconnect', () => {
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