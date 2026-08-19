import
{
    sendCommand
}
from "../core/commands.js";
import
{
    getFunctions
}
from "../core/functions.js";
import
{
    offsets
}
from "../core/offsets.js";
import
{
    state
}
from "../utils/flags.js";
import
{
    logEvery,
    logInfo
}
from "../utils/logger.js";
import
{
    getDodgeDir
}
from "./autododge.js";
import
{
    scanData
}
from "../core/scanner.js";

const MOVE_INPUT_TYPE = 2;

var _base = null;
var game = null;
var getLocalChar = null;
var setPosition = null;
var getChar = null;
var pathfind = null;
var diagFlag = null;
var drainMove = null;
var charDx1 = null;
var charDx2 = null;
var charDy1 = null;
var charDy2 = null;
var posX = null;
var posY = null;
var flipByte = null;
var gameUpdate = null;
var _pathOut = null;
var _bound = false;
var getMainChar = null;

const O = {
    gameBattle: 40,
    charCtx: 16,
    movingCtl: 1240,
    movingFlag: 186,
    resetSpeed: 3952,
    ctrlPtr: 2536
};

function off(android)
{
    return _base.add(android);
}

function battle()
{
    const live = scanData.battleModeClient;
    if (live && !live.isNull()) return live;
    const g = game();
    return g && !g.isNull() ? g.add(O.gameBattle).readPointer() : null;
}

function tileMap(battleMode)
{
    const fns = getFunctions();
    if (!fns || !fns.LogicBattleModeClient_getTileMap || !battleMode || battleMode.isNull()) return null;
    const map = fns.LogicBattleModeClient_getTileMap(battleMode);
    return map && !map.isNull() ? map : null;
}

function localChar()
{
    const b = battle();
    return b && !b.isNull() ? getLocalChar(b) : null;
}

function currentPos()
{
    const c = localChar();
    return c && !c.isNull() ?
    {
        x: posX(c),
        y: posY(c)
    } : null;
}

function serverMove(x, y)
{
    return sendCommand(MOVE_INPUT_TYPE, (ci) =>
    {
        ci.add(offsets.ClientInput_x).writeS32(x | 0);
        ci.add(offsets.ClientInput_y).writeS32(y | 0);
    });
}

