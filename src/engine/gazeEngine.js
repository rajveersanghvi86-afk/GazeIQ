// gazeEngine.js
// MediaPipe FaceMesh — iris-based gaze detection + head pose + posture stability

import { ExpressionEngine } from './expressionEngine.js';

export class GazeEngine {
    constructor(videoElement, canvasElement, onMetricsUpdate) {
        this.videoElement  = videoElement;
        this.canvasElement = canvasElement;
        this.canvasCtx     = canvasElement.getContext('2d');
        this.onMetricsUpdate = onMetricsUpdate;

        this.faceMesh        = null;
        this.camera          = null;
        this.expressionEngine = new ExpressionEngine();

        this.isRunning  = false;
        this._sending   = false;
        this.noseHistory = [];
    }

    // ─────────────────────────────────────────────
    //  Init
    // ─────────────────────────────────────────────
    async init() {
        await this._waitForMediaPipe(30000);

        this.faceMesh = new window.FaceMesh({
            locateFile: (file) =>
                `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
        });

        this.faceMesh.setOptions({
            maxNumFaces: 1,
            // refineLandmarks MUST be true to get iris landmarks (468–477)
            refineLandmarks: true,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5
        });

        this.faceMesh.onResults(this.onResults.bind(this));

        this.camera = new window.Camera(this.videoElement, {
            onFrame: async () => {
                if (this.isRunning && !this._sending) {
                    this._sending = true;
                    try {
                        await this.faceMesh.send({ image: this.videoElement });
                    } catch (err) {
                        console.warn('FaceMesh send error:', err);
                    } finally {
                        this._sending = false;
                    }
                }
            },
            width: 640,
            height: 480
        });
    }

    _waitForMediaPipe(timeoutMs = 30000) {
        return new Promise((resolve, reject) => {
            if (window.FaceMesh && window.Camera) { resolve(); return; }
            const start = Date.now();
            const id = setInterval(() => {
                if (window.FaceMesh && window.Camera) {
                    clearInterval(id); resolve();
                } else if (Date.now() - start > timeoutMs) {
                    clearInterval(id);
                    reject(new Error('MediaPipe CDN scripts failed to load. Check your network.'));
                }
            }, 200);
        });
    }

    start() { this.isRunning = true;  this.camera.start(); }
    stop()  {
        this.isRunning = false;
        this.camera.stop();
        this.canvasCtx.clearRect(0, 0, this.canvasElement.width, this.canvasElement.height);
    }

    // ─────────────────────────────────────────────
    //  Per-frame result handler
    // ─────────────────────────────────────────────
    onResults(results) {
        if (!this.videoElement.videoWidth) return;

        // Sync canvas size to video
        if (this.canvasElement.width  !== this.videoElement.videoWidth ||
            this.canvasElement.height !== this.videoElement.videoHeight) {
            this.canvasElement.width  = this.videoElement.videoWidth;
            this.canvasElement.height = this.videoElement.videoHeight;
        }

        this.canvasCtx.save();
        this.canvasCtx.clearRect(0, 0, this.canvasElement.width, this.canvasElement.height);

        if (results.image) {
            this.canvasCtx.drawImage(
                results.image, 0, 0,
                this.canvasElement.width, this.canvasElement.height
            );
        }

        if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
            const lm = results.multiFaceLandmarks[0];

            const eyeContactScore = this.calculateEyeContact(lm);
            const expressions     = this.expressionEngine.analyze(lm);
            const stabilityScore  = this.calculateStability(lm[1]);

            this._drawOverlay(lm, eyeContactScore);

            if (this.onMetricsUpdate) {
                this.onMetricsUpdate({
                    eyeContact:       eyeContactScore,
                    smileRatio:       expressions.smileRatio,
                    browTension:      expressions.browTension,
                    postureStability: stabilityScore
                });
            }
        } else {
            if (this.onMetricsUpdate) {
                this.onMetricsUpdate({ eyeContact: 0, smileRatio: 0, browTension: 0 });
            }
        }

        this.canvasCtx.restore();
    }

    // ─────────────────────────────────────────────
    //  Canvas overlay
    // ─────────────────────────────────────────────
    _drawOverlay(lm, eyeScore) {
        const w = this.canvasElement.width;
        const h = this.canvasElement.height;
        const ctx = this.canvasCtx;

        // Colour: green=good, yellow=partial, red=poor
        const dotColor = eyeScore > 75 ? '#4ade80'
                       : eyeScore > 45 ? '#facc15'
                       : '#ef4444';

        // Draw iris dots
        [468, 473].forEach(idx => {
            const pt = lm[idx];
            if (!pt) return;
            ctx.beginPath();
            ctx.arc(pt.x * w, pt.y * h, 4, 0, Math.PI * 2);
            ctx.fillStyle = dotColor;
            ctx.fill();
            // Glow ring
            ctx.beginPath();
            ctx.arc(pt.x * w, pt.y * h, 8, 0, Math.PI * 2);
            ctx.strokeStyle = dotColor;
            ctx.globalAlpha = 0.35;
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.globalAlpha = 1;
        });
    }

    // ─────────────────────────────────────────────
    //  Eye-contact score  (PRIMARY = iris gaze)
    // ─────────────────────────────────────────────
    /**
     * Two-stage model:
     *
     * 1. HEAD POSE GATE — if the head is turned >~25° the person
     *    is obviously not looking at the camera; clamp the score.
     *
     * 2. IRIS GAZE — measure horizontal & vertical iris position
     *    WITHIN the eye socket. A centred iris → looking at lens.
     *    An off-centre iris → looking away even with a forward head.
     *
     * MediaPipe landmark indices used:
     *   Left eye  — outer corner: 33, inner corner: 133
     *               upper lid: 159, lower lid: 145
     *               iris centre: 468
     *   Right eye — inner corner: 362, outer corner: 263
     *               upper lid: 386, lower lid: 374
     *               iris centre: 473
     */
    calculateEyeContact(lm) {
        // ── 1. HEAD POSE GATE ──────────────────────────────────────────
        const headPoseMax = this._headPoseScore(lm);
        // If head is strongly turned away, no iris check needed
        if (headPoseMax < 20) return 0;

        // ── 2. IRIS GAZE ───────────────────────────────────────────────
        const leftIris  = lm[468];
        const rightIris = lm[473];

        // Iris landmarks require refineLandmarks: true
        // If they're missing (e.g. old model), fall back to head pose only
        if (!leftIris || !rightIris) return headPoseMax;

        // Left eye socket corners & lids
        const lOuter = lm[33];   const lInner = lm[133];
        const lTop   = lm[159];  const lBot   = lm[145];

        // Right eye socket corners & lids
        const rInner = lm[362];  const rOuter = lm[263];
        const rTop   = lm[386];  const rBot   = lm[374];

        if (!lOuter || !lInner || !lTop || !lBot ||
            !rInner || !rOuter || !rTop || !rBot) return headPoseMax;

        // ── Horizontal ratio (0 = outer edge, 1 = inner edge) ──────────
        // Expect ~0.5 when looking straight at the camera.
        // The deadzone ±0.18 means the iris can wander a little and still score 100%.
        const lHRatio = this._safeRatio(leftIris.x,  lOuter.x, lInner.x);
        const rHRatio = this._safeRatio(rightIris.x, rInner.x, rOuter.x);

        const lHScore = this._gaussianScore(lHRatio, 0.50, 0.18);
        const rHScore = this._gaussianScore(rHRatio, 0.50, 0.18);
        const hScore  = (lHScore + rHScore) / 2;

        // ── Vertical ratio (0 = top lid, 1 = bottom lid) ──────────────
        // Looking at a laptop/monitor tends to position iris slightly above centre (~0.4).
        const lVRatio = this._safeRatio(leftIris.y,  lTop.y, lBot.y);
        const rVRatio = this._safeRatio(rightIris.y, rTop.y, rBot.y);

        // Target ~0.40 (slightly above mid because camera is usually at eye level or above)
        const lVScore = this._gaussianScore(lVRatio, 0.42, 0.22);
        const rVScore = this._gaussianScore(rVRatio, 0.42, 0.22);
        const vScore  = (lVScore + rVScore) / 2;

        // ── Combine: horizontal is the stronger cue ─────────────────────
        const irisGaze = hScore * 0.65 + vScore * 0.35;

        // ── Blend with head pose: iris is 80%, pose is 20% ─────────────
        // Head pose still matters to catch extreme turns iris alone might miss
        const blended = irisGaze * 0.80 + (headPoseMax / 100) * 0.20;

        return Math.round(Math.min(100, Math.max(0, blended * 100)));
    }

    /**
     * Returns a 0-100 score purely from head yaw & pitch.
     * Used as a gate and as a 20% blend contributor.
     */
    _headPoseScore(lm) {
        const nose    = lm[1];
        const leftEar = lm[234];
        const rightEar = lm[454];
        const leftEye  = lm[33];
        const rightEye = lm[263];

        if (!nose || !leftEar || !rightEar || !leftEye || !rightEye) return 50;

        // Yaw: nose should be centred between the ears
        const faceCenter = (leftEar.x + rightEar.x) / 2;
        const yawOffset  = Math.abs(nose.x - faceCenter);
        // Full score if offset < 0.05; rapidly drops after that
        const yawScore   = yawOffset < 0.05
            ? 100
            : Math.max(0, 100 - (yawOffset - 0.05) * 1400);

        // Pitch: nose-tip should be ~0.18 below eye level
        const eyeY       = (leftEye.y + rightEye.y) / 2;
        const pitchDelta = nose.y - eyeY;          // positive = nose below eyes (normal)
        // Good range: 0.12–0.30
        const pitchScore = (pitchDelta >= 0.10 && pitchDelta <= 0.32)
            ? 100
            : Math.max(0, 100 - Math.abs(pitchDelta - 0.21) * 900);

        return Math.min(100, (yawScore * 0.6 + pitchScore * 0.4));
    }

    /**
     * Safe ratio of `value` between `a` and `b`.
     * Returns 0.5 if the interval is degenerate.
     */
    _safeRatio(value, a, b) {
        const range = b - a;
        if (Math.abs(range) < 1e-6) return 0.5;
        return (value - a) / range;
    }

    /**
     * Gaussian-shaped score: 1.0 at `center`, falls off with `sigma`.
     * Returns a value in [0, 1].
     */
    _gaussianScore(x, center, sigma) {
        const d = x - center;
        return Math.exp(-(d * d) / (2 * sigma * sigma));
    }

    // ─────────────────────────────────────────────
    //  Posture stability (nose tip jitter)
    // ─────────────────────────────────────────────
    calculateStability(noseTip) {
        if (!noseTip) return 100;

        const w = this.canvasElement.width  || 640;
        const h = this.canvasElement.height || 480;
        this.noseHistory.push({ x: noseTip.x * w, y: noseTip.y * h });

        if (this.noseHistory.length > 30) this.noseHistory.shift();
        if (this.noseHistory.length < 10) return 100;

        let sumX = 0, sumY = 0;
        this.noseHistory.forEach(p => { sumX += p.x; sumY += p.y; });
        const avgX = sumX / this.noseHistory.length;
        const avgY = sumY / this.noseHistory.length;

        let variance = 0;
        this.noseHistory.forEach(p => {
            variance += (p.x - avgX) ** 2 + (p.y - avgY) ** 2;
        });

        const meanVariance = variance / this.noseHistory.length;
        // Still head ≈ variance < 10px²; moderate sway ≈ 50–100; high > 200
        return Math.min(100, Math.max(0, 100 - meanVariance * 0.5));
    }
}
