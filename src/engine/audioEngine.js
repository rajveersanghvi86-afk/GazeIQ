// audioEngine.js
// Handles Web Audio API: real-time vocal volume + canvas visualizer bar

export class AudioEngine {
    constructor() {
        this.audioContext = null;
        this.analyser = null;
        this.microphone = null;

        this.isRecording = false;
        this.animFrameId = null;

        // Canvas visualizer
        this.vizCanvas = null;
        this.vizCtx = null;

        this.onVolumeUpdateCallback = null;
    }

    /**
     * @param {MediaStream} stream  - Audio-only MediaStream from getUserMedia
     * @param {HTMLCanvasElement} [vizCanvas] - Optional canvas for waveform visualizer
     */
    async init(stream, vizCanvas = null) {
        if (!stream) {
            console.error('AudioEngine: audio stream is required.');
            return;
        }

        const AudioContext = window.AudioContext || window.webkitAudioContext;
        this.audioContext = new AudioContext();

        // High-resolution analyser for frequency-domain volume
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.smoothingTimeConstant = 0.75;
        this.analyser.fftSize = 1024;

        this.microphone = this.audioContext.createMediaStreamSource(stream);
        this.microphone.connect(this.analyser);

        // Visualizer canvas setup
        if (vizCanvas) {
            this.vizCanvas = vizCanvas;
            this.vizCtx = vizCanvas.getContext('2d');
        }
    }

    start() {
        if (!this.audioContext) return;
        this.isRecording = true;
        this.audioContext.resume();
        this._poll();
    }

    stop() {
        this.isRecording = false;
        if (this.animFrameId) {
            cancelAnimationFrame(this.animFrameId);
            this.animFrameId = null;
        }
        if (this.audioContext && this.audioContext.state === 'running') {
            this.audioContext.suspend();
        }
        // Clear visualizer
        if (this.vizCtx && this.vizCanvas) {
            this.vizCtx.clearRect(0, 0, this.vizCanvas.width, this.vizCanvas.height);
        }
    }

    _poll() {
        if (!this.isRecording || !this.analyser) return;

        // --- Volume Score ---
        const freqData = new Uint8Array(this.analyser.frequencyBinCount);
        this.analyser.getByteFrequencyData(freqData);

        let sum = 0;
        for (let i = 0; i < freqData.length; i++) sum += freqData[i];
        const avg = sum / freqData.length;
        // Normalize to 0-100; typical speech peaks around 40-60 on average
        const volumeScore = Math.min(100, Math.max(0, avg * 2.2));

        if (this.onVolumeUpdateCallback) {
            this.onVolumeUpdateCallback(volumeScore);
        }

        // --- Canvas Visualizer ---
        if (this.vizCtx && this.vizCanvas) {
            this._drawVisualizer(freqData, volumeScore);
        }

        this.animFrameId = requestAnimationFrame(this._poll.bind(this));
    }

    /**
     * Draws a mirrored bar-graph frequency visualizer onto the canvas.
     */
    _drawVisualizer(freqData, volumeScore) {
        const canvas = this.vizCanvas;
        const ctx = this.vizCtx;
        const W = canvas.width;
        const H = canvas.height;

        ctx.clearRect(0, 0, W, H);

        // Pick colour based on volume level
        let barColor;
        if (volumeScore > 85) {
            barColor = '#ef4444'; // Too loud — red
        } else if (volumeScore < 8) {
            barColor = '#475569'; // Silent — dim
        } else {
            // Gradient from purple → cyan as volume rises
            const t = volumeScore / 85;
            barColor = this._lerpColor('#a855f7', '#22d3ee', t);
        }

        // Render a subset of frequency bins as vertical bars
        const barCount = Math.min(64, Math.floor(W / 4));
        const step = Math.floor(freqData.length / barCount);
        const barW = Math.floor(W / barCount) - 1;

        for (let i = 0; i < barCount; i++) {
            const value = freqData[i * step] / 255; // 0-1
            const barH = Math.max(2, value * H);

            // Draw bar from center vertically (mirrored)
            const x = i * (barW + 1);
            const y = (H - barH) / 2;

            ctx.fillStyle = barColor;
            ctx.globalAlpha = 0.8 + value * 0.2;
            ctx.beginPath();
            ctx.roundRect(x, y, barW, barH, 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    /** Linear interpolation between two hex colours */
    _lerpColor(hexA, hexB, t) {
        const parse = h => [
            parseInt(h.slice(1, 3), 16),
            parseInt(h.slice(3, 5), 16),
            parseInt(h.slice(5, 7), 16)
        ];
        const [r1, g1, b1] = parse(hexA);
        const [r2, g2, b2] = parse(hexB);
        const r = Math.round(r1 + (r2 - r1) * t);
        const g = Math.round(g1 + (g2 - g1) * t);
        const b = Math.round(b1 + (b2 - b1) * t);
        return `rgb(${r},${g},${b})`;
    }

    onVolumeUpdate(callback) {
        this.onVolumeUpdateCallback = callback;
    }
}
