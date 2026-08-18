import
{
    offsets
}
from "./offsets.js";
import
{
    withScString
}
from "./scstring.js";

var _base = null;

export function initDataTables(base)
{
    _base = base;
}

export function getDataTable(index)
{
    if (!_base) return null;
    try
    {
        const slot = _base.add(offsets.LogicDataTables_tableArray).add(index * Process.pointerSize);
        const table = slot.readPointer();
        return table.isNull() ? null : table;
    }
    catch (_)
    {
        return null;
    }
}

export function findDataByName(table, name)
{
    try
    {
        const lookup = table.readPointer().add(offsets.LogicDataTable_findByName).readPointer();
        if (lookup.isNull()) return null;
        const call = new NativeFunction(lookup, "pointer", ["pointer", "pointer", "pointer"]);
        const item = withScString(name, (sc) => call(table, sc, NULL));
        return item && !item.isNull() ? item : null;
    }
    catch (_)
    {
        return null;
    }
}
