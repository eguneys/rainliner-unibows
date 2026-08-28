import { WasmCore } from './wasm/wasmcore'
import { WasmSynth } from './wasm/wasmsynth'

const durationSeconds = (bpm: number) => 60 / bpm / 4

export class AudioPlayer {
    static init = async (song: string, bpm = 90) => {

        let cx = new AudioContext()

        let core = await WasmCore.init(cx.sampleRate)
        let synth = new WasmSynth(core, cx.sampleRate)

        let buffer = synth.createAudioBuffer(cx, song, durationSeconds(bpm))

        return new AudioPlayer(cx, buffer)
    }

    constructor(readonly cx: AudioContext, readonly buffer: AudioBuffer) { }

    play = (loop = false) => {
        const buffer = this.buffer

        let source = this.cx.createBufferSource(),
            gainNode = this.cx.createGain()

        source.buffer = buffer;
        source.connect(gainNode);
        gainNode.connect(this.cx.destination);

        source.loop = loop;
        gainNode.gain.value = 0.8;
        source.start();
        return {
            stop: () => {
                source.stop()
            },
            setVolume: (t: number) => {
                gainNode.gain.linearRampToValueAtTime(t, this.cx.currentTime + 0.6)
            }
        }
    };
}