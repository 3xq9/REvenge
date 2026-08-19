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

const MAX_MAP_TILES = 120;
const MAX_TOTAL_TILES = MAX_MAP_TILES * MAX_MAP_TILES;
const RETRY_MS = 2e3;
export const TILE_SIZE = 300;
export const BLOCKS_MOVEMENT = 128;
export const BLOCKS_PROJECTILES = 64;
const TRACE_STEP = 40;
const TRACE_BACKOFF = 75;

var walls = null;
var wallsWidth = 0;
var wallsHeight = 0;
var needsRebuild = true;
var lastFailedTs = 0;
var tileWatchInstalled = false;

function _validPtr(value)
{
    return value && !value.isNull();
}

function ptrFromU32(lo, hi)
{
    if (!lo && !hi) return ptr(0);
    return ptr("0x" + (hi >>> 0).toString(16).padStart(8, "0") + (lo >>> 0).toString(16).padStart(8, "0"));
}

function _rebuildFrom(tileMap)
{
    if (!_validPtr(tileMap)) return false;
    try
    {
        const width = tileMap.add(offsets.TileMap_Width).readS32();
        const height = tileMap.add(offsets.TileMap_Height).readS32();
        if (width <= 0 || width > MAX_MAP_TILES || height <= 0 || height > MAX_MAP_TILES) return false;
        const total = width * height;
        if (total > MAX_TOTAL_TILES) return false;
        const tiles = tileMap.add(offsets.TileMap_TilesArray).readPointer();
        if (!_validPtr(tiles)) return false;

        const pointerSize = Process.pointerSize;
        const raw = tiles.readByteArray(total * pointerSize);
        if (!raw) return false;
        const view = new DataView(raw);
        const grid = new Uint8Array(total);
        const flagsByType = new Map();

        for (let i = 0; i < total; i++)
        {
            const lo = view.getUint32(i * pointerSize, true);
            const hi = view.getUint32(i * pointerSize + 4, true);
            if (lo === 0 && hi === 0) continue;
            const tile = ptrFromU32(lo, hi);
            let tileType;
            try
            {
                tileType = tile.readPointer();
            }
            catch (_)
            {
                continue;
            }
            if (!_validPtr(tileType)) continue;
            const key = tileType.toString();
            let flags = flagsByType.get(key);
            if (flags === void 0)
            {
                flags = 0;
                try
                {
                    const packed = tileType.add(offsets.TileTypeData_BlocksMovement).readU16();
                    if (packed & 0xff) flags |= BLOCKS_MOVEMENT;
                    if (packed >> 8) flags |= BLOCKS_PROJECTILES;
                }
                catch (_)
                {}
                flagsByType.set(key, flags);
            }
            grid[i] = flags;
        }

        walls = grid;
        wallsWidth = width;
        wallsHeight = height;
        needsRebuild = false;
        return true;
    }
    catch (_)
    {
        return false;
    }
}

export function notifyBattleModeChanged(battleMode)
{
    walls = null;
    wallsWidth = 0;
    wallsHeight = 0;
    needsRebuild = true;
    lastFailedTs = 0;
    maybeRefreshWallCache(battleMode, Date.now());
}

export function maybeRefreshWallCache(battleMode, now)
{
    if (!needsRebuild || !_validPtr(battleMode)) return;
    if (now === void 0) now = Date.now();
    if (now - lastFailedTs < RETRY_MS) return;
    try
    {
        const tileMap = getFunctions().LogicBattleModeClient_getTileMap(battleMode);
        if (_rebuildFrom(tileMap)) return;
    }
    catch (_)
    {}
    lastFailedTs = now;
}

export function watchTileChanges(base)
{
    if (tileWatchInstalled) return;
    try
    {
        Interceptor.attach(base.add(offsets.LogicTile__setData),
        {
            onEnter()
            {
                needsRebuild = true;
            }
        });
        tileWatchInstalled = true;
    }
    catch (_)
    {}
}

export function getWallCacheW()
{
    return wallsWidth;
}

export function getWallCacheH()
{
    return wallsHeight;
}

export function losCheck(wx0, wy0, wx1, wy1, checkBit)
{
    const grid = walls;
    if (!grid) return true;
    const width = wallsWidth;
    const height = wallsHeight;
    let cx = wx0 / TILE_SIZE | 0;
    let cy = wy0 / TILE_SIZE | 0;
    const tx = wx1 / TILE_SIZE | 0;
    const ty = wy1 / TILE_SIZE | 0;
    if (cx === tx && cy === ty) return true;
    const dx = Math.abs(tx - cx);
    const dy = -Math.abs(ty - cy);
    const sx = cx < tx ? 1 : -1;
    const sy = cy < ty ? 1 : -1;
    let err = dx + dy;
    const maxSteps = dx - dy + 2;
    for (let n = 0; n < maxSteps; n++)
    {
        const e2 = 2 * err;
        if (e2 >= dy)
        {
            err += dy;
            cx += sx;
        }
        if (e2 <= dx)
        {
            err += dx;
            cy += sy;
        }
        if (cx === tx && cy === ty) return true;
        if (cx < 0 || cx >= width || cy < 0 || cy >= height) continue;
        if (grid[cy * width + cx] & checkBit) return false;
    }
    return true;
}

export function traceWallHit(wx, wy, dirX, dirY, maxDist, checkBit)
{
    const grid = walls;
    if (!grid || maxDist <= 0) return maxDist;
    const width = wallsWidth;
    const height = wallsHeight;
    if (width <= 0 || height <= 0) return maxDist;
    let dist = 0;
    while (dist < maxDist)
    {
        dist += TRACE_STEP;
        if (dist > maxDist) dist = maxDist;
        const tx = (wx + dirX * dist) / TILE_SIZE | 0;
        const ty = (wy + dirY * dist) / TILE_SIZE | 0;
        if (tx < 0 || tx >= width || ty < 0 || ty >= height) return Math.max(0, dist - TRACE_BACKOFF);
        if (grid[ty * width + tx] & checkBit) return Math.max(0, dist - TRACE_BACKOFF);
    }
    return maxDist;
}

export function isBlockedAt(wx, wy, checkBit)
{
    const grid = walls;
    if (!grid) return false;
    const width = wallsWidth;
    const height = wallsHeight;
    if (width <= 0 || height <= 0) return false;
    const tx = wx / TILE_SIZE | 0;
    const ty = wy / TILE_SIZE | 0;
    if (tx < 0 || tx >= width || ty < 0 || ty >= height) return false;
    return !!(grid[ty * width + tx] & checkBit);
}

export function isBlockedWide(wx, wy, radius, checkBit)
{
    if (isBlockedAt(wx, wy, checkBit)) return true;
    const r = radius > 0 ? radius : 0;
    if (r <= 0) return false;
    return isBlockedAt(wx + r, wy, checkBit) || isBlockedAt(wx - r, wy, checkBit) || isBlockedAt(wx, wy + r, checkBit) || isBlockedAt(wx, wy - r, checkBit);
}

export function traceWallHitWide(wx, wy, dirX, dirY, maxDist, radius, checkBit)
{
    const grid = walls;
    if (!grid || maxDist <= 0) return maxDist;
    if (wallsWidth <= 0 || wallsHeight <= 0) return maxDist;
    let dist = 0;
    while (dist < maxDist)
    {
        dist += TRACE_STEP;
        if (dist > maxDist) dist = maxDist;
        if (isBlockedWide(wx + dirX * dist, wy + dirY * dist, radius, checkBit)) return Math.max(0, dist - TRACE_BACKOFF);
    }
    return maxDist;
}
