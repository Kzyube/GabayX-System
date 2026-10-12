# GabayX System --- Local Repository Handoff

## 1. Purpose

This document explains the current local repository state and the next steps for continuing development of the GabayX React Native mobile app.

The project currently contains three main parts:
- **Node.js/Express backend** at the repository root.
- **Web PWA** under `public/`.
- **Standalone React Native app** under `mobile-app/`, built with Expo and TypeScript.

The mobile app is being developed alongside the existing PWA. Changes to the mobile app should not unintentionally break the PWA, backend, or admin dashboard.

---

## 2. Git and Branch Status

**Active branch reported:** `pwa`

**Latest reported commits:**
- `c33e6a2` --- `feat(mobile): integrate native campus map screen with react-native-maps`
- `3c96889` --- Milestone 3: Offline-First Report Storage with SQLite
- `f1f05a3` --- Milestone 2: Mobile App Scaffolding & Web Enhancements
- `6cb1b9f` and `37dbde7` --- PWA UX refinements

Native map integration has been reported as uncommitted/in progress. Before pushing, check the actual repository state with `git status` and inspect the diff. Do not assume the summary below is a substitute for checking the files.

**Suggested checks from the repository root:**
```bash
git branch --show-current
git status
git diff --stat
git diff
```

Only commit and push the changes intended for this branch. Do not include unrelated or accidental changes.

---

## 3. Current Mobile App Structure

The mobile project is in `mobile-app/` and uses Expo, React Native, and TypeScript.

**Key files and folders reported so far:**
```text
mobile-app/
├── App.tsx
├── app.json
├── package.json
├── package-lock.json
└── src/
    ├── components/
    │   ├── CreateReportModal.tsx
    │   ├── ReportDetailModal.tsx
    │   └── ReportStatusBadge.tsx
    ├── database/
    │   ├── index.ts
    │   ├── schema.ts
    │   └── reportRepository.ts
    └── screens/
        └── MapScreen.tsx
```

This is a summary of the reported structure, not an exhaustive file listing. Check the current directory before editing.

### Existing Report Storage

Milestone 3 introduced offline-first emergency report storage using SQLite. The reported implementation includes:
- A SQLite connection manager.
- Versioned schema migrations.
- Repository functions for report data.
- A report creation modal.
- A report detail modal.
- Status badges for `PENDING`, `SYNCED`, and `FAILED`.

The reported storage verification script passed 10 out of 10 scenarios. Run the tests again before making changes, and inspect the current implementation rather than relying only on this handoff.

**Important status rule:** A locally saved report must not be labelled `SYNCED` until the backend has acknowledged it. Do not add fake synchronization behavior or mock success responses.

### Native Map Work in Progress

The current work includes:
- `react-native-maps` version 1.27.2 added to `mobile-app/package.json`.
- The `react-native-maps` config plugin added to `mobile-app/app.json`.
- A `src/screens/MapScreen.tsx` screen with standard/satellite view controls, campus-center coordinates, and a recenter control.
- An `App.tsx` update with bottom navigation between Reports and Campus Map.

**The reported campus center is:**
- **Latitude:** `7.100589893149529`
- **Longitude:** `124.82393056927546`

Confirm these details in the actual source files before continuing. The map has not yet been confirmed as working on a physical device.

---

## 4. Existing PWA and Backend

Do not treat the React Native app as a replacement for the web application.

### Backend

The repository root contains `server.js`, an Express server. The project summary reports endpoints and functionality related to:
- Emergency incident reports.
- Admin authentication and incident management.
- Guest messaging.
- Nearby places and evacuation centers.
- Donations and relief vouchers.
- Hotline configuration.

Inspect `server.js` and the actual route handlers before relying on any endpoint. The mobile app should not assume an API contract without verifying its request format, response format, authentication requirements, and error behavior.

### Web PWA

The `public/` directory contains the existing web application, including:
- `student.html` --- student/citizen portal and Leaflet map.
- `admin.html` and `admin-login.html` --- admin interface.
- `donate.html` --- donation portal.
- `sw.js` --- service worker.
- `public/js/` --- client-side features, including offline maps and storage.

The existing PWA map uses Leaflet and has been reported to include:
- OpenStreetMap and ArcGIS World Imagery layer choices.
- Current-location display.
- Three designated safe zones.
- Nineteen campus building locations.
- Three pre-defined evacuation routes.
- Some offline geographic data and map-tile caching behavior.

These details should be verified in the PWA source before porting data to mobile. Preserve the original PWA implementation unless a change is explicitly agreed upon.

---

## 5. Immediate Next Steps

Continue in small steps. Do not start Bluetooth or backend synchronization while the native map foundation is still being validated.

### Step A --- Review the branch before pushing
1. Run `git status` from the repository root.
2. Inspect the full diff, including `App.tsx`, `MapScreen.tsx`, `app.json`, `package.json`, and `package-lock.json`.
3. Confirm that only intended mobile files changed.
4. Confirm that no PWA, backend, admin, credentials, or unrelated changes are included.
5. Run the validation commands listed below.
6. Commit and push only after reviewing the changes.

