// gazeEngine.js
// MediaPipe FaceMesh — calibration-based iris gaze detection + head pose + stability

import { ExpressionEngine } from './expressionEngine.js';

// Pin the same version for both JS (index.html) and WASM files so iris refinement works
const MEDIAPIPE_VERSION = '0.4.1633559619';

export class GazeEngine {
    constructor(videoElement, canvasElement, onMetricsUpdate) {
        this.videoElement  = videoElement;
        this.canvasElement = canvasElement;
        this.canvasCtx     = canvasElement.getContext('2d');
        this.onMetricsUpdate = onMetricsUpdate;

        this.faceMesh         = null;
        this.camera           = null;
        this.expressionEngine = new ExpressionEngine();

        this.isRunning = false;
        this._sending  = false;
        this.noseHistory = [];

        // ── Auto-calibration (deviation-based gaze) ──
        // Collect iris ratio samples while the user is (assumed to be) looking
        // at the camera, then track DEVIATION from that baseline.
        this.gazeCalibSamples  = [];
        this.gazeCalibration   = null;       // set after CALIB_FRAMES samples
        this.CALIB_FRAMES      = 45;         // ~1.5s at 30fps
        this.calibrationDone   = false;
        this.onCalibrated      = null;       // optional callback
    }

    // ─────────────────────────────────────────────
    //  Init
    // ─────────────────────────────────────────────
    async init() {
        await this._waitForMediaPipe(30000);

        this.faceMesh = new window.FaceMesh({
            // locateFile MUST match the JS version loaded in index.html
            locateFile: (file) =>
                `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@${MEDIAPIPE_VERSION}/${file}`
        });

        this.faceMesh.setOptions({
            maxNumFaces: 1,
            refineLandmarks: true,      // REQUIRED for iris landmarks 468-477
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
                    reject(new Error('MediaPipe CDN scripts timed out. Check network.'));
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

    /** Reset calibration (called when starting a new session) */
    resetCalibration() {
        this.gazeCalibSamples = [];
        this.gazeCalibration  = null;
        this.calibrationDone  = false;
    }

    // ─────────────────────────────────────────────
    //  Per-frame result handler
    // ─────────────────────────────────────────────
    onResults(results) {
        if (!this.videoElement.videoWidth) return;

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
    //  Canvas overlay — iris dots
    // ─────────────────────────────────────────────
    _drawOverlay(lm, eyeScore) {
        const w   = this.canvasElement.width;
        const h   = this.canvasElement.height;
        const ctx = this.canvasCtx;

        const color = eyeScore > 72 ? '#4ade80'
                    : eyeScore > 42 ? '#facc15'
                    : '#ef4444';

        // Determine iris/eye-centre positions to draw
        // Prefer refinement landmark 468/473; fall back to eye-corner midpoint
        const leftPt  = lm[468] || this._eyeMidpoint(lm, 33,  133, 159, 145);
        const rightPt = lm[473] || this._eyeMidpoint(lm, 362, 263, 386, 374);

        [leftPt, rightPt].forEach(pt => {
            if (!pt) return;
            const cx = pt.x * w;
            const cy = pt.y * h;

            // White backing circle (ensures visibility on any skin tone)
            ctx.beginPath();
            ctx.arc(cx, cy, 10, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255,255,255,0.25)';
            ctx.fill();

            // Outer glow ring
            ctx.beginPath();
            ctx.arc(cx, cy, 9, 0, Math.PI * 2);
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.globalAlpha = 0.6;
            ctx.stroke();
            ctx.globalAlpha = 1;

            // Solid dot
            ctx.beginPath();
            ctx.arc(cx, cy, 5, 0, Math.PI * 2);
            ctx.fillStyle = color;
            ctx.fill();
        });

        // Show "CALIBRATING" text during warmup
        if (!this.calibrationDone) {
            const pct = Math.min(100, Math.round((this.gazeCalibSamples.length / this.CALIB_FRAMES) * 100));
            ctx.fillStyle = 'rgba(0,0,0,0.55)';
            ctx.fillRect(8, 8, 230, 34);
            ctx.fillStyle = '#facc15';
            ctx.font = 'bold 13px Inter, sans-serif';
            ctx.fillText(`👁 Calibrating eye tracking… ${pct}%`, 16, 30);
        }
    }

    /** Returns midpoint of eye corners as a fallback iris position */
    _eyeMidpoint(lm, outerIdx, innerIdx, topIdx, botIdx) {
        const o = lm[outerIdx], i = lm[innerIdx], t = lm[topIdx], b = lm[botIdx];
        if (!o || !i || !t || !b) return null;
        return {
            x: (o.x + i.x) / 2,
            y: (t.y + b.y) / 2
        };
    }

    // ─────────────────────────────────────────────
    //  Eye-contact — calibration-based iris gaze
    // ─────────────────────────────────────────────
    /**
     * Algorithm:
     *  1. Head pose gate   — if head is turned >~25° clamp score to 0.
     *  2. Iris availability check — if iris refinement landmarks absent,
     *     fall back to head pose only (logged once as a warning).
     *  3. Auto-calibration — collect 45 frames of iris ratios while the
     *     user is assumed to be looking at the camera (app just started).
     *     The MEDIAN of those samples becomes the "looking at camera" baseline.
     *  4. Gaze scoring     — compute DEVIATION of current iris position from
     *     the calibrated baseline.  A Gaussian centred at 0 deviation gives
     *     a score of 1.0 when looking at the camera and drops sharply when
     *     the iris shifts away.  Geometric mean of horizontal and vertical
     *     ensures BOTH must be good for a high score.
     */
    calculateEyeContact(lm) {
        // ── 1. Head pose gate ─────────────────────────────────────────────
        const headScore = this._headPoseScore(lm);
        if (headScore < 18) return 0;

        // ── 2. Iris availability ──────────────────────────────────────────
        const leftIris  = lm[468];
        const rightIris = lm[473];

        if (!leftIris || !rightIris) {
            // Iris refinement landmarks unavailable (model version mismatch or no faces)
            if (!this._irisWarnSent) {
                console.warn(
                    `[GazeEngine] Iris landmarks unavailable (lm.length=${lm.length}). ` +
                    `Using head-pose fallback. Ensure face_mesh CDN version is pinned to ${MEDIAPIPE_VERSION}.`
                );
                this._irisWarnSent = true;
            }
            return Math.round(headScore);
        }

        // Eye corner / lid landmarks
        const lOuter = lm[33],  lInner = lm[133];
        const lTop   = lm[159], lBot   = lm[145];
        const rInner = lm[362], rOuter = lm[263];
        const rTop   = lm[386], rBot   = lm[374];

        if (!lOuter || !lInner || !lTop || !lBot ||
            !rInner || !rOuter || !rTop || !rBot) return Math.round(headScore);

        // Compute normalised iris ratios
        // Horizontal (0=outer corner, 1=inner corner)
        const lH = this._safeRatio(leftIris.x,  lOuter.x, lInner.x);
        const rH = this._safeRatio(rightIris.x, rInner.x, rOuter.x);
        // Vertical (0=upper lid, 1=lower lid)
        const lV = this._safeRatio(leftIris.y,  lTop.y,   lBot.y);
        const rV = this._safeRatio(rightIris.y, rTop.y,   rBot.y);

        // ── 3. Auto-calibration ───────────────────────────────────────────
        if (!this.gazeCalibration) {
            this.gazeCalibSamples.push({ lH, rH, lV, rV });

            if (this.gazeCalibSamples.length >= this.CALIB_FRAMES) {
                const med = arr => {
                    const s = [...arr].sort((a, b) => a - b);
                    return s[Math.floor(s.length / 2)];
                };
                this.gazeCalibration = {
                    lH: med(this.gazeCalibSamples.map(s => s.lH)),
                    rH: med(this.gazeCalibSamples.map(s => s.rH)),
                    lV: med(this.gazeCalibSamples.map(s => s.lV)),
                    rV: med(this.gazeCalibSamples.map(s => s.rV)),
                };
                this.calibrationDone = true;
                if (this.onCalibrated) this.onCalibrated(this.gazeCalibration);
                console.log('[GazeEngine] Calibration complete:', this.gazeCalibration);
            }
            // During calibration, return head pose so the metric isn't empty
            return Math.round(headScore);
        }

        // ── 4. Deviation-based gaze scoring ──────────────────────────────
        const cal = this.gazeCalibration;

        // Sigma 0.10 horizontal → any deviation > ~0.20 from baseline is poor
        // Sigma 0.11 vertical   → vertical gaze is slightly more tolerant
        const lHScore = this._gaussianScore(lH - cal.lH, 0, 0.10);
        const rHScore = this._gaussianScore(rH - cal.rH, 0, 0.10);
        const lVScore = this._gaussianScore(lV - cal.lV, 0, 0.11);
        const rVScore = this._gaussianScore(rV - cal.rV, 0, 0.11);

        const hScore = (lHScore + rHScore) / 2;
        const vScore = (lVScore + rVScore) / 2;

        // Geometric mean: BOTH horizontal AND vertical must be good
        const irisScore = Math.sqrt(hScore * vScore);

        // Blend: 85% iris (precise), 15% head pose (gross orientation)
        const final = irisScore * 0.85 + (headScore / 100) * 0.15;
        return Math.round(Math.min(100, Math.max(0, final * 100)));
    }

    // ─────────────────────────────────────────────
    //  Head pose (yaw + pitch) — used as gate
    // ─────────────────────────────────────────────
    _headPoseScore(lm) {
        const nose     = lm[1];
        const leftEar  = lm[234];
        const rightEar = lm[454];
        const leftEye  = lm[33];
        const rightEye = lm[263];
        const chin     = lm[152];
        const forehead = lm[10];

        if (!nose || !leftEar || !rightEar || !leftEye || !rightEye) return 50;

        // Yaw: nose should be centred between the ears
        const faceCenter = (leftEar.x + rightEar.x) / 2;
        const yawOffset  = Math.abs(nose.x - faceCenter);
        const yawScore   = yawOffset < 0.05
            ? 100
            : Math.max(0, 100 - (yawOffset - 0.05) * 1400);

        // Pitch: use Z-depth difference between forehead and chin.
        // MediaPipe z is relative depth; when head pitches DOWN:
        // forehead protrudes more → z decreases (more negative).
        // Difference (chin.z - forehead.z) shifts positive when pitching down.
        let pitchScore = 80; // default if Z unavailable
        if (forehead && chin) {
            const zDiff = chin.z - forehead.z;
            // zDiff near 0 = head level; ±0.1 is moderate tilt; ±0.2 is strong tilt
            pitchScore = Math.max(0, 100 - Math.abs(zDiff) * 600);
        }

        return Math.min(100, yawScore * 0.65 + pitchScore * 0.35);
    }

    // ─────────────────────────────────────────────
    //  Math helpers
    // ─────────────────────────────────────────────
    _safeRatio(value, a, b) {
        const range = b - a;
        if (Math.abs(range) < 1e-6) return 0.5;
        return (value - a) / range;
    }

    _gaussianScore(x, center, sigma) {
        const d = x - center;
        return Math.exp(-(d * d) / (2 * sigma * sigma));
    }

    // ─────────────────────────────────────────────
    //  Posture stability (nose-tip jitter)
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
        return Math.min(100, Math.max(0, 100 - meanVariance * 0.5));
    }
}
