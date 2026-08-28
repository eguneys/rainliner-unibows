export class Camera2D {

    left = -1
    right = 1
    bottom = -1
    top = 1

    panX = 0
    panY = 0
    zoom = 1

    constructor(gameWidth: number, gameHeight: number) {
        this.left = 0//-gameWidth / 2
        this.right = gameWidth
        this.bottom = gameHeight
        this.top = 0//- gameHeight / 2
    }

    private ortho() {
        const { left: l, right: r, bottom: b, top: t } = this;
        return [
            2 / (r - l), 0, 0, 0,
            0, 2 / (t - b), 0, 0,
            0, 0, -1, 0,
            -(r + l) / (r - l), -(t + b) / (t - b), 0, 1
        ];
    }

    private view() {
        const { panX: x, panY: y, zoom: z } = this;
        return [
            z, 0, 0, 0,
            0, z, 0, 0,
            0, 0, 1, 0,
            -x * z, -y * z, 0, 1
        ];
    }

    static multiply(a: number[], b: number[]) {
        const out = new Float32Array(16);
        for (let col = 0; col < 4; col++) {
            for (let row = 0; row < 4; row++) {
                let sum = 0;
                for (let k = 0; k < 4; k++) {
                    sum += a[k * 4 + row] * b[col * 4 + k];
                }
                out[col * 4 + row] = sum;
            }
        }
        return out;
    }

    get matrix() {
        return Camera2D.multiply(this.ortho(), this.view());
    }
}