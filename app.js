document.addEventListener('DOMContentLoaded', function () {
    'use strict';

    const GA_ID = 'G-S5ZJW576QK';
    const LOCATE_ZOOM = 15;

    const SUPPORT = {
        MIN_VISIT_DAYS: 2,
        MIN_ACTIONS: 5,
        DELAY_MS: 6000,
        COOLDOWN_SHOWN_DAYS: 30,
        COOLDOWN_DISMISSED_DAYS: 60,
        COOLDOWN_DONATED_DAYS: 180
    };    const el = id => document.getElementById(id);
    const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const isMobileLayout = () => window.matchMedia('(max-width: 899px) and (min-height: 480px), (max-width: 799px), (max-height: 479px)').matches;

    const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const CARDINALS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

    const today = new Date();
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12);

    const params = new URLSearchParams(window.location.search);
    const lat = parseFloat(params.get('lat'));
    const lng = parseFloat(params.get('lng'));
    const dateParam = params.get('date');

    const mapOptions = {
        minZoom: 3,
        maxZoom: 18,
        center: [51.505, -0.09],
        zoom: 5,
        zoomControl: false,
        attributionControl: false
    };

    const hasPos = !isNaN(lat) && !isNaN(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
    if (hasPos) {
        mapOptions.center = [lat, lng];
    }

    const zParam = parseFloat(params.get('z'));
    const webglOk = (() => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; } })();
    const startOnGlobe = webglOk && (!hasPos || zParam < 4);
    let globeOn = false, gl = null;
    if (startOnGlobe) {
        mapOptions.zoom = 4;
        if (!hasPos) mapOptions.center = [51.5074, -0.1278];
    }

    const map = L.map('map', mapOptions);

    const IMAGERY_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
    const LABELS_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}';
    const TILE_LOADING = { keepBuffer: 4, updateWhenIdle: false, updateWhenZooming: false };

    const imageryLayer = L.tileLayer(IMAGERY_URL, {
        attribution: 'Tiles &copy; <a href="https://www.esri.com/">Esri</a> &mdash; Esri, HERE, Garmin, Intermap, increment P Corp., GEBCO, USGS, FAO, NPS, NRCAN, GeoBase, IGN, Kadaster NL, Ordnance Survey, Esri Japan, METI, Esri China (Hong Kong), &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, and the GIS User Community',
        maxZoom: 18,
        ...TILE_LOADING
    });

    map.createPane('labels');
    map.getPane('labels').style.zIndex = 250;
    map.getPane('labels').style.pointerEvents = 'none';
    const labelsLayer = L.tileLayer(LABELS_URL, {
        pane: 'labels',
        maxZoom: 18,
        ...TILE_LOADING
    });
    if (!startOnGlobe) { imageryLayer.addTo(map); labelsLayer.addTo(map); }

    const NIGHT = {
        W: 720, H: 360,
        SHADE_FROM: 1,
        SHADE_FULL: -4,
        GOLD_LOW: -4,
        GOLD_PEAK: 2,
        GOLD_TOP: 12,
        ZOOM_FADE_FROM: 7,
        ZOOM_FADE_TO: 10,
        EVERY_MS: 60000
    };
    const MERC_MAX = 85.0511287798;
    map.createPane('night');
    const nightPane = map.getPane('night');
    nightPane.style.zIndex = 225;
    nightPane.style.pointerEvents = 'none';
    nightPane.style.opacity = '0';
    const nightCanvas = document.createElement('canvas');
    nightCanvas.width = NIGHT.W; nightCanvas.height = NIGHT.H;
    const nightCtx = nightCanvas.getContext('2d');
    const nightImg = nightCtx.createImageData(NIGHT.W, NIGHT.H);
    const nightRows = Array.from({ length: NIGHT.H }, (_, j) => {
        const yMax = Math.log(Math.tan(Math.PI / 4 + MERC_MAX * Math.PI / 360));
        const lat = 2 * Math.atan(Math.exp(yMax - (j + 0.5) * 2 * yMax / NIGHT.H)) - Math.PI / 2;
        return { s: Math.sin(lat), c: Math.cos(lat) };
    });
    const nightCopies = new Map();
    let nightUrl = '', nightOn = false, nightTimer = null;
    const smoothStep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

    function subsolarPoint(ms) {
        const rad = Math.PI / 180, d = ms / 86400000 - 10957.5;
        const M = rad * (357.5291 + 0.98560028 * d);
        const L = M + rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M) + 282.9372);
        const e = rad * 23.4397;
        const dec = Math.asin(Math.sin(e) * Math.sin(L));
        const ra = Math.atan2(Math.sin(L) * Math.cos(e), Math.cos(L));
        const gst = rad * (280.16 + 360.9856235 * d);
        return { dec, lng: ra - gst };
    }

    function drawNight() {
        const cs = getComputedStyle(document.documentElement);
        const shade = parseFloat(cs.getPropertyValue('--night-shade')) || 0.84;
        const gold = parseFloat(cs.getPropertyValue('--night-gold')) || 0.3;
        const [nr, ng, nb] = cs.getPropertyValue('--night-rgb').trim().split(/\s+/).map(Number);
        const [ar, ag, ab] = cs.getPropertyValue('--amber-rgb').trim().split(/\s+/).map(Number);
        const sun = subsolarPoint(Date.now());
        const sd = Math.sin(sun.dec), cd = Math.cos(sun.dec), px = nightImg.data, W = NIGHT.W, deg = 180 / Math.PI;
        const cosH = new Float32Array(W);
        for (let i = 0; i < W; i++) cosH[i] = Math.cos((-180 + (i + 0.5) * 360 / W) / deg - sun.lng);
        let k = 0;
        for (const row of nightRows) {
            const a = row.s * sd, b = row.c * cd;
            for (let i = 0; i < W; i++, k += 4) {
                const h = Math.asin(Math.max(-1, Math.min(1, a + b * cosH[i]))) * deg;
                const tS = Math.max(0, Math.min(1, (NIGHT.SHADE_FROM - h) / (NIGHT.SHADE_FROM - NIGHT.SHADE_FULL)));
                const sA = shade * (1 - (1 - tS) * (1 - tS));
                const gA = gold * smoothStep(NIGHT.GOLD_LOW, NIGHT.GOLD_PEAK, h) * (1 - smoothStep(NIGHT.GOLD_PEAK, NIGHT.GOLD_TOP, h));
                const al = sA + gA;
                if (al < 0.004) { px[k + 3] = 0; continue; }
                px[k] = (nr * sA + ar * gA) / al; px[k + 1] = (ng * sA + ag * gA) / al; px[k + 2] = (nb * sA + ab * gA) / al;
                px[k + 3] = Math.min(1, al) * 255;
            }
        }
        nightCtx.putImageData(nightImg, 0, 0);
        nightCanvas.toBlob(blob => {
            if (!blob) return;
            const old = nightUrl;
            nightUrl = URL.createObjectURL(blob);
            nightCopies.forEach(o => o.setUrl(nightUrl));
            if (old) setTimeout(() => URL.revokeObjectURL(old), 5000);
            syncNightCopies();
            nightOpacity();
        }, 'image/png');
    }

    function syncNightCopies() {
        if (!nightUrl) return;
        const b = map.getBounds(), k0 = Math.floor((b.getWest() + 180) / 360) - 1, k1 = Math.floor((b.getEast() + 180) / 360) + 1;
        for (let k = k0; k <= k1; k++) {
            if (!nightCopies.has(k)) nightCopies.set(k, L.imageOverlay(nightUrl, [[-MERC_MAX, -180 + 360 * k], [MERC_MAX, 180 + 360 * k]], { pane: 'night', interactive: false, className: 'night-img' }).addTo(map));
        }
        nightCopies.forEach((o, k) => { if (k < k0 - 2 || k > k1 + 2) { o.remove(); nightCopies.delete(k); } });
    }

    function nightOpacity() {
        nightPane.style.opacity = nightOn && nightUrl ? String(1 - smoothStep(NIGHT.ZOOM_FADE_FROM, NIGHT.ZOOM_FADE_TO, map.getZoom())) : '0';
        if (gl) globeNight();
    }

    function setNightVisible(on) {
        if (on === nightOn) return;
        nightOn = on;
        clearInterval(nightTimer); nightTimer = null;
        if (on) {
            drawNight();
            nightTimer = setInterval(() => { if (!document.hidden) drawNight(); }, NIGHT.EVERY_MS);
        }
        nightOpacity();
    }
    map.on('zoomend', nightOpacity);
    map.on('moveend', syncNightCopies);
    document.addEventListener('visibilitychange', () => { if (!document.hidden && nightOn) drawNight(); });
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => { if (nightOn) drawNight(); if (lg) { lg.colours = null; lightDraw(); } });

    const LIGHT = {
        URL: 'https://tiles.mapterhorn.com/{z}/{x}/{y}.webp',
        SRC_MAX: 16,
        SRC_DROP: 2,
        COARSE_DROP: 2,
        COARSE_MAX: 12,
        MAX_TILES: 16,
        CACHE: 32,
        MARGIN: 0.15,
        RES: 0.5,
        MIN_ZOOM: 7,
        ZOOM_IN_FROM: 7, ZOOM_IN_TO: 9, ZOOM_OUT_FROM: 17, ZOOM_OUT_TO: 18.5,
        EXAGGERATION: 2.5,
        NORMAL_TEXELS: 1.5,
        GAIN: 3.5,
        LIGHT_GAIN: 2,
        LIGHT_FULL_DEG: 20,
        LIGHT_NONE_DEG: 45,
        WATER_M: 1,
        SHORE_M: 3,
        CAST_STEPS: 32,
        CAST_PX: 360,
        CAST_SHADE: 0.75,
        PENUMBRA_DEG: 1.5,
        DUSK_FROM: 4,
        DUSK_FULL: 0,
        PLAY_MS: 4000
    };
    const BUILDINGS = {
        ON: true,
        TILEJSON: 'https://tiles.openfreemap.org/planet',
        LAYER: 'building', HEIGHT: 'render_height',
        LIB: 'vector-tile.js',
        TILE_Z: 14,
        MIN_ZOOM: 16,
        MAX_TILES: 12,
        CACHE_TILES: 32,
        DEBOUNCE_MS: 250,
        RETRY_MS: 30000,
        DEFAULT_M: 8,
        MAX_M: 120,
        RES: 0.5,
        EXAGGERATION: 1,
        CAST_M: 150,
        CAST_STEPS: 40,
        SHADE: 0.7,
        PENUMBRA_DEG: 0.6,
        FADE_MS: 600
    };
    map.createPane('terrain');
    const terrainPane = map.getPane('terrain');
    terrainPane.style.zIndex = 212;
    terrainPane.style.pointerEvents = 'none';
    terrainPane.style.opacity = '0';
    const pvCards = { rise: el('miniAm'), set: el('miniPm') };
    let preview = null;
    let lg = null;
    let lgFrame = 0, lgPlay = null;
    const lgTiles = new Map();
    const lgLoading = new Map();
    const lgMissing = new Set();

    function previewWindow(kind) {
        if (!sunInfo || sunInfo.state !== 'normal') return null;
        const start = kind === 'rise' ? sunInfo.sunrise.getTime() : sunInfo.sunset.getTime() - 3600000;
        return { start, end: start + 3600000 };
    }
    function previewTime() {
        const w = preview && previewWindow(preview.kind);
        return w ? w.start + preview.f * (w.end - w.start) : null;
    }

    const LG_VS = `#version 300 es
in vec2 a; void main() { gl_Position = vec4(a, 0.0, 1.0); }`;
    const LG_FS = `#version 300 es
precision highp float;
uniform sampler2D uFine, uCoarse, uBldTex;
uniform vec2 uFineA, uCoarseA;       // texture uv at the canvas top left
uniform vec2 uFineB, uCoarseB;       // texture uv per screen pixel
uniform float uFineTx, uCoarseTx;    // screen pixels per texel
uniform float uScale, uH;            // screen pixels per canvas pixel; canvas height
uniform float uY0, uYB;              // Mercator y (0..1) at the canvas top, per screen pixel
uniform float uMPx;                  // metres per screen pixel at the equator
uniform vec3 uSun;                   // east, north, up
uniform float uMax, uEx, uGain, uLGain, uLFull, uLNone, uWater, uShore, uCastPx, uCastShade, uPen, uDusk;
uniform vec4 uShade, uLight;         // rgb + strength
uniform vec2 uBSize;                 // building raster size in screen pixels (the canvas)
uniform float uBld, uBMax, uBCast, uBShade, uBPen, uTerr;   // building fade, height at full red (already over uEx), reach (m), strength, soft edge; terrain weight
const int STEPS = ${LIGHT.CAST_STEPS};
const int BSTEPS = ${BUILDINGS.CAST_STEPS};
float elev(vec2 p, out float v) {
    vec3 f = texture(uFine, uFineA + p * uFineB).rgb;
    vec3 c = texture(uCoarse, uCoarseA + p * uCoarseB).rgb;
    float ef = f.z > 0.0 ? (f.x + f.y) / f.z : 0.0;
    float ec = c.z > 0.0 ? (c.x + c.y) / c.z : 0.0;
    v = clamp(f.z, 0.0, 1.0);
    return mix(ec, ef, v);
}
float elev(vec2 p) { float v; return elev(p, v); }
float bld(vec2 p) { return texture(uBldTex, p / uBSize).r * uBMax; }
out vec4 o;
void main() {
    vec2 p = vec2(gl_FragCoord.x, uH - gl_FragCoord.y) * uScale;
    float v;
    float e0 = elev(p, v);
    float land = smoothstep(uWater, uWater + uShore, e0);
    float dusk = uDusk * uCastShade * uShade.a;   // the shade over everything, water too, as the sun sets
    if (uDusk >= 1.0 || (land <= 0.0 && uBld <= 0.0)) { o = vec4(uShade.rgb * dusk, dusk); return; }
    float t = 3.14159265 * (1.0 - 2.0 * (uY0 + p.y * uYB));
    float mpx = uMPx / cosh(t);
    float hz = length(uSun.xy);
    vec2 d = hz > 0.001 ? vec2(uSun.x, -uSun.y) / hz : vec2(0.0);
    float tanA = hz > 0.001 ? uSun.z / hz / uEx : 0.0;
    // building shadows: an even march over a short reach; only samples on a building count, standing on the terrain under it (water too)
    float bs = 0.0;
    if (uBld > 0.0 && hz > 0.001) {
        float eb = e0 + bld(p), reach = uBCast / mpx;
        for (int i = 1; i <= BSTEPS; i++) {
            float dist = float(i) / float(BSTEPS) * reach;
            float ray = eb + dist * mpx * tanA;
            if (ray > uMax + uBMax) break;
            vec2 q = p + d * dist;
            float b = bld(q);
            if (b > 0.05) {
                float rise = elev(q) + b - ray;
                if (rise > 0.0) bs = max(bs, rise * uEx / (dist * mpx) / uBPen);
                if (bs >= 1.0) break;
            }
        }
        bs = clamp(bs, 0.0, 1.0) * uBShade * uBld;
    }
    float shade = 0.0, light = 0.0;
    if (land > 0.0) {
        float h = max(mix(uCoarseTx, uFineTx, v), 0.5);
        float dx = (elev(p + vec2(h, 0.0)) - elev(p - vec2(h, 0.0))) / (2.0 * h * mpx);
        float dy = (elev(p - vec2(0.0, h)) - elev(p + vec2(0.0, h))) / (2.0 * h * mpx);
        vec3 n = normalize(vec3(-dx * uEx, -dy * uEx, 1.0));
        float raw = dot(n, uSun) - uSun.z;
        shade = clamp(-raw * uGain, 0.0, 1.0);
        light = clamp(raw * uLGain, 0.0, 1.0) * smoothstep(uLNone, uLFull, n.z);
        if (hz > 0.001 && uCastPx > 0.0) {
            float sh = 0.0;
            for (int i = 1; i <= STEPS; i++) {
                float s = float(i) / float(STEPS);
                float dist = s * s * uCastPx + uScale;
                float ray = e0 + dist * mpx * tanA;
                if (ray > uMax) break;
                float rise = elev(p + d * dist) - ray;
                if (rise > 0.0) sh = max(sh, rise * uEx / (dist * mpx) / uPen);
                if (sh >= 1.0) break;
            }
            sh = clamp(sh, 0.0, 1.0) * uCastShade;
            shade = max(shade, sh);
            light *= 1.0 - sh;
        }
        shade *= uTerr * land;   // past ZOOM_OUT_FROM the terrain fades but the building shadows stay
        light *= uTerr * land;
    }
    shade = max(shade, bs);
    light *= 1.0 - bs;
    float a = max(shade * uShade.a, dusk), b = light * uLight.a * (1.0 - uDusk) * (1.0 - a);
    o = vec4(uShade.rgb * a + uLight.rgb * b, a + b);
}`;

    function lightGL() {
        if (lg !== null) return lg;
        lg = false;
        const canvas = L.DomUtil.create('canvas', 'light-canvas leaflet-zoom-animated', terrainPane);
        const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false });
        if (!gl) { canvas.remove(); return lg; }
        const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
        const prog = gl.createProgram();
        gl.attachShader(prog, sh(gl.VERTEX_SHADER, LG_VS));
        gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, LG_FS));
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { canvas.remove(); return lg; }
        gl.useProgram(prog);
        gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        const u = {};
        for (let i = 0, n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS); i < n; i++) {
            const name = gl.getActiveUniform(prog, i).name;
            u[name] = gl.getUniformLocation(prog, name);
        }
        gl.uniform1i(u.uFine, 0);
        gl.uniform1i(u.uCoarse, 1);
        gl.uniform1i(u.uBldTex, 2);
        gl.clearColor(0, 0, 0, 0);
        canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); lg = false; if (pinKind) togglePin(pinKind); });
        const scratch = document.createElement('canvas');
        scratch.width = scratch.height = 512;
        lg = { canvas, gl, u, fine: null, coarse: null, view: null, colours: null, maxSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
            ctx: scratch.getContext('2d', { willReadFrequently: true }), rgb: new Float32Array(512 * 512 * 3), terr: 1 };
        bldSetup(gl);
        return lg;
    }

    function lightColours() {
        const cs = getComputedStyle(document.documentElement);
        const rgb = name => cs.getPropertyValue(name).trim().split(/\s+/).map(c => Number(c) / 255);
        return { shade: [...rgb('--night-rgb'), parseFloat(cs.getPropertyValue('--terrain-shade')) || 0.8],
            light: [...rgb('--amber-rgb'), parseFloat(cs.getPropertyValue('--terrain-light')) || 0.4] };
    }

    function lightTile(z, x, y) {
        const key = `${z}/${x}/${y}`;
        const hit = lgTiles.get(key);
        if (hit) { lgTiles.delete(key); lgTiles.set(key, hit); return Promise.resolve(hit); }
        for (let k = 1; k <= z; k++) if (lgMissing.has(`${z - k}/${x >> k}/${y >> k}`)) return Promise.resolve(null);
        if (lgMissing.has(key)) return Promise.resolve(null);
        if (lgLoading.has(key)) return lgLoading.get(key);
        const url = LIGHT.URL.replace('{z}', z).replace('{x}', x).replace('{y}', y);
        const job = fetch(url).then(r => {
            if (!r.ok) { if (r.status === 404) lgMissing.add(key); return null; }
            return r.blob().then(b => createImageBitmap(b, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' })).then(img => {
                const ctx = lg.ctx;
                ctx.clearRect(0, 0, 512, 512);
                ctx.drawImage(img, 0, 0, 512, 512);
                img.close?.();
                const d = ctx.getImageData(0, 0, 512, 512).data, e = new Float32Array(512 * 512);
                let max = -1e9;
                for (let i = 0, j = 0; i < e.length; i++, j += 4) {
                    const m = d[j] * 256 + d[j + 1] + d[j + 2] / 256 - 32768;
                    e[i] = m;
                    if (m > max) max = m;
                }
                const t = { e, max };
                lgTiles.set(key, t);
                while (lgTiles.size > LIGHT.CACHE) lgTiles.delete(lgTiles.keys().next().value);
                return t;
            });
        }).catch(() => null).finally(() => lgLoading.delete(key));
        lgLoading.set(key, job);
        return job;
    }

    function lightGrid(z, view) {
        const f = Math.pow(2, z - view.zoom) / 256;
        const x0 = Math.floor(view.px * f), x1 = Math.floor((view.px + view.w - 1e-6) * f);
        const n = Math.pow(2, z);
        const y0 = Math.max(0, Math.floor(view.py * f)), y1 = Math.min(n - 1, Math.floor((view.py + view.h - 1e-6) * f));
        const cols = x1 - x0 + 1, rows = Math.max(1, y1 - y0 + 1);
        return { z, x0, y0, cols, rows, n, f };
    }
    function sameGrid(a, b) { return a && b && a.z === b.z && a.x0 === b.x0 && a.y0 === b.y0 && a.cols === b.cols && a.rows === b.rows; }

    function lightLevel(old, grid, unit) {
        if (old && sameGrid(old.grid, grid)) return old;
        const gl = lg.gl;
        if (old) gl.deleteTexture(old.tex);
        const tex = gl.createTexture();
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB16F, grid.cols * 512, grid.rows * 512, 0, gl.RGB, gl.HALF_FLOAT, null);
        return { grid, tex, unit, max: -1e9 };
    }

    function lightUpload(level, col, row, t) {
        const gl = lg.gl, rgb = lg.rgb, e = t.e;
        for (let i = 0, j = 0; i < e.length; i++, j += 3) {
            const hi = Math.round(e[i] / 16) * 16;
            rgb[j] = hi; rgb[j + 1] = e[i] - hi; rgb[j + 2] = 1;
        }
        gl.activeTexture(gl.TEXTURE0 + level.unit);
        gl.bindTexture(gl.TEXTURE_2D, level.tex);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, col * 512, row * 512, 512, 512, gl.RGB, gl.FLOAT, rgb);
        level.max = Math.max(level.max, t.max);
    }

    function lightFill(level) {
        const g = level.grid, jobs = [];
        const cx = (g.cols - 1) / 2, cy = (g.rows - 1) / 2;
        for (let r = 0; r < g.rows; r++) for (let c = 0; c < g.cols; c++) jobs.push([c, r, (c - cx) ** 2 + (r - cy) ** 2]);
        jobs.sort((a, b) => a[2] - b[2]);
        for (const [c, r] of jobs) {
            const x = ((g.x0 + c) % g.n + g.n) % g.n, y = g.y0 + r;
            lightTile(g.z, x, y).then(t => {
                if (!t || !lg || (lg.fine !== level && lg.coarse !== level)) return;
                lightUpload(level, c, r, t);
                lightDraw();
            });
        }
    }

    function lightLayout() {
        if (!preview || !lg) return;
        const size = map.getSize(), z = map.getZoom();
        const mx = Math.round(size.x * LIGHT.MARGIN), my = Math.round(size.y * LIGHT.MARGIN);
        const w = size.x + 2 * mx, h = size.y + 2 * my;
        const tl = map.getPixelBounds().min.subtract([mx, my]);
        const view = { zoom: z, px: tl.x, py: tl.y, w, h, mx, my, nw: map.containerPointToLatLng([-mx, -my]) };
        lg.view = view;
        const c = lg.canvas, cw = Math.max(1, Math.round(w * LIGHT.RES)), ch = Math.max(1, Math.round(h * LIGHT.RES));
        if (c.width !== cw || c.height !== ch) { c.width = cw; c.height = ch; }
        c.style.width = w + 'px';
        c.style.height = h + 'px';
        L.DomUtil.setPosition(c, map.containerPointToLayerPoint([-mx, -my]));
        if (z < LIGHT.MIN_ZOOM) { lightDraw(); return; }
        const cap = Math.min(LIGHT.MAX_TILES, Math.floor(lg.maxSize / 512) ** 2);
        const fit = g => g.cols * g.rows <= cap && g.cols * 512 <= lg.maxSize && g.rows * 512 <= lg.maxSize;
        let fz = Math.max(0, Math.min(LIGHT.SRC_MAX, Math.round(z) - LIGHT.SRC_DROP)), fine = lightGrid(fz, view);
        while (fz > 0 && !fit(fine)) fine = lightGrid(--fz, view);
        const coarse = lightGrid(Math.max(0, Math.min(LIGHT.COARSE_MAX, fz - LIGHT.COARSE_DROP)), view);
        const nc = lightLevel(lg.coarse, coarse, 1), nf = lightLevel(lg.fine, fine, 0);
        const fresh = [nc !== lg.coarse && nc, nf !== lg.fine && nf];
        lg.coarse = nc; lg.fine = nf;
        fresh.forEach(l => { if (l) lightFill(l); });
        lightDraw();
        bldRaster();
        bldSchedule();
    }

    function lightOpacity() {
        const z = map.getZoom();
        const zoomF = smoothStep(LIGHT.ZOOM_IN_FROM, LIGHT.ZOOM_IN_TO, z) * (1 - smoothStep(LIGHT.ZOOM_OUT_FROM, LIGHT.ZOOM_OUT_TO, z));
        const op = Math.max(zoomF, BUILDINGS.ON && z >= BUILDINGS.MIN_ZOOM ? 1 : 0);
        if (lg) lg.terr = op > 0 ? zoomF / op : 1;
        terrainPane.style.opacity = preview && lg && previewWindow(preview.kind) ? String(op) : '0';
    }

    function lightDraw() {
        if (lgFrame || !lg) return;
        lgFrame = requestAnimationFrame(() => {
            lgFrame = 0;
            if (!preview || !lg || !lg.view || !lg.fine) { if (lg) lg.gl.clear(lg.gl.COLOR_BUFFER_BIT); return; }
            const { gl, u, view, fine, coarse, canvas } = lg;
            gl.viewport(0, 0, canvas.width, canvas.height);
            gl.clear(gl.COLOR_BUFFER_BIT);
            const t = previewTime(), c = map.getCenter();
            if (t === null) return;
            const sp = SunCalc.getPosition(new Date(t), c.lat, c.lng);
            const az = sp.azimuth + Math.PI, alt = sp.altitude;
            const dusk = 1 - smoothStep(LIGHT.DUSK_FULL, LIGHT.DUSK_FROM, alt * 180 / Math.PI);
            const level = (L2, unit) => {
                const g = L2.grid, tile = Math.pow(2, view.zoom - g.z) * 256;
                gl.activeTexture(gl.TEXTURE0 + unit);
                gl.bindTexture(gl.TEXTURE_2D, L2.tex);
                return { a: [(view.px - g.x0 * tile) / (g.cols * tile), (view.py - g.y0 * tile) / (g.rows * tile)], b: 1 / (g.cols * tile), tx: tile / 512, by: 1 / (g.rows * tile) };
            };
            const f = level(fine, 0), k = level(coarse, 1);
            gl.uniform2f(u.uFineA, f.a[0], f.a[1]);
            gl.uniform2f(u.uCoarseA, k.a[0], k.a[1]);
            gl.uniform2f(u.uFineB, f.b, f.by);
            gl.uniform2f(u.uCoarseB, k.b, k.by);
            gl.uniform1f(u.uFineTx, f.tx);
            gl.uniform1f(u.uCoarseTx, k.tx);
            gl.uniform1f(u.uScale, view.w / canvas.width);
            gl.uniform1f(u.uH, canvas.height);
            const world = 256 * Math.pow(2, view.zoom);
            gl.uniform1f(u.uY0, view.py / world);
            gl.uniform1f(u.uYB, 1 / world);
            gl.uniform1f(u.uMPx, 40075016.686 / world);
            gl.uniform3f(u.uSun, Math.sin(az) * Math.cos(alt), Math.cos(az) * Math.cos(alt), Math.sin(alt));
            gl.uniform1f(u.uMax, Math.max(fine.max, coarse.max));
            gl.uniform1f(u.uEx, LIGHT.EXAGGERATION);
            gl.uniform1f(u.uGain, LIGHT.GAIN);
            gl.uniform1f(u.uLGain, LIGHT.LIGHT_GAIN);
            gl.uniform1f(u.uLFull, Math.cos(LIGHT.LIGHT_FULL_DEG * Math.PI / 180));
            gl.uniform1f(u.uLNone, Math.cos(LIGHT.LIGHT_NONE_DEG * Math.PI / 180));
            gl.uniform1f(u.uWater, LIGHT.WATER_M);
            gl.uniform1f(u.uShore, LIGHT.SHORE_M);
            gl.uniform1f(u.uCastPx, LIGHT.CAST_PX);
            gl.uniform1f(u.uCastShade, LIGHT.CAST_SHADE);
            gl.uniform1f(u.uPen, LIGHT.PENUMBRA_DEG * Math.PI / 180);
            gl.uniform1f(u.uDusk, dusk);
            const col = lg.colours || (lg.colours = lightColours());
            gl.uniform4fv(u.uShade, col.shade);
            gl.uniform4fv(u.uLight, col.light);
            gl.uniform1f(u.uTerr, lg.terr);
            const bf = bldFade();
            gl.activeTexture(gl.TEXTURE2);
            gl.bindTexture(gl.TEXTURE_2D, bldS.tex);
            gl.uniform1f(u.uBld, bf);
            gl.uniform2f(u.uBSize, view.w, view.h);
            gl.uniform1f(u.uBMax, BUILDINGS.MAX_M * BUILDINGS.EXAGGERATION / LIGHT.EXAGGERATION);
            gl.uniform1f(u.uBCast, BUILDINGS.CAST_M);
            gl.uniform1f(u.uBShade, BUILDINGS.SHADE);
            gl.uniform1f(u.uBPen, BUILDINGS.PENUMBRA_DEG * Math.PI / 180);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
            if (bf > 0 && bf < 1) lightDraw();
        });
    }

    map.on('zoomanim', e => {
        if (!preview || !lg || !lg.view) return;
        L.DomUtil.setTransform(lg.canvas, map._latLngToNewLayerPoint(lg.view.nw, e.zoom, e.center), map.getZoomScale(e.zoom));
    });
    map.on('zoom move', () => {
        if (!preview || !lg || !lg.view || map._animatingZoom) return;
        L.DomUtil.setTransform(lg.canvas, map.latLngToLayerPoint(lg.view.nw), map.getZoomScale(map.getZoom(), lg.view.zoom));
    });
    map.on('moveend resize', () => { if (preview && lg) { lightLayout(); lightOpacity(); } });

    const bldS = { tiles: new Map(), loading: new Map(), failed: new Map(), url: null, lib: null, tex: null, canvas: null, ctx: null, has: false, fade0: null, timer: 0, soon: 0 };

    function bldSetup(gl) {
        bldS.tex = gl.createTexture();
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, bldS.tex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 1, 1, 0, gl.RED, gl.UNSIGNED_BYTE, new Uint8Array(1));
        bldS.canvas = document.createElement('canvas');
        bldS.ctx = bldS.canvas.getContext('2d', { alpha: false });
    }

    function bldActive() {
        return BUILDINGS.ON && !!preview && !!lg && !!lg.view && lg.view.zoom >= BUILDINGS.MIN_ZOOM && !!previewWindow(preview.kind);
    }

    function bldFade() {
        if (!bldS.has || !bldActive()) return 0;
        if (bldS.fade0 === null) bldS.fade0 = performance.now();
        return Math.max(0.001, smoothStep(0, BUILDINGS.FADE_MS, performance.now() - bldS.fade0));
    }

    function bldStop() {
        clearTimeout(bldS.timer);
        bldS.has = false; bldS.fade0 = null;
    }

    function bldReady() {
        if (!bldS.lib) bldS.lib = new Promise((ok, no) => {
            if (window.VectorTile && window.Pbf) return ok();
            const sc = document.createElement('script');
            sc.src = BUILDINGS.LIB; sc.async = true; sc.onload = ok; sc.onerror = no;
            document.head.appendChild(sc);
        }).catch(e => { bldS.lib = null; throw e; });
        if (!bldS.url) bldS.url = fetch(BUILDINGS.TILEJSON).then(r => r.json()).then(j => j.tiles[0]).catch(e => { bldS.url = null; throw e; });
        return Promise.all([bldS.lib, bldS.url]).then(r => r[1]);
    }

    function bldTile(x, y, key) {
        if (bldS.loading.has(key)) return bldS.loading.get(key);
        const z = BUILDINGS.TILE_Z;
        const job = bldReady().then(url => fetch(url.replace('{z}', z).replace('{x}', x).replace('{y}', y)))
            .then(r => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
            .then(buf => {
                const layer = new VectorTile(new Pbf(new Uint8Array(buf))).layers[BUILDINGS.LAYER], out = [];
                const n = layer ? layer.length : 0, k = layer ? 256 / Math.pow(2, z) / layer.extent : 0, ox = x * 256 / Math.pow(2, z), oy = y * 256 / Math.pow(2, z);
                for (let i = 0; i < n; i++) {
                    const f = layer.feature(i);
                    if (f.type !== 3) continue;
                    const h = Math.min(BUILDINGS.MAX_M, Number(f.properties[BUILDINGS.HEIGHT]) || BUILDINGS.DEFAULT_M);
                    const b = [Infinity, Infinity, -Infinity, -Infinity], rings = f.loadGeometry().map(ring => {
                        const r = new Float64Array(ring.length * 2);
                        ring.forEach((p, j) => {
                            const px = ox + p.x * k, py = oy + p.y * k;
                            r[2 * j] = px; r[2 * j + 1] = py;
                            if (px < b[0]) b[0] = px; if (py < b[1]) b[1] = py; if (px > b[2]) b[2] = px; if (py > b[3]) b[3] = py;
                        });
                        return r;
                    });
                    out.push({ h, rings, b });
                }
                bldS.tiles.set(key, out);
                while (bldS.tiles.size > BUILDINGS.CACHE_TILES) bldS.tiles.delete(bldS.tiles.keys().next().value);
                bldS.failed.delete(key);
                bldRasterSoon();
            })
            .catch(() => { bldS.failed.set(key, Date.now()); })
            .finally(() => bldS.loading.delete(key));
        bldS.loading.set(key, job);
        return job;
    }

    function bldTiles() {
        const g = lightGrid(BUILDINGS.TILE_Z, lg.view), list = [];
        const cx = (g.cols - 1) / 2, cy = (g.rows - 1) / 2;
        for (let r = 0; r < g.rows; r++) for (let c = 0; c < g.cols; c++) {
            const x = ((g.x0 + c) % g.n + g.n) % g.n, y = g.y0 + r;
            list.push({ x, y, key: x + '/' + y, d: (c - cx) ** 2 + (r - cy) ** 2 });
        }
        return list.sort((a, b) => a.d - b.d).slice(0, BUILDINGS.MAX_TILES);
    }

    function bldSchedule() {
        clearTimeout(bldS.timer);
        if (bldActive()) bldS.timer = setTimeout(bldFetch, BUILDINGS.DEBOUNCE_MS);
    }

    function bldFetch() {
        if (!bldActive()) return;
        const now = Date.now();
        for (const t of bldTiles()) {
            const keep = bldS.tiles.get(t.key);
            if (keep) { bldS.tiles.delete(t.key); bldS.tiles.set(t.key, keep); continue; }
            if (now - (bldS.failed.get(t.key) || -Infinity) < BUILDINGS.RETRY_MS) continue;
            bldTile(t.x, t.y, t.key);
        }
    }

    function bldRasterSoon() {
        if (!bldS.soon) bldS.soon = requestAnimationFrame(() => { bldS.soon = 0; bldRaster(); });
    }

    function bldRaster() {
        if (!lg || !bldS.tex) return;
        const gl = lg.gl;
        if (!bldActive()) {
            if (bldS.has) { bldS.has = false; bldS.fade0 = null; }
            return;
        }
        const view = lg.view, k = BUILDINGS.RES, s = Math.pow(2, view.zoom) * k, ox = view.px * k, oy = view.py * k;
        const cw = Math.max(1, Math.round(view.w * k)), ch = Math.max(1, Math.round(view.h * k));
        const x0 = view.px / s * k, y0 = view.py / s * k, x1 = x0 + cw / s, y1 = y0 + ch / s;
        const list = [];
        for (const t of bldTiles()) for (const f of bldS.tiles.get(t.key) || []) {
            if (f.b[2] >= x0 && f.b[0] <= x1 && f.b[3] >= y0 && f.b[1] <= y1) list.push(f);
        }
        if (!list.length && !bldS.has) return;
        list.sort((a, b) => a.h - b.h);
        const c = bldS.canvas, ctx = bldS.ctx;
        if (c.width !== cw || c.height !== ch) { c.width = cw; c.height = ch; }
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, cw, ch);
        for (const f of list) {
            ctx.fillStyle = `rgb(${Math.max(1, Math.round(f.h / BUILDINGS.MAX_M * 255))},0,0)`;
            ctx.beginPath();
            for (const r of f.rings) {
                ctx.moveTo(r[0] * s - ox, r[1] * s - oy);
                for (let i = 2; i < r.length; i += 2) ctx.lineTo(r[i] * s - ox, r[i + 1] * s - oy);
                ctx.closePath();
            }
            ctx.fill();
        }
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, bldS.tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, gl.RED, gl.UNSIGNED_BYTE, c);
        bldS.has = list.length > 0;
        if (!bldS.has) bldS.fade0 = null;
        lightDraw();
    }

    function previewShow() {
        const on = !!preview && !!previewWindow(preview.kind);
        el('sunArrows').classList.toggle('is-preview', on);
        placePreviewDot();
        previewCard('rise', on && preview.kind === 'rise');
        previewCard('set', on && preview.kind === 'set');
        if (!on) return;
        const card = pvCards[preview.kind], label = formatTime(new Date(previewTime()), sunInfo.timeZone);
        card.style.setProperty('--f', preview.f.toFixed(4));
        card.querySelector('.mini-pv').textContent = label;
        card.setAttribute('aria-valuenow', String(Math.round(preview.f * 60)));
        card.setAttribute('aria-valuetext', label);
        previewRay();
        lightDraw();
    }

    function previewCard(kind, on) {
        const card = pvCards[kind], ic = card && card.querySelector('.mini-ic'), name = kind === 'rise' ? 'Morning' : 'Evening';
        if (!ic || card.classList.contains('is-scrub') === on) return;
        card.classList.toggle('is-scrub', on);
        card.setAttribute('role', on ? 'slider' : 'button');
        card.setAttribute('aria-label', on ? name + ' golden hour light preview' : name + ' golden hour');
        if (on) {
            card.setAttribute('aria-valuemin', '0');
            card.setAttribute('aria-valuemax', '60');
            ic.setAttribute('role', 'button');
            ic.setAttribute('tabindex', '0');
            ic.setAttribute('aria-label', 'Play the golden hour light');
            ic.setAttribute('aria-pressed', 'false');
        } else {
            ['aria-valuemin', 'aria-valuemax', 'aria-valuenow', 'aria-valuetext'].forEach(n => card.removeAttribute(n));
            ['role', 'tabindex', 'aria-label', 'aria-pressed'].forEach(n => ic.removeAttribute(n));
        }
    }

    function previewSeek(f) {
        if (!preview) return;
        previewStop();
        preview.f = Math.min(1, Math.max(0, f));
        previewShow();
    }

    function previewRay() {
        const t = previewTime();
        if (!preview || t === null || pinKind !== preview.kind || rayBearings[preview.kind] === null) return;
        const c = map.getCenter();
        rayBearings[preview.kind] = bearingAt(new Date(t), c.lat, c.lng);
        updateRayAngle();
    }

    function previewStop() {
        if (!lgPlay) return;
        cancelAnimationFrame(lgPlay.raf);
        lgPlay = null;
        document.querySelectorAll('.mini-ic[aria-pressed]').forEach(ic => { ic.setAttribute('aria-pressed', 'false'); ic.setAttribute('aria-label', 'Play the golden hour light'); });
    }
    function previewPlay() {
        if (lgPlay) { previewStop(); return; }
        if (!preview) return;
        if (preview.f >= 1) preview.f = 0;
        lgPlay = { from: preview.f, t0: performance.now(), raf: 0 };
        const ic = pvCards[preview.kind].querySelector('.mini-ic');
        ic.setAttribute('aria-pressed', 'true');
        ic.setAttribute('aria-label', 'Pause');
        const step = now => {
            if (!lgPlay || !preview) return;
            preview.f = Math.min(1, lgPlay.from + (now - lgPlay.t0) / LIGHT.PLAY_MS);
            previewShow();
            if (preview.f >= 1) previewStop();
            else lgPlay.raf = requestAnimationFrame(step);
        };
        lgPlay.raf = requestAnimationFrame(step);
    }

    function setGoldenPreview(kind) {
        previewStop();
        if (!kind || !lightGL()) {
            const was = !!preview;
            preview = null;
            bldStop();
            previewShow();
            lightOpacity();
            if (was) { lightDraw(); renderSunArrows(map.getCenter()); }
            return;
        }
        preview = { kind, f: 0 };
        lg.colours = null;
        previewShow();
        lightLayout();
        lightOpacity();
    }

    function syncGoldenPreview() {
        if (!preview) return;
        previewShow();
        lightOpacity();
        if (!previewWindow(preview.kind)) previewStop();
    }

    map.whenReady(() => {
        const conn = navigator.connection;
        if (conn && conn.saveData) return;
        const preload = () => {
            const z0 = Math.round(map.getZoom());
            const c = map.getCenter();
            [[z0 - 1, 1], [z0 + 1, 2]].forEach(([z, span]) => {
                if (z < map.getMinZoom() || z > map.getMaxZoom()) return;
                const p = map.project(c, z).divideBy(256);
                const n = Math.pow(2, z);
                const first = span === 1 ? Math.floor(p.x) : Math.round(p.x) - 1;
                const firstY = span === 1 ? Math.floor(p.y) : Math.round(p.y) - 1;
                for (let dx = 0; dx < span; dx++) {
                    for (let dy = 0; dy < span; dy++) {
                        const y = firstY + dy;
                        if (y < 0 || y >= n) continue;
                        const x = ((first + dx) % n + n) % n;
                        [IMAGERY_URL, LABELS_URL].forEach(url => { new Image().src = L.Util.template(url, { z, y, x }); });
                    }
                }
            });
        };
        if (window.requestIdleCallback) requestIdleCallback(preload, { timeout: 4000 }); else setTimeout(preload, 1500);
    });

    const toast = el('toast');
    let toastTimer = null;
    function showToast(message) {
        toast.textContent = message;
        toast.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toast.classList.remove('show'), 2400);
    }

    const liveRegion = el('liveRegion');
    let liveTimer = null;
    function announce(message) {
        clearTimeout(liveTimer);
        liveTimer = setTimeout(() => { liveRegion.textContent = message; }, 600);
    }

    const dock = el('dock');
    const refs = {
        amFrom: el('amFrom'), amTo: el('amTo'), pmFrom: el('pmFrom'), pmTo: el('pmTo'),
        sunriseTime: el('sunriseTime'), sunsetTime: el('sunsetTime'),
        sunriseDir: el('sunriseDir'), sunsetDir: el('sunsetDir'),
        miniAm: el('miniAm'), miniPm: el('miniPm'), nowAm: el('nowAm'), nowPm: el('nowPm'),
        windows: el('windows'), notice: el('notice'),
        noticeTitle: el('noticeTitle'), noticeText: el('noticeText'), noticeIcon: el('noticeIcon')
    };
    let lastSignature = '';
    let sunInfo = null;

    function updateDockHeight() {
        const h = Math.max(0, window.innerHeight - dock.getBoundingClientRect().top);
        document.documentElement.style.setProperty('--dock-h', Math.round(h) + 'px');
    }
    if ('ResizeObserver' in window) new ResizeObserver(() => updateDockHeight()).observe(dock);
    window.addEventListener('resize', updateDockHeight);
    updateDockHeight();

    let shareUsed = false;
    function shareSpot() {
        const center = map.getCenter().wrap();
        const pad = n => String(n).padStart(2, '0');
        const dateStr = `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${date.getFullYear()}`;
        const shareUrl = `${window.location.origin}${window.location.pathname}?lat=${+center.lat.toFixed(6)}&lng=${+center.lng.toFixed(6)}&date=${dateStr}`;
        copyToClipboard(shareUrl);
        showToast('Link copied to clipboard');
        shareUsed = true;
        hideShareHint();
    }
    el('shareBtn').addEventListener('click', shareSpot);
    el('shareFab').addEventListener('click', shareSpot);

    function copyToClipboard(text) {
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
            return;
        }
        fallbackCopy(text);
    }

    function fallbackCopy(text) {
        const tempInput = document.createElement('input');
        document.body.appendChild(tempInput);
        tempInput.value = text;
        tempInput.select();
        document.execCommand('copy');
        document.body.removeChild(tempInput);
    }

    const CONSENT_KEY = 'ghm-consent-v2';
    const CONSENT_MONTHS = 12;
    const GA_CONFIG = { anonymize_ip: true, allow_google_signals: false, allow_ad_personalization_signals: false, cookie_flags: 'SameSite=Lax;Secure' };
    const browserSignal = (() => {
        try { return navigator.globalPrivacyControl === true || navigator.doNotTrack === '1' || window.doNotTrack === '1' || navigator.msDoNotTrack === '1'; }
        catch (e) { return false; }
    })();
    let consent = null;
    let analyticsStarted = false;

    function readConsent() {
        try {
            const o = JSON.parse(localStorage.getItem(CONSENT_KEY) || 'null');
            if (!o || (o.c !== 'granted' && o.c !== 'denied')) return null;
            const t = Date.parse(o.d);
            if (!isFinite(t)) return null;
            const exp = new Date(t); exp.setMonth(exp.getMonth() + CONSENT_MONTHS);
            return Date.now() > exp.getTime() ? null : o.c;
        } catch (e) { return null; }
    }
    function writeConsent(choice) {
        try { localStorage.setItem(CONSENT_KEY, JSON.stringify({ c: choice, d: new Date().toISOString() })); return true; }
        catch (e) { return false; }
    }
    function clearGaCookies() {
        try {
            const names = document.cookie.split(';').map(s => s.split('=')[0].trim()).filter(n => /^(_ga|_gid|_gat)/.test(n));
            if (!names.length) return;
            const parts = location.hostname.split('.');
            const scopes = [''];
            for (let i = 0; i < parts.length - 1; i++) scopes.push('; domain=.' + parts.slice(i).join('.'));
            scopes.push('; domain=' + location.hostname);
            names.forEach(n => scopes.forEach(sc => { document.cookie = n + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/' + sc; }));
        } catch (e) { }
    }
    function gtag() { window.dataLayer.push(arguments); }
    function loadGoogleAnalytics(id) {
        if (consent !== 'granted' || browserSignal) return;
        window['ga-disable-' + id] = false;
        if (analyticsStarted) { gtag('config', id, GA_CONFIG); return; }
        analyticsStarted = true;
        window.dataLayer = window.dataLayer || [];
        gtag('js', new Date());
        gtag('config', id, GA_CONFIG);
        const script = document.createElement('script');
        script.src = `https://www.googletagmanager.com/gtag/js?id=${id}`;
        script.async = true;
        document.head.appendChild(script);
    }
    function stopAnalytics() {
        window['ga-disable-' + GA_ID] = true;
        clearGaCookies();
    }
    function setConsent(choice) {
        if (browserSignal) choice = 'denied';
        let ok = true;
        if (choice === 'granted') { ok = writeConsent('granted'); if (!ok) choice = 'denied'; }
        else if (!browserSignal) writeConsent('denied');
        consent = choice;
        if (choice === 'granted') loadGoogleAnalytics(GA_ID); else stopAnalytics();
        refreshConsentUI();
        return ok;
    }
    consent = browserSignal ? 'denied' : readConsent();
    if (consent === 'granted') loadGoogleAnalytics(GA_ID); else if (browserSignal) stopAnalytics();

    const SIGNAL_TEXT = 'Your browser is sending a Do Not Track or Global Privacy Control signal, so analytics is off.';
    const consentBanner = el('consentBanner');
    let consentTimer = null;
    const consentNeeded = () => !browserSignal && consent === null;
    function showConsentBanner() {
        clearTimeout(consentTimer);
        if (!consentNeeded() || !consentBanner.hidden) return;
        consentBanner.hidden = false;
        requestAnimationFrame(() => consentBanner.classList.add('show'));
        announce('We use Google Analytics to understand how the site is used. Accept or decline, your choice.');
    }
    function hideConsentBanner() {
        clearTimeout(consentTimer);
        if (consentBanner.hidden) return;
        const hadFocus = consentBanner.contains(document.activeElement);
        consentBanner.classList.remove('show');
        setTimeout(() => { consentBanner.hidden = true; }, reducedMotion() ? 0 : 350);
        if (hadFocus) el('toolsBtn').focus({ preventScroll: true });
    }
    function consentWelcomeClosed() {
        clearTimeout(consentTimer);
        if (tourQueued || tourOpen) return;
        if (consentNeeded()) consentTimer = setTimeout(showConsentBanner, 600);
    }

    function refreshConsentUI() {
        if (!consentNeeded()) hideConsentBanner();
        el('prvStatus').textContent = browserSignal ? SIGNAL_TEXT
            : consent === 'granted' ? 'Analytics on. Thank you, this helps improve the site.'
            : consent === 'denied' ? 'Analytics off.'
            : 'You haven\u2019t chosen yet. Nothing is collected unless you accept.';
        el('prvAllow').setAttribute('aria-pressed', String(consent === 'granted'));
        el('prvDeny').setAttribute('aria-pressed', String(consent === 'denied'));
        el('prvAllow').disabled = browserSignal;
    }
    const welcome = el('welcome');
    const appRoot = el('app');
    let tourQueued = false, tourOpen = false;
    let welcomeOpener = null;

    const welcomeVideo = el('welcomeVideo');
    const welcomeVideoAllowed = !(reducedMotion() || (navigator.connection && navigator.connection.saveData));
    if (welcomeVideoAllowed) {
        const showWelcomeVideo = () => welcomeVideo.classList.remove('is-loading');
        if (welcomeVideo.readyState < 2) {
            welcomeVideo.classList.add('is-loading');
            ['loadeddata', 'canplay', 'playing', 'error'].forEach(ev => welcomeVideo.addEventListener(ev, showWelcomeVideo, { once: true }));
            setTimeout(showWelcomeVideo, 6000);
        }
    } else {
        welcomeVideo.pause();
        welcomeVideo.removeAttribute('src');
        welcomeVideo.load();
        welcomeVideo.parentElement.classList.add('no-video');
    }

    function openWelcome(opener) {
        welcomeOpener = opener || null;
        welcome.hidden = false;
        appRoot.setAttribute('inert', '');
        el('toast').setAttribute('inert', '');
        requestAnimationFrame(() => welcome.classList.add('open'));
        if (welcomeVideoAllowed) { const pr = welcomeVideo.play(); if (pr && pr.catch) pr.catch(() => {}); }
        refreshConsentUI();
        focusWelcome();
    }
    function focusWelcome() { welcome.focus({ preventScroll: true }); }

    function closeWelcome() {
        welcome.classList.remove('open');
        appRoot.removeAttribute('inert');
        el('toast').removeAttribute('inert');
        setTimeout(() => { welcome.hidden = true; welcomeVideo.pause(); }, reducedMotion() ? 0 : 320);
        if (welcomeOpener && welcomeOpener.focus) welcomeOpener.focus({ preventScroll: true });
        maybeStartTour();
        supportWelcomeClosed();
        consentWelcomeClosed();
    }

    appRoot.setAttribute('inert', '');
    refreshConsentUI();
    focusWelcome();

    el('startButton').addEventListener('click', () => closeWelcome());
    el('startButton').addEventListener('click', e => {
        if (reducedMotion()) return;
        const btn = e.currentTarget;
        const r = btn.getBoundingClientRect();
        const size = Math.max(r.width, r.height) * 2.2;
        const ripple = document.createElement('span');
        ripple.className = 'welcome-ripple';
        ripple.setAttribute('aria-hidden', 'true');
        ripple.style.width = ripple.style.height = size + 'px';
        ripple.style.left = (e.detail === 0 ? r.width / 2 : e.clientX - r.left) + 'px';
        ripple.style.top = (e.detail === 0 ? r.height / 2 : e.clientY - r.top) + 'px';
        btn.appendChild(ripple);
        setTimeout(() => ripple.remove(), 600);
    });
    el('consentAccept').addEventListener('click', () => {
        if (setConsent('granted')) showToast('Analytics on'); else showToast('Your browser blocks storage, so analytics stays off.');
    });
    el('consentDecline').addEventListener('click', () => { setConsent('denied'); showToast('Analytics off'); });
    welcome.addEventListener('keydown', e => {
        if (e.key === 'Escape' && welcomeOpener) { closeWelcome(); return; }
        if (e.key === 'Tab') {
            const items = Array.from(welcome.querySelectorAll('button:not([hidden]), a[href], input, [tabindex="0"]'))
                .filter(n => n.offsetParent !== null);
            if (!items.length) return;
            const first = items[0], last = items[items.length - 1];
            if (e.shiftKey && (document.activeElement === first || document.activeElement === welcome)) { e.preventDefault(); last.focus(); }
            else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
    });

    el('infoBtn').addEventListener('click', () => openWelcome(el('toolsBtn')));

    const TOUR_KEY = 'ghm-tour-done';
    const tourCard = el('tourCard');
    const tourRing = el('tourRing');
    const tourNext = el('tourNext');
    const tourBack = el('tourBack');
    const tourSkip = el('tourSkip');
    const tourDots = el('tourDots');
    const tourSteps = [
        { title: 'Pick a spot', text: 'Drag the map so the dot sits on your chosen location. The time will update live.',
          target: () => document.querySelector('.map-centre'), size: 22, radius: '50%', place: 'below' },
        { title: 'Search', text: 'Looking for somewhere specific? Search for a town, street or landmark and the map moves there.',
          target: () => el('searchToggle'), radius: '50%', place: 'below' },
        { title: 'Golden hour times', text: 'Tap Morning or Evening to pin the sun line and preview the light and shadows on the hills. Drag across the card to move through the hour, or press play. Tap again to close.',
          target: () => el('windows'), radius: '24px', place: 'above' },
        { title: 'Day and sun path', text: 'Change the day here, or open the arrow to see the sun path with sunrise and sunset.',
          target: () => document.querySelector('.dock-row'), radius: '24px', place: 'above' },
        { title: 'Location and menu', text: 'The top menu has more options, below that you can zoom to your current location, or share the selected day & location to plan your shoot.',
          target: () => el('tools'), radius: '24px', place: 'below' }
    ];
    let tourIdx = 0, tourTimer = null, tourPoll = null, tourReturn = null;

    function tourDone() {
        try { return localStorage.getItem(TOUR_KEY) === '1' || localStorage.getItem('ghm-hint-seen') === '1'; } catch (e) { return false; }
    }
    function tourRect(step) {
        const t = step.target();
        if (!t) return null;
        const r = t.getBoundingClientRect();
        if (step.size) { const h = step.size / 2; return { left: r.left - h, top: r.top - h, width: step.size, height: step.size, right: r.left + h, bottom: r.top + h }; }
        return r.width > 0 && r.height > 0 ? r : null;
    }
    function tourPlace(instant) {
        if (!tourOpen) return;
        const step = tourSteps[tourIdx];
        const M = 12, GAP = 14, PAD = 6;
        const vw = document.documentElement.clientWidth, vh = window.innerHeight;
        const cw = tourCard.offsetWidth, ch = tourCard.offsetHeight;
        const r = tourRect(step);
        let left, top;
        if (r) {
            const below = r.bottom + PAD + GAP + ch <= vh - M;
            const above = r.top - PAD - GAP - ch >= M;
            let useBelow = step.place === 'below';
            if (useBelow && !below && above) useBelow = false;
            else if (!useBelow && !above && below) useBelow = true;
            else if (!below && !above) useBelow = (vh - r.bottom) >= r.top;
            left = r.left + r.width / 2 - cw / 2;
            top = useBelow ? r.bottom + PAD + GAP : r.top - PAD - GAP - ch;
            tourRing.hidden = false;
            tourRing.style.left = Math.round(r.left - PAD) + 'px';
            tourRing.style.top = Math.round(r.top - PAD) + 'px';
            tourRing.style.width = Math.round(r.width + 2 * PAD) + 'px';
            tourRing.style.height = Math.round(r.height + 2 * PAD) + 'px';
            tourRing.style.borderRadius = step.radius;
        } else {
            tourRing.hidden = true;
            left = (vw - cw) / 2;
            top = vh - ch - 140;
        }
        left = Math.max(M, Math.min(left, vw - cw - M));
        top = Math.max(M, Math.min(top, vh - ch - M));
        if (instant) { tourCard.classList.add('is-placing'); tourRing.classList.add('is-placing'); }
        tourCard.style.left = Math.round(left) + 'px';
        tourCard.style.top = Math.round(top) + 'px';
        if (instant) {
            void tourCard.offsetWidth;
            tourCard.classList.remove('is-placing'); tourRing.classList.remove('is-placing');
        }
    }
    function tourShow(i, instant) {
        tourIdx = i;
        const step = tourSteps[i];
        const last = i === tourSteps.length - 1;
        el('tourCount').textContent = 'Step ' + (i + 1) + ' of ' + tourSteps.length + '.';
        el('tourTitle').textContent = step.title;
        el('tourText').textContent = step.text;
        Array.from(tourDots.children).forEach((d, n) => d.classList.toggle('on', n === i));
        tourBack.hidden = i === 0;
        tourSkip.hidden = last;
        tourNext.textContent = last ? 'Done' : 'Next';
        tourPlace(instant);
        tourNext.focus({ preventScroll: true });
    }
    function startTour() {
        clearTimeout(tourTimer);
        if (tourOpen) return;
        if (!welcome.hidden || menuIsOpen() || calOpen || !privacyPanel.hidden || !faqPanel.hidden || appRoot.classList.contains('is-searching')) {
            tourQueued = false;
            consentWelcomeClosed();
            return;
        }
        tourQueued = false;
        tourOpen = true;
        tourReturn = document.activeElement;
        document.documentElement.classList.add('tour-open');
        tourDots.textContent = '';
        tourSteps.forEach(() => tourDots.appendChild(document.createElement('i')));
        tourCard.hidden = false;
        tourShow(0, true);
        requestAnimationFrame(() => { tourCard.classList.add('show'); tourRing.classList.add('show'); });
        clearInterval(tourPoll);
        tourPoll = setInterval(() => {
            if (appRoot.classList.contains('is-searching') || menuIsOpen() || calOpen || !welcome.hidden || !privacyPanel.hidden || !faqPanel.hidden) { endTour(false); return; }
            tourPlace(false);
        }, 400);
    }
    function endTour(returnFocus) {
        if (!tourOpen) return;
        tourOpen = false;
        tourQueued = false;
        clearInterval(tourPoll);
        try { localStorage.setItem(TOUR_KEY, '1'); } catch (e) { }
        document.documentElement.classList.remove('tour-open');
        tourCard.classList.remove('show');
        tourRing.classList.remove('show');
        const hadFocus = tourCard.contains(document.activeElement);
        setTimeout(() => { if (!tourOpen) { tourCard.hidden = true; tourRing.hidden = true; } }, reducedMotion() ? 0 : 320);
        if ((returnFocus !== false || hadFocus) && tourReturn && tourReturn !== document.body && document.contains(tourReturn) && tourReturn.focus) tourReturn.focus({ preventScroll: true });
        tourReturn = null;
        consentWelcomeClosed();
    }
    function maybeStartTour() {
        if (tourDone() || tourOpen || tourQueued) return;
        tourQueued = true;
        clearTimeout(tourTimer);
        tourTimer = setTimeout(startTour, reducedMotion() ? 250 : 700);
    }
    tourNext.addEventListener('click', () => { if (tourIdx >= tourSteps.length - 1) endTour(true); else tourShow(tourIdx + 1, false); });
    tourBack.addEventListener('click', () => { if (tourIdx > 0) tourShow(tourIdx - 1, false); });
    tourSkip.addEventListener('click', () => endTour(true));
    document.addEventListener('keydown', e => {
        if (!tourOpen) return;
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); endTour(true); return; }
        if (!tourCard.contains(document.activeElement)) return;
        if (e.key === 'Tab') {
            const btns = Array.from(tourCard.querySelectorAll('button')).filter(b => !b.hidden);
            const first = btns[0], lastBtn = btns[btns.length - 1];
            if (e.shiftKey && document.activeElement === first) { e.preventDefault(); lastBtn.focus(); }
            else if (!e.shiftKey && document.activeElement === lastBtn) { e.preventDefault(); first.focus(); }
        } else if (e.key === 'ArrowRight') { e.preventDefault(); tourNext.click(); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); tourBack.click(); }
    }, true);
    window.addEventListener('resize', () => tourPlace(true));
    window.addEventListener('orientationchange', () => setTimeout(() => tourPlace(true), 250));
    el('tipsBtn').addEventListener('click', () => { clearTimeout(tourTimer); setTimeout(startTour, 80); });

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/service-worker.js')
            .then(registration => console.log('Service Worker registered with scope:', registration.scope))
            .catch(error => console.log('Service Worker registration failed:', error));
    }

    const calBtn = el('cal');
    const calEl = el('calendar');
    const calScrim = el('calScrim');
    const calGrid = el('calGrid');
    const calMonths = el('calMonths');
    const calTitle = el('calTitle');
    const calTitleText = el('calTitleText');
    const calPrev = el('calPrev');
    const calNext = el('calNext');

    const CAL_MIN_YEAR = 1900;
    const CAL_MAX_YEAR = 2100;
    const FULL_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const FULL_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const DOW_SHORT = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
    let calOpen = false;
    let calMode = 'days';
    let calFocusDate = null;
    let calCloseTimer = null;

    el('prev-day').addEventListener('click', () => stepDay(-1));
    el('next-day').addEventListener('click', () => stepDay(1));

    function stepDay(offset) {
        date.setDate(date.getDate() + offset);
        updateDateLabel();
        if (calOpen) {
            calFocusDate = clampCalDate(calDay(date.getFullYear(), date.getMonth(), date.getDate()));
            renderCal(false);
        }
        changeSunArrows(refresh);
        supportAction();
    }

    const calDay = (y, m, d) => new Date(y, m, d, 12);
    const calDaysIn = (y, m) => new Date(y, m + 1, 0).getDate();
    const calInRange = d => d.getFullYear() >= CAL_MIN_YEAR && d.getFullYear() <= CAL_MAX_YEAR;
    const calSameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
    const calLabel = d => `${FULL_DAYS[d.getDay()]} ${d.getDate()} ${FULL_MONTHS[d.getMonth()]} ${d.getFullYear()}`;

    function clampCalDate(d) {
        if (d.getFullYear() < CAL_MIN_YEAR) return calDay(CAL_MIN_YEAR, 0, 1);
        if (d.getFullYear() > CAL_MAX_YEAR) return calDay(CAL_MAX_YEAR, 11, 31);
        return d;
    }
    function calAddMonths(d, n) {
        const first = calDay(d.getFullYear(), d.getMonth() + n, 1);
        const y = first.getFullYear();
        const m = first.getMonth();
        return clampCalDate(calDay(y, m, Math.min(d.getDate(), calDaysIn(y, m))));
    }

    function renderCal(focusActive) {
        const f = calFocusDate;
        const y = f.getFullYear();
        const m = f.getMonth();
        const days = calMode === 'days';
        calGrid.hidden = !days;
        calMonths.hidden = days;
        calTitle.setAttribute('aria-expanded', String(!days));
        calTitle.title = days ? 'Choose month and year' : 'Back to days';
        calTitleText.textContent = days ? `${FULL_MONTHS[m]} ${y}` : String(y);
        calPrev.setAttribute('aria-label', days ? 'Previous month' : 'Previous year');
        calNext.setAttribute('aria-label', days ? 'Next month' : 'Next year');
        calPrev.disabled = days ? (y === CAL_MIN_YEAR && m === 0) : y <= CAL_MIN_YEAR;
        calNext.disabled = days ? (y === CAL_MAX_YEAR && m === 11) : y >= CAL_MAX_YEAR;

        const ae = document.activeElement;
        const refocus = focusActive || (calEl.contains(ae) && (calGrid.contains(ae) || calMonths.contains(ae) || ae.disabled));

        if (days) {
            let html = '<div class="cal-row" role="row">' + DOW_SHORT.map((n, i) =>
                `<span class="cal-dow" role="columnheader" aria-label="${FULL_DAYS[(i + 1) % 7]}">${n}</span>`).join('') + '</div>';
            const lead = (calDay(y, m, 1).getDay() + 6) % 7;
            for (let w = 0; w < 6; w++) {
                html += '<div class="cal-row" role="row">';
                for (let i = 0; i < 7; i++) {
                    const d = calDay(y, m, 1 - lead + w * 7 + i);
                    const sel = calSameDay(d, date);
                    const tod = calSameDay(d, today);
                    const cls = 'cal-day' + (d.getMonth() !== m ? ' is-out' : '') + (sel ? ' is-sel' : '') + (tod ? ' is-today' : '');
                    html += `<button type="button" role="gridcell" class="${cls}" data-t="${d.getTime()}" tabindex="${calSameDay(d, f) ? 0 : -1}"`
                        + ` aria-selected="${sel}"${tod ? ' aria-current="date"' : ''}${calInRange(d) ? '' : ' disabled'} aria-label="${calLabel(d)}">${d.getDate()}</button>`;
                }
                html += '</div>';
            }
            calGrid.innerHTML = html;
        } else {
            let html = '';
            for (let k = 0; k < 12; k++) {
                const sel = date.getFullYear() === y && date.getMonth() === k;
                const tod = today.getFullYear() === y && today.getMonth() === k;
                html += `<button type="button" class="cal-month${sel ? ' is-sel' : ''}${tod ? ' is-today' : ''}" data-m="${k}" tabindex="${k === m ? 0 : -1}"`
                    + ` aria-pressed="${sel}"${tod ? ' aria-current="date"' : ''} aria-label="${FULL_MONTHS[k]} ${y}">${MONTH_NAMES[k]}</button>`;
            }
            calMonths.innerHTML = html;
        }
        if (refocus) {
            const target = (days ? calGrid : calMonths).querySelector('[tabindex="0"]');
            if (target) target.focus({ preventScroll: true });
        }
    }

    function setCalMode(mode, focusActive) {
        calMode = mode;
        renderCal(focusActive);
    }

    function placeCal() {
        const modal = isMobileLayout();
        calEl.classList.toggle('cal-modal', modal);
        if (modal) calEl.classList.remove('cal-above');
        calEl.setAttribute('aria-modal', String(modal));
        calScrim.hidden = !modal;
        if (modal) {
            calEl.style.left = '';
            calEl.style.top = '';
            return;
        }
        const pill = calBtn.parentElement.getBoundingClientRect();
        const w = calEl.offsetWidth;
        const h = calEl.offsetHeight;
        const vw = document.documentElement.clientWidth;
        const vh = window.innerHeight;
        const left = Math.max(12, Math.min(pill.left + pill.width / 2 - w / 2, vw - w - 12));
        let top = pill.bottom + 8;
        let up = false;
        if (top + h > vh - 12) {
            const above = pill.top - 8 - h;
            up = above >= 12;
            top = up ? above : Math.max(12, vh - h - 12);
        }
        calEl.classList.toggle('cal-above', up);
        calEl.style.left = left + 'px';
        calEl.style.top = top + 'px';
    }

    function openCal() {
        if (calOpen) return;
        clearTimeout(calCloseTimer);
        calEl.classList.remove('is-closing');
        calScrim.classList.remove('is-closing');
        calOpen = true;
        calMode = 'days';
        calFocusDate = clampCalDate(calDay(date.getFullYear(), date.getMonth(), date.getDate()));
        calEl.hidden = false;
        placeCal();
        calBtn.setAttribute('aria-expanded', 'true');
        renderCal(true);
        placeCal();
    }

    function closeCal(returnFocus) {
        if (!calOpen) return;
        calOpen = false;
        calBtn.setAttribute('aria-expanded', 'false');
        clearTimeout(calCloseTimer);
        const finish = () => {
            calEl.hidden = true;
            calScrim.hidden = true;
            calEl.classList.remove('is-closing');
            calScrim.classList.remove('is-closing');
        };
        if (reducedMotion()) {
            finish();
        } else {
            calEl.classList.add('is-closing');
            calScrim.classList.add('is-closing');
            calCloseTimer = setTimeout(finish, 170);
        }
        if (returnFocus) calBtn.focus({ preventScroll: true });
    }

    function selectCalDate(d) {
        setSelectedDate(d.getFullYear(), d.getMonth(), d.getDate());
        changeSunArrows(refresh);
        closeCal(true);
        supportAction();
    }

    calBtn.addEventListener('click', () => { if (calOpen) closeCal(true); else openCal(); });
    el('calClose').addEventListener('click', () => closeCal(true));
    el('calToday').addEventListener('click', () => selectCalDate(calDay(today.getFullYear(), today.getMonth(), today.getDate())));
    calPrev.addEventListener('click', () => { calFocusDate = calAddMonths(calFocusDate, calMode === 'days' ? -1 : -12); renderCal(false); });
    calNext.addEventListener('click', () => { calFocusDate = calAddMonths(calFocusDate, calMode === 'days' ? 1 : 12); renderCal(false); });
    calTitle.addEventListener('click', () => setCalMode(calMode === 'days' ? 'months' : 'days', true));
    calScrim.addEventListener('click', () => closeCal(true));

    calGrid.addEventListener('click', e => {
        const b = e.target.closest('.cal-day');
        if (b && !b.disabled) selectCalDate(new Date(Number(b.dataset.t)));
    });
    calMonths.addEventListener('click', e => {
        const b = e.target.closest('.cal-month');
        if (!b) return;
        const y = calFocusDate.getFullYear();
        const k = Number(b.dataset.m);
        calFocusDate = calDay(y, k, Math.min(calFocusDate.getDate(), calDaysIn(y, k)));
        setCalMode('days', true);
    });

    calGrid.addEventListener('keydown', e => {
        if (!e.target.closest('.cal-day') || e.altKey || e.ctrlKey || e.metaKey) return;
        const f = calFocusDate;
        const y = f.getFullYear();
        const m = f.getMonth();
        const d = f.getDate();
        const wd = (f.getDay() + 6) % 7;
        let n = null;
        switch (e.key) {
            case 'ArrowLeft': n = calDay(y, m, d - 1); break;
            case 'ArrowRight': n = calDay(y, m, d + 1); break;
            case 'ArrowUp': n = calDay(y, m, d - 7); break;
            case 'ArrowDown': n = calDay(y, m, d + 7); break;
            case 'Home': n = calDay(y, m, d - wd); break;
            case 'End': n = calDay(y, m, d + (6 - wd)); break;
            case 'PageUp': n = calAddMonths(f, e.shiftKey ? -12 : -1); break;
            case 'PageDown': n = calAddMonths(f, e.shiftKey ? 12 : 1); break;
            default: return;
        }
        e.preventDefault();
        calFocusDate = clampCalDate(n);
        renderCal(true);
    });
    calMonths.addEventListener('keydown', e => {
        if (!e.target.closest('.cal-month') || e.altKey || e.ctrlKey || e.metaKey) return;
        const f = calFocusDate;
        const y = f.getFullYear();
        const m = f.getMonth();
        let k = m;
        switch (e.key) {
            case 'ArrowLeft': k = m - 1; break;
            case 'ArrowRight': k = m + 1; break;
            case 'ArrowUp': k = m - 3; break;
            case 'ArrowDown': k = m + 3; break;
            case 'Home': k = 0; break;
            case 'End': k = 11; break;
            case 'PageUp': e.preventDefault(); calFocusDate = calAddMonths(f, -12); renderCal(true); return;
            case 'PageDown': e.preventDefault(); calFocusDate = calAddMonths(f, 12); renderCal(true); return;
            default: return;
        }
        e.preventDefault();
        k = Math.max(0, Math.min(11, k));
        calFocusDate = calDay(y, k, Math.min(f.getDate(), calDaysIn(y, k)));
        renderCal(true);
    });

    calEl.addEventListener('keydown', e => {
        if (e.key !== 'Tab') return;
        const items = Array.from(calEl.querySelectorAll('button:not([disabled])')).filter(b => b.tabIndex >= 0 && b.getClientRects().length);
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && (document.activeElement === first || !calEl.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && (document.activeElement === last || !calEl.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && calOpen) { e.preventDefault(); closeCal(true); } });
    document.addEventListener('pointerdown', e => {
        if (!calOpen) return;
        const t = e.target;
        if (calEl.contains(t) || calBtn.contains(t) || t === calScrim || (t.closest && t.closest('.datebar'))) return;
        closeCal(false);
    });
    window.addEventListener('resize', () => { if (calOpen) placeCal(); });
    map.on('movestart', () => closeCal(false));

    function getTimeZone(lat, lng) {
        const wrappedLng = ((lng + 180) % 360 + 360) % 360 - 180;
        const clampedLat = Math.max(-90, Math.min(90, lat));
        try {
            return tzlookup(clampedLat, wrappedLng) || 'UTC';
        } catch (error) {
            console.error("Error fetching timezone data: ", error);
            return 'UTC';
        }
    }

    function getSunTimes(lat, lng) {
        const timeZone = getTimeZone(lat, lng);
        const noon = moment.tz({ year: date.getFullYear(), month: date.getMonth(), day: date.getDate(), hour: 12 }, timeZone).toDate();
        return { timeZone, times: SunCalc.getTimes(noon, lat, lng) };
    }

    function setSelectedDate(year, month, day) {
        date.setTime(new Date(year, month, day, 12).getTime());
        updateDateLabel();
    }

    function formatDateLabel(d) {
        const base = `${DAY_NAMES[d.getDay()]} ${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`;
        return d.getFullYear() === today.getFullYear() ? base : `${base} ${d.getFullYear()}`;
    }

    function isToday(d) {
        return d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate();
    }

    function updateDateLabel() {
        const label = formatDateLabel(date);
        el('dateLabel').textContent = label;
        const tod = isToday(date);
        if (tod) calBtn.setAttribute('aria-current', 'date'); else calBtn.removeAttribute('aria-current');
        setNightVisible(tod);
        calBtn.setAttribute('aria-label', `Choose date. Selected: ${date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}${tod ? ', today' : ''}`);
    }

    function refresh() {
        const center = map.getCenter();
        calculateGoldenHour(center);
        drawSunArrows(center);
        syncUrl(center);
    }

    let urlTimer = null;
    function syncUrl(center) {
        clearTimeout(urlTimer);
        urlTimer = setTimeout(() => {
            try {
                const c = center.wrap();
                const pad = n => String(n).padStart(2, '0');
                const dateStr = `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${date.getFullYear()}`;
                const z = globeOn ? `&z=${globeUrlZoom()}` : '';
                const q = `?lat=${c.lat.toFixed(5)}&lng=${c.lng.toFixed(5)}&date=${dateStr}${z}`;
                history.replaceState(null, '', window.location.pathname + q);
            } catch (e) { }
        }, 400);
    }

    function formatTime(d, timeZone) {
        return moment(d).tz(timeZone).format('HH:mm');
    }

    function bearingAt(time, lat, lng) {
        const az = SunCalc.getPosition(time, lat, lng).azimuth * (180 / Math.PI) + 180;
        return ((az % 360) + 360) % 360;
    }

    function directionText(time, lat, lng) {
        const b = bearingAt(time, lat, lng);
        return `${CARDINALS[Math.round(b / 45) % 8]} ${Math.round(b)}\u00b0`;
    }

    function setText(node, value) {
        if (node.textContent !== value) node.textContent = value;
    }
    function setDirText(node, value) {
        if (node.textContent === value) return;
        node.textContent = '';
        const m = /^(.*?)(\u00b0)$/.exec(value);
        if (!m) { node.textContent = value; return; }
        const deg = document.createElement('span');
        deg.className = 'deg'; deg.textContent = m[2];
        node.append(m[1], deg);
    }

    function setState(state) {
        dock.dataset.state = state;
        refs.windows.hidden = state !== 'normal';
        refs.notice.hidden = state === 'normal';
    }

    function calculateGoldenHour(latlng) {
        const { lat, lng } = latlng;
        const { timeZone, times } = getSunTimes(lat, lng);

        const sunrise = times.sunrise ? new Date(times.sunrise) : NaN;
        const sunset = times.sunset ? new Date(times.sunset) : NaN;

        updateDateLabel();

        let signature;

        if (isNaN(sunrise) && isNaN(sunset)) {
            const noonAltitude = SunCalc.getPosition(times.solarNoon, lat, lng).altitude;
            if (noonAltitude > 0) {
                setState('polar-day');
                refs.noticeIcon.setAttribute('href', '#i-sun');
                setText(refs.noticeTitle, 'Polar day');
                setText(refs.noticeText, 'The sun stays above the horizon all day here, so there is no sunrise or sunset golden hour.');
            } else {
                setState('polar-night');
                refs.noticeIcon.setAttribute('href', '#i-moon');
                setText(refs.noticeTitle, 'Polar night');
                setText(refs.noticeText, 'The sun stays below the horizon all day here, so there is no sunrise or sunset golden hour.');
            }
            sunInfo = { state: dock.dataset.state, timeZone };
            signature = dock.dataset.state;
        } else if (isNaN(sunrise.getTime()) || isNaN(sunset.getTime())) {
            setState('partial');
            refs.noticeIcon.setAttribute('href', '#i-sun');
            setText(refs.noticeTitle, 'No golden hour today');
            setText(refs.noticeText, 'No sunrise or sunset at this location.');
            sunInfo = { state: 'partial', timeZone };
            signature = 'partial';
        } else {
            setState('normal');
            const amFrom = formatTime(sunrise, timeZone);
            const amTo = formatTime(new Date(sunrise.getTime() + 3600000), timeZone);
            const pmFrom = formatTime(new Date(sunset.getTime() - 3600000), timeZone);
            const pmTo = formatTime(sunset, timeZone);
            signature = [amFrom, amTo, pmFrom, pmTo, timeZone].join('|');

            const changedAm = refs.amFrom.textContent !== amFrom || refs.amTo.textContent !== amTo;
            const changedPm = refs.pmFrom.textContent !== pmFrom || refs.pmTo.textContent !== pmTo;
            setText(refs.amFrom, amFrom); setText(refs.amTo, amTo);
            setText(refs.pmFrom, pmFrom); setText(refs.pmTo, pmTo);
                    setText(refs.sunriseTime, formatTime(sunrise, timeZone));
            setText(refs.sunsetTime, formatTime(sunset, timeZone));
            const riseDir = directionText(sunrise, lat, lng);
            const setDir = directionText(sunset, lat, lng);
            setDirText(refs.sunriseDir, riseDir);
            setDirText(refs.sunsetDir, setDir);

            if (signature !== lastSignature) {
                if (changedAm) pop(refs.miniAm);
                if (changedPm) pop(refs.miniPm);
            }
            sunInfo = { state: 'normal', timeZone, lat, lng, sunrise, sunset, amFrom, amTo, pmFrom, pmTo };
        }

        drawArc();
        updateNow();
        syncGoldenPreview();

        if (signature !== lastSignature) {
            lastSignature = signature;
            if (dock.dataset.state === 'normal') {
                announce(`${timeZone.replace(/_/g, ' ')}, ${formatDateLabel(date)}. Morning golden hour ${refs.amFrom.textContent} to ${refs.amTo.textContent}. Evening golden hour ${refs.pmFrom.textContent} to ${refs.pmTo.textContent}.`);
            } else {
                announce(`${timeZone.replace(/_/g, ' ')}, ${formatDateLabel(date)}. ${refs.noticeTitle.textContent}. ${refs.noticeText.textContent}`);
            }
        }
    }

    function pop(node) {
        if (!node || reducedMotion() || !node.animate) return;
        node.animate(
            [{ opacity: 0.35, transform: 'translateY(8px) scale(0.985)' }, { opacity: 1, transform: 'none' }],
            { duration: 460, easing: 'cubic-bezier(0.34, 1.45, 0.64, 1)' }
        );
    }

    const minuteOf = ms => Math.floor(ms / 60000);

    function nowFor(info, nowMs) {
        const out = { now: null, frac: null };
        if (!info || info.state !== 'normal') return out;
        const nowLoc = moment.tz(nowMs, info.timeZone);
        const sameDay = nowLoc.year() === date.getFullYear() && nowLoc.month() === date.getMonth() && nowLoc.date() === date.getDate();
        if (!sameDay) return out;
        const sr = info.sunrise.getTime();
        const ss = info.sunset.getTime();
        const nowMin = minuteOf(nowMs);
        const am0 = minuteOf(sr), am1 = minuteOf(sr + 3600000);
        const pm0 = minuteOf(ss - 3600000), pm1 = minuteOf(ss);
        out.frac = (nowMs >= sr && nowMs <= ss) ? (nowMs - sr) / (ss - sr) : null;
        if (nowMin >= am0 && nowMin < am1) out.now = 'am';
        else if (nowMin >= pm0 && nowMin < pm1) out.now = 'pm';
        return out;
    }

    function updateNow() {
        const s = nowFor(sunInfo, Date.now());
        refs.miniAm.classList.toggle('is-now', s.now === 'am');
        refs.miniPm.classList.toggle('is-now', s.now === 'pm');
        refs.nowAm.hidden = s.now !== 'am';
        refs.nowPm.hidden = s.now !== 'pm';
        document.querySelector('.map-centre')?.classList.toggle('is-day', s.now === null && s.frac !== null);
        document.querySelector('.map-centre')?.classList.toggle('is-golden', s.now !== null);
        document.querySelector('.map-centre')?.classList.toggle('not-today', !isToday(date));
        placeNowDot(s.frac);
    }
    setInterval(updateNow, 15000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) updateNow(); });
    const arcEl = el('arc');
    const ARC = { cx: 156, hy: 156, r: 150 };
    let arcNow = null, arcPv = null;

    function arcPt(f) {
        const a = f * Math.PI;
        return [ARC.cx - ARC.r * Math.cos(a), ARC.hy - ARC.r * Math.sin(a)];
    }
    function arcPath(f0, f1) {
        const p = arcPt(f0), q = arcPt(f1);
        return `M${p[0].toFixed(2)} ${p[1].toFixed(2)}A${ARC.r} ${ARC.r} 0 0 1 ${q[0].toFixed(2)} ${q[1].toFixed(2)}`;
    }
    function clearArc() {
        arcEl.textContent = '';
        arcNow = null;
    }
    function drawArc() {
        if (!sunInfo || sunInfo.state !== 'normal') { clearArc(); return; }
        const day = sunInfo.sunset.getTime() - sunInfo.sunrise.getTime();
        const g = Math.min(0.5, 3600000 / day);
        const p0 = arcPt(0);
        const p1 = arcPt(1);
        const am = arcPath(0, g);
        const pm = arcPath(1 - g, 1);
        arcEl.innerHTML =
            '<defs>' +
            '<linearGradient id="arcGold" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ffd46b"/><stop offset="1" stop-color="#f5a00b"/></linearGradient>' +
            '<radialGradient id="arcEnd"><stop offset="0" stop-color="#f5a00b" stop-opacity="0.3"/><stop offset="1" stop-color="#f5a00b" stop-opacity="0"/></radialGradient>' +
            '<radialGradient id="arcHalo"><stop offset="0" stop-color="#f5a00b" stop-opacity="0.55"/><stop offset="1" stop-color="#f5a00b" stop-opacity="0"/></radialGradient>' +
            '<linearGradient id="arcFade" gradientUnits="userSpaceOnUse" x1="0" y1="152" x2="0" y2="170"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient>' +
            '<mask id="arcAbove" maskUnits="userSpaceOnUse" x="-40" y="-14" width="392" height="186"><rect x="-40" y="-14" width="392" height="170" fill="#fff"/><rect x="-40" y="152" width="392" height="20" fill="url(#arcFade)"/></mask>' +
            '<filter id="arcBlur" filterUnits="userSpaceOnUse" x="-40" y="-14" width="392" height="186"><feGaussianBlur stdDeviation="4"/></filter>' +
            '</defs>' +
            `<g mask="url(#arcAbove)"><circle cx="${p0[0].toFixed(1)}" cy="${ARC.hy}" r="38" fill="url(#arcEnd)"/>` +
            `<circle cx="${p1[0].toFixed(1)}" cy="${ARC.hy}" r="38" fill="url(#arcEnd)"/></g>` +
            `<line class="arc-horizon" x1="0" y1="${ARC.hy}" x2="312" y2="${ARC.hy}"/>` +
            `<path class="arc-base" d="${arcPath(0, 1)}"/>` +
            `<g mask="url(#arcAbove)"><g filter="url(#arcBlur)"><path class="arc-glow" d="${am}"/><path class="arc-glow" d="${pm}"/></g></g>` +
            `<path class="arc-gold arc-gold-am" d="${am}"/><path class="arc-gold arc-gold-pm" d="${pm}"/>` +
            '<g id="arcNow" style="display:none"><circle class="arc-now-halo" r="18"/><circle class="arc-now-dot" r="6.5"/></g>' +
            '<g id="arcPv" style="display:none"><circle class="arc-now-halo" r="18"/><circle class="arc-pv-dot" r="7"/></g>';
        arcNow = arcEl.querySelector('#arcNow');
        arcPv = arcEl.querySelector('#arcPv');
        placePreviewDot();
        arcEl.setAttribute('aria-label',
            `Sun path. Sunrise ${refs.sunriseTime.textContent}, morning golden hour ${sunInfo.amFrom} to ${sunInfo.amTo}, ` +
            `evening golden hour ${sunInfo.pmFrom} to ${sunInfo.pmTo}, sunset ${refs.sunsetTime.textContent}.`);
    }
    function placePreviewDot() {
        if (!arcPv) return;
        const t = preview ? previewTime() : null;
        if (t === null || !sunInfo || sunInfo.state !== 'normal') { arcPv.style.display = 'none'; return; }
        const sr = sunInfo.sunrise.getTime(), ss = sunInfo.sunset.getTime();
        const p = arcPt(Math.min(1, Math.max(0, (t - sr) / (ss - sr))));
        arcPv.setAttribute('transform', `translate(${p[0].toFixed(1)} ${p[1].toFixed(1)})`);
        arcPv.style.display = '';
    }
    function placeNowDot(f) {
        if (!arcNow) return;
        if (f === null || f === undefined) { arcNow.style.display = 'none'; return; }
        const p = arcPt(Math.min(1, Math.max(0, f)));
        arcNow.setAttribute('transform', `translate(${p[0].toFixed(1)} ${p[1].toFixed(1)})`);
        arcNow.dataset.f = f.toFixed(4);
        arcNow.style.display = '';
    }

    const mapEl = el('map');
    const arrowsEl = el('sunArrows');
    const SVG_NS = 'http://www.w3.org/2000/svg';
    let arrowTimes = { rise: null, set: null };

    const raysEl = svgEl('svg', { class: 'sun-rays', 'aria-hidden': 'true', focusable: 'false' });
    arrowsEl.after(raysEl);
    let rayAngles = { rise: null, set: null };
    let rayBearings = { rise: null, set: null };
    let rayKind = null;
    let pinKind = null;
    let raySource = null;

    function rayTransform(size, angle) {
        return `translate(${size.x / 2} ${size.y / 2}) rotate(${angle.toFixed(2)})`;
    }
    function buildRays(size) {
        raysEl.textContent = '';
        raysEl.setAttribute('viewBox', `0 0 ${size.x} ${size.y}`);
        const len = Math.ceil(Math.hypot(size.x, size.y) / 2) + 24;
        const defs = svgEl('defs');
        [['sunRayLight', '#fff', 0.9, 0.1], ['sunRayDark', '#000', 0.3, 0]].forEach(g => {
            const grad = svgEl('linearGradient', { id: g[0], gradientUnits: 'userSpaceOnUse', x1: 0, y1: 0, x2: len, y2: 0 });
            grad.appendChild(svgEl('stop', { offset: 0, 'stop-color': g[1], 'stop-opacity': g[2] }));
            grad.appendChild(svgEl('stop', { offset: 1, 'stop-color': g[1], 'stop-opacity': g[3] }));
            defs.appendChild(grad);
        });
        raysEl.appendChild(defs);
        ['set', 'rise'].forEach(kind => {
            if (rayAngles[kind] === null) return;
            const holder = svgEl('g', { class: 'sun-ray sun-ray--' + kind, transform: rayTransform(size, rayAngles[kind]) });
            const grow = svgEl('g', { class: 'sun-ray-grow' });
            grow.appendChild(svgEl('rect', { x: 13, y: -2.5, width: len, height: 5, rx: 2.5, fill: 'url(#sunRayDark)' }));
            grow.appendChild(svgEl('rect', { x: 13, y: -1, width: len, height: 2, rx: 1, fill: 'url(#sunRayLight)' }));
            holder.appendChild(grow);
            raysEl.appendChild(holder);
        });
    }
    function updateRayAngle() {
        const kind = rayKind || pinKind;
        if (!kind || rayBearings[kind] === null) return;
        const node = raysEl.querySelector('.sun-ray--' + kind);
        if (!node) return;
        rayAngles[kind] = screenAngle(map.getCenter(), rayBearings[kind]);
        node.setAttribute('transform', rayTransform(map.getSize(), rayAngles[kind]));
    }
    function showRay() {
        raysEl.setAttribute('data-on', rayKind || pinKind || '');
        updateRayAngle();
    }
    function setRay(kind, source) {
        rayKind = kind;
        raySource = kind ? (source || null) : null;
        showRay();
    }
    function togglePin(kind) {
        pinKind = (pinKind === kind) ? null : kind;
        [['rise', el('miniAm')], ['set', el('miniPm')]].forEach(p => p[1] && p[1].setAttribute('aria-pressed', String(pinKind === p[0])));
        showRay();
        setGoldenPreview(pinKind);
    }
    function bindPin(node, kind) {
        if (!node) return;
        node.setAttribute('role', 'button');
        node.setAttribute('tabindex', '0');
        node.setAttribute('aria-pressed', 'false');
        let down = null;
        const active = () => pinKind === kind && !!preview;
        node.addEventListener('pointerdown', e => {
            if (e.button) return;
            down = { id: e.pointerId, x: e.clientX, y: e.clientY, drag: false, play: !!e.target.closest('.mini-ic') };
        });
        node.addEventListener('pointermove', e => {
            if (!down || e.pointerId !== down.id) return;
            if (!down.drag) {
                if (!active() || Math.abs(e.clientX - down.x) < 6) return;
                down.drag = true;
                node.setPointerCapture?.(e.pointerId);
            }
            const r = node.getBoundingClientRect();
            previewSeek((e.clientX - r.left) / r.width);
        });
        node.addEventListener('pointerup', e => {
            if (!down || e.pointerId !== down.id) return;
            const d = down;
            down = null;
            if (d.drag || Math.hypot(e.clientX - d.x, e.clientY - d.y) >= 6) return;
            if (d.play && active()) previewPlay(); else togglePin(kind);
            if (e.pointerType === 'touch' && rayKind === kind) setRay(null);
        });
        node.addEventListener('pointercancel', () => { down = null; });
        node.addEventListener('click', e => {
            if (e.detail !== 0) return;
            if (active() && e.target.closest('.mini-ic')) previewPlay(); else togglePin(kind);
        });
        node.addEventListener('keydown', e => {
            if (active() && preview.kind === kind) {
                const step = (e.shiftKey ? 5 : 1) / 60;
                const to = { ArrowLeft: preview.f - step, ArrowDown: preview.f - step, ArrowRight: preview.f + step, ArrowUp: preview.f + step, Home: 0, End: 1 }[e.key];
                if (to !== undefined) { e.preventDefault(); previewSeek(to); return; }
            }
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                if (active() && e.target.closest('.mini-ic')) previewPlay(); else togglePin(kind);
            }
        });
    }

    function bindRay(node, kind) {
        if (!node) return;
        node.addEventListener('pointerenter', e => { if (e.pointerType !== 'touch') setRay(kind); });
        node.addEventListener('pointerleave', e => { if (e.pointerType !== 'touch' && rayKind === kind) setRay(null); });
        node.addEventListener('focusin', () => { if (node.matches(':focus-visible')) setRay(kind); });
        node.addEventListener('focusout', () => { if (rayKind === kind) setRay(null); });
        node.addEventListener('touchstart', () => setRay(kind), { passive: true });
        ['touchend', 'touchcancel'].forEach(t => node.addEventListener(t, () => { if (rayKind === kind) setRay(null); }, { passive: true }));
    }
    bindRay(el('miniAm'), 'rise');
    bindRay(el('miniPm'), 'set');
    bindPin(el('miniAm'), 'rise');
    bindPin(el('miniPm'), 'set');
    map.on('click', () => { if (preview && pinKind) togglePin(pinKind); });
    bindRay(document.querySelector('.arc-end-l'), 'rise');
    bindRay(document.querySelector('.arc-end-r'), 'set');
    const chevronHit = e => (e.target && e.target.closest) ? e.target.closest('.sun-chevron-hit') : null;
    arrowsEl.addEventListener('pointerover', e => { const h = chevronHit(e); if (h && e.pointerType !== 'touch') setRay(h.dataset.kind, 'chevron'); });
    arrowsEl.addEventListener('pointerout', e => { const h = chevronHit(e); if (h && e.pointerType !== 'touch' && rayKind === h.dataset.kind) setRay(null); });
    arrowsEl.addEventListener('touchstart', e => { const h = chevronHit(e); if (h) setRay(h.dataset.kind, 'chevron'); }, { passive: true });
    ['touchend', 'touchcancel'].forEach(t => arrowsEl.addEventListener(t, () => { if (raySource === 'chevron') setRay(null); }, { passive: true }));

    let lastPointerType = '';
    document.addEventListener('pointerdown', e => { lastPointerType = e.pointerType; }, true);
    document.addEventListener('contextmenu', e => {
        const t = e.target;
        if (!t || !t.closest || t.closest('input, textarea, [contenteditable]')) return;
        const touch = e.pointerType ? e.pointerType === 'touch' : lastPointerType === 'touch';
        if (touch && t.closest('#map, .sun-arrows, .sun-rays, #dock, #tools')) e.preventDefault();
    });

    function geoDestination(lat, lng, bearingDeg, distanceKm) {
        const R = 6378.1;
        const brng = bearingDeg * (Math.PI / 180);
        const lat1 = lat * (Math.PI / 180);
        const lng1 = lng * (Math.PI / 180);
        const d = distanceKm / R;
        const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brng));
        const lng2 = lng1 + Math.atan2(Math.sin(brng) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
        return L.latLng(lat2 * (180 / Math.PI), lng2 * (180 / Math.PI));
    }

    function screenAngle(center, bearing) {
        const end = geoDestination(center.lat, center.lng, bearing, 1);
        const p0 = map.project(center);
        const p1 = map.project(end);
        return Math.atan2(p1.y - p0.y, p1.x - p0.x) * (180 / Math.PI);
    }

    function svgEl(name, attrs) {
        const node = document.createElementNS(SVG_NS, name);
        Object.keys(attrs || {}).forEach(k => node.setAttribute(k, attrs[k]));
        return node;
    }

    function buildChevron(kind, angle, bearing, tip) {
        const half = 55 * Math.PI / 180;
        const back = tip - 9.5 * Math.cos(half);
        const side = 9.5 * Math.sin(half);
        const d = `M${back.toFixed(2)} ${(-side).toFixed(2)}L${tip} 0L${back.toFixed(2)} ${side.toFixed(2)}`;
        const g = svgEl('g', { class: 'sun-chevron sun-chevron--' + kind, transform: `rotate(${angle.toFixed(2)})` });
        g.dataset.bearing = bearing.toFixed(1);
        g.dataset.angle = angle.toFixed(1);
        g.appendChild(svgEl('path', { class: 'sun-chevron-ink', d }));
        const hit = svgEl('circle', { class: 'sun-chevron-hit', cx: tip - 3, cy: 0, r: 18 });
        hit.dataset.kind = kind;
        g.appendChild(hit);
        return g;
    }

    function renderSunArrows(center) {
        arrowsEl.textContent = '';
        rayAngles = { rise: null, set: null };
        rayBearings = { rise: null, set: null };
        const size = map.getSize();
        arrowsEl.setAttribute('viewBox', `0 0 ${size.x} ${size.y}`);
        const defs = svgEl('defs');
        const shadow = svgEl('filter', { id: 'sunArrowShadow', x: '-100%', y: '-100%', width: '300%', height: '300%' });
        shadow.appendChild(svgEl('feDropShadow', { dx: 0, dy: 1, stdDeviation: 1.5, 'flood-color': '#000', 'flood-opacity': 0.45 }));
        defs.appendChild(shadow);
        arrowsEl.appendChild(defs);
        const tip = Math.max(91, Math.min(200, Math.min(size.x, size.y) * 0.17));
        ['set', 'rise'].forEach(kind => {
            const time = arrowTimes[kind];
            if (!time) return;
            const bearing = bearingAt(time, center.lat, center.lng);
            const angle = screenAngle(center, bearing);
            rayAngles[kind] = angle;
            rayBearings[kind] = bearing;
            const holder = svgEl('g', { transform: `translate(${size.x / 2} ${size.y / 2})`, filter: 'url(#sunArrowShadow)' });
            holder.appendChild(buildChevron(kind, angle, bearing, tip));
            arrowsEl.appendChild(holder);
        });
        buildRays(size);
        previewRay();
        if (raySource === 'chevron' && !arrowsEl.querySelector('.sun-chevron-hit:hover')) setRay(null);
    }
    function drawSunArrows(center) {
        const { times } = getSunTimes(center.lat, center.lng);
        const valid = t => (t && !isNaN(new Date(t).getTime())) ? new Date(t) : null;
        arrowTimes = { rise: valid(times.sunrise), set: valid(times.sunset) };
        renderSunArrows(center);
    }

    map.on('resize', () => renderSunArrows(map.getCenter()));

    function sunArrowsFade() {
        mapEl.classList.add('is-moving');
        setTimeout(() => mapEl.classList.remove('is-moving'), 200);
    }
    function changeSunArrows(fn) {
        mapEl.classList.add('is-moving');
        fn();
        setTimeout(() => mapEl.classList.remove('is-moving'), 90);
    }

    map.on('movestart', () => mapEl.classList.add('is-moving'));
    map.on('moveend', () => {
        refresh();
        setTimeout(() => mapEl.classList.remove('is-moving'), 90);
    });

    const zoomInBtn = el('zoomIn');
    const zoomOutBtn = el('zoomOut');
    zoomInBtn.addEventListener('click', () => { if (globeOn) { if (gl) gl.zoomIn(); } else map.zoomIn(); });
    zoomOutBtn.addEventListener('click', () => { if (globeOn) { if (gl) gl.zoomOut(); } else map.zoomOut(); });
    function updateZoomButtons() {
        if (globeOn) {
            zoomInBtn.disabled = false;
            zoomOutBtn.disabled = !!gl && gl.getZoom() <= gl.getMinZoom() + 0.01;
            return;
        }
        zoomInBtn.disabled = map.getZoom() >= map.getMaxZoom();
        zoomOutBtn.disabled = map.getZoom() <= map.getMinZoom();
    }
    map.on('zoomend', updateZoomButtons);
    updateZoomButtons();

    const tools = el('tools');
    const toolsBtn = el('toolsBtn');
    const toolsMenu = el('toolsMenu');
    const menuIsOpen = () => !toolsMenu.hidden;
    const menuItems = () => Array.from(toolsMenu.querySelectorAll('[role="menuitem"]')).filter(b => !b.disabled && b.offsetParent !== null);
    function closeToolsMenu(returnFocus) {
        if (!menuIsOpen()) return;
        toolsMenu.hidden = true;
        toolsBtn.setAttribute('aria-expanded', 'false');
        if (returnFocus) toolsBtn.focus({ preventScroll: true });
    }
    function openToolsMenu(focus) {
        if (!menuIsOpen()) {
            closeCal(false);
            if (!privacyPanel.hidden) setPrivacyPanel(false, false);
            if (!faqPanel.hidden) setFaqPanel(false, false);
            toolsMenu.hidden = false;
            toolsBtn.setAttribute('aria-expanded', 'true');
        }
        const items = menuItems();
        if (focus && items.length) items[focus === 'last' ? items.length - 1 : 0].focus({ preventScroll: true });
    }
    toolsBtn.addEventListener('click', e => {
        if (menuIsOpen()) closeToolsMenu(false);
        else openToolsMenu(e.detail === 0 ? 'first' : null);
    });
    toolsBtn.addEventListener('keydown', e => {
        if (e.key === 'ArrowDown') { e.preventDefault(); openToolsMenu('first'); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); openToolsMenu('last'); }
    });
    toolsMenu.addEventListener('keydown', e => {
        const items = menuItems();
        const i = items.indexOf(document.activeElement);
        if (e.key === 'ArrowDown') { e.preventDefault(); (items[i + 1] || items[0]).focus(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); (items[i - 1] || items[items.length - 1]).focus(); }
        else if (e.key === 'Home') { e.preventDefault(); items[0].focus(); }
        else if (e.key === 'End') { e.preventDefault(); items[items.length - 1].focus(); }
        else if (e.key === 'Tab') closeToolsMenu(false);
    });
    toolsMenu.addEventListener('click', e => {
        const item = e.target.closest('.menu-item');
        if (item && !item.dataset.keep) closeToolsMenu(false);
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && menuIsOpen() && !calOpen) { e.preventDefault(); closeToolsMenu(true); } });
    document.addEventListener('pointerdown', e => { if (menuIsOpen() && !tools.contains(e.target)) closeToolsMenu(false); });
    map.on('dragstart', () => closeToolsMenu(false));
    el('menuLocate').addEventListener('click', () => locateBtn.click());

    const expandBtn = el('expandBtn');
    function setDockExpanded(open) {
        dock.dataset.expanded = String(open);
        expandBtn.setAttribute('aria-expanded', String(open));
        const label = open ? 'Hide the sun path' : 'Show the sun path';
        expandBtn.setAttribute('aria-label', label);
        expandBtn.title = label;
    }
    expandBtn.addEventListener('click', () => setDockExpanded(dock.dataset.expanded !== 'true'));
    setDockExpanded(false);

    const attrib = el('attribution');
    const attribToggle = el('attribToggle');
    const attribPop = el('attribPop');
    const attribClose = el('attribClose');
    function setAttribOpen(open, returnFocus) {
        attribPop.hidden = !open;
        attribToggle.setAttribute('aria-expanded', String(open));
        if (open) attribClose.focus({ preventScroll: true });
        else if (returnFocus) attribToggle.focus({ preventScroll: true });
    }
    const attribIsOpen = () => !attribPop.hidden;
    attribToggle.addEventListener('click', () => setAttribOpen(!attribIsOpen(), true));
    attribClose.addEventListener('click', () => setAttribOpen(false, true));
    document.addEventListener('pointerdown', e => { if (attribIsOpen() && !attrib.contains(e.target)) setAttribOpen(false, false); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && attribIsOpen()) { e.preventDefault(); setAttribOpen(false, true); } });
    attrib.addEventListener('focusout', e => { if (attribIsOpen() && e.relatedTarget && !attrib.contains(e.relatedTarget)) setAttribOpen(false, false); });
    map.on('movestart', () => { if (attribIsOpen()) setAttribOpen(false, false); });

    let searchSeq = 0;
    const osmGeocoder = new L.Control.OSMGeocoder({
        collapsed: false,
        position: 'topleft',
        text: 'Search',
        placeholder: 'Search a place or coordinates',
        bounds: null,
        callback: onSearchResults,
        onError: () => { searchSeq++; showSearchStatus('Search is unavailable right now. Check your connection and try again.'); }
    });
    map.addControl(osmGeocoder);

    const searchBox = osmGeocoder.getContainer();
    const searchInput = osmGeocoder._input;
    const searchForm = osmGeocoder._form;
    searchBox.classList.add('glass', 'search');
    searchInput.type = 'search';
    searchInput.setAttribute('aria-label', 'Search a place or coordinates');
    searchInput.setAttribute('autocomplete', 'off');
    searchInput.setAttribute('autocapitalize', 'off');
    searchInput.setAttribute('enterkeyhint', 'search');
    searchInput.spellcheck = false;
    searchInput.id = 'searchInput';
    searchForm.setAttribute('role', 'search');
    const searchSubmit = searchForm.querySelector('input[type=submit]');
    searchSubmit.setAttribute('aria-label', 'Search');
    searchSubmit.title = 'Search';
    searchSubmit.tabIndex = -1;
    searchSubmit.setAttribute('aria-hidden', 'true');
    searchForm.id = 'searchForm';

    const searchToggle = document.createElement('button');
    searchToggle.type = 'button';
    searchToggle.id = 'searchToggle';
    searchToggle.className = 'search-toggle';
    searchToggle.setAttribute('aria-label', 'Search');
    searchToggle.title = 'Search';
    searchToggle.setAttribute('aria-expanded', 'false');
    searchToggle.setAttribute('aria-controls', 'searchForm');
    searchToggle.innerHTML = '<svg class="ic" aria-hidden="true"><use href="#i-search"></use></svg>';
    searchBox.insertBefore(searchToggle, searchBox.firstChild);

    const isSearchOpen = () => searchBox.classList.contains('is-open');
    function openSearch() {
        if (!isSearchOpen()) {
            searchBox.classList.add('is-open');
            appRoot.classList.add('is-searching');
            searchToggle.setAttribute('aria-expanded', 'true');
        }
        searchInput.focus({ preventScroll: true });
    }
    function collapseSearch(returnFocus, clear) {
        if (!isSearchOpen()) return;
        const ae = document.activeElement;
        const hadFocus = searchBox.contains(ae) || !ae || ae === document.body;
        closeResults();
        if (clear) searchInput.value = '';
        searchBox.classList.remove('is-open');
        appRoot.classList.remove('is-searching');
        searchToggle.setAttribute('aria-expanded', 'false');
        if (hadFocus) {
            if (returnFocus) searchToggle.focus({ preventScroll: true });
            else if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
        }
    }
    searchToggle.addEventListener('click', () => {
        if (!isSearchOpen()) { openSearch(); return; }
        if (searchInput.value.trim()) searchForm.requestSubmit ? searchForm.requestSubmit() : searchSubmit.click();
        else collapseSearch(true);
    });
    document.addEventListener('keydown', e => {
        if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
        const t = e.target;
        if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
        if (!welcome.hidden || calOpen) return;
        e.preventDefault();
        openSearch();
    });
    let searchPressing = false;
    searchBox.addEventListener('pointerdown', () => { searchPressing = true; setTimeout(() => { searchPressing = false; }, 400); });
    searchBox.addEventListener('focusout', () => {
        setTimeout(() => {
            if (!isSearchOpen() || searchPressing || searchBox.contains(document.activeElement)) return;
            if (!searchInput.value.trim()) collapseSearch(false);
        }, 0);
    });
    map.on('click', () => { if (isSearchOpen() && !searchInput.value.trim()) collapseSearch(false); });

    const resultsBox = document.createElement('div');
    resultsBox.className = 'search-results';
    resultsBox.id = 'searchResults';
    resultsBox.hidden = true;
    resultsBox.setAttribute('aria-live', 'polite');
    searchBox.appendChild(resultsBox);

    searchForm.addEventListener('submit', () => {
        if (!searchInput.value.trim()) { closeResults(); return; }
        const seq = ++searchSeq;
        showSearchStatus('Searching\u2026', true);
        setTimeout(() => {
            if (seq === searchSeq && resultsBox.dataset.busy === '1') showSearchStatus('No answer from the search service. Please try again.');
        }, 9000);
    }, true);

    function closeResults() {
        searchSeq++;
        resultsBox.hidden = true;
        resultsBox.textContent = '';
        resultsBox.dataset.busy = '0';
        searchBox.classList.remove('has-results');
    }

    function showSearchStatus(text, busy) {
        resultsBox.textContent = '';
        const p = document.createElement('p');
        p.className = 'search-status';
        p.textContent = text;
        resultsBox.appendChild(p);
        resultsBox.dataset.busy = busy ? '1' : '0';
        resultsBox.hidden = false;
        searchBox.classList.add('has-results');
    }

    function pickResult(result, label) {
        const [firstLat, secondLat, firstLng, secondLng] = result.boundingbox.map(Number);
        const bounds = new L.LatLngBounds([firstLat, firstLng], [secondLat, secondLng]);
        map.fitBounds(bounds);
        if (label) searchInput.value = label;
        collapseSearch(true);
    }

    function onSearchResults(results) {
        searchSeq++;
        if (!results || !results.length) {
            showSearchStatus('No places found. Try another name, or coordinates like 51.5, -0.12');
            return;
        }
        if (results.length === 1 && /^Position:/.test(results[0].display_name || '')) {
            pickResult(results[0], `${results[0].lat}, ${results[0].lon}`);
            return;
        }
        resultsBox.textContent = '';
        resultsBox.dataset.busy = '0';
        const list = document.createElement('ul');
        list.className = 'result-list';
        const seen = new Set();
        results.filter(r => {
            const key = String(r.display_name || '');
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        }).slice(0, 5).forEach(result => {
            const parts = String(result.display_name || '').split(', ');
            const title = parts[0] || 'Result';
            const detail = parts.slice(1, 4).join(', ');
            const li = document.createElement('li');
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'result';
            btn.innerHTML = '<svg class="ic ic-sm" aria-hidden="true"><use href="#i-pin"></use></svg><span class="result-text"><span class="result-title"></span><span class="result-detail"></span></span>';
            btn.querySelector('.result-title').textContent = title;
            btn.querySelector('.result-detail').textContent = detail;
            btn.addEventListener('click', () => pickResult(result, title));
            li.appendChild(btn);
            list.appendChild(li);
        });
        resultsBox.appendChild(list);
        resultsBox.hidden = false;
        searchBox.classList.add('has-results');
    }

    searchBox.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            if (!resultsBox.hidden) { closeResults(); searchInput.focus(); }
            else collapseSearch(true, true);
            return;
        }
        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
        const items = Array.from(resultsBox.querySelectorAll('.result'));
        if (!items.length) return;
        e.preventDefault();
        const idx = items.indexOf(document.activeElement);
        if (e.key === 'ArrowDown') (items[idx + 1] || items[0]).focus();
        else if (idx <= 0) searchInput.focus();
        else items[idx - 1].focus();
    });
    searchInput.addEventListener('focus', () => searchInput.select());
    searchInput.addEventListener('input', () => { if (!searchInput.value) closeResults(); });
    document.addEventListener('pointerdown', e => {
        if (!resultsBox.hidden && !searchBox.contains(e.target)) closeResults();
    });
    map.on('movestart', () => { if (document.activeElement !== searchInput) closeResults(); });

    const locateBtn = el('locateBtn');
    const geo = L.geolet({
        position: 'bottomleft',
        className: 'locDot',
        minZoom: LOCATE_ZOOM,
        marker() {
            return L.marker(null, {
                icon: L.divIcon({
                    html: '<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" focusable="false"><circle cx="6.6" cy="7.2" r="1.1" fill="#1a1a1a"/><circle cx="11.4" cy="7.2" r="1.1" fill="#1a1a1a"/><path d="M5.8 10.8Q9 13.8 12.2 10.8" fill="none" stroke="#1a1a1a" stroke-width="1.4" stroke-linecap="round"/></svg>',
                    iconSize: [18, 18],
                    iconAnchor: [9, 9],
                    className: 'loc-me'
                }),
                attribution: '<a href="https://github.com/rhlt/leaflet-geolet" target="_blank">Geolet</a>',
                zIndexOffset: 1000
            });
        },
        popupContent(latlng) {
            return `Your location: ${latlng.lat}, ${latlng.lng}`;
        }
    }).addTo(map);
    geo.getContainer().style.display = 'none';

    if (!L.Geolet.browserSupport) {
        locateBtn.hidden = true;
        el('menuLocate').hidden = true;
    }
    locateBtn.addEventListener('click', () => {
        if (geo.isActive()) geo.deactivate(); else geo.activate();
        syncLocate();
    });
    function syncLocate() {
        const active = geo.isActive();
        locateBtn.classList.toggle('is-active', active);
        locateBtn.setAttribute('aria-pressed', String(active));
        const label = active ? 'Stop showing my location' : 'Show my location';
        locateBtn.setAttribute('aria-label', label);
        locateBtn.title = label;
        setText(el('menuLocateText'), label);
    }
    map.on('geolet_success', syncLocate);
    map.on('geolet_error', () => {
        syncLocate();
        showToast('Couldn\u2019t find your location. Check location permission.');
    });

    const supportPrompt = el('supportPrompt');
    const DAY_MS = 86400000;
    const SUPPORT_FORCED = params.get('support') === '1';
    const dNow = new Date();
    const dayKey = dNow.getFullYear() + '-' + (dNow.getMonth() + 1) + '-' + dNow.getDate();
    let sState = null;
    try {
        const stored = JSON.parse(localStorage.getItem('ghm-support') || '{}') || {};
        sState = { days: Array.isArray(stored.days) ? stored.days.slice(-8) : [], sessions: Number(stored.sessions) || 0, until: Number(stored.until) || 0 };
        if (sState.days.indexOf(dayKey) < 0) sState.days.push(dayKey);
        sState.days = sState.days.slice(-8);
        sState.sessions = Math.min(sState.sessions + 1, 999);
        localStorage.setItem('ghm-support', JSON.stringify(sState));
    } catch (e) { sState = null; }
    function sSnooze(days) {
        if (!sState || SUPPORT_FORCED) return;
        sState.until = Math.max(sState.until, Date.now() + days * DAY_MS);
        try { localStorage.setItem('ghm-support', JSON.stringify(sState)); } catch (e) { sState = null; }
    }

    let sStarted = false;
    let sActions = 0;
    let sShown = false;
    let sTimer = null;
    let sTries = 0;
    let sWatch = null;

    function supportEligible() {
        if (SUPPORT_FORCED) return true;
        if (!sState || Date.now() < sState.until) return false;
        if (sState.days.length >= SUPPORT.MIN_VISIT_DAYS) return true;
        return sState.sessions >= 2 && sActions >= SUPPORT.MIN_ACTIONS;
    }
    function supportOverlayOpen() {
        return tourOpen || !welcome.hidden || calOpen || menuIsOpen() || attribIsOpen() || !privacyPanel.hidden || !faqPanel.hidden || appRoot.classList.contains('is-searching');
    }
    function supportCollides() {
        const r = supportPrompt.getBoundingClientRect();
        const hit = (b, pad) => b && b.width > 0 && b.height > 0 && !(b.right + pad <= r.left || b.left - pad >= r.right || b.bottom + pad <= r.top || b.top - pad >= r.bottom);
        const cx = window.innerWidth / 2, cy = window.innerHeight / 2;
        if (hit({ left: cx, right: cx, top: cy, bottom: cy, width: 1, height: 1 }, 28)) return true;
        return ['dock', 'searchToggle', 'toolsBtn', 'locateBtn', 'shareFab', 'attribToggle'].some(id => hit(el(id).getBoundingClientRect(), 4));
    }
    function supportSchedule() {
        if (sShown || sTimer || !sStarted || !supportEligible()) return;
        sTimer = setTimeout(supportTry, SUPPORT.DELAY_MS);
    }
    function supportRetry() { if (++sTries < 12) sTimer = setTimeout(supportTry, 5000); }
    function supportTry() {
        sTimer = null;
        if (sShown) return;
        if (supportOverlayOpen()) { supportRetry(); return; }
        supportPrompt.hidden = false;
        supportPrompt.style.transform = 'none';
        const clash = supportCollides();
        supportPrompt.style.transform = '';
        if (clash) { supportPrompt.hidden = true; supportRetry(); return; }
        sShown = true;
        sSnooze(SUPPORT.COOLDOWN_SHOWN_DAYS);
        requestAnimationFrame(() => supportPrompt.classList.add('show'));
        sWatch = setInterval(() => {
            const away = supportOverlayOpen();
            supportPrompt.classList.toggle('is-away', away);
            if (away) supportPrompt.setAttribute('inert', ''); else supportPrompt.removeAttribute('inert');
        }, 300);
    }
    function supportHide(snoozeDays, returnFocus) {
        clearInterval(sWatch);
        clearTimeout(sTimer);
        sShown = true;
        const hadFocus = supportPrompt.contains(document.activeElement);
        supportPrompt.classList.remove('show');
        setTimeout(() => { supportPrompt.hidden = true; }, reducedMotion() ? 0 : 350);
        if (snoozeDays) sSnooze(snoozeDays);
        if (hadFocus || returnFocus) toolsBtn.focus({ preventScroll: true });
    }
    function supportAction() {
        if (!sStarted || !welcome.hidden) return;
        sActions++;
        supportSchedule();
    }
    function supportWelcomeClosed() {
        sStarted = true;
        supportSchedule();
    }

    let sLastCenter = map.getCenter();
    map.on('moveend', () => {
        const c = map.getCenter();
        const moved = Math.abs(c.lat - sLastCenter.lat) + Math.abs(c.lng - sLastCenter.lng) > 0.0005;
        sLastCenter = c;
        if (moved) supportAction();
    });

    el('spLater').addEventListener('click', () => supportHide(SUPPORT.COOLDOWN_DISMISSED_DAYS, false));
    supportPrompt.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); supportHide(SUPPORT.COOLDOWN_DISMISSED_DAYS, true); } });
    el('spSupport').addEventListener('click', () => {
        supportHide(SUPPORT.COOLDOWN_DONATED_DAYS, false);
        showToast('Thank you for supporting Golden Hour Map');
    });
    const supportLink = el('supportBtn');
    supportLink.addEventListener('click', () => {
        if (!supportPrompt.hidden) supportHide(0, false);
        sSnooze(SUPPORT.COOLDOWN_DONATED_DAYS);
        showToast('Thank you for supporting Golden Hour Map');
    });
    supportLink.addEventListener('keydown', e => { if (e.key === ' ') { e.preventDefault(); supportLink.click(); } });
    const privacyPanel = el('privacyPanel');
    const faqPanel = el('faqPanel');
    function setPrivacyPanel(open, returnFocus) {
        if (open && !faqPanel.hidden) setFaqPanel(false, false);
        privacyPanel.hidden = !open;
        if (open) {
            refreshConsentUI();
            el('privacyClose').focus({ preventScroll: true });
        } else if (returnFocus) toolsBtn.focus({ preventScroll: true });
    }
    el('privacyBtn').addEventListener('click', () => setPrivacyPanel(true, false));
    el('privacyClose').addEventListener('click', () => setPrivacyPanel(false, true));
    el('prvAllow').addEventListener('click', () => {
        if (setConsent('granted')) showToast('Analytics on'); else showToast('Your browser blocks storage, so analytics stays off.');
    });
    el('prvDeny').addEventListener('click', () => { setConsent('denied'); showToast('Analytics off'); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !privacyPanel.hidden) { e.preventDefault(); setPrivacyPanel(false, true); } });
    document.addEventListener('pointerdown', e => { if (!privacyPanel.hidden && !privacyPanel.contains(e.target) && !toolsBtn.contains(e.target)) setPrivacyPanel(false, false); });
    map.on('dragstart', () => { if (!privacyPanel.hidden) setPrivacyPanel(false, false); });

    function setFaqPanel(open, returnFocus) {
        if (open && !privacyPanel.hidden) setPrivacyPanel(false, false);
        faqPanel.hidden = !open;
        if (open) {
            el('faqBody').scrollTop = 0;
            el('faqClose').focus({ preventScroll: true });
        } else if (returnFocus) toolsBtn.focus({ preventScroll: true });
    }
    el('faqBtn').addEventListener('click', () => setFaqPanel(true, false));
    el('faqClose').addEventListener('click', () => setFaqPanel(false, true));
    el('faqScrim').addEventListener('click', () => setFaqPanel(false, true));
    document.addEventListener('keydown', e => {
        if (faqPanel.hidden) return;
        if (e.key === 'Escape') { e.preventDefault(); setFaqPanel(false, true); }
        else if (e.key === 'Tab') {
            const stops = [el('faqClose'), el('faqBody')];
            const i = stops.indexOf(document.activeElement);
            e.preventDefault();
            stops[(i + (e.shiftKey ? stops.length - 1 : 1) + (i < 0 ? 1 : 0)) % stops.length].focus({ preventScroll: true });
        }
    });

    const SHARE_HINT = { IDLE_MS: 6000, SHOW_MS: 10000, MAX_SHOWS: 3, FADE_MS: 400 };
    const shareWrap = el('shareWrap');
    let shareHintOn = false, shareHintShown = 0, shareIdleSince = 0, shareHintAt = 0, shareHintKey = '', shareHintFade = null;
    const sharePosKey = () => { const c = map.getCenter(); return c.lat.toFixed(4) + ',' + c.lng.toFixed(4) + ',' + map.getZoom(); };
    function shareHintBlocked() {
        return document.hidden || tourOpen || tourQueued || !welcome.hidden || calOpen || menuIsOpen() || attribIsOpen() || !privacyPanel.hidden || !faqPanel.hidden
            || !supportPrompt.hidden || !consentBanner.hidden || appRoot.classList.contains('is-searching') || mapEl.classList.contains('is-moving');
    }
    function shareHintSeen() {
        try { return sessionStorage.getItem('ghm-share-hint') === '1'; } catch (e) { return false; }
    }
    function showShareHint() {
        clearTimeout(shareHintFade);
        try { sessionStorage.setItem('ghm-share-hint', '1'); } catch (e) { }
        shareHintOn = true;
        shareHintShown++;
        shareHintAt = Date.now();
        shareHintKey = sharePosKey();
        shareWrap.classList.remove('is-leaving');
        shareWrap.classList.add('is-hint');
    }
    function hideShareHint() {
        shareIdleSince = 0;
        if (!shareHintOn) return;
        shareHintOn = false;
        shareWrap.classList.remove('is-hint');
        shareWrap.classList.add('is-leaving');
        clearTimeout(shareHintFade);
        shareHintFade = setTimeout(() => shareWrap.classList.remove('is-leaving'), (reducedMotion() ? 200 : SHARE_HINT.FADE_MS) + 60);
    }
    setInterval(() => {
        if (shareHintOn) {
            if (shareHintBlocked() || Date.now() - shareHintAt >= SHARE_HINT.SHOW_MS) hideShareHint();
            return;
        }
        if (shareUsed || shareHintShown >= SHARE_HINT.MAX_SHOWS || shareHintSeen() || shareHintBlocked()) { shareIdleSince = 0; return; }
        if (!shareIdleSince) { shareIdleSince = Date.now(); return; }
        if (Date.now() - shareIdleSince > SHARE_HINT.IDLE_MS && sharePosKey() !== shareHintKey) showShareHint();
    }, 500);
    map.on('movestart zoomstart', hideShareHint);
    map.on('moveend zoomend', () => { shareIdleSince = 0; });
    document.addEventListener('pointerdown', e => {
        if (shareHintOn && e.target.closest && e.target.closest('button, a, input, select, textarea, [role="button"], .sun-chevron-hit, .leaflet-control')) hideShareHint();
    }, true);

    const GLOBE = {
        JS: 'https://unpkg.com/maplibre-gl@5.24.0/dist/maplibre-gl.js',
        CSS: 'https://unpkg.com/maplibre-gl@5.24.0/dist/maplibre-gl.css',
        TO_FLAT: 3,
        FLAT_MIN: 4,
        WARM: 2.4,
        ENTER_TO: 2,
        FADE_MS: 250,
        CAP_N: '#0f4f60', CAP_S: '#f5f8fe', CAP_LAT: 80,
        DROP_MS: 60000,
        NIGHT_COORDS: [[-180, MERC_MAX], [180, MERC_MAX], [180, -MERC_MAX], [-180, -MERC_MAX]]
    };
    const appEl = el('app'), globeEl = el('globe');
    let glLoading = null, glDropTimer = null, glEntering = false, glSyncing = false, glQuietUntil = 0, glNightUrl = '', glZoom = 2;

    const globeFitZoom = lat => Math.max(0.2, Math.min(2.2, 1.9 + Math.log2(Math.min(window.innerWidth * 0.84, window.innerHeight * 0.75) * Math.cos(lat * Math.PI / 180) / 469)));
    const globeUrlZoom = () => (Math.min(GLOBE.TO_FLAT, gl ? gl.getZoom() : glZoom) + 1).toFixed(1);

    function loadGlobeLib() {
        if (window.maplibregl) return Promise.resolve();
        if (!glLoading) {
            const css = document.createElement('link');
            css.rel = 'stylesheet'; css.href = GLOBE.CSS;
            document.head.appendChild(css);
            glLoading = new Promise((ok, fail) => {
                const s = document.createElement('script');
                s.src = GLOBE.JS; s.async = true; s.onload = ok; s.onerror = fail;
                document.head.appendChild(s);
            });
            glLoading.catch(() => { glLoading = null; });
        }
        return glLoading;
    }

    let poleProto = false;
    function addPoleProtocol() {
        if (poleProto) return;
        poleProto = true;
        maplibregl.addProtocol('ghmpole', async (params, abort) => {
            const url = params.url.slice(10).split('#')[0], r = await fetch(url + '?ghm=pole2', { mode: 'cors', signal: abort.signal });
            if (!r.ok) throw new Error('tile ' + r.status);
            const m = /\/(\d+)\/(\d+)\/\d+$/.exec(url), z = m ? +m[1] : -1, y = m ? +m[2] : -1, last = (1 << z) - 1;
            if (!m || (y !== 0 && y !== last)) return { data: await r.arrayBuffer() };
            const img = await createImageBitmap(await r.blob()), cv = document.createElement('canvas');
            const S = img.width === 256 ? 255 : img.width - 1, labels = /Reference/.test(url);
            cv.width = S; cv.height = S;
            const ctx = cv.getContext('2d'), H = S, band = Math.max(3, Math.round(H * 0.03));
            ctx.drawImage(img, 0, 0, S, S);
            const edge = (top, hex) => {
                if (labels) { ctx.clearRect(0, top ? 0 : H - band, S, band); return; }
                const g = ctx.createLinearGradient(0, top ? 0 : H, 0, top ? band : H - band);
                g.addColorStop(0, hex); g.addColorStop(0.3, hex); g.addColorStop(1, hex + '00');
                ctx.fillStyle = g; ctx.fillRect(0, top ? 0 : H - band, S, band);
            };
            if (y === 0) edge(true, capColour(true));
            if (y === last) edge(false, capColour(false));
            const blob = await new Promise(ok => cv.toBlob(ok, labels ? 'image/png' : 'image/jpeg', 0.9));
            return { data: await blob.arrayBuffer() };
        });
    }

    function makeGlobe(c, zoom) {
        addPoleProtocol();
        const touch = window.matchMedia('(pointer: coarse)').matches;
        gl = new maplibregl.Map({
            container: globeEl,
            style: {
                version: 8,
                projection: { type: 'vertical-perspective' },
                sky: { 'sky-color': '#5d9bd8', 'horizon-color': '#d9e8f2', 'fog-color': '#dfe9ee', 'atmosphere-blend': 1 },
                sources: {
                    imagery: { type: 'raster', tiles: ['ghmpole://' + IMAGERY_URL], tileSize: 256, maxzoom: 18 },
                    labels: { type: 'raster', tiles: ['ghmpole://' + LABELS_URL], tileSize: 256, maxzoom: 18 },
                    capN: { type: 'image', url: poleCap(GLOBE.CAP_N, true), coordinates: [[-180, MERC_MAX], [180, MERC_MAX], [180, GLOBE.CAP_LAT], [-180, GLOBE.CAP_LAT]] },
                    capS: { type: 'image', url: poleCap(GLOBE.CAP_S, false), coordinates: [[-180, -GLOBE.CAP_LAT], [180, -GLOBE.CAP_LAT], [180, -MERC_MAX], [-180, -MERC_MAX]] }
                },
                layers: [
                    { id: 'bg', type: 'background', paint: { 'background-color': GLOBE.CAP_N } },
                    { id: 'imagery', type: 'raster', source: 'imagery', paint: { 'raster-fade-duration': 100 } },
                    { id: 'capN', type: 'raster', source: 'capN', paint: { 'raster-fade-duration': 0 } },
                    { id: 'capS', type: 'raster', source: 'capS', paint: { 'raster-fade-duration': 0 } },
                    { id: 'labels', type: 'raster', source: 'labels', paint: { 'raster-fade-duration': 100 } }
                ]
            },
            center: [c.lng, c.lat], zoom,
            minZoom: 0, maxZoom: GLOBE.TO_FLAT + 1, maxPitch: 0,
            dragRotate: false, pitchWithRotate: false, touchPitch: false, keyboard: false, attributionControl: false,
            pixelRatio: Math.min(window.devicePixelRatio || 1, touch ? 1.5 : 2),
            fadeDuration: 100, maxTileCacheZoomLevels: 3, refreshExpiredTiles: false, validateStyle: false
        });
        gl.touchZoomRotate.disableRotation();
        gl.once('style.load', () => { if (!gl.isMoving()) gl.jumpTo({ center: [c.lng, c.lat], zoom }); });
        gl.on('load', () => { glNightUrl = ''; globeNight(); });
        gl.on('movestart', () => { if (globeOn) mapEl.classList.add('is-moving'); });
        gl.on('zoom', () => {
            if (!globeOn || glEntering) return;
            const z = gl.getZoom();
            if (z >= GLOBE.TO_FLAT) showFlat(true);
            else if (z >= GLOBE.WARM) warmFlat();
        });
        gl.on('moveend', () => {
            glEntering = false;
            if (!globeOn) return;
            followGlobe();
        });
        gl.on('click', e => {
            gl.easeTo({ center: e.lngLat, duration: reducedMotion() ? 0 : 600 });
            map.fire('click', { latlng: L.latLng(e.lngLat.lat, e.lngLat.lng) });
        });
    }

    function poleCap(hex, north) {
        const cv = document.createElement('canvas');
        cv.width = 2; cv.height = 64;
        const ctx = cv.getContext('2d'), g = ctx.createLinearGradient(0, north ? 0 : 64, 0, north ? 64 : 0);
        g.addColorStop(0, hex + 'ff'); g.addColorStop(0.15, hex + 'ff'); g.addColorStop(0.55, hex + '99'); g.addColorStop(1, hex + '00');
        ctx.fillStyle = g; ctx.fillRect(0, 0, 2, 64);
        return cv.toDataURL('image/png');
    }

    function setGlobeInput(on) {
        for (const k of ['scrollZoom', 'dragPan', 'touchZoomRotate', 'doubleClickZoom', 'boxZoom']) if (gl[k]) gl[k][on ? 'enable' : 'disable']();
        if (on) gl.touchZoomRotate.disableRotation();
    }

    let warmAt = 0;
    function warmFlat() {
        if (!map.hasLayer(imageryLayer)) { imageryLayer.addTo(map); labelsLayer.addTo(map); }
        if (Date.now() - warmAt > 150) { warmAt = Date.now(); followGlobe(); }
    }

    function followGlobe() {
        const c = gl.getCenter();
        glZoom = gl.getZoom();
        glSyncing = true;
        map.setView([c.lat, c.lng], GLOBE.FLAT_MIN, { animate: false });
        glSyncing = false;
        syncUrl(map.getCenter());
        updateZoomButtons();
    }

    let glNightCanvas = null, glNightBlob = '';
    function globeNight() {
        if (!gl || !gl.loaded()) return;
        if (nightUrl && nightUrl !== glNightUrl) {
            glNightUrl = nightUrl;
            const W = nightImg.width, H = nightImg.height, K = Math.round(H / 24), d = new Uint8ClampedArray(nightImg.data);
            for (const top of [true, false]) {
                const r0 = top ? 0 : H - 1;
                let pr = 0, pg = 0, pb = 0, pa = 0;
                for (let i = 0; i < W; i++) { const k = (r0 * W + i) * 4, a = d[k + 3]; pr += d[k] * a; pg += d[k + 1] * a; pb += d[k + 2] * a; pa += a; }
                const ma = pa / W, mr = pr / W, mg = pg / W, mb = pb / W;
                glPoleNight[top ? 0 : 1] = ma ? [mr / ma, mg / ma, mb / ma, ma / 255] : [0, 0, 0, 0];
                for (let j = 0; j < K; j++) {
                    const t = smoothStep(0, 1, 1 - j / K), row = top ? j : H - 1 - j;
                    for (let i = 0; i < W; i++) {
                        const k = (row * W + i) * 4, a = d[k + 3];
                        const na = a + (ma - a) * t;
                        if (na < 0.5) { d[k + 3] = 0; continue; }
                        d[k] = (d[k] * a + (mr - d[k] * a) * t) / na;
                        d[k + 1] = (d[k + 1] * a + (mg - d[k + 1] * a) * t) / na;
                        d[k + 2] = (d[k + 2] * a + (mb - d[k + 2] * a) * t) / na;
                        d[k + 3] = na;
                    }
                }
            }
            if (!glNightCanvas) { glNightCanvas = document.createElement('canvas'); glNightCanvas.width = W; glNightCanvas.height = H; }
            glNightCanvas.getContext('2d').putImageData(new ImageData(d, W, H), 0, 0);
            glNightCanvas.toBlob(blob => {
                if (!blob || !gl) return;
                const old = glNightBlob;
                glNightBlob = URL.createObjectURL(blob);
                const src = gl.getSource('night');
                if (src) src.updateImage({ url: glNightBlob, coordinates: GLOBE.NIGHT_COORDS });
                else {
                    gl.addSource('night', { type: 'image', url: glNightBlob, coordinates: GLOBE.NIGHT_COORDS });
                    gl.addLayer({ id: 'night', type: 'raster', source: 'night', paint: { 'raster-fade-duration': 0, 'raster-opacity': nightOn ? 1 : 0, 'raster-opacity-transition': { duration: 600 } } }, 'labels');
                }
                if (old) setTimeout(() => URL.revokeObjectURL(old), 5000);
            }, 'image/png');
        }
        if (gl.getLayer('night')) gl.setPaintProperty('night', 'raster-opacity', nightOn ? 1 : 0);
        const key = [capColour(true), capColour(false)].join();
        if (gl.getLayer('bg')) gl.setPaintProperty('bg', 'background-color', capColour(true));
        if (key !== glPoleKey && gl.getSource('imagery')) { glPoleKey = key; gl.getSource('imagery').setTiles(['ghmpole://' + IMAGERY_URL + '#' + (++glPoleRev)]); }
    }
    let glPoleNight = [[0, 0, 0, 0], [0, 0, 0, 0]], glPoleKey = [GLOBE.CAP_N, GLOBE.CAP_S].join(), glPoleRev = 0;
    function capColour(north) {
        const hex = north ? GLOBE.CAP_N : GLOBE.CAP_S, n = glPoleNight[north ? 0 : 1], a = nightOn ? n[3] : 0;
        return '#' + [1, 3, 5].map((p, i) => Math.round(parseInt(hex.substr(p, 2), 16) * (1 - a) + n[i] * a).toString(16).padStart(2, '0')).join('');
    }

    function showGlobe(c, zoom, ease) {
        if (globeOn || !webglOk) return;
        globeOn = true;
        clearTimeout(glDropTimer);
        if (!starsCv) drawStars();
        glQuietUntil = Date.now() + 800;
        glZoom = zoom;
        if (!ease) appEl.classList.add('globe-on');
        updateZoomButtons();
        loadGlobeLib().then(() => {
            if (!globeOn) return;
            glEntering = !!ease;
            if (!gl) makeGlobe(c, zoom);
            else { gl.resize(); setGlobeInput(true); gl.jumpTo({ center: [c.lng, c.lat], zoom }); }
            if (ease) {
                gl.easeTo({ ...ease, duration: reducedMotion() ? 0 : ease.duration });
                const reveal = () => {
                    if (!globeOn) return;
                    appEl.classList.add('globe-on');
                };
                gl.once('render', reveal);
                gl.triggerRepaint();
            }
            globeNight();
            updateZoomButtons();
        }).catch(() => showFlat(false));
        setTimeout(() => { if (globeOn && gl && gl.getZoom() < GLOBE.WARM) { map.removeLayer(imageryLayer); map.removeLayer(labelsLayer); } }, GLOBE.FADE_MS + 400);
    }

    let starsCv = null, starsTimer = null;
    function drawStars() {
        if (!starsCv) {
            starsCv = document.createElement('canvas');
            starsCv.className = 'globe-stars';
            globeEl.insertBefore(starsCv, globeEl.firstChild);
            window.addEventListener('resize', () => { clearTimeout(starsTimer); starsTimer = setTimeout(drawStars, 200); });
        }
        const w = globeEl.clientWidth || innerWidth, h = globeEl.clientHeight || innerHeight, dpr = Math.min(window.devicePixelRatio || 1, 2);
        starsCv.width = Math.round(w * dpr); starsCv.height = Math.round(h * dpr);
        const ctx = starsCv.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        let seed = 20261102;
        const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
        const tints = ['255,255,255', '255,255,255', '255,255,255', '214,226,255', '190,210,255', '255,240,214', '255,222,186'];
        const ang = -0.5, cx = w * 0.5, cy = h * 0.5, len = Math.hypot(w, h), ux = Math.cos(ang), uy = Math.sin(ang), bandW = Math.max(w, h) * 0.13;
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(ang);
        for (let i = 0; i < 70; i++) {
            const x = (rnd() - 0.5) * len, y = (rnd() - 0.5) * bandW * 1.2, r = bandW * (0.35 + rnd() * 0.6);
            const g = ctx.createRadialGradient(x, y, 0, x, y, r), warm = rnd() < 0.35;
            g.addColorStop(0, warm ? 'rgba(200,170,210,0.05)' : 'rgba(150,170,230,0.05)'); g.addColorStop(1, 'rgba(120,140,200,0)');
            ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
        }
        ctx.restore();
        const star = (x, y, r, a, tint) => { ctx.fillStyle = `rgba(${tint},${a})`; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill(); };
        const n = Math.min(2200, Math.round(w * h / 650));
        for (let i = 0; i < n; i++) {
            const p = rnd(), r = p < 0.75 ? 0.3 + rnd() * 0.35 : p < 0.97 ? 0.6 + rnd() * 0.5 : 1 + rnd() * 0.6;
            star(rnd() * w, rnd() * h, r, 0.25 + Math.pow(rnd(), 2) * 0.75, tints[(rnd() * tints.length) | 0]);
        }
        for (let i = 0; i < n * 0.6; i++) {
            const t = (rnd() - 0.5) * len, o = (rnd() + rnd() + rnd() - 1.5) * bandW * 0.7;
            star(cx + ux * t - uy * o, cy + uy * t + ux * o, 0.25 + rnd() * 0.4, 0.2 + rnd() * 0.45, tints[(rnd() * tints.length) | 0]);
        }
        const bright = Math.max(8, Math.round(n / 120));
        for (let i = 0; i < bright; i++) {
            const x = rnd() * w, y = rnd() * h, tint = tints[(rnd() * tints.length) | 0], r = 5 + rnd() * 7;
            const g = ctx.createRadialGradient(x, y, 0, x, y, r);
            g.addColorStop(0, `rgba(${tint},0.55)`); g.addColorStop(0.25, `rgba(${tint},0.12)`); g.addColorStop(1, `rgba(${tint},0)`);
            ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
            star(x, y, 0.9 + rnd() * 0.6, 1, '255,255,255');
        }
    }

    function showFlat(matchView) {
        if (!globeOn) return;
        globeOn = false;
        if (gl) { gl.stop(); setGlobeInput(false); }
        if (matchView && gl) {
            const c = gl.getCenter();
            glSyncing = true;
            map.setView([c.lat, c.lng], Math.max(GLOBE.FLAT_MIN, gl.getZoom() + 1), { animate: false });
            glSyncing = false;
        }
        if (!map.hasLayer(imageryLayer)) { imageryLayer.addTo(map); labelsLayer.addTo(map); }
        appEl.classList.remove('globe-on');
        nightOpacity();
        updateZoomButtons();
        syncUrl(map.getCenter());
        clearTimeout(glDropTimer);
        glDropTimer = setTimeout(() => { if (!globeOn && gl) { gl.remove(); gl = null; } }, GLOBE.DROP_MS);
    }

    const easeOut = t => 1 - Math.pow(1 - t, 3);
    map.on('zoomanim', e => {
        if (globeOn || e.zoom >= GLOBE.FLAT_MIN) return;
        showGlobe(map.getCenter(), GLOBE.TO_FLAT - 0.001, { center: [e.center.lng, e.center.lat], zoom: e.zoom - 1, duration: 250, easing: easeOut });
    });
    map.on('zoom', () => {
        if (globeOn || glSyncing || map._animatingZoom || map.getZoom() >= GLOBE.FLAT_MIN - 0.2) return;
        showGlobe(map.getCenter(), map.getZoom() - 1, { zoom: GLOBE.ENTER_TO, duration: 500, easing: easeOut });
    });
    map.on('zoomend', () => {
        if (globeOn && map.getZoom() < GLOBE.FLAT_MIN) {
            glSyncing = true;
            map.setView(map.getCenter(), GLOBE.FLAT_MIN, { animate: false });
            glSyncing = false;
        }
    });
    map.on('movestart', () => {
        if (globeOn && !glSyncing && Date.now() > glQuietUntil && map.getZoom() >= GLOBE.FLAT_MIN) showFlat(false);
    });

    if (startOnGlobe) {
        const c = map.getCenter();
        showGlobe(c, hasPos && zParam >= 0 ? Math.max(0, zParam - 1) : globeFitZoom(c.lat), null);
    }

    const dateMatch = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(dateParam || '');
    if (dateMatch) {
        const day = Number(dateMatch[1]);
        const month = Number(dateMatch[2]);
        const year = Number(dateMatch[3]);
        const parsed = new Date(year, month - 1, day, 12);
        if (parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === day) {
            setSelectedDate(year, month - 1, day);
        }
    }

    refresh();
    sunArrowsFade();
});
