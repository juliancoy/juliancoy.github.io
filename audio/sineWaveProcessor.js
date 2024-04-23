// sineWaveProcessor.js
class SineWaveProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.buffer = null;
        this.port.onmessage = (event) => {
            this.buffer = new Float32Array(event.data);
        };
    }

    process(inputs, outputs) {
        const output = outputs[0];
        output.forEach(channel => {
            for (let i = 0; i < channel.length; i++) {
                channel[i] = this.buffer ? this.buffer[i] : 0;
            }
        });
        return true;
    }
}

registerProcessor('sine-wave-processor', SineWaveProcessor);
