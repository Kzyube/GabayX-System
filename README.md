# GabayX System 🛰️
**Campus Emergency Response & Monitoring Platform**

GabayX is a real-time location and emergency response web application designed for campus and community safety. It acts as a multi-part system: an **Admin Dashboard** for school administrators, a **Student App** for field operatives, and a **Relief Portal** for community donors. 

The system uses live tracking, automatic walking routes, an "Offline Mode" for connectivity gaps, and a transparent donation system to ensure that aid reaches victims instantly and securely.

## 🌐 Live Access

You can access the fully functional live system here:
**👉 [https://gabayx-system.onrender.com/](https://gabayx-system.onrender.com/)**

---

## 📖 How to Use the System

### 🧑‍🎓 For Students (The Client App)
1. **Access the App:** Open GabayX on phone or browser directly.
2. **Allow Permissions:** You *must* allow **Location (GPS)** for the map tracking and nearby places to function.
3. **Follow Emergency Routes:** During an alert, an alarm plays and the map automatically draws a path to the nearest safe zone.
4. **Offline Resilience:** Actions and emergency telemetry are saved locally and synchronized automatically once reconnected.

### 🛡️ For Administrators (The Command App)
1. **Log In:** Use the credentials: **Email:** `admin` | **Password:** `knhs2026`.
2. **Monitor Live Map:** Track all connected students in real-time. Green dots are safe; blinking red dots indicate an SOS.
3. **Broadcast Alerts:** Push Earthquake, Fire, or Flood alerts instantly to all devices to trigger evacuation protocols.
4. **Interactive Supply Drops:** Click "Mark Available Supply" and tap the map to drop relief crates, which automatically routes students to that location.

---

## 🚀 Key Features

### Student App
* **Automatic Safe Zone Routing:** Calculates the fastest walking path based on the specific disaster type.
* **Offline Maps & Routes:** Download pre-calculated official evacuation route geometries (OSRM foot router) and campus basemap tile packages directly into IndexedDB and Service Worker CacheStorage for 100% offline navigation.
* **Offline Data Saving:** Caches GPS coordinates and SOS notes locally if the internet drops, syncing them once reconnected.
* **SMS Backup:** Formats a distress text message with exact coordinates for use when mobile data is unavailable.

### Admin Dashboard
* **Live Telemetry:** Zero-latency tracking of all active "nodes" using Socket.io.
* **Road Network Rendering:** Uses the Overpass API to scan and draw real-world walking paths directly onto the map.
* **Two-Way Command Messaging:** Intercept SOS notes and reply with direct instructions to the student's screen.

## 🛠️ Tech Stack

**Frontend:**
* HTML5, CSS3, Vanilla JavaScript
* [Leaflet.js](https://leafletjs.com/) (Mapping engine)
* OSRM API (Dynamic pathfinding)
* Nominatim API (Real-time geographic search)

**Backend:**
* [Node.js](https://nodejs.org/) & [Express.js](https://expressjs.com/)
* [Socket.io](https://socket.io/) (Real-time bidirectional communication)
* [Supabase](https://supabase.com/) (PostgreSQL Database & Secure Ledger)
* Web-Push API (Background emergency notifications)

---

## 📂 File Structure

```text
GabayX-System/
│
├── public/               # Frontend public assets
│   ├── index.html        # Main Login interface
│   ├── register.html     # Student Account Creation
│   ├── student.html      # Student App & Voucher Management
│   ├── admin.html        # Admin Command Console
│   ├── donate.html       # Public Donation Relief Portal
│   ├── GabayXLOGO.jpg    # System Branding Asset
│   └── sw.js             # Service Worker for Push Alerts
│
├── server.js             # Backend logic (Express, Socket.io, Donation Routes)
├── package.json          # Node.js dependencies
└── package-lock.json     # Dependency lockfile