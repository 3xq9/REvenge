import
{
    BLOCKS_PROJECTILES,
    losCheck,
    TILE_SIZE
}
from "../utils/wallCache.js";
import
{
    state
}
from "../utils/flags.js";
import
{
    offsets
}
from "../core/offsets.js";
import
{
    scanData
}
from "../core/scanner.js";
import
{
    getFunctions
}
from "../core/functions.js";
import
{
    readScString
}
from "../core/scstring.js";
import
{
    leadOf
}
from "../helpers/aim_lead.js";
import
{
    logEvery,
    logInfo
}
from "../utils/logger.js";
import
{
    canonBrawlerName
}
from "../utils/brawlerName.js";

var TUNE = {
    WATCH_MS: 80,
    STRIDE: 40,
    FLIGHT_CAP: 1.15,
    SPEED_PAD: 1.35,
    LOS_TTL_MS: 100,
    LOS_PURGE_MS: 500,
    FALLBACK_SPEED: 4000,
    FALLBACK_RADIUS: 300,
    CACHE_MS: 250
};
const SKIP_SKILLS = new Set([
    "ShamanUlti", "MechanicUlti", "ClusterBombDudeUlti", "ArcadeUlti", "ArtilleryDudeUlti",
    "SoulCollectorUlti", "MinigunDudeUlti", "KnightUlti", "DuplicatorUlti", "TwinsUlti",
    "SpawnerDudeUlti", "ConductorUlti", "MeepleUlti", "FleaUlti", "ReviverUlti", "VoodooUlti",
    "ShadowdemonUlti", "RollerUlti", "SniperUlti", "EnragerUlti", "PowerLevelerUlti",
    "DoorManUlti", "ConductorUltiSpawn"
]);

var _live = new Map();
var bestPtr = null;
var bestGid = null;
var _scrubTs = 0;
var _losMemo = new Map();
var _cacheTs = 0;
var _hyper = -1;
var _slots = {
    attack: null,
    super: null,
    gadget: null
};
var _shots = {
    attack: null,
    super: null,
    gadget: null
};
var _pendingLog = null;
var _opts = {
    onManualAim: true,
    onAutoshoot: true,
    useSuper: true,
    allowGadget: true,
    allowPlayers: true,
    allowSpawnables: true
};
var _superSet = new Set();

export function setAimbotOptions(o)
{
    if (!o || typeof o !== "object") return;
    if (typeof o.onManualAim === "boolean") _opts.onManualAim = o.onManualAim;
    if (typeof o.onAutoshoot === "boolean") _opts.onAutoshoot = o.onAutoshoot;
    if (typeof o.useSuper === "boolean") _opts.useSuper = o.useSuper;
    if (typeof o.allowGadget === "boolean") _opts.allowGadget = o.allowGadget;
    if (typeof o.allowPlayers === "boolean") _opts.allowPlayers = o.allowPlayers;
    if (typeof o.allowSpawnables === "boolean") _opts.allowSpawnables = o.allowSpawnables;
    if (Array.isArray(o.superBrawlers))
    {
        _superSet = new Set();
        for (const name of o.superBrawlers)
        {
            const id = canonBrawlerName(name);
            if (id) _superSet.add(id);
        }
    }
}

function _superOk(name)
{
    if (_superSet.size === 0) return true;
    return !!name && _superSet.has(name);
}

function _dataName(data)
{
    const fns = getFunctions();
    if (!fns.LogicData_getName || !data) return null;
    try
    {
        if (data.isNull()) return null;
        return readScString(fns.LogicData_getName(data), 64);
    }
    catch (_)
    {
        return null;
    }
}

function _selfName()
{
    return scanData.myBrawlerName;
}

function _same(a, b)
{
    if (!a || !b) return false;
    try
    {
        return !a.isNull() && !b.isNull() && a.equals(b);
    }
    catch (_)
    {
        return false;
    }
}

