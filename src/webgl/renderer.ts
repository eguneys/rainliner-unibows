import quadVS from './quadVS.vert'
import quadFS from './quadFS.frag'

export class WebGlRenderer {

    canvasWidth!: number
    canvasHeight!: number

    setCanvasBounds(clientWidth: number, clientHeight: number) {
        this.canvasWidth = clientWidth
        this.canvasHeight = clientHeight
    }

    quadProgram: WebGLProgram
    a_positionLocation: number
    a_texCoordLocation: number
    u_textureLocation: WebGLUniformLocation



    quadBuffer: WebGLBuffer

    fbo: WebGLFramebuffer
    tex: WebGLTexture

    constructor(readonly gl: WebGL2RenderingContext, readonly gameWidth: number, readonly gameHeight: number) {
        this.fbo = gl.createFramebuffer()
        this.tex = gl.createTexture()



        gl.bindTexture(gl.TEXTURE_2D, this.tex)

        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.gameWidth, this.gameHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo)
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.tex, 0)


        const quadVertices = new Float32Array([
            -1, -1, 0, 0,
            1, -1, 1, 0,
            -1, 1, 0, 1,

            -1, 1, 0, 1,
            1, -1, 1, 0,
            1, 1, 1, 1,
        ])

        const quadBuffer = gl.createBuffer()
        gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer)
        gl.bufferData(gl.ARRAY_BUFFER, quadVertices, gl.STATIC_DRAW)
        this.quadBuffer = quadBuffer



        const quadProgram = createProgram(gl, quadVS, quadFS)!

        const a_positionLocation = gl.getAttribLocation(quadProgram, 'a_position')
        const a_texCoordLocation = gl.getAttribLocation(quadProgram, 'a_texCoord')

        const u_textureLocation = gl.getUniformLocation(quadProgram, 'u_texture')!

        this.quadProgram = quadProgram
        this.a_positionLocation = a_positionLocation
        this.a_texCoordLocation = a_texCoordLocation
        this.u_textureLocation = u_textureLocation


    }


    beginRender() {
        let { gl } = this
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo)
        gl.viewport(0, 0, this.gameWidth, this.gameHeight)

        gl.clearColor(0, 0, 0, 1)
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)

        // draw Scene
    }

    endRender() {
        let { gl } = this
        gl.bindFramebuffer(gl.FRAMEBUFFER, null)
        gl.viewport(0, 0, this.canvasWidth, this.canvasHeight)

        gl.clearColor(1, 0, 0, 1)
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)


        gl.useProgram(this.quadProgram)

        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, this.tex)
        gl.uniform1i(this.u_textureLocation, 0)

        gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer)

        const stride = 4 * Float32Array.BYTES_PER_ELEMENT

        gl.enableVertexAttribArray(this.a_positionLocation)
        gl.vertexAttribPointer(this.a_positionLocation, 2, gl.FLOAT, false, stride, 0)

        gl.enableVertexAttribArray(this.a_texCoordLocation)
        gl.vertexAttribPointer(this.a_texCoordLocation, 2, gl.FLOAT, false, stride, 2 * Float32Array.BYTES_PER_ELEMENT)

        gl.drawArrays(gl.TRIANGLES, 0, 6)
    }

}

// Helper to compile individual shaders (Vertex or Fragment)
function createShader(gl: WebGL2RenderingContext, type: number, source: string) {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error('Shader compilation error:', gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
    }
    return shader;
}

// Helper to link vertex and fragment shaders into a program
export function createProgram(gl: WebGL2RenderingContext, vsSource: string, fsSource: string) {
    const vertexShader = createShader(gl, gl.VERTEX_SHADER, vsSource)!;
    const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fsSource)!;

    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error('Program linking error:', gl.getProgramInfoLog(program));
        gl.deleteProgram(program);
        return null;
    }
    return program;
}

