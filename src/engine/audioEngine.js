// audioEngine.js
// Handles Web Audio API to calculate vocal volume/energy

export class AudioEngine {
    constructor() {
        this.audioContext = null;
        this.analyser = null;
        this.microphone = null;
        this.javascriptNode = null;
        
        this.isRecording = false;
        this.onVolumeUpdateCallback = null;
    }

    async init(stream) {
        if (!stream) {
            console.error("Audio stream required for AudioEngine");
            return;
        }

        const AudioContext = window.AudioContext || window.webkitAudioContext;
        this.audioContext = new AudioContext();
        
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.smoothingTimeConstant = 0.8;
        this.analyser.fftSize = 1024;

        this.microphone = this.audioContext.createMediaStreamSource(stream);
        this.microphone.connect(this.analyser);
        
        // Use ScriptProcessorNode (deprecated but still widely supported for simple volume, or we can use requestAnimationFrame)
        // Better to just poll in a loop than use ScriptProcessorNode
    }

    start() {
        if (!this.audioContext) return;
        this.isRecording = true;
        this.audioContext.resume();
        this.pollVolume();
    }

    stop() {
        this.isRecording = false;
        if (this.audioContext && this.audioContext.state === 'running') {
            this.audioContext.suspend();
        }
    }

    pollVolume() {
        if (!this.isRecording || !this.analyser) return;

        const array = new Uint8Array(this.analyser.frequencyBinCount);
        this.analyser.getByteFrequencyData(array);
        
        let values = 0;
        const length = array.length;
        for (let i = 0; i < length; i++) {
            values += (array[i]);
        }
        
        const average = values / length;
        // Normalize roughly to 0-100. Typical speech average might peak around 60-80 depending on mic gain.
        const volumeScore = Math.min(100, Math.max(0, average * 2));
        
        if (this.onVolumeUpdateCallback) {
            this.onVolumeUpdateCallback(volumeScore);
        }

        requestAnimationFrame(this.pollVolume.bind(this));
    }

    onVolumeUpdate(callback) {
        this.onVolumeUpdateCallback = callback;
    }
}
