// speechEngine.js
// Wraps Web Speech API for transcription and WPM calculation

export class SpeechEngine {
    constructor() {
        this.recognition = null;
        this.isRecording = false;
        this.startTime = 0;
        this.wordCount = 0;
        this.transcript = "";
        
        this.onResultCallback = null;
        this.onWpmUpdateCallback = null;
        
        this.wpmInterval = null;

        this.init();
    }

    init() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            console.error("Speech Recognition API not supported in this browser.");
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
                if (event.results[i].isFinal) {
                    finalTranscript += event.results[i][0].transcript;
                    // Count words in final chunk
                    const words = event.results[i][0].transcript.trim().split(/\s+/);
                    this.wordCount += words.length > 0 && words[0] !== "" ? words.length : 0;
                } else {
                    interimTranscript += event.results[i][0].transcript;
                }
            }
            
            this.transcript += finalTranscript;
            
            if (this.onResultCallback) {
                // Pass the full accumulated history plus whatever is currently being spoken
                this.onResultCallback(this.transcript + interimTranscript);
            }
        };

        this.recognition.onerror = (event) => {
            console.error("Speech Recognition Error:", event.error);
        };

        this.recognition.onend = () => {
            // Restart if we are supposed to be recording
            if (this.isRecording) {
                this.recognition.start();
            }
        };
    }

    start() {
        if (!this.recognition || this.isRecording) return;
        
        this.isRecording = true;
        this.startTime = Date.now();
        this.wordCount = 0;
        this.transcript = "";
        
        try {
            this.recognition.start();
        } catch (e) {
            console.warn("Recognition already started", e);
        }

        this.wpmInterval = setInterval(() => {
            this.calculateWpm();
        }, 1000);
    }

    stop() {
        if (!this.recognition || !this.isRecording) return;
        
        this.isRecording = false;
        clearInterval(this.wpmInterval);
        this.recognition.stop();
        
        return this.calculateWpm();
    }

    calculateWpm() {
        if (this.wordCount === 0) return 0;
        
        const elapsedMinutes = (Date.now() - this.startTime) / 60000;
        if (elapsedMinutes <= 0) return 0;
        
        const wpm = Math.round(this.wordCount / elapsedMinutes);
        
        if (this.onWpmUpdateCallback) {
            this.onWpmUpdateCallback(wpm);
        }
        
        return wpm;
    }

    onResult(callback) {
        this.onResultCallback = callback;
    }

    onWpmUpdate(callback) {
        this.onWpmUpdateCallback = callback;
    }
}
