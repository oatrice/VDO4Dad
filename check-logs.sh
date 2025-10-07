#!/bin/bash

echo "=== Frontend Log (Last 30 lines) ==="
tail -30 logs/frontend.log 2>/dev/null || echo "No frontend.log found"

echo ""
echo "=== Server Log (Last 30 lines) ==="
tail -30 logs/server.log 2>/dev/null || echo "No server.log found"

echo ""
echo "=== Queue Data ==="
cat src/data/queue_data.json 2>/dev/null || echo "No queue_data.json found"
