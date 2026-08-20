import
{
    engineModule
}
from "./libs.js";

var _hookCb = null;
var _swapListeners = [];
var _swapHooked = false;
var _swapInterval = null;

function _parseGOTFromPLT(pltAddr)
{
    try
    {
        const insn0 = pltAddr.readU32();
        const insn1 = pltAddr.add(4).readU32();
        if ((insn0 >>> 24 & 159) !== 144) return null;
        const immlo = insn0 >>> 29 & 3;
        const immhi = insn0 >>> 5 & 524287;
        const imm21 = immhi << 2 | immlo;
        const signed = imm21 & 1048576 ? imm21 - 2097152 : imm21;
        const imm12 = insn1 >>> 10 & 4095;
        const ldrOff = imm12 * 8;
        const pcPage = ptr(pltAddr).and(ptr("0xFFFFFFFFFFFFF000"));
        const gotPage = signed >= 0 ? pcPage.add(signed * 4096) : pcPage.sub(-signed * 4096);
        return gotPage.add(ldrOff);
    }
    catch (_)
    {
        return null;
    }
}

function _scanGOT(libgMod, eglReal)
{
    const tmp = Memory.alloc(8);
    tmp.writePointer(eglReal);
    const patBytes = [];
    for (let i = 0; i < 8; i++) patBytes.push(tmp.add(i).readU8().toString(16).padStart(2, "0"));
    const pattern = patBytes.join(" ");
    const libgEnd = libgMod.base.add(libgMod.size);
    for (const prot of ["r--", "rw-"])
    {
        for (const range of Process.enumerateRanges(prot))
        {
            if (range.base.compare(libgMod.base) < 0 || range.base.compare(libgEnd) >= 0) continue;
            const hits = Memory.scanSync(range.base, range.size, pattern);
            if (hits.length > 0) return hits[0].address;
        }
    }
    return null;
}

function _eglFromMaps()
{
    try
    {
        const text = File.readAllText("/proc/self/maps");
        for (const line of text.split("\n"))
        {
            if (!/\/libEGL\.so(?:\.\d+)?$/i.test(line)) continue;
            const start = line.split("-")[0];
            const mod = Process.findModuleByAddress(ptr("0x" + start));
            if (mod) return mod;
        }
    }
    catch (_)
    {}
    return null;
}

export function findEglExport(name)
{
    const modules = [];
    for (const so of ["libEGL.so", "libEGL.so.1"])
    {
        try
        {
            const mod = Process.findModuleByName(so);
            if (mod) modules.push(mod);
        }
        catch (_)
        {}
    }
    try
    {
        for (const mod of Process.enumerateModules())
        {
            if (/libEGL(?:\.so(?:\.\d+)?)?$/i.test(mod.name)) modules.push(mod);
        }
    }
    catch (_)
    {}
    const mapped = _eglFromMaps();
    if (mapped) modules.push(mapped);
    for (const mod of modules)
    {
        try
        {
            const address = mod.findExportByName(name);
            if (address) return address;
        }
        catch (_)
        {}
    }
    try
    {
        const address = Module.findExportByName(null, name);
        if (address) return address;
    }
    catch (_)
    {}
    return null;
}

export function findSwapBuffers()
{
    return findEglExport("eglSwapBuffers");
}

function _dispatchSwap(dpy, surface)
{
    for (let i = 0; i < _swapListeners.length; i++)
    {
        try
        {
            _swapListeners[i](dpy, surface);
        }
        catch (_)
        {}
    }
}

export function setSwapInterval(dpy, interval)
{
    if (!dpy || dpy.isNull()) return false;
    if (!_swapInterval)
    {
        const address = findEglExport("eglSwapInterval");
        if (!address) return false;
        _swapInterval = new NativeFunction(address, "int", ["pointer", "int"]);
    }
    try
    {
        _swapInterval(dpy, interval | 0);
        return true;
    }
    catch (_)
    {
        return false;
    }
}

export function attachSwapBuffers(eglReal, onSwap)
{
    try
    {
        Interceptor.attach(eglReal,
        {
            onEnter(args)
            {
                onSwap(args[0], args[1]);
            }
        });
        return true;
    }
    catch (_)
    {
        return false;
    }
}

export function patchSwapBuffersGOT(eglReal, onSwap)
{
    const libgMod = engineModule();
    if (!libgMod) return false;
    const pltEntry = libgMod.enumerateImports().find((i) => i.name === "eglSwapBuffers");
    if (!pltEntry) return false;
    let slot = _parseGOTFromPLT(pltEntry.address);
    let valid = false;
    try
    {
        valid = slot && slot.readPointer().compare(eglReal) === 0;
    }
    catch (_)
    {}
    if (!valid) slot = _scanGOT(libgMod, eglReal);
    if (!slot) return false;
    const origFn = new NativeFunction(eglReal, "uint", ["pointer", "pointer"]);
    _hookCb = new NativeCallback(function(dpy, surface)
    {
        onSwap(dpy, surface);
        return origFn(dpy, surface);
    }, "uint", ["pointer", "pointer"]);
    try
    {
        Memory.protect(slot, Process.pointerSize, "rw-");
    }
    catch (_)
    {}
    slot.writePointer(_hookCb);
    return true;
}

export function hookSwapBuffers(onSwap)
{
    if (typeof onSwap === "function") _swapListeners.push(onSwap);
    if (_swapHooked) return true;
    const swapBuffers = findSwapBuffers();
    if (!swapBuffers) return false;
    _swapHooked = patchSwapBuffersGOT(swapBuffers, _dispatchSwap) || attachSwapBuffers(swapBuffers, _dispatchSwap);
    return _swapHooked;
}
