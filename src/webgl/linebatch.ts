import { createProgram } from "./renderer"
import lineVS from './lineVS.vert'
import lineFS from './lineFS.frag'
import type { Color } from "./color"

export class LineBatch {

    static Max_Lines = 64
    static VerticesPerLine = 4 // 2 triangles = indexed 4 vertices
    static FloatsPerVertex = 7  // position(2) + cross(1) + color(4)

    lineProgram: WebGLProgram
    a_positionLocation: number
    a_CrossLocation: number
    a_ColorLocation: number

    u_matrixLocation: WebGLUniformLocation

    lineBuffer: WebGLBuffer
    indexBuffer: WebGLBuffer

    i_Line = 0
    vertexData: Float32Array

    constructor(readonly gl: WebGL2RenderingContext, readonly camera: { matrix: Float32Array }) {

        const lineBuffer = gl.createBuffer()
        gl.bindBuffer(gl.ARRAY_BUFFER, lineBuffer)
        this.lineBuffer = lineBuffer



        const { FloatsPerVertex, VerticesPerLine } = LineBatch

        const totalVertices = LineBatch.Max_Lines * VerticesPerLine
        this.vertexData = new Float32Array(totalVertices * FloatsPerVertex)

        const maxVertexFloats = LineBatch.Max_Lines * VerticesPerLine * FloatsPerVertex
        gl.bufferData(gl.ARRAY_BUFFER, maxVertexFloats * Float32Array.BYTES_PER_ELEMENT, gl.DYNAMIC_DRAW)

        const indexBuffer = gl.createBuffer()
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer)
        this.indexBuffer = indexBuffer

        const indices = []
        for (let i = 0; i < LineBatch.Max_Lines; i++) {
            const base = i * 4
            indices.push(base, base + 1, base + 2)
            indices.push(base + 1, base + 3, base + 2)
        }
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW)


        const lineProgram = createProgram(gl, lineVS, lineFS)!

        const a_positionLocation = gl.getAttribLocation(lineProgram, 'a_position')
        const a_CrossLocation = gl.getAttribLocation(lineProgram, 'a_Cross')
        const a_ColorLocation = gl.getAttribLocation(lineProgram, 'a_Color')

        this.lineProgram = lineProgram
        this.a_positionLocation = a_positionLocation
        this.a_CrossLocation = a_CrossLocation
        this.a_ColorLocation = a_ColorLocation

        const u_matrixLocation = gl.getUniformLocation(lineProgram, 'u_matrix')!
        this.u_matrixLocation = u_matrixLocation
    }


    flush() {
        if (this.i_Line === 0) return

        const gl = this.gl
        const { FloatsPerVertex, VerticesPerLine } = LineBatch

        const vertexCount = this.i_Line * VerticesPerLine

        gl.bindBuffer(gl.ARRAY_BUFFER, this.lineBuffer)
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.vertexData.subarray(0, vertexCount * FloatsPerVertex))

        gl.useProgram(this.lineProgram)
        const { matrix } = this.camera
        gl.uniformMatrix4fv(this.u_matrixLocation, false, matrix)



        const stride = FloatsPerVertex * Float32Array.BYTES_PER_ELEMENT
        gl.enableVertexAttribArray(this.a_positionLocation)
        gl.vertexAttribPointer(this.a_positionLocation, 2, gl.FLOAT, false, stride, 0)

        gl.enableVertexAttribArray(this.a_CrossLocation)
        gl.vertexAttribPointer(this.a_CrossLocation, 1, gl.FLOAT, false, stride, 2 * 4)

        gl.enableVertexAttribArray(this.a_ColorLocation)
        gl.vertexAttribPointer(this.a_ColorLocation, 4, gl.FLOAT, false, stride, 3 * 4)

        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer)
        const indexCount = this.i_Line * 6
        gl.drawElements(gl.TRIANGLES, indexCount, gl.UNSIGNED_SHORT, 0)

        this.i_Line = 0
    }

    drawLine(p0x: number, p0y: number, p1x: number, p1y: number, width: number, color: Color) {
        if (this.i_Line >= LineBatch.Max_Lines) {
            this.flush()
        }


        let [a, b, c, d] = expandSegment([p0x, p0y], [p1x, p1y], width)


        const { FloatsPerVertex, VerticesPerLine } = LineBatch

        const baseIndex = this.i_Line * VerticesPerLine * FloatsPerVertex

        let rgba = color.rgba
        const vertices = [
            a[0], a[1], 0.5, ...rgba,
            b[0], b[1], 0.5, ...rgba,
            c[0], c[1], -0.5, ...rgba,
            d[0], d[1], -0.5, ...rgba,
        ]

        this.vertexData.set(vertices, baseIndex)

        this.i_Line += 1
    }

    endDraw() {
        this.flush()
    }
}

export function expandSegment(p0: [number, number], p1: [number, number], width: number) {
    const dx = p1[0] - p0[0], dy = p1[1] - p0[1];
    const len = Math.hypot(dx, dy);
    const ux = dx / len, uy = dy / len;       // direction
    const nx = -uy * width / 2, ny = ux * width / 2; // perpendicular
    const ext = width / 2;                   // extend to cover joint gap
    const ex0 = p0[0] - ux * ext, ey0 = p0[1] - uy * ext;
    const ex1 = p1[0] + ux * ext, ey1 = p1[1] + uy * ext;
    return [[ex0 + nx, ey0 + ny], [ex0 - nx, ey0 - ny], [ex1 + nx, ey1 + ny], [ex1 - nx, ey1 - ny]];
}