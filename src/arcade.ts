import { box_center, box_max, box_min, type Box } from "./collision"
import type { ActionSign } from "./keyboard"

export class Vec2 {
    static get Zero() { return new Vec2(0, 0) }

    static fromXy(a: { x: number, y: number }) { return new Vec2(a.x, a.y) }

    static boxCenter(a: { x: number, y: number, w: number, h: number }) {
        return new Vec2(a.x + a.w / 2, a.y + a.h / 2)
    }

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
        if (this.length() === 0) return Vec2.Zero
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

export function leftward(angle: number) {
    return Math.cos(angle) < 0
}

export class PositionVelocity {
    position = Vec2.Zero
    velocity = Vec2.Zero
    acceleration = Vec2.Zero

    minSpeed = 0
    maxSpeed = 0
    minAccel = 0
    maxAccel = 0

    maxTurnRate = Math.PI * 1.2

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
            } else {
                // else: decelerating toward 0 -> let it pass through, no floor
                //this.velocity = Vec2.Zero
            }
        }

        this.velocity = newVelocity.clampLength(0, this.maxSpeed)


        this.position = this.position.add(this.velocity.scale(dtSec))
    }

    steer(desired: Vec2) {
        const mag = desired.length()
        if (mag < 1e-6 || this.acceleration.length() < 1e-6) {
            this.acceleration = desired
            return
        }
        const curAngle = this.acceleration.angle()
        const desAngle = desired.angle()
        let diff = desAngle - curAngle
        diff = Math.atan2(Math.sin(diff), Math.cos(diff)) // wrap to [-PI, PI]
        const maxStep = this.maxTurnRate * 0.016
        const clampedDiff = Math.max(-maxStep, Math.min(maxStep, diff))
        const newAngle = curAngle + clampedDiff
        this.acceleration = new Vec2(Math.cos(newAngle), Math.sin(newAngle)).scale(mag)
    }

}

export type ArcadeActionRequests = {
    req_left: ActionSign
    req_right: ActionSign
    req_up: ActionSign
    req_down: ActionSign
}

export class ArcadeLepricon {
    body!: PositionVelocity

    buttons!: ArcadeActionRequests

    contain_box!: ContainWithinBox

    static create = (x: number, y: number) => {

        let res = new ArcadeLepricon()

        res.body = new PositionVelocity()
        res.body.position.x = x
        res.body.position.y = y

        res.body.minAccel = 1700
        res.body.maxAccel = 2700
        res.body.minSpeed = 30
        res.body.maxSpeed = 300

        res.contain_box = new ContainWithinBox(res.body, { x: 10, y: 10, w: 630, h: 340 })

        return res
    }

    button_cool = 0

    stateUpdates() {

        let req_h = 0
        if (this.buttons.req_left === 'down' || this.buttons.req_left === 'just-down') {
            req_h = -1
        } else if (this.buttons.req_right === 'down' || this.buttons.req_right === 'just-down') {
            req_h = 1
        }

        let req_v = 0
        if (this.buttons.req_up === 'down' || this.buttons.req_up === 'just-down') {
            req_v = -1
        } else if (this.buttons.req_down === 'down' || this.buttons.req_down === 'just-down') {
            req_v = 1
        }

        if (this.button_cool > 0) {
            req_h = 0
            req_v = 0
            this.body.minSpeed = 200
        } else {
            this.body.minSpeed = 30
        }

        this.body.acceleration = new Vec2(this.body.minAccel * req_h, this.body.minAccel * req_v)
        if (req_h === 0 && req_v === 0) {
            this.body.velocity = this.body.velocity.scale(0.1)
        }
        if (Math.sign(this.body.velocity.x) !== req_h) {
        } else {
            this.body.acceleration.x += req_h * 10
            if (req_h > 0) {
                if (this.body.velocity.x < this.body.minSpeed) {
                    this.body.velocity.x = this.body.minSpeed
                }
            }
        }
        if (Math.sign(this.body.velocity.y) !== req_v) {
        } else {
            this.body.acceleration.y += req_v * 10
            if (req_v > 0) {
                if (this.body.velocity.y < this.body.minSpeed) {
                    this.body.velocity.y = this.body.minSpeed
                }
            }
        }


    }

