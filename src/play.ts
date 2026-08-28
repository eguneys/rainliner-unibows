import { ArcadeCameraCruise } from "./arcade";
import { AudioPlayer } from "./audioplayer";
import { type Box, type Sign } from "./collision"
import { Keyboard } from "./keyboard";
import { Camera2D } from "./webgl/camera2d";
import { Color } from "./webgl/color";
import { LineBatch } from "./webgl/linebatch";
import type { WebGlRenderer } from "./webgl/renderer";

export const Colors = {
    dark_green: Color.hex(0x122020),
    dark_blue: Color.hex(0x143464),
    light_blue: Color.hex(0x249fde),
    dark_red: Color.hex(0x3b1725),
    light_red: Color.hex(0xb4202a),
    light_cyan: Color.hex(0xa6fcdb),
    dark_yellow: Color.hex(0xf9a31b),
    light_yellow: Color.hex(0xffd541),
}

export class Spring {
    position: number;
    velocity = 0;
    target: number;
    stiffness: number;
    damping: number;

    constructor(position: number, target = position, stiffness = 170, damping = 26) {
        this.position = position;
        this.target = target;
        this.stiffness = stiffness;
        this.damping = damping;
    }

    update(dt: number) {
        let dtSec = dt * 0.001
        const force = (this.target - this.position) * this.stiffness - this.velocity * this.damping;
        this.velocity += force * dtSec;
        this.position += this.velocity * dtSec;
    }
}

export function lerp(a: number, b: number, t: number) {
    return a + (b - a) * t
}



export class Camera {

    readonly _frustum: Box

    shake_spring_x = new Spring(0, 0, 700, 6)
    shake_spring_y = new Spring(0, 0, 500, 8)

    shake_cool = 500

    shake() {
        this.shake_spring_x.velocity -= this.shake_cool * 0.9
        this.shake_spring_y.velocity -= this.shake_cool * 1.3

        this.shake_cool -= 100
    }

    get frustum() {
        return { x: this.shake_spring_x.position + this._frustum.x, y: this.shake_spring_y.position + this._frustum.y, w: this._frustum.w, h: this._frustum.h }
    }

    constructor(readonly gameWidth: number, readonly gameHeight: number) {
        this._frustum = { x: 0, y: 0, w: gameWidth, h: gameHeight }
    }

    get left() {
        return this.frustum.x
    }

    get right() {
        return this.frustum.x + this.frustum.w
    }

    get top() {
        return this.frustum.y
    }

    get bottom() {
        return this.frustum.y + this.frustum.h
    }


    panCenter(x: number, y: number) {
        let targetX = x - this.gameWidth / 2
        let targetY = y - this.gameHeight / 2

        this._frustum.x = targetX
        this._frustum.y = targetY
    }


    lerpPanCenter(x: number, y: number) {
        let targetX = x - this.gameWidth / 2
        let targetY = y - this.gameHeight / 2

        this._frustum.x = this._frustum.x + (targetX - this._frustum.x) * 0.07
        this._frustum.y = this._frustum.y + (targetY - this._frustum.y) * 0.3
    }

    update(dt: number) {
        this.shake_spring_x.update(dt)
        this.shake_spring_y.update(dt)

        this.shake_cool = Math.min(500, this.shake_cool + dt * 0.18)
    }
}



export class CameraZones {

    static Deadzone: Box = { x: 290, y: -40, w: 120, h: 160 }

    arcade = ArcadeCameraCruise.create()

    followDeadzone(target_x: number, target_y: number) {
        let camera_x = this.arcade.body.x
        let camera_y = this.arcade.body.y
        let deadzone = CameraZones.Deadzone

        let deadzone_req_h: Sign = 0
        let deadzone_req_v: Sign = 0

        if (camera_x < target_x + deadzone.x) {
            deadzone_req_h = 1
        } else if (camera_x > target_x + deadzone.x + deadzone.w) {
            deadzone_req_h = -1
        }

        if (camera_y < target_y + deadzone.y) {
            deadzone_req_v = 1
        } else if (camera_y > target_y + deadzone.y + deadzone.h) {
            deadzone_req_v = -1
        }

        if (target_y + deadzone.y > 300) {
            deadzone_req_v = 0
        }

        this.arcade.deadzones = {
            horizontal: deadzone_req_h as Sign,
            vertical: deadzone_req_v
        }
    }

    update(dt: number) {
        this.arcade.update(dt)
    }
}

class Game {

    show_end_menu = false
    enable_reset = 0

    camera: Camera
    cameraZones: CameraZones


    constructor() {
        this.camera = new Camera(640, 360)
        this.cameraZones = new CameraZones()

        this.camera.panCenter(
            this.cameraZones.arcade.body.x,
            this.cameraZones.arcade.body.y,
        )
    }

    update(dt: number) {
        this.cameraZones.followDeadzone(0, 0)

        this.cameraZones.update(dt)

        this.camera.lerpPanCenter(
            this.cameraZones.arcade.body.x,
            this.cameraZones.arcade.body.y,
        )


        this.camera.update(dt)
    }

}


