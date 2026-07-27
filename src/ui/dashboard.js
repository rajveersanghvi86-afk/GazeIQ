// dashboard.js
// Handles the live recording session state and updates live feedback metrics

export class Dashboard {
    constructor() {
        this.btnStart = document.getElementById('btn_start_recording');
        this.btnStop = document.getElementById('btn_stop_recording');
        this.statusOverlay = document.getElementById('status_overlay');
        
        this.eyeFill = document.getElementById('eye_contact_fill');
        this.eyeVal = document.getElementById('eye_contact_val');
        
        this.smileFill = document.getElementById('smile_fill');
        this.smileVal = document.getElementById('smile_val');
        
        this.wpmVal = document.getElementById('wpm_val');
        this.transcriptBox = document.getElementById('live_transcript');
        
        this.onStartCallback = null;
        this.onStopCallback = null;

        this.initEventListeners();
    }

    initEventListeners() {
        this.btnStart.addEventListener('click', () => {
            this.setRecordingState(true);
            if (this.onStartCallback) this.onStartCallback();
        });

        this.btnStop.addEventListener('click', () => {
            this.setRecordingState(false);
            if (this.onStopCallback) this.onStopCallback();
        });
    }

    setRecordingState(isRecording) {
        if (isRecording) {
            this.btnStart.classList.add('hidden');
            this.btnStop.classList.remove('hidden');
            this.statusOverlay.style.opacity = '0';
            setTimeout(() => this.statusOverlay.classList.add('hidden'), 300);
            this.transcriptBox.textContent = "Recording started... start speaking.";
        } else {
            this.btnStart.classList.remove('hidden');
            this.btnStop.classList.add('hidden');
        }
    }

    updateMetrics(metrics) {
        // Eye contact
        const eyePercent = Math.round(metrics.eyeContact);
        this.eyeFill.style.width = `${eyePercent}%`;
        this.eyeVal.textContent = `${eyePercent}%`;
        
        // Color coding for eye contact
        if (eyePercent > 80) this.eyeFill.style.background = '#4ade80';
        else if (eyePercent > 50) this.eyeFill.style.background = '#facc15';
        else this.eyeFill.style.background = '#ef4444';

        // Smile
        const smilePercent = Math.round(metrics.smileRatio);
        this.smileFill.style.width = `${smilePercent}%`;
        this.smileVal.textContent = `${smilePercent}%`;
    }

    updateWpm(wpm) {
        this.wpmVal.textContent = Math.round(wpm);
        // Turn red if speaking too fast (e.g. > 160 WPM)
        if (wpm > 160) {
            this.wpmVal.style.color = '#ef4444';
        } else {
            this.wpmVal.style.color = 'var(--primary)';
        }
    }

    updateTranscript(text) {
        this.transcriptBox.textContent = text;
        // Auto-scroll to bottom
        this.transcriptBox.scrollTop = this.transcriptBox.scrollHeight;
    }

    onStart(callback) {
        this.onStartCallback = callback;
    }

    onStop(callback) {
        this.onStopCallback = callback;
    }
}