function _slotPtr(own, slot)
{
    try
    {
        const fns = getFunctions();
        if (!fns.LogicCharacterClient_getSkillAt || !own || own.isNull()) return null;
        const skill = fns.LogicCharacterClient_getSkillAt(own, slot);
        return skill && !skill.isNull() ? skill : null;
    }
    catch (_)
    {
        return null;
    }
}

function _emptyShot()
{
    return {
        skip: false,
        kind: "attack",
        reach: 0,
        vel: TUNE.FALLBACK_SPEED,
        rad: TUNE.FALLBACK_RADIUS,
        loft: !!scanData.throwsOverWalls,
        live: false,
        name: null
    };
}

function _shotOf(skill)
{
    const empty = _emptyShot();
    if (!skill || skill.isNull()) return empty;
    try
    {
        const fns = getFunctions();
        const name = _dataName(skill);
        if (name && SKIP_SKILLS.has(name)) return {
            skip: true,
            kind: "attack",
            reach: 0,
            vel: 0,
            rad: TUNE.FALLBACK_RADIUS,
            loft: false,
            live: false,
            name
        };
        let reach = 0;
        if (fns.LogicSkillData_getCastingRange)
        {
            const tiles = fns.LogicSkillData_getCastingRange(skill) | 0;
            if (tiles > 0) reach = tiles * 100;
        }
        let vel = 0;
        let rad = TUNE.FALLBACK_RADIUS;
        let loft = !!scanData.throwsOverWalls;
        if (fns.LogicSkillData_getProjectileData)
        {
            const projectile = fns.LogicSkillData_getProjectileData(skill, 0);
            if (projectile && !projectile.isNull())
            {
                vel = fns.LogicProjectileData_getSpeed(projectile) | 0;
                if (fns.LogicProjectileData_getRadius) rad = fns.LogicProjectileData_getRadius(projectile) | 0;
                if (rad <= 0) rad = TUNE.FALLBACK_RADIUS;
                try
                {
                    loft = (projectile.add(offsets.Projectile_isIndirect).readU32() | 0) !== 0;
                }
                catch (_)
                {}
            }
        }
        return {
            skip: false,
            kind: "attack",
            reach,
            vel: vel > 0 ? vel : TUNE.FALLBACK_SPEED,
            rad,
            loft,
            live: vel > 0,
            name
        };
    }
    catch (_)
    {
        return empty;
    }
}

function _readHyper(own)
{
    try
    {
        if (!own || own.isNull()) return 0;
        return own.add(offsets.LogicCharacterClient_hyperActive).readU8() !== 0 ? 1 : 0;
    }
    catch (_)
    {
        return 0;
    }
}

function _shotFromClient(client, hyper)
{
    try
    {
        const fns = getFunctions();
        if (!client || client.isNull() || !fns.LogicSkillClient_getData) return _emptyShot();
        return _shotOf(fns.LogicSkillClient_getData(client, hyper));
    }
    catch (_)
    {
        return _emptyShot();
    }
}

function _copyShot(shot, kind)
{
    const src = shot || _emptyShot();
    return {
        skip: !!src.skip,
        kind: kind || src.kind || "attack",
        reach: src.reach || 0,
        vel: src.vel || TUNE.FALLBACK_SPEED,
        rad: src.rad || TUNE.FALLBACK_RADIUS,
        loft: !!src.loft,
        live: !!src.live,
        name: src.name || null
    };
}

function _cacheShots(now)
{
    const own = scanData.ownCharacter;
    const hyper = _readHyper(own);
    if (now - _cacheTs < TUNE.CACHE_MS && hyper === _hyper && _shots.attack) return;
    _cacheTs = now;
    _hyper = hyper;
    if (!own || own.isNull()) return;
    try
    {
        const fns = getFunctions();
        _slots.attack = _slotPtr(own, 0);
        _slots.super = _slotPtr(own, 1);
        _slots.gadget = _slotPtr(own, 2);
        if (!_slots.gadget) _slots.gadget = _slotPtr(own, 5);
        const weapon = fns.LogicCharacterClient_getWeaponSkill ? fns.LogicCharacterClient_getWeaponSkill(own) : null;
        _shots.attack = weapon && !weapon.isNull() ? _shotOf(weapon) : _shotFromClient(_slots.attack, hyper);
        _shots.super = _shotFromClient(_slots.super, hyper);
        _shots.gadget = _shotFromClient(_slots.gadget, hyper);
        if (_shots.attack) _shots.attack.kind = "attack";
        if (_shots.super) _shots.super.kind = "super";
        if (_shots.gadget) _shots.gadget.kind = "gadget";
    }
    catch (_)
    {}
}

