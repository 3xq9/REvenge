import
{
    loadCSV
}
from "../core/csv.js";
import
{
    findDataByName,
    getDataTable
}
from "../core/dataTables.js";
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
    readScString,
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

const GRADIENT_CSV = "csv_client/color_gradients.csv";
const MAX_GRADIENT_ROWS = 512;
const DECORATED_MARKER = 726355;
const MAX_WALK_NODES = 8192;
const MAX_WALK_DEPTH = 16;
const MAX_TRACKED_FIELDS = 128;
const MAX_NAME_FIELDS = 16;
const NAME_ISOLATE_PREFIX = "\u2068";

var _base = null;
var _setupDecorated = null;
var _gradients = new Map();
var _names = [];
var _tracked = new Map();
var _nameFields = new Set();
var _pending = [];
var _selectedName = "";
var _inReapply = false;

function _isDecoratedField(field)
{
    try
    {
        if (!field.readPointer().equals(_base.add(offsets.VTABLE_DECORATED_TEXT_FIELD))) return false;
        return field.add(offsets.DecoratedTextField_marker).readU32() === DECORATED_MARKER;
    }
    catch (_)
    {
        return false;
    }
}

function _fieldGradient(field)
{
    try
    {
        return field.add(offsets.DecoratedTextField_gradient).readPointer();
    }
    catch (_)
    {
        return NULL;
    }
}

function _fieldText(field)
{
    try
    {
        return readScString(field.add(offsets.DecoratedTextField_text));
    }
    catch (_)
    {
        return null;
    }
}

function _track(field, gradient)
{
    if (_tracked.size >= MAX_TRACKED_FIELDS) return;
    const key = field.toString();
    if (_tracked.has(key) || !_isDecoratedField(field)) return;
    _tracked.set(key, gradient || NULL);
}

function _collectDecorated()
{
    const found = [];
    let stage;
    try
    {
        stage = _base.add(offsets.StageInstanceGlobalPtr).readPointer();
        if (!stage || stage.isNull()) return found;
    }
    catch (_)
    {
        return found;
    }
    const queue = [
    {
        node: stage.add(offsets.Stage_spriteContainer).readPointer(),
        depth: 0
    }];
    let visited = 0;
    while (queue.length && visited < MAX_WALK_NODES)
    {
        const
        {
            node,
            depth
        } = queue.shift();
        if (!node || node.isNull() || depth > MAX_WALK_DEPTH) continue;
        visited++;
        if (_isDecoratedField(node)) found.push(node);
        try
        {
            const count = node.add(offsets.Sprite_childCount).readU16();
            if (count === 0 || count > 512) continue;
            const children = node.add(offsets.Sprite_childArray).readPointer();
            if (!children || children.isNull()) continue;
            for (let i = 0; i < count; i++)
            {
                queue.push(
                {
                    node: children.add(i * Process.pointerSize).readPointer(),
                    depth: depth + 1
                });
            }
        }
        catch (_)
        {}
    }
    return found;
}

function _trackVisibleFields()
{
    for (const field of _collectDecorated()) _track(field, _fieldGradient(field));
}

function _catalogNames()
{
    const table = loadCSV(GRADIENT_CSV);
    if (!table) return [];
    const count = table.getRowCount();
    if (count <= 0 || count > MAX_GRADIENT_ROWS) return [];
    const names = [];
    for (let i = 0; i < count; i++)
    {
        const row = table.getRowAt(i);
        if (!row) continue;
        const name = row.getName();
        if (name) names.push(name);
    }
    return names;
}

function _ensureDiscovered()
{
    if (_gradients.size > 0) return;
    if (_names.length === 0) _names = _catalogNames();
    if (_names.length === 0 || !_base) return;
    const table = getDataTable(offsets.GRADIENT_TABLE_INDEX);
    if (!table)
    {
        logInfo("gradient table not ready");
        return;
    }
    for (const name of _names)
    {
        const item = findDataByName(table, name);
        if (item) _gradients.set(name, item);
    }
    logInfo("gradient table read",
    {
        names: _names.length,
        resolved: _gradients.size
    });
}

function _decorate(field, gradient)
{
    const text = _fieldText(field);
    if (text === null) return null;
    _inReapply = true;
    try
    {
        return withScString(text, (scText) => _setupDecorated(field, scText, gradient));
    }
    finally
    {
        _inReapply = false;
    }
}

function _isPlainTextField(field)
{
    try
    {
        return field.readPointer().equals(_base.add(offsets.VTABLE_TEXT_FIELD));
    }
    catch (_)
    {
        return false;
    }
}

