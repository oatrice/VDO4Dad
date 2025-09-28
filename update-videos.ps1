# update-videos.ps1
# This script scans the src/videos directory for video files and updates src/data/videos.json

# Set the base path relative to the script's location
$basePath = Split-Path -Parent $MyInvocation.MyCommand.Path
$videosPath = Join-Path $basePath "src/videos"
$jsonPath = Join-Path $basePath "src/data/videos.json"

# Define supported video file extensions
$videoExtensions = @(".mp4", ".webm", ".ogg")

# Find all video files and create an array of video objects
$videoObjects = Get-ChildItem -Path $videosPath -Recurse | Where-Object { $videoExtensions -contains $_.Extension } | ForEach-Object {
    $fileNameWithoutExtension = $_.BaseName
    $title = ($fileNameWithoutExtension -replace '_', ' ').Split(' ') | ForEach-Object { $_.Substring(0, 1).ToUpper() + $_.Substring(1) } | Join-String -Separator ' '

    [PSCustomObject]@{
        title       = $title
        description = "Awaiting description."
        filePath    = "videos/$($_.Name)"
    }
}

# Convert the array to a JSON string with proper formatting and save it
$videoObjects | ConvertTo-Json -Depth 5 | Out-File -FilePath $jsonPath -Encoding utf8

Write-Host "✅ Successfully updated $($jsonPath) with $($videoObjects.Count) videos."