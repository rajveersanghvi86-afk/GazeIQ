// speechEngine.js
// Wraps Web Speech API for transcription, WPM, and filler word detection

export class SpeechEngine {
    constructor() {
        this.recognition = null;
        this.isRecording = false;
        this.startTime = 0;
        this.wordCount = 0;
        this.transcript = '';
        this.fillerCount = 0;

        // Ordered longest-first so multi-word phrases are matched before sub-phrases
        this.fillerWords = ['you know', 'um', 'uh', 'like', 'basically', 'so'];

        this.onResultCallback = null;
        this.onWpmUpdateCallback = null;
        this.onFillerUpdateCallback = null;

        this.wpmInterval = null;

        this._init();
    }

    _init() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            console.error('Speech Recognition API not supported in this browser.');
            return;
        }

        this.recognition = new SpeechRecognition();
        this.recognition.continuous = true;
        this.recognition.interimResults = true;
        this.recognition.lang = 'en-US';

        this.recognition.onresult = (event) => {
            let interimTranscript = '';
            let finalTranscript = '';

            for (let i = event.resultIndex; i < event.results.length; ++i) {
                const chunk = event.results[i][0].transcript;
                if (event.results[i].isFinal) {
                    finalTranscript += chunk;

                    // Count words (excluding empty strings)
                    const words = chunk.trim().split(/\s+/);
                    if (words.length > 0 && words[0] !== '') {
                        this.wordCount += words.length;
                    }

                    // Count filler occurrences in the finalized chunk
                    const lowerChunk = chunk.toLowerCase();
                    this.fillerWords.forEach(filler => {
                        // Use word-boundary regex; wrap multi-word phrases in non-capture group
                        const escaped = filler.replace(/\s+/g, '\\s+');
                        const regex = new RegExp(`\\b(?:${escaped})\\b`, 'gi');
                        const matches = lowerChunk.match(regex);
                        if (matches) {
                            this.fillerCount += matches.length;
                        }
                    });
                } else {
                    interimTranscript += chunk;
                }
            }

            this.transcript += finalTranscript;

            if (finalTranscript.length > 0 && this.onFillerUpdateCallback) {
                this.onFillerUpdateCallback(this.fillerCount);
            }

            if (this.onResultCallback) {
                const fullText = this.transcript + interimTranscript;
                // Pass raw HTML — caller must use innerHTML to display
                this.onResultCallback(this._formatTranscript(fullText));
            }
        };

        this.recognition.onerror = (event) => {
            // Ignore no-speech errors, they're normal during pauses
            if (event.error !== 'no-speech') {
                console.error('Speech Recognition Error:', event.error);
            }
        };

        this.recognition.onend = () => {
            // Auto-restart while we're supposed to be recording
            if (this.isRecording) {
                try { this.recognition.start(); } catch (_) { /* already started */ }
            }
        };
    }

    start() {
        if (!this.recognition || this.isRecording) return;

        this.isRecording = true;
        this.startTime = Date.now();
        this.wordCount = 0;
        this.fillerCount = 0;
        this.transcript = '';

        try {
            this.recognition.start();
        } catch (e) {
            console.warn('Recognition already started', e);
        }

        this.wpmInterval = setInterval(() => this._calculateWpm(), 1000);
    }

    stop() {
        if (!this.recognition || !this.isRecording) return;

        this.isRecording = false;
        clearInterval(this.wpmInterval);
        this.recognition.stop();
        return this._calculateWpm();
    }

    _calculateWpm() {
        if (this.wordCount === 0) return 0;

        const elapsedMinutes = (Date.now() - this.startTime) / 60000;
        if (elapsedMinutes <= 0) return 0;

        const wpm = Math.round(this.wordCount / elapsedMinutes);
        if (this.onWpmUpdateCallback) this.onWpmUpdateCallback(wpm);
        return wpm;
    }

    /**
     * Wraps each filler word occurrence in a highlighted <span>.
     * Returns an HTML string — must be inserted with innerHTML.
     */
    _formatTranscript(text) {
        let formatted = text;
        // Process longest phrases first to avoid partial matches
        [...this.fillerWords].sort((a, b) => b.length - a.length).forEach(filler => {
            const escaped = filler.replace(/\s+/g, '\\s+');
            const regex = new RegExp(`\\b(${escaped})\\b`, 'gi');
            formatted = formatted.replace(
                regex,
                '<span class="filler-highlight">$1</span>'
            );
        });
        return formatted;
    }

    onResult(callback)       { this.onResultCallback = callback; }
    onWpmUpdate(callback)    { this.onWpmUpdateCallback = callback; }
    onFillerUpdate(callback) { this.onFillerUpdateCallback = callback; }
}
