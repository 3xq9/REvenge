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
    state
}
from "../utils/flags.js";
import
{
    logInfo
}
from "../utils/logger.js";

const SAMPLE_WINDOW_MS = 1e3;
const EMIT_MS = 250;
const DEFAULT_POS_X = 570;
const DEFAULT_POS_Y = 80;
const LABEL_SCALE = 1.4;
const SC_FILE = "sc/ui.sc";
const SC_EXPORT = "damage_number";
const TEXT_FIELD = "txt";
const CONTAINER_SIZE = 208;

var _base = null;
var _isResourceLoaded = null;
var _containerCtor = null;
var _getTextFieldByName = null;
var _stageAddChild = null;
var _setText = null;
var _fileName = null;
var _textFieldName = null;
var _container = null;
var _textField = null;
var _posX = DEFAULT_POS_X;
var _posY = DEFAULT_POS_Y;
var _lastText = null;
var _wasOn = false;
var _samples = [];
var _lastEmit = 0;

function _stage()
{
    try
    {
        const stage = _base.add(offsets.StageInstanceGlobalPtr).readPointer();
        return stage && !stage.isNull() ? stage : null;
    }
    catch (_)
    {
        return null;
    }
}

function _build()
{
    const stage = _stage();
    if (!stage) return false;
    const resource = _isResourceLoaded(_fileName, 0);
    if (!resource || resource.isNull()) return false;

    const container = getFunctions().operator_new(CONTAINER_SIZE);
    if (!container || container.isNull()) return false;

    withScString(SC_FILE, (file) =>
        withScString(SC_EXPORT, (exportName) => _containerCtor(container, file, exportName)));

    const movieClip = container.add(offsets.DropGUIContainer_movieClip).readPointer();
    if (!movieClip || movieClip.isNull()) return false;
    const textField = _getTextFieldByName(movieClip, _textFieldName);
    if (!textField || textField.isNull()) return false;

    movieClip.add(offsets.DisplayObject_visible).writeU8(1);
    container.add(offsets.DisplayObject_scaleX).writeFloat(LABEL_SCALE);
    container.add(offsets.DisplayObject_scaleY).writeFloat(LABEL_SCALE);
    _stageAddChild(stage, container);

    _container = container;
    _textField = textField;
    _lastText = null;
    logInfo("fps label attached");
    return true;
}

function _show(text)
{
    if (!_container && !_build()) return;
    _container.add(offsets.DisplayObject_x).writeFloat(_posX);
    _container.add(offsets.DisplayObject_y).writeFloat(_posY);
    _container.add(offsets.DisplayObject_visible).writeU8(1);
    if (text === _lastText) return;
    withScString(text, (sc) => _setText(_textField, sc));
    _lastText = text;
}

function _hide()
{
    if (!_container) return;
    _container.add(offsets.DisplayObject_visible).writeU8(0);
    _lastText = null;
}

export function setFpsOptions(opts)
{
    if (!opts || typeof opts !== "object") return;
    if (typeof opts.x === "number" && isFinite(opts.x))
    {
        _posX = Math.max(-200, Math.min(3e3, opts.x | 0));
    }
    if (typeof opts.y === "number" && isFinite(opts.y))
    {
        _posY = Math.max(-200, Math.min(3e3, opts.y | 0));
    }
}

export function setupFps(base)
{
    if (_containerCtor) return;
    _base = base;
    const fns = getFunctions();
    _isResourceLoaded = fns.ResourceManager_isResourceLoaded;
    _containerCtor = fns.DropGUIContainer_ctorFromExport;
    _getTextFieldByName = fns.MovieClip_getTextFieldByName;
    _stageAddChild = fns.Stage_addChild;
    _setText = fns.TextField_setText;
    _fileName = Memory.allocUtf8String(SC_FILE);
    _textFieldName = Memory.allocUtf8String(TEXT_FIELD);

    Interceptor.attach(base.add(offsets.GameMain__update),
    {
        onEnter()
        {
            try
            {
                if (!state.fps)
                {
                    if (_wasOn)
                    {
                        _wasOn = false;
                        _samples.length = 0;
                        _lastEmit = 0;
                        _hide();
                    }
                    return;
                }
                const now = Date.now();
                if (!_wasOn)
                {
                    _wasOn = true;
                    _samples.length = 0;
                    _lastEmit = now;
                }
                _samples.push(now);
                while (_samples.length && now - _samples[0] > SAMPLE_WINDOW_MS) _samples.shift();
                if (now - _lastEmit < EMIT_MS) return;
                _lastEmit = now;
                _show("FPS: " + (_samples.length | 0));
            }
            catch (_)
            {}
        }
    });
}

export function resetFps()
{
    _samples.length = 0;
    _lastEmit = 0;
    _wasOn = false;
    _hide();
}
