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

function mappedFromProc(name)
{
    try
    {
        const text = File.readAllText("/proc/self/maps");
        const needle = "/" + name.toLowerCase();
        for (const line of text.split("\n"))
        {
            const path = line.slice(line.lastIndexOf(" ") + 1).trim();
            if (!path.toLowerCase().endsWith(needle)) continue;
            const parts = line.split(/\s+/);
            if (parts.length < 3 || parts[2] !== "00000000") continue;
            const start = parts[0].split("-")[0];
            return {
                name,
                path,
                base: ptr("0x" + start),
                size: 0
            };
        }
    }
    catch (_)
    {}
    return null;
}
export function engineModule()
{
    return Process.findModuleByName("libg.so") || mappedModule("libg.so") || mappedFromProc("libg.so");
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
