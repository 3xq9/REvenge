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
    scanData
}
from "../core/scanner.js";
import
{
    state
}
from "../utils/flags.js";
import
{
    clampMoveTarget,
    getDodgeDir,
    sendBattleMove
}
from "./autododge.js";
import
{
    logError,
    logEvery,
    logInfo
}
from "../utils/logger.js";

var MOVE_COORD_LIMIT = 1e5;
var SPIN_RADIUS = 20;
var SPIN_STEP = Math.PI / 4;
var SPIN_ALLOW_MOVING = false;
var _spinPhase = 0;
var _moved = false;

export function setSpinnerOptions(opts)
{
    if (!opts || typeof opts !== "object") return;
    if (typeof opts.speed === "number" && isFinite(opts.speed))
    {
        const s = Math.max(0, Math.min(100, opts.speed));
        SPIN_STEP = 0.1 + s / 100 * 1.4;
    }
    if (typeof opts.radius === "number" && isFinite(opts.radius))
    {
        SPIN_RADIUS = Math.max(20, Math.min(400, opts.radius | 0));
    }
    if (typeof opts.allowMoving === "boolean")
    {
        SPIN_ALLOW_MOVING = opts.allowMoving;
    }
}

export function resetSpinner()
{
    _spinPhase = 0;
    _moved = false;
}

function _spinTarget(self)
{
    if (!SPIN_ALLOW_MOVING)
    {
        try
        {
            if (self.add(offsets.BattleScreen_movePending).readU16() !== 0) return null;
        }
        catch (_)
        {}
    }
    _spinPhase += SPIN_STEP;
    if (_spinPhase >= Math.PI * 2) _spinPhase -= Math.PI * 2;
    const tx = Math.round(scanData.myX + Math.cos(_spinPhase) * SPIN_RADIUS);
    const ty = Math.round(scanData.myY + Math.sin(_spinPhase) * SPIN_RADIUS);
    if (!isFinite(tx) || !isFinite(ty)) return null;
    if (Math.abs(tx) > MOVE_COORD_LIMIT || Math.abs(ty) > MOVE_COORD_LIMIT) return null;
    return clampMoveTarget(tx, ty);
}

export function setupSpinner(base)
{
    try
    {
        Interceptor.attach(base.add(offsets.BattleScreen__updateMovement),
        {
            onEnter: function(args)
            {
                if (!state.spinner) return;
                if (state.autododge && getDodgeDir()) return;
                try
                {
                    const self = args[0];
                    if (!self || self.isNull()) return;
                    const target = _spinTarget(self);
                    if (!target) return;
                    const fns = getFunctions();
                    sendBattleMove(fns.BattleScreen_getLogicBattleModeClient(self), target.x, target.y);
                    if (!_moved)
                    {
                        _moved = true;
                        logInfo("spinner move",
                        {
                            x: target.x,
                            y: target.y
                        });
                    }
                    logEvery(80, "spinner tick",
                    {
                        x: target.x,
                        y: target.y,
                        phase: +_spinPhase.toFixed(3)
                    });
                }
                catch (e)
                {
                    logError("spinner tick failed",
                    {
                        err: String(e && e.message || e)
                    });
                }
            }
        });
    }
    catch (_)
    {}
}
