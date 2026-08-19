import
{
    hookSwapBuffers
}
from "../core/egl.js";
import
{
    getBattleScreen,
    getBattleScreenTs
}
from "./camera.js";
import
{
    offsets
}
from "../core/offsets.js";
import
{
    scanData
}
from "../core/scanner.js";
import
{
    characterRange
}
from "../helpers/combat.js";
import
{
    state
}
from "../utils/flags.js";
import
{
    logEvery,
    logInfo,
    logWarn
}
from "../utils/logger.js";
import
{
    BLOCKS_PROJECTILES,
    losCheck
}
from "../utils/wallCache.js";

var SCAN_STALENESS_MS = 2e3;
var BS_STALENESS_MS = 2e3;
var RING_SEGS = 32;
var LINE_THICKNESS = 3;
var ESP_DEFAULTS = Object.freeze(
{
    showEnemyBox: true,
    enemyColor: [1, 0.2, 0.2, 0.9],
    enemyColor2: [0.95, 0.2, 0.95, 0.9],
    enemyGradient: false,
    showOwnRange: true,
    ownRangeColor: [0.2, 0.9, 0.95, 0.55],
    ownRangeColor2: [0.95, 0.2, 0.95, 0.55],
    ownRangeGradient: false,
    showEnemyRange: true,
    enemyRangeColor: [0, 0, 0, 0.6],
    enemyRangeColor2: [1, 0.2, 0.2, 0.6],
    enemyRangeGradient: false
});
var options = {
    showEnemyBox: ESP_DEFAULTS.showEnemyBox,
    enemyColor: ESP_DEFAULTS.enemyColor.slice(),
    enemyColor2: ESP_DEFAULTS.enemyColor2.slice(),
    enemyGradient: ESP_DEFAULTS.enemyGradient,
    showOwnRange: ESP_DEFAULTS.showOwnRange,
    ownRangeColor: ESP_DEFAULTS.ownRangeColor.slice(),
    ownRangeColor2: ESP_DEFAULTS.ownRangeColor2.slice(),
    ownRangeGradient: ESP_DEFAULTS.ownRangeGradient,
    showEnemyRange: ESP_DEFAULTS.showEnemyRange,
    enemyRangeColor: ESP_DEFAULTS.enemyRangeColor.slice(),
    enemyRangeColor2: ESP_DEFAULTS.enemyRangeColor2.slice(),
    enemyRangeGradient: ESP_DEFAULTS.enemyRangeGradient
};