function _shotForClient(client)
{
    if (client && !client.isNull())
    {
        if (_same(client, _slots.super)) return _copyShot(_shots.super, "super");
        if (_same(client, _slots.gadget)) return _copyShot(_shots.gadget, "gadget");
    }
    return _copyShot(_shots.attack, "attack");
}

function _bearing(ax, ay, bx, by)
{
    return (Math.atan2(by - ay, bx - ax) * 180 / Math.PI + 360) % 360;
}

function _sight(x0, y0, x1, y1)
{
    const tx0 = x0 / TILE_SIZE | 0,
        ty0 = y0 / TILE_SIZE | 0,
        tx1 = x1 / TILE_SIZE | 0,
        ty1 = y1 / TILE_SIZE | 0;
    const key = (tx0 & 127) << 21 | (ty0 & 127) << 14 | (tx1 & 127) << 7 | ty1 & 127 | 0;
    const now = Date.now();
    const hit = _losMemo.get(key);
    if (hit !== void 0 && now - hit.ts < TUNE.LOS_TTL_MS) return hit.v;
    const v = losCheck(x0, y0, x1, y1, BLOCKS_PROJECTILES);
    _losMemo.set(key,
    {
        v,
        ts: now
    });
    return v;
}

function _motion(row, x, y, now)
{
    if (!row.markTs)
    {
        row.markTs = now;
        row.markX = x;
        row.markY = y;
        row.spd = 0;
        return;
    }
    const dt = now - row.markTs;
    if (dt < TUNE.WATCH_MS) return;
    const dx = x - row.markX;
    const dy = y - row.markY;
    const gone = Math.hypot(dx, dy);
    if (gone >= TUNE.STRIDE)
    {
        let spd = gone / (dt / 1000);
        if (!(row.gait > 0)) spd = 0;
        else
        {
            const cap = row.gait * TUNE.SPEED_PAD;
            if (spd > cap) spd = cap;
        }
        row.spd = spd;
        if (spd > 0) row.yaw = _bearing(row.markX, row.markY, x, y);
    }
    else
    {
        row.spd = 0;
    }
    row.markTs = now;
    row.markX = x;
    row.markY = y;
}

function _point(ox, oy, row, shot, lead)
{
    if (!row) return null;
    let x = row.x;
    let y = row.y;
    if (shot && shot.live && shot.vel > 0 && lead > 0 && row.spd > 0 && row.gait > 0)
    {
        const vel = shot.vel;
        const scale = lead / 100;
        let flight = Math.hypot(row.x - ox, row.y - oy) / vel;
        const pocket = (row.rad || 0) + (shot.rad || 0);
        if (row.spd * flight > pocket)
        {
            const rad = row.yaw * Math.PI / 180;
            const ux = Math.cos(rad);
            const uy = Math.sin(rad);
            for (let i = 0; i < 3; i++)
            {
                flight = Math.hypot(x - ox, y - oy) / vel;
                if (flight > TUNE.FLIGHT_CAP) flight = TUNE.FLIGHT_CAP;
                x = row.x + ux * row.spd * flight * scale;
                y = row.y + uy * row.spd * flight * scale;
            }
            if (!isFinite(x) || !isFinite(y))
            {
                x = row.x;
                y = row.y;
            }
        }
    }
    const reach = shot && shot.reach > 0 ? shot.reach : 0;
    if (reach > 0)
    {
        const dx = x - ox;
        const dy = y - oy;
        const dist = Math.hypot(dx, dy);
        const max = reach + (row.rad || 0);
        if (dist > max && dist > 1)
        {
            x = ox + dx * max / dist;
            y = oy + dy * max / dist;
        }
    }
    return {
        x: Math.round(x),
        y: Math.round(y)
    };
}

