import
{
    engineModule
}
from "./libs.js";

var _hookCb = null;

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

export function findSwapBuffers()
{
    for (const name of ["libEGL.so", "libEGL.so.1"])
    {
        try
        {
            const mod = Process.findModuleByName(name);
            const address = mod && mod.findExportByName("eglSwapBuffers");
            if (address) return address;
        }
        catch (_)
        {}
    }
    try
    {
        for (const mod of Process.enumerateModules())
        {
            if (!/libEGL(?:\.so(?:\.\d+)?)?$/i.test(mod.name)) continue;
            const address = mod.findExportByName("eglSwapBuffers");
            if (address) return address;
        }
    }
    catch (_)
    {}
    return null;
}

export function attachSwapBuffers(eglReal, onSwap)
{
    try
    {
        Interceptor.attach(eglReal,
        {
            onEnter: onSwap
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
        onSwap();
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
    const swapBuffers = findSwapBuffers();
    if (!swapBuffers) return false;
    return patchSwapBuffersGOT(swapBuffers, onSwap) || attachSwapBuffers(swapBuffers, onSwap);
}
