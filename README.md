# GazeIQ

**GazeIQ** is a fully client-side, AI-powered public speaking coach that operates entirely in the browser. Using Vanilla JavaScript, MediaPipe, and the Web Speech API, it analyzes your performance without needing a backend.

## Features
- **Lens Eye Contact Tracking:** Detects if you are looking at the camera lens or reading notes.
- **Micro-Expression Analysis:** Real-time tracking of smile ratio and facial dynamics.
- **Speech Pace (WPM):** Live transcription and Words Per Minute calculation to check if you are speaking too fast.
- **Session Scorecard:** Post-session analytics correlating your speech pace with eye-contact drops.

## Setup & Running Locally
Since this is a Vanilla JS project, you don't need `npm install`.

1. Clone the repository.
2. Serve the root directory using any local static server. For example:
   - Using Python: `python -m http.server 8000`
   - Using Node: `npx serve .`
   - Using VSCode Live Server extension.
3. Open the local address in a Chromium-based browser (Chrome/Edge recommended for Web Speech API support).
4. Allow camera and microphone permissions.

## Architecture
- **No Bundler:** All files are pure ES6 modules.
- **MediaPipe:** Models for `FaceMesh` are loaded via CDN in `index.html`.
- **Chart.js:** Used for the post-session timeline graph.
