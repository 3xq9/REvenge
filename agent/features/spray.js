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
    logEvery
}
from "../utils/logger.js";

const SPRAY_SLOT = 10;

var _opts = {
    intervalMs: 600
};
var _lastFire = 0;
var _sendSpray = null;

export function setSprayOptions(o)
{
    if (!o || typeof o !== "object") return;
    if (typeof o.intervalMs === "number" && isFinite(o.intervalMs))
    {
        _opts.intervalMs = Math.max(100, Math.min(5e3, o.intervalMs | 0));
    }
}

export function resetSpray()
{
    _lastFire = 0;
}

export function setupSpray()
{
    if (_sendSpray) return;
    _sendSpray = getFunctions().CombatHUD_sendSprayCommand;
}

function _battleReady()
{
    const battle = getFunctions().BattleMode_getInstance();
    if (!battle || battle.isNull()) return false;
    const objects = battle.add(offsets.BattleMode_objectManagerPtr).readPointer();
    return !!(objects && !objects.isNull());
}

export function updateSpray(now)
{
    if (!state.spray || !_sendSpray) return;
    if (now === void 0) now = Date.now();
    if (now - _lastFire < _opts.intervalMs) return;
    try
    {
        if (!_battleReady()) return;
        _sendSpray(SPRAY_SLOT);
        _lastFire = now;
        logEvery(10, "spray sent",
        {
            slot: SPRAY_SLOT
        });
    }
    catch (_)
    {
        _lastFire = now;
    }
}
