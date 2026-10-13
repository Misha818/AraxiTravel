/*
 * Araxi Travel landing page: hero slider, journey cards, header and navigation.
 *
 * The hero recreates the AirPano (krpano) home slider with flat images:
 *  - each slide is projected onto a cylinder and the camera slowly pans across it,
 *    like krpano's autorotate over a panorama;
 *  - arrows and autoplay switch slides with an "open blend" (a soft-edged iris that
 *    grows from the centre while the old view flies forward), autoplay alternates it
 *    with a "zoom blend", and the dots use a short cross-fade, as on AirPano.
 * WebGL does the rendering; without WebGL, or with prefers-reduced-motion, a DOM
 * renderer with CSS transitions is used instead.
 *
 * Form handling (/subscribe, /client-message) lives in script.js; the header (menu, solid look
 * on scroll) in site-chrome.js.
 */
(function () {
    'use strict';

    const config = JSON.parse(document.getElementById('landing-config').textContent);
    const i18n = config.i18n;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function post(url, fields) {
        const formData = new FormData();
        Object.keys(fields || {}).forEach(function (key) { formData.append(key, fields[key]); });
        return fetch(url, {
            method: 'POST',
            body: formData,
            credentials: 'same-origin',
            headers: { 'X-CSRFToken': csrfToken }
        }).then(function (response) {
            if (!response.ok) throw new Error(url + ' ' + response.status);
            return response.json();
        }).then(function (json) {
            const token = json.newCSRFtoken || json.csrfToken;
            if (token) csrfToken = token;
            return json;
        });
    }

    // Only http(s) and relative links; anything else (javascript: etc.) is dropped.
    function safeHref(value) {
        if (!value || typeof value !== 'string') return '';
        try {
            const url = new URL(value.trim(), window.location.origin + '/');
            return (url.protocol === 'http:' || url.protocol === 'https:') ? url.href : '';
        } catch (e) {
            return '';
        }
    }

    // Title/subtitle formatting set in Staff > Slides (runs, see sanitize_text_format in sysadmin.py).
    // Built with textContent only; runs that do not spell the plain text are ignored.
    const SAFE_COLOR = /^(#[0-9a-f]{3,8}|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*(0|1|0?\.\d+)\s*)?\))$/i;

    function renderFormatted(el, text, format) {
        el.textContent = '';
        let runs = null;
        try { runs = format ? JSON.parse(format) : null; } catch (e) { runs = null; }
        if (!Array.isArray(runs) || runs.some(function (run) { return !run || typeof run.t !== 'string'; })
                || runs.map(function (run) { return run.t; }).join('') !== text) {
            el.textContent = text;
            return;
        }
        runs.forEach(function (run) {
            const color = typeof run.c === 'string' && SAFE_COLOR.test(run.c) ? run.c : '';
            if (!run.b && !run.i && !run.u && !color) {
                el.appendChild(document.createTextNode(run.t));
                return;
            }
            const span = document.createElement('span');
            span.textContent = run.t;
            if (run.b) span.classList.add('fmt-b');
            if (run.i) span.classList.add('fmt-i');
            if (run.u) span.classList.add('fmt-u');
            if (color) span.style.color = color;
            el.appendChild(span);
        });
    }

    function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }
    function smoothstep(t) { return t * t * (3 - 2 * t); }
    function easeInOutSine(t) { return -(Math.cos(Math.PI * t) - 1) / 2; }
    function easeInOutCubic(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

    function loadImage(src) {
        return new Promise(function (resolve, reject) {
            const img = new Image();
            img.decoding = 'async';
            img.onload = function () {
                // decode() avoids a jank on first draw, but it can stall in background tabs.
                if (!img.decode) { resolve(img); return; }
                const done = function () { resolve(img); };
                img.decode().then(done, done);
                setTimeout(done, 1000);
            };
            img.onerror = reject;
            img.src = src;
        });
    }

    /* ------------------------------------------------------------------ */
    /* Camera: a flat image wrapped on a cylinder, viewed from its axis.   */
    /* ------------------------------------------------------------------ */

    const VFOV = 62 * Math.PI / 180;       // vertical field of view
    const MIN_ROOM = 0.075;                // minimum pan range on each side (rad)
    const MAX_PAN_SPEED = 0.1;             // ~6 deg/s, close to AirPano's autorotate

    function cameraFor(viewAspect, imageAspect) {
        const t = Math.tan(VFOV / 2);
        const half = Math.atan(t * viewAspect);                  // visible half-angle
        const margin = Math.max(1.03, (half + MIN_ROOM) / (t * imageAspect));
        const span = 2 * t * imageAspect * margin;               // image width as an angle
        return { t: t, span: span, room: span / 2 - half, aspect: imageAspect };
    }

    // Ping-pong pan with eased turns; position s in [0, 1] maps to yaw in [-room, room].
    class Pan {
        constructor(direction) {
            this.s = direction > 0 ? 0 : 1;
            this.dir = direction;
            this.offset = 0;   // manual (drag) offset, eased back into the pan
        }
        step(dt, camera, slideDuration) {     // both in seconds
            if (camera.room <= 0.0001) return 0;
            const pass = Math.max(slideDuration * 1.15, (2 * camera.room / MAX_PAN_SPEED) * 1.5);
            this.s += this.dir * dt / pass;
            if (this.s >= 1) { this.s = 1; this.dir = -1; }
            if (this.s <= 0) { this.s = 0; this.dir = 1; }
            return this.yaw(camera);
        }
        yaw(camera) {
            return clamp(camera.room * (2 * smoothstep(this.s) - 1), -camera.room, camera.room);
        }
        // Continue the pan from an arbitrary yaw (after dragging).
        setYaw(yaw, camera) {
            const target = (clamp(yaw / camera.room, -1, 1) + 1) / 2;
            let lo = 0, hi = 1;
            for (let i = 0; i < 14; i++) {
                const mid = (lo + hi) / 2;
                if (smoothstep(mid) < target) lo = mid; else hi = mid;
            }
            this.s = (lo + hi) / 2;
        }
    }

    /* ------------------------------------------------------------------ */
    /* WebGL renderer                                                      */
    /* ------------------------------------------------------------------ */

    const VERTEX_SHADER = [
        'attribute vec2 aPos;',
        'varying vec2 vPos;',
        'void main() { vPos = aPos; gl_Position = vec4(aPos, 0.0, 1.0); }'
    ].join('\n');

    const FRAGMENT_SHADER = [
        '#ifdef GL_FRAGMENT_PRECISION_HIGH',
        'precision highp float;',
        '#else',
        'precision mediump float;',
        '#endif',
        'varying vec2 vPos;',
        'uniform sampler2D uTexA;',
        'uniform sampler2D uTexB;',
        'uniform vec4 uCamA;',      // x: tan(vfov/2) / zoom, y: yaw, z: span, w: image aspect
        'uniform vec4 uCamB;',
        'uniform float uAspect;',
        'uniform float uMix;',      // 0 = A only, 1 = B only (cross-fade modes)
        'uniform float uIris;',     // 1 = iris reveal, 0 = cross-fade
        'uniform float uRadius;',
        'uniform float uSoft;',
        'vec3 view(sampler2D tex, vec4 cam) {',
        '    float xs = vPos.x * cam.x * uAspect;',
        '    float ys = vPos.y * cam.x;',
        '    float theta = cam.y + atan(xs);',
        '    float h = ys / sqrt(1.0 + xs * xs);',
        '    vec2 uv = vec2(0.5 + theta / cam.z, 0.5 - h * cam.w / cam.z);',
        '    return texture2D(tex, uv).rgb;',
        '}',
        'void main() {',
        '    vec3 color = view(uTexB, uCamB);',
        '    if (uMix < 1.0) {',
        '        vec3 old = view(uTexA, uCamA);',
        '        float k = uMix;',
        '        if (uIris > 0.5) {',
        '            float d = length(vPos * vec2(uAspect, 1.0)) / length(vec2(uAspect, 1.0));',
        '            k = 1.0 - smoothstep(uRadius - uSoft, uRadius, d);',
        '        }',
        '        color = mix(old, color, k);',
        '    }',
        '    float v = length(vPos * vec2(0.9, 1.0));',
        '    color *= mix(1.0, smoothstep(1.75, 0.55, v), 0.35);',
        '    gl_FragColor = vec4(color, 1.0);',
        '}'
    ].join('\n');

    class GLRenderer {
        constructor(stage) {
            this.stage = stage;
            this.canvas = document.createElement('canvas');
            this.canvas.className = 'hero__canvas';
            this.canvas.setAttribute('aria-hidden', 'true');
            const options = { alpha: false, antialias: false, premultipliedAlpha: false, powerPreference: 'high-performance' };
            this.gl = this.canvas.getContext('webgl2', options) || this.canvas.getContext('webgl', options);
            this.isWebGL2 = typeof WebGL2RenderingContext !== 'undefined' && this.gl instanceof WebGL2RenderingContext;
            this.ok = !!this.gl && this.init();
            this.textures = new Map();     // slide index -> { tex, aspect }
        }

        init() {
            const gl = this.gl;
            const compile = function (type, source) {
                const shader = gl.createShader(type);
                gl.shaderSource(shader, source);
                gl.compileShader(shader);
                if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
                    console.error(gl.getShaderInfoLog(shader));
                    return null;
                }
                return shader;
            };
            const vs = compile(gl.VERTEX_SHADER, VERTEX_SHADER);
            const fs = compile(gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
            if (!vs || !fs) return false;
            const program = gl.createProgram();
            gl.attachShader(program, vs);
            gl.attachShader(program, fs);
            gl.linkProgram(program);
            if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return false;
            gl.useProgram(program);

            const buffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
            const aPos = gl.getAttribLocation(program, 'aPos');
            gl.enableVertexAttribArray(aPos);
            gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

            this.u = {};
            ['uTexA', 'uTexB', 'uCamA', 'uCamB', 'uAspect', 'uMix', 'uIris', 'uRadius', 'uSoft'].forEach(function (name) {
                this.u[name] = gl.getUniformLocation(program, name);
            }, this);
            gl.uniform1i(this.u.uTexA, 0);
            gl.uniform1i(this.u.uTexB, 1);

            const coarse = window.matchMedia('(pointer: coarse)').matches;
            this.maxTexture = Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE), coarse ? 2560 : 4096);
            this.stage.appendChild(this.canvas);
            return true;
        }

        resize() {
            const rect = this.stage.getBoundingClientRect();
            const dpr = Math.min(window.devicePixelRatio || 1, rect.width < 900 ? 2 : 1.5);
            const w = Math.max(1, Math.round(rect.width * dpr));
            const h = Math.max(1, Math.round(rect.height * dpr));
            if (this.canvas.width !== w || this.canvas.height !== h) {
                this.canvas.width = w;
                this.canvas.height = h;
                this.gl.viewport(0, 0, w, h);
            }
            return rect.width / Math.max(1, rect.height);
        }

        has(index) { return this.textures.has(index); }

        upload(index, img) {
            if (this.textures.has(index)) return this.textures.get(index);
            const gl = this.gl;
            let source = img;
            const w = img.naturalWidth, h = img.naturalHeight;
            const scale = Math.min(1, this.maxTexture / Math.max(w, h));
            if (scale < 1) {
                const c = document.createElement('canvas');
                c.width = Math.round(w * scale);
                c.height = Math.round(h * scale);
                c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
                source = c;
            }
            const tex = gl.createTexture();
            gl.activeTexture(gl.TEXTURE2);
            gl.bindTexture(gl.TEXTURE_2D, tex);
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, source);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            if (this.isWebGL2) {
                gl.generateMipmap(gl.TEXTURE_2D);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
            } else {
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            }
            const entry = { tex: tex, aspect: w / h };
            this.textures.set(index, entry);
            return entry;
        }

        // Keep GPU memory bounded: only the slides in `keep` stay uploaded.
        prune(keep) {
            this.textures.forEach(function (entry, index) {
                if (keep.indexOf(index) === -1) {
                    this.gl.deleteTexture(entry.tex);
                    this.textures.delete(index);
                }
            }, this);
        }

        draw(frame) {
            const gl = this.gl;
            const a = frame.from || frame.to;
            const b = frame.to;
            gl.uniform1f(this.u.uAspect, frame.aspect);
            gl.uniform4f(this.u.uCamA, a.camera.t / a.zoom, a.yaw, a.camera.span, a.camera.aspect);
            gl.uniform4f(this.u.uCamB, b.camera.t / b.zoom, b.yaw, b.camera.span, b.camera.aspect);
            gl.uniform1f(this.u.uMix, frame.mix);
            gl.uniform1f(this.u.uIris, frame.iris ? 1 : 0);
            gl.uniform1f(this.u.uRadius, frame.radius || 0);
            gl.uniform1f(this.u.uSoft, frame.soft || 0.3);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, this.textures.get(a.index).tex);
            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_2D, this.textures.get(b.index).tex);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        }

        destroy() {
            this.prune([]);
            this.canvas.remove();
        }
    }

    /* ------------------------------------------------------------------ */
    /* DOM renderer (no WebGL / reduced motion)                            */
    /* ------------------------------------------------------------------ */

    class DOMRenderer {
        constructor(stage) {
            this.stage = stage;
            this.layers = new Map();
            this.ok = true;
        }
        show(index, img, mode, duration) {
            let layer = this.layers.get(index);
            if (!layer) {
                layer = document.createElement('img');
                layer.className = 'hero__image';
                layer.src = img.src;
                layer.alt = '';
                layer.decoding = 'async';
                this.layers.set(index, layer);
            }
            layer.style.setProperty('--hero-duration', duration + 'ms');
            layer.classList.remove('is-active', 'is-iris', 'is-fade', 'is-leaving');
            this.stage.appendChild(layer);       // newest layer on top
            void layer.offsetWidth;               // restart the CSS transition
            layer.classList.add(mode === 'iris' && !reduceMotion ? 'is-iris' : 'is-fade');
            this.layers.forEach(function (other, i) {
                if (i !== index && other.isConnected) other.classList.add('is-leaving');
            });
            requestAnimationFrame(function () { layer.classList.add('is-active'); });
            setTimeout(() => {
                this.layers.forEach(function (other, i) {
                    if (i !== index) other.remove();
                });
            }, duration + 50);
        }
        destroy() { this.stage.textContent = ''; }
    }

    /* ------------------------------------------------------------------ */
    /* Hero slider                                                         */
    /* ------------------------------------------------------------------ */

    const SLIDE_DURATION = 9000;
    const TRANSITIONS = {
        iris: { duration: 1900 },
        zoom: { duration: 1700 },
        blend: { duration: 700 }
    };

    class HeroSlider {
        constructor(root, slides) {
            this.root = root;
            this.slides = slides;
            this.stage = root.querySelector('[data-hero-stage]');
            this.content = root.querySelector('[data-hero-content]');
            this.title = root.querySelector('[data-hero-title]');
            this.subtitle = root.querySelector('[data-hero-subtitle]');
            this.cta = root.querySelector('[data-hero-cta]');
            this.controls = root.querySelector('[data-hero-controls]');
            this.dotsBox = root.querySelector('[data-hero-dots]');
            this.toggleBtn = root.querySelector('[data-hero-toggle]');
            this.loader = root.querySelector('[data-hero-loader]');

            this.images = new Array(slides.length);    // Promise<HTMLImageElement|null>
            this.current = -1;
            this.transition = null;
            this.pending = null;
            this.playing = !reduceMotion && slides.length > 1;
            this.elapsed = 0;
            this.visible = true;
            this.autoCount = 0;
            this.lastTime = 0;
            this.drag = null;

            this.gl = reduceMotion ? null : new GLRenderer(this.stage);
            if (this.gl && !this.gl.ok) this.gl = null;
            this.dom = this.gl ? null : new DOMRenderer(this.stage);
            this.views = slides.map(function (_, i) { return { pan: new Pan(i % 2 ? -1 : 1), camera: null }; });

            this.buildControls();
            this.bind();
        }

        image(index) {
            if (!this.images[index]) {
                this.images[index] = loadImage(this.slides[index].src).catch(function () { return null; });
            }
            return this.images[index];
        }

        start() {
            const first = this.slides.length ? 0 : -1;
            return this.firstLoadable(first).then((index) => {
                if (index === -1) return false;
                this.renderText(index, true);
                this.activate(index, null);
                this.root.classList.add('is-ready');
                this.loader.classList.add('is-hidden');
                this.preload(index);
                this.lastTime = performance.now();
                this.loop = this.loop.bind(this);
                requestAnimationFrame(this.loop);
                return true;
            });
        }

        firstLoadable(index) {
            if (index === -1 || index >= this.slides.length) return Promise.resolve(-1);
            return this.image(index).then((img) => img ? index : this.firstLoadable(index + 1));
        }

        preload(index) {
            if (this.slides.length < 2) return;
            const next = (index + 1) % this.slides.length;
            const prev = (index - 1 + this.slides.length) % this.slides.length;
            const idle = window.requestIdleCallback || function (cb) { return setTimeout(cb, 300); };
            idle(() => {
                this.image(next).then((img) => {
                    if (img && this.gl && !this.transition) this.gl.upload(next, img);
                });
                this.image(prev);
            });
        }

        buildControls() {
            if (this.slides.length < 2) return;
            this.controls.hidden = false;
            this.dots = this.slides.map((slide, i) => {
                const dot = document.createElement('button');
                dot.type = 'button';
                dot.className = 'hero__dot';
                dot.setAttribute('aria-label', i18n.goToSlide + ' ' + (i + 1));
                const fill = document.createElement('span');
                fill.className = 'hero__dot-fill';
                dot.appendChild(fill);
                dot.addEventListener('click', () => this.go(i, 'blend', true));
                this.dotsBox.appendChild(dot);
                return { el: dot, fill: fill };
            });
            this.updateToggle();
        }

        bind() {
            const prev = this.root.querySelector('[data-hero-prev]');
            const next = this.root.querySelector('[data-hero-next]');
            prev.addEventListener('click', () => this.step(-1, true));
            next.addEventListener('click', () => this.step(1, true));
            this.toggleBtn.addEventListener('click', () => {
                this.playing = !this.playing;
                this.updateToggle();
            });

            // Arrow keys only while the slider has focus, so typing elsewhere is unaffected.
            this.root.addEventListener('keydown', (e) => {
                if (e.target.closest('input, textarea')) return;
                if (e.key === 'ArrowLeft') { this.step(-1, true); e.preventDefault(); }
                if (e.key === 'ArrowRight') { this.step(1, true); e.preventDefault(); }
            });

            // Mouse drag looks around (like krpano); a touch swipe changes slides.
            this.stage.addEventListener('pointerdown', (e) => {
                if (e.button !== 0) return;
                this.drag = { x: e.clientX, y: e.clientY, type: e.pointerType, moved: 0, yaw: null };
                if (e.pointerType === 'mouse' && this.gl) this.stage.setPointerCapture(e.pointerId);
            });
            this.stage.addEventListener('pointermove', (e) => {
                if (!this.drag || this.drag.type !== 'mouse' || !this.gl || this.current < 0) return;
                const view = this.views[this.current];
                if (!view.camera || this.transition) return;
                const dx = e.clientX - this.drag.x;
                this.drag.x = e.clientX;
                this.drag.moved += Math.abs(dx);
                const width = this.stage.clientWidth || 1;
                const half = view.camera.span / 2 - view.camera.room;
                const yaw = clamp(view.pan.yaw(view.camera) - dx / width * 2 * half, -view.camera.room, view.camera.room);
                view.pan.setYaw(yaw, view.camera);
                this.root.classList.add('is-dragging');
            });
            const end = (e) => {
                if (!this.drag) return;
                if (this.drag.type !== 'mouse') {
                    const dx = e.clientX - this.drag.x;
                    const dy = e.clientY - this.drag.y;
                    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.3) this.step(dx < 0 ? 1 : -1, true);
                }
                this.drag = null;
                this.root.classList.remove('is-dragging');
            };
            this.stage.addEventListener('pointerup', end);
            this.stage.addEventListener('pointercancel', () => { this.drag = null; this.root.classList.remove('is-dragging'); });

            // Pause rendering while the hero is off screen or the tab is hidden.
            if ('IntersectionObserver' in window) {
                new IntersectionObserver((entries) => {
                    this.visible = entries[0].isIntersecting;
                    if (this.visible) this.wake();
                }, { threshold: 0.01 }).observe(this.root);
            }
            document.addEventListener('visibilitychange', () => { if (!document.hidden) this.wake(); });
            window.addEventListener('resize', () => this.wake(), { passive: true });

            if (this.gl) {
                this.gl.canvas.addEventListener('webglcontextlost', (e) => {
                    e.preventDefault();
                    this.fallbackToDOM();
                });
            }
        }

        updateToggle() {
            if (!this.toggleBtn) return;
            this.root.classList.toggle('is-paused', !this.playing);
            this.toggleBtn.setAttribute('aria-label', this.playing ? i18n.pause : i18n.play);
            this.content.setAttribute('aria-live', this.playing ? 'off' : 'polite');
        }

        wake() {
            if (!this.sleeping) return;
            this.sleeping = false;
            this.lastTime = performance.now();
            requestAnimationFrame(this.loop);
        }

        fallbackToDOM() {
            if (!this.gl) return;
            this.gl.canvas.remove();
            this.gl = null;
            this.dom = new DOMRenderer(this.stage);
            const index = this.current;
            this.transition = null;
            this.image(index).then((img) => { if (img) this.dom.show(index, img, 'blend', 10); });
        }

        step(delta, user) {
            if (this.slides.length < 2) return;
            const base = this.pending !== null ? this.pending : this.current;
            const target = (base + delta + this.slides.length) % this.slides.length;
            this.go(target, 'iris', user);
        }

        go(index, mode, user) {
            if (index === this.current) return;
            if (user) this.elapsed = 0;
            this.pending = index;
            this.image(index).then((img) => {
                if (this.pending !== index) return;     // a newer request won
                this.pending = null;
                if (!img) {                              // broken image: skip to the next one
                    const next = (index + 1) % this.slides.length;
                    if (next !== this.current) this.go(next, mode, user);
                    return;
                }
                this.activate(index, mode);
            });
        }

        activate(index, mode) {
            const previous = this.current;
            this.current = index;
            this.elapsed = 0;
            const view = this.views[index];
            view.pan = new Pan(view.pan.dir);

            const duration = mode ? TRANSITIONS[mode].duration : 0;
            this.image(index).then((img) => {
                if (this.gl) {
                    this.gl.upload(index, img);
                    view.camera = null;     // recomputed for the current viewport in the loop
                    this.transition = (mode && previous >= 0)
                        ? { from: previous, to: index, mode: mode, start: performance.now(), duration: duration }
                        : null;
                } else {
                    this.dom.show(index, img, mode || 'blend', mode ? Math.min(duration, mode === 'iris' ? 1400 : 700) : 10);
                }
                this.stage.setAttribute('role', 'img');
                this.stage.setAttribute('aria-label', this.slides[index].alt || this.slides[index].title || '');
            });

            if (previous >= 0) this.renderText(index, false, mode === 'blend' ? 250 : 650);
            this.updateDots();
            this.preload(index);
            this.wake();
        }

        renderText(index, immediate, delay) {
            const slide = this.slides[index];
            const apply = () => {
                renderFormatted(this.title, slide.title, slide.titleFormat);
                this.title.classList.toggle('is-long', slide.title.length > 24 && slide.title.length <= 44);
                this.title.classList.toggle('is-xlong', slide.title.length > 44);
                this.title.style.color = slide.titleColor || '';
                renderFormatted(this.subtitle, slide.subtitle, slide.subtitleFormat);
                this.subtitle.style.color = slide.subtitleColor || '';
                this.subtitle.hidden = !slide.subtitle;
                this.title.hidden = !slide.title;
                const href = safeHref(slide.url);
                this.cta.hidden = !href;
                if (href) this.cta.href = href;
            };
            if (immediate || reduceMotion) {
                apply();
                this.content.classList.add('is-in');
                return;
            }
            clearTimeout(this.textTimer);
            this.content.classList.remove('is-in');
            this.content.classList.add('is-out');
            this.textTimer = setTimeout(() => {
                apply();
                this.content.classList.remove('is-out');
                void this.content.offsetWidth;
                this.content.classList.add('is-in');
            }, delay);
        }

        updateDots() {
            if (!this.dots) return;
            this.dots.forEach((dot, i) => {
                const active = i === this.current;
                dot.el.classList.toggle('is-active', active);
                if (active) dot.el.setAttribute('aria-current', 'true'); else dot.el.removeAttribute('aria-current');
                dot.fill.style.transform = active ? '' : 'scaleX(0)';
            });
        }

        frameView(index, aspect, dt, zoom) {
            const view = this.views[index];
            const tex = this.gl.textures.get(index);
            if (!view.camera || view.camera.viewAspect !== aspect) {
                view.camera = cameraFor(aspect, tex.aspect);
                view.camera.viewAspect = aspect;
            }
            const dragging = this.drag && this.drag.type === 'mouse' && this.drag.moved > 0;
            // Paused: the camera stops too (dragging still looks around)
            const still = reduceMotion || dragging || !this.playing;
            const yaw = still ? view.pan.yaw(view.camera) : view.pan.step(dt, view.camera, SLIDE_DURATION / 1000);
            return { index: index, camera: view.camera, yaw: yaw, zoom: zoom };
        }

        loop(now) {
            if (!this.visible || document.hidden) { this.sleeping = true; return; }
            const dt = Math.min(0.05, (now - this.lastTime) / 1000);
            this.lastTime = now;

            // Autoplay: AirPano mostly uses the iris; every third switch is a zoom blend.
            if (this.playing && !this.transition && this.pending === null && !this.drag) {
                this.elapsed += dt * 1000;
                if (this.elapsed >= SLIDE_DURATION) {
                    this.autoCount++;
                    this.go((this.current + 1) % this.slides.length, this.autoCount % 3 === 0 ? 'zoom' : 'iris', false);
                }
            }
            if (this.dots && this.dots[this.current]) {
                const p = this.playing ? clamp(this.elapsed / SLIDE_DURATION, 0, 1) : 1;
                this.dots[this.current].fill.style.transform = 'scaleX(' + p.toFixed(4) + ')';
            }

            if (this.gl) this.drawGL(now, dt);
            requestAnimationFrame(this.loop);
        }

        drawGL(now, dt) {
            const aspect = Math.round(this.gl.resize() * 1000) / 1000;
            const t = this.transition;
            if (!this.gl.has(this.current) || (t && !this.gl.has(t.from))) return;
            if (!t) {
                this.gl.draw({ aspect: aspect, to: this.frameView(this.current, aspect, dt, 1), mix: 1 });
                return;
            }
            const p = clamp((now - t.start) / t.duration, 0, 1);
            let frame;
            if (t.mode === 'iris') {
                // OPENBLEND: soft iris grows from the centre; old view flies forward, new one settles.
                const e = easeInOutSine(p);
                frame = {
                    aspect: aspect,
                    from: this.frameView(t.from, aspect, dt, 1 + 0.28 * e),
                    to: this.frameView(t.to, aspect, dt, 1.16 - 0.16 * easeInOutCubic(p)),
                    iris: true, soft: 0.3, radius: e * 1.3, mix: p < 1 ? 0 : 1
                };
            } else if (t.mode === 'zoom') {
                // ZOOMBLEND: old view zooms 2x into the new one.
                const e = easeInOutSine(p);
                frame = {
                    aspect: aspect,
                    from: this.frameView(t.from, aspect, dt, 1 + e),
                    to: this.frameView(t.to, aspect, dt, 1.06 - 0.06 * e),
                    mix: smoothstep(clamp((p - 0.15) / 0.7, 0, 1))
                };
            } else {
                frame = {
                    aspect: aspect,
                    from: this.frameView(t.from, aspect, dt, 1),
                    to: this.frameView(t.to, aspect, dt, 1),
                    mix: easeInOutSine(p)
                };
            }
            this.gl.draw(frame);
            if (p >= 1) {
                this.transition = null;
                this.gl.prune(this.neighbours(this.current));
                this.preload(this.current);
            }
        }

        neighbours(index) {
            const n = this.slides.length;
            return [index, (index + 1) % n, (index - 1 + n) % n];
        }
    }

    function brandHero(root) {
        root.classList.add('is-ready', 'hero--brand');
        root.querySelector('[data-hero-loader]').classList.add('is-hidden');
        root.querySelector('[data-hero-title]').textContent = i18n.fallbackTitle;
        root.querySelector('[data-hero-subtitle]').textContent = i18n.fallbackSubtitle;
        root.querySelector('[data-hero-content]').classList.add('is-in');
    }

    function initHero() {
        const root = document.querySelector('[data-hero]');
        if (!root) return;
        post('/get_home_slides').then(function (response) {
            const rows = (response.status === '1' && Array.isArray(response.data)) ? response.data : [];
            const slides = rows.filter(function (row) { return row.IMG; }).map(function (row) {
                return {
                    src: config.slidesDir + encodeURIComponent(row.IMG),
                    alt: row.Alt_Text || '',
                    title: row.Title || '',
                    titleColor: row.Title_Color || '',
                    titleFormat: row.Title_Format || '',
                    subtitle: row.Subtitle || '',
                    subtitleColor: row.Subtitle_Color || '',
                    subtitleFormat: row.Subtitle_Format || '',
                    url: row.URL || ''
                };
            });
            if (!slides.length) { brandHero(root); return; }
            const slider = new HeroSlider(root, slides);
            return slider.start().then(function (started) { if (!started) brandHero(root); });
        }).catch(function (error) {
            console.error(error);
            brandHero(root);
        });
    }

    /* ------------------------------------------------------------------ */
    /* Journeys (product cards)                                            */
    /* ------------------------------------------------------------------ */

    const PAGE_SIZE = 6;
    const ARROW_SVG = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';

    function journeyCard(item) {
        const article = document.createElement('article');
        article.className = 'journey reveal';

        const link = document.createElement('a');
        link.className = 'journey__link';
        link.href = safeHref(item.Url) || '#';

        const media = document.createElement('div');
        media.className = 'journey__media';
        if (item.Thumbnail) {
            const img = document.createElement('img');
            img.src = config.thumbsDir + encodeURIComponent(item.Thumbnail);
            img.alt = item.AltText || '';
            img.loading = 'lazy';
            img.decoding = 'async';
            img.width = 800;
            img.height = 600;
            img.addEventListener('error', function () {
                img.remove();
                media.classList.add('journey__media--empty');
            });
            img.addEventListener('load', function () { media.classList.add('is-loaded'); });
            media.appendChild(img);
        } else {
            media.classList.add('journey__media--empty');
        }

        const body = document.createElement('div');
        body.className = 'journey__body';
        const title = document.createElement('h3');
        title.className = 'journey__title';
        title.textContent = item.Title || '';
        body.appendChild(title);
        if (item.Description && item.Description.trim()) {
            const text = document.createElement('p');
            text.className = 'journey__text';
            text.textContent = item.Description;
            body.appendChild(text);
        }
        const more = document.createElement('span');
        more.className = 'journey__more';
        more.innerHTML = '<span></span>' + ARROW_SVG;
        more.firstChild.textContent = i18n.viewDetails;
        body.appendChild(more);

        link.append(media, body);
        article.appendChild(link);
        return article;
    }

    function initJourneys(onFirstLoad) {
        const grid = document.querySelector('[data-journeys-grid]');
        const status = document.querySelector('[data-journeys-status]');
        const moreBtn = document.querySelector('[data-journeys-more]');
        if (!grid) return;
        let start = 0;
        let count = 0;

        function load() {
            moreBtn.disabled = true;
            grid.setAttribute('aria-busy', 'true');
            return post('/get-activities', { RefKey: 1, start: start, limit: PAGE_SIZE }).then(function (response) {
                const items = (response.status === '1' && Array.isArray(response.data)) ? response.data : [];
                if (start === 0) grid.textContent = '';
                items.forEach(function (item, i) {
                    count++;
                    const card = journeyCard(item);
                    // Stagger cards of the same row; cleared so hover effects are not delayed.
                    card.style.transitionDelay = (i % 3) * 90 + 'ms';
                    card.addEventListener('transitionend', function clear(e) {
                        if (e.target !== card || e.propertyName !== 'opacity') return;
                        card.style.transitionDelay = '';
                        card.removeEventListener('transitionend', clear);
                    });
                    grid.appendChild(card);
                    reveal(card);
                });
                start += items.length;
                moreBtn.hidden = items.length < PAGE_SIZE;
                if (count === 0) {
                    status.textContent = i18n.empty;
                    status.hidden = false;
                }
            }).catch(function (error) {
                console.error(error);
                if (start === 0) grid.textContent = '';
                status.textContent = i18n.loadError;
                status.hidden = false;
                moreBtn.hidden = true;
            }).finally(function () {
                moreBtn.disabled = false;
                grid.setAttribute('aria-busy', 'false');
            });
        }

        moreBtn.addEventListener('click', load);
        load().finally(onFirstLoad);
    }

    /* ------------------------------------------------------------------ */
    /* Header, navigation, language switch, reveal on scroll               */
    /* ------------------------------------------------------------------ */

    let revealObserver = null;
    function reveal(el) {
        if (revealObserver) revealObserver.observe(el);
        else el.classList.add('is-visible');
    }

    function initReveal() {
        if (reduceMotion || !('IntersectionObserver' in window)) {
            document.querySelectorAll('.reveal').forEach(function (el) { el.classList.add('is-visible'); });
            return;
        }
        document.documentElement.classList.add('has-reveal');
        revealObserver = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (entry.isIntersecting) {
                    entry.target.classList.add('is-visible');
                    revealObserver.unobserve(entry.target);
                }
            });
        }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
        document.querySelectorAll('.reveal').forEach(function (el) { revealObserver.observe(el); });
    }

    // /events, /activities, /about and /contacts render this page with a section to scroll to.
    function scrollToSection() {
        const target = config.scrollTo && document.getElementById(config.scrollTo);
        if (!target || config.scrollTo === 'events') return;
        target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    }

    initReveal();
    initHero();
    initJourneys(scrollToSection);
})();