let game: Game
export function _init() {
    game = new Game()
}


let t = 0
let first_update_called = false
let first_key_pressed = false
let first_audio_initialized = false
export function _update(dt: number) {
    t += dt;

    first_update_called = true

    if (keyboard.is_just_down('jump')) {
        first_key_pressed = true
    }

    if (first_key_pressed && !first_audio_initialized) {
        first_audio_initialized = true
        audio.playAudio('rainbow', true)
    }

    game.update(dt)

    keyboard.update()
    audio.update(dt)
}


export function _render() {
    if (!first_update_called) return

    cx.beginRender()

    // background
    lb.drawLine(0, 180, 640, 180, 640, Colors.dark_green)

    lb.drawLine(0, 0, 100, 100, 1, Colors.dark_red)
    lb.drawLine(100, 100, 200, 200, 1, Colors.light_cyan)
    lb.drawLine(204, 100, 200, 200, 2, Colors.light_yellow)

    lb.endDraw()

    cx.endRender()
}

let audio: AudioPlayerManager
export async function _load() {
    audio = await AudioPlayerManager.loadAudio()
}

let camera2d: Camera2D
let lb: LineBatch
let cx: WebGlRenderer
export function _set_ctx(ctx: WebGlRenderer) {
    camera2d = new Camera2D(640, 360)
    cx = ctx
    lb = new LineBatch(cx.gl, camera2d)
}

export function _set_viewport(_top: number, _left: number, width: number, height: number, _clientWidth: number, _clientHeight: number) {
    cx.setCanvasBounds(width, height)
}


let keyboard: Keyboard
export function _set_canvas(canvas: HTMLCanvasElement) {
    keyboard = Keyboard.bindTo(canvas)
    keyboard.add_keymapping('w', 'jump')
    keyboard.add_keymapping('a', 'jump')
    keyboard.add_keymapping('s', 'jump')
    keyboard.add_keymapping('d', 'jump')
    keyboard.add_keymapping('Space', 'jump')
    keyboard.add_keymapping('j', 'jump')
    keyboard.add_keymapping('k', 'jump')
    keyboard.add_keymapping('l', 'jump')
    keyboard.add_keymapping('i', 'jump')
    keyboard.add_keymapping('ArrowUp', 'jump')
    keyboard.add_keymapping('ArrowLeft', 'jump')
    keyboard.add_keymapping('ArrowRight', 'jump')
    keyboard.add_keymapping('ArrowDown', 'jump')
}

export type AudioPlayback = { stop: () => void, setVolume: (_: number) => void }

class AudioPlayerManager {
    static loadAudio = async () => {
        let res = new AudioPlayerManager()

        res.audio.set('jump', await AudioPlayer.init('AEgc', 270))
        res.audio.set('landed', await AudioPlayer.init('80', 330))
        res.audio.set('over', await AudioPlayer.init('0A3E8g0A2E7e0B3C6c1C0D6a0d1e2fefefa a a 0 0 ;', 130))
        return res
    }

    audio: Map<string, AudioPlayer> = new Map()

    looping: Map<string, AudioPlayback> = new Map()

    stopAudio(name: string) {
        this.looping.get(name)?.stop()
    }

    playAudio(name: string, loop: boolean = false) {
        if (loop) {
            for (let [key, l] of this.looping) {
                l.stop()
                this.looping.delete(key)
            }
            let pl = this.audio.get(name)!.play(loop)
            this.looping.set(name, pl)
        } else {
            let pl = this.audio.get(name)!.play(loop)
            pl.setVolume(0.5)
        }

        if (!loop) {
            this.quiet_cool = 200
        }
    }

    set_looping_quiet_down() {
        for (let pl of this.looping.values()) {
            pl.setVolume(0.1)
        }
    }

    set_looping_quiet_up() {
        for (let pl of this.looping.values()) {
            pl.setVolume(0.8)
        }
    }

    is_quiet = false
    quiet_cool = 0
    change_cool = 0
    update(dt: number) {

        if (this.quiet_cool > 0 && !this.is_quiet) {
            if (this.change_cool === 0) {
                this.is_quiet = true
                this.set_looping_quiet_down()
                this.change_cool = 300
            }
        }

        if (this.quiet_cool === 0 && this.is_quiet) {
            if (this.change_cool === 0) {
                this.is_quiet = false
                this.set_looping_quiet_up()
                this.change_cool = 300
            }
        }

        this.quiet_cool = Math.max(0, this.quiet_cool - dt)
        this.change_cool = Math.max(0, this.change_cool - dt)
    }

}

export function arr_shuffle<A>(array: Array<A>) {
    let currentIndex = array.length;

    // While there remain elements to shuffle...
    while (currentIndex != 0) {

        // Pick a remaining element...
        let randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;

        // And swap it with the current element.
        [array[currentIndex], array[randomIndex]] = [
            array[randomIndex], array[currentIndex]];
    }
    return array
}