    update(dt: number) {

        this.stateUpdates()




        this.button_cool = Math.max(0, this.button_cool - dt)

        this.body.update(dt)
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

export class FleeIfClose implements SteeringBehavior {
    constructor(public body: PositionVelocity, public target: Vec2, public radius: number) { }
    compute(): Vec2 {
        const dist = this.body.position.sub(this.target).length()
        if (dist > this.radius) return Vec2.Zero
        const strength = 1 - dist / this.radius // 1 at target, 0 at edge
        return new Flee(this.body, this.target).compute().scale(strength)
    }
}

class FleeIfCloseSharp implements SteeringBehavior {
    constructor(public body: PositionVelocity, public target: Vec2, public radius: number) { }
    compute(): Vec2 {
        const dist = this.body.position.sub(this.target).length()
        if (dist > this.radius) return Vec2.Zero
        return new Flee(this.body, this.target).compute()
    }
}

export class Arrive implements SteeringBehavior {
    constructor(
        public body: PositionVelocity,
        public target: Vec2,
        public slowRadius: number,
        public targetRadius: number
    ) { }

    compute(): Vec2 {
        const offset = this.target.sub(this.body.position)
        const dist = offset.length()

        if (dist < this.targetRadius) {
            return Vec2.Zero
        }

        const speed = this.body.maxSpeed * Math.min(1, dist / this.slowRadius)
        const desired = offset.scale(speed / dist)
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


export class EvadeBox implements SteeringBehavior {
    constructor(public body: PositionVelocity, public box: Box) { }
    compute(): Vec2 {
        const min = box_min(this.box)
        const max = box_max(this.box)
        const p = this.body.position
        const inside = p.x >= min.x && p.x <= max.x && p.y >= min.y && p.y <= max.y
        if (!inside) return Vec2.Zero

        const center = Vec2.fromXy(box_center(this.box))
        const away = p.sub(center)
        if (away.length() === 0) return Vec2.Zero
        return away.normalize().scale(this.body.maxAccel)
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


class Cohesion implements SteeringBehavior {
    constructor(public body: PositionVelocity, public neighbors: PositionVelocity[]) { }
    compute(): Vec2 {
        if (this.neighbors.length === 0) return Vec2.Zero
        const center = this.neighbors.reduce((sum, n) => sum.add(n.position), Vec2.Zero)
            .scale(1 / this.neighbors.length)
        return new Seek(this.body, center).compute()
    }
}

class Separation implements SteeringBehavior {
    constructor(public body: PositionVelocity, public neighbors: PositionVelocity[], public radius = 30) { }
    compute(): Vec2 {
        let force = Vec2.Zero
        for (const n of this.neighbors) {
            const offset = this.body.position.sub(n.position)
            const dist = offset.length()
            if (dist > 1e-6 && dist < this.radius) {
                force = force.add(offset.normalize().scale(1 / dist)) // stronger when closer
            }
        }
        return force
    }
}


export type Sign = 1 | -1 | 0
export const epsilon = 0.5
export const large_epsilon = 2


export type ArcadePlayerState = 'flee' | 'eat' | 'hunt' | 'meet' | 'rest' | 'discover' | 'wander' | 'meet-evade' | 'after-meet'

export type ArcadePlayerTargets = {
    flee_target: Vec2
    seek_target: Vec2
    contain_box: Box
    neighbors: PositionVelocity[]
}

export class ArcadePlayer implements PositionBehavior {

    combined_steering: CombinedSteering

    flee: FleeIfCloseSharp
    arrive: Arrive
    wander: Wander
    contain: ContainWithinBox
    evade_box: EvadeBox
    cohesion!: Cohesion
    seperation!: Separation
    behaviors: [SteeringBehavior, number][]
    upper_contain: ContainWithinBox

    static create = (x: number, y: number, targets: ArcadePlayerTargets) => {
        let body = new PositionVelocity()
        body.position.x = x
        body.position.y = y
        body.velocity.x = 1
        let res = new ArcadePlayer(body, targets)

        return res
    }

    private constructor(readonly body: PositionVelocity, targets: ArcadePlayerTargets) {
        this.evade_box = new EvadeBox(body, targets.contain_box)
        this.flee = new FleeIfCloseSharp(this.body, targets.flee_target, 100)
        this.arrive = new Arrive(body, targets.seek_target, 20, 10)
        this.wander = new Wander(body, 1, 7, 100)
        this.contain = new ContainWithinBox(body, targets.contain_box, 1)
        this.cohesion = new Cohesion(body, targets.neighbors)
        this.seperation = new Separation(body, targets.neighbors, 300)
        this.behaviors = []
        this.combined_steering = new CombinedSteering(body, this.behaviors)
        this.upper_contain = new ContainWithinBox(body, { x: 0, y: 0, w: 440, h: 360 }, 3)
    }

    state: ArcadePlayerState = 'rest'

    state_cool = 0

    setState(state: ArcadePlayerState) {
        this.state = state
        this.state_cool = 0
    }


    private stateUpdates(dt: number) {

        this.behaviors.length = 0

        this.behaviors.push([this.upper_contain, 10])

        switch (this.state) {
            case 'rest': {
                this.behaviors.push([this.wander, 1])
                this.behaviors.push([this.seperation, 1])
                this.behaviors.push([this.cohesion, 1])


                if (this.state_cool === 0) {
                    this.body.minAccel = 1
                    this.body.maxAccel = 26
                    this.body.minSpeed = 1
                    this.body.maxSpeed = 3
                    this.body.maxTurnRate = Math.PI * 1

                    this.state_cool = 2000
                } else {
                    this.state_cool = Math.max(0, this.state_cool - dt)

                    if (this.state_cool === 0) {
                        this.state = 'discover'
                    }
                }
            } break
            case 'discover': {
                if (this.state_cool === 0) {
                    this.state_cool = 5000
                } else {
                    this.state_cool = Math.max(0, this.state_cool - dt)

                    if (this.state_cool === 0) {
                        this.state = 'wander'
                    }
                }
                this.body.minAccel = 100
                this.body.maxAccel = 1600
                this.body.minSpeed = 160
                this.body.maxSpeed = 200
                this.body.maxTurnRate = Math.PI * 1.8

                if (this.body.velocity.length() > epsilon) {
                    this.behaviors.push([this.seperation, 0.5])
                    this.behaviors.push([this.cohesion, 1])
                }
                this.behaviors.push([this.arrive, 1])
            } break
            case 'eat': {
                this.body.maxSpeed = 3
                this.body.maxAccel = 1
            } break
            case 'meet-evade': {
                this.behaviors.push([this.seperation, 0.1])
                this.behaviors.push([this.cohesion, 1])
                this.behaviors.push([this.evade_box, 300])
                this.behaviors.push([this.wander, 80])

                if (this.state_cool === 0) {

                    this.body.minAccel = 270
                    this.body.maxAccel = 596
                    this.body.minSpeed = 150
                    this.body.maxSpeed = 250
                    this.body.maxTurnRate = Math.PI * 7


                    this.state_cool = 3344
                } else {
                    this.state_cool = Math.max(0, this.state_cool - dt)

                    if (this.state_cool === 0) {
                        this.state = 'discover'
                    }
                }

            } break
            case 'meet': {
                this.behaviors.push([this.seperation, 0.1])
                this.behaviors.push([this.cohesion, 1])
                this.behaviors.push([this.contain, 300])


                if (this.state_cool === 0) {

                    this.body.minAccel = 370
                    this.body.maxAccel = 1796
                    this.body.minSpeed = 150
                    this.body.maxSpeed = 350
                    this.body.maxTurnRate = Math.PI * 7

                    this.state_cool = 3344
                } else {
                    this.state_cool = Math.max(0, this.state_cool - dt)

                    if (this.state_cool === 0) {
                        this.state = 'after-meet'
                    }
                }

            } break
            case 'after-meet': {

                this.behaviors.push([this.seperation, 0.1])
                this.behaviors.push([this.cohesion, 1])
                this.behaviors.push([this.flee, 30])


                if (this.state_cool === 0) {

                    this.body.minAccel = 570
                    this.body.maxAccel = 896
                    this.body.minSpeed = 250
                    this.body.maxSpeed = 750
                    this.body.maxTurnRate = Math.PI * 70

                    this.state_cool = 1344
                } else {
                    this.state_cool = Math.max(0, this.state_cool - dt)

                    if (this.state_cool === 0) {
                        this.state = 'wander'
                    }
                }



            } break
            case 'wander': {
                this.behaviors.push([this.wander, 3])
                this.behaviors.push([this.seperation, 1])
                this.behaviors.push([this.cohesion, 1])


                if (this.state_cool === 0) {
                    this.body.minAccel = 170
                    this.body.maxAccel = 196
                    this.body.minSpeed = 120
                    this.body.maxSpeed = 150
                    this.body.maxTurnRate = Math.PI * 1.5

                    this.state_cool = 3344
                } else {
                    this.state_cool = Math.max(0, this.state_cool - dt)

                    if (this.state_cool === 0) {
                        this.state = 'discover'
                    }
                }
            } break
            case 'flee': {
                this.behaviors.push([this.seperation, 1])
                this.behaviors.push([this.cohesion, 1])
                this.behaviors.push([this.flee, 8])


                if (this.state_cool === 0) {
                    this.body.minAccel = 370
                    this.body.maxAccel = 496
                    this.body.minSpeed = 220
                    this.body.maxSpeed = 450
                    this.body.maxTurnRate = Math.PI * 3

                    this.state_cool = 1344
                } else {
                    this.state_cool = Math.max(0, this.state_cool - dt)

                    if (this.state_cool === 0) {
                        this.state = 'discover'
                    }
                }
            }
        }
    }


    update(dt: number) {
        this.stateUpdates(dt)
        this.combined_steering.update(dt)
    }

}

export type ArcadeHomingState = 'fire_off'

export class ArcadeHoming implements PositionBehavior {

    combined_steering: CombinedSteering

    fire_off: Seek
    long_seek: Seek
    pursue: Pursue
    arrive: Arrive
    behaviors: [SteeringBehavior, number][]

    life = 0

    static create = (position: Vec2, seek_target: PositionVelocity) => {
        let body = new PositionVelocity()
        body.position.x = position.x
        body.position.y = position.y
        body.velocity.x = -Math.abs(180 - position.y) / 180 * 3
        body.velocity.y = Math.sign(180 - position.y) * 3
        let res = new ArcadeHoming(body, seek_target)

        res.body.minAccel = 300
        res.body.maxAccel = 700
        res.body.minSpeed = 160
        res.body.maxSpeed = 1020

        return res
    }

    private constructor(readonly body: PositionVelocity, readonly seek_target: PositionVelocity) {
        this.pursue = new Pursue(body, seek_target, 0.01)
        this.arrive = new Arrive(body, seek_target.position, 30, 60)

        let fire_off = body.position.add((body.velocity).scale(30))
        let long_seek = body.position.add(heading(body.velocity).scale(100))
        long_seek.x -= 100
        this.long_seek = new Seek(body, long_seek)
        this.fire_off = new Seek(body, fire_off)
        this.behaviors = []
        this.combined_steering = new CombinedSteering(body, this.behaviors)
    }

    state: ArcadeHomingState = 'fire_off'

    private stateUpdates() {

        let fire_off = this.life < 80

        if (fire_off) {
            this.body.minAccel = 300
            this.body.maxAccel = 500
            this.body.maxSpeed = 800
            this.body.minSpeed = 400
            this.body.maxTurnRate = Math.PI * 0.1
        } else {
            this.body.minAccel = 700
            this.body.maxAccel = 1700
            this.body.minSpeed = 160
            this.body.maxSpeed = 520
            this.body.maxTurnRate = Math.PI * 4
        }

        this.behaviors.length = 0
        this.behaviors.push([this.arrive, 3000])
        this.behaviors.push([this.pursue, 30])
        //this.behaviors.push([this.long_seek, this.life < 200 ? 7 : 1])
        this.behaviors.push([this.fire_off, fire_off ? 700 : 1])
    }


    update(dt: number) {

        this.arrive.target = this.seek_target.position

        this.life += dt
        this.stateUpdates()
        this.combined_steering.update(dt)
    }

}

export type ArcadeBomberState = 'patrol'

export class ArcadeBomber implements PositionBehavior {

    combined_steering: CombinedSteering

    contain: ContainWithinBox
    arrive: Arrive
    behaviors: [SteeringBehavior, number][]

    static create = (x: number, y: number, seek_target: Vec2) => {
        let body = new PositionVelocity()
        body.position.x = x
        body.position.y = y
        let res = new ArcadeBomber(body, seek_target)

        res.body.minAccel = 1000
        res.body.maxAccel = 3000
        res.body.minSpeed = 170
        res.body.maxSpeed = 180

        res.body.maxTurnRate = Math.PI * 2

        return res
    }

    private constructor(public body: PositionVelocity, seek_target: Vec2) {
        this.contain = new ContainWithinBox(body, { x: 630, y: 10, w: 5, h: 350 }, 10)
        this.arrive = new Arrive(body, seek_target, 10, 20)
        this.behaviors = []
        this.combined_steering = new CombinedSteering(body, this.behaviors)
    }

    state: ArcadeBomberState = 'patrol'

    jump_buffer = 0

    private stateUpdates() {
        this.behaviors.length = 0
        this.behaviors.push([this.contain, 80])
        this.behaviors.push([this.arrive, 1])
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