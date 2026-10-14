#!/bin/sh
cd "$(dirname "$0")"
echo "DukaPOS running at http://localhost:8000  (Ctrl+C to stop)"
python3 -m http.server 8000
