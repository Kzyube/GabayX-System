/**
 * GabayX "My Information" Module
 * Allows citizens and students to manage optional personal and emergency contact information
 * without requiring account registration, university email, or student ID verification.
 * 
 * Persists locally on the user's device via localStorage (key: 'gabayx_user_profile')
 * and integrates with emergency incident reporting and administrator messaging.
 */

(function (global) {
    'use strict';

    const STORAGE_KEY = 'gabayx_user_profile';
    let currentMode = 'view'; // 'view' | 'edit' | 'review'
    let pendingProfileData = null;

    /**
     * Standard Philippine & International Phone Number Validation
     * Allows empty (since all fields are optional).
     * If provided, accepts:
     * - 11-digit mobile: 09XXXXXXXXX
     * - Country code mobile: +639XXXXXXXXX or 639XXXXXXXXX
     * - Local landline / hotlines: 7-10 digits (e.g. 064-572-2100)
     */
    function validatePhone(phoneStr) {
        if (!phoneStr || !phoneStr.trim()) {
            return { valid: true, error: '' };
        }
        const cleaned = phoneStr.trim().replace(/[\s\-\(\)\.]/g, '');
        // Check for invalid characters
        if (!/^\+?[0-9]{7,15}$/.test(cleaned)) {
            return {
                valid: false,
                error: 'Please enter a valid phone number (e.g. 0912-345-6789 or +63 912 345 6789).'
            };
        }
        // If starting with 09, should be 11 digits
        if (cleaned.startsWith('09') && cleaned.length !== 11) {
            return {
                valid: false,
                error: 'Philippine mobile numbers starting with 09 should have 11 digits (e.g. 09123456789).'
            };
        }
        // If starting with +639, should have 13 chars
        if (cleaned.startsWith('+639') && cleaned.length !== 13) {
            return {
                valid: false,
                error: 'Numbers starting with +639 should have 12 digits after + (e.g. +639123456789).'
            };
        }
        return { valid: true, error: '' };
    }

    /**
     * Optional Email Validation
     */
    function validateEmail(emailStr) {
        if (!emailStr || !emailStr.trim()) {
            return { valid: true, error: '' };
        }
        const trimmed = emailStr.trim();
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(trimmed)) {
            return {
                valid: false,
                error: 'Please enter a valid email address (e.g. name@example.com).'
            };
        }
        return { valid: true, error: '' };
    }

    /**
     * Retrieve stored user profile from localStorage
     */
    function getProfile() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                return {
                    fullName: parsed.fullName || '',
                    contactNumber: parsed.contactNumber || '',
                    email: parsed.email || '',
                    emergencyContactName: parsed.emergencyContactName || '',
                    emergencyContactNumber: parsed.emergencyContactNumber || '',
                    savedAt: parsed.savedAt || null
                };
            }
        } catch (err) {
            console.warn('[MyInfo] Error reading stored profile:', err);
        }

        // Fallback to legacy identity keys if present
        return {
            fullName: localStorage.getItem('knhs_student_name') || '',
            contactNumber: localStorage.getItem('knhs_student_phone') || '',
            email: (localStorage.getItem('knhs_student_email') && !localStorage.getItem('knhs_student_email').startsWith('anon-')) 
                ? localStorage.getItem('knhs_student_email') : '',
            emergencyContactName: '',
            emergencyContactNumber: '',
            savedAt: null
        };
    }

    /**
     * Check if user has saved any personal information
     */
    function hasSavedData() {
        const p = getProfile();
        return !!(p.fullName || p.contactNumber || p.email || p.emergencyContactName || p.emergencyContactNumber);
    }

    /**
     * Commit profile data to localStorage and sync legacy identity keys
     */
    function saveProfile(data) {
        const profile = {
            fullName: (data.fullName || '').trim(),
            contactNumber: (data.contactNumber || '').trim(),
            email: (data.email || '').trim(),
            emergencyContactName: (data.emergencyContactName || '').trim(),
            emergencyContactNumber: (data.emergencyContactNumber || '').trim(),
            savedAt: new Date().toISOString()
        };

        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
            
            // Sync legacy identity keys so all other components (reporting, sockets, telemetry) remain compatible
            if (profile.fullName) {
                localStorage.setItem('knhs_student_name', profile.fullName);
            } else {
                localStorage.removeItem('knhs_student_name');
            }

            if (profile.contactNumber) {
                localStorage.setItem('knhs_student_phone', profile.contactNumber);
            } else {
                localStorage.removeItem('knhs_student_phone');
            }

            if (profile.email) {
                localStorage.setItem('knhs_student_email', profile.email);
            }

            // Refresh UI and sidebar indicators
            if (typeof global.initUserIdentity === 'function') {
                global.initUserIdentity();
            }

            // Dispatch global event for listeners
            global.dispatchEvent(new CustomEvent('gabayx:profile-saved', { detail: profile }));
            return { success: true, profile };
        } catch (err) {
            console.error('[MyInfo] Failed to save profile:', err);
            return { success: false, error: err.message };
        }
    }

    /**
     * Clear and delete all locally saved personal information
     */
    function clearProfile() {
        try {
            localStorage.removeItem(STORAGE_KEY);
            localStorage.removeItem('knhs_student_name');
            localStorage.removeItem('knhs_student_phone');

            // Reset student email back to anonymous device ID if it was an email
            const curEmail = localStorage.getItem('knhs_student_email');
            if (curEmail && !curEmail.startsWith('anon-')) {
                const devId = localStorage.getItem('gabayx_device_id') || 'anon-' + Date.now().toString(36);
                localStorage.setItem('knhs_student_email', devId);
            }

            if (typeof global.initUserIdentity === 'function') {
                global.initUserIdentity();
            }

            global.dispatchEvent(new CustomEvent('gabayx:profile-cleared'));
            return { success: true };
        } catch (err) {
            console.error('[MyInfo] Failed to clear profile:', err);
            return { success: false, error: err.message };
        }
    }

    /**
     * Render the UI pane based on currentMode ('view' | 'edit' | 'review')
     */
    function render() {
        const modal = document.getElementById('my-information-modal');
        if (!modal) return;

        const viewPane = document.getElementById('my-info-view-pane');
        const editPane = document.getElementById('my-info-edit-pane');
        const reviewPane = document.getElementById('my-info-review-pane');

        if (!viewPane || !editPane || !reviewPane) return;

        // Hide all panes first
        viewPane.style.display = 'none';
        editPane.style.display = 'none';
        reviewPane.style.display = 'none';

        if (currentMode === 'view') {
            viewPane.style.display = 'block';
            renderViewPane();
        } else if (currentMode === 'edit') {
            editPane.style.display = 'block';
            renderEditPane();
        } else if (currentMode === 'review') {
            reviewPane.style.display = 'block';
            renderReviewPane();
        }
    }

    /**
     * Populate the View/Summary pane
     */
    function renderViewPane() {
        const p = getProfile();
        const hasData = hasSavedData();

        const badgeEl = document.getElementById('my-info-status-badge');
        if (badgeEl) {
            if (hasData) {
                badgeEl.className = 'gx-info-badge gx-badge-saved';
                badgeEl.innerHTML = '<i class="fas fa-check-circle"></i> Saved Locally';
            } else {
                badgeEl.className = 'gx-info-badge gx-badge-not-saved';
                badgeEl.innerHTML = '<i class="fas fa-circle-info"></i> No Details Saved';
            }
        }

        const setVal = (id, val, fallback = 'Not provided') => {
            const el = document.getElementById(id);
            if (!el) return;
            if (val && val.trim()) {
                el.innerText = val.trim();
                el.classList.remove('val-muted');
            } else {
                el.innerText = fallback;
                el.classList.add('val-muted');
            }
        };

        setVal('my-info-disp-name', p.fullName);
        setVal('my-info-disp-phone', p.contactNumber);
        setVal('my-info-disp-email', p.email);
        setVal('my-info-disp-emg-name', p.emergencyContactName);
        setVal('my-info-disp-emg-phone', p.emergencyContactNumber);

        // Saved timestamp display
        const dateEl = document.getElementById('my-info-disp-updated');
        if (dateEl) {
            if (p.savedAt) {
                const dateObj = new Date(p.savedAt);
                dateEl.innerText = 'Last updated: ' + dateObj.toLocaleDateString() + ' ' + dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            } else {
                dateEl.innerText = 'Stored locally on this device';
            }
        }

        // Show/hide Clear button based on whether data exists
        const clearBtn = document.getElementById('my-info-btn-clear');
        if (clearBtn) {
            clearBtn.style.display = hasData ? 'inline-flex' : 'none';
        }
    }

    /**
     * Populate the Edit/Form pane with current profile values
     */
    function renderEditPane() {
        const p = pendingProfileData || getProfile();

        const nameInput = document.getElementById('my-info-input-name');
        const phoneInput = document.getElementById('my-info-input-phone');
        const emailInput = document.getElementById('my-info-input-email');
        const emgNameInput = document.getElementById('my-info-input-emg-name');
        const emgPhoneInput = document.getElementById('my-info-input-emg-phone');

        if (nameInput) nameInput.value = p.fullName || '';
        if (phoneInput) phoneInput.value = p.contactNumber || '';
        if (emailInput) emailInput.value = p.email || '';
        if (emgNameInput) emgNameInput.value = p.emergencyContactName || '';
        if (emgPhoneInput) emgPhoneInput.value = p.emergencyContactNumber || '';

        // Clear error messages
        const errorEl = document.getElementById('my-info-edit-error');
        if (errorEl) {
            errorEl.style.display = 'none';
            errorEl.innerText = '';
        }
    }

    /**
     * Populate the Review pane before committing
     */
    function renderReviewPane() {
        const p = pendingProfileData || getProfile();

        const setVal = (id, val) => {
            const el = document.getElementById(id);
            if (!el) return;
            if (val && val.trim()) {
                el.innerText = val.trim();
                el.classList.remove('val-muted');
            } else {
                el.innerText = 'Not provided';
                el.classList.add('val-muted');
            }
        };

        setVal('my-info-rev-name', p.fullName);
        setVal('my-info-rev-phone', p.contactNumber);
        setVal('my-info-rev-email', p.email);
        setVal('my-info-rev-emg-name', p.emergencyContactName);
        setVal('my-info-rev-emg-phone', p.emergencyContactNumber);
    }

    /**
     * Step 1 from Edit: Validate and transition to Review pane
     */
    function proceedToReview() {
        const nameInput = document.getElementById('my-info-input-name');
        const phoneInput = document.getElementById('my-info-input-phone');
        const emailInput = document.getElementById('my-info-input-email');
        const emgNameInput = document.getElementById('my-info-input-emg-name');
        const emgPhoneInput = document.getElementById('my-info-input-emg-phone');
        const errorEl = document.getElementById('my-info-edit-error');

        const fullName = nameInput ? nameInput.value.trim() : '';
        const contactNumber = phoneInput ? phoneInput.value.trim() : '';
        const email = emailInput ? emailInput.value.trim() : '';
        const emergencyContactName = emgNameInput ? emgNameInput.value.trim() : '';
        const emergencyContactNumber = emgPhoneInput ? emgPhoneInput.value.trim() : '';

        // Validate Contact Number
        const phoneVal = validatePhone(contactNumber);
        if (!phoneVal.valid) {
            if (errorEl) {
                errorEl.style.display = 'block';
                errorEl.innerText = phoneVal.error;
            }
            if (phoneInput) phoneInput.focus();
            return;
        }

        // Validate Emergency Contact Number
        const emgPhoneVal = validatePhone(emergencyContactNumber);
        if (!emgPhoneVal.valid) {
            if (errorEl) {
                errorEl.style.display = 'block';
                errorEl.innerText = 'Emergency contact: ' + emgPhoneVal.error;
            }
            if (emgPhoneInput) emgPhoneInput.focus();
            return;
        }

        // Validate Email
        const emailVal = validateEmail(email);
        if (!emailVal.valid) {
            if (errorEl) {
                errorEl.style.display = 'block';
                errorEl.innerText = emailVal.error;
            }
            if (emailInput) emailInput.focus();
            return;
        }

        if (errorEl) {
            errorEl.style.display = 'none';
            errorEl.innerText = '';
        }

        pendingProfileData = {
            fullName,
            contactNumber,
            email,
            emergencyContactName,
            emergencyContactNumber
        };

        currentMode = 'review';
        render();
    }

    /**
     * Step 2 from Review: Confirm and save to local storage
     */
    function confirmAndSave() {
        if (!pendingProfileData) {
            pendingProfileData = getProfile();
        }

        const res = saveProfile(pendingProfileData);
        if (res.success) {
            pendingProfileData = null;
            currentMode = 'view';
            render();
            if (typeof global.showToast === 'function') {
                global.showToast('✅ My Information saved locally on this device');
            }
        } else {
            alert('Could not save information: ' + res.error);
        }
    }

    /**
     * Return back to Edit mode from Review
     */
    function backToEdit() {
        currentMode = 'edit';
        render();
    }

    /**
     * Switch directly to Edit mode
     */
    function startEditing() {
        pendingProfileData = getProfile();
        currentMode = 'edit';
        render();
    }

    /**
     * Cancel editing and return to view mode (or close if modal was empty)
     */
    function cancelEdit() {
        pendingProfileData = null;
        if (hasSavedData()) {
            currentMode = 'view';
            render();
        } else {
            closeModal();
        }
    }

    /**
     * Prompt user to confirm clearing all saved information
     */
    function confirmClear() {
        const confirmed = confirm(
            'Clear Saved Information?\n\n' +
            'This will delete your name, contact numbers, email, and emergency contact details stored in this browser.\n\n' +
            'You can re-enter this information anytime.'
        );

        if (!confirmed) return;

        clearProfile();
        pendingProfileData = null;
        currentMode = 'view';
        render();

        if (typeof global.showToast === 'function') {
            global.showToast('🗑️ Saved information cleared from this device');
        }
    }

    /**
     * Open the My Information Modal
     * Defaults to 'view' if data exists, otherwise 'edit' for direct entry.
     */
    function openModal(mode) {
        const modal = document.getElementById('my-information-modal');
        if (!modal) return;

        if (mode) {
            currentMode = mode;
        } else {
            currentMode = hasSavedData() ? 'view' : 'edit';
        }

        pendingProfileData = null;
        render();
        modal.style.display = 'flex';
    }

    /**
     * Close the My Information Modal
     */
    function closeModal() {
        const modal = document.getElementById('my-information-modal');
        if (modal) modal.style.display = 'none';
        pendingProfileData = null;
    }

    // Expose public API
    const GabayXMyInfo = {
        getProfile,
        saveProfile,
        clearProfile,
        hasSavedData,
        validatePhone,
        validateEmail,
        openModal,
        closeModal,
        startEditing,
        cancelEdit,
        proceedToReview,
        confirmAndSave,
        backToEdit,
        confirmClear
    };

    global.GabayXMyInfo = GabayXMyInfo;

    // Backward compatibility helper
    global.openProfileModal = function () {
        GabayXMyInfo.openModal();
    };
    global.closeProfileModal = function () {
        GabayXMyInfo.closeModal();
    };

})(typeof window !== 'undefined' ? window : this);
