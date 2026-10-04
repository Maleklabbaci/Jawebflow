import React, { useEffect, useRef } from 'react';

const CFG = {
  top: '/jawebfemme.jpg',
  bottom: '/jawebbot.jpg',
  brush: 0.15,
  fade: 0.004,
  follow: 22,
  diffuse: 0.55,
  flow: 2.4,
  refract: 0.12,
};


const VERT = `#version 300 es
out vec2 vUv;
void main(){ vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2); vUv = p; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;

const NOISE = `
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1,0)), f.x), mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x), f.y); }
float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++){ v += a * noise(p); p = p * 2.03 + vec2(17.1, 9.2); a *= 0.5; } return v; }`;

const SIM_FRAG = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uPrev; uniform vec2 uTexel;
uniform float uTime, uDecay, uAspect, uFlow, uDiffuse;
uniform vec4 uSplats[24]; uniform int uCount;
${NOISE}
void main(){
  vec2 uv = vUv, asp = vec2(uAspect, 1.0);
  vec2 flow = (vec2(fbm(uv * asp * 3.0 + uTime * 0.15), fbm(uv * asp * 3.0 + vec2(5.2, 1.3) - uTime * 0.15)) - 0.47) * uFlow * uTexel;
  float c = texture(uPrev, uv - flow).r;
  float n = (texture(uPrev, uv + vec2(uTexel.x, 0.0)).r + texture(uPrev, uv - vec2(uTexel.x, 0.0)).r
           + texture(uPrev, uv + vec2(0.0, uTexel.y)).r + texture(uPrev, uv - vec2(0.0, uTexel.y)).r) * 0.25;
  float d = max(mix(c, n, uDiffuse) - uDecay, 0.0);
  for (int i = 0; i < 24; i++){
    if (i >= uCount) break;
    vec4 s = uSplats[i];
    float r = length((uv - s.xy) * asp) / s.z;
    r += (fbm(uv * asp * 14.0 + s.xy * 7.0) - 0.47) * 0.6;
    d = max(d, (1.0 - smoothstep(0.35, 1.0, r)) * s.w);
  }
  o = vec4(d, 0.0, 0.0, 1.0);
}`;