function _coerceColor(v, fallback)
{
    if (!Array.isArray(v) || v.length < 3) return fallback.slice();
    const r = Math.max(0, Math.min(1, +v[0] || 0));
    const g = Math.max(0, Math.min(1, +v[1] || 0));
    const b = Math.max(0, Math.min(1, +v[2] || 0));
    const a = v.length >= 4 ? Math.max(0, Math.min(1, +v[3] || 0)) : fallback[3];
    return [r, g, b, a];
}
export function setESPOptions(o)
{
    if (!o || typeof o !== "object") return;
    if (typeof o.showEnemyBox === "boolean") options.showEnemyBox = o.showEnemyBox;
    if (typeof o.showOwnRange === "boolean") options.showOwnRange = o.showOwnRange;
    if (typeof o.showEnemyRange === "boolean") options.showEnemyRange = o.showEnemyRange;
    if (o.enemyColor) options.enemyColor = _coerceColor(o.enemyColor, ESP_DEFAULTS.enemyColor);
    if (o.enemyColor2) options.enemyColor2 = _coerceColor(o.enemyColor2, ESP_DEFAULTS.enemyColor2);
    if (typeof o.enemyGradient === "boolean") options.enemyGradient = o.enemyGradient;
    if (o.ownRangeColor) options.ownRangeColor = _coerceColor(o.ownRangeColor, ESP_DEFAULTS.ownRangeColor);
    if (o.ownRangeColor2) options.ownRangeColor2 = _coerceColor(o.ownRangeColor2, ESP_DEFAULTS.ownRangeColor2);
    if (typeof o.ownRangeGradient === "boolean") options.ownRangeGradient = o.ownRangeGradient;
    if (o.enemyRangeColor) options.enemyRangeColor = _coerceColor(o.enemyRangeColor, ESP_DEFAULTS.enemyRangeColor);
    if (o.enemyRangeColor2) options.enemyRangeColor2 = _coerceColor(o.enemyRangeColor2, ESP_DEFAULTS.enemyRangeColor2);
    if (typeof o.enemyRangeGradient === "boolean") options.enemyRangeGradient = o.enemyRangeGradient;
}
var _targetCount = 0;
var _enemyRingCount = 0;
var _myRingValid = false;
var _selfValid = false;
var _selfX = 0;
var _selfY = 0;
var _sw = 0;
var _sh = 0;
var _lastUpd = 0;
var _glReady = false;
var _glFailed = false;
var _prog = 0;
var _posLoc = -1;
var _colLoc = -1;
var _vbo = 0;
var _MAX_VERTS = 2048;
var _STRIDE_F = 6;
var _STRIDE_B = 24;
var _verts = null;
var vertexBytes = null;
var vertexBuffer = null;
var _vertCount = 0;
var GL_ARRAY_BUFFER = 34962;
var GL_DYNAMIC_DRAW = 35048;
var GL_FLOAT = 5126;
var GL_LINES = 1;
var GL_BLEND = 3042;
var GL_SRC_ALPHA = 770;
var GL_ONE_MINUS_SRC_ALPHA = 771;
var GL_VERTEX_SHADER = 35633;
var GL_FRAGMENT_SHADER = 35632;
var GL_DEPTH_TEST = 2929;
var GL_CULL_FACE = 2884;
var GL_SCISSOR_TEST = 3089;
var _gl = {};

function _tryLoadGL()
{
    const libs = ["libGLESv2.so", "libGLES_mali.so", "libGLES_adreno.so", "libGL.so"];
    for (const lib of libs)
    {
        try
        {
            const mod = Process.findModuleByName(lib);
            if (mod && mod.findExportByName("glCreateShader")) return mod;
        }
        catch (_)
        {}
    }
    return null;
}

function _loadGLFunctions(mod)
{
    const f = (n, r, a) => new NativeFunction(mod.findExportByName(n), r, a);
    _gl.createShader = f("glCreateShader", "uint", ["uint"]);
    _gl.shaderSource = f("glShaderSource", "void", ["uint", "int", "pointer", "pointer"]);
    _gl.compileShader = f("glCompileShader", "void", ["uint"]);
    _gl.createProgram = f("glCreateProgram", "uint", []);
    _gl.attachShader = f("glAttachShader", "void", ["uint", "uint"]);
    _gl.linkProgram = f("glLinkProgram", "void", ["uint"]);
    _gl.useProgram = f("glUseProgram", "void", ["uint"]);
    _gl.getAttribLoc = f("glGetAttribLocation", "int", ["uint", "pointer"]);
    _gl.getUniformLoc = f("glGetUniformLocation", "int", ["uint", "pointer"]);
    _gl.uniform4f = f("glUniform4f", "void", ["int", "float", "float", "float", "float"]);
    _gl.enableVertexAttrib = f("glEnableVertexAttribArray", "void", ["uint"]);
    _gl.vertexAttribPtr = f("glVertexAttribPointer", "void", ["uint", "int", "uint", "uint8", "int", "pointer"]);
    _gl.drawArrays = f("glDrawArrays", "void", ["uint", "int", "int"]);
    _gl.genBuffers = f("glGenBuffers", "void", ["int", "pointer"]);
    _gl.bindBuffer = f("glBindBuffer", "void", ["uint", "uint"]);
    _gl.bufferData = f("glBufferData", "void", ["uint", "int64", "pointer", "uint"]);
    _gl.enable = f("glEnable", "void", ["uint"]);
    _gl.disable = f("glDisable", "void", ["uint"]);
    _gl.blendFunc = f("glBlendFunc", "void", ["uint", "uint"]);
    _gl.lineWidth = f("glLineWidth", "void", ["float"]);
}
var _VERT = "attribute vec2 p;attribute vec4 vc;varying vec4 fc;void main(){fc=vc;gl_Position=vec4(p,0.0,1.0);}";
var _FRAG = "precision mediump float;varying vec4 fc;void main(){gl_FragColor=fc;}";

