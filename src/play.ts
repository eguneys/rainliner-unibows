import { ArcadeBomber, ArcadeHoming, ArcadeLepricon, ArcadePlayer, epsilon, heading, leftward, PositionVelocity, side, Vec2, type ArcadePlayerTargets } from "./arcade";
import { AudioPlayer } from "./audioplayer";
import { box_area, box_contains, distance, type Box } from "./collision"
import { Keyboard } from "./keyboard";
import { Mouse } from "./mouse";
import { Camera2D } from "./webgl/camera2d";
import { Color } from "./webgl/color";
import { LineBatch } from "./webgl/linebatch";
import type { WebGlRenderer } from "./webgl/renderer";

export const Colors = {
    dark_green: Color.hex(0x122020),
    light_green: Color.hex(0x14a02e),
    dark_blue: Color.hex(0x143464),
    light_blue: Color.hex(0x249fde),
    dark_red: Color.hex(0x3b1725),
    light_red: Color.hex(0xb4202a),
    light_cyan: Color.hex(0xa6fcdb),
    dark_yellow: Color.hex(0xf9a31b),
    light_yellow: Color.hex(0xffd541),
    dark_brown: Color.hex(0x221c1a),
    light_purple: Color.hex(0xbc4a9b),
    dark_purple: Color.hex(0x403353),
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

class CursorParticles {
    particles: CursorParticle[] = []

    cool = 0

    push() {
        if (this.cool === 0) {
            this.cool = 60 + Math.random() * 100
            for (let i = 0; i < Math.sin(t * 0.01) * 4 + Math.random() * 2; i++) {
                this.particles.push(new CursorParticle(10 + Math.random() * 10, 1))
            }
        }
    }

    update(dt: number) {
        for (let p of this.particles) {
            p.update(dt)
        }

        this.particles = this.particles.filter(p => p.life > 0)
        this.cool = Math.max(0, this.cool - dt)
    }

}

class PatrolRegion {
    polygon: Polygon
    constructor(readonly box: Box) {
        this.polygon = Polygon.rect(box.x, box.y, box.x + box.w, box.y + box.h, 16)

        this.polygon.width = 1
        this.polygon.spacing = 32
        this.polygon.color = Colors.light_blue
    }
}

function syncArcadePolygon(body: PositionVelocity, polygon: Polygon) {
    if (body.velocity.length() > epsilon)
        polygon.theta = lerpAngle(polygon.theta, -Math.PI * 0.5 + side(body.velocity).angle(), 0.3)
    polygon.x = body.position.x
    polygon.y = body.position.y
}

function lerpAngle(a: number, b: number, t: number): number {
    let diff = (b - a) % (Math.PI * 2);
    diff = ((diff + Math.PI * 3) % (Math.PI * 2)) - Math.PI; // wrap to [-PI, PI]
    return a + diff * t;
}

class HomingBomb {

    polygon: Polygon
    arcade: ArcadeHoming

    life = 1800

    constructor(position: Vec2, readonly seek_target: PositionVelocity) {
        let a = Polygon.model([0, 10, 100, 0, 120, 50, 100, 100, 0, 90, -10, 50])
        a.x = 320
        a.y = 180
        a.scale = 0.2
        a.off_x = -50
        a.off_y = -50
        a.color = Colors.light_red


        this.polygon = a

        this.arcade = ArcadeHoming.create(position, this.seek_target)
    }

    update(dt: number) {

        if (this.life < 1700 && this.arcade.body.velocity.length() < 300) {
            game.bomber.explode(this)
        }

        this.life = Math.max(0, this.life - dt)
        this.arcade.update(dt)

        syncArcadePolygon(this.arcade.body, this.polygon)
    }
}

class Bomber {

    polygon: Polygon
    arcade: ArcadeBomber

    patrol_a = new Vec2(600, 370)
    patrol_b = new Vec2(600, 10)
    seek_target = new Vec2(this.patrol_a.x, this.patrol_a.y)

    cool = 0

    homings: HomingBomb[] = []

    constructor() {
        let a = Polygon.model([0, 10, 100, 0, 120, 50, 100, 100, 0, 90, -10, 50])
        a.x = 320
        a.y = 180
        a.scale = 0.2
        a.off_x = -50
        a.off_y = -50
        a.color = Colors.dark_red


        this.polygon = a

        this.arcade = ArcadeBomber.create(640, 360, this.seek_target)
    }

    explode(homing: HomingBomb) {
        this.homings.splice(this.homings.indexOf(homing), 1)
        game.explosions.push(homing.arcade.body.position)

        game.herd.setFlee(homing.arcade.body.position)
    }

    fire() {
        if (game.herd.unicorns.length > 0) {
            let visible = this.arcade.body.position.x < 630
            let facing_left = leftward(heading(this.arcade.body.velocity).angle())
            if (visible && facing_left) {
                this.cool = 5800
                this.homings.push(
                    new HomingBomb(
                        this.arcade.body.position.sub(heading(this.arcade.body.velocity)),
                        game.herd.unicorns[0].arcade.body)
                )
            }
        }
    }


    update(dt: number) {

        this.cool = Math.max(0, this.cool - dt)

        if (this.cool === 0) {
            this.fire()
        }

        this.arcade.update(dt)

        syncArcadePolygon(this.arcade.body, this.polygon)

        if (distance(this.arcade.body.position, this.patrol_a) < 60) {
            this.seek_target.x = this.patrol_b.x
            this.seek_target.y = this.patrol_b.y
        }
        if (distance(this.arcade.body.position, this.patrol_b) < 60) {
            this.seek_target.x = this.patrol_a.x
            this.seek_target.y = this.patrol_a.y
        }

        for (let homing of this.homings) {
            homing.update(dt)
        }
    }
}


class Plants {

    flowers: Vec2[] = []

    cool = 0

    push() {
        if (this.cool === 0) {
            if (this.flowers.length < 10)
                this.flowers.push(new Vec2(Math.random() * 640, Math.random() * 360))
            this.cool = 1000 + Math.random() * 2000
        }
    }

    update(dt: number) {
        this.cool = Math.max(0, this.cool - dt)
        this.push()
    }
}

type UnicornType = 'male' | 'female'

class Unicorn {
    polygon: Polygon
    arcade: ArcadePlayer
    targets: ArcadePlayerTargets

    constructor(readonly type: UnicornType, neighbors: PositionVelocity[]) {
        let a = Polygon.model([0, 10, 100, 0, 120, 50, 100, 100, 0, 90, -10, 50])
        a.x = 320
        a.y = 180
        a.scale = 0.2
        a.off_x = -50
        a.off_y = -50
        a.color = type === 'female' ? Colors.light_cyan : Colors.light_yellow


        this.polygon = a

        this.targets = {
            neighbors,
            contain_box: { x: 0, y: 0, w: 0, h: 0 },
            seek_target: Vec2.Zero,
            flee_target: Vec2.Zero,
        }

        this.arcade = ArcadePlayer.create(320, 180, this.targets)

        if (type === 'male') {
            this.arcade.setState('discover')
        }
    }

    update(dt: number) {
        this.arcade.update(dt)

        syncArcadePolygon(this.arcade.body, this.polygon)
    }
}

class UnicornHerd {
    unicorns: Unicorn[]

    neighbors: PositionVelocity[] = []

    food_seek_target = Vec2.Zero

    food_seek_cool = 0

    constructor() {
        this.unicorns = []
    }

    setFlee(target: Vec2) {
        for (let unicorn of this.unicorns) {
            if (distance(unicorn.arcade.body.position, target) < 200) {
                unicorn.targets.flee_target.x = target.x
                unicorn.targets.flee_target.y = target.y

                unicorn.arcade.setState('flee')
            }
        }
    }

    findMeeting(box: Box) {

        let ab = this.unicorns.filter(_ => box_contains(box, _.arcade.body.position))

        if (ab.length !== 2) return

        if (ab[0].arcade.state === 'eat') return

        if (ab[0].type === 'female' || ab[1].type === 'female') {

            ab[0].targets.contain_box.x = box.x
            ab[0].targets.contain_box.y = box.y
            ab[0].targets.contain_box.w = box.w
            ab[0].targets.contain_box.h = box.h

            ab[1].targets.contain_box.x = box.x
            ab[1].targets.contain_box.y = box.y
            ab[1].targets.contain_box.w = box.w
            ab[1].targets.contain_box.h = box.h

            ab[0].arcade.setState('meet')
            ab[1].arcade.setState('meet')

            ab[0].polygon.color = Colors.light_purple
            ab[1].polygon.color = Colors.dark_purple
        }

        for (let unicorn of this.unicorns) {
            if (ab.includes(unicorn)) continue
            unicorn.arcade.setState('meet-evade')
            unicorn.targets.contain_box.x = box.x
            unicorn.targets.contain_box.y = box.y
            unicorn.targets.contain_box.w = box.w
            unicorn.targets.contain_box.h = box.h
        }
    }

    push() {
        let type: UnicornType = this.unicorns.filter(_ => _.type === 'female').length === 2 ? 'male' : 'female'
        let unicorn = new Unicorn(type, this.neighbors)
        this.unicorns.push(unicorn)

        this.neighbors.length = 0
        for (let unicorn of this.unicorns) {
            if (unicorn.type === 'male')
                this.neighbors.push(unicorn.arcade.body)
        }

        this.neighbors.push(game.lepricon.arcade.body)
    }

    food_seek_j = 0
    update(dt: number) {

        if (this.food_seek_cool === 0) {
            this.food_seek_cool = 7000

            this.food_seek_target = game.plants.flowers[this.food_seek_j++ % game.plants.flowers.length]
            for (let unicorn of this.unicorns) {
                if (unicorn.arcade.state === 'eat')
                    unicorn.arcade.setState('discover')
            }
        } else {
            this.food_seek_cool = Math.max(0, this.food_seek_cool - dt)
        }

        let female = this.unicorns.find(_ => _.type === 'female')
        if (female) {
            for (let unicorn of this.unicorns) {
                if (unicorn.type === 'male') {
                    unicorn.targets.seek_target.x = female.arcade.body.position.x
                    unicorn.targets.seek_target.y = female.arcade.body.position.y
                }
            }

            female.targets.seek_target.x = this.food_seek_target.x
            female.targets.seek_target.y = this.food_seek_target.y
        }

        for (let unicorn of this.unicorns) {
            if (unicorn.arcade.state === 'discover') {
                if (distance(unicorn.arcade.body.position, this.food_seek_target) < 30) {
                    unicorn.arcade.setState('eat')
                }
            }

            if (unicorn.arcade.state === 'after-meet') {
                game.patrolRegion = undefined
                if (unicorn.type === 'male') {
                    unicorn.polygon.color = Colors.light_yellow
                } else {
                    unicorn.polygon.color = Colors.light_cyan
                }
            }
        }


        let ab = this.unicorns.filter(_ => _.arcade.state === 'after-meet')

        if (ab.length === 2) {
            ab[0].targets.flee_target.x = ab[1].arcade.body.position.x
            ab[0].targets.flee_target.y = ab[1].arcade.body.position.y

            ab[1].targets.flee_target.x = ab[0].arcade.body.position.x
            ab[1].targets.flee_target.y = ab[0].arcade.body.position.y
        }


        for (let unicorn of this.unicorns) {
            unicorn.update(dt)
        }
    }
}

class ImpactFlash {

    polygon: Polygon

    life = 350

    constructor(readonly position: Vec2, radius: number) {
        this.polygon = Polygon.circle(radius)
        this.polygon.x = position.x
        this.polygon.y = position.y
        this.polygon.color = Colors.light_cyan
        this.polygon.spacing = 7
        this.polygon.width = 3
    }

    update(dt: number) {
        this.life -= dt

        if (this.life > 90) {
            this.polygon.color = Color.lerp(this.polygon.color, Colors.light_red, 1 - this.life / 200)
            this.polygon.spacing = 30
        } else {
            this.polygon.color = Color.lerp(this.polygon.color, Colors.dark_brown, 1 - this.life / 120)
            this.polygon.spacing = 3 + (this.life / 30) * 7
        }
    }
}

class Explosions {
    impacts: ImpactFlash[]

    constructor() {
        this.impacts = []
    }

    push(position: Vec2) {
        this.impacts.push(new ImpactFlash(position, 37))
    }

    update(dt: number) {
        for (let impact of this.impacts) {
            impact.update(dt)
        }

        this.impacts = this.impacts.filter(_ => _.life > 0)
    }

}

class Lepricon {
    polygon: Polygon
    arcade: ArcadeLepricon

    constructor() {
        this.polygon = Polygon.circle(8, 3)
        this.polygon.color = Colors.dark_yellow

        this.arcade = ArcadeLepricon.create(200, 200)
    }

    update(dt: number) {

        this.arcade.buttons = {
            req_left: keyboard.getActionSign('left'),
            req_right: keyboard.getActionSign('right'),
            req_up: keyboard.getActionSign('up'),
            req_down: keyboard.getActionSign('down'),
        }


        this.arcade.update(dt)
        syncArcadePolygon(this.arcade.body, this.polygon)
    }
}

class Game {

    binaryScore: BinaryScore
    lepricon: Lepricon

    plants: Plants
    explosions: Explosions
    bomber: Bomber
    herd: UnicornHerd
    patrolRegion?: PatrolRegion

    show_end_menu = false
    enable_reset = 0

    camera: Camera

    cursor: Cursor
    cParticles: CursorParticles

    dragArea?: DrawArea

    constructor() {
        this.binaryScore = new BinaryScore()
        this.lepricon = new Lepricon()
        this.plants = new Plants()
        this.explosions = new Explosions()
        this.bomber = new Bomber()
        this.herd = new UnicornHerd()
        this.cParticles = new CursorParticles()
        this.cursor = new Cursor()
        this.camera = new Camera(640, 360)

        this.camera.panCenter(0, 0)
    }

    update(dt: number) {

        this.camera.lerpPanCenter(0, 0)


        this.camera.update(dt)

        this.binaryScore.update(dt)
        this.lepricon.update(dt)
        this.plants.update(dt)
        this.explosions.update(dt)
        this.bomber.update(dt)
        this.herd.update(dt)

        this.cursor.update(dt)
        this.cursor.x = mouse.is_hovering.x
        this.cursor.y = mouse.is_hovering.y

        if (this.cursor.is_hovering) {
            this.cParticles.push()
        }

        if (mouse.is_just_down) {
            this.dragArea = new DrawArea(this.cursor.x, this.cursor.y)
        }

        if (mouse.is_just_up) {

            if (this.dragArea) {
                this.patrolRegion = this.dragArea.patrolRegion


                if (this.patrolRegion)
                    this.herd.findMeeting(this.patrolRegion.box)
            }

            this.dragArea = undefined
        }

        if (this.dragArea) {
            this.dragArea.x2 = this.cursor.x
            this.dragArea.y2 = this.cursor.y
        }

        this.cParticles.update(dt)
    }

}


let game: Game
export function _init() {
    game = new Game()

    game.herd.push()
    game.herd.push()
    game.herd.push()
    game.herd.push()
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

    mouse.update()
    keyboard.update()
    audio.update(dt)
}

class Polygon {

    static Copy(a: Polygon) {
        let res = new Polygon(a.model_vertices)

        res.color = a.color
        res.dashed = a.dashed
        res.scale = a.scale
        res.theta = a.theta
        res.x = a.x
        res.y = a.y
        return res
    }

    static model(model: number[]) {
        let res = new Polygon(model)
        res.dashed = false
        return res
    }

    static triangle(size: number) {
        const vv: number[] = [];
        let angles = [-90, -210, -330]
        for (const angle of angles) {
            const radians = angle * Math.PI / 180
            vv.push(Math.cos(radians) * size / 2, Math.sin(radians) * size / 2);
        }
        let res = new Polygon(vv);
        res.dashed = false
        return res
    }

    static circle(radius: number, segments?: number) {
        const _segments = segments ?? Math.max(8, Math.round(2 * Math.PI * radius / 8));
        const res: number[] = [];
        for (let i = 0; i < _segments; i++) {
            const t = (i / _segments) * 2 * Math.PI;
            res.push(Math.cos(t) * radius, Math.sin(t) * radius);
        }
        return new Polygon(res);
    }


    static rect(minX: number, minY: number, maxX: number, maxY: number, step = 13) {
        const pts: number[] = [];

        const addEdge = (x0: number, y0: number, x1: number, y1: number) => {
            pts.push(x0, y0);
            const dir = (x0 === x1) ? Math.sign(y1 - y0) : Math.sign(x1 - x0);
            const lo = Math.min(x0 === x1 ? y0 : x0, x0 === x1 ? y1 : x1);
            const hi = Math.max(x0 === x1 ? y0 : x0, x0 === x1 ? y1 : x1);

            if (x0 === x1) { // vertical
                const first = dir > 0 ? Math.ceil(lo / step) * step : Math.floor(hi / step) * step;
                for (let y = first; dir > 0 ? y < hi : y > lo; y += dir * step) {
                    if (y !== y0) pts.push(x0, y);
                }
            } else { // horizontal
                const first = dir > 0 ? Math.ceil(lo / step) * step : Math.floor(hi / step) * step;
                for (let x = first; dir > 0 ? x < hi : x > lo; x += dir * step) {
                    if (x !== x0) pts.push(x, y0);
                }
            }
        };

        addEdge(minX, minY, maxX, minY); // top
        addEdge(maxX, minY, maxX, maxY); // right
        addEdge(maxX, maxY, minX, maxY); // bottom
        addEdge(minX, maxY, minX, minY); // left

        return new Polygon(pts);
    }


    off_x = 0
    off_y = 0
    x = 0
    y = 0
    theta = 0
    scale = 1

    width = 1.5
    color = Colors.light_yellow
    dashed = true

    cx: number
    cy: number
    result: number[]

    spacing = 1

    constructor(readonly model_vertices: number[]) {
        const n = this.model_vertices.length / 2;
        let cx = 0, cy = 0;
        for (let i = 0; i < n; i++) {
            cx += this.model_vertices[i * 2];
            cy += this.model_vertices[i * 2 + 1];
        }
        cx /= n; cy /= n;

        this.cx = cx
        this.cy = cy

        this.result = model_vertices.map(_ => 0)
    }

    get vertices() {
        const n = this.model_vertices.length / 2;
        const cos = Math.cos(this.theta);
        const sin = Math.sin(this.theta);

        for (let i = 0; i < n; i++) {
            const dx = (this.model_vertices[i * 2] - this.cx) * this.scale;
            const dy = (this.model_vertices[i * 2 + 1] - this.cy) * this.scale;

            this.result[i * 2] = this.off_x + this.x + this.cx + dx * cos - dy * sin
            this.result[i * 2 + 1] = this.off_y + this.y + this.cy + dx * sin + dy * cos
        }
        return this.result;
    }

    get ptVertices() {
        let res = []
        let vv = this.vertices
        for (let i = 0; i < vv.length; i += 2) {
            res[i / 2] = { x: vv[i], y: vv[i + 1] }
        }
        return res
    }

    get ptFillVertices() {
        return fillPolygon(this.ptVertices, 1, this.spacing)
    }
}


type Pt = { x: number; y: number };

export function rotate(p: Pt, angle: number): Pt {
    const c = Math.cos(angle), s = Math.sin(angle);
    return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
}

// x-intersections of a horizontal line y=scanY with all polygon edges
export function scanlineXs(verts: Pt[], scanY: number): number[] {
    const xs: number[] = [];
    for (let i = 0; i < verts.length; i++) {
        const a = verts[i], b = verts[(i + 1) % verts.length];
        if ((a.y <= scanY && b.y > scanY) || (b.y <= scanY && a.y > scanY)) {
            const t = (scanY - a.y) / (b.y - a.y);
            xs.push(a.x + t * (b.x - a.x));
        }
    }
    return xs.sort((a, b) => a - b);
}

const makeConstantRandom = () => {
    let res = []

    for (let i = 0; i < 1000; i++) {
        res[i] = (Math.PI * i) % 1
    }

    return (i: number) => {
        return res[Math.floor(i)]
    }
}

export const ConstantRandom = makeConstantRandom()

export function fillPolygon(verts: Pt[], angle: number, spacing: number) {
    const rotated = verts.map(v => rotate(v, -angle));
    const minY = Math.min(...rotated.map(v => v.y));
    const maxY = Math.max(...rotated.map(v => v.y));

    const gridOffset = minY - Math.floor(minY / spacing) * spacing;
    const scrollOffset = (t * 0.02) % spacing;
    const start = minY - gridOffset + scrollOffset;
    let res = []
    for (let y = start; y <= maxY; y += spacing) {
        const xs = scanlineXs(rotated, y);
        for (let i = 0; i + 1 < xs.length; i += 2) {
            const a = rotate({ x: xs[i], y }, angle);
            const b = rotate({ x: xs[i + 1], y }, angle);
            res.push(a, b)
        }
    }
    return res
}

class CursorParticle {

    constructor(radius: number, size: number) {
        this.size_spring = new Spring(size, size / 2)
        this.radius_spring = new Spring(radius / 2, radius)

    }

    get x() {
        return Math.sin(this.direction) * this.radius_spring.position
    }

    get y() {
        return Math.cos(this.direction) * this.radius_spring.position
    }

    get size() {
        return this.size_spring.position * (this.life / 500)
    }

    velocity = Math.random() * 5

    direction = Math.random() * Math.PI * 2
    life = 600 + Math.random() * 100
    size_spring: Spring
    radius_spring: Spring
    theta = 0

    update(dt: number) {
        this.velocity -= Math.random() * 3
        this.size_spring.update(dt)
        this.radius_spring.update(dt)
        this.theta += dt * 0.001 * this.velocity
        this.life = Math.max(0, this.life - dt)
    }
}

class DrawArea {
    get box() {
        let box = { x: Math.min(this.x, this.x2), y: Math.min(this.y, this.y2), w: Math.abs(this.x2 - this.x), h: Math.abs(this.y - this.y2) }
        return box
    }

    get polygon() {
        let box = this.box
        let polygon = Polygon.rect(this.x, this.y, this.x2, this.y2, 16)
        polygon.width = 1
        polygon.spacing = 32
        if (box_area(box) < 10000) {
            polygon.color = Colors.light_red
        }
        return polygon
    }

    get patrolRegion() {
        let box = this.box
        if (box_area(box) < 10000) {
            return undefined
        }
        let res = new PatrolRegion(box)
        return res
    }

    constructor(readonly x: number, readonly y: number) {
        this.x2 = x - 10
        this.y2 = y - 10
    }


    x2: number
    y2: number
}

class Cursor {
    get box() {
        return { x: this.x, y: this.y, w: 32, h: 32 }
    }

    get theta() {
        return this.theta_spring.position
    }

    x = 320
    y = 180

    vx = 0
    x0 = this.x

    theta_spring = new Spring(0, 0, 800, 2)

    is_hovering = false
    is_dragging = false

    update(dt: number) {
        this.vx = this.x - this.x0
        this.x0 = this.x

        this.theta_spring.velocity = this.vx * 0.3

        this.theta_spring.update(dt)
    }

}


function drawPolygon(polygon: Polygon) {
    let { width, color, dashed } = polygon
    let { vertices } = polygon
    const n = vertices.length / 2
    const step = dashed ? 2 : 1
    for (let i = 0; i < n; i += step) {
        const j = (i + 1) % n
        let x1 = vertices[i * 2]
        let y1 = vertices[i * 2 + 1]

        let x2 = vertices[j * 2]
        let y2 = vertices[j * 2 + 1]

        lb.drawLine(x1, y1, x2, y2, width, color)
    }

    let { ptFillVertices } = polygon
    for (let i = 0; i < ptFillVertices.length; i += 2) {
        let a = ptFillVertices[i]
        let b = ptFillVertices[i + 1]

        lb.drawLine(a.x, a.y, b.x, b.y, width, color)
    }
}

let flowerPolygon = Polygon.circle(8)
flowerPolygon.color = Colors.light_green

class BinaryScore {
    zeros: BinaryZero[]
    score: string[]

    off_x: Spring[]

    constructor() {
        this.score = '000000'.split('')
        this.zeros = this.score.map(_ => BinaryZero.create(0))
        this.off_x = this.score.map(_ => new Spring(0, 0, 800, 3))
        this.pending_ones = []
        this.pending_zeros = []

        setInterval(() => {
            this.incScore()
        }, 1000)
    }

    pending_zeros: number[]
    pending_ones: number[]

    incScore(i = 0) {
        if (i >= this.score.length) {
        } else if (this.score[i] === '0') {
            this.pending_ones.push(i)
        } else {
            this.pending_zeros.push(i)
            this.incScore(i + 1)
        }
    }

    update(dt: number) {
        for (let index of this.pending_ones) {
            this.zeros[index].setN(1)
            this.score[index] = '1'

            for (let x = index; x < this.score.length; x++)
                this.off_x[x].velocity += 90 * (x / 6)
        }
        for (let index of this.pending_zeros) {
            this.zeros[index].setN(0)
            this.score[index] = '0'
            for (let x = index; x < this.score.length; x++)
                this.off_x[x].velocity += 90 * (x / 6)
        }
        this.pending_ones = []
        this.pending_zeros = []


        let x = 0
        let y = 0
        for (let a = 0; a < 6; a++) {
            x += 100 + Math.sin(Math.sin(1 - a / 3) * 0.1) * 3
            y += Math.sin(Math.sin(t * 0.01) * Math.sin(x * 0.01 + 3.5 - a / 2) * 0.3) * 3

            x += this.off_x[a].position

            this.zeros[a].polygonOne.x = x + -30
            this.zeros[a].polygonOne.y = y + 30
            this.zeros[a].polygonZero.x = x + -30
            this.zeros[a].polygonZero.y = y + 30
        }

        for (let i in this.off_x) {
            this.off_x[i].update(dt)
        }
    }
}

class BinaryZero {

    n!: number
    polygonOne!: Polygon
    polygonZero!: Polygon

    get polygon() {
        return this.n === 0 ? this.polygonZero : this.polygonOne
    }

    static create = (n: number) => {

        let res = new BinaryZero()
        res.n = n
        res.polygonOne = Polygon.model([80, 0, 100, 100, 80, 0, 115, 30])
        res.polygonZero = Polygon.circle(40)

        res.polygonOne.scale = 0.5
        res.polygonZero.scale = 0.5
        res.polygonOne.width = 12
        res.polygonOne.spacing = 3000
        res.polygonOne.color = Colors.light_blue
        res.polygonOne.off_x = -100
        res.polygonOne.off_y = -50

        res.polygonZero.width = 12
        res.polygonZero.spacing = 3000
        res.polygonZero.color = Colors.dark_blue


        return res
    }

    setN(n: number) {
        this.n = n
    }
}

export function _render() {
    if (!first_update_called) return

    cx.beginRender()

    // background
    lb.drawLine(0, 180, 640, 180, 640, Colors.dark_green)

    for (let zero of game.binaryScore.zeros) {
        drawPolygon(zero.polygon)
    }

    drawPolygon(game.bomber.polygon)

    for (let plant of game.plants.flowers) {
        flowerPolygon.x = plant.x
        flowerPolygon.y = plant.y
        drawPolygon(flowerPolygon)
    }

    for (let homing of game.bomber.homings) {
        drawPolygon(homing.polygon)
    }

    for (let unicorn of game.herd.unicorns) {
        drawPolygon(unicorn.polygon)
    }

    if (game.patrolRegion) {
        drawPolygon(game.patrolRegion.polygon)
    }


    if (game.dragArea) {
        drawPolygon(game.dragArea.polygon)
    }

    for (let impact of game.explosions.impacts) {
        drawPolygon(impact.polygon)
    }

    drawPolygon(game.lepricon.polygon)

    let theta = game.cursor.theta
    let x = game.cursor.box.x
    let y = game.cursor.box.y

    drawCursor(x, y, 4, theta, 3)

    for (let p of game.cParticles.particles) {
        drawCursor(x + p.x, y + p.y, p.size, p.theta, p.size * 3)
    }


    lb.endDraw()

    cx.endRender()
}

function drawCursor(x: number, y: number, radius: number, theta: number, width: number) {
    let _10 = radius
    let x1 = x
    let y1 = y
    let x2 = x
    let y2 = y

    let p1 = rotate({ x: -_10, y: -_10 * 0.5 }, theta)
    let p2 = rotate({ x: _10, y: -_10 * 0.5 }, theta)
    lb.drawLine(x1 + p1.x, y1 + p1.y, x2 + p2.x, y2 + p2.y, width, Colors.dark_yellow)

    x1 = x
    y1 = y
    x2 = x
    y2 = y

    p1 = rotate({ x: -_10 * 0.5, y: - _10 }, theta)
    p2 = rotate({ x: -_10 * 0.5, y: _10 }, theta)
    lb.drawLine(x1 + p1.x, y1 + p1.y, x2 + p2.x, y2 + p2.y, width, Colors.dark_yellow)
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

export function _set_viewport(top: number, left: number, width: number, height: number, clientWidth: number, clientHeight: number) {
    cx.setCanvasBounds(width, height)
    mouse.set_bounds(top, left, clientWidth, clientHeight, 640, 360)
}


let mouse: Mouse
let keyboard: Keyboard
export function _set_canvas(canvas: HTMLCanvasElement) {
    keyboard = Keyboard.bindTo(canvas)
    mouse = Mouse.bindTo(canvas)

    keyboard.add_keymapping('w', 'up')
    keyboard.add_keymapping('a', 'left')
    keyboard.add_keymapping('s', 'down')
    keyboard.add_keymapping('d', 'right')

    keyboard.add_keymapping('i', 'up')
    keyboard.add_keymapping('j', 'left')
    keyboard.add_keymapping('k', 'down')
    keyboard.add_keymapping('l', 'right')



    canvas.oncontextmenu = () => false
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