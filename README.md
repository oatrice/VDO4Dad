# Offline Video App

## Overview
The Offline Video App is designed to provide a curated selection of videos for offline viewing, specifically tailored for users with limited internet access. The application focuses on delivering content that is light-hearted and educational, ensuring a positive viewing experience.

## Features
- **Curated Video Content**: Enjoy a variety of videos including comedy shows, music, and educational content.
- **Offline Playback**: Videos can be accessed without an internet connection, making it ideal for users in areas with poor connectivity.
- **User-Friendly Interface**: Simple navigation to browse and play videos.

## Project Structure
```
offline-video-app
├── src
│   ├── index.html          # Main HTML document
│   ├── app.js              # JavaScript logic for video handling
│   ├── styles
│   │   └── main.css        # CSS styles for the application
│   ├── videos
│   │   └── README.md       # Information about video content
│   └── data
│       └── videos.json     # JSON file containing video data
├── package.json            # npm configuration file
└── README.md               # Project documentation
```

## Installation
1. Clone the repository to your local machine.
2. Navigate to the project directory.
3. Install the necessary dependencies using npm:
   ```
   npm install
   ```

## Running the Application
### On macOS
1. Open the terminal and navigate to the project directory.
2. Use a local server to serve the `src/index.html` file. You can use tools like `http-server` or `live-server`.
3. Open your web browser and go to `http://localhost:PORT` (replace PORT with the port number used by your server).

### On Windows
1. Open Command Prompt and navigate to the project directory.
2. Use a local server to serve the `src/index.html` file.
3. Open your web browser and go to `http://localhost:PORT`.

## Adding Videos
To add or manage videos, update the `src/data/videos.json` file with new video objects, ensuring they follow the specified format.

## License
This project is licensed under the MIT License. See the LICENSE file for more details.