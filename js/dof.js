import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

/* Gather-based depth of field with bokeh-weighted highlights.
   Reads the scene depth from the composer's read buffer (depthTexture). */
export class DOFPass extends Pass {
  constructor(camera) {
    super();
    this.camera = camera;
    this.focus = 1.75;
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        tColor: { value: null }, tDepth: { value: null },
        near: { value: camera.near }, far: { value: camera.far },
        focus: { value: 1.75 }, aperture: { value: 1.0 }, maxBlur: { value: 14 }, fgK: { value: 0.12 },
        res: { value: new THREE.Vector2(1, 1) },
      },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: `
        uniform sampler2D tColor; uniform sampler2D tDepth;
        uniform float near; uniform float far; uniform float focus; uniform float aperture; uniform float maxBlur; uniform float fgK;
        uniform vec2 res; varying vec2 vUv;
        float lin(vec2 uv){ float z = texture2D(tDepth, uv).x; float n = z*2.0-1.0; return (2.0*near*far)/(far+near - n*(far-near)); }
        float coc(float d){ float k = d < focus ? fgK : 1.0; float x = max(abs(d - focus) - 0.25, 0.0); return clamp(aperture * k * x / max(d, 0.001), 0.0, 1.0) * maxBlur; }
        void main(){
          float d = lin(vUv); float c = coc(d);
          vec3 base = texture2D(tColor, vUv).rgb;
          if (c < 0.6) { gl_FragColor = vec4(base, 1.0); return; }
          float jit = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) * 6.2831;
          vec3 acc = base; float wsum = 1.0;
          const int N = 28; const float GA = 2.39996323;
          for (int i = 0; i < N; i++) {
            float fr = sqrt((float(i) + 0.5) / float(N));
            float th = float(i) * GA + jit;
            vec2 o = vec2(cos(th), sin(th)) * fr * c / res;
            vec2 uv2 = clamp(vUv + o, vec2(0.001), vec2(0.999));
            float d2 = lin(uv2); float c2 = coc(d2);
            float cs = d2 > d ? min(c2, c) : c2;
            float w = smoothstep(fr * c - 1.5, fr * c + 0.5, cs);
            vec3 col = texture2D(tColor, uv2).rgb;
            float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
            w *= 1.0 + 1.2 * smoothstep(1.0, 3.0, l);
            acc += col * w; wsum += w;
          }
          gl_FragColor = vec4(acc / wsum, 1.0);
        }`,
    });
    this.fsq = new FullScreenQuad(this.mat);
  }
  setSize(w, h) { this.mat.uniforms.res.value.set(w, h); }
  render(renderer, writeBuffer, readBuffer) {
    const u = this.mat.uniforms;
    u.tColor.value = readBuffer.texture; u.tDepth.value = readBuffer.depthTexture;
    u.near.value = this.camera.near; u.far.value = this.camera.far; u.focus.value = this.focus;
    u.maxBlur.value = 14 * (u.res.value.y / 1000);
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.fsq.render(renderer);
  }
  dispose() { this.mat.dispose(); this.fsq.dispose(); }
}