function _accept(tag)
{
    if (tag === "prop") return _opts.allowSpawnables;
    return _opts.allowPlayers;
}

function _nearest(ox, oy, shot)
{
    let foe = null;
    let foeCost = 1 / 0;
    let prop = null;
    let propCost = 1 / 0;
    const loft = !!(shot && (shot.loft || scanData.throwsOverWalls));
    const reach = shot && shot.reach > 0 ? shot.reach : 0;
    for (const row of _live.values())
    {
        if (!_accept(row.tag)) continue;
        const dist = Math.hypot(row.x - ox, row.y - oy);
        if (reach > 0 && dist > reach + (row.rad || 0)) continue;
        if (!loft && !_sight(ox, oy, row.x, row.y)) continue;
        if (row.tag === "prop")
        {
            if (dist < propCost)
            {
                propCost = dist;
                prop = row;
            }
        }
        else if (dist < foeCost)
        {
            foeCost = dist;
            foe = row;
        }
    }
    return foe || prop;
}

function _closest(ox, oy)
{
    let foe = null;
    let foeCost = 1 / 0;
    let prop = null;
    let propCost = 1 / 0;
    for (const row of _live.values())
    {
        if (!_accept(row.tag)) continue;
        const dist = Math.hypot(row.x - ox, row.y - oy);
        if (row.tag === "prop")
        {
            if (dist < propCost)
            {
                propCost = dist;
                prop = row;
            }
        }
        else if (dist < foeCost)
        {
            foeCost = dist;
            foe = row;
        }
    }
    return foe || prop;
}

function _aim(ox, oy, shot)
{
    const row = _nearest(ox, oy, shot);
    if (!row) return null;
    const at = _point(ox, oy, row, shot, leadOf(_selfName()));
    if (!at) return null;
    return {
        id: row.gid,
        ptr: row.ptr,
        x: at.x,
        y: at.y
    };
}

function _putAim(args, aim)
{
    args[1] = ptr(aim.x);
    args[2] = ptr(aim.y);
}

function _kindOk(kind)
{
    if (kind === "super") return _opts.useSuper && _superOk(scanData.myBrawlerName);
    if (kind === "gadget") return _opts.allowGadget;
    return true;
}

export function resetAimbot()
{
    _live.clear();
    bestPtr = null;
    bestGid = null;
    _scrubTs = 0;
    _cacheTs = 0;
    _hyper = -1;
    _slots.attack = null;
    _slots.super = null;
    _slots.gadget = null;
    _shots.attack = null;
    _shots.super = null;
    _shots.gadget = null;
    _pendingLog = null;
    _losMemo.clear();
}

export function computeAimForTarget(targetId, ownX, ownY, projSpeedOverride)
{
    const row = _live.get(targetId);
    if (!row)
    {
        logEvery(30, "aimbot no target in map",
        {
            targetId,
            mapSize: _live.size
        });
        return null;
    }
    const shot = _copyShot(_shots.attack, "attack");
    if (projSpeedOverride > 0)
    {
        shot.vel = projSpeedOverride;
        shot.live = true;
    }
    return _point(ownX, ownY, row, shot, leadOf(_selfName()));
}

