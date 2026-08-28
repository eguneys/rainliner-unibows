import { box_contains, box_max, box_min, type Box } from "./collision"
import type { ActionSign } from "./keyboard"

export class Vec2 {
    static get Zero() { return new Vec2(0, 0) }

    static fromXy(a: { x: number, y: number }) { return new Vec2(a.x, a.y) }

    constructor(public x: number, public y: number) { }

    sub(a: Vec2) {
        return new Vec2(this.x - a.x, this.y - a.y)
    }

    add(a: Vec2) {
        return new Vec2(this.x + a.x, this.y + a.y)
    }

    scale(n: number) {
        return new Vec2(this.x * n, this.y * n)
    }

    normalize() {
        return this.scale(1 / this.length())
    }

    length() {
        return Math.sqrt(this.x * this.x + this.y * this.y)
    }

    clampLength(min: number, max: number): Vec2 {
        const len = this.length()
        if (len < 1e-6) return this
        const clamped = Math.max(min, Math.min(max, len))
        return this.scale(clamped / len)
    }

    angle() {
        return Math.atan2(this.y, this.x)
    }
}

export class PositionVelocity {
    position = Vec2.Zero
    velocity = Vec2.Zero
    acceleration = Vec2.Zero

    minSpeed!: number
    maxSpeed!: number
    minAccel!: number
    maxAccel!: number

    update(dt: number) {
        let dtSec = dt * 0.001

        this.acceleration = this.acceleration.clampLength(this.minAccel, this.maxAccel)


        const oldSpeed = this.velocity.length()
        let newVelocity = this.velocity.add(this.acceleration.scale(dtSec))
        const newSpeed = newVelocity.length()

        if (newSpeed < this.minSpeed) {
            if (newSpeed >= oldSpeed) {
                // accelerating up from rest -> snap to floor instead of crawling from 0
                const dir = newSpeed > 1e-6 ? newVelocity.normalize() : heading(this.acceleration)
                newVelocity = dir.scale(this.minSpeed)
            }
            // else: decelerating toward 0 -> let it pass through, no floor
        }

        this.velocity = newVelocity.clampLength(0, this.maxSpeed)


        this.position = this.position.add(this.velocity.scale(dtSec))
    }

    steer(desired: Vec2) {
        this.acceleration = desired.sub(this.velocity)
    }
}

interface SteeringBehavior {
    compute(): Vec2  // returns a desired accel/velocity contribution, doesn't touch body
}

export class CombinedSteering implements PositionBehavior {
    constructor(public body: PositionVelocity, public behaviors: [SteeringBehavior, number][]) { }
    update(dt: number) {
        const total = this.behaviors.reduce(
            (sum, [b, w]) => sum.add(b.compute().scale(w)), Vec2.Zero
        )
        this.body.steer(total)
        this.body.update(dt)
    }
}

export interface PositionBehavior {
    body: PositionVelocity
    update(dt: number): void
}



class Seek implements SteeringBehavior {
    constructor(public body: PositionVelocity, public target: Vec2) { }
    compute(): Vec2 {
        const desired = this.target.sub(this.body.position).normalize().scale(this.body.maxSpeed)
        return desired.sub(this.body.velocity)
    }
}

export class Flee implements SteeringBehavior {
    constructor(public body: PositionVelocity, public target: Vec2) { }
    compute(): Vec2 {
        const desired = this.body.position.sub(this.target).normalize().scale(this.body.maxSpeed)
        return desired.sub(this.body.velocity)
    }
}

export class Arrive implements SteeringBehavior {
    constructor(public body: PositionVelocity, public target: Vec2, public slowRadius: number) { }
    compute(): Vec2 {
        const offset = this.target.sub(this.body.position)
        const dist = offset.length()
        const speed = this.body.maxSpeed * Math.min(1, dist / this.slowRadius)
        const desired = dist > 1e-6 ? offset.scale(speed / dist) : Vec2.Zero
        return desired.sub(this.body.velocity)
    }
}

export class Pursue implements SteeringBehavior {
    constructor(public body: PositionVelocity, public target: PositionVelocity, public predictTime = 0.5) { }
    compute(): Vec2 {
        const futurePos = this.target.position.add(this.target.velocity.scale(this.predictTime))
        return new Seek(this.body, futurePos).compute()
    }
}

export class Evade implements SteeringBehavior {
    constructor(public body: PositionVelocity, public target: PositionVelocity, public predictTime = 0.5) { }
    compute(): Vec2 {
        const futurePos = this.target.position.add(this.target.velocity.scale(this.predictTime))
        return new Flee(this.body, futurePos).compute()
    }
}


export function heading(v: Vec2): Vec2 {
    return v.length() > 1e-6 ? v.normalize() : Vec2.Zero
}

export function side(v: Vec2): Vec2 {
    const h = heading(v)
    return new Vec2(-h.y, h.x)  // 90° rotation (left-hand side)
}

