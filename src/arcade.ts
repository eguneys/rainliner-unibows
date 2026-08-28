import type { Box } from "./collision"
import type { ActionSign } from "./keyboard"

export class PositionVelocity {

    x = 0
    y = 0

    vhs: Sign = 0
    vh = 0

    vv = 0
    vvs: Sign = 0

    ahs: Sign = 0
    ah = 0

    avs: Sign = 0
    av = 0

    minSpeedV = 0
    maxSpeedV = 0

    minAccelV = 0
    maxAccelV = 0

    minSpeedH = 0
    maxSpeedH = 0

    minAccelH = 0
    maxAccelH = 0


    boostAh = 0

    private vertical_updates(dt: number) {
        let dtSec = dt * 0.001

        this.av = Math.max(this.minAccelV, Math.min(this.maxAccelV, this.av))

        this.vv += this.avs * this.av * dtSec

        this.vv = Math.max(this.minSpeedV, Math.min(this.maxSpeedV, this.vv))

        this.y += this.vvs * this.vv * dtSec
    }

    private horizontal_updates(dt: number) {
        let dtSec = dt * 0.001

        this.ah = Math.max(this.minAccelH, Math.min(this.maxAccelH, this.ah))

        this.vh += this.ahs * this.ah * dtSec

        this.vh = Math.max(this.minSpeedH, Math.min(this.maxSpeedH, this.vh))

        this.x += this.vhs * this.vh * dtSec
    }


    update(dt: number) {
        this.horizontal_updates(dt)
        this.vertical_updates(dt)

        this.boostAh = Math.max(0, this.boostAh - dt)

        if (this.boostAh > 0) {
            let boost = 10
            this.ah += boost
        }
    }
}

export interface PositionBehavior {
    body: PositionVelocity
    update(dt: number): void
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
    static create = () => {
        let res = new ArcadePlayer()

        res.body.minAccelH = 100
        res.body.maxAccelH = 500
        res.body.minSpeedH = 270
        res.body.maxSpeedH = 700

        res.body.minAccelV = 1700
        res.body.maxAccelV = 5000
        res.body.minSpeedV = 270
        res.body.maxSpeedV = 730

        return res
    }

    private constructor() { }

    body: PositionVelocity = new PositionVelocity()

    butt!: ArcadePlayerButtonSigns

    coll!: Collisions

    state: ArcadePlayerState = 'fall'

    jump_buffer = 0

    private stateUpdates() {

        if (this.butt.req_jump === 'just-down') {
            this.jump_buffer = 200
        }



        switch (this.state) {
            case 'idle': {
                this.body.ahs = 0
                this.body.vhs = 0
            } break
            case 'fall': {
                this.body.vvs = 1
                this.body.avs = 1
            } break
            case 'landed': {
                this.body.vvs = 0
                this.body.vh -= 30
                this.body.ahs = 1
                this.state = 'landed2'
            } break
            case 'landed2': {
                if (this.jump_buffer > 0) {
                    this.jump_buffer = 0
                    this.state = 'jump'

                }
            } break
            case 'jump': {
                this.body.vv = this.body.maxSpeedV
                this.body.vvs = -1
                this.body.avs = -1
                this.state = 'jumping'
            } break
            case 'jumping': {

            }
        }

        if (this.coll.box.colliding) {
            resolve_manifold(this.body, this.coll.box)
            if (this.state === 'fall') {
                if (this.coll.box.ny !== 0) {
                    this.state = 'landed'
                }
            }
        } else {
            if (!this.coll.down.colliding) {
                if (this.state === 'jumping') {
                    if (this.body.vv - this.body.minSpeedV < epsilon) {
                        this.state = 'fall'
                    }
                } else {
                    this.state = 'fall'
                }
            }
        }
    }


    update(dt: number) {

        this.jump_buffer = Math.max(0, this.jump_buffer - dt)

        this.stateUpdates()
        this.body.update(dt)
    }

}

export type ArcadeDeadzones = {
    horizontal: Sign
    vertical: Sign
}

export class ArcadeCameraCruise implements PositionBehavior {

    static create = () => {
        let res = new ArcadeCameraCruise()

        res.body.minAccelH = 2300
        res.body.maxAccelH = 5000
        res.body.minSpeedH = 570
        res.body.maxSpeedH = 1830

        res.body.minAccelV = 700
        res.body.maxAccelV = 500
        res.body.minSpeedV = 270
        res.body.maxSpeedV = 430

        return res
    }

    private constructor() { }

    body = new PositionVelocity()

    deadzones!: ArcadeDeadzones

    stateUpdates() {
        this.body.vhs = this.deadzones.horizontal
        this.body.ahs = this.deadzones.horizontal

        this.body.vvs = this.deadzones.vertical
        this.body.avs = this.deadzones.vertical
    }

    update(dt: number) {
        this.stateUpdates()
        this.body.update(dt)
    }
}