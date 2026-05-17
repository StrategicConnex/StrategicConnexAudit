/**
 * Custom GLSL Shaders for the Premium AI Core Particle Engine.
 * Fully GPU-accelerated vertex displacement, Ashima Simplex 3D Noise,
 * and circular soft-edge fragment blending.
 */

export const AiCoreShader = {
  vertexShader: `
    uniform float uTime;
    uniform vec3 uMouse;
    uniform float uHover;
    uniform float uRadius;
    uniform float uType; // 0.0 = Inner Core, 1.0 = Outer Shell

    attribute float aRandom;
    attribute float aScale;

    varying vec3 vPosition;
    varying float vType;
    varying float vAlpha;

    // ─── Ashima Arts 3D Simplex Noise ─────────────────────────────────────────────
    vec4 permute(vec4 x) { return mod(((x*34.0)+1.0)*x, 289.0); }
    vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

    float snoise(vec3 v) {
      const vec2 C = vec2(1.0/6.0, 1.0/3.0);
      const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

      // First corner
      vec3 i  = floor(v + dot(v, C.yyy));
      vec3 x0 = v - i + dot(i, C.xxx);

      // Other corners
      vec3 g = step(x0.yzx, x0.xyz);
      vec3 l = 1.0 - g;
      vec3 i1 = min(g.xyz, l.zxy);
      vec3 i2 = max(g.xyz, l.zxy);

      // x0 = x0 - 0. + 0.0 * C
      vec3 x1 = x0 - i1 + 1.0 * C.xxx;
      vec3 x2 = x0 - i2 + 2.0 * C.xxx;
      vec3 x3 = x0 - D.yyy;      // D.yyy = vec3(0.5, 0.5, 0.5)

      // Permutations
      i = mod(i, 289.0);
      vec4 p = permute(permute(permute(
                i.z + vec4(0.0, i1.z, i2.z, 1.0))
              + i.y + vec4(0.0, i1.y, i2.y, 1.0))
              + i.x + vec4(0.0, i1.x, i2.x, 1.0));

      // Gradients
      // (N*N points uniformly distributed on a grid, mapped onto a 3-sphere)
      float n_ = 0.142857142857; // 1.0/7.0
      vec3  ns = n_ * D.wyz - D.xzx;

      vec4 j = p - 49.0 * floor(p * ns.z);  //  mod(p,7*7)

      vec4 x_ = floor(j * ns.z);
      vec4 y_ = floor(j - 7.0 * x_);    // mod(j,N)

      vec4 x = x_ *ns.x + ns.yyyy;
      vec4 y = y_ *ns.x + ns.yyyy;
      vec4 h = 1.0 - abs(x) - abs(y);

      vec4 b0 = vec4(x.xy, y.xy);
      vec4 b1 = vec4(x.zw, y.zw);

      vec4 s0 = floor(b0)*2.0 + 1.0;
      vec4 s1 = floor(b1)*2.0 + 1.0;
      vec4 sh = -step(h, vec4(0.0));

      vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
      vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;

      vec3 p0 = vec3(a0.xy, h.x);
      vec3 p1 = vec3(a0.zw, h.y);
      vec3 p2 = vec3(a1.xy, h.z);
      vec3 p3 = vec3(a1.zw, h.w);

      // Normalise gradients
      vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
      p0 *= norm.x;
      p1 *= norm.y;
      p2 *= norm.z;
      p3 *= norm.w;

      // Mix final noise value
      vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
      m = m * m;
      return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1),
                                  dot(p2,x2), dot(p3,x3)));
    }

    // ─── 3D Curl Noise Approximation ──────────────────────────────────────────────
    vec3 curlNoise(vec3 p, float time) {
      const float e = 0.1;
      float dx = snoise(p + vec3(e, 0.0, 0.0) + time) - snoise(p - vec3(e, 0.0, 0.0) + time);
      float dy = snoise(p + vec3(0.0, e, 0.0) + time) - snoise(p - vec3(0.0, e, 0.0) + time);
      float dz = snoise(p + vec3(0.0, 0.0, e) + time) - snoise(p - vec3(0.0, 0.0, e) + time);
      return normalize(vec3(dy - dz, dz - dx, dx - dy));
    }

    // ─── Rotation Utilities ────────────────────────────────────────────────────────
    mat3 rotationY(float angle) {
      float c = cos(angle);
      float s = sin(angle);
      return mat3(
        c, 0.0, -s,
        0.0, 1.0, 0.0,
        s, 0.0, c
      );
    }

    mat3 rotationZ(float angle) {
      float c = cos(angle);
      float s = sin(angle);
      return mat3(
        c, s, 0.0,
        -s, c, 0.0,
        0.0, 0.0, 1.0
      );
    }

    void main() {
      vType = uType;
      vec3 pos = position;

      if (uType < 0.5) {
        // ─── Inner Core: Neural Flow with High-Freq Curl Noise ───
        float timeScale = uTime * 0.6 + aRandom * 5.0;
        vec3 flow = curlNoise(pos * 2.2 + aRandom, timeScale);
        
        // Fluid noise breathing
        pos += flow * (0.08 + 0.04 * sin(uTime + aRandom * 6.28));
        
        // Dynamic radial pulsing
        float pulse = sin(uTime * 1.5 + aRandom * 3.14) * 0.03;
        pos += normalize(pos) * pulse;

        vAlpha = 0.8 + 0.2 * sin(uTime * 2.0 + aRandom * 6.28);
      } else {
        // ─── Outer Shell: Hollow Spherical Orbiting Shell ───
        // Multidimensional slow rotation
        float rotY = uTime * 0.12 + aRandom * 0.1;
        float rotZ = uTime * 0.06;
        pos = rotationY(rotY) * rotationZ(rotZ) * pos;

        // Slow atmospheric breathing wave
        float breath = sin(uTime * 0.8 + aRandom * 6.28) * 0.05;
        pos += normalize(pos) * breath;

        vAlpha = 0.45 + 0.25 * sin(uTime * 0.5 + aRandom * 3.14);
      }

      // ─── Mouse Ray Interaction ───
      // Calculate distance between animated particle and mouse ray
      float distToMouse = distance(pos, uMouse);
      if (distToMouse < 0.65) {
        // Elegant magnetic push-away action with soft falloff
        float force = (1.0 - (distToMouse / 0.65)) * 0.15 * uHover;
        vec3 dir = normalize(pos - uMouse);
        if (length(dir) > 0.001) {
          pos += dir * force;
        }
      }

      // Apply base scaling
      pos *= uRadius;
      vPosition = pos;

      // Transform coordinate to camera projection view
      vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
      gl_Position = projectionMatrix * mvPosition;

      // Camera distance attenuation for realistic 3D depth feeling
      float pScale = aScale * (uType < 0.5 ? 0.5 : 1.0);
      gl_PointSize = pScale * (25.0 / -mvPosition.z);
    }
  `,
  fragmentShader: `
    uniform float uTime;
    
    varying vec3 vPosition;
    varying float vType;
    varying float vAlpha;

    void main() {
      // Shape point into a beautiful soft-edged anti-aliased Gaussian circle
      vec2 center = gl_PointCoord - vec2(0.5);
      float dist = length(center);
      if (dist > 0.5) discard;

      // Exponential light decay to replicate premium volumetric glass glow
      float lightGlow = exp(-28.0 * dist * dist);
      float alpha = lightGlow * vAlpha;

      // ─── Volumetric Color Grading ───
      vec3 color = vec3(0.0);

      if (vType < 0.5) {
        // Inner Core: Sophisticated Deep Violet, Energetic Magenta, and Bright Accent Orange
        vec3 deepPurple = vec3(0.32, 0.12, 0.8);
        vec3 magenta    = vec3(0.85, 0.05, 0.58);
        vec3 neonOrange  = vec3(1.0, 0.42, 0.08);

        // Mix based on radial coordinate & dynamic sine sweep
        float mixVal1 = sin(length(vPosition) * 4.0 - uTime * 1.2) * 0.5 + 0.5;
        float mixVal2 = sin(vPosition.y * 2.5 + uTime * 0.8) * 0.5 + 0.5;

        vec3 coreGrad = mix(deepPurple, magenta, mixVal1);
        color = mix(coreGrad, neonOrange, mixVal2 * 0.35); // Subtle active scanning highlights
      } else {
        // Outer Shell: Premium Electric Cyan, Translucent Amethyst, and Slate Blue
        vec3 electricCyan = vec3(0.0, 0.71, 0.83);
        vec3 deepPurple   = vec3(0.38, 0.18, 0.84);
        vec3 slateBlue    = vec3(0.08, 0.22, 0.5);

        float mixVal = sin(vPosition.x * 1.5 + vPosition.z * 1.5 + uTime * 0.5) * 0.5 + 0.5;
        color = mix(electricCyan, deepPurple, mixVal);
        color = mix(color, slateBlue, 0.2); // Cool deep border tones
      }

      // Apply additive intensity boost at the particle center
      color += vec3(lightGlow * 0.25);

      gl_FragColor = vec4(color, alpha);
    }
  `
};
