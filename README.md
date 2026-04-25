# GabayX System 🛰️
**Campus Emergency Response & Monitoring Platform**

GabayX is a real-time location and emergency response web application designed for campus and community safety. It acts as a two-part system: an **Admin Dashboard** for school administrators and a **Student App** for the students. 

The system uses live tracking, automatic walking routes, and an "Offline Mode" to ensure students can always find safe zones or ask for help, even if the internet disconnects.

## 🌐 Live Access

You can access the fully functional live system here:
**👉 [https://gabayx-system.onrender.com/](https://gabayx-system.onrender.com/)**

---

## 📖 How to Use the System

### 🧑‍🎓 For Students (The Client App)
1. **Create an Account:** Go to the link and click "Sign up now". Enter your Email, Phone Number, Name, and Password.
2. **Log In:** Return to the login page and sign in with your Email and Password.
3. **Allow Permissions:** The browser will ask for your **Location (GPS)** and permission to send **Notifications**. You *must* allow both for the map and emergency sirens to work.
4. **Follow Emergency Routes:** If an admin triggers an alert, your screen will show a warning, an alarm will play, and the map will automatically draw a line showing you how to walk to the nearest safe zone.
5. **Send SOS or Mark Safe:** Use the buttons at the bottom of the screen to alert the admin if you are in danger, or to mark yourself as secure. You can also type custom messages.
6. **Use Offline Mode:** If the internet goes down, open the sidebar and turn on **Offline Mode**. This will save your location and SOS messages to your phone and automatically send them to the admin the second your internet comes back. 

### 🛡️ For Administrators (The Command App)
1. **Log In:** Go to the link and log in using the master admin credentials:
   * **Email/ID:** `admin`
   * **Password:** `knhs2026`
2. **Monitor the Live Map:** The dashboard shows a real-time map of all connected students. Green dots are safe students, and blinking red dots are students in danger.
3. **Send Campus Alerts:** Use the "Send Alerts" panel to trigger an Earthquake, Fire, or Flood alert. This instantly pushes a notification and a safe-zone route to every student's phone.
4. **Reply to SOS Messages:** When a student sends a distress note, it will pop up in the feed on the right. Click **"Reply"** to send a direct message back to that specific student's screen.
5. **Mark Supply Drops:** Click the "Mark Available Supply" button, then click anywhere on the map. This places an orange supply box on the map and notifies all students where to get emergency supplies.

---

## 🚀 Key Features

### Student App
* **Automatic Safe Zone Routing:** Calculates the fastest walking path to designated safe zones depending on the disaster (Earthquake, Fire, Flood).
* **Offline Data Saving:** If the network drops, the app saves GPS coordinates and SOS notes locally, sending them to the admin automatically when the connection returns.
* **SMS Backup:** If there is no internet at all, the app can grab your exact GPS coordinates and format a regular text message to be sent through your cellular network.
* **Supply Routes:** Guides the user directly to emergency supplies dropped by the admin on the map.

### Admin Dashboard
* **Live Map Tracking:** Tracks all active students on a map with near-zero delay using Socket.io.
* **Real Road Display:** The "Show Routes" feature scans and draws all real-world roads and walking paths directly onto the map.
* **Campus Broadcasts:** Instantly push disaster alerts or "All Clear" signals to all connected devices.
* **Two-Way Messaging:** Intercept distress notes from students and reply directly to their screens.

## 🛠️ Tech Stack

**Frontend:**
* HTML5, CSS3, Vanilla JavaScript
* [Leaflet.js](https://leafletjs.com/) (Mapping engine)
* Leaflet Routing Machine & OSRM (Dynamic pathfinding)
* Overpass API (Road network rendering)
* FontAwesome & Google Fonts (Outfit, Space Mono)

**Backend:**
* [Node.js](https://nodejs.org/) & [Express.js](https://expressjs.com/)
* [Socket.io](https://socket.io/) (WebSockets for real-time messaging)
* [Supabase](https://supabase.com/) (PostgreSQL Database & Authentication)
* Web-Push API (Background service worker notifications)

---

## 📂 File Structure

```text
GabayX-System/
│
├── public/               # Frontend public assets
│   ├── index.html        # The main Login interface
│   ├── register.html     # The Student Account Creation page
│   ├── student.html      # The Student App (Live map, SOS buttons, offline routing)
│   ├── admin.html        # The Admin Command Console (Radar, alerts, messaging)
│   └── sw.js             # The Service Worker (Handles offline mode & push notifications)
│
├── server.js             # The backend server (Express, Socket.io, Supabase connections)
├── package.json          # Node.js dependencies and start scripts
└── package-lock.json     # Dependency version lockfile