function _hasMovieClipParent(field)
{
    try
    {
        const parent = field.add(offsets.DisplayObject_parent).readPointer();
        if (parent.isNull()) return false;
        const predicate = parent.readPointer().add(offsets.DisplayObject_isMovieClipSlot).readPointer();
        return new NativeFunction(predicate, "int", ["pointer"])(parent) !== 0;
    }
    catch (_)
    {
        return false;
    }
}

function _rememberNameField(field)
{
    const key = field.toString();
    if (_nameFields.has(key)) return;
    if (_nameFields.size >= MAX_NAME_FIELDS)
    {
        for (const known of _nameFields)
        {
            if (!_isPlainTextField(ptr(known)) && !_isDecoratedField(ptr(known))) _nameFields.delete(known);
        }
        if (_nameFields.size >= MAX_NAME_FIELDS) return;
    }
    _nameFields.add(key);
    _pending.push(key);
}

function _hideDuplicateNames(parent, keep, text)
{
    try
    {
        const count = parent.add(offsets.Sprite_childCount).readU16();
        if (count === 0 || count > 512) return;
        const children = parent.add(offsets.Sprite_childArray).readPointer();
        if (children.isNull()) return;
        for (let i = 0; i < count; i++)
        {
            const child = children.add(i * Process.pointerSize).readPointer();
            if (child.equals(keep) || !_isDecoratedField(child) || _fieldText(child) !== text) continue;
            child.add(offsets.DisplayObject_visible).writeU8(0);
            _tracked.delete(child.toString());
            _nameFields.delete(child.toString());
        }
    }
    catch (_)
    {}
}

function _convertNameField(field)
{
    if (_isDecoratedField(field))
    {
        _track(field, NULL);
        return;
    }
    const gradient = _selectedGradient();
    if (!gradient || !_isPlainTextField(field) || !_hasMovieClipParent(field)) return;
    const parent = field.add(offsets.DisplayObject_parent).readPointer();
    const text = _fieldText(field);
    const decorated = _decorate(field, gradient);
    if (!decorated || decorated.isNull()) return;
    _hideDuplicateNames(parent, decorated, text);
    _nameFields.delete(field.toString());
    _nameFields.add(decorated.toString());
    _track(decorated, NULL);
}

function _drainPending(currentField)
{
    if (_pending.length === 0) return;
    const current = currentField.toString();
    for (let i = _pending.length - 1; i >= 0; i--)
    {
        const key = _pending[i];
        if (key === current) continue;
        _pending.splice(i, 1);
        _convertNameField(ptr(key));
    }
}

function _selectedGradient()
{
    if (!state.gradient) return null;
    return _gradients.get(_selectedName) || null;
}

export function listGradients()
{
    _ensureDiscovered();
    return _names.slice();
}

export function setGradientOptions(o)
{
    if (!o || typeof o !== "object" || typeof o.name !== "string") return;
    _selectedName = o.name;
    _ensureDiscovered();
    logInfo("gradient selected",
    {
        requested: o.name,
        known: _gradients.size
    });
    applyGradientAll();
}

export function applyGradientAll()
{
    if (!_setupDecorated || _inReapply) return;
    if (state.gradient) _ensureDiscovered();
    if (_tracked.size === 0) _trackVisibleFields();
    for (const key of _nameFields)
    {
        if (_pending.indexOf(key) === -1) _pending.push(key);
    }
    const gradient = _selectedGradient();
    for (const [key, original] of _tracked)
    {
        const field = ptr(key);
        if (!_isDecoratedField(field))
        {
            _tracked.delete(key);
            continue;
        }
        const wanted = gradient || original;
        if (_fieldGradient(field).equals(wanted)) continue;
        _decorate(field, wanted);
    }
}

export function resetGradient()
{
    _tracked.clear();
    _nameFields.clear();
    _pending.length = 0;
}

export function setupGradient(base)
{
    if (_setupDecorated) return;
    _base = base;
    _setupDecorated = getFunctions().Name_setupDecorated;

    Interceptor.attach(base.add(offsets.Name_applyDecoration),
    {
        onEnter(args)
        {
            if (_inReapply) return;
            _track(args[0], args[2]);
            const gradient = _selectedGradient();
            if (gradient) args[2] = gradient;
        }
    });

    Interceptor.attach(base.add(offsets.TextField_setText),
    {
        onEnter(args)
        {
            if (_inReapply) return;
            _drainPending(args[0]);
            let text;
            try
            {
                text = readScString(args[1]);
            }
            catch (_)
            {
                return;
            }
            if (text === null || text.charAt(0) !== NAME_ISOLATE_PREFIX) return;
            _rememberNameField(args[0]);
        }
    });
}