const REN_FRAG = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uInk, uTop, uBottom;
uniform vec2 uTexel, uTopS, uBotS;
uniform float uTime, uAspect, uRefract;
${NOISE}
vec2 cover(vec2 uv, vec2 s){ return uv * s + (1.0 - s) * vec2(0.85, 0.5); }
void main(){
  vec2 uv = vUv, asp = vec2(uAspect, 1.0);
  float d = texture(uInk, uv).r;
  vec2 e = uTexel * 2.0;
  vec2 g = vec2(texture(uInk, uv + vec2(e.x, 0.0)).r - texture(uInk, uv - vec2(e.x, 0.0)).r,
                texture(uInk, uv + vec2(0.0, e.y)).r - texture(uInk, uv - vec2(0.0, e.y)).r);
  float nl = fbm(uv * asp * 6.0 + uTime * 0.05) - 0.47;
  float nh = noise(uv * asp * 70.0 + uTime * 0.2) - 0.5;
  float field = d + nl * 0.32 * smoothstep(0.0, 0.35, d)
    + nh * 0.8 * smoothstep(0.05, 0.3, d) * (1.0 - smoothstep(0.4, 0.6, d));
  vec3 T = texture(uTop,    cover(uv + g * uRefract * 0.4, uTopS)).rgb;
  vec3 B = texture(uBottom, cover(uv - g * uRefract,       uBotS)).rgb;
  float aa = fwidth(field) * 0.8 + 0.004;
  o = vec4(mix(T, B, smoothstep(0.5 - aa, 0.5 + aa, field)), 1.0);
}`;

interface LoadedTexture {
  image: HTMLImageElement;
  texture: WebGLTexture;
}

export const HeroInkReveal: React.FC = () => {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const host = canvas?.parentElement;
    if (!canvas || !host) return;
    canvas.style.visibility = 'hidden';

    const showDefaultPhoto = () => {
      canvas.style.visibility = 'hidden';
      host.style.backgroundColor = '#fff';
      host.style.backgroundImage = `url("${CFG.top}")`;
      host.style.backgroundPosition = 'right center';
      host.style.backgroundRepeat = 'no-repeat';
      host.style.backgroundSize = 'cover';
    };

    // Le visuel reste disponible même sur un navigateur sans WebGL2.
    if (typeof WebGL2RenderingContext === 'undefined') {
      showDefaultPhoto();
      return;
    }

    let gl: WebGL2RenderingContext | null = null;
    try {
      gl = canvas.getContext('webgl2', { antialias: false, alpha: false });
    } catch {
      showDefaultPhoto();
      return;
    }
    if (!gl) {
      showDefaultPhoto();
      return;
    }

    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const flow = reducedMotion ? 0 : CFG.flow;
    const refraction = reducedMotion ? 0 : CFG.refract;
    const floatColor = gl.getExtension('EXT_color_buffer_float');
    const simulationFormat = floatColor
      ? { internal: gl.RGBA16F, type: gl.HALF_FLOAT }
      : { internal: gl.RGBA8, type: gl.UNSIGNED_BYTE };

    let alive = true;
    let animationFrame = 0;
    let resizeObserver: ResizeObserver | null = null;
    let simProgram: WebGLProgram | null = null;
    let renderProgram: WebGLProgram | null = null;
    let vertexArray: WebGLVertexArrayObject | null = null;
    let topTexture: LoadedTexture | null = null;
    let bottomTexture: LoadedTexture | null = null;
    let simulations: { texture: WebGLTexture; framebuffer: WebGLFramebuffer }[] = [];
    let simulationWidth = 2;
    let simulationHeight = 2;
    let canvasWidth = 1;
    let canvasHeight = 1;
    let readIndex = 0;
    const uniforms = new WeakMap<WebGLProgram, Map<string, WebGLUniformLocation | null>>();

    const showFallback = () => {
      if (alive) showDefaultPhoto();
    };

    const compileShader = (type: number, source: string): WebGLShader => {
      const shader = gl!.createShader(type);
      if (!shader) throw new Error('Impossible de créer le shader.');
      gl!.shaderSource(shader, source);
      gl!.compileShader(shader);
      if (!gl!.getShaderParameter(shader, gl!.COMPILE_STATUS)) {
        const message = gl!.getShaderInfoLog(shader) || 'Erreur de compilation du shader.';
        gl!.deleteShader(shader);
        throw new Error(message);
      }
      return shader;
    };

    const createProgram = (fragmentSource: string): WebGLProgram => {
      const vertexShader = compileShader(gl!.VERTEX_SHADER, VERT);
      const fragmentShader = compileShader(gl!.FRAGMENT_SHADER, fragmentSource);
      const program = gl!.createProgram();
      if (!program) throw new Error('Impossible de créer le programme WebGL.');
      gl!.attachShader(program, vertexShader);
      gl!.attachShader(program, fragmentShader);
      gl!.linkProgram(program);
      gl!.deleteShader(vertexShader);
      gl!.deleteShader(fragmentShader);
      if (!gl!.getProgramParameter(program, gl!.LINK_STATUS)) {
        const message = gl!.getProgramInfoLog(program) || 'Erreur de liaison du programme WebGL.';
        gl!.deleteProgram(program);
        throw new Error(message);
      }
      return program;
    };

    const uniform = (program: WebGLProgram, name: string) => {
      let locations = uniforms.get(program);
      if (!locations) {
        locations = new Map();
        uniforms.set(program, locations);
      }
      if (!locations.has(name)) locations.set(name, gl!.getUniformLocation(program, name));
      return locations.get(name) ?? null;
    };

    const loadTexture = (source: string): Promise<LoadedTexture> => new Promise((resolve, reject) => {
      const image = new Image();
      // Imgbb sert les fichiers depuis un autre domaine : le mode CORS est nécessaire pour WebGL.
      image.crossOrigin = 'anonymous';
      image.decoding = 'async';
      image.onload = () => {
        try {
          const texture = gl!.createTexture();
          if (!texture) throw new Error('Impossible de créer la texture WebGL.');
          gl!.bindTexture(gl!.TEXTURE_2D, texture);
          gl!.pixelStorei(gl!.UNPACK_FLIP_Y_WEBGL, true);
          gl!.texImage2D(gl!.TEXTURE_2D, 0, gl!.RGBA, gl!.RGBA, gl!.UNSIGNED_BYTE, image);
          gl!.generateMipmap(gl!.TEXTURE_2D);
          gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MIN_FILTER, gl!.LINEAR_MIPMAP_LINEAR);
          gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MAG_FILTER, gl!.LINEAR);
          gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_S, gl!.CLAMP_TO_EDGE);
          gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_T, gl!.CLAMP_TO_EDGE);
          resolve({ image, texture });
        } catch (error) {
          reject(error);
        }
      };
      image.onerror = () => reject(new Error(`Impossible de charger l’image ${source}.`));
      image.src = source;
    });

    const deleteSimulations = () => {
      simulations.forEach(({ texture, framebuffer }) => {
        gl!.deleteTexture(texture);
        gl!.deleteFramebuffer(framebuffer);
      });
      simulations = [];
    };

    const buildSimulation = () => {
      deleteSimulations();
      simulations = [0, 1].map(() => {
        const texture = gl!.createTexture();
        const framebuffer = gl!.createFramebuffer();
        if (!texture || !framebuffer) throw new Error('Impossible de créer le tampon WebGL.');
        gl!.bindTexture(gl!.TEXTURE_2D, texture);
        gl!.texImage2D(
          gl!.TEXTURE_2D,
          0,
          simulationFormat.internal,
          simulationWidth,
          simulationHeight,
          0,
          gl!.RGBA,
          simulationFormat.type,
          null,
        );
        gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MIN_FILTER, gl!.LINEAR);
        gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MAG_FILTER, gl!.LINEAR);
        gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_S, gl!.CLAMP_TO_EDGE);
        gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_T, gl!.CLAMP_TO_EDGE);
        gl!.bindFramebuffer(gl!.FRAMEBUFFER, framebuffer);
        gl!.framebufferTexture2D(gl!.FRAMEBUFFER, gl!.COLOR_ATTACHMENT0, gl!.TEXTURE_2D, texture, 0);
        gl!.clearColor(0, 0, 0, 1);
        gl!.clear(gl!.COLOR_BUFFER_BIT);
        return { texture, framebuffer };
      });
      gl!.bindFramebuffer(gl!.FRAMEBUFFER, null);
      readIndex = 0;
    };

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 1.75);
      canvasWidth = host.clientWidth;
      canvasHeight = host.clientHeight;
      if (!canvasWidth || !canvasHeight) return;
      canvas.width = Math.round(canvasWidth * ratio);
      canvas.height = Math.round(canvasHeight * ratio);
      const scale = Math.min(1, 700 / Math.max(canvasWidth, canvasHeight));
      simulationWidth = Math.max(2, Math.round(canvasWidth * scale));
      simulationHeight = Math.max(2, Math.round(canvasHeight * scale));
      buildSimulation();
    };

    try {
      simProgram = createProgram(SIM_FRAG);
      renderProgram = createProgram(REN_FRAG);
      vertexArray = gl.createVertexArray();
      if (!vertexArray) throw new Error('Impossible de créer le vertex array WebGL.');
      gl.bindVertexArray(vertexArray);
    } catch {
      showFallback();
      if (simProgram) gl.deleteProgram(simProgram);
      if (renderProgram) gl.deleteProgram(renderProgram);
      return;
    }

    const pointer = { targetX: 0.5, targetY: 0.5, x: 0.5, y: 0.5, inside: false, radius: CFG.brush };
    const drops: { x: number; y: number; age: number }[] = [];
    const splatArray = new Float32Array(24 * 4);
    const textureSizes = (image: HTMLImageElement, aspect: number): [number, number] => {
      const imageAspect = image.width / image.height;
      return aspect > imageAspect ? [aspect / imageAspect, 1] : [1, imageAspect / aspect];
    };
    const uvFromPointer = (event: PointerEvent): [number, number] => {
      const rect = canvas.getBoundingClientRect();
      return [(event.clientX - rect.left) / rect.width, 1 - (event.clientY - rect.top) / rect.height];
    };
    const onPointerEnter = (event: PointerEvent) => {
      const [x, y] = uvFromPointer(event);
      pointer.x = pointer.targetX = x;
      pointer.y = pointer.targetY = y;
      pointer.inside = true;
    };
    const onPointerMove = (event: PointerEvent) => {
      const [x, y] = uvFromPointer(event);
      pointer.targetX = x;
      pointer.targetY = y;
      pointer.inside = true;
    };
    const onPointerLeave = () => { pointer.inside = false; };
    const onPointerDown = (event: PointerEvent) => {
      if ((event.target as Element).closest?.('button, a')) return;
      const [x, y] = uvFromPointer(event);
      pointer.x = pointer.targetX = x;
      pointer.y = pointer.targetY = y;
      drops.push({ x, y, age: 0 });
    };

    const zone = (canvas.closest('section') as HTMLElement | null) || host;
    zone.addEventListener('pointerenter', onPointerEnter);
    zone.addEventListener('pointermove', onPointerMove);
    zone.addEventListener('pointerleave', onPointerLeave);
    zone.addEventListener('pointerdown', onPointerDown);

    let startTime = performance.now();
    let lastTime = startTime;
    const frame = (now: number) => {
      if (!alive || !topTexture || !bottomTexture || !simProgram || !renderProgram || simulations.length !== 2) return;
      const delta = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;
      const time = (now - startTime) / 1000;
      const aspect = canvasWidth / canvasHeight;
      const splats: number[] = [];

      if (pointer.inside) {
        const previousX = pointer.x;
        const previousY = pointer.y;
        const easing = 1 - Math.exp(-delta * CFG.follow);
        pointer.x += (pointer.targetX - pointer.x) * easing;
        pointer.y += (pointer.targetY - pointer.y) * easing;
        const distance = Math.hypot((pointer.x - previousX) * aspect, pointer.y - previousY);
        pointer.radius += (CFG.brush * (0.7 + Math.min(distance / Math.max(delta, 1e-3) / 2.5, 1) * 0.9) - pointer.radius) * 0.25;
        if (distance > 1e-5) {
          const steps = Math.min(16, Math.max(1, Math.ceil(distance / Math.max(pointer.radius * 0.3, 1e-4))));
          for (let i = 1; i <= steps; i++) {
            splats.push(
              previousX + (pointer.x - previousX) * i / steps,
              previousY + (pointer.y - previousY) * i / steps,
              pointer.radius,
              1,
            );
          }
        }
      } else {
        pointer.x = pointer.targetX;
        pointer.y = pointer.targetY;
      }

      for (let index = drops.length - 1; index >= 0; index--) {
        const drop = drops[index];
        drop.age += delta;
        const progress = drop.age / 0.75;
        const eased = 1 - Math.pow(1 - Math.min(progress, 1), 3);
        splats.push(drop.x, drop.y, CFG.brush * (0.4 + 3.2 * eased), 1);
        if (progress >= 1) drops.splice(index, 1);
      }
      const count = Math.min(24, splats.length / 4);
      splatArray.fill(0);
      splatArray.set(splats.slice(0, count * 4));

      gl!.useProgram(simProgram);
      gl!.bindVertexArray(vertexArray);
      gl!.bindFramebuffer(gl!.FRAMEBUFFER, simulations[1 - readIndex].framebuffer);
      gl!.viewport(0, 0, simulationWidth, simulationHeight);
      gl!.activeTexture(gl!.TEXTURE0);
      gl!.bindTexture(gl!.TEXTURE_2D, simulations[readIndex].texture);
      gl!.uniform1i(uniform(simProgram, 'uPrev'), 0);
      gl!.uniform2f(uniform(simProgram, 'uTexel'), 1 / simulationWidth, 1 / simulationHeight);
      gl!.uniform1f(uniform(simProgram, 'uTime'), time);
      gl!.uniform1f(uniform(simProgram, 'uDecay'), Math.max(CFG.fade * delta * 60, floatColor ? 0 : 0.005));
      gl!.uniform1f(uniform(simProgram, 'uAspect'), aspect);
      gl!.uniform1f(uniform(simProgram, 'uFlow'), flow);
      gl!.uniform1f(uniform(simProgram, 'uDiffuse'), CFG.diffuse);
      gl!.uniform4fv(uniform(simProgram, 'uSplats[0]'), splatArray);
      gl!.uniform1i(uniform(simProgram, 'uCount'), count);
      gl!.drawArrays(gl!.TRIANGLES, 0, 3);
      readIndex = 1 - readIndex;

      gl!.useProgram(renderProgram);
      gl!.bindFramebuffer(gl!.FRAMEBUFFER, null);
      gl!.viewport(0, 0, canvas.width, canvas.height);
      gl!.activeTexture(gl!.TEXTURE0);
      gl!.bindTexture(gl!.TEXTURE_2D, simulations[readIndex].texture);
      gl!.activeTexture(gl!.TEXTURE1);
      gl!.bindTexture(gl!.TEXTURE_2D, topTexture.texture);
      gl!.activeTexture(gl!.TEXTURE2);
      gl!.bindTexture(gl!.TEXTURE_2D, bottomTexture.texture);
      gl!.uniform1i(uniform(renderProgram, 'uInk'), 0);
      gl!.uniform1i(uniform(renderProgram, 'uTop'), 1);
      gl!.uniform1i(uniform(renderProgram, 'uBottom'), 2);
      gl!.uniform2f(uniform(renderProgram, 'uTexel'), 1 / simulationWidth, 1 / simulationHeight);
      gl!.uniform2fv(uniform(renderProgram, 'uTopS'), textureSizes(topTexture.image, aspect));
      gl!.uniform2fv(uniform(renderProgram, 'uBotS'), textureSizes(bottomTexture.image, aspect));
      gl!.uniform1f(uniform(renderProgram, 'uTime'), time);
      gl!.uniform1f(uniform(renderProgram, 'uAspect'), aspect);
      gl!.uniform1f(uniform(renderProgram, 'uRefract'), refraction);
      gl!.drawArrays(gl!.TRIANGLES, 0, 3);
      animationFrame = requestAnimationFrame(frame);
    };

    const cleanup = () => {
      alive = false;
      cancelAnimationFrame(animationFrame);
      resizeObserver?.disconnect();
      window.removeEventListener('resize', resize);
      zone.removeEventListener('pointerenter', onPointerEnter);
      zone.removeEventListener('pointermove', onPointerMove);
      zone.removeEventListener('pointerleave', onPointerLeave);
      zone.removeEventListener('pointerdown', onPointerDown);
      deleteSimulations();
      if (topTexture) gl!.deleteTexture(topTexture.texture);
      if (bottomTexture) gl!.deleteTexture(bottomTexture.texture);
      if (simProgram) gl!.deleteProgram(simProgram);
      if (renderProgram) gl!.deleteProgram(renderProgram);
      if (vertexArray) gl!.deleteVertexArray(vertexArray);
    };

    Promise.all([loadTexture(CFG.top), loadTexture(CFG.bottom)]).then(([top, bottom]) => {
      if (!alive) {
        gl!.deleteTexture(top.texture);
        gl!.deleteTexture(bottom.texture);
        return;
      }
      topTexture = top;
      bottomTexture = bottom;
      canvas.style.visibility = 'visible';
      host.style.backgroundImage = 'none';
      resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
      resizeObserver?.observe(host);
      window.addEventListener('resize', resize, { passive: true });
      resize();
      startTime = lastTime = performance.now();
      animationFrame = requestAnimationFrame(frame);
    }).catch(() => {
      showFallback();
      deleteSimulations();
      if (topTexture) gl!.deleteTexture(topTexture.texture);
      if (bottomTexture) gl!.deleteTexture(bottomTexture.texture);
    });

    return cleanup;
  }, []);

  return (
    <div
      id="hero-ink-reveal"
      data-default-image={CFG.top}
      data-reveal-image={CFG.bottom}
      className="relative aspect-[16/11] touch-pan-y cursor-crosshair md:absolute md:inset-0 md:aspect-auto"
    >
      <canvas
        ref={ref}
        role="img"
        aria-label="Visuel interactif : la photo d’une femme devient un robot sous l’effet de l’encre"
        className="absolute inset-0 block h-full w-full"
      />
    </div>
  );
};
