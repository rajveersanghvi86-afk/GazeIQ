// app.js
// Main Application Coordinator

import { GazeEngine }   from './engine/gazeEngine.js';
import { SpeechEngine } from './engine/speechEngine.js';
import { AudioEngine }  from './engine/audioEngine.js';
import { Dashboard }    from './ui/dashboard.js';
import { ReportView }   from './ui/reportView.js';

class App {
    constructor() {
        this.videoEl      = document.getElementById('input_video');
        this.canvasEl     = document.getElementById('output_canvas');
        this.vizCanvas    = document.getElementById('audio_visualizer');
        this.recIndicator = document.getElementById('rec_indicator');
        this.statusEl     = document.getElementById('status_overlay');

        this.gazeEngine   = null;
        this.speechEngine = null;
        this.audioEngine  = null;

        this.dashboard  = null;
        this.reportView = null;

        this.isRecording     = false;
        this.sessionTimeline = [];
        this.sessionTimer    = null;

        this.currentMetrics = { eyeContact: 0, smileRatio: 0, browTension: 0, postureStability: 100 };
        this.currentWpm     = 0;
        this.currentVolume  = 0;
        this.totalFillers   = 0;

        // Set up lazily on first session start
        this.audioStream     = null;
        this.mediaRecorder   = null;
        this.recordedChunks  = [];
        this.videoUrl        = null;
        this.recordingStartMs = 0;    // for fix-webm-duration
    }

    _setStatus(msg, isError = false) {
        this.statusEl.classList.remove('hidden');
        this.statusEl.style.opacity = '1';
        this.statusEl.innerHTML = isError
            ? `<span style="color:#ef4444;text-align:center;padding:1rem">${msg}</span>`
            : `<span>${msg}</span>`;
    }

    _hideStatus() {
        this.statusEl.style.opacity = '0';
        setTimeout(() => this.statusEl.classList.add('hidden'), 350);
    }

    async init() {
        this.dashboard  = new Dashboard();
        this.reportView = new ReportView();

        this.dashboard.onStart(() => this.startSession());
        this.dashboard.onStop(()  => this.stopSession());

        this.reportView.onNewSession(() => {
            this.dashboard.setRecordingState(false);
            this.dashboard.updateTranscript('Ready for a new session.');
            this.dashboard.updateMetrics({ eyeContact: 0, smileRatio: 0, postureStability: 100 });
            this.dashboard.updateWpm(0);
            this.dashboard.updateVolume(0);
            this.dashboard.updateFillers(0);
            this.recIndicator.classList.add('hidden');
            this.videoUrl        = null;
            this.recordedChunks  = [];
            this.audioStream     = null;
            this.mediaRecorder   = null;
            if (this.gazeEngine) this.gazeEngine.resetCalibration();
        });

        // Step 1: Init speech engine (no permissions needed)
        this._setStatus('Initialising speech engine…');
        this.speechEngine = new SpeechEngine();
        this.speechEngine.onResult((html) => {
            if (this.isRecording) this.dashboard.updateTranscript(html);
        });
        this.speechEngine.onWpmUpdate((wpm) => {
            this.currentWpm = wpm;
            if (this.isRecording) this.dashboard.updateWpm(wpm);
        });
        this.speechEngine.onFillerUpdate((count) => {
            this.totalFillers = count;
            if (this.isRecording) this.dashboard.updateFillers(count);
        });

        // Step 2: Init GazeEngine (camera only — no mic yet)
        this._setStatus('Loading face tracking model…');
        try {
            this.gazeEngine = new GazeEngine(this.videoEl, this.canvasEl, (metrics) => {
                this.currentMetrics = metrics;
                if (this.isRecording) this.dashboard.updateMetrics(metrics);
            });
            await this.gazeEngine.init();
            this.gazeEngine.start();
            this._setStatus('Ready! Click ▶ Start Pitch');
            setTimeout(() => this._hideStatus(), 1800);
        } catch (e) {
            console.error('GazeEngine init failed:', e);
            this._setStatus(`Camera error: ${e.message}<br><small>Allow camera access and reload.</small>`, true);
        }
    }

