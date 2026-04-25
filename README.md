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
1. **Create an Account:** Click "Sign up now" on the login page. Enter your Email, Phone Number, Name, and Password.
2. **Log In:** Sign in with your Email and Password.
3. **Allow Permissions:** You *must* allow **Location (GPS)** and **Notifications** for the map tracking and sirens to function.
4. **Follow Emergency Routes:** During an alert, an alarm plays and the map automatically draws a path to the nearest safe zone.
5. **Manage Vouchers:** If a donor sends funds to your area, a notification will appear. Open the sidebar and click **"Show GCash Vouchers"** to view your unique claim codes.
6. **Donate to Others:** Access the **"Donate to Relief"** button in your sidebar to help other students in need.

### 🛡️ For Administrators (The Command App)
1. **Log In:** Use the credentials: **Email:** `admin` | **Password:** `knhs2026`.
2. **Monitor Live Map:** Track all connected students in real-time. Green dots are safe; blinking red dots indicate an SOS.
3. **Broadcast Alerts:** Push Earthquake, Fire, or Flood alerts instantly to all devices to trigger evacuation protocols.
4. **Interactive Supply Drops:** Click "Mark Available Supply" and tap the map to drop relief crates, which automatically routes students to that location.

### 🧡 For Donors (The Relief Portal)
1. **Access the Portal:** Click the **"Donate to Relief"** button in the student app sidebar or navigate directly to `/donate.html`.
2. **Search Location:** Use the real-time search bar to find a specific city or campus sector (e.g., "Kabacan" or "Mendoza Court").
3. **Deploy Funds:** Enter the amount and donor name to initiate the grant.
4. **Verified Instant Aid:** Once submitted, a secure voucher is generated and broadcasted *only* to students physically located in that specific target area.

---

## 🚀 Key Features

### 🎁 Transparent Donation System
* **Real-Time Geographic Targeting:** Donors can search for real-world locations using a live API to target specific disaster zones.
* **Blockchain-Inspired Security:** Every donation is logged in a secure ledger, ensuring the system is anti-corrupt, anti-fraud, and fully transparent.
* **Instant Voucher Disbursement:** Funds bypass middlemen and are converted into unique GCash claim codes beamed directly to victims' phones.
* **Proximity-Based Filtering:** The system uses GPS logic to ensure vouchers only appear for users actually located within the donor's targeted radius.

### Student App
* **Automatic Safe Zone Routing:** Calculates the fastest walking path based on the specific disaster type.
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