const speedHack = {
    enabled: false,
    hooked: false,
    pollTimer: null,
    tps: 0,
    frames: 0,
    tpsTimer: null,
    mainChar: null,
    controller: null,
    flipDir: 0,
    intervalTimer: null,
    drainTimer: null,
    lastServerSend: 0,
    lastBattleTick: 0,
    pending: 0,
    config:
    {
        boostTarget: 3.2,
        cliffMargin: 0,
        ssMinStep: 68,
        speedOff: 564,
        serverThrottleMs: 10,
        fpsCompensate: true,
        targetTps: 400,
        drainIntervalMs: 3,
        maxPending: 8,
        capTps: 560,
        capExp: 0.5,
        step: 114,
        intervalMs: 10
    },
    step: 104,

    clampMove(fromX, fromY, toX, toY)
    {
        const c = localChar();
        if (!c || c.isNull()) return null;
        const diag = 1 & diagFlag(c);
        const b = battle();
        if (!b || b.isNull()) return null;
        const map = tileMap(b);
        if (!map) return null;
        const out = _pathOut;
        if (!out || out.isNull()) return null;
        out.writeS32(-1);
        out.add(4).writeS32(-1);
        let res = pathfind(fromX, fromY, toX, toY, map, out, diag ? 1 : 0, 0, 0, 1);
        if (0 === res) return {
            x: toX,
            y: toY
        };
        const dx = toX - fromX;
        const dy = toY - fromY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 0.001) return {
            x: fromX,
            y: fromY
        };
        let slopeH;
        let slopeV;
        const vx = dx / dist * 600;
        const vy = dy / dist * 600;
        if (Math.abs(vx) >= 0.001)
        {
            slopeH = Math.abs(vy / vx);
            slopeV = Math.abs(vx / vy);
        }
        else
        {
            slopeH = 100;
            slopeV = 0;
        }
        let cx = out.readS32();
        let cy = out.add(4).readS32();
        let cdx = cx - fromX;
        let cdy = cy - fromY;
        let cdist = Math.sqrt(cdx * cdx + cdy * cdy);
        if (cdist >= 21)
        {
            cdx = (cdist - 20) * cdx / cdist | 0;
            cdy = (cdist - 20) * cdy / cdist | 0;
        }
        let tx = fromX + cdx;
        let ty = fromY + cdy;
        let sx = 0;
        let sy = 0;
        if (cdist < 300)
        {
            if (4 === res || 1 === res)
            {
                if (slopeH > 2.5 && 0 !== cdy)
                {
                    const dy2 = cdy > 0 ? 200 : -200;
                    out.writeS32(-1);
                    const r1 = pathfind(fromX, fromY, tx + 100, ty + dy2, map, out, diag ? 1 : 0, 0, 0, 1);
                    out.writeS32(-1);
                    const r2 = pathfind(fromX, fromY, tx - 100, ty + dy2, map, out, diag ? 1 : 0, 0, 0, 1);
                    sx = 0 === (r1 | r2) || 0 !== r1 && 0 !== r2 ? cdx < 1 ? 0 !== cdx ? -this.step : 0 : this.step : 0 === r2 ? -this.step : this.step;
                }
                else
                {
                    sx = cdx < 1 ? 0 !== cdx ? -this.step : 0 : this.step;
                }
            }
            else if (slopeV > 2.5 && 0 !== cdx)
            {
                const dx2 = cdx > 0 ? 200 : -200;
                out.writeS32(-1);
                const r3 = pathfind(fromX, fromY, tx + dx2, ty + 100, map, out, diag ? 1 : 0, 0, 0, 1);
                out.writeS32(-1);
                const r4 = pathfind(fromX, fromY, tx + dx2, ty - 100, map, out, diag ? 1 : 0, 0, 0, 1);
                sy = 0 === (r3 | r4) || 0 !== r3 && 0 !== r4 ? cdy < 1 ? 0 !== cdy ? -this.step : 0 : this.step : 0 === r4 ? -this.step : this.step;
            }
            else
            {
                sy = cdy < 1 ? 0 !== cdy ? -this.step : 0 : this.step;
            }
            tx = fromX + sx;
            ty = fromY + sy;
            out.writeS32(-1);
            out.add(4).writeS32(-1);
            if (0 !== pathfind(fromX, fromY, tx, ty, map, out, diag ? 1 : 0, 0, 0, 1))
            {
                cx = out.readS32();
                cy = out.add(4).readS32();
                cdx = cx - fromX;
                cdy = cy - fromY;
                cdist = Math.sqrt(cdx * cdx + cdy * cdy);
                if (cdist >= 21)
                {
                    cdx = (cdist - 20) * cdx / cdist | 0;
                    cdy = (cdist - 20) * cdy / cdist | 0;
                    tx = fromX + cdx;
                    ty = fromY + cdy;
                }
                else
                {
                    return {
                        x: fromX,
                        y: fromY
                    };
                }
            }
        }
        return {
            x: Math.round(tx),
            y: Math.round(ty)
        };
    },

    inBattle()
    {
        return this.lastBattleTick > 0 && Date.now() - this.lastBattleTick < 32;
    },

    tick()
    {
        try
        {
            if (!this.inBattle())
            {
                this.stop();
                return;
            }
            const ch = this.mainChar;
            if (!ch || ch.isNull())
            {
                this.stop();
                return;
            }
            const ctl = this.controller;
            if (!ctl || ctl.isNull())
            {
                this.stop();
                return;
            }
            const moving = ctl.add(O.movingCtl).readPointer();
            if (!moving || moving.isNull())
            {
                this.stop();
                return;
            }
            const cfg = this.config;
            const now = Date.now();
            const dodge = getDodgeDir();
            let dirX = 0;
            let dirY = 0;
            if (dodge)
            {
                dirX = dodge.x;
                dirY = dodge.y;
                ch.add(O.resetSpeed).writeFloat(0);
            }
            else
            {
                if (!moving.add(O.movingFlag).readU8())
                {
                    scanData.hackSpeed = 0;
                    return;
                }
                ch.add(O.resetSpeed).writeFloat(0);
                let dx = charDx1(ch) - charDx2(ch);
                let dy = charDy1(ch) - charDy2(ch);
                if (this.flipDir)
                {
                    dx = -dx;
                    dy = -dy;
                }
                const len = Math.sqrt(dx * dx + dy * dy);
                if (len < 0.01) return;
                dirX = -dx / len;
                dirY = -dy / len;
            }
            const pos = currentPos();
            if (!pos)
            {
                this.stop();
                return;
            }
            const c = localChar();
            if (!c || c.isNull())
            {
                this.stop();
                return;
            }
            const speed = c.add(cfg.speedOff).readInt();
            let step = speed >= 1 ? cfg.boostTarget * speed / 20 : cfg.step;
            const cap = speed / 10 - cfg.cliffMargin;
            if (step > cap) step = cap;
            if (step < cfg.ssMinStep) step = cfg.ssMinStep;
            if (cfg.capTps > 0 && this.tps > cfg.capTps) step *= Math.pow(cfg.capTps / this.tps, cfg.capExp);
            scanData.hackSpeed = step * (1000 / cfg.intervalMs);
            const target = this.clampMove(pos.x, pos.y, Math.round(pos.x + dirX * step), Math.round(pos.y + dirY * step));
            if (!target) return;
            const ctx = game();
            if (!ctx || ctx.isNull())
            {
                this.stop();
                return;
            }
            const c2 = getChar(ctx.add(O.charCtx).readPointer());
            if (!c2 || c2.isNull())
            {
                this.stop();
                return;
            }
            setPosition(c2, target.x, target.y, 1);
            if (now - this.lastServerSend >= cfg.serverThrottleMs)
            {
                this.lastServerSend = now;
                serverMove(target.x, target.y);
            }
            logEvery(80, "speedhack tick",
            {
                x: pos.x | 0,
                y: pos.y | 0,
                tx: target.x,
                ty: target.y,
                speed: speed | 0,
                step: step | 0,
                tps: this.tps | 0,
                pending: +this.pending.toFixed(2),
                dodge: !!dodge,
                dirX: +dirX.toFixed(3),
                dirY: +dirY.toFixed(3)
            });
        }
        catch (e)
        {
            logEvery(40, "speedhack tick error",
            {
                err: String(e && e.message || e)
            });
        }
    },

    fpsCompensate()
    {
        const tps = this.tps || 60;
        if (tps >= this.config.targetTps)
        {
            this.pending = 0;
            return;
        }
        this.pending = Math.min(this.pending + (this.config.targetTps - tps) / tps, this.config.maxPending);
    },

    drain()
    {
        try
        {
            if (!this.enabled || this.pending < 1 || !this.inBattle())
            {
                if (this.enabled && !this.inBattle()) this.stop();
                return;
            }
            const c = localChar();
            if (!c || c.isNull())
            {
                this.stop();
                return;
            }
            const b = battle();
            if (!b || b.isNull())
            {
                this.stop();
                return;
            }
            const seq = b.add(184).readInt();
            drainMove(c, seq / 50 | 0, seq % 50 * 20, b, 0);
            this.pending -= 1;
        }
        catch (_)
        {}
    },

    attachUpdate()
    {
        if (this.hooked) return;
        this.hooked = true;
        const self = this;
        try
        {
            Interceptor.attach(gameUpdate,
            {
                onEnter()
                {
                    self.frames++;
                },
                onLeave()
                {
                    try
                    {
                        if (self.enabled) self.fpsCompensate();
                    }
                    catch (_)
                    {}
                }
            });
        }
        catch (_)
        {}
    },

    start()
    {
        this.attachUpdate();
        this.enabled = true;
        if (!this.tpsTimer)
        {
            this.tpsTimer = setInterval(() =>
            {
                this.tps = this.frames;
                this.frames = 0;
            }, 1000);
        }
        if (!this.intervalTimer)
        {
            this.intervalTimer = setInterval(() => this.tick(), this.config.intervalMs);
            logInfo("speedhack started",
            {
                intervalMs: this.config.intervalMs,
                boostTarget: this.config.boostTarget,
                fpsCompensate: !!this.config.fpsCompensate,
                drainIntervalMs: this.config.drainIntervalMs,
                serverThrottleMs: this.config.serverThrottleMs,
                targetTps: this.config.targetTps
            });
        }
        if (this.config.fpsCompensate && !this.drainTimer)
        {
            this.drainTimer = setInterval(() => this.drain(), this.config.drainIntervalMs);
        }
    },

    stop()
    {
        this.enabled = false;
        if (this.intervalTimer)
        {
            clearInterval(this.intervalTimer);
            this.intervalTimer = null;
            logInfo("speedhack stopped");
        }
        if (this.drainTimer)
        {
            clearInterval(this.drainTimer);
            this.drainTimer = null;
        }
        if (this.tpsTimer)
        {
            clearInterval(this.tpsTimer);
            this.tpsTimer = null;
        }
        this.tps = 0;
        this.frames = 0;
        this.mainChar = null;
        this.controller = null;
        this.pending = 0;
        this.lastBattleTick = 0;
        scanData.hackSpeed = 0;
    },

    checkAndStart()
    {
        if (!state.speedhack)
        {
            if (this.enabled) this.stop();
            return;
        }
        if (!this.inBattle())
        {
            if (this.enabled) this.stop();
            return;
        }
        if (!getMainChar) return;
        const mc = getMainChar();
        if (mc && !mc.isNull() && tileMap(battle()))
        {
            this.mainChar = mc;
            this.controller = mc.add(O.ctrlPtr).readPointer();
            this.flipDir = 1 & flipByte.readU8();
            this.start();
        }
        else if (this.enabled)
        {
            this.stop();
        }
    },

    update()
    {
        if (this.pollTimer) return;
        const self = this;
        this.pollTimer = setInterval(() =>
        {
            try
            {
                self.checkAndStart();
            }
            catch (_)
            {}
        }, 500);
    }
};

