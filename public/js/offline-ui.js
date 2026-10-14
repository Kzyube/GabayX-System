// GabayX Offline UI Components
// Includes Global Connectivity Indicator, Incident Report Modal, and Report Status Drawer.
(function (global) {
    'use strict';

    let currentPhotoBase64 = null;

    // --- 1. GLOBAL CONNECTIVITY INDICATOR ---
    function updateGlobalIndicator(stateData) {
        const connDot = document.getElementById('conn-dot');
        const connText = document.getElementById('conn-text');
        if (!connDot || !connText) return;

        const state = stateData.state;

        switch (state) {
            case 'ONLINE':
                connDot.style.color = 'var(--primary, #10b981)';
                connDot.style.backgroundColor = 'var(--primary, #10b981)';
                connDot.style.boxShadow = '0 0 10px #10b981';
                connText.innerText = 'ONLINE';
                connText.style.color = '#10b981';
                break;

            case 'OFFLINE':
                connDot.style.color = 'var(--accent-orange, #ff8c00)';
                connDot.style.backgroundColor = 'var(--accent-orange, #ff8c00)';
                connDot.style.boxShadow = '0 0 10px #ff8c00';
                connText.innerText = 'OFFLINE MODE';
                connText.style.color = '#ff8c00';
                break;

            case 'SYNCING':
                connDot.style.color = 'var(--accent-cyan, #00f0ff)';
                connDot.style.backgroundColor = 'var(--accent-cyan, #00f0ff)';
                connDot.style.boxShadow = '0 0 12px #00f0ff';
                connText.innerText = 'SYNCING...';
                connText.style.color = '#00f0ff';
                break;

            case 'SYNCED':
                connDot.style.color = '#38bdf8';
                connDot.style.backgroundColor = '#38bdf8';
                connDot.style.boxShadow = '0 0 10px #38bdf8';
                connText.innerText = 'ALL SYNCED';
                connText.style.color = '#38bdf8';
                break;

            default:
                connDot.style.color = '#94a3b8';
                connText.innerText = 'CONNECTING';
                break;
        }

        // Update badge count of pending reports if available
        if (global.GabayXDB) {
            global.GabayXDB.getPendingReports().then((pending) => {
                const countBadge = document.getElementById('pending-reports-badge');
                if (countBadge) {
                    if (pending.length > 0) {
                        countBadge.style.display = 'inline-flex';
                        countBadge.innerText = pending.length;
                    } else {
                        countBadge.style.display = 'none';
                    }
                }
            }).catch(() => {});
        }
    }

    // --- 2. MODAL & UI TEMPLATES INJECTION ---
    function injectOfflineUI() {
        if (document.getElementById('gabayx-offline-ui-container')) {
            return;
        }

        const container = document.createElement('div');
        container.id = 'gabayx-offline-ui-container';

        container.innerHTML = `
        <style>
            /* Offline UI Modal & Drawer Styles */
            .gx-modal-backdrop {
                position: fixed; inset: 0; background: rgba(0, 0, 0, 0.8);
                backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
                z-index: 25000; display: none; align-items: center; justify-content: center;
                padding: 16px;
            }
            .gx-modal-backdrop.active { display: flex; animation: gxFadeIn 0.25s ease-out; }

            .gx-modal-card {
                background: rgba(8, 22, 16, 0.95);
                border: 1px solid var(--glass-border, rgba(16, 185, 129, 0.3));
                border-radius: 24px; padding: 24px; width: 100%; max-width: 480px;
                box-shadow: 0 25px 60px rgba(0,0,0,0.8), 0 0 30px rgba(16, 185, 129, 0.1);
                max-height: 90vh; display: flex; flex-direction: column; overflow: hidden;
            }

            .gx-modal-header {
                display: flex; justify-content: space-between; align-items: center;
                padding-bottom: 14px; border-bottom: 1px solid rgba(255, 255, 255, 0.08);
                margin-bottom: 16px; flex-shrink: 0;
            }
            .gx-modal-title {
                font-size: 1.25rem; font-weight: 800; text-transform: uppercase;
                letter-spacing: 0.5px; margin: 0; display: flex; align-items: center; gap: 10px;
                color: #fff;
            }
            .gx-modal-close {
                background: transparent; border: none; color: var(--text-sub, #94a3b8);
                font-size: 24px; cursor: pointer; padding: 4px; line-height: 1; transition: 0.2s;
            }
            .gx-modal-close:hover { color: #fff; }

            .gx-modal-body {
                overflow-y: auto; flex: 1; padding-right: 4px;
            }

            .gx-form-label {
                font-size: 10px; font-weight: 800; text-transform: uppercase;
                letter-spacing: 1px; color: var(--text-sub, #94a3b8); margin-bottom: 6px; display: block;
            }

            .gx-type-selector {
                display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 16px;
            }
            .gx-type-btn {
                background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.08);
                color: var(--text-sub, #94a3b8); border-radius: 12px; padding: 10px 4px;
                font-size: 11px; font-weight: 700; cursor: pointer; display: flex;
                flex-direction: column; align-items: center; gap: 6px; transition: 0.2s;
            }
            .gx-type-btn i { font-size: 16px; }
            .gx-type-btn.selected {
                background: rgba(16, 185, 129, 0.15); border-color: var(--primary, #10b981);
                color: #fff; box-shadow: 0 0 15px rgba(16, 185, 129, 0.3);
            }

            .gx-input, .gx-textarea {
                width: 100%; background: rgba(0, 0, 0, 0.5);
                border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 12px;
                padding: 12px 14px; color: #fff; font-family: var(--font-ui, sans-serif);
                font-size: 13px; outline: none; margin-bottom: 14px; transition: 0.2s;
            }
            .gx-input:focus, .gx-textarea:focus {
                border-color: var(--primary, #10b981); box-shadow: 0 0 15px rgba(16, 185, 129, 0.2);
            }

            .gx-loc-card {
                background: rgba(16, 185, 129, 0.05); border: 1px solid var(--glass-border, rgba(16, 185, 129, 0.2));
                border-radius: 12px; padding: 10px 14px; margin-bottom: 14px;
                display: flex; align-items: center; justify-content: space-between;
                font-family: var(--font-data, monospace); font-size: 11px;
            }

            .gx-photo-preview {
                width: 100%; max-height: 160px; object-fit: cover; border-radius: 12px;
                margin-top: 8px; margin-bottom: 14px; border: 1px solid var(--glass-border);
                display: none;
            }

            .gx-btn-primary {
                width: 100%; padding: 14px; background: var(--primary, #10b981);
                color: #010a07; border: none; border-radius: 12px; font-weight: 800;
                font-size: 12px; text-transform: uppercase; letter-spacing: 1px;
                cursor: pointer; transition: 0.2s; display: flex; align-items: center; justify-content: center; gap: 8px;
            }
            .gx-btn-primary:active { transform: scale(0.98); }

            .gx-btn-secondary {
                width: 100%; padding: 12px; background: rgba(255, 255, 255, 0.05);
                color: #fff; border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 12px;
                font-weight: 700; font-size: 11px; text-transform: uppercase; cursor: pointer;
                transition: 0.2s; margin-top: 8px;
            }

            /* Report Item Cards */
            .gx-report-item {
                background: rgba(0, 0, 0, 0.4); border: 1px solid rgba(255, 255, 255, 0.08);
                border-radius: 14px; padding: 14px; margin-bottom: 12px; transition: 0.2s;
            }
            .gx-report-item:hover { border-color: rgba(255, 255, 255, 0.15); }

            .gx-status-pill {
                padding: 4px 8px; border-radius: 6px; font-size: 9px; font-weight: 800;
                letter-spacing: 0.5px; text-transform: uppercase; font-family: var(--font-data);
            }
            .gx-pill-draft { background: rgba(148, 163, 184, 0.1); color: #94a3b8; border: 1px solid #94a3b8; }
            .gx-pill-offline { background: rgba(245, 158, 11, 0.15); color: #f59e0b; border: 1px solid #f59e0b; }
            .gx-pill-waiting { background: rgba(56, 189, 248, 0.15); color: #38bdf8; border: 1px solid #38bdf8; }
            .gx-pill-syncing { background: rgba(0, 240, 255, 0.15); color: #00f0ff; border: 1px solid #00f0ff; }
            .gx-pill-submitted { background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid #10b981; }
            .gx-pill-failed { background: rgba(255, 42, 95, 0.15); color: #ff2a5f; border: 1px solid #ff2a5f; }

            @keyframes gxFadeIn { from { opacity: 0; transform: scale(0.98); } to { opacity: 1; transform: scale(1); } }
        </style>

        <!-- A. FILE INCIDENT REPORT MODAL -->
        <div id="gx-report-modal" class="gx-modal-backdrop">
            <div class="gx-modal-card">
                <div class="gx-modal-header">
                    <h3 class="gx-modal-title"><i class="fas fa-file-shield" style="color:var(--primary);"></i> File Incident Report</h3>
                    <button class="gx-modal-close" onclick="GabayXOfflineUI.closeReportModal()">&times;</button>
                </div>
                <div class="gx-modal-body">
                    <span class="gx-form-label">Incident Type</span>
                    <div class="gx-type-selector" id="gx-type-selector">
                        <button type="button" class="gx-type-btn selected" data-type="EARTHQUAKE" onclick="GabayXOfflineUI.selectType(this)">
                            <i class="fas fa-house-crack" style="color:#f59e0b;"></i> Earthquake
                        </button>
                        <button type="button" class="gx-type-btn" data-type="FIRE" onclick="GabayXOfflineUI.selectType(this)">
                            <i class="fas fa-fire" style="color:#ff2a5f;"></i> Fire
                        </button>
                        <button type="button" class="gx-type-btn" data-type="FLOOD" onclick="GabayXOfflineUI.selectType(this)">
                            <i class="fas fa-water" style="color:#38bdf8;"></i> Flood
                        </button>
                        <button type="button" class="gx-type-btn" data-type="MEDICAL" onclick="GabayXOfflineUI.selectType(this)">
                            <i class="fas fa-kit-medical" style="color:#10b981;"></i> Medical
                        </button>
                        <button type="button" class="gx-type-btn" data-type="TRAPPED" onclick="GabayXOfflineUI.selectType(this)">
                            <i class="fas fa-person-falling-burst" style="color:#ff8c00;"></i> Trapped
                        </button>
                        <button type="button" class="gx-type-btn" data-type="HAZARD" onclick="GabayXOfflineUI.selectType(this)">
                            <i class="fas fa-triangle-exclamation" style="color:#eab308;"></i> Hazard
                        </button>
                    </div>

                    <span class="gx-form-label">Current Location</span>
                    <div class="gx-loc-card">
                        <div>
                            <span id="gx-loc-coords" style="color:#fff;">Acquiring GPS...</span>
                            <div id="gx-loc-building" style="font-size:10px; color:var(--primary); margin-top:2px;">Scanning zone...</div>
                        </div>
                        <button type="button" onclick="GabayXOfflineUI.refreshLocation()" style="background:transparent; border:none; color:var(--text-sub); cursor:pointer;">
                            <i class="fas fa-rotate"></i>
                        </button>
                    </div>

                    <span class="gx-form-label">Incident Details / Needs</span>
                    <textarea id="gx-report-desc" class="gx-textarea" rows="3" placeholder="Describe the situation, exact room/floor, number of people needing assistance..."></textarea>

                    <span class="gx-form-label">Photo Attachment (Optional)</span>
                    <input type="file" id="gx-photo-input" accept="image/*" capture="environment" style="display:none;" onchange="GabayXOfflineUI.handlePhotoUpload(event)">
                    <button type="button" class="gx-btn-secondary" onclick="document.getElementById('gx-photo-input').click()" style="margin-top:0; margin-bottom:10px;">
                        <i class="fas fa-camera"></i> <span id="gx-photo-btn-text">Attach Incident Photo</span>
                    </button>
                    <img id="gx-photo-preview" class="gx-photo-preview" alt="Attachment preview">

                    <button type="button" id="gx-btn-submit-report" class="gx-btn-primary" onclick="GabayXOfflineUI.submitReport()">
                        <i class="fas fa-paper-plane"></i> Submit Emergency Report
                    </button>
                </div>
            </div>
        </div>

        <!-- B. REPORT HISTORY & STATUS DRAWER -->
        <div id="gx-history-modal" class="gx-modal-backdrop">
            <div class="gx-modal-card">
                <div class="gx-modal-header">
                    <h3 class="gx-modal-title"><i class="fas fa-clock-rotate-left" style="color:var(--primary);"></i> My Emergency Reports</h3>
                    <button class="gx-modal-close" onclick="GabayXOfflineUI.closeHistoryModal()">&times;</button>
                </div>
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                    <span style="font-size:11px; color:var(--text-sub);">Saved on this device</span>
                    <button type="button" onclick="GabayXSync.triggerSync(true)" style="background:rgba(16,185,129,0.1); border:1px solid var(--glass-border); color:var(--primary); padding:6px 12px; border-radius:8px; font-size:10px; font-weight:800; cursor:pointer; text-transform:uppercase;">
                        <i class="fas fa-sync"></i> Sync Now
                    </button>
                </div>
                <div class="gx-modal-body" id="gx-history-list">
                    <!-- Populated dynamically -->
                </div>
            </div>
        </div>

        <!-- C. OFFLINE CRITICAL INFO MODAL -->
        <div id="gx-info-modal" class="gx-modal-backdrop">
            <div class="gx-modal-card">
                <div class="gx-modal-header">
                    <h3 class="gx-modal-title"><i class="fas fa-book-medical" style="color:var(--primary);"></i> Offline Emergency Guides</h3>
                    <button class="gx-modal-close" onclick="GabayXOfflineUI.closeInfoModal()">&times;</button>
                </div>
                <div style="font-size:10px; font-family:var(--font-data); color:var(--primary); margin-bottom:12px; background:rgba(16,185,129,0.08); padding:6px 10px; border-radius:8px; border:1px dashed var(--glass-border);">
                    <i class="fas fa-download"></i> Cached Locally: Accessible with zero internet connection.
                </div>
                <div class="gx-modal-body" id="gx-info-content">
                    <!-- Populated dynamically -->
                </div>
            </div>
        </div>
        `;

        document.body.appendChild(container);
    }

    // Modal Controls
    function openReportModal() {
        injectOfflineUI();
        refreshLocation();
        document.getElementById('gx-report-modal').classList.add('active');
    }

    function closeReportModal() {
        const modal = document.getElementById('gx-report-modal');
        if (modal) modal.classList.remove('active');
        currentPhotoBase64 = null;
        const preview = document.getElementById('gx-photo-preview');
        if (preview) { preview.style.display = 'none'; preview.src = ''; }
        const btnText = document.getElementById('gx-photo-btn-text');
        if (btnText) btnText.innerText = 'Attach Incident Photo';
    }

    function openHistoryModal() {
        injectOfflineUI();
        loadHistoryData();
        document.getElementById('gx-history-modal').classList.add('active');
    }

    function closeHistoryModal() {
        const modal = document.getElementById('gx-history-modal');
        if (modal) modal.classList.remove('active');
    }

    function openInfoModal() {
        injectOfflineUI();
        loadCriticalInfo();
        document.getElementById('gx-info-modal').classList.add('active');
    }

    function closeInfoModal() {
        const modal = document.getElementById('gx-info-modal');
        if (modal) modal.classList.remove('active');
    }

    // Form selection
    function selectType(button) {
        document.querySelectorAll('#gx-type-selector .gx-type-btn').forEach((btn) => btn.classList.remove('selected'));
        button.classList.add('selected');
    }

    function getSelectedType() {
        const selected = document.querySelector('#gx-type-selector .gx-type-btn.selected');
        return selected ? selected.getAttribute('data-type') : 'GENERAL';
    }

    // Geolocation retrieval
    function refreshLocation() {
        const locCoords = document.getElementById('gx-loc-coords');
        const locBldg = document.getElementById('gx-loc-building');
        if (!locCoords) return;

        locCoords.innerText = '🛰️ Acquiring Hardware GPS...';

        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    const lat = pos.coords.latitude;
                    const lng = pos.coords.longitude;
                    const accuracy = pos.coords.accuracy || 10;
                    locCoords.innerText = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;

                    // Try to match nearest building from window.BUILDINGS if available
                    if (window.BUILDINGS && window.map) {
                        let nearest = null;
                        let minDist = Infinity;
                        const userLoc = L.latLng(lat, lng);
                        window.BUILDINGS.forEach((b) => {
                            const dist = window.map.distance(userLoc, b.coords);
                            if (dist < minDist) { minDist = dist; nearest = b; }
                        });
                        if (nearest && minDist < 60) {
                            locBldg.innerText = `Sector: ${nearest.name} (~${Math.round(minDist)}m)`;
                        } else {
                            locBldg.innerText = `Real-time GPS Locked (±${Math.round(accuracy)}m)`;
                        }
                    } else {
                        locBldg.innerText = `Real-time GPS Locked (±${Math.round(accuracy)}m)`;
                    }
                },
                (err) => {
                    let reason = 'GPS Unavailable';
                    if (err.code === 1) reason = 'GPS Permission Denied';
                    else if (err.code === 2) reason = 'GPS Hardware Signal Lost';
                    else if (err.code === 3) reason = 'GPS Timeout';
                    locCoords.innerText = reason;
                    locBldg.innerText = 'Allow location access in browser settings';
                },
                { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
            );
        } else {
            locCoords.innerText = 'GPS Not Supported';
            locBldg.innerText = 'Device lacks geolocation API';
        }
    }

    // Photo compression and handling
    function handlePhotoUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                // Compress image to max width 1024 to save storage
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                const maxDim = 1024;
                if (width > maxDim || height > maxDim) {
                    if (width > height) {
                        height = Math.round((height * maxDim) / width);
                        width = maxDim;
                    } else {
                        width = Math.round((width * maxDim) / height);
                        height = maxDim;
                    }
                }
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                currentPhotoBase64 = canvas.toDataURL('image/jpeg', 0.7);

                const preview = document.getElementById('gx-photo-preview');
                preview.src = currentPhotoBase64;
                preview.style.display = 'block';

                const btnText = document.getElementById('gx-photo-btn-text');
                btnText.innerText = 'Change Photo (Attached)';
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    // Report Submission Flow
    async function submitReport() {
        const descInput = document.getElementById('gx-report-desc');
        const description = (descInput.value || '').trim();
        const incidentType = getSelectedType();

        const locCoordsEl = document.getElementById('gx-loc-coords');
        const locBldgEl = document.getElementById('gx-loc-building');

        let lat = null;
        let lng = null;
        if (locCoordsEl && locCoordsEl.innerText.includes(',')) {
            const parts = locCoordsEl.innerText.split(',');
            lat = parseFloat(parts[0]);
            lng = parseFloat(parts[1]);
        }

        const nearestBuilding = locBldgEl ? locBldgEl.innerText : 'Campus Zone';

        const studentEmail = localStorage.getItem('knhs_student_email') || 'student@gabayx.local';
        const studentName = localStorage.getItem('knhs_student_name') || 'Student';

        const report = {
            id: 'REP-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7).toUpperCase(),
            incident_type: incidentType,
            description: description || `Reported ${incidentType} emergency in area`,
            lat: lat,
            lng: lng,
            nearest_building: nearestBuilding,
            attachment: currentPhotoBase64,
            timestamp: new Date().toISOString(),
            student_id: studentEmail,
            student_name: studentName,
            status: 'SAVED_OFFLINE',
            sync_attempts: 0
        };

        const submitBtn = document.getElementById('gx-btn-submit-report');
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving report...';

        try {
            // Save immediately to IndexedDB
            await global.GabayXDB.saveReport(report);

            // Check if online to perform instant submission
            const isOnline = await global.GabayXSync.checkBackendReachable();

            if (isOnline) {
                submitBtn.innerHTML = '<i class="fas fa-satellite-dish"></i> Uploading to command center...';
                try {
                    const response = await fetch('/api/reports/submit', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(report)
                    });

                    if (response.ok) {
                        await global.GabayXDB.updateReportStatus(report.id, 'SUBMITTED', {
                            synced_at: new Date().toISOString()
                        });
                        showToast('✅ Report Submitted & Confirmed');
                    } else {
                        await global.GabayXDB.updateReportStatus(report.id, 'WAITING_FOR_CONNECTION');
                        showToast('🟠 Saved Offline (Will Sync Automatically)');
                    }
                } catch (netErr) {
                    await global.GabayXDB.updateReportStatus(report.id, 'SAVED_OFFLINE');
                    showToast('🟠 Saved Offline (Will Sync Automatically)');
                }
            } else {
                await global.GabayXDB.updateReportStatus(report.id, 'SAVED_OFFLINE');
                showToast('🟠 Report Safely Saved Offline');
            }

            // Reset and close
            descInput.value = '';
            closeReportModal();

            // Refresh indicator
            updateGlobalIndicator({ state: global.GabayXSync.getState() });

        } catch (err) {
            console.error('[OfflineUI] Submission error:', err);
            alert('Could not save report: ' + err.message);
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit Emergency Report';
        }
    }

    // Populate Report History
    async function loadHistoryData() {
        const listContainer = document.getElementById('gx-history-list');
        if (!listContainer || !global.GabayXDB) return;

        listContainer.innerHTML = '<div style="text-align:center; color:var(--text-sub); padding:20px;"><i class="fas fa-spinner fa-spin"></i> Loading reports...</div>';

        const reports = await global.GabayXDB.getAllReports();

        if (reports.length === 0) {
            listContainer.innerHTML = '<div style="text-align:center; color:var(--text-sub); padding:30px; font-size:12px;">No emergency reports filed yet.</div>';
            return;
        }

        const getPill = (status) => {
            switch (status) {
                case 'DRAFT': return '<span class="gx-status-pill gx-pill-draft">Draft</span>';
                case 'SAVED_OFFLINE': return '<span class="gx-status-pill gx-pill-offline">Saved Offline (On Device)</span>';
                case 'WAITING_FOR_CONNECTION': return '<span class="gx-status-pill gx-pill-waiting">Waiting for Connection</span>';
                case 'SYNCING': return '<span class="gx-status-pill gx-pill-syncing">Syncing...</span>';
                case 'SUBMITTED': return '<span class="gx-status-pill gx-pill-submitted">Submitted & Confirmed</span>';
                case 'SYNC_FAILED': return '<span class="gx-status-pill gx-pill-failed">Sync Failed (Retrying)</span>';
                default: return `<span class="gx-status-pill gx-pill-offline">${status}</span>`;
            }
        };

        listContainer.innerHTML = reports.map((r) => {
            const timeStr = new Date(r.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' });
            return `
            <div class="gx-report-item">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
                    <div>
                        <strong style="color:#fff; font-size:13px; text-transform:uppercase;">${r.incident_type || 'INCIDENT'}</strong>
                        <div style="font-family:var(--font-data); font-size:9px; color:var(--text-sub); margin-top:2px;">${r.id} • ${timeStr}</div>
                    </div>
                    ${getPill(r.status)}
                </div>
                <div style="font-size:12px; color:#cbd5e1; line-height:1.4; margin-bottom:8px;">"${r.description}"</div>
                <div style="display:flex; justify-content:space-between; align-items:center; font-family:var(--font-data); font-size:10px; color:var(--text-sub); border-top:1px solid rgba(255,255,255,0.05); padding-top:6px;">
                    <span><i class="fas fa-location-dot" style="color:var(--primary);"></i> ${r.nearest_building || 'Campus'}</span>
                    ${r.attachment ? `<span style="color:var(--accent-cyan);"><i class="fas fa-camera"></i> Photo Included</span>` : ''}
                </div>
            </div>`;
        }).join('');
    }

    // Populate Critical Info
    async function loadCriticalInfo() {
        const contentContainer = document.getElementById('gx-info-content');
        if (!contentContainer || !global.GabayXDB) return;

        const guides = await global.GabayXDB.getEmergencyInfo();
        const contacts = await global.GabayXDB.getContacts();

        let html = '';

        // Contacts Section
        html += `<div style="font-size:11px; font-weight:800; color:var(--text-sub); text-transform:uppercase; margin-bottom:8px; letter-spacing:1px;">Campus & Emergency Hotlines</div>`;
        contacts.forEach((c) => {
            html += `
            <div style="background:rgba(0,0,0,0.5); padding:10px 14px; border-radius:12px; margin-bottom:6px; display:flex; justify-content:space-between; align-items:center; border:1px solid rgba(255,255,255,0.05);">
                <div>
                    <div style="font-weight:700; font-size:12px; color:#fff;">${c.name}</div>
                    <div style="font-size:10px; color:var(--text-sub);">${c.role}</div>
                </div>
                <a href="tel:${c.number.replace(/[^0-9]/g, '')}" style="background:rgba(16,185,129,0.15); border:1px solid var(--glass-border); color:var(--primary); padding:6px 12px; border-radius:8px; font-family:var(--font-data); font-size:11px; text-decoration:none; font-weight:700;">
                    <i class="fas fa-phone"></i> ${c.number}
                </a>
            </div>`;
        });

        // Guides Section
        html += `<div style="font-size:11px; font-weight:800; color:var(--text-sub); text-transform:uppercase; margin-top:16px; margin-bottom:8px; letter-spacing:1px;">Standard Survival Procedures</div>`;
        guides.forEach((g) => {
            html += `
            <div style="background:rgba(0,0,0,0.5); padding:12px; border-radius:12px; margin-bottom:8px; border:1px solid rgba(255,255,255,0.05);">
                <div style="font-weight:800; font-size:12px; color:var(--primary); text-transform:uppercase; margin-bottom:4px;">${g.title}</div>
                <div style="font-size:11px; color:#fff; font-weight:600; margin-bottom:6px;">${g.summary}</div>
                <ul style="padding-left:18px; margin:0; font-size:11px; color:#cbd5e1; line-height:1.5;">
                    ${g.steps.map((s) => `<li>${s}</li>`).join('')}
                </ul>
            </div>`;
        });

        contentContainer.innerHTML = html;
    }

    function showToast(text) {
        if (typeof window.showToast === 'function') {
            window.showToast(text);
        } else {
            const toast = document.getElementById('toast-notification');
            if (toast) {
                const msg = document.getElementById('toast-msg');
                if (msg) msg.innerText = text;
                toast.style.top = '20px';
                setTimeout(() => (toast.style.top = '-100px'), 3500);
            }
        }
    }

    // Auto-setup listeners
    document.addEventListener('DOMContentLoaded', () => {
        injectOfflineUI();
        if (global.GabayXSync) {
            global.GabayXSync.onStateChange(updateGlobalIndicator);
        }
    });

    // Export interface
    global.GabayXOfflineUI = {
        openReportModal,
        closeReportModal,
        openHistoryModal,
        closeHistoryModal,
        openInfoModal,
        closeInfoModal,
        selectType,
        refreshLocation,
        handlePhotoUpload,
        submitReport,
        updateGlobalIndicator
    };

})(typeof window !== 'undefined' ? window : this);
