// app.js
// Main Application Coordinator

import { GazeEngine } from './engine/gazeEngine.js';
import { SpeechEngine } from './engine/speechEngine.js';
import { AudioEngine } from './engine/audioEngine.js';
import { Dashboard } from './ui/dashboard.js';
import { ReportView } from './ui/reportView.js';

class App {
    constructor() {
        this.videoEl = document.getElementById('input_video');
        this.canvasEl = document.getElementById('output_canvas');
        
        this.gazeEngine = null;
        this.speechEngine = null;
        this.audioEngine = null;
        
        this.dashboard = null;
        this.reportView = null;
        
        // Session tracking
        this.isRecording = false;
        this.sessionTimeline = [];
        this.sessionTimer = null;
        
        this.currentMetrics = { eyeContact: 0, smileRatio: 0, browTension: 0, postureStability: 100 };
        this.currentWpm = 0;
        this.totalFillers = 0;
        
        this.mediaRecorder = null;
        this.recordedChunks = [];
        this.videoUrl = null;
    }

    async init() {
        this.dashboard = new Dashboard();
        this.reportView = new ReportView();
        
        this.dashboard.onStart(() => this.startSession());
        this.dashboard.onStop(() => this.stopSession());
        
        this.reportView.onNewSession(() => {
            this.dashboard.setRecordingState(false);
            this.dashboard.updateTranscript("Ready for a new session.");
            this.dashboard.updateMetrics({ eyeContact: 0, smileRatio: 0, postureStability: 100 });
            this.dashboard.updateWpm(0);
            this.dashboard.updateVolume(0);
            this.dashboard.updateFillers(0);
            this.videoUrl = null;
            this.recordedChunks = [];
        });

        try {
            // Initialize SpeechEngine FIRST to ensure Web Speech API claims the mic before getUserMedia locks it
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
            this.speechEngine.onFillerUpdate((count) => {
                this.totalFillers = count;
                if (this.isRecording) {
                    this.dashboard.updateFillers(count);
                }
            });

            // Get microphone access independently of MediaPipe's video
            const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            
            this.audioEngine = new AudioEngine();
            await this.audioEngine.init(audioStream);
            this.audioEngine.onVolumeUpdate((vol) => {
                if (this.isRecording) this.dashboard.updateVolume(vol);
            });
            
            // Setup MediaRecorder using Canvas video + Microphone audio
            const canvasStream = this.canvasEl.captureStream(30);
            const combinedStream = new MediaStream([
                ...canvasStream.getVideoTracks(),
                ...audioStream.getAudioTracks()
            ]);
            
            this.mediaRecorder = new MediaRecorder(combinedStream, { mimeType: 'video/webm' });
            this.mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) this.recordedChunks.push(e.data);
            };
            this.mediaRecorder.onstop = () => {
                const blob = new Blob(this.recordedChunks, { type: 'video/webm' });
                this.videoUrl = URL.createObjectURL(blob);
                this.showReport(); // Show report after video is ready
            };

            // Initialize GazeEngine (handles its own camera stream)
            this.gazeEngine = new GazeEngine(this.videoEl, this.canvasEl, (metrics) => {
                this.currentMetrics = metrics;
                if (this.isRecording) {
                    this.dashboard.updateMetrics(metrics);
                }
            });
            await this.gazeEngine.init();
            
            // Start camera silently in background to warm up FaceMesh
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
        this.totalFillers = 0;
        this.recordedChunks = [];
        
        this.speechEngine.start();
        this.audioEngine.start();
        this.mediaRecorder.start(1000); // chunk every 1 second
        
        this.sessionTimer = setInterval(() => {
            this.sessionTimeline.push({
                eyeContact: this.currentMetrics.eyeContact || 0,
                smileRatio: this.currentMetrics.smileRatio || 0,
                postureStability: this.currentMetrics.postureStability || 100,
                wpm: this.currentWpm
            });
        }, 1000);
    }

    stopSession() {
        this.isRecording = false;
        clearInterval(this.sessionTimer);
        
        this.speechEngine.stop();
        this.audioEngine.stop();
        this.mediaRecorder.stop();
        // mediaRecorder.onstop will trigger showReport()
    }

    showReport() {
        if (this.sessionTimeline.length === 0) return;
        
        let sumEye = 0, sumWpm = 0, sumSmile = 0, sumStability = 0;
        this.sessionTimeline.forEach(dp => {
            sumEye += dp.eyeContact;
            sumWpm += dp.wpm;
            sumSmile += dp.smileRatio;
            sumStability += dp.postureStability;
        });
        
        const avgEye = sumEye / this.sessionTimeline.length;
        const avgWpm = sumWpm / this.sessionTimeline.length;
        const avgSmile = sumSmile / this.sessionTimeline.length;
        const avgStability = sumStability / this.sessionTimeline.length;
        
        this.reportView.show({
            avgEyeContact: avgEye,
            avgWpm: avgWpm,
            avgSmile: avgSmile,
            avgStability: avgStability,
            totalFillers: this.totalFillers,
            timeline: this.sessionTimeline,
            videoUrl: this.videoUrl
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const app = new App();
    app.init();
});
