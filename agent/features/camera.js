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
    logInfo
}
from "../utils/logger.js";

var _opts = {
    mode: 3
};
var _bs = null;
var _bsTs = 0;
var _defaultMode = 0;
var _capturedFor = null;
var _applied = false;

export function getBattleScreen()
{
    return _bs;
}

export function getBattleScreenTs()
{
    return _bsTs;
}

export function setCameraOptions(o)
{
    if (!o || typeof o !== "object") return;
    if (typeof o.mode === "number" && isFinite(o.mode))
    {
        const mode = o.mode | 0;
        _opts.mode = mode === 6 ? 6 : 3;
    }
}

export function ensureCameraMode()
{
    if ((_opts.mode | 0) === 0) _opts.mode = 3;
}

export function resetCamera()
{
    _bs = null;
    _bsTs = 0;
}

function captureDefaults(bs)
{
    _defaultMode = bs.add(offsets.BattleScreen_cameraMode).readS32() | 0;
    _capturedFor = bs;
    _applied = false;
    logInfo("camera default mode",
    {
        mode: _defaultMode
    });
}

export function setupCamera(base)
{
    Interceptor.attach(base.add(offsets.BattleScreen__updateCameraParameters),
    {
        onEnter(args)
        {
            const bs = args[0];
            if (!bs || bs.isNull()) return;
            _bs = bs;
            _bsTs = Date.now();
            try
            {
                if (!_capturedFor || !bs.equals(_capturedFor)) captureDefaults(bs);
                if (state.camera)
                {
                    if (!_applied) logInfo("camera mode applied",
                    {
                        mode: _opts.mode | 0,
                        previous: _defaultMode
                    });
                    bs.add(offsets.BattleScreen_cameraMode).writeS32(_opts.mode | 0);
                    _applied = true;
                }
                else if (_applied)
                {
                    bs.add(offsets.BattleScreen_cameraMode).writeS32(_defaultMode);
                    _applied = false;
                    logInfo("camera mode restored",
                    {
                        mode: _defaultMode
                    });
                }
            }
            catch (_)
            {}
        }
    });
}
