var _base = null;

function mappedModule(name)
{
    const suffix = "/" + name.toLowerCase();
    try
    {
        for (const range of Process.enumerateRanges(
            {
                protection: "r--",
                coalesce: false
            }))
        {
            const path = range.file && range.file.path;
            if (typeof path !== "string" || range.file.offset !== 0) continue;
            if (path.toLowerCase().endsWith(suffix))
            {
                return {
                    name,
                    path,
                    base: range.base,
                    size: range.size
                };
            }
        }
    }
    catch (_)
    {}
    return null;
}
export function engineModule()
{
    return Process.findModuleByName("libg.so") || mappedModule("libg.so");
}
export function libg(intervalMs = 50)
{
    if (_base) return Promise.resolve(_base);
    let mod = engineModule();
    if (mod)
    {
        _base = mod.base;
        return Promise.resolve(_base);
    }
    return new Promise((resolve) =>
    {
        const id = setInterval(() =>
        {
            mod = engineModule();
            if (mod)
            {
                clearInterval(id);
                _base = mod.base;
                resolve(_base);
            }
        }, intervalMs);
    });
}
