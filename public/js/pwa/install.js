/**
 * GabayX PWA Install Controller
 * Manages the browser beforeinstallprompt event, standalone mode detection,
 * and an unobtrusive, dismissible install banner matching the GabayX design.
 */

(function (global) {
    'use strict';

    const DISMISS_KEY = 'gabayx_install_dismissed_time';
    const DISMISS_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

    let deferredPrompt = null;
    let installUIElement = null;

    /**
     * Detect if GabayX is running in standalone mode (already installed)
     */
    function isRunningStandalone() {
        return (
            window.matchMedia('(display-mode: standalone)').matches ||
            window.matchMedia('(display-mode: fullscreen)').matches ||
            window.navigator.standalone === true
        );
    }

    /**
     * Check if user previously dismissed the install prompt recently
     */
    function isDismissedRecently() {
        const dismissedAt = localStorage.getItem(DISMISS_KEY);
        if (!dismissedAt) return false;
        const elapsed = Date.now() - parseInt(dismissedAt, 10);
        return elapsed < DISMISS_DURATION_MS;
    }

    /**
     * Record user dismissal to prevent repeated nagging
     */
    function recordDismissal() {
        localStorage.setItem(DISMISS_KEY, Date.now().toString());
        hideInstallPrompt();
    }

    /**
     * Render the unobtrusive GabayX install banner
     */
    function showInstallPrompt() {
        // Do not display if already standalone or dismissed recently
        if (isRunningStandalone() || isDismissedRecently()) {
            return;
        }

        if (document.getElementById('gabayx-install-banner')) {
            return;
        }

        const banner = document.createElement('div');
        banner.id = 'gabayx-install-banner';
        banner.setAttribute('role', 'banner');
        banner.style.cssText = [
            'position: fixed',
            'bottom: 85px', // Sits cleanly above mobile actions tray without blocking emergency SOS
            'left: 50%',
            'transform: translateX(-50%) translateY(20px)',
            'width: calc(100% - 24px)',
            'max-width: 440px',
            'background: rgba(6, 25, 18, 0.94)',
            'border: 1px solid rgba(16, 185, 129, 0.3)',
            'border-radius: 16px',
            'padding: 12px 16px',
            'display: flex',
            'align-items: center',
            'justify-content: space-between',
            'gap: 12px',
            'z-index: 9998',
            'box-shadow: 0 16px 36px rgba(0, 0, 0, 0.6), 0 0 20px rgba(16, 185, 129, 0.15)',
            'backdrop-filter: blur(12px)',
            '-webkit-backdrop-filter: blur(12px)',
            'transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s ease',
            'opacity: 0'
        ].join(';');

        banner.innerHTML = `
            <div style="display:flex; align-items:center; gap:10px; min-width:0;">
                <img src="/icons/icon-192.png" alt="GabayX" style="width:36px; height:36px; border-radius:10px; object-fit:cover; flex-shrink:0; border:1px solid rgba(16,185,129,0.4);" />
                <div style="min-width:0;">
                    <div style="color:#fff; font-weight:800; font-size:12px; font-family:var(--font-data, 'Space Mono', monospace); letter-spacing:0.5px;">INSTALL GABAYX</div>
                    <div style="color:var(--text-sub, #94a3b8); font-size:10px; line-height:1.2; margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">Fast offline access & emergency alerts</div>
                </div>
            </div>
            <div style="display:flex; align-items:center; gap:6px; flex-shrink:0;">
                <button id="btn-install-gabayx" style="background:var(--primary, #10b981); color:#010a07; font-weight:800; font-size:11px; padding:8px 12px; border-radius:10px; border:none; cursor:pointer; font-family:inherit; transition:0.2s;">Install</button>
                <button id="btn-dismiss-install" style="background:transparent; color:#94a3b8; border:none; font-size:16px; padding:4px 6px; cursor:pointer; line-height:1;" title="Dismiss">&times;</button>
            </div>
        `;

        document.body.appendChild(banner);
        installUIElement = banner;

        // Slide into view smoothly
        requestAnimationFrame(() => {
            banner.style.transform = 'translateX(-50%) translateY(0)';
            banner.style.opacity = '1';
        });

        // Event listeners
        const installBtn = banner.querySelector('#btn-install-gabayx');
        const dismissBtn = banner.querySelector('#btn-dismiss-install');

        if (installBtn) {
            installBtn.addEventListener('click', async () => {
                if (!deferredPrompt) return;
                try {
                    deferredPrompt.prompt();
                    const choiceResult = await deferredPrompt.userChoice;
                    console.log(`[PWA Install] User choice: ${choiceResult.outcome}`);
                    deferredPrompt = null;
                } catch (err) {
                    console.error('[PWA Install] Prompt error:', err);
                } finally {
                    hideInstallPrompt();
                }
            });
        }

        if (dismissBtn) {
            dismissBtn.addEventListener('click', recordDismissal);
        }
    }

    /**
     * Hide and remove the install banner
     */
    function hideInstallPrompt() {
        if (!installUIElement) return;
        installUIElement.style.transform = 'translateX(-50%) translateY(20px)';
        installUIElement.style.opacity = '0';
        setTimeout(() => {
            if (installUIElement && installUIElement.parentNode) {
                installUIElement.parentNode.removeChild(installUIElement);
            }
            installUIElement = null;
        }, 300);
    }

    /**
     * Show iOS Safari step-by-step installation guide
     */
    function showIOSInstallModal() {
        let modal = document.getElementById('gabayx-ios-install-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'gabayx-ios-install-modal';
            modal.style.cssText = [
                'position: fixed', 'inset: 0', 'background: rgba(0, 0, 0, 0.75)',
                'z-index: 35000', 'display: flex', 'align-items: center', 'justify-content: center',
                'padding: 16px', 'backdrop-filter: blur(8px)'
            ].join(';');

            modal.innerHTML = `
                <div style="background:var(--modal-bg, #061912); border:1px solid var(--border-strong, #10b981); border-radius:16px; padding:22px; width:100%; max-width:400px; color:var(--text-main, #fff); box-shadow:0 20px 40px rgba(0,0,0,0.6);">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; border-bottom:1px solid var(--border-subtle, rgba(255,255,255,0.1)); padding-bottom:10px;">
                        <h3 style="margin:0; font-size:1.1rem; display:flex; align-items:center; gap:8px;">
                            <i class="fab fa-apple" style="color:var(--primary, #10b981);"></i> Install GabayX on iOS
                        </h3>
                        <button onclick="document.getElementById('gabayx-ios-install-modal').style.display='none'" style="background:transparent; border:none; color:var(--text-sub, #94a3b8); font-size:22px; cursor:pointer;" aria-label="Close dialog">&times;</button>
                    </div>
                    <p style="font-size:12px; color:var(--text-sub, #cbd5e1); line-height:1.45; margin-bottom:16px;">
                        iOS Safari does not support one-click web installation prompts. You can add GabayX directly to your Home Screen in 3 quick steps:
                    </p>
                    <div style="display:flex; flex-direction:column; gap:12px; margin-bottom:18px;">
                        <div style="display:flex; align-items:center; gap:12px; background:var(--bg-card, rgba(255,255,255,0.05)); padding:10px 12px; border-radius:10px; border:1px solid var(--border-subtle, rgba(255,255,255,0.08));">
                            <span style="background:var(--primary-light, rgba(16,185,129,0.2)); color:var(--primary, #10b981); width:24px; height:24px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:12px;">1</span>
                            <span style="font-size:12px;">Tap the <b>Share</b> button <i class="fas fa-arrow-up-from-bracket" style="color:var(--primary, #10b981); margin:0 4px;"></i> at the bottom of Safari.</span>
                        </div>
                        <div style="display:flex; align-items:center; gap:12px; background:var(--bg-card, rgba(255,255,255,0.05)); padding:10px 12px; border-radius:10px; border:1px solid var(--border-subtle, rgba(255,255,255,0.08));">
                            <span style="background:var(--primary-light, rgba(16,185,129,0.2)); color:var(--primary, #10b981); width:24px; height:24px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:12px;">2</span>
                            <span style="font-size:12px;">Scroll down and tap <b>"Add to Home Screen"</b> <i class="fas fa-plus-square" style="margin-left:4px;"></i>.</span>
                        </div>
                        <div style="display:flex; align-items:center; gap:12px; background:var(--bg-card, rgba(255,255,255,0.05)); padding:10px 12px; border-radius:10px; border:1px solid var(--border-subtle, rgba(255,255,255,0.08));">
                            <span style="background:var(--primary-light, rgba(16,185,129,0.2)); color:var(--primary, #10b981); width:24px; height:24px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:12px;">3</span>
                            <span style="font-size:12px;">Tap <b>"Add"</b> in the top-right corner to finish.</span>
                        </div>
                    </div>
                    <button onclick="document.getElementById('gabayx-ios-install-modal').style.display='none'" style="width:100%; padding:10px; background:var(--primary, #10b981); color:#fff; border:none; border-radius:8px; font-weight:700; font-size:12px; cursor:pointer; text-transform:uppercase;">Got it</button>
                </div>
            `;
            document.body.appendChild(modal);
        }
        modal.style.display = 'flex';
    }

    /**
     * Show desktop / general browser install guidance
     */
    function showBrowserInstallGuide() {
        let modal = document.getElementById('gabayx-browser-install-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'gabayx-browser-install-modal';
            modal.style.cssText = [
                'position: fixed', 'inset: 0', 'background: rgba(0, 0, 0, 0.75)',
                'z-index: 35000', 'display: flex', 'align-items: center', 'justify-content: center',
                'padding: 16px', 'backdrop-filter: blur(8px)'
            ].join(';');

            modal.innerHTML = `
                <div style="background:var(--modal-bg, #061912); border:1px solid var(--border-strong, #10b981); border-radius:16px; padding:22px; width:100%; max-width:400px; color:var(--text-main, #fff); box-shadow:0 20px 40px rgba(0,0,0,0.6);">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; border-bottom:1px solid var(--border-subtle, rgba(255,255,255,0.1)); padding-bottom:10px;">
                        <h3 style="margin:0; font-size:1.1rem; display:flex; align-items:center; gap:8px;">
                            <i class="fas fa-desktop" style="color:var(--primary, #10b981);"></i> Install GabayX App
                        </h3>
                        <button onclick="document.getElementById('gabayx-browser-install-modal').style.display='none'" style="background:transparent; border:none; color:var(--text-sub, #94a3b8); font-size:22px; cursor:pointer;" aria-label="Close dialog">&times;</button>
                    </div>
                    <p style="font-size:12px; color:var(--text-sub, #cbd5e1); line-height:1.45; margin-bottom:16px;">
                        To install GabayX on your computer or browser:
                    </p>
                    <div style="display:flex; flex-direction:column; gap:10px; margin-bottom:18px;">
                        <div style="background:var(--bg-card, rgba(255,255,255,0.05)); padding:10px 12px; border-radius:10px; font-size:12px; line-height:1.4;">
                            <i class="fas fa-computer" style="color:var(--primary, #10b981); margin-right:6px;"></i> Click the <b>Install App icon</b> in your browser's address bar (top right).
                        </div>
                        <div style="background:var(--bg-card, rgba(255,255,255,0.05)); padding:10px 12px; border-radius:10px; font-size:12px; line-height:1.4;">
                            <i class="fas fa-ellipsis-vertical" style="color:var(--primary, #10b981); margin-right:6px;"></i> Or open browser menu (<b>⋮</b>) &rarr; select <b>"Install GabayX..."</b> or <b>"Save and Share &rarr; Install"</b>.
                        </div>
                    </div>
                    <button onclick="document.getElementById('gabayx-browser-install-modal').style.display='none'" style="width:100%; padding:10px; background:var(--primary, #10b981); color:#fff; border:none; border-radius:8px; font-weight:700; font-size:12px; cursor:pointer; text-transform:uppercase;">Understood</button>
                </div>
            `;
            document.body.appendChild(modal);
        }
        modal.style.display = 'flex';
    }

    /**
     * User-facing explicit trigger to install the application
     */
    async function promptInstall() {
        if (isRunningStandalone()) {
            if (typeof window.showToast === 'function') {
                window.showToast('✅ GabayX is already running as an installed standalone app.');
            } else {
                alert('GabayX is already installed as a standalone app.');
            }
            return;
        }

        // If native beforeinstallprompt was captured
        if (deferredPrompt) {
            try {
                deferredPrompt.prompt();
                const choiceResult = await deferredPrompt.userChoice;
                console.log(`[PWA Install] Explicit prompt outcome: ${choiceResult.outcome}`);
                if (choiceResult.outcome === 'accepted') {
                    hideInstallPrompt();
                }
                deferredPrompt = null;
            } catch (err) {
                console.error('[PWA Install] Prompt execution failed:', err);
            }
            return;
        }

        // Check if iOS Safari
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
        if (isIOS) {
            showIOSInstallModal();
            return;
        }

        // General browser fallback guidance
        showBrowserInstallGuide();
    }

    /**
     * Initialize install lifecycle
     */
    function initInstallController() {
        // If already running standalone, do not listen or show
        if (isRunningStandalone()) {
            console.log('[PWA Install] GabayX is running in standalone mode.');
            return;
        }

        window.addEventListener('beforeinstallprompt', (event) => {
            // Prevent immediate mini-infobar on mobile
            event.preventDefault();
            deferredPrompt = event;
            console.log('[PWA Install] beforeinstallprompt captured.');

            // Display our unobtrusive branded install prompt
            showInstallPrompt();
        });

        window.addEventListener('appinstalled', () => {
            console.log('[PWA Install] GabayX was successfully installed.');
            deferredPrompt = null;
            hideInstallPrompt();
            if (typeof window.showToast === 'function') {
                window.showToast('🎉 GabayX installed successfully!');
            }
        });
    }

    initInstallController();

    global.GabayXInstall = {
        isStandalone: isRunningStandalone,
        showPrompt: showInstallPrompt,
        hidePrompt: hideInstallPrompt,
        promptInstall: promptInstall
    };
})(typeof window !== 'undefined' ? window : this);
