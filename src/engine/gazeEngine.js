// gazeEngine.js
// Initializes MediaPipe FaceMesh to track eye contact

import { ExpressionEngine } from './expressionEngine.js';

export class GazeEngine {
    constructor(videoElement, canvasElement, onMetricsUpdate) {
        this.videoElement = videoElement;
        this.canvasElement = canvasElement;
        this.canvasCtx = canvasElement.getContext('2d');
        this.onMetricsUpdate = onMetricsUpdate;
        
        this.faceMesh = null;
        this.camera = null;
        this.expressionEngine = new ExpressionEngine();
        
        this.isRunning = false;
        this.noseHistory = [];
    }

    async init() {
        // Assume FaceMesh and Camera from CDN are available globally
        if (!window.FaceMesh || !window.Camera) {
            throw new Error("MediaPipe libraries not loaded.");
        }

        this.faceMesh = new window.FaceMesh({locateFile: (file) => {
            return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`;
        }});

        this.faceMesh.setOptions({
            maxNumFaces: 1,
            refineLandmarks: true, // Needed for irises
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5
        });

        this.faceMesh.onResults(this.onResults.bind(this));

        this.camera = new window.Camera(this.videoElement, {
            onFrame: async () => {
                if (this.isRunning) {
                    await this.faceMesh.send({image: this.videoElement});
                }
            },
            width: 640,
            height: 480
        });
    }

    start() {
        this.isRunning = true;
        this.camera.start();
    }

    stop() {
        this.isRunning = false;
        this.camera.stop();
        // Clear canvas
        this.canvasCtx.clearRect(0, 0, this.canvasElement.width, this.canvasElement.height);
    }

    onResults(results) {
        if (!this.videoElement.videoWidth || this.videoElement.videoWidth === 0) {
            return; // Skip frame if video metadata isn't fully loaded yet
        }

        // Only resize canvas if dimensions change to avoid freezing/clearing context
        if (this.canvasElement.width !== this.videoElement.videoWidth || this.canvasElement.height !== this.videoElement.videoHeight) {
            this.canvasElement.width = this.videoElement.videoWidth;
            this.canvasElement.height = this.videoElement.videoHeight;
        }
        
        this.canvasCtx.save();
        this.canvasCtx.clearRect(0, 0, this.canvasElement.width, this.canvasElement.height);
        
        // Draw the video frame to the canvas FIRST, so it is visible in the video download
        if (results.image) {
            this.canvasCtx.drawImage(results.image, 0, 0, this.canvasElement.width, this.canvasElement.height);
        }
        
        if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
            const landmarks = results.multiFaceLandmarks[0];
            
            // Draw eye tracking visualization (Optional)
            this.drawLandmarks(landmarks);
            
            // Calculate Eye Contact %
            const eyeContactScore = this.calculateEyeContact(landmarks);
            
            // Calculate Expressions
            const expressions = this.expressionEngine.analyze(landmarks);
            
            // Calculate Posture Stability (Head Jitter)
            const stabilityScore = this.calculateStability(landmarks[1]);
            
            if (this.onMetricsUpdate) {
                this.onMetricsUpdate({
                    eyeContact: eyeContactScore,
                    smileRatio: expressions.smileRatio,
                    browTension: expressions.browTension,
                    postureStability: stabilityScore
                });
            }
        } else {
            // No face detected
            if (this.onMetricsUpdate) {
                this.onMetricsUpdate({
                    eyeContact: 0,
                    smileRatio: 0,
                    browTension: 0
                });
            }
        }
        
        this.canvasCtx.restore();
    }

    drawLandmarks(landmarks) {
        // Draw just the irises for visual feedback
        this.canvasCtx.fillStyle = '#4ade80';
        
        // Left Iris (468) and Right Iris (473)
        const leftIris = landmarks[468];
        const rightIris = landmarks[473];
        
        if (leftIris && rightIris) {
            const w = this.canvasElement.width;
            const h = this.canvasElement.height;
            
            this.canvasCtx.beginPath();
            this.canvasCtx.arc(leftIris.x * w, leftIris.y * h, 3, 0, 2 * Math.PI);
            this.canvasCtx.fill();
            
            this.canvasCtx.beginPath();
            this.canvasCtx.arc(rightIris.x * w, rightIris.y * h, 3, 0, 2 * Math.PI);
            this.canvasCtx.fill();
        }
    }

    calculateEyeContact(landmarks) {
        // A very basic heuristic for eye contact:
        // Calculate the position of the iris relative to the eye bounding box.
        // If the face is turned away, or irises are at the edges, score drops.
        
        const noseTip = landmarks[1];
        const leftEar = landmarks[234];
        const rightEar = landmarks[454];
        
        if (!noseTip || !leftEar || !rightEar) return 0;
        
        // Calculate face yaw (horizontal turn)
        const faceCenter = (leftEar.x + rightEar.x) / 2;
        const yawOffset = Math.abs(noseTip.x - faceCenter);
        
        // Normalize yaw: If yawOffset is small (<0.06), face is looking forward.
        const yawScore = yawOffset < 0.06 ? 100 : Math.max(0, 100 - ((yawOffset - 0.06) * 1500)); 
        
        // Calculate pitch (vertical turn) based on nose tip vs eye level
        const eyeLevel = (landmarks[33].y + landmarks[263].y) / 2;
        const pitchOffset = Math.abs(noseTip.y - eyeLevel);
        
        // Normal pitchOffset is around 0.15 - 0.25 when looking at the camera
        const pitchScore = (pitchOffset > 0.1 && pitchOffset < 0.3) ? 100 : Math.max(0, 100 - Math.abs(pitchOffset - 0.2) * 1000);
        
        // Final score combines both
        const finalScore = Math.min(100, Math.max(0, (yawScore + pitchScore) / 2));
        return finalScore;
    }

    calculateStability(noseTip) {
        if (!noseTip) return 100;
        
        // Convert normalized coordinates to absolute pixels for more reliable variance
        const w = this.canvasElement.width || 640;
        const h = this.canvasElement.height || 480;
        this.noseHistory.push({ x: noseTip.x * w, y: noseTip.y * h, t: Date.now() });
        
        // Keep last 30 frames (roughly 1 second)
        if (this.noseHistory.length > 30) {
            this.noseHistory.shift();
        }
        
        if (this.noseHistory.length < 10) return 100; // Not enough data
        
        // Calculate standard deviation of position (jitter)
        let sumX = 0, sumY = 0;
        this.noseHistory.forEach(p => { sumX += p.x; sumY += p.y; });
        const avgX = sumX / this.noseHistory.length;
        const avgY = sumY / this.noseHistory.length;
        
        let variance = 0;
        this.noseHistory.forEach(p => {
            variance += Math.pow(p.x - avgX, 2) + Math.pow(p.y - avgY, 2);
        });
        
        const meanVariance = variance / this.noseHistory.length;
        
        // Typical pixel variance for a still head is < 10.
        // Moderate swaying is 50-100. High swaying > 200.
        const stability = Math.max(0, 100 - (meanVariance * 0.5));
        return Math.min(100, stability);
    }
}
