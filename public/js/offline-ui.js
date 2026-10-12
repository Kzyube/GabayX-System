/**
 * GabayX Offline UI Components
 * Coordinates Incident Report Modal, Emergency History Drawer, and Sync UI.
 */

(function (global) {
    'use strict';

    let currentPhotoBase64 = null;

    /**
     * Inject UI modals into the DOM
     */
    function injectOfflineUI() {
        if (document.getElementById('gabayx-offline-ui-container')) {
            return;
        }

        const container = document.createElement('div');
        container.id = 'gabayx-offline-ui-container';

        container.innerHTML = `
        <style>
            .gx-modal-backdrop {
                position: fixed; inset: 0; background: rgba(0, 0, 0, 0.75);
                backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
                z-index: 25000; display: none; align-items: center; justify-content: center;
                padding: 16px;
            }
            .gx-modal-backdrop.active { display: flex; animation: gxFadeIn 0.25s ease-out; }

            .gx-modal-card {
                background: var(--modal-bg, rgba(8, 22, 16, 0.96));
                border: 1px solid var(--glass-border, rgba(16, 185, 129, 0.3));
                border-radius: 12px; padding: 20px; width: 100%; max-width: 480px;
                box-shadow: var(--shadow-modal, 0 10px 25px rgba(0,0,0,0.4));
                max-height: 90vh; display: flex; flex-direction: column; overflow: hidden;
                color: var(--text-main, #fff);
            }

            .gx-modal-header {
                display: flex; justify-content: space-between; align-items: center;
                padding-bottom: 12px; border-bottom: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.08));
                margin-bottom: 14px; flex-shrink: 0;
            }
            .gx-modal-title {
                font-size: 1.15rem; font-weight: 800; text-transform: uppercase;
                letter-spacing: 0.5px; margin: 0; display: flex; align-items: center; gap: 8px;
                color: var(--text-main, #fff);
            }
            .gx-modal-close {
                background: transparent; border: none; color: var(--text-sub, #94a3b8);
                font-size: 20px; cursor: pointer; padding: 4px; line-height: 1; transition: 0.2s;
            }
            .gx-modal-close:hover { color: var(--primary, #10b981); }

            .gx-modal-body {
                overflow-y: auto; flex: 1; padding-right: 4px;
            }

            .gx-form-label {
                font-size: 10px; font-weight: 800; text-transform: uppercase;
                letter-spacing: 0.75px; color: var(--text-sub, #94a3b8); margin-bottom: 6px; display: block;
            }

            .gx-type-selector {
                display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 14px;
            }
            .gx-type-btn {
                background: var(--bg-input, rgba(255, 255, 255, 0.04));
                border: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.08));
                color: var(--text-sub, #94a3b8); border-radius: 8px; padding: 10px 4px;
                font-size: 11px; font-weight: 700; cursor: pointer; display: flex;
                flex-direction: column; align-items: center; gap: 6px; transition: 0.2s;
            }
            .gx-type-btn i { font-size: 16px; }
            .gx-type-btn.selected {
                background: var(--primary-light, rgba(16, 185, 129, 0.15));
                border-color: var(--primary, #10b981);
                color: var(--primary, #10b981);
            }

            .gx-input, .gx-textarea {
                width: 100%; background: var(--bg-input, rgba(0, 0, 0, 0.5));
                border: 1px solid var(--border-medium, rgba(255, 255, 255, 0.1)); border-radius: 8px;
                padding: 10px 12px; color: var(--text-main, #fff); font-family: var(--font-ui, sans-serif);
                font-size: 13px; outline: none; margin-bottom: 12px; transition: 0.2s; box-sizing: border-box;
            }
            .gx-input:focus, .gx-textarea:focus {
                border-color: var(--primary, #10b981);
            }

            .gx-loc-card {
                background: var(--primary-light, rgba(16, 185, 129, 0.05));
                border: 1px solid var(--glass-border, rgba(16, 185, 129, 0.2));
                border-radius: 8px; padding: 10px 12px; margin-bottom: 12px;
                display: flex; align-items: center; justify-content: space-between;
                font-family: var(--font-data, monospace); font-size: 11px;
                color: var(--text-main, #fff);
            }

            .gx-photo-preview {
                width: 100%; max-height: 160px; object-fit: cover; border-radius: 8px;
                margin-top: 6px; margin-bottom: 12px; border: 1px solid var(--glass-border);
                display: none;
            }

            .gx-btn-primary {
                width: 100%; padding: 12px; background: var(--primary, #10b981);
                color: #ffffff; border: none; border-radius: 8px; font-weight: 800;
                font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;
                cursor: pointer; transition: 0.2s; display: flex; align-items: center; justify-content: center; gap: 8px;
            }
            .gx-btn-primary:active { transform: scale(0.98); }

            .gx-btn-secondary {
                width: 100%; padding: 10px; background: var(--bg-card, rgba(255, 255, 255, 0.05));
                color: var(--text-main, #fff); border: 1px solid var(--border-medium, rgba(255, 255, 255, 0.1)); border-radius: 8px;
                font-weight: 700; font-size: 11px; text-transform: uppercase; cursor: pointer;
                transition: 0.2s; margin-top: 6px;
            }

            .gx-report-item {
                background: var(--bg-card, rgba(0, 0, 0, 0.45));
                border: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.08));
                border-radius: 10px; padding: 12px; margin-bottom: 10px; transition: 0.2s;
                color: var(--text-main, #fff);
            }
            .gx-report-item:hover { border-color: var(--primary, #10b981); }

            .gx-status-pill {
                padding: 4px 8px; border-radius: 6px; font-size: 9px; font-weight: 800;
                letter-spacing: 0.5px; text-transform: uppercase; font-family: var(--font-data, monospace);
            }
            .gx-pill-pending { background: rgba(245, 158, 11, 0.15); color: #d97706; border: 1px solid #d97706; }
            .gx-pill-syncing { background: rgba(0, 240, 255, 0.15); color: #0284c7; border: 1px solid #0284c7; }
            .gx-pill-synced  { background: rgba(16, 185, 129, 0.15); color: #059669; border: 1px solid #059669; }
            .gx-pill-failed  { background: rgba(255, 42, 95, 0.15); color: #dc2626; border: 1px solid #dc2626; }

            .gx-hotline-item {
                background: var(--bg-card, rgba(255, 255, 255, 0.04));
                border: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.08));
                border-radius: 10px; padding: 10px 12px; margin-bottom: 8px;
                display: flex; align-items: center; justify-content: space-between; gap: 10px;
                transition: 0.2s;
            }
            .gx-hotline-item:hover { border-color: var(--primary, #10b981); }
            .gx-hotline-icon {
                width: 32px; height: 32px; border-radius: 8px;
                display: flex; align-items: center; justify-content: center;
                background: var(--primary-light, rgba(16, 185, 129, 0.12));
                color: var(--primary, #10b981); flex-shrink: 0; font-size: 14px;
            }
            .gx-hotline-info { flex: 1; min-width: 0; }
            .gx-hotline-name { font-size: 11px; font-weight: 700; color: var(--text-main, #fff); line-height: 1.3; }
            .gx-hotline-role { font-size: 10px; color: var(--text-sub, #94a3b8); margin-top: 2px; }
            .gx-call-action-btn {
                background: var(--primary, #10b981); color: #ffffff !important; text-decoration: none;
                padding: 6px 10px; border-radius: 6px; font-size: 11px; font-weight: 700;
                display: inline-flex; align-items: center; gap: 5px; flex-shrink: 0;
                transition: 0.2s;
            }
            .gx-call-action-btn:hover { filter: brightness(1.1); transform: translateY(-1px); }
            .gx-guide-card {
                background: var(--bg-card, rgba(255, 255, 255, 0.03));
                border: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.08));
                border-radius: 8px; padding: 10px 12px; margin-bottom: 8px;
            }
            .gx-guide-title {
                font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px;
                color: var(--primary, #10b981); display: flex; align-items: center; gap: 6px; margin-bottom: 4px;
            }
            .gx-guide-text { font-size: 11px; color: var(--text-sub, #cbd5e1); line-height: 1.45; margin: 0; }

            @keyframes gxFadeIn { from { opacity: 0; transform: scale(0.98); } to { opacity: 1; transform: scale(1); } }
        </style>

        <!-- A. FILE EMERGENCY REPORT MODAL -->
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

                    <span class="gx-form-label">Location Telemetry</span>
                    <div class="gx-loc-card">
                        <div>
                            <span id="gx-loc-coords" style="color:var(--text-main, #fff);">Acquiring GPS...</span>
                            <div id="gx-loc-building" style="font-size:10px; color:var(--primary); margin-top:2px;">Scanning zone...</div>
                        </div>
                        <button type="button" onclick="GabayXOfflineUI.refreshLocation()" style="background:transparent; border:none; color:var(--text-sub); cursor:pointer;" title="Refresh GPS">
                            <i class="fas fa-rotate"></i>
                        </button>
                    </div>

                    <span class="gx-form-label">Emergency Description</span>
                    <textarea id="gx-report-desc" class="gx-textarea" rows="3" placeholder="Describe situation, room/floor, injured persons, or immediate hazards..."></textarea>

                    <span class="gx-form-label">Photo Attachment (Optional)</span>
                    <input type="file" id="gx-photo-input" accept="image/*" capture="environment" style="display:none;" onchange="GabayXOfflineUI.handlePhotoUpload(event)">
                    <button type="button" class="gx-btn-secondary" onclick="document.getElementById('gx-photo-input').click()" style="margin-top:0; margin-bottom:10px;">
                        <i class="fas fa-camera"></i> <span id="gx-photo-btn-text">Attach Incident Photo</span>
                    </button>
                    <img id="gx-photo-preview" class="gx-photo-preview" alt="Attachment preview">

                    <div class="gx-reporter-section" style="margin-top:12px; margin-bottom:12px; background:var(--bg-input, rgba(0,0,0,0.3)); border:1px solid var(--border-medium, rgba(255,255,255,0.1)); border-radius:8px; padding:10px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                            <span class="gx-form-label" style="margin:0; font-size:10px; font-weight:800; color:var(--text-main); display:flex; align-items:center; gap:5px;">
                                <i class="fas fa-id-card-clip" style="color:var(--primary);"></i> Reporter Details (Optional)
                            </span>
                            <span style="font-size:9px; color:var(--text-sub); font-family:var(--font-data);">Prefilled from My Info</span>
                        </div>
                        <p style="font-size:10px; color:var(--text-sub); margin-bottom:8px; line-height:1.35;">
                            Review or edit your contact details below. You can leave fields empty to submit anonymously.
                        </p>
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
                            <div>
                                <label for="gx-report-name" style="display:block; font-size:8.5px; font-weight:700; color:var(--text-sub); text-transform:uppercase; margin-bottom:3px;">Your Name</label>
                                <input type="text" id="gx-report-name" class="gx-input" placeholder="e.g. Juan Dela Cruz" style="width:100%; box-sizing:border-box; padding:7px 9px; font-size:11px; background:var(--bg-card); border:1px solid var(--border-subtle); border-radius:6px; color:var(--text-main);">
                            </div>
                            <div>
                                <label for="gx-report-phone" style="display:block; font-size:8.5px; font-weight:700; color:var(--text-sub); text-transform:uppercase; margin-bottom:3px;">Contact Number</label>
                                <input type="tel" id="gx-report-phone" class="gx-input" placeholder="e.g. 0912-345-6789" style="width:100%; box-sizing:border-box; padding:7px 9px; font-size:11px; background:var(--bg-card); border:1px solid var(--border-subtle); border-radius:6px; color:var(--text-main);">
                            </div>
                        </div>
                    </div>

                    <button type="button" id="gx-btn-submit-report" class="gx-btn-primary" onclick="GabayXOfflineUI.submitReport()">
                        <i class="fas fa-paper-plane"></i> Submit Emergency Report
                    </button>
                </div>
            </div>
        </div>

        <!-- B. REPORT HISTORY & SYNC DRAWER -->
        <div id="gx-history-modal" class="gx-modal-backdrop">
            <div class="gx-modal-card">
                <div class="gx-modal-header">
                    <h3 class="gx-modal-title"><i class="fas fa-clock-rotate-left" style="color:var(--primary);"></i> Emergency Reports</h3>
                    <button class="gx-modal-close" onclick="GabayXOfflineUI.closeHistoryModal()">&times;</button>
                </div>
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; padding:0 2px;">
                    <span id="gx-sync-status-hint" style="font-size:11px; color:var(--text-sub);">Saved in local database</span>
                    <button type="button" id="gx-btn-sync-now" onclick="GabayXOfflineUI.handleManualSync()" style="background:rgba(16,185,129,0.12); border:1px solid var(--glass-border); color:var(--primary); padding:6px 12px; border-radius:8px; font-size:10px; font-weight:800; cursor:pointer; text-transform:uppercase;">
                        <i class="fas fa-sync"></i> Sync Now
                    </button>
                </div>
                <div class="gx-modal-body" id="gx-history-list">
                    <!-- Populated dynamically -->
                </div>
            </div>
        </div>

        <!-- C. OFFLINE GUIDES & EMERGENCY HOTLINES MODAL -->
        <div id="gx-info-modal" class="gx-modal-backdrop">
            <div class="gx-modal-card">
                <div class="gx-modal-header">
                    <h3 class="gx-modal-title"><i class="fas fa-book-medical" style="color:var(--primary);"></i> Offline Guides & Hotlines</h3>
                    <button class="gx-modal-close" onclick="GabayXOfflineUI.closeInfoModal()">&times;</button>
                </div>
                <div class="gx-modal-body">
                    <div style="font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:0.75px; color:var(--text-sub); margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
                        <span>Official Emergency Hotlines</span>
                        <span style="color:var(--primary); font-family:var(--font-data);">Tap to Call</span>
                    </div>

                    <!-- 1. USM SSMO -->
                    <div class="gx-hotline-item">
                        <div class="gx-hotline-icon"><i class="fas fa-shield-halved"></i></div>
                        <div class="gx-hotline-info">
                            <div class="gx-hotline-name">USM Security Services (SSMO)</div>
                            <div class="gx-hotline-role">Campus Security & Immediate Dispatch</div>
                        </div>
                        <a href="tel:0645722100" class="gx-call-action-btn"><i class="fas fa-phone"></i> (064) 572 2100</a>
                    </div>

                    <!-- 2. Kabacan PNP -->
                    <div class="gx-hotline-item">
                        <div class="gx-hotline-icon"><i class="fas fa-building-shield"></i></div>
                        <div class="gx-hotline-info">
                            <div class="gx-hotline-name">Kabacan PNP (Police)</div>
                            <div class="gx-hotline-role">Law Enforcement & Police Response</div>
                        </div>
                        <a href="tel:09393393168" class="gx-call-action-btn"><i class="fas fa-phone"></i> 0939-339-3168</a>
                    </div>

                    <!-- 3. Kabacan BFP -->
                    <div class="gx-hotline-item">
                        <div class="gx-hotline-icon" style="color:var(--danger); background:rgba(239,68,68,0.12);"><i class="fas fa-fire-extinguisher"></i></div>
                        <div class="gx-hotline-info">
                            <div class="gx-hotline-name">Kabacan BFP (Fire Protection)</div>
                            <div class="gx-hotline-role">Fire Suppression & Heavy Rescue</div>
                        </div>
                        <a href="tel:09100489571" class="gx-call-action-btn" style="background:var(--danger);"><i class="fas fa-phone"></i> 0910-048-9571</a>
                    </div>

                    <!-- 4. AFP 90th Infantry Battalion -->
                    <div class="gx-hotline-item">
                        <div class="gx-hotline-icon" style="color:var(--warning); background:rgba(245,158,11,0.12);"><i class="fas fa-person-military-pointing"></i></div>
                        <div class="gx-hotline-info">
                            <div class="gx-hotline-name">AFP 90th Infantry Battalion</div>
                            <div class="gx-hotline-role">Armed Forces & Disaster Security</div>
                        </div>
                        <a href="tel:09564430948" class="gx-call-action-btn"><i class="fas fa-phone"></i> 0956-443-0948</a>
                    </div>

                    <!-- 5. Kabacan MDRRM -->
                    <div class="gx-hotline-item">
                        <div class="gx-hotline-icon"><i class="fas fa-tower-broadcast"></i></div>
                        <div class="gx-hotline-info">
                            <div class="gx-hotline-name">Kabacan MDRRM</div>
                            <div class="gx-hotline-role">Municipal Disaster Coordination & Rescue</div>
                        </div>
                        <a href="tel:09103633864" class="gx-call-action-btn"><i class="fas fa-phone"></i> 0910-363-3864</a>
                    </div>

                    <!-- 6. Kabacan RHU -->
                    <div class="gx-hotline-item">
                        <div class="gx-hotline-icon"><i class="fas fa-hospital"></i></div>
                        <div class="gx-hotline-info">
                            <div class="gx-hotline-name">Kabacan Rural Health Unit (RHU)</div>
                            <div class="gx-hotline-role">Emergency Health & Medical Triage</div>
                        </div>
                        <a href="tel:09263970496" class="gx-call-action-btn"><i class="fas fa-phone"></i> 0926-397-0496</a>
                    </div>

                    <div style="font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:0.75px; color:var(--text-sub); margin-top:14px; margin-bottom:8px;">
                        Offline Response Guidelines
                    </div>

                    <div class="gx-guide-card">
                        <div class="gx-guide-title"><i class="fas fa-house-crack"></i> Earthquake Safety</div>
                        <p class="gx-guide-text"><b>DROP, COVER, AND HOLD ON.</b> Protect your head and neck under sturdy furniture. When shaking ceases, evacuate calmly toward open spaces (Principal Front assembly ground). Avoid glass windows.</p>
                    </div>

                    <div class="gx-guide-card">
                        <div class="gx-guide-title" style="color:var(--danger);"><i class="fas fa-fire"></i> Fire Evacuation</div>
                        <p class="gx-guide-text"><b>STAY LOW AND EVACUATE.</b> Smoke and toxic fumes rise. Check doors with the back of your hand before turning handles. Head toward Mendoza Court or Tejada Court safe zones.</p>
                    </div>

                    <div class="gx-guide-card">
                        <div class="gx-guide-title" style="color:#0284c7;"><i class="fas fa-water"></i> Flood Protocol</div>
                        <p class="gx-guide-text"><b>SEEK HIGHER ELEVATION.</b> Avoid walking or driving through moving water. Stay clear of downed electrical wires. GabayX records your GPS coordinates locally if offline.</p>
                    </div>
                </div>
            </div>
        </div>
        `;

        document.body.appendChild(container);
    }

    function openReportModal() {
        injectOfflineUI();
        refreshLocation();

        // Prefill contact details from My Information (or local identity)
        let reporterName = '';
        let contactPhone = '';
        if (global.GabayXMyInfo && typeof global.GabayXMyInfo.getProfile === 'function') {
            const p = global.GabayXMyInfo.getProfile();
            reporterName = p.fullName || '';
            contactPhone = p.contactNumber || '';
        } else {
            reporterName = localStorage.getItem('knhs_student_name') || '';
            contactPhone = localStorage.getItem('knhs_student_phone') || '';
        }

        const nameInput = document.getElementById('gx-report-name');
        const phoneInput = document.getElementById('gx-report-phone');
        if (nameInput) nameInput.value = reporterName;
        if (phoneInput) phoneInput.value = contactPhone;

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
        document.getElementById('gx-info-modal').classList.add('active');
    }

    function closeInfoModal() {
        const modal = document.getElementById('gx-info-modal');
        if (modal) modal.classList.remove('active');
    }

    function selectType(button) {
        document.querySelectorAll('#gx-type-selector .gx-type-btn').forEach((btn) => btn.classList.remove('selected'));
        button.classList.add('selected');
    }

    function getSelectedType() {
        const selected = document.querySelector('#gx-type-selector .gx-type-btn.selected');
        return selected ? selected.getAttribute('data-type') : 'GENERAL';
    }

    function refreshLocation() {
        const locCoords = document.getElementById('gx-loc-coords');
        const locBldg = document.getElementById('gx-loc-building');
        if (!locCoords) return;

        locCoords.innerText = 'Acquiring GPS...';

        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    const lat = pos.coords.latitude;
                    const lng = pos.coords.longitude;
                    locCoords.innerText = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;

                    if (window.BUILDINGS && window.map) {
                        let nearest = null;
                        let minDist = Infinity;
                        const userLoc = L.latLng(lat, lng);
                        window.BUILDINGS.forEach((b) => {
                            const dist = window.map.distance(userLoc, b.coords);
                            if (dist < minDist) { minDist = dist; nearest = b; }
                        });
                        if (nearest && minDist < 80) {
                            locBldg.innerText = `Sector: ${nearest.name} (~${Math.round(minDist)}m)`;
                        } else {
                            locBldg.innerText = 'Campus Perimeter Zone';
                        }
                    } else {
                        locBldg.innerText = 'GPS Signal Acquired';
                    }
                },
                () => {
                    locCoords.innerText = 'GPS Locked (Manual Infer)';
                    locBldg.innerText = 'Location will be determined by network';
                },
                { enableHighAccuracy: true, timeout: 8000 }
            );
        }
    }

    function handlePhotoUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
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

    /**
     * Submit an emergency incident report through ReportService
     */
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
        const submitBtn = document.getElementById('gx-btn-submit-report');

        const nameInput = document.getElementById('gx-report-name');
        const phoneInput = document.getElementById('gx-report-phone');
        const reporterName = (nameInput ? nameInput.value : '').trim();
        const contactPhone = (phoneInput ? phoneInput.value : '').trim();

        // Validate contact phone if user provided one
        if (contactPhone && global.GabayXMyInfo && typeof global.GabayXMyInfo.validatePhone === 'function') {
            const valResult = global.GabayXMyInfo.validatePhone(contactPhone);
            if (!valResult.valid) {
                alert(valResult.error || 'Please enter a valid contact phone number, or leave it blank to report anonymously.');
                return;
            }
        }

        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving locally...';

        try {
            if (!global.GabayXReportService) {
                throw new Error('ReportService is not loaded');
            }

            // Save locally first via ReportService
            const report = await global.GabayXReportService.createReport({
                incidentType,
                description: description || `Reported ${incidentType} emergency in area`,
                latitude: lat,
                longitude: lng,
                nearest_building: nearestBuilding,
                photo: currentPhotoBase64,
                student_name: reporterName || 'Guest Citizen',
                contact_phone: contactPhone || null,
                phone_number: contactPhone || null
            });

            // Online vs Offline feedback
            if (report.status === 'SYNCED') {
                showToast('✅ Report submitted and confirmed by command center');
            } else {
                // Offline or pending sync
                showToast('Report saved offline. It will be sent when an internet connection is available.');
            }

            // Reset and close modal
            descInput.value = '';
            if (nameInput) nameInput.value = '';
            if (phoneInput) phoneInput.value = '';
            closeReportModal();

            // Refresh UI indicators
            if (global.GabayXNetwork) {
                global.GabayXNetwork.updateIndicators(navigator.onLine ? 'ONLINE' : 'OFFLINE');
            }
        } catch (err) {
            console.error('[OfflineUI] Submission error:', err);
            alert('Failed to record emergency report: ' + err.message);
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit Emergency Report';
        }
    }

    /**
     * Populate the report history drawer
     */
    async function loadHistoryData() {
        const listContainer = document.getElementById('gx-history-list');
        const syncHint = document.getElementById('gx-sync-status-hint');
        const syncNowBtn = document.getElementById('gx-btn-sync-now');
        if (!listContainer || !global.GabayXReportService) return;

        listContainer.innerHTML = '<div style="text-align:center; color:var(--text-sub); padding:20px;"><i class="fas fa-spinner fa-spin"></i> Loading reports...</div>';

        const reports = await global.GabayXReportService.getReports();
        const pendingReports = reports.filter(r => r.status === 'PENDING' || r.status === 'FAILED');

        if (syncHint) {
            if (pendingReports.length > 0) {
                syncHint.innerText = `${pendingReports.length} report(s) waiting to sync`;
                syncHint.style.color = '#f59e0b';
            } else {
                syncHint.innerText = 'All reports confirmed synced';
                syncHint.style.color = 'var(--text-sub)';
            }
        }

        if (syncNowBtn) {
            syncNowBtn.style.display = pendingReports.length > 0 ? 'inline-block' : 'none';
        }

        if (reports.length === 0) {
            listContainer.innerHTML = '<div style="text-align:center; color:var(--text-sub); padding:30px; font-size:12px;">No emergency reports recorded yet.</div>';
            return;
        }

        const getPill = (status) => {
            switch (status) {
                case 'PENDING':
                    return '<span class="gx-status-pill gx-pill-pending">Pending Sync</span>';
                case 'SYNCING':
                    return '<span class="gx-status-pill gx-pill-syncing">Syncing...</span>';
                case 'SYNCED':
                    return '<span class="gx-status-pill gx-pill-synced">Synced & Confirmed</span>';
                case 'FAILED':
                    return '<span class="gx-status-pill gx-pill-failed">Sync Failed (Will Retry)</span>';
                default:
                    return `<span class="gx-status-pill gx-pill-pending">${status}</span>`;
            }
        };

        listContainer.innerHTML = reports.map((r) => {
            const timeStr = new Date(r.createdAt || r.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' });
            return `
            <div class="gx-report-item">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
                    <div>
                        <strong style="color:var(--text-main, #fff); font-size:13px; text-transform:uppercase;">${r.incidentType || r.incident_type || 'INCIDENT'}</strong>
                        <div style="font-family:var(--font-data, monospace); font-size:9px; color:var(--text-sub, #94a3b8); margin-top:2px;">ID: ${r.id.substring(0, 16)}... • ${timeStr}</div>
                    </div>
                    ${getPill(r.status)}
                </div>
                <div style="font-size:12px; color:var(--text-sub, #cbd5e1); line-height:1.4; margin-bottom:8px;">"${r.description}"</div>
                <div style="display:flex; justify-content:space-between; align-items:center; font-family:var(--font-data, monospace); font-size:10px; color:var(--text-sub, #94a3b8); border-top:1px solid var(--border-subtle, rgba(255,255,255,0.05)); padding-top:6px;">
                    <span><i class="fas fa-location-dot" style="color:var(--primary);"></i> ${r.nearest_building || 'Campus'}</span>
                    ${r.syncedAt ? `<span style="color:#10b981;"><i class="fas fa-check-double"></i> Synced</span>` : (r.retryCount > 0 ? `<span style="color:#f59e0b;">Retried: ${r.retryCount}x</span>` : '')}
                </div>
            </div>`;
        }).join('');
    }

    /**
     * Handle Manual Sync Action
     */
    async function handleManualSync() {
        const syncNowBtn = document.getElementById('gx-btn-sync-now');
        if (syncNowBtn) {
            syncNowBtn.disabled = true;
            syncNowBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Syncing...';
        }

        if (global.GabayXSync) {
            await global.GabayXSync.triggerSync(true);
        }

        await loadHistoryData();

        if (syncNowBtn) {
            syncNowBtn.disabled = false;
            syncNowBtn.innerHTML = '<i class="fas fa-sync"></i> Sync Now';
        }
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
    document.addEventListener('DOMContentLoaded', injectOfflineUI);

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
        handleManualSync,
        loadHistoryData
    };

})(typeof window !== 'undefined' ? window : this);
