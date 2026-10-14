# DukaPOS

DukaPOS is an online and offline point-of-sale system designed to help businesses manage day-to-day operations, including sales, inventory, transaction tracking, deliveries, and staff management.

## Features
- Sales and transaction management
- Inventory and stock tracking
- Staff and user management
- Delivery management
- Offline-first operation using IndexedDB
- Data backup and restoration
- CSV product import

## Technology Stack
- HTML5
- CSS3
- JavaScript ES modules
- IndexedDB
- esbuild
- FastAPI backend planned for a future phase

## Getting Started

Install Node.js, then run:

```bash
npm install
npm run build
```

Open `index.html` in Chrome or Edge, or use `start.bat`.

## Testing

Run automated tests with:

```bash
npm test
```

## Project Structure
- `pages/` - Application pages
- `js/core/` - Shared logic and database operations
- `js/modules/` - Feature modules
- `js/services/` - Supporting services
- `css/` - Styles and design tokens
- `tests/` - Automated tests

## Security Note

The current browser-based authentication is intended for a prototype. Production use requires robust server-side authentication, authorization, and data protection.

## Project Status

DukaPOS is under active development, with backend integration and further production features planned.
