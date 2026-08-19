import
{
    getFunctions
}
from "../core/functions.js";
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

const EMPTY_PIN_ID = 0;

var _opts = {
    intervalMs: 800
};
var _lastFire = 0;
var _sendPin = null;

export function setPinOptions(o)
{
    if (!o || typeof o !== "object") return;
    if (typeof o.intervalMs === "number" && isFinite(o.intervalMs))
    {
        _opts.intervalMs = Math.max(100, Math.min(5e3, o.intervalMs | 0));
    }
}

export function resetPin()
{
    _lastFire = 0;
}

export function setupPin()
{
    if (_sendPin) return;
    _sendPin = getFunctions().CombatHUD_sendPinCommand;
}

export function updatePin(now)
{
    if (!state.pin || !_sendPin) return;
    if (now === void 0) now = Date.now();
    if (now - _lastFire < _opts.intervalMs) return;
    _sendPin(EMPTY_PIN_ID);
    _lastFire = now;
    logEvery(10, "pin sent",
    {
        pin: EMPTY_PIN_ID,
        intervalMs: _opts.intervalMs | 0
    });
}
