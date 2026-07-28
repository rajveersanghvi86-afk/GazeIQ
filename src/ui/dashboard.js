// dashboard.js
// Handles the live recording session state and updates live feedback metrics

export class Dashboard {
    constructor() {
        this.btnStart  = document.getElementById('btn_start_recording');
        this.btnStop   = document.getElementById('btn_stop_recording');
        this.statusOverlay = document.getElementById('status_overlay');

        // IDs must match index.html exactly
        this.eyeFill   = document.getElementById('eye_fill');
        this.eyeVal    = document.getElementById('eye_val');

        this.smileFill = document.getElementById('smile_fill');
        this.smileVal  = document.getElementById('smile_val');

        this.wpmVal       = document.getElementById('wpm_val');
        this.transcriptEl = document.getElementById('live_transcript');

        this.volumeFill  = document.getElementById('volume_fill');
        this.fillerVal   = document.getElementById('filler_val');
        this.postureFill = document.getElementById('posture_fill');

        this.onStartCallback = null;
        this.onStopCallback  = null;

        this._initEventListeners();
    }

    _initEventListeners() {
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
            this.transcriptEl.textContent = 'Recording started… start speaking.';
        } else {
            this.btnStart.classList.remove('hidden');
            this.btnStop.classList.add('hidden');
        }
    }

    updateMetrics(metrics) {
        // Eye contact
        const eyePct = Math.round(metrics.eyeContact || 0);
        this.eyeFill.style.width = `${eyePct}%`;
        this.eyeVal.textContent  = `${eyePct}%`;
        if (eyePct > 80)      this.eyeFill.style.background = '#4ade80';
        else if (eyePct > 50) this.eyeFill.style.background = '#facc15';
        else                  this.eyeFill.style.background = '#ef4444';

        // Positive expression (smile)
        const smilePct = Math.round(metrics.smileRatio || 0);
        this.smileFill.style.width = `${smilePct}%`;
        this.smileVal.textContent  = `${smilePct}%`;

        // Posture stability
        if (metrics.postureStability !== undefined) {
            const stabPct = Math.round(metrics.postureStability);
            this.postureFill.style.width = `${stabPct}%`;
            if (stabPct > 70)      this.postureFill.style.background = '#4ade80';
            else if (stabPct > 40) this.postureFill.style.background = '#facc15';
            else                   this.postureFill.style.background = '#ef4444';
        }
    }

    updateVolume(volumeScore) {
        const pct = Math.round(volumeScore);
        this.volumeFill.style.width = `${pct}%`;
        if (volumeScore > 85)     this.volumeFill.style.background = '#ef4444'; // Too loud
        else if (volumeScore < 8) this.volumeFill.style.background = '#475569'; // Silent
        else                      this.volumeFill.style.background = '#a855f7'; // Good
    }

    updateFillers(count) {
        this.fillerVal.textContent = count;
        this.fillerVal.style.color = count > 5 ? '#ef4444' : '#facc15';
    }

    updateWpm(wpm) {
        this.wpmVal.textContent = Math.round(wpm);
        this.wpmVal.style.color = wpm > 160 ? '#ef4444' : 'var(--primary)';
    }

    /**
     * Accepts an HTML string (from SpeechEngine._formatTranscript) and renders it
     * with innerHTML so filler-word <span> highlights are preserved.
     */
    updateTranscript(html) {
        this.transcriptEl.innerHTML = html;
        // Auto-scroll to bottom
        this.transcriptEl.scrollTop = this.transcriptEl.scrollHeight;
    }

    onStart(callback) { this.onStartCallback = callback; }
    onStop(callback)  { this.onStopCallback  = callback; }
}
