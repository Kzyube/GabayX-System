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
        });
    }

    initInstallController();

    global.GabayXInstall = {
        isStandalone: isRunningStandalone,
        showPrompt: showInstallPrompt,
        hidePrompt: hideInstallPrompt
    };
})(typeof window !== 'undefined' ? window : this);
