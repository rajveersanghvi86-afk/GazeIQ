// expressionEngine.js
// Analyzes facial landmarks from MediaPipe to determine smile ratio, eyebrow tension, etc.

export class ExpressionEngine {
    constructor() {
        this.smileRatio = 0;
        this.browTension = 0;
    }

    /**
     * Calculates micro-expressions from MediaPipe FaceMesh landmarks.
     * @param {Array} landmarks - 468/478 3D landmarks from FaceMesh
     * @returns {Object} Object containing calculated metrics
     */
    analyze(landmarks) {
        if (!landmarks || landmarks.length === 0) return { smileRatio: 0, browTension: 0 };

        // For FaceMesh:
        // Left mouth corner: 61, Right mouth corner: 291
        // Top lip: 13, Bottom lip: 14
        const leftMouth = landmarks[61];
        const rightMouth = landmarks[291];
        const topLip = landmarks[13];
        const bottomLip = landmarks[14];

        const leftEye = landmarks[33];
        const rightEye = landmarks[263];
        
        // Basic smile calculation: mouth width relative to distance between eyes
        const mouthWidth = this.distance(leftMouth, rightMouth);
        const eyeDist = this.distance(leftEye, rightEye);
        
        let smileScore = 0;
        if (eyeDist > 0) {
            const mouthRatio = mouthWidth / eyeDist;
            // Typical neutral ratio is around 0.6. A smile stretches it above 0.7
            smileScore = Math.min(100, Math.max(0, (mouthRatio - 0.65) * 300));
        }

        // Brow tension
        // Inner left brow: 55, Inner right brow: 285
        // Eye centers roughly: left 159, right 386
        const leftBrow = landmarks[55];
        const leftEye = landmarks[159];
        const rightBrow = landmarks[285];
        const rightEye = landmarks[386];

        const leftBrowDist = this.distance(leftBrow, leftEye);
        const rightBrowDist = this.distance(rightBrow, rightEye);
        const avgBrowDist = (leftBrowDist + rightBrowDist) / 2;

        // Smaller distance = higher tension (frowning/squinting)
        let tensionScore = Math.max(0, 100 - (avgBrowDist * 1500)); // Arbitrary scale for demo

        this.smileRatio = smileScore;
        this.browTension = tensionScore;

        return {
            smileRatio: this.smileRatio,
            browTension: this.browTension
        };
    }

    distance(p1, p2) {
        if (!p1 || !p2) return 0;
        return Math.sqrt(
            Math.pow(p1.x - p2.x, 2) +
            Math.pow(p1.y - p2.y, 2) +
            Math.pow(p1.z - p2.z, 2)
        );
    }
}