function _initGL()
{
    if (_glReady || _glFailed) return;
    try
    {
        if (!_verts)
        {
            _verts = new Float32Array(_MAX_VERTS * _STRIDE_F);
            vertexBytes = new Uint8Array(_verts.buffer);
            vertexBuffer = Memory.alloc(_verts.byteLength);
        }
        const lib = _tryLoadGL();
        if (!lib)
        {
            _glFailed = true;
            logWarn("esp gl init failed",
            {
                reason: "no GLES library"
            });
            try
            {
                send(
                {
                    type: "WARN",
                    code: 3,
                    text: "esp: no GLES library found, ESP disabled"
                });
            }
            catch (_)
            {}
            return;
        }
        _loadGLFunctions(lib);
        const mkShader = (type, src) =>
        {
            const s = _gl.createShader(type);
            const sp = Memory.allocUtf8String(src);
            const pp = Memory.alloc(Process.pointerSize);
            pp.writePointer(sp);
            _gl.shaderSource(s, 1, pp, ptr(0));
            _gl.compileShader(s);
            return s;
        };
        const vs = mkShader(GL_VERTEX_SHADER, _VERT);
        const fs = mkShader(GL_FRAGMENT_SHADER, _FRAG);
        _prog = _gl.createProgram();
        if (_prog === 0)
        {
            _glFailed = true;
            logWarn("esp gl init failed",
            {
                reason: "glCreateProgram 0",
                lib: lib.name
            });
            try
            {
                send(
                {
                    type: "WARN",
                    code: 3,
                    text: "esp: glCreateProgram returned 0, ESP disabled"
                });
            }
            catch (_)
            {}
            return;
        }
        _gl.attachShader(_prog, vs);
        _gl.attachShader(_prog, fs);
        _gl.linkProgram(_prog);
        _posLoc = _gl.getAttribLoc(_prog, Memory.allocUtf8String("p"));
        _colLoc = _gl.getAttribLoc(_prog, Memory.allocUtf8String("vc"));
        const vp = Memory.alloc(4);
        _gl.genBuffers(1, vp);
        _vbo = vp.readU32();
        _glReady = true;
        logInfo("esp overlay ready",
        {
            lib: lib.name,
            vbo: _vbo,
            posLoc: _posLoc,
            colLoc: _colLoc
        });
    }
    catch (e)
    {
        _glFailed = true;
        try
        {
            send(
            {
                type: "WARN",
                code: 3,
                text: "esp: init error: " + (e && e.message ? e.message : e)
            });
        }
        catch (_)
        {}
    }
}

function _setVert(idx, nx, ny, r, g, b, a)
{
    const off = idx * _STRIDE_F;
    _verts[off] = nx;
    _verts[off + 1] = ny;
    _verts[off + 2] = r;
    _verts[off + 3] = g;
    _verts[off + 4] = b;
    _verts[off + 5] = a;
}

function _pushSeg(idx, ax, ay, bx, by, r, g, b_, a)
{
    if (idx + 2 > _MAX_VERTS) return idx;
    _setVert(idx, ax, ay, r, g, b_, a);
    _setVert(idx + 1, bx, by, r, g, b_, a);
    return idx + 2;
}

