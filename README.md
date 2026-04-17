# GabayX System 🛰️
**Strategic Emergency Response & Monitoring Platform**

GabayX is a real-time geolocation and emergency response web application designed for campus and community safety. It acts as a two-part system: a tactical **Command Console** for administrators and a **Field Node App** for students/operatives. 

The system relies on real-time telemetry, dynamic foot-routing, and an "Offline-First" matrix to ensure operatives can always find safe zones or transmit SOS signals, even when standard network connections fail.

## 🚀 Key Features

### Field Node (Student App)
* **Dynamic Safe Zone Routing:** Integrates Leaflet and OSRM to calculate the fastest walking paths to designated safe zones based on the specific disaster type (Earthquake, Fire, Flood).
* **The Offline Matrix:** If the network drops, the app caches GPS coordinates, status changes, and SOS notes locally. Once the connection returns, it automatically batch-syncs the data to the command center.
* **Analog SMS Fallback:** In deep offline scenarios, the system grabs the user's last known GPS coordinates and formats a distress text message to be sent via the cellular network.
* **Supply Drop Routing:** Receives manual coordinate pings from the Admin and guides the user directly to emergency supplies.
* **Tactical Toolbelt:** Built-in screen wake-lock flashlight and quick-dispatch SOS buttons.

### Command Console (Admin HUD)
* **Live Telemetry Dashboard:** Tracks all active student nodes on a dark-mode radar map with near-zero latency using Socket.io.
* **Overpass API Integration:** The "Show Routes" feature actively scans and draws all real-world roads and footpaths within the map view.
* **Broadcast Protocols:** Instantly push site-wide disaster alerts (Earthquake, Fire, Flood) or "All Clear" signals to all connected devices.
* **Two-Way Command Intel:** Intercept distress notes from students and reply directly to their screens with a "Command Intel" popup.
* **Interactive Supply Drops:** Click anywhere on the map to drop a supply crate, instantly alerting all operatives and providing them with a route to the drop.

## 🛠️ Tech Stack

**Frontend:**
* HTML5, CSS3, Vanilla JavaScript
* [Leaflet.js](https://leafletjs.com/) (Mapping engine)
* Leaflet Routing Machine & OSRM (Dynamic pathfinding)
* Overpass API (Road network rendering)
* FontAwesome & Google Fonts (Outfit, Space Mono)

**Backend:**
* [Node.js](https://nodejs.org/) & [Express.js](https://expressjs.com/)
* [Socket.io](https://socket.io/) (WebSockets for real-time bidirectional comms)
* [Supabase](https://supabase.com/) (PostgreSQL Database & Auth)
* Web-Push API (Background service worker notifications)

## 📦 Local Setup & Installation

1. **Clone the repository:**
   ```bash
   git clone [https://github.com/YourUsername/GabayX-System.git](https://github.com/YourUsername/GabayX-System.git)
   cd GabayX-System