import
{
    findSwapBuffers,
    setSwapInterval
}
from "../core/egl.js";
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

const UNLOCKED_FPS = 9999;
const DEFAULT_FPS = 60;
const KEEP_MS = 250;

var _base = null;
var _attached = false;
var _mgr = null;
var _keep = null;
var _swaps = 0;
var _hzAt = 0;
var _swapHz = 0;
var _interval = -1;
var _wasOn = false;

function _readTarget()
{
    if (!_base) return null;
    try
    {
        return _base.add(offsets.FramerateManager_targetFps).readDouble();
    }
    catch (_)
    {
        return null;
    }
}

function _writeTarget(fps)
{
    if (!_base) return;
    try
    {
        _base.add(offsets.FramerateManager_targetFps).writeDouble(fps);
    }
    catch (_)
    {}
}

function _writeMgr(mgr, fps)
{
    if (!mgr || mgr.isNull()) return;
    try
    {
        mgr.writeDouble(fps);
        mgr.add(328).writeDouble(fps);
    }
    catch (_)
    {}
}

function _apply(fps)
{
    _writeTarget(fps);
    _writeMgr(_mgr, fps);
}

function _wanted()
{
    return state.fpsunlock ? UNLOCKED_FPS : DEFAULT_FPS;
}

function _sync()
{
    const enabled = !!state.fpsunlock;
    if (enabled) _wasOn = true;
    else if (_wasOn)
    {
        _wasOn = false;
        _apply(DEFAULT_FPS);
        _interval = -1;
        return;
    }
    else return;
    if (_readTarget() !== UNLOCKED_FPS) _apply(UNLOCKED_FPS);
}

function _startKeep()
{
    if (_keep) return;
    _keep = setInterval(function()
    {
        _sync();
        const now = Date.now();
        if (!_hzAt) _hzAt = now;
        if (now - _hzAt >= 1000)
        {
            _swapHz = _swaps;
            _swaps = 0;
            _hzAt = now;
        }
        logEvery(60, "fpsunlock sample",
        {
            enabled: !!state.fpsunlock,
            swapHz: _swapHz,
            target: _readTarget(),
            mgr: _mgr ? 1 : 0
        });
    }, KEEP_MS);
}

export function setupFpsUnlock(base)
{
    if (_attached)
    {
        if (state.fpsunlock) _apply(UNLOCKED_FPS);
        else _apply(DEFAULT_FPS);
        logInfo("fpsunlock apply",
        {
            enabled: !!state.fpsunlock,
            target: _readTarget()
        });
        return;
    }
    _base = base;
    Interceptor.attach(base.add(offsets.FramerateManager__setSegment),
    {
        onEnter(args)
        {
            _mgr = args[0];
            if (state.fpsunlock) args[1] = ptr(2);
        },
        onLeave()
        {
            if (state.fpsunlock) _apply(UNLOCKED_FPS);
        }
    });
    Interceptor.attach(base.add(offsets.FramerateManager__setLimit),
    {
        onEnter(args)
        {
            _mgr = args[0];
            if (state.fpsunlock) _apply(UNLOCKED_FPS);
        }
    });
    const swap = findSwapBuffers();
    if (swap)
    {
        Interceptor.attach(swap,
        {
            onEnter(args)
            {
                _swaps++;
                const enabled = !!state.fpsunlock;
                const interval = enabled ? 0 : 1;
                if (enabled) _apply(UNLOCKED_FPS);
                if (_interval !== interval)
                {
                    _interval = interval;
                    setSwapInterval(args[0], interval);
                }
            }
        });
    }
    _startKeep();
    _attached = true;
    if (state.fpsunlock) _apply(UNLOCKED_FPS);
    logInfo("fpsunlock attached",
    {
        enabled: !!state.fpsunlock,
        swap: swap ? 1 : 0,
        target: _readTarget()
    });
}

export function resetFpsUnlock()
{
    _wasOn = false;
    _interval = -1;
    _apply(DEFAULT_FPS);
    logInfo("fpsunlock reset",
    {
        target: _readTarget()
    });
}