function _pushSegGrad(idx, ax, ay, bx, by, ra, ga, ba, aa, rb, gb, bb, ab)
{
    if (idx + 2 > _MAX_VERTS) return idx;
    _setVert(idx, ax, ay, ra, ga, ba, aa);
    _setVert(idx + 1, bx, by, rb, gb, bb, ab);
    return idx + 2;
}

function _pushBox(idx, sx, sy, r, g, b, a)
{
    const nx = sx / _sw * 2 - 1;
    const ny = 1 - sy / _sh * 2;
    const bw = 80 / _sw,
        bh = 120 / _sh;
    const x0 = nx - bw / 2,
        x1 = nx + bw / 2;
    idx = _pushSeg(idx, x0, ny, x1, ny, r, g, b, a);
    idx = _pushSeg(idx, x1, ny, x1, ny + bh, r, g, b, a);
    idx = _pushSeg(idx, x1, ny + bh, x0, ny + bh, r, g, b, a);
    idx = _pushSeg(idx, x0, ny + bh, x0, ny, r, g, b, a);
    return idx;
}

function _pushBoxGrad(idx, sx, sy, ra, ga, ba, aa, rb, gb, bb, ab)
{
    const nx = sx / _sw * 2 - 1;
    const ny = 1 - sy / _sh * 2;
    const bw = 80 / _sw,
        bh = 120 / _sh;
    const x0 = nx - bw / 2,
        x1 = nx + bw / 2;
    const y0 = ny,
        y1 = ny + bh;
    const dr = rb - ra,
        dg = gb - ga,
        db = bb - ba,
        da_ = ab - aa;
    const t1 = 0.25,
        t2 = 0.5,
        t3 = 0.75;
    const r1 = ra + dr * t1,
        g1 = ga + dg * t1,
        b1 = ba + db * t1,
        a1 = aa + da_ * t1;
    const r2 = ra + dr * t2,
        g2 = ga + dg * t2,
        b2 = ba + db * t2,
        a2 = aa + da_ * t2;
    const r3 = ra + dr * t3,
        g3 = ga + dg * t3,
        b3 = ba + db * t3,
        a3 = aa + da_ * t3;
    idx = _pushSegGrad(idx, x0, y0, x1, y0, ra, ga, ba, aa, r1, g1, b1, a1);
    idx = _pushSegGrad(idx, x1, y0, x1, y1, r1, g1, b1, a1, r2, g2, b2, a2);
    idx = _pushSegGrad(idx, x1, y1, x0, y1, r2, g2, b2, a2, r3, g3, b3, a3);
    idx = _pushSegGrad(idx, x0, y1, x0, y0, r3, g3, b3, a3, ra, ga, ba, aa);
    return idx;
}

function _pushRing(idx, pts, r, g, b, a)
{
    const n = RING_SEGS;
    for (let i = 0; i < n; i++)
    {
        const p1 = pts[i],
            p2 = pts[(i + 1) % n];
        if (!p1.valid || !p2.valid) continue;
        const ax = p1.sx / _sw * 2 - 1,
            ay = 1 - p1.sy / _sh * 2;
        const bx = p2.sx / _sw * 2 - 1,
            by_ = 1 - p2.sy / _sh * 2;
        idx = _pushSeg(idx, ax, ay, bx, by_, r, g, b, a);
    }
    return idx;
}

function _pushRingGrad(idx, pts, ra, ga, ba, aa, rb, gb, bb, ab)
{
    const n = RING_SEGS;
    const dr = rb - ra,
        dg = gb - ga,
        db = bb - ba,
        da_ = ab - aa;
    const inv = 1 / n;
    for (let i = 0; i < n; i++)
    {
        const p1 = pts[i],
            p2 = pts[(i + 1) % n];
        if (!p1.valid || !p2.valid) continue;
        const t1 = i * inv;
        const t2 = (i + 1) * inv;
        const ax = p1.sx / _sw * 2 - 1,
            ay = 1 - p1.sy / _sh * 2;
        const bx = p2.sx / _sw * 2 - 1,
            by_ = 1 - p2.sy / _sh * 2;
        idx = _pushSegGrad(
            idx,
            ax,
            ay,
            bx,
            by_,
            ra + dr * t1,
            ga + dg * t1,
            ba + db * t1,
            aa + da_ * t1,
            ra + dr * t2,
            ga + dg * t2,
            ba + db * t2,
            aa + da_ * t2
        );
    }
    return idx;
}

