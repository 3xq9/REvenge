import
{
    offsets
}
from "./offsets.js";
import
{
    getFunctions
}
from "./functions.js";

const INLINE_MAX_LENGTH = 7;
const DEFAULT_MAX_LENGTH = 256;
const SCSTRING_SIZE = 32;

export function readScString(value, maxLength = DEFAULT_MAX_LENGTH)
{
    try
    {
        if (!value || value.isNull()) return null;
        const length = value.add(offsets.ScString_length).readS32();
        if (length <= 0 || length > maxLength) return null;
        const data = length <= INLINE_MAX_LENGTH ?
            value.add(offsets.ScString_data) :
            value.add(offsets.ScString_data).readPointer();
        if (!data || data.isNull()) return null;
        return data.readUtf8String(length);
    }
    catch (_)
    {
        return null;
    }
}

export function withScString(text, fn)
{
    const fns = getFunctions();
    if (!fns.StringCtor || !fns.ScString_destruct) return null;
    const sc = Memory.alloc(SCSTRING_SIZE);
    fns.StringCtor(sc, Memory.allocUtf8String(text));
    try
    {
        return fn(sc);
    }
    finally
    {
        fns.ScString_destruct(sc);
    }
}