    /**
     * Called lazily on first session start.
     * Requests mic permission + sets up AudioEngine + MediaRecorder.
     */
    async _initAudio() {
        if (this.audioStream) return; // Already done

        this._setStatus('Requesting microphone access…');
        this.audioStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });

        // Size visualiser canvas
        const rect = this.vizCanvas.getBoundingClientRect();
        this.vizCanvas.width  = rect.width  || 300;
        this.vizCanvas.height = rect.height || 44;

        this.audioEngine = new AudioEngine();
        await this.audioEngine.init(this.audioStream, this.vizCanvas);
        this.audioEngine.onVolumeUpdate((vol) => {
            this.currentVolume = vol;
            if (this.isRecording) this.dashboard.updateVolume(vol);
        });

        // Build combined stream for recording
        const canvasStream   = this.canvasEl.captureStream(30);
        const combinedStream = new MediaStream([
            ...canvasStream.getVideoTracks(),
            ...this.audioStream.getAudioTracks()
        ]);

        const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
            ? 'video/webm;codecs=vp9,opus'
            : 'video/webm';

        this.mediaRecorder = new MediaRecorder(combinedStream, { mimeType });
        this.mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) this.recordedChunks.push(e.data);
        };
        this.mediaRecorder.onstop = () => {
            const duration = Date.now() - this.recordingStartMs;
            const rawBlob  = new Blob(this.recordedChunks, { type: 'video/webm' });

            // Inject duration metadata so the video timeline is seekable
            if (typeof window.ysFixWebmDuration === 'function') {
                window.ysFixWebmDuration(rawBlob, duration, (fixedBlob) => {
                    this.videoUrl = URL.createObjectURL(fixedBlob);
                    this.showReport();
                });
            } else {
                // Fallback: no duration fix (timeline may be grey)
                this.videoUrl = URL.createObjectURL(rawBlob);
                this.showReport();
            }
        };
    }

    async startSession() {
        // Lazily request mic + build recorder on first use
        try {
            await this._initAudio();
        } catch (e) {
            console.error('Microphone access denied:', e);
            this._setStatus(
                `Mic access denied.<br><small>Allow microphone in your browser and click Start again.</small>`,
                true
            );
            // Revert button state
            this.dashboard.setRecordingState(false);
            return;
        }

        this._hideStatus();
        this.isRecording     = true;
        this.sessionTimeline = [];
        this.totalFillers    = 0;
        this.recordedChunks  = [];

        this.recIndicator.classList.remove('hidden');
        this.recordingStartMs = Date.now();

        this.speechEngine.start();
        this.audioEngine.start();
        this.mediaRecorder.start(1000);

        this.sessionTimer = setInterval(() => {
            this.sessionTimeline.push({
                eyeContact:       this.currentMetrics.eyeContact       || 0,
                smileRatio:       this.currentMetrics.smileRatio       || 0,
                postureStability: this.currentMetrics.postureStability || 100,
                volume:           this.currentVolume                   || 0,
                wpm:              this.currentWpm
            });
        }, 1000);
    }

    stopSession() {
        this.isRecording = false;
        clearInterval(this.sessionTimer);
        this.recIndicator.classList.add('hidden');

        this.speechEngine.stop();
        if (this.audioEngine)  this.audioEngine.stop();
        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            this.mediaRecorder.stop(); // triggers onstop → showReport()
        }
    }

    showReport() {
        if (this.sessionTimeline.length === 0) return;

        let sumEye = 0, sumWpm = 0, sumSmile = 0, sumStability = 0, sumVolume = 0;
        this.sessionTimeline.forEach(dp => {
            sumEye       += dp.eyeContact;
            sumWpm       += dp.wpm;
            sumSmile     += dp.smileRatio;
            sumStability += dp.postureStability;
            sumVolume    += dp.volume;
        });

        const n = this.sessionTimeline.length;

        this.reportView.show({
            avgEyeContact: sumEye       / n,
            avgWpm:        sumWpm       / n,
            avgSmile:      sumSmile     / n,
            avgStability:  sumStability / n,
            avgVolume:     sumVolume    / n,
            totalFillers:  this.totalFillers,
            timeline:      this.sessionTimeline,
            videoUrl:      this.videoUrl
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const app = new App();
    app.init();
});
