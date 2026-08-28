export type Vec2 = { x: number, y: number }
export class Mouse {

    static bindTo = (canvas: HTMLCanvasElement) => {
        return new Mouse(canvas)
    }

    private constructor(canvas: HTMLCanvasElement) {
        canvas.addEventListener('pointerdown', (e: PointerEvent) => {
            canvas.setPointerCapture(e.pointerId)
            this.on_down(e.clientX, e.clientY)
        })
        canvas.addEventListener('pointermove', (e: PointerEvent) => this.on_move(e.clientX, e.clientY))
        document.addEventListener('pointerup', (e: PointerEvent) => this.on_up(e.clientX, e.clientY))
    }

    private bounds = { top: 0, left: 0, width: 0, height: 0, game_width: 0, game_height: 0 }
    is_just_down: Vec2 | undefined
    is_hovering = { x: 0, y: 0 }
    is_just_up: Vec2 | undefined

    private normalize = (x: number, y: number) => {
        return { x: ((x - this.bounds.left) / this.bounds.width) * this.bounds.game_width, y: ((y - this.bounds.top) / this.bounds.height) * this.bounds.game_height }
    }

    private on_down = (x: number, y: number) => {
        this.is_just_down = this.normalize(x, y)
        this.is_hovering = this.normalize(x, y)
    }

    private on_move = (x: number, y: number) => {
        this.is_hovering = this.normalize(x, y)
    }


    private on_up = (x: number, y: number) => {
        this.is_just_up = this.normalize(x, y)
        this.is_hovering = this.normalize(x, y)
    }

    update() {
        this.is_just_down = undefined
        this.is_just_up = undefined
    }

    set_bounds(top: number, left: number, width: number, height: number, game_width: number, game_height: number) {
        this.bounds = { top, left, width, height, game_width, game_height }
        this.is_hovering = { x: game_width / 2, y: game_height / 2 }
    }

}