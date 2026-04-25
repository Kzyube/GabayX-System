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
app.use(express.static(path.join(__dirname, 'www')));
app.use(express.static(path.join(__dirname, 'public')));

// --- 4. ROUTES ---

// Home Page Logic
app.get('/', (req, res) => {
    if (req.session.role === 'admin') return res.redirect('/admin');
    if (req.session.role === 'student') return res.redirect('/student');
    res.sendFile(path.join(__dirname, 'public', 'login.html')); 
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
            res.redirect('/student');
        });
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

app.post('/api/sync', async (req, res) => {
    const { id, logs } = req.body;
    
    if (!id || !logs || logs.length === 0) {
        return res.status(400).json({ status: 'no_data' });
    }

    console.log(`[SYNC] Receiving ${logs.length} offline logs from ${id}`);

    for (const log of logs) {
        if (log.type === 'NOTE') {
            io.emit('admin-receive-note', { id: id, message: `[OFFLINE]: ${log.content}` });
        } else if (log.type === 'STATUS') {
            io.emit('admin-dashboard-update', { id: id, status: log.content, lat: log.lat, lng: log.lng });
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