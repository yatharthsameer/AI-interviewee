/* 48-kHz Float32 → 16-kHz Int16 mono, 20-ms frames */

class DownsamplerProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.buf = [];
        this.TARGET = 320; // samples
    }
    process([input]) {
        if (!input || !input[0]) return true;
        const src = input[0];
        const out = new Int16Array(src.length / 3);
        for (let i = 0; i < out.length; ++i) {
            const v = src[i * 3];
            out[i] = v < 0 ? v * 0x8000 : v * 0x7FFF;
        }
        this.buf.push(...out);
        while (this.buf.length >= this.TARGET) {
            const frame = new Int16Array(this.buf.splice(0, this.TARGET));
            this.port.postMessage(frame.buffer, [frame.buffer]);
        }
        return true;
    }
}
registerProcessor("downsampler", DownsamplerProcessor); 