export class Wander implements SteeringBehavior {
    private wanderAngle = 0
    constructor(public body: PositionVelocity, public radius = 2, public distance = 5, public jitter = 0.3) { }
    compute(): Vec2 {
        this.wanderAngle += (Math.random() - 0.5) * this.jitter
        const h = heading(this.body.velocity)
        const s = side(this.body.velocity)
        const circleCenter = h.scale(this.distance)
        const displacement = h.scale(Math.cos(this.wanderAngle)).add(s.scale(Math.sin(this.wanderAngle))).scale(this.radius)
        return circleCenter.add(displacement)
    }
}


export class ContainWithinBox implements SteeringBehavior {
    constructor(public body: PositionVelocity, public box: Box, public margin = 20) { }
    compute(): Vec2 {
        let min = box_min(this.box)
        let max = box_max(this.box)
        const p = this.body.position
        let force = Vec2.Zero
        if (p.x < min.x + this.margin) force.x = this.body.maxAccel
        if (p.x > max.x - this.margin) force.x = -this.body.maxAccel
        if (p.y < min.y + this.margin) force.y = this.body.maxAccel
        if (p.y > max.y - this.margin) force.y = -this.body.maxAccel
        return force
    }
}

export type Sign = 1 | -1 | 0
export const epsilon = 0.5
export const large_epsilon = 2

export type ArcadePlayerButtonSigns = {
    req_jump: ActionSign
}

export type Manifold = {
    nx: number,
    ny: number,
    depth: number,
    colliding: boolean
}

export type Collisions = {
    box: Manifold
    down: Manifold
}

export function sat_aabb(a: Box, b: Box) {
    let dx = b.x - a.x
    let px = (a.w + b.w) - Math.abs(dx)
    let dy = b.y - a.y
    let py = (a.h + b.h) - Math.abs(dy)

    if (px <= 0 || py <= 0) return { normal_x: 0, normal_y: 0, depth: 0, colliding: false }


    if (px < py) {
        return { normal_x: (dx < 0) ? -1 : 1, normal_y: 0, depth: px, colliding: true }
    } else {
        return { normal_x: 0, normal_y: (dy < 0) ? -1 : 1, depth: py, colliding: true }
    }
}

// top-left convention: (x, y) = top-left corner, (w, h) = full size
export function satAABB(a: Box, b: Box) {
    const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);

    if (overlapX <= 0 || overlapY <= 0) return { colliding: false, nx: 0, ny: 0, depth: 0 };

    if (overlapX < overlapY) {
        const sign = (a.x + a.w / 2) < (b.x + b.w / 2) ? 1 : -1;
        return { nx: sign, ny: 0, depth: overlapX, colliding: true };
    } else {
        const sign = (a.y + a.h / 2) < (b.y + b.h / 2) ? 1 : -1;
        return { nx: 0, ny: sign, depth: overlapY, colliding: true };
    }
}

export const Empty_Manifold = { nx: 0, ny: 0, depth: 0, colliding: false }
export function resolve_manifold(a: { x: number, y: number }, manifold: Manifold) {
    a.x += manifold.nx * manifold.depth
    a.y += manifold.ny * manifold.depth
}

export type ArcadePlayerState = 'fall' | 'landed' | 'landed2' | 'jumping' | 'idle' | 'jump'
export class ArcadePlayer implements PositionBehavior {

    combined_steering: CombinedSteering

    seek: Seek
    wander: Wander
    contain: ContainWithinBox
    behaviors: [SteeringBehavior, number][]

    static create = (x: number, y: number, seek_target: Vec2, contain: Box) => {
        let body = new PositionVelocity()
        body.position.x = x
        body.position.y = y
        let res = new ArcadePlayer(body, seek_target, contain)

        res.body.minAccel = 100
        res.body.maxAccel = 6000
        res.body.minSpeed = 60
        res.body.maxSpeed = 700

        return res
    }

    private constructor(public body: PositionVelocity, seek_target: Vec2, contain: Box) {
        this.seek = new Seek(body, seek_target)
        this.wander = new Wander(body, 1, 7, 100)
        this.contain = new ContainWithinBox(body, contain, 1)
        this.behaviors = []
        this.combined_steering = new CombinedSteering(body, this.behaviors)
    }

    butt!: ArcadePlayerButtonSigns

    coll!: Collisions

    state: ArcadePlayerState = 'fall'

    jump_buffer = 0

    private stateUpdates() {
        this.behaviors.length = 0
        if (box_contains(this.contain.box, this.seek.target)) {
            console.log(this.contain.box, this.seek.target)
            this.behaviors.push([this.seek, 1])
        }
        this.behaviors.push([this.wander, 1])
        this.behaviors.push([this.contain, 5])
    }


    update(dt: number) {
        this.stateUpdates()
        this.combined_steering.update(dt)
    }

}

export type ArcadeDeadzones = {
    horizontal: Sign
    vertical: Sign
}

export class ArcadeCameraCruise implements PositionBehavior {

    static create = () => {
        let res = new ArcadeCameraCruise()

        res.body.minAccel = 2300
        res.body.maxAccel = 5000
        res.body.minSpeed = 570
        res.body.maxSpeed = 1830

        return res
    }

    private constructor() { }

    body = new PositionVelocity()

    deadzones!: ArcadeDeadzones

    stateUpdates() {
    }

    update(dt: number) {
        this.stateUpdates()
        this.body.update(dt)
    }
}