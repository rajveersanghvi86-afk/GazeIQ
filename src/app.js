// app.js
// Main Application Coordinator

import { GazeEngine } from './engine/gazeEngine.js';
import { SpeechEngine } from './engine/speechEngine.js';
import { Dashboard } from './ui/dashboard.js';
import { ReportView } from './ui/reportView.js';

class App {
    constructor() {
        this.videoEl = document.getElementById('input_video');
        this.canvasEl = document.getElementById('output_canvas');
        
        this.gazeEngine = null;
        this.speechEngine = null;
        this.dashboard = null;
        this.reportView = null;
        
        // Session tracking
        this.isRecording = false;
        this.sessionTimeline = [];
        this.sessionTimer = null;
        this.currentMetrics = { eyeContact: 0, smileRatio: 0, browTension: 0 };
        this.currentWpm = 0;
    }

    async init() {
        this.dashboard = new Dashboard();
        this.reportView = new ReportView();
        
        this.dashboard.onStart(() => this.startSession());
        this.dashboard.onStop(() => this.stopSession());
        
        this.reportView.onNewSession(() => {
            // Reset for new session
            this.dashboard.setRecordingState(false);
            this.dashboard.updateTranscript("Ready for a new session.");
            this.dashboard.updateMetrics({ eyeContact: 0, smileRatio: 0 });
            this.dashboard.updateWpm(0);
        });

        // Initialize engines
        try {
            this.gazeEngine = new GazeEngine(this.videoEl, this.canvasEl, (metrics) => {
                this.currentMetrics = metrics;
                if (this.isRecording) {
                    this.dashboard.updateMetrics(metrics);
                }
            });
            await this.gazeEngine.init();
            
            this.speechEngine = new SpeechEngine();
            this.speechEngine.onResult((text) => {
                if (this.isRecording) {
                    this.dashboard.updateTranscript(text);
                }
            });
            this.speechEngine.onWpmUpdate((wpm) => {
                this.currentWpm = wpm;
                if (this.isRecording) {
                    this.dashboard.updateWpm(wpm);
                }
            });
            
            // Start camera silently in background to warm up
            this.gazeEngine.start();
            document.getElementById('status_overlay').innerHTML = "<span>Ready! Click 'Start Pitch'</span>";
            
        } catch (e) {
            console.error("Initialization error:", e);
            document.getElementById('status_overlay').innerHTML = `<span style="color:red">Error: ${e.message}</span>`;
        }
    }

    startSession() {
        this.isRecording = true;
        this.sessionTimeline = [];
        this.speechEngine.start();
        
        // Record data point every second
        this.sessionTimer = setInterval(() => {
            this.sessionTimeline.push({
                eyeContact: this.currentMetrics.eyeContact,
                smileRatio: this.currentMetrics.smileRatio,
                wpm: this.currentWpm
            });
        }, 1000);
    }

    stopSession() {
        this.isRecording = false;
        clearInterval(this.sessionTimer);
        
        this.speechEngine.stop();
        
        // Compute averages
        if (this.sessionTimeline.length === 0) return;
        
        let sumEye = 0, sumWpm = 0, sumSmile = 0;
        this.sessionTimeline.forEach(dp => {
            sumEye += dp.eyeContact;
            sumWpm += dp.wpm;
            sumSmile += dp.smileRatio;
        });
        
        const avgEye = sumEye / this.sessionTimeline.length;
        const avgWpm = sumWpm / this.sessionTimeline.length;
        const avgSmile = sumSmile / this.sessionTimeline.length;
        
        // Show report
        this.reportView.show({
            avgEyeContact: avgEye,
            avgWpm: avgWpm,
            avgSmile: avgSmile,
            timeline: this.sessionTimeline
        });
    }
}

// Boot application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    const app = new App();
    app.init();
});