### Step B --- Validate the native map scaffold
The next development goal is to confirm that the map screen is integrated without breaking report storage.
1. Verify that `MapScreen.tsx` renders correctly.
2. Verify that switching between standard and satellite map types works.
3. Verify that the recenter control behaves as intended. If GPS tracking has not been implemented, do not present it as a working current-location feature.
4. Confirm whether the Android Google Maps provider requires an API key for the intended build.
5. Test using an appropriate Expo development build on a physical Android device. A successful TypeScript check does not prove that native map tiles render.
6. Document any missing API key, build setup, or provider configuration.

### Step C --- Implement current location
After the scaffold is validated:
1. Request location permission with a clear explanation.
2. Handle denied permissions and unavailable GPS.
3. Display the user's location when permission is granted.
4. Provide a recenter action.
5. Keep location and distance calculations independent of internet connectivity where possible.

Do not claim that GPS requires internet. However, location accuracy and availability depend on device conditions and hardware.

### Step D --- Add verified geographic data
1. Inspect the PWA's source of truth and port the real data into a dedicated mobile module, such as `src/constants/geoData.ts`, if that matches the current architecture.
2. The reported data includes three safe zones, nineteen campus buildings, and three evacuation routes. Verify the names, coordinates, route geometry, and verification status before using them.
3. Clearly identify authoritative or verified routes.
4. Do not invent route coordinates.
5. Render safe-zone/building markers and route polylines.
6. Add route visibility controls and useful details for selected locations.
7. Keep geographic data separate from the SQLite emergency-report database.

### Step E --- Implement and test offline map behavior
Offline functionality must be described precisely:
1. Locally stored geographic data and route coordinates can be made available offline.
2. GPS may work without cellular data or Wi-Fi.
3. Native map SDK caching is not guaranteed offline coverage.
4. Satellite imagery should not be promised offline unless a supported, lawful, and tested offline data strategy exists.
5. Provide a useful fallback map or campus layout when map tiles are unavailable.
6. Clearly distinguish showing a saved route from live turn-by-turn navigation or dynamic rerouting.

### Step F --- Continue with later milestones
Once the map and offline geographic data are stable, continue with the broader plan:
- Bluetooth communication between nearby devices.
- Store-and-forward relaying of reports.
- Backend synchronization with duplicate prevention and server acknowledgment.
- Integration with the existing admin dashboard.
- Physical-device testing for reliability, permissions, offline behavior, and recovery.

Confirm the detailed scope of each milestone with the team before implementing it.

---

## 6. Validation Commands

Run these from inside `mobile-app/` unless otherwise noted:
```bash
npx tsc --noEmit
npx expo config --type public
npx expo-doctor
```

Run the repository's available test scripts from the repository root, after checking that the paths still exist:
```bash
node scratch/verify-mobile-storage.js
node scratch/verify-guest-info.js
node scratch/verify-offline-maps.js
node scratch/verify-pwa-alert-messaging.js
```

A test passing once is not a guarantee that later changes preserve the same behavior. Re-run relevant tests after changes and report the actual results. If a script fails or is missing, report that accurately rather than claiming it passed.

---

## 7. Development Rules

- Keep mobile-only changes inside `mobile-app/` unless a shared change has been explicitly agreed upon.
- Do not rewrite the PWA or backend to make mobile implementation easier.
- Do not change the existing SQLite report schema casually; use migrations if a schema change is genuinely needed and coordinate it with the team.
- Do not mark reports as synchronized without server acknowledgment.
- Do not present unverified locations or routes as authoritative.
- Do not commit API keys, secrets, or private environment files.
- Check `git diff` and `git status` before every commit.
- Avoid broad refactors and unrelated dependency upgrades.
- Record assumptions, limitations, test results, and unfinished work in the handoff or commit description.

---

## 8. Definition of Done for the Next Map Step

Before moving to the next feature, confirm that:
- The app opens and the Reports screen still works.
- The native map screen opens without crashing.
- The initial map center is correct.
- Map type controls work where the configured provider supports them.
- Missing API-key or native-build requirements are documented.
- TypeScript and Expo checks pass.
- Offline report-storage tests still pass.
- No unrelated PWA, backend, or admin files were changed.
- Physical-device behavior is documented honestly, including anything not yet tested.

---

## 9. Current Limitations to Keep in Mind

Based on the current status report, the following should not yet be assumed complete:
- Verified native map rendering on a physical device.
- Current-location tracking on the native map.
- Porting and validating all safe zones, buildings, and evacuation routes.
- Guaranteed offline map imagery.
- Live route calculation or turn-by-turn navigation.
- Bluetooth transfer and multi-hop relaying.
- Mobile-to-backend report synchronization.
- End-to-end verification that mobile reports appear in the existing admin dashboard.

Use this document as a handoff and checklist. Verify the actual code and repository state before continuing.