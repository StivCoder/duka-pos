# DukaPOS

Multi-page, offline-first retail POS for Kenyan dukas. Vanilla HTML/CSS/ES modules + IndexedDB. FastAPI backend comes in Phase 7.

## Run it
Just double-click `index.html` (or any file in `pages/`) in Chrome or Edge. No server needed. Pages load the pre-built `dist/app.js`, a classic-script bundle, because browsers block ES modules on `file://`.
Use one browser consistently: data is stored in that browser's IndexedDB. Chrome/Edge are recommended; Firefox may keep a separate database per file when opened from disk.
`start.bat` / `start.sh` (local server) still work if you prefer.

## Editing the code
The source in `js/` is ES modules. After changing any file in `js/`, run `npm i` once, then `npm run build` to regenerate `dist/app.js`.

## Signing in
On first run `login.html` asks you to create the administrator (name + 4-6 digit PIN). Admins add supervisors and cashiers under Users. Roles and permissions live in `js/core/session.js`. This is a LOCAL PROTOTYPE: PINs are stored (salted, hashed) in the browser, which is not real security. The FastAPI backend must authenticate and authorise every request (Phase 7).

## Backup and import
Settings -> Download backup saves every store as JSON; Restore from backup replaces ALL data (it downloads a safety copy first, validates the file, and swaps in one transaction). Products -> Import CSV takes columns name, price, cost (required) and sku, barcode, unit, category, stock, reorder; bad rows are listed and skipped. Backups contain salted PIN hashes, so keep them private.

## Architecture
- `pages/*.html`: one real HTML page per screen, each with `data-page` and the shared `dist/app.js` bundle.
- `js/boot.js` -> `js/core/shell.js`: draws the shared sidebar, top bar, footer and online/sync status, then loads `js/modules/<page>.js`.
- `js/modules/`: one independent module per feature. `calc.js` and `summary.js` hold pure business logic.
- `js/core/db.js`: IndexedDB wrapper. Checkout and stock adjustments are single all-or-nothing transactions.
- `js/services/`: settings and demo seed data (future API adapters go here). `css/tokens.css`: palette.
- Money is stored as integer cents. Dates use Africa/Nairobi.

## Tests
`npm i` then `npm test` (logic). Browser test (needs `pip install playwright`): `MODE=file python3 tests/e2e_smoke.py` opens the pages straight from disk.