export function setupAimbot(base)
{
    Interceptor.attach(base.add(offsets.BattleScreen_activateSkill),
    {
        onEnter: function(args)
        {
            if (!state.aimbot) return;
            if (scanData.hasCarryable) return;
            if (scanData.lastUpdate === 0) return;
            const shot = _shotForClient(args[4]);
            if (shot.skip) return;
            if (!_kindOk(shot.kind)) return;
            let targetId = 0;
            try
            {
                targetId = args[6].toInt32();
            }
            catch (_)
            {}
            const manual = _opts.onManualAim && targetId === 0;
            const auto = _opts.onAutoshoot && targetId !== 0;
            if (shot.kind === "attack" && !manual && !auto) return;
            if (shot.kind === "super" && !_opts.onManualAim && !_opts.onAutoshoot) return;
            const ox = scanData.myX;
            const oy = scanData.myY;
            const aim = _aim(ox, oy, shot);
            if (!aim) return;
            bestPtr = aim.ptr || null;
            bestGid = aim.id || null;
            _putAim(args, aim);
            _pendingLog = {
                id: aim.id,
                x: aim.x,
                y: aim.y,
                myX: ox | 0,
                myY: oy | 0,
                dist: Math.hypot(aim.x - ox, aim.y - oy) | 0,
                kind: shot.kind,
                vel: shot.vel | 0,
                reach: shot.reach | 0,
                live: !!shot.live,
                lead: leadOf(_selfName())
            };
        }
    });
    Interceptor.attach(base.add(offsets.BattleScreen_getClosestTargetForAutoshoot),
    {
        onLeave(retval)
        {
            const aimActive = state.aimbot && _opts.onAutoshoot;
            const killActive = state.killaura;
            if (!aimActive && !killActive) return;
            if (scanData.hasCarryable) return;
            if (scanData.lastUpdate === 0) return;
            if (!bestGid) return;
            const row = _live.get(bestGid);
            if (!row || !row.ptr) return;
            try
            {
                if (row.ptr.isNull()) return;
                bestPtr = row.ptr;
                retval.replace(bestPtr);
            }
            catch (_)
            {}
        }
    });
}

export function updateAimbot(now)
{
    if (!state.aimbot && !state.killaura || scanData.lastUpdate === 0) return;
    if (now === void 0) now = Date.now();
    const seen = new Set();
    const enemies = scanData.enemies || [];
    for (let i = 0; i < enemies.length; i++)
    {
        const enemy = enemies[i];
        if (enemy.teamId === scanData.myTeamId) continue;
        const gid = enemy.gid;
        if (!gid) continue;
        seen.add(gid);
        let row = _live.get(gid);
        if (!row)
        {
            row = {
                gid,
                ptr: enemy.ptr || null,
                x: enemy.x,
                y: enemy.y,
                rad: enemy.radius || 0,
                tag: enemy.kind === "spawnable" ? "prop" : "foe",
                yaw: 0,
                spd: 0,
                gait: enemy.moveSpeed || 0,
                markTs: 0,
                markX: enemy.x,
                markY: enemy.y
            };
            _live.set(gid, row);
        }
        row.ptr = enemy.ptr || row.ptr;
        row.x = enemy.x;
        row.y = enemy.y;
        row.rad = enemy.radius || row.rad;
        row.tag = enemy.kind === "spawnable" ? "prop" : "foe";
        if (enemy.moveSpeed > 0) row.gait = enemy.moveSpeed;
        _motion(row, enemy.x, enemy.y, now);
    }
    for (const id of _live.keys())
    {
        if (!seen.has(id)) _live.delete(id);
    }
    if (bestGid && _live.has(bestGid))
    {
        const keep = _live.get(bestGid);
        bestPtr = keep && keep.ptr ? keep.ptr : null;
    }
    else
    {
        const pick = _closest(scanData.myX, scanData.myY);
        bestGid = pick ? pick.gid : null;
        bestPtr = pick && pick.ptr ? pick.ptr : null;
    }
    _cacheShots(now);
    if (_pendingLog)
    {
        logInfo("aimbot fire", _pendingLog);
        _pendingLog = null;
    }
    if (now - _scrubTs > 1e3)
    {
        for (const [k, v] of _losMemo)
        {
            if (now - v.ts > TUNE.LOS_PURGE_MS) _losMemo.delete(k);
        }
        _scrubTs = now;
    }
}
