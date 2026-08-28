precision mediump float;
varying float vCross;
varying vec4 vColor;

void main() {
  vec4 color = abs(vCross) < 0.5 ? vColor : vec4(0.0); // hard edge, no smoothstep
  gl_FragColor = color;
}