function _drawFrame()
{
    if (!_glReady || _sw <= 0 || _sh <= 0) return;
    if (_lastUpd > 0 && Date.now() - _lastUpd > 1500)
    {
        _targetCount = 0;
        _enemyRingCount = 0;
        _myRingValid = false;
        _selfValid = false;
    }
    if (_targetCount === 0 && !_myRingValid && _enemyRingCount === 0) return;
    try
    {
        let idx = 0;
        if (options.showEnemyRange)
        {
            const erc = options.enemyRangeColor;
            const erc2 = options.enemyRangeColor2;
            const erg = options.enemyRangeGradient;
            for (let i = 0; i < _enemyRingCount; i++)
            {
                if (erg)
                {
                    idx = _pushRingGrad(
                        idx,
                        _ringPools[i],
                        erc[0],
                        erc[1],
                        erc[2],
                        erc[3],
                        erc2[0],
                        erc2[1],
                        erc2[2],
                        erc2[3]
                    );
                }
                else
                {
                    idx = _pushRing(idx, _ringPools[i], erc[0], erc[1], erc[2], erc[3]);
                }
            }
        }
        if (options.showOwnRange && _myRingValid)
        {
            const orc = options.ownRangeColor;
            const orc2 = options.ownRangeColor2;
            if (options.ownRangeGradient)
            {
                idx = _pushRingGrad(
                    idx,
                    _myRingPool,
                    orc[0],
                    orc[1],
                    orc[2],
                    orc[3],
                    orc2[0],
                    orc2[1],
                    orc2[2],
                    orc2[3]
                );
            }
            else
            {
                idx = _pushRing(idx, _myRingPool, orc[0], orc[1], orc[2], orc[3]);
            }
        }
        const ox = _selfValid ? _selfX / _sw * 2 - 1 : 0;
        const oy = _selfValid ? 1 - _selfY / _sh * 2 : 0;
        const ec = options.enemyColor;
        const e2 = options.enemyColor2;
        const grad = options.enemyGradient;
        for (let i = 0; i < _targetCount; i++)
        {
            const t = _targetsPool[i];
            if (options.showEnemyBox)
            {
                if (t.los && _selfValid)
                {
                    const tx = t.sx / _sw * 2 - 1;
                    const ty = 1 - t.sy / _sh * 2;
                    if (grad)
                    {
                        idx = _pushSegGrad(
                            idx,
                            ox,
                            oy,
                            tx,
                            ty,
                            ec[0],
                            ec[1],
                            ec[2],
                            ec[3],
                            e2[0],
                            e2[1],
                            e2[2],
                            e2[3]
                        );
                    }
                    else
                    {
                        idx = _pushSeg(idx, ox, oy, tx, ty, ec[0], ec[1], ec[2], ec[3]);
                    }
                }
                if (grad)
                {
                    idx = _pushBoxGrad(
                        idx,
                        t.sx,
                        t.sy,
                        ec[0],
                        ec[1],
                        ec[2],
                        ec[3],
                        e2[0],
                        e2[1],
                        e2[2],
                        e2[3]
                    );
                }
                else
                {
                    idx = _pushBox(idx, t.sx, t.sy, ec[0], ec[1], ec[2], ec[3]);
                }
            }
        }
        if (idx === 0) return;
        _vertCount = idx;
        vertexBuffer.writeByteArray(vertexBytes.subarray(0, _vertCount * _STRIDE_B));
        _gl.disable(GL_DEPTH_TEST);
        _gl.disable(GL_CULL_FACE);
        _gl.disable(GL_SCISSOR_TEST);
        _gl.enable(GL_BLEND);
        _gl.blendFunc(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA);
        _gl.useProgram(_prog);
        _gl.bindBuffer(GL_ARRAY_BUFFER, _vbo);
        _gl.bufferData(GL_ARRAY_BUFFER, _vertCount * _STRIDE_B, vertexBuffer, GL_DYNAMIC_DRAW);
        _gl.enableVertexAttrib(_posLoc);
        _gl.vertexAttribPtr(_posLoc, 2, GL_FLOAT, 0, _STRIDE_B, ptr(0));
        _gl.enableVertexAttrib(_colLoc);
        _gl.vertexAttribPtr(_colLoc, 4, GL_FLOAT, 0, _STRIDE_B, ptr(8));
        _gl.lineWidth(LINE_THICKNESS);
        _gl.drawArrays(GL_LINES, 0, _vertCount);
        _gl.useProgram(0);
        _gl.bindBuffer(GL_ARRAY_BUFFER, 0);
    }
    catch (_)
    {
        _glFailed = true;
    }
}
var _mSW = 0;
var _mSH = 0;
var _mMat = new Float32Array(16);
var _ringCos = new Float32Array(RING_SEGS);
var _ringSin = new Float32Array(RING_SEGS);
(function()
{
    for (let i = 0; i < RING_SEGS; i++)
    {
        const a = i * (Math.PI * 2 / RING_SEGS);
        _ringCos[i] = Math.cos(a);
        _ringSin[i] = Math.sin(a);
    }
})();
var _MAX_RINGS = 8;
var _ringPools = new Array(_MAX_RINGS);
for (let i = 0; i < _MAX_RINGS; i++)
{
    const r = new Array(RING_SEGS);
    for (let j = 0; j < RING_SEGS; j++) r[j] = {
        sx: 0,
        sy: 0,
        valid: false
    };
    _ringPools[i] = r;
}
var _myRingPool = new Array(RING_SEGS);
for (let i = 0; i < RING_SEGS; i++) _myRingPool[i] = {
    sx: 0,
    sy: 0,
    valid: false
};
var _targetsPool = new Array(_MAX_RINGS);
for (let i = 0; i < _MAX_RINGS; i++) _targetsPool[i] = {
    sx: 0,
    sy: 0,
    los: false
};
var _w2sTmp = {
    sx: 0,
    sy: 0,
    valid: false
};

