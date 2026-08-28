attribute vec2 a_position;
attribute float a_Cross;
attribute vec4 a_Color;
varying float vCross;
varying vec4 vColor;

uniform mat4 u_matrix; // projection * view * model combined

void main() {
    gl_Position = u_matrix * vec4(a_position, 0.0, 1.0);
    vCross = a_Cross;
    vColor = a_Color;
}