function _guestAlloc(size)
{
    const mallocPtr = Process.getModuleByName("libc.so").getExportByName("malloc");
    const allocated = new NativeFunction(mallocPtr, "pointer", ["uint"])(size);
    if (!allocated || allocated.isNull()) throw new Error("libc malloc failed");
    return allocated;
}

function _bind(base)
{
    _base = base;
    _pathOut = _guestAlloc(16);
    if (!_pathOut) return;
    game = new NativeFunction(off(10204648), "pointer", []);
    getLocalChar = new NativeFunction(off(12728752), "pointer", ["pointer"]);
    setPosition = new NativeFunction(off(12729108), "pointer", ["pointer", "int", "int", "bool"]);
    getChar = new NativeFunction(off(8890956), "pointer", ["pointer"]);
    pathfind = new NativeFunction(off(13021888), "int", ["int", "int", "int", "int", "pointer", "pointer", "bool", "int", "int", "int"]);
    diagFlag = new NativeFunction(off(11741260), "int", ["pointer"]);
    drainMove = new NativeFunction(off(11742912), "void", ["pointer", "int", "int", "pointer", "float"]);
    getMainChar = new NativeFunction(off(8844264), "pointer", []);
    charDx1 = new NativeFunction(off(8842960), "float", ["pointer"]);
    charDx2 = new NativeFunction(off(8842976), "float", ["pointer"]);
    charDy1 = new NativeFunction(off(8842968), "float", ["pointer"]);
    charDy2 = new NativeFunction(off(8842984), "float", ["pointer"]);
    posX = new NativeFunction(off(11920460), "uint32", ["pointer"]);
    posY = new NativeFunction(off(11920468), "uint32", ["pointer"]);
    flipByte = off(19850760);
    gameUpdate = off(5046820);
    _bound = true;
}

export function resetSpeedhack()
{
    speedHack.stop();
}

export function setupSpeedhack(base)
{
    if (_bound)
    {
        speedHack.update();
        return;
    }
    _bind(base);
    if (_bound) speedHack.update();
}

export function updateSpeedhack()
{
    if (!state.speedhack || !_bound) return;
    speedHack.lastBattleTick = Date.now();
    speedHack.checkAndStart();
}