function _refreshMatrix(bs)
{
    try
    {
        _mSW = bs.add(offsets.BattleScreen_screenWidth).readFloat();
        _mSH = bs.add(offsets.BattleScreen_screenHeight).readFloat();
        if (_mSW <= 0 || _mSH <= 0) return false;
        const buf = bs.add(offsets.BattleScreen_viewMatrix).readByteArray(64);
        if (!buf) return false;
        const dv = new DataView(buf);
        for (let i = 0; i < 16; i++) _mMat[i] = dv.getFloat32(i * 4, true);
        return true;
    }
    catch (_)
    {
        return false;
    }
}

function _w2sInto(wx, wy, out)
{
    const M = _mMat;
    const y = -wy;
    const cx = M[0] * wx + M[4] * y + M[12];
    const cy = M[1] * wx + M[5] * y + M[13];
    const cw = M[3] * wx + M[7] * y + M[15];
    if (cw <= 1e-6)
    {
        out.valid = false;
        return false;
    }
    const iw = 1 / cw;
    out.sx = (cx * iw * 0.5 + 0.5) * _mSW;
    out.sy = (1 - (cy * iw * 0.5 + 0.5)) * _mSH;
    out.valid = true;
    return true;
}
var _hookInstalled = false;
var _espBase = null;
var _hookRetryTimer = null;
var ESP_HOOK_RETRY_MS = 250;

