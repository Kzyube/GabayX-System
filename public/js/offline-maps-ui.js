/**
 * GabayX Offline Maps & Routes UI Controller
 * 
 * Manages the "Offline Maps & Routes" dialog, route downloads,
 * campus basemap package downloads, storage statistics,
 * and offline route rendering on the Leaflet map.
 */

(function (global) {
    'use strict';

    let currentTab = 'routes'; // 'routes' | 'map_area' | 'status'
    let mapDownloadAbortController = null;
    let isDownloadingMap = false;
    let activeRouteInfo = null;

    /**
     * Inject Offline Maps Dialog into DOM if not present
     */
    function injectUI() {
        if (document.getElementById('offline-maps-modal')) {
            return;
        }

        const modal = document.createElement('div');
        modal.id = 'offline-maps-modal';
        modal.className = 'gx-offline-maps-backdrop';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-labelledby', 'offline-maps-modal-title');

        modal.innerHTML = `
            <div class="gx-offline-maps-card">
                <!-- MODAL HEADER -->
                <div class="gx-offline-header">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <div class="gx-offline-icon-box">
                            <i class="fas fa-map-location-dot"></i>
                        </div>
                        <div>
                            <h2 id="offline-maps-modal-title" class="gx-offline-title">Offline Maps & Routes</h2>
                            <p class="gx-offline-subtitle">Prepare and manage offline resources for emergency evacuation</p>
                        </div>
                    </div>
                    <button type="button" class="gx-offline-close-btn" onclick="GabayXOfflineMapsUI.closeModal()" aria-label="Close Offline Maps Dialog">
                        <i class="fas fa-xmark"></i>
                    </button>
                </div>

                <!-- TABS NAVIGATION -->
                <div class="gx-offline-tabs" role="tablist">
                    <button type="button" class="gx-offline-tab-btn active" id="tab-btn-routes" role="tab" aria-selected="true" onclick="GabayXOfflineMapsUI.switchTab('routes')">
                        <i class="fas fa-route"></i> Evacuation Routes
                    </button>
                    <button type="button" class="gx-offline-tab-btn" id="tab-btn-map" role="tab" aria-selected="false" onclick="GabayXOfflineMapsUI.switchTab('map_area')">
                        <i class="fas fa-layer-group"></i> Map Area Tiles
                    </button>
                    <button type="button" class="gx-offline-tab-btn" id="tab-btn-status" role="tab" aria-selected="false" onclick="GabayXOfflineMapsUI.switchTab('status')">
                        <i class="fas fa-hard-drive"></i> Storage & Status
                    </button>
                </div>

                <!-- TAB BODY -->
                <div class="gx-offline-body">
                    <!-- SECTION 1: ROUTES -->
                    <div id="offline-tab-content-routes" class="gx-offline-tab-panel active">
                        <div class="gx-offline-banner-notice">
                            <i class="fas fa-shield-halved" style="color:var(--primary); font-size:16px;"></i>
                            <div style="flex:1;">
                                <div style="font-weight:700; font-size:11.5px; color:var(--text-main);">Download Pre-Calculated Routes for Disasters</div>
                                <div style="font-size:10px; color:var(--text-sub);">Saved routes store verified street geometry in local storage so you can navigate when cell towers and internet fail.</div>
                            </div>
                        </div>

                        <div style="display:flex; justify-content:space-between; align-items:center; margin: 14px 0 10px 0;">
                            <span style="font-size:11px; font-weight:800; text-transform:uppercase; color:var(--text-sub); letter-spacing:0.5px;">Designated Evacuation Routes</span>
                            <button type="button" id="btn-download-all-routes" class="gx-btn-primary-sm" onclick="GabayXOfflineMapsUI.downloadAllOfficialRoutes()">
                                <i class="fas fa-cloud-arrow-down"></i> Download All Routes
                            </button>
                        </div>

                        <div id="offline-routes-list" class="gx-offline-cards-list">
                            <div style="text-align:center; padding:20px; color:var(--text-sub); font-size:11px;">
                                <i class="fas fa-spinner fa-spin"></i> Loading saved routes...
                            </div>
                        </div>
                    </div>

                    <!-- SECTION 2: MAP AREA TILES -->
                    <div id="offline-tab-content-map" class="gx-offline-tab-panel" style="display:none;">
                        <div class="gx-offline-banner-notice">
                            <i class="fas fa-map" style="color:var(--primary); font-size:16px;"></i>
                            <div style="flex:1;">
                                <div style="font-weight:700; font-size:11.5px; color:var(--text-main);">Campus Basemap Area Package</div>
                                <div style="font-size:10px; color:var(--text-sub);">Stores high-resolution map tiles for Kabacan National High School and immediate safe zone perimeters.</div>
                            </div>
                        </div>

                        <!-- PROVIDER TERMS TRANSPARENCY NOTICE -->
                        <div class="gx-provider-policy-box">
                            <div style="font-weight:700; font-size:10.5px; margin-bottom:4px; display:flex; align-items:center; gap:6px;">
                                <i class="fas fa-scale-balanced" style="color:var(--warning);"></i> Mapping Provider Terms & Limits
                            </div>
                            <div style="font-size:10px; color:var(--text-sub); line-height:1.4;">
                                • <b>OpenStreetMap (Street Map):</b> Supported for localized disaster emergency bounding boxes.<br>
                                • <b>ArcGIS World Imagery (Satellite):</b> Esri Terms of Use prohibit scraping or bulk offline tile downloading. Satellite tiles are cached on-demand as you view the map online.
                            </div>
                        </div>

                        <div id="offline-map-package-card" class="gx-package-card">
                            <!-- Filled dynamically -->
                        </div>

                        <!-- DOWNLOAD PROGRESS CONTAINER -->
                        <div id="offline-download-progress-box" style="display:none; margin-top:14px;" class="gx-progress-box">
                            <div style="display:flex; justify-content:space-between; font-size:11px; margin-bottom:6px;">
                                <span id="offline-progress-status" style="font-weight:700; color:var(--primary);">Downloading map tiles...</span>
                                <span id="offline-progress-percent" style="font-family:var(--font-data);">0%</span>
                            </div>
                            <div class="gx-progress-bar-bg">
                                <div id="offline-progress-bar-fill" class="gx-progress-bar-fill" style="width:0%;"></div>
                            </div>
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:8px;">
                                <span id="offline-progress-detail" style="font-size:9.5px; color:var(--text-sub); font-family:var(--font-data);">0 of 0 tiles</span>
                                <button type="button" id="btn-cancel-tile-download" class="gx-btn-danger-sm" onclick="GabayXOfflineMapsUI.cancelMapDownload()">
                                    <i class="fas fa-ban"></i> Cancel Download
                                </button>
                            </div>
                        </div>
                    </div>

                    <!-- SECTION 3: STORAGE & STATUS -->
                    <div id="offline-tab-content-status" class="gx-offline-tab-panel" style="display:none;">
                        <div id="offline-status-overview">
                            <!-- Filled dynamically -->
                        </div>

                        <div class="gx-safety-disclaimer-box">
                            <div style="font-weight:800; font-size:11px; color:#ff8c00; margin-bottom:6px; display:flex; align-items:center; gap:6px;">
                                <i class="fas fa-triangle-exclamation"></i> CRITICAL DISASTER SAFETY NOTICE
                            </div>
                            <p style="font-size:10.5px; color:var(--text-sub); line-height:1.45; margin:0;">
                                Downloaded routes are <b>baseline reference information</b>, not guaranteed-safe evacuation instructions during active disasters.
                                Flooding, fallen power lines, building collapse, or fire may block designated paths. Always evaluate real-time conditions and follow on-site emergency personnel.
                            </p>
                        </div>
                    </div>
                </div>

                <!-- MODAL FOOTER -->
                <div class="gx-offline-footer">
                    <span id="gx-offline-footer-status" style="font-size:10px; color:var(--text-sub);">
                        <i class="fas fa-circle-check" style="color:var(--primary);"></i> Offline Storage Ready
                    </span>
                    <button type="button" class="gx-btn-secondary-sm" onclick="GabayXOfflineMapsUI.closeModal()">Close</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Inject floating active offline route card into student map container
        injectActiveRouteFloatCard();
    }

    /**
     * Floating banner on map when an offline route is active
     */
    function injectActiveRouteFloatCard() {
        if (document.getElementById('active-offline-route-card')) return;

        const floatCard = document.createElement('div');
        floatCard.id = 'active-offline-route-card';
        floatCard.className = 'active-offline-route-floating';
        floatCard.style.display = 'none';

        floatCard.innerHTML = `
            <div style="display:flex; align-items:center; gap:10px; flex:1; min-width:0;">
                <div style="background:var(--primary); color:#000; width:32px; height:32px; border-radius:8px; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
                    <i class="fas fa-person-walking" style="font-size:15px;"></i>
                </div>
                <div style="min-width:0; flex:1;">
                    <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                        <span class="gx-pill-offline">OFFLINE SAVED ROUTE</span>
                        <span id="active-offline-route-stale" class="gx-pill-stale" style="display:none;">STALE DATA</span>
                    </div>
                    <div id="active-offline-route-name" style="font-weight:800; font-size:12px; color:var(--text-main); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-top:2px;">
                        Evacuation Route
                    </div>
                    <div style="font-size:10px; color:var(--text-sub); display:flex; gap:10px; margin-top:1px;">
                        <span><i class="fas fa-ruler"></i> <b id="active-offline-route-dist">0m</b></span>
                        <span><i class="fas fa-clock"></i> <b id="active-offline-route-time">0 min</b></span>
                        <span id="active-offline-route-date" style="opacity:0.8;"></span>
                    </div>
                </div>
            </div>
            <div style="display:flex; align-items:center; gap:6px; flex-shrink:0;">
                <button type="button" onclick="GabayXOfflineMapsUI.showSafetyDisclaimerModal()" title="Safety Notice" style="background:rgba(255,140,0,0.15); border:1px solid #ff8c00; color:#ff8c00; width:30px; height:30px; border-radius:6px; cursor:pointer;">
                    <i class="fas fa-triangle-exclamation" style="font-size:12px;"></i>
                </button>
                <button type="button" onclick="GabayXOfflineMapsUI.clearActiveRoute()" title="Clear Route" style="background:rgba(255,42,95,0.15); border:1px solid var(--danger); color:var(--danger); width:30px; height:30px; border-radius:6px; cursor:pointer;">
                    <i class="fas fa-xmark" style="font-size:12px;"></i>
                </button>
            </div>
        `;

        document.body.appendChild(floatCard);
    }

    /**
     * Open Modal and Refresh Data
     */
    async function openModal() {
        injectUI();
        const modal = document.getElementById('offline-maps-modal');
        if (modal) modal.classList.add('active');
        switchTab(currentTab);
    }

    /**
     * Close Modal
     */
    function closeModal() {
        const modal = document.getElementById('offline-maps-modal');
        if (modal) modal.classList.remove('active');
    }

    /**
     * Tab Switcher
     */
    function switchTab(tabKey) {
        currentTab = tabKey;
        const tabs = ['routes', 'map_area', 'status'];
        tabs.forEach((t) => {
            const btn = document.getElementById(`tab-btn-${t === 'map_area' ? 'map' : t}`);
            const panel = document.getElementById(`offline-tab-content-${t === 'map_area' ? 'map' : t}`);
            if (btn) btn.classList.toggle('active', t === tabKey);
            if (panel) {
                panel.style.display = (t === tabKey) ? 'block' : 'none';
            }
        });

        if (tabKey === 'routes') {
            loadRoutesTab();
        } else if (tabKey === 'map_area') {
            loadMapAreaTab();
        } else if (tabKey === 'status') {
            loadStatusTab();
        }
    }

    /**
     * Render Routes Tab
     */
    async function loadRoutesTab() {
        const container = document.getElementById('offline-routes-list');
        if (!container) return;

        container.innerHTML = '<div style="text-align:center; padding:16px; color:var(--text-sub); font-size:11px;"><i class="fas fa-spinner fa-spin"></i> Loading routes...</div>';

        const service = global.GabayXOfflineMapsService;
        const catalog = service.ROUTE_CATALOG;
        const db = global.GabayXDB;

        let savedRoutes = [];
        try {
            if (db && db.getAllRoutes) {
                savedRoutes = await db.getAllRoutes();
            }
        } catch (e) {
            console.warn('[OfflineMapsUI] Could not fetch saved routes:', e);
        }

        const savedMap = new Map();
        savedRoutes.forEach((r) => savedMap.set(r.id, r));

        let html = '';
        catalog.forEach((item) => {
            const saved = savedMap.get(item.id);
            const isDownloaded = !!saved;

            let dateLabel = '';
            let isStale = false;
            if (isDownloaded && saved.downloadTimestamp) {
                const daysOld = (Date.now() - saved.downloadTimestamp) / (1000 * 60 * 60 * 24);
                isStale = daysOld > 7;
                dateLabel = `Saved on ${new Date(saved.downloadTimestamp).toLocaleDateString()}`;
            }

            const dist = saved ? saved.distanceMeters : item.estimatedDistanceMeters;
            const time = saved ? saved.durationMinutes : item.estimatedDurationMinutes;

            html += `
                <div class="gx-route-card ${isDownloaded ? 'downloaded' : ''}">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
                        <div style="flex:1; min-width:0;">
                            <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap; margin-bottom:4px;">
                                ${item.isOfficialEvacuationRoute ? '<span class="gx-badge-official"><i class="fas fa-shield-halved"></i> Official Safe Zone Route</span>' : ''}
                                ${isDownloaded ? '<span class="gx-badge-saved"><i class="fas fa-check"></i> Available Offline</span>' : '<span class="gx-badge-not-saved">Not Downloaded</span>'}
                                ${isStale ? '<span class="gx-badge-stale" title="Downloaded over 7 days ago. Consider refreshing."><i class="fas fa-triangle-exclamation"></i> Stale Data</span>' : ''}
                            </div>
                            <h4 style="margin:0; font-size:12px; font-weight:800; color:var(--text-main);">${item.name}</h4>
                            <p style="margin:2px 0 6px 0; font-size:10px; color:var(--text-sub);">${item.description}</p>
                            <div style="display:flex; gap:12px; font-size:9.5px; color:var(--text-sub); font-family:var(--font-data);">
                                <span><i class="fas fa-person-walking"></i> ${dist}m</span>
                                <span><i class="fas fa-clock"></i> ~${time} min</span>
                                ${dateLabel ? `<span><i class="fas fa-calendar-check"></i> ${dateLabel}</span>` : ''}
                            </div>
                        </div>
                    </div>
                    <div style="display:flex; gap:6px; margin-top:10px; border-top:1px solid var(--border-subtle); padding-top:8px;">
                        ${isDownloaded ? `
                            <button type="button" class="gx-btn-primary-sm" onclick="GabayXOfflineMapsUI.viewRouteOnMap('${item.id}')" style="flex:1;">
                                <i class="fas fa-map-location-dot"></i> View on Map
                            </button>
                            <button type="button" class="gx-btn-secondary-sm" onclick="GabayXOfflineMapsUI.downloadSingleRoute('${item.id}')" title="Re-download route for latest geometry">
                                <i class="fas fa-rotate"></i> Refresh
                            </button>
                            <button type="button" class="gx-btn-danger-sm" onclick="GabayXOfflineMapsUI.deleteRoute('${item.id}', '${item.name}')" title="Delete route">
                                <i class="fas fa-trash-can"></i>
                            </button>
                        ` : `
                            <button type="button" class="gx-btn-primary-sm" onclick="GabayXOfflineMapsUI.downloadSingleRoute('${item.id}')" style="flex:1;">
                                <i class="fas fa-download"></i> Download Route
                            </button>
                        `}
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
    }

    /**
     * Download a Single Route
     */
    async function downloadSingleRoute(routeId) {
        if (typeof showToast === 'function') showToast("📍 Downloading route geometry...");
        try {
            const service = global.GabayXOfflineMapsService;
            const res = await service.downloadRoute(routeId);
            if (typeof showToast === 'function') showToast(`✅ Saved ${res.name} for offline use!`);
            loadRoutesTab();
            auditStatusFooter();
        } catch (err) {
            console.error('Error downloading route:', err);
            if (typeof showToast === 'function') showToast(`⚠️ Download failed: ${err.message}`);
        }
    }

    /**
     * Download All Official Routes
     */
    async function downloadAllOfficialRoutes() {
        const btn = document.getElementById('btn-download-all-routes');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Downloading...';
        }

        try {
            const service = global.GabayXOfflineMapsService;
            const results = await service.downloadAllOfficialRoutes((progress) => {
                if (typeof showToast === 'function') {
                    showToast(`Downloading route ${progress.current}/${progress.total}: ${progress.name}`);
                }
            });
            if (typeof showToast === 'function') showToast(`✅ All ${results.length} official safe zone routes downloaded!`);
            loadRoutesTab();
            auditStatusFooter();
        } catch (err) {
            console.error('Error downloading all routes:', err);
            if (typeof showToast === 'function') showToast(`⚠️ Route download failed: ${err.message}`);
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-cloud-arrow-down"></i> Download All Routes';
            }
        }
    }

    /**
     * Delete Saved Route with Confirmation
     */
    async function deleteRoute(routeId, routeName) {
        if (!confirm(`Are you sure you want to delete the saved offline route for "${routeName}"?`)) {
            return;
        }

        try {
            const db = global.GabayXDB;
            if (db && db.deleteRoute) {
                await db.deleteRoute(routeId);
            }
            if (activeRouteInfo && activeRouteInfo.id === routeId) {
                clearActiveRoute();
            }
            if (typeof showToast === 'function') showToast(`Deleted offline route for ${routeName}`);
            loadRoutesTab();
            auditStatusFooter();
        } catch (err) {
            console.error('Error deleting route:', err);
        }
    }

    /**
     * View Saved Route on Map
     */
    async function viewRouteOnMap(routeId) {
        const db = global.GabayXDB;
        let route = null;
        if (db && db.getRoute) {
            route = await db.getRoute(routeId);
        }
        if (!route) {
            if (typeof showToast === 'function') showToast("Route data not found in local storage.");
            return;
        }

        closeModal();

        const leafletMap = global.map;
        if (!leafletMap) {
            console.error('Leaflet map instance not found');
            return;
        }

        const service = global.GabayXOfflineMapsService;
        service.renderRouteOnMap(leafletMap, route);
        activeRouteInfo = route;

        // Show floating card
        const card = document.getElementById('active-offline-route-card');
        if (card) {
            document.getElementById('active-offline-route-name').innerText = route.name;
            document.getElementById('active-offline-route-dist').innerText = `${route.distanceMeters}m`;
            document.getElementById('active-offline-route-time').innerText = `${route.durationMinutes} min`;

            const dateSpan = document.getElementById('active-offline-route-date');
            if (dateSpan && route.downloadDateFormatted) {
                dateSpan.innerText = `Saved: ${route.downloadDateFormatted}`;
            }

            const stalePill = document.getElementById('active-offline-route-stale');
            if (stalePill && route.downloadTimestamp) {
                const daysOld = (Date.now() - route.downloadTimestamp) / (1000 * 60 * 60 * 24);
                stalePill.style.display = daysOld > 7 ? 'inline-block' : 'none';
            }

            card.style.display = 'flex';
        }

        if (typeof showToast === 'function') showToast(`🗺️ Displaying Offline Route: ${route.name}`);
    }

    /**
     * Clear Active Offline Route from Map
     */
    function clearActiveRoute() {
        const leafletMap = global.map;
        const service = global.GabayXOfflineMapsService;
        if (service && service.clearActiveRouteFromMap) {
            service.clearActiveRouteFromMap(leafletMap);
        }
        activeRouteInfo = null;

        const card = document.getElementById('active-offline-route-card');
        if (card) card.style.display = 'none';

        if (typeof showToast === 'function') showToast("Offline route cleared from view.");
    }

    /**
     * Render Map Area Tab
     */
    async function loadMapAreaTab() {
        const container = document.getElementById('offline-map-package-card');
        if (!container) return;

        const service = global.GabayXOfflineMapsService;
        const estimate = service.estimateCampusMapPackage();
        const db = global.GabayXDB;

        let existingPkg = null;
        let tileCount = 0;
        try {
            if (db) {
                existingPkg = await db.getPackage(estimate.id);
                const allTiles = await db.getAllTiles();
                tileCount = allTiles.length;
            }
        } catch (e) {
            console.warn('[OfflineMapsUI] Could not fetch map package:', e);
        }

        const isDownloaded = existingPkg && (existingPkg.status === 'complete' || tileCount >= 12);

        let html = `
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:10px;">
                <div>
                    <div style="display:flex; align-items:center; gap:6px; margin-bottom:4px;">
                        <span class="gx-pill-provider">${estimate.provider}</span>
                        ${isDownloaded ? '<span class="gx-badge-saved"><i class="fas fa-circle-check"></i> Stored Offline</span>' : '<span class="gx-badge-not-saved">Not Stored</span>'}
                    </div>
                    <h3 style="margin:0; font-size:13px; font-weight:800; color:var(--text-main);">${estimate.name}</h3>
                    <p style="margin:2px 0 0 0; font-size:10px; color:var(--text-sub);">${estimate.areaDescription}</p>
                </div>
            </div>

            <div class="gx-meta-grid">
                <div class="gx-meta-item">
                    <span class="gx-meta-label">TILES COUNT</span>
                    <span class="gx-meta-val">${isDownloaded ? (existingPkg ? existingPkg.tileCount : tileCount) : estimate.tileCount} tiles</span>
                </div>
                <div class="gx-meta-item">
                    <span class="gx-meta-label">ZOOM LEVELS</span>
                    <span class="gx-meta-val">${estimate.zoomRange.join(' – ')} (Street detail)</span>
                </div>
                <div class="gx-meta-item">
                    <span class="gx-meta-label">STORAGE ESTIMATE</span>
                    <span class="gx-meta-val">${estimate.approxFormatted}</span>
                </div>
                <div class="gx-meta-item">
                    <span class="gx-meta-label">LAST DOWNLOAD</span>
                    <span class="gx-meta-val">${existingPkg && existingPkg.downloadDateFormatted ? existingPkg.downloadDateFormatted : 'Never'}</span>
                </div>
            </div>

            <div style="display:flex; gap:8px; margin-top:14px;">
                ${isDownloaded ? `
                    <button type="button" class="gx-btn-secondary-sm" onclick="GabayXOfflineMapsUI.startMapDownload()" style="flex:1;">
                        <i class="fas fa-rotate"></i> Re-Download Package
                    </button>
                    <button type="button" class="gx-btn-danger-sm" onclick="GabayXOfflineMapsUI.deleteMapPackage()" style="flex:1;">
                        <i class="fas fa-trash-can"></i> Delete Map Data
                    </button>
                ` : `
                    <button type="button" class="gx-btn-primary-sm" onclick="GabayXOfflineMapsUI.startMapDownload()" style="width:100%; justify-content:center; padding:10px;">
                        <i class="fas fa-cloud-arrow-down"></i> Download Campus Map Area (${estimate.approxFormatted})
                    </button>
                `}
            </div>
        `;

        container.innerHTML = html;
    }

    /**
     * Start Campus Map Tile Package Download
     */
    async function startMapDownload() {
        if (isDownloadingMap) return;

        isDownloadingMap = true;
        mapDownloadAbortController = new AbortController();

        const progressBox = document.getElementById('offline-download-progress-box');
        const progressBar = document.getElementById('offline-progress-bar-fill');
        const progressPercent = document.getElementById('offline-progress-percent');
        const progressDetail = document.getElementById('offline-progress-detail');
        const progressStatus = document.getElementById('offline-progress-status');

        if (progressBox) progressBox.style.display = 'block';

        const service = global.GabayXOfflineMapsService;

        try {
            await service.downloadCampusMapPackage((prog) => {
                if (progressBar) progressBar.style.width = `${prog.percent}%`;
                if (progressPercent) progressPercent.innerText = `${prog.percent}%`;
                if (progressDetail) progressDetail.innerText = `${prog.downloaded} of ${prog.total} tiles (${prog.currentTile})`;
            }, mapDownloadAbortController.signal);

            if (progressStatus) progressStatus.innerText = 'Download Complete & Verified!';
            if (typeof showToast === 'function') showToast("✅ Campus map tiles saved for offline use!");
            loadMapAreaTab();
            auditStatusFooter();
        } catch (err) {
            console.error('Tile download error:', err);
            if (typeof showToast === 'function') showToast(err.message === 'Download cancelled by user.' ? 'Tile download cancelled.' : `⚠️ Tile download failed: ${err.message}`);
        } finally {
            isDownloadingMap = false;
            mapDownloadAbortController = null;
            setTimeout(() => {
                if (progressBox) progressBox.style.display = 'none';
            }, 3000);
        }
    }

    /**
     * Cancel Map Tile Download
     */
    function cancelMapDownload() {
        if (mapDownloadAbortController) {
            mapDownloadAbortController.abort();
            isDownloadingMap = false;
            mapDownloadAbortController = null;
        }
    }

    /**
     * Delete Downloaded Map Tiles
     */
    async function deleteMapPackage() {
        if (!confirm("Are you sure you want to remove all saved campus map tiles and free up storage?")) {
            return;
        }

        try {
            const service = global.GabayXOfflineMapsService;
            await service.deleteCampusMapPackage();
            if (typeof showToast === 'function') showToast("Campus map tiles removed from device.");
            loadMapAreaTab();
            auditStatusFooter();
        } catch (err) {
            console.error('Error deleting map package:', err);
        }
    }

    /**
     * Render Storage & Status Tab
     */
    async function loadStatusTab() {
        const container = document.getElementById('offline-status-overview');
        if (!container) return;

        const service = global.GabayXOfflineMapsService;
        const audit = await service.auditOfflineReadiness();

        let quotaText = 'Storage API unavailable';
        let quotaPercent = 0;
        if (audit.quotaUsage && audit.quotaTotal) {
            const usedMb = (audit.quotaUsage / (1024 * 1024)).toFixed(1);
            const totalMb = (audit.quotaTotal / (1024 * 1024)).toFixed(0);
            quotaText = `${usedMb} MB used of ${totalMb} MB browser quota`;
            quotaPercent = Math.min(100, Math.round((audit.quotaUsage / audit.quotaTotal) * 100));
        }

        const html = `
            <div class="gx-status-hero-card" style="border-color:${audit.statusBadgeColor};">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <span style="font-size:10px; font-weight:800; text-transform:uppercase; color:var(--text-sub); letter-spacing:0.5px;">SYSTEM READINESS</span>
                        <h3 style="margin:2px 0 0 0; font-size:14px; font-weight:800; color:${audit.statusBadgeColor};">${audit.statusBadgeText}</h3>
                    </div>
                    <div style="background:rgba(16,185,129,0.15); border:1px solid ${audit.statusBadgeColor}; width:38px; height:38px; border-radius:50%; display:flex; align-items:center; justify-content:center; color:${audit.statusBadgeColor}; font-size:16px;">
                        <i class="fas ${audit.status === 'READY' ? 'fa-circle-check' : (audit.status === 'PARTIAL' ? 'fa-triangle-exclamation' : 'fa-circle-xmark')}"></i>
                    </div>
                </div>
            </div>

            <div class="gx-meta-grid" style="margin-top:10px;">
                <div class="gx-meta-item">
                    <span class="gx-meta-label">OFFLINE ROUTES</span>
                    <span class="gx-meta-val">${audit.savedRoutesCount} saved (${audit.officialRoutesCount}/${audit.totalOfficialCatalog} official)</span>
                </div>
                <div class="gx-meta-item">
                    <span class="gx-meta-label">MAP BASEMAP</span>
                    <span class="gx-meta-val">${audit.hasMapPackage ? `${audit.tileCount} tiles cached` : 'None cached'}</span>
                </div>
                <div class="gx-meta-item">
                    <span class="gx-meta-label">STORAGE CONSUMED</span>
                    <span class="gx-meta-val">${audit.storageApproxFormatted}</span>
                </div>
                <div class="gx-meta-item">
                    <span class="gx-meta-label">DATA FRESHNESS</span>
                    <span class="gx-meta-val" style="color:${audit.isStale ? 'var(--warning)' : 'inherit'};">
                        ${audit.isStale ? '⚠️ Stale (>7 days)' : (audit.lastDownloadTime || 'Never')}
                    </span>
                </div>
            </div>

            <div style="background:var(--bg-input); padding:12px; border-radius:8px; border:1px solid var(--border-subtle); margin-top:12px;">
                <div style="display:flex; justify-content:space-between; font-size:10.5px; margin-bottom:4px;">
                    <span style="color:var(--text-sub); font-weight:700;">BROWSER STORAGE ESTIMATE</span>
                    <span style="font-family:var(--font-data); color:var(--text-main);">${quotaText}</span>
                </div>
                <div class="gx-progress-bar-bg">
                    <div class="gx-progress-bar-fill" style="width:${Math.max(2, quotaPercent)}%; background:var(--primary);"></div>
                </div>
            </div>
        `;

        container.innerHTML = html;
    }

    /**
     * Audit footer indicator
     */
    async function auditStatusFooter() {
        const footerSpan = document.getElementById('gx-offline-footer-status');
        if (!footerSpan) return;

        try {
            const service = global.GabayXOfflineMapsService;
            const audit = await service.auditOfflineReadiness();
            footerSpan.innerHTML = `<i class="fas ${audit.status === 'READY' ? 'fa-circle-check' : 'fa-circle-info'}" style="color:${audit.statusBadgeColor};"></i> ${audit.statusBadgeText} (${audit.savedRoutesCount} routes, ${audit.tileCount} tiles)`;
        } catch (e) {}
    }

    function showSafetyDisclaimerModal() {
        alert("CRITICAL DISASTER SAFETY NOTICE:\n\nDownloaded routes represent baseline pre-disaster road layouts.\n\nFlooding, fallen power lines, building collapse, or fire may block designated paths. Always evaluate real-time surroundings and follow on-site emergency personnel instructions.");
    }

    // Expose API
    const UI = {
        openModal,
        closeModal,
        switchTab,
        loadRoutesTab,
        loadMapAreaTab,
        loadStatusTab,
        downloadSingleRoute,
        downloadAllOfficialRoutes,
        deleteRoute,
        viewRouteOnMap,
        clearActiveRoute,
        startMapDownload,
        cancelMapDownload,
        deleteMapPackage,
        showSafetyDisclaimerModal
    };

    global.GabayXOfflineMapsUI = UI;

})(typeof window !== 'undefined' ? window : this);
