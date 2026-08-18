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
    withScString
}
from "../core/scstring.js";
import
{
    logInfo
}
from "../utils/logger.js";
import
{
    state
}
from "../utils/flags.js";

const FRAME_SPECTATORS = 0;
const FRAME_BRAWLTV = 1;

var _brawltv = {
    count: 69
};
var _spec = {
    count: 69
};
var _gotoAndStop = null;
var _setText = null;
var _lastText = null;
var _attached = false;

function _clampCount(value)
{
    return Math.max(0, Math.min(99999, value | 0));
}

function _applyText(textField, text)
{
    if (text === _lastText) return;
    withScString(text, (sc) => _setText(textField, sc));
    _lastText = text;
    logInfo("spectator count set",
    {
        text
    });
}

export function setBrawlTvOptions(o)
{
    if (!o || typeof o !== "object") return;
    if (typeof o.count === "number" && isFinite(o.count))
    {
        const v = _clampCount(o.count);
        if (v !== _brawltv.count)
        {
            _brawltv.count = v;
            _lastText = null;
        }
    }
}

export function setSpecOptions(o)
{
    if (!o || typeof o !== "object") return;
    if (typeof o.count === "number" && isFinite(o.count))
    {
        const v = _clampCount(o.count);
        if (v !== _spec.count)
        {
            _spec.count = v;
            _lastText = null;
        }
    }
}

export function resetSpectator()
{
    _lastText = null;
}

export function setupSpectator(base)
{
    if (_attached) return;
    const fns = getFunctions();
    _gotoAndStop = fns.MovieClip_gotoAndStopFrameIndex;
    _setText = fns.TextField_setText;

    Interceptor.attach(base.add(offsets.BattleScreen__update),
    {
        onEnter(args)
        {
            this.screen = args[0];
        },
        onLeave()
        {
            if (!state.brawltv && !state.spec)
            {
                _lastText = null;
                return;
            }
            try
            {
                const screen = this.screen;
                if (!screen || screen.isNull()) return;
                const widget = screen.add(offsets.BattleScreen_spectateWidget).readPointer();
                if (!widget || widget.isNull()) return;
                const textField = screen.add(offsets.BattleScreen_spectateTextField).readPointer();
                if (!textField || textField.isNull()) return;

                const count = state.brawltv ? _brawltv.count : _spec.count;
                const frame = state.brawltv ? FRAME_BRAWLTV : FRAME_SPECTATORS;
                widget.add(offsets.DisplayObject_visible).writeU8(1);
                _applyText(textField, String(count));
                _gotoAndStop(widget, frame);
            }
            catch (_)
            {}
        }
    });
    _attached = true;
}