function _renderOverlay()
{
    try
    {
        if (!state.esp) return;
        if (!_glReady && !_glFailed) _initGL();
        _drawFrame();
    }
    catch (_)
    {}
}

function _scheduleHookRetry()
{
    if (_hookRetryTimer !== null || _hookInstalled || !state.esp || !_espBase) return;
    _hookRetryTimer = setTimeout(() =>
    {
        _hookRetryTimer = null;
        if (state.esp && !_hookInstalled && _espBase) setupESP(_espBase);
    }, ESP_HOOK_RETRY_MS);
}
export function setupESP(base)
{
    _espBase = base;
    if (!state.esp || _hookInstalled) return;
    try
    {
        if (hookSwapBuffers(_renderOverlay))
        {
            _hookInstalled = true;
            return;
        }
    }
    catch (_)
    {}
    _scheduleHookRetry();
}
export function enableESP()
{
    if (_espBase && state.esp && !_hookInstalled) setupESP(_espBase);
}

function _ringPointsInto(cx, cy, r, pool)
{
    for (let i = 0; i < RING_SEGS; i++)
    {
        _w2sInto(cx + _ringCos[i] * r, cy + _ringSin[i] * r, pool[i]);
    }
}
export function updateESP()
{
    const now = Date.now();
    const battleScreen = getBattleScreen();
    const battleScreenTs = getBattleScreenTs();
    if (!battleScreen || battleScreen.isNull() || battleScreenTs > 0 && now - battleScreenTs > BS_STALENESS_MS || scanData.lastUpdate === 0 || now - scanData.lastUpdate > SCAN_STALENESS_MS || !scanData.ownCharacter || scanData.myX === void 0 || scanData.myX === -1)
    {
        _targetCount = 0;
        _enemyRingCount = 0;
        _myRingValid = false;
        _selfValid = false;
        return;
    }
    if (!_refreshMatrix(battleScreen))
    {
        _targetCount = 0;
        _enemyRingCount = 0;
        _myRingValid = false;
        _selfValid = false;
        return;
    }
    _sw = _mSW;
    _sh = _mSH;
    const mx = scanData.myX,
        my = scanData.myY;
    _selfValid = _w2sInto(mx, my, _w2sTmp);
    if (_selfValid)
    {
        _selfX = _w2sTmp.sx;
        _selfY = _w2sTmp.sy;
    }
    const myRange = characterRange(scanData.ownCharacter);
    if (myRange > 0)
    {
        _ringPointsInto(mx, my, myRange, _myRingPool);
        _myRingValid = true;
    }
    else
    {
        _myRingValid = false;
    }
    const enemies = scanData.enemies;
    let tCount = 0;
    let rCount = 0;
    for (let i = 0; i < enemies.length; i++)
    {
        const e = enemies[i];
        if (!e || e.x === -1 || e.y === -1) continue;
        if (tCount >= _MAX_RINGS) break;
        if (!_w2sInto(e.x, e.y, _w2sTmp)) continue;
        const slot = _targetsPool[tCount];
        slot.sx = _w2sTmp.sx;
        slot.sy = _w2sTmp.sy;
        slot.los = losCheck(mx, my, e.x, e.y, BLOCKS_PROJECTILES);
        tCount++;
        const eR = characterRange(e.ptr);
        if (eR <= 0) continue;
        _ringPointsInto(e.x, e.y, eR, _ringPools[rCount]);
        rCount++;
    }
    _targetCount = tCount;
    _enemyRingCount = rCount;
    _lastUpd = now;
    logEvery(90, "esp tick",
    {
        enemies: enemies.length,
        drawn: tCount,
        rings: rCount,
        self: _selfValid,
        sw: _sw | 0,
        sh: _sh | 0
    });
}
export function resetESP()
{
    _targetCount = 0;
    _enemyRingCount = 0;
    _myRingValid = false;
    _selfValid = false;
    _sw = 0;
    _sh = 0;
    _lastUpd = 0;
}
