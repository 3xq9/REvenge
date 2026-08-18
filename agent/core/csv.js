import
{
    offsets
}
from "./offsets.js";
import
{
    readScString,
    withScString
}
from "./scstring.js";

var _getValueAt = null;
var _getIntegerValueAt = null;
var _getRowName = null;
var _getCSV = null;
var ROW_TABLE_ARRAY_PTR = 72;
var ROW_TABLE_ROW_STRIDE = 8;
var ROW_TABLE_ROW_COUNT = 84;
var _csvCache = new Map();
export function initCSV(base)
{
    _getValueAt = new NativeFunction(
        base.add(offsets.CSVRow__getValueAt),
        "pointer",
        ["pointer", "int"]
    );
    _getIntegerValueAt = new NativeFunction(
        base.add(offsets.CSVRow__getIntegerValueAt),
        "int",
        ["pointer", "int"]
    );
    _getRowName = new NativeFunction(
        base.add(offsets.CSVRow__getName),
        "pointer",
        ["pointer"]
    );
    _getCSV = new NativeFunction(
        base.add(offsets.ResourceManager__getCSV),
        "pointer",
        ["pointer"]
    );
}

var CSVRow = class
{
    constructor(pointer)
    {
        this.ptr = pointer;
    }
    getValueAt(column)
    {
        return readScString(_getValueAt(this.ptr, column));
    }
    getIntegerValueAt(column)
    {
        return _getIntegerValueAt(this.ptr, column);
    }
    getName()
    {
        return readScString(_getRowName(this.ptr));
    }
};
var CSVTable = class
{
    constructor(pointer)
    {
        this.ptr = pointer;
    }
    getRowAt(index)
    {
        try
        {
            const rowsArray = this.ptr.add(ROW_TABLE_ARRAY_PTR).readPointer();
            const rowPtr = rowsArray.add(ROW_TABLE_ROW_STRIDE * index).readPointer();
            if (!rowPtr || rowPtr.isNull()) return null;
            return new CSVRow(rowPtr);
        }
        catch (_)
        {
            return null;
        }
    }
    getRowCount()
    {
        try
        {
            return this.ptr.add(ROW_TABLE_ROW_COUNT).readS32();
        }
        catch (_)
        {
            return 0;
        }
    }
};
export function loadCSV(filename)
{
    if (!_getCSV) return null;
    const cached = _csvCache.get(filename);
    if (cached) return cached;
    try
    {
        const table = withScString(filename, (sc) =>
        {
            const nodePtr = _getCSV(sc);
            if (!nodePtr || nodePtr.isNull()) return null;
            const tablePtr = nodePtr.readPointer();
            if (!tablePtr || tablePtr.isNull()) return null;
            return new CSVTable(tablePtr);
        });
        if (table) _csvCache.set(filename, table);
        return table;
    }
    catch (_)
    {
        return null;
    }
}
