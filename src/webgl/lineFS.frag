precision mediump float;
varying float vCross;
void main() {
  vec4 color = abs(vCross) < 0.5 ? vec4(1.0) : vec4(0.0); // hard edge, no smoothstep
  gl_FragColor = color;
}