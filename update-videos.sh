#!/bin/bash

# update-videos.sh
# This script scans the src/videos directory and updates src/data/videos.json
# Requires 'jq' to be installed (e.g., 'brew install jq' or 'sudo apt-get install jq')

if ! command -v jq &> /dev/null
then
    echo "'jq' could not be found. Please install it to continue."
    exit 1
fi

VIDEOS_DIR="src/videos"
JSON_FILE="src/data/videos.json"

# Find all video files, create a JSON object for each, and pipe them to jq to form an array
find "$VIDEOS_DIR" -type f \( -name "*.mp4" -o -name "*.webm" -o -name "*.ogg" \) |
jq -R -n '[inputs | . as $line | $line | ltrimstr("'$VIDEOS_DIR'/") | {title: (split(".")[0] | gsub("_"; " ")), description: "Awaiting description.", filePath: ("videos/" + .)}]' > "$JSON_FILE"

VIDEO_COUNT=$(jq 'length' "$JSON_FILE")
echo "✅ Successfully updated $JSON_FILE with $VIDEO_COUNT videos."