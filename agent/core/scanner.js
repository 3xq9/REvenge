import
{
    getFunctions
}
from "./functions.js";
import
{
    offsets
}
from "./offsets.js";
import
{
    readScString
}
from "./scstring.js";
import
{
    canonBrawlerName
}
from "../utils/brawlerName.js";

var moduleBase = null;
var _brawlerNameCache = new Map();
var _scanCount = 0;
var _activeGidSet = new Set();
var _liveProjectiles = new Map();
var _destroyed = [];
var _friendlyIdx = new Set();
var _projectileHooksInstalled = false;
var MASSIVE_RADIUS_THRESHOLD = 380;

export var scanData = {
    ownCharacter: ptr(0),
    battleModeClient: ptr(0),
    myTeamId: 0,
    myPlayerIndex: -1,
    myX: 0,
    myY: 0,
    myRadius: 60,
    mySpeed: 720,
    hackSpeed: 0,
    myBrawlerId: 0,
    myBrawlerName: null,
    hasCarryable: false,
    throwsOverWalls: false,
    enemies: [],
    projectiles: [],
    destroyed: [],
    liveProjectiles: 0,
    lastUpdate: 0
};

function _validPtr(value)
{
    return value && !value.isNull();
}

function ptrFromU32(lo, hi)
{
    if (!lo && !hi) return ptr(0);
    return ptr("0x" + (hi >>> 0).toString(16).padStart(8, "0") + (lo >>> 0).toString(16).padStart(8, "0"));
}

function _readHeroIconName(data)
{
    try
    {
        const namePtr = data.add(offsets.HeroData_namePtr).readPointer();
        if (!_validPtr(namePtr)) return null;
        const str = namePtr.readCString();
        if (str && str.startsWith("hero_icon_")) return str.substring(10).toUpperCase();
    }
    catch (_)
    {}
    return null;
}

function _readThrowsOverWalls(fns, own)
{
    if (!fns.LogicCharacterClient_getWeaponSkill || !fns.LogicSkillData_getProjectileData) return false;
    try
    {
        const skill = fns.LogicCharacterClient_getWeaponSkill(own);
        if (!_validPtr(skill)) return false;
        const projectile = fns.LogicSkillData_getProjectileData(skill, 0);
        if (!_validPtr(projectile)) return false;
        return (projectile.add(offsets.Projectile_isIndirect).readU32() | 0) !== 0;
    }
    catch (_)
    {
        return false;
    }
}

function _readHasCarryable(fns, own, bm)
{
    if (!fns.LogicCharacterClient_getLinkedCarryable) return false;
    try
    {
        return _validPtr(fns.LogicCharacterClient_getLinkedCarryable(own, bm));
    }
    catch (_)
    {
        return false;
    }
}

function _readProjectileName(data)
{
    try
    {
        const fns = getFunctions();
        if (fns.LogicData_getName && data && !data.isNull())
        {
            const named = readScString(fns.LogicData_getName(data), 128);
            if (named) return named;
        }
    }
    catch (_)
    {}
    try
    {
        const name = data.add(offsets.LogicProjectileClient_dataName).readPointer();
        return readScString(name, 128);
    }
    catch (_)
    {
        return null;
    }
}

function _classify(speed, radius)
{
    const isSlow = speed <= 800;
    const isSpread = radius === 0 && speed >= 1400 && speed <= 1600;
    const isSniper = speed > 3500;
    let hitRadius;
    if (radius > 0) hitRadius = radius * 1.05;
    else if (isSlow) hitRadius = 520;
    else if (isSpread) hitRadius = 320;
    else if (isSniper) hitRadius = 350;
    else hitRadius = 240;
    return {
        isSlow,
        isSpread,
        isSniper,
        isMassive: hitRadius > MASSIVE_RADIUS_THRESHOLD || radius > MASSIVE_RADIUS_THRESHOLD,
        hitRadius,
        category: isSlow ? "slow" : isSpread ? "spread" : isSniper ? "sniper" : "normal"
    };
}

function _readOwnerIndex(obj)
{
    try
    {
        return obj.add(offsets.LogicGameObjectClient_ownerIndex).readS32();
    }
    catch (_)
    {
        return -1;
    }
}

function _ownerNameByIndex(ownerIndex)
{
    if (ownerIndex < 0) return null;
    if (ownerIndex === scanData.myPlayerIndex && scanData.myBrawlerName)
    {
        return canonBrawlerName(scanData.myBrawlerName);
    }
    for (const enemy of scanData.enemies)
    {
        if (enemy.playerIndex === ownerIndex && enemy.brawlerName)
        {
            return canonBrawlerName(enemy.brawlerName);
        }
    }
    return null;
}

function _readAngle(projectile, rendering)
{
    if (rendering !== 3) return null;
    try
    {
        const raw = projectile.add(offsets.Projectile_angle).readU32();
        return raw <= 360 ? raw : raw % 360;
    }
    catch (_)
    {
        return null;
    }
}

function _readTarget(fns, projectile)
{
    let targetX = 0;
    let targetY = 0;
    try
    {
        if (fns.LogicProjectileClient_getTargetX) targetX = fns.LogicProjectileClient_getTargetX(projectile) | 0;
        if (fns.LogicProjectileClient_getTargetY) targetY = fns.LogicProjectileClient_getTargetY(projectile) | 0;
    }
    catch (_)
    {}
    return {
        targetX,
        targetY
    };
}

function _captureProjectile(projectile, data, ownerTeamOverride)
{
    if (!_validPtr(projectile)) return;
    const fns = getFunctions();
    try
    {
        if (!_validPtr(data) && fns.LogicProjectileClient_getData) data = fns.LogicProjectileClient_getData(projectile);
        if (!_validPtr(data)) data = fns.LogicGameObjectClient_getData(projectile);
        if (!_validPtr(data)) return;
        const gid = String(fns.LogicGameObjectClient_getGlobalID(projectile));
        const existing = _liveProjectiles.get(gid);
        if (existing)
        {
            existing.ptr = projectile;
            existing.data = data;
            existing.lastSeenAt = Date.now();
            if (ownerTeamOverride !== void 0) existing.ownerTeam = ownerTeamOverride | 0;
            return;
        }
        const x = fns.LogicGameObjectClient_getX(projectile) | 0;
        const y = fns.LogicGameObjectClient_getY(projectile) | 0;
        const speed = Math.max(1, fns.LogicProjectileData_getSpeed(data) | 0);
        const radius = Math.max(0, fns.LogicProjectileData_getRadius(data) | 0);
        const rendering = fns.LogicProjectileData_getRendering ? fns.LogicProjectileData_getRendering(data) | 0 : 0;
        const angle = _readAngle(projectile, rendering);
        const target = _readTarget(fns, projectile);
        const isThrower = data.add(offsets.Projectile_isIndirect).readU32() | 0;
        let ownerTeam = ownerTeamOverride === void 0 ? 0 : ownerTeamOverride | 0;
        if (ownerTeamOverride === void 0)
        {
            try
            {
                ownerTeam = projectile.add(offsets.LogicProjectileClient_ownerTeam).readU32() | 0;
            }
            catch (_)
            {}
        }
        const ownerIndex = _readOwnerIndex(projectile);
        let spawnAreaRadius = 0;
        let spawnAreaActiveTime = 0;
        try
        {
            if (fns.LogicProjectileData_getSpawnAreaEffect)
            {
                const area = fns.LogicProjectileData_getSpawnAreaEffect(data);
                if (_validPtr(area))
                {
                    spawnAreaRadius = fns.AreaEffectData_getRadius ? fns.AreaEffectData_getRadius(area) | 0 : 0;
                    spawnAreaActiveTime = fns.AreaEffectData_getActiveTimeMs ? fns.AreaEffectData_getActiveTimeMs(area) | 0 : 0;
                }
            }
        }
        catch (_)
        {
            spawnAreaRadius = 0;
            spawnAreaActiveTime = 0;
        }
        const classification = _classify(speed, radius);
        _liveProjectiles.set(gid,
        {
            gid,
            ptr: projectile,
            data,
            ownerTeam,
            ownerIndex,
            ownerName: _ownerNameByIndex(ownerIndex),
            name: _readProjectileName(data),
            x,
            y,
            spawnX: x,
            spawnY: y,
            targetX: target.targetX,
            targetY: target.targetY,
            speed,
            radius,
            rendering,
            angle,
            isThrower,
            spawnAreaRadius,
            spawnAreaActiveTime,
            hitRadius: classification.hitRadius,
            isSlow: classification.isSlow,
            isSpread: classification.isSpread,
            isSniper: classification.isSniper,
            isMassive: classification.isMassive,
            category: classification.category,
            spawnedAt: Date.now(),
            lastX: x,
            lastY: y,
            lastTs: Date.now(),
            lastSeenAt: Date.now(),
            hasVelocitySample: false,
            vx: angle === null ? 0 : Math.cos(angle * Math.PI / 180) * speed,
            vy: angle === null ? 0 : Math.sin(angle * Math.PI / 180) * speed
        });
    }
    catch (_)
    {}
}

function _removeProjectile(projectile)
{
    try
    {
        const gid = String(getFunctions().LogicGameObjectClient_getGlobalID(projectile));
        const record = _liveProjectiles.get(gid);
        if (record && _destroyed.length < 16)
        {
            _destroyed.push(
            {
                name: record.name,
                angle: record.angle,
                spawnX: record.spawnX,
                spawnY: record.spawnY,
                x: record.lastX,
                y: record.lastY
            });
        }
        _liveProjectiles.delete(gid);
    }
    catch (_)
    {}
}

function _installProjectileHooks(base)
{
    if (_projectileHooksInstalled) return;
    _projectileHooksInstalled = true;
    try
    {
        Interceptor.attach(base.add(offsets.LogicProjectileClient_ctor),
        {
            onEnter(args)
            {
                this.projectile = args[0];
                this.data = args[1];
            },
            onLeave()
            {
                _captureProjectile(this.projectile, this.data);
            }
        });
    }
    catch (_)
    {}
    try
    {
        Interceptor.attach(base.add(offsets.LogicProjectileClient_destruct),
        {
            onEnter(args)
            {
                _removeProjectile(args[0]);
            }
        });
    }
    catch (_)
    {}
}

function _updateLiveProjectiles(now)
{
    const fns = getFunctions();
    const output = [];
    for (const [gid, projectile] of _liveProjectiles)
    {
        try
        {
            if (projectile.ptr.isNull())
            {
                _liveProjectiles.delete(gid);
                continue;
            }
            const x = fns.LogicGameObjectClient_getX(projectile.ptr) | 0;
            const y = fns.LogicGameObjectClient_getY(projectile.ptr) | 0;
            if (projectile.targetX === 0 && projectile.targetY === 0)
            {
                const target = _readTarget(fns, projectile.ptr);
                projectile.targetX = target.targetX;
                projectile.targetY = target.targetY;
            }
            const dt = (now - projectile.lastTs) / 1000;
            const dx = x - projectile.lastX;
            const dy = y - projectile.lastY;
            if (dt > 0.002 && dt < 0.3 && dx * dx + dy * dy >= 16)
            {
                const observedVx = dx / dt;
                const observedVy = dy / dt;
                const alpha = projectile.hasVelocitySample ? 0.4 : 1;
                projectile.vx = projectile.vx * (1 - alpha) + observedVx * alpha;
                projectile.vy = projectile.vy * (1 - alpha) + observedVy * alpha;
                projectile.hasVelocitySample = true;
            }
            if (!projectile.hasVelocitySample && projectile.targetX !== 0 && projectile.targetY !== 0 && projectile.vx === 0 && projectile.vy === 0)
            {
                const tx = projectile.targetX - x;
                const ty = projectile.targetY - y;
                const length = Math.hypot(tx, ty);
                if (length > 0)
                {
                    projectile.vx = tx / length * projectile.speed;
                    projectile.vy = ty / length * projectile.speed;
                }
            }
            projectile.x = x;
            projectile.y = y;
            projectile.lastX = x;
            projectile.lastY = y;
            projectile.lastTs = now;
            projectile.ownerName = _ownerNameByIndex(projectile.ownerIndex);
            if (projectile.ownerIndex >= 0 && _friendlyIdx.has(projectile.ownerIndex)) continue;
            if (projectile.ownerTeam === scanData.myTeamId) continue;
            output.push(
            {
                gid,
                ptr: projectile.ptr,
                name: projectile.name,
                ownerTeam: projectile.ownerTeam,
                ownerIndex: projectile.ownerIndex,
                ownerName: projectile.ownerName,
                x,
                y,
                spawnX: projectile.spawnX,
                spawnY: projectile.spawnY,
                targetX: projectile.targetX,
                targetY: projectile.targetY,
                speed: projectile.speed,
                radius: projectile.radius,
                hitRadius: projectile.hitRadius,
                rendering: projectile.rendering,
                angle: projectile.angle,
                isThrower: projectile.isThrower,
                spawnAreaRadius: projectile.spawnAreaRadius,
                spawnAreaActiveTime: projectile.spawnAreaActiveTime,
                isSlow: projectile.isSlow,
                isSpread: projectile.isSpread,
                isSniper: projectile.isSniper,
                isMassive: projectile.isMassive,
                category: projectile.category,
                spawnedAt: projectile.spawnedAt,
                vx: projectile.vx,
                vy: projectile.vy
            });
        }
        catch (_)
        {
            _liveProjectiles.delete(gid);
        }
    }
    return output;
}

export function updateScanner(bm, now)
{
    if (!moduleBase) return;
    if (now === void 0) now = Date.now();
    const functions = getFunctions();
    try
    {
        const own = functions.LogicBattleModeClient_getOwnCharacter(bm);
        if (!_validPtr(own))
        {
            scanData.ownCharacter = null;
            scanData.battleModeClient = null;
            scanData.hasCarryable = false;
            scanData.throwsOverWalls = false;
            scanData.lastUpdate = 0;
            return;
        }
        scanData.ownCharacter = own;
        scanData.battleModeClient = bm;
        scanData.myTeamId = functions.LogicBattleModeClient_getOwnPlayerTeam(bm);
        scanData.myPlayerIndex = functions.LogicBattleModeClient_getOwnPlayerIndex ? functions.LogicBattleModeClient_getOwnPlayerIndex(bm) | 0 : _readOwnerIndex(own);
        _friendlyIdx.clear();
        _friendlyIdx.add(scanData.myPlayerIndex);
        scanData.myX = functions.LogicGameObjectClient_getX(own) | 0;
        scanData.myY = functions.LogicGameObjectClient_getY(own) | 0;
        scanData.hasCarryable = _readHasCarryable(functions, own, bm);
        scanData.throwsOverWalls = _readThrowsOverWalls(functions, own);
        scanData.mySpeed = 720;
        const ownData = functions.LogicGameObjectClient_getData(own);
        if (_validPtr(ownData))
        {
            scanData.myRadius = functions.LogicCharacterData_getCollisionRadius(ownData) || 60;
            try
            {
                scanData.myBrawlerId = ownData.add(offsets.CharData_brawlerId).readU8() | 0;
            }
            catch (_)
            {}
            try
            {
                const baseSpeed = functions.LogicCharacterData_getSpeed ? functions.LogicCharacterData_getSpeed(ownData) | 0 : 0;
                const buff = own.add(offsets.LogicCharacterClientOwn_speedBuff).readS32() | 0;
                const speed = baseSpeed + buff;
                if (speed >= 300 && speed <= 3000) scanData.mySpeed = speed;
            }
            catch (_)
            {}
            const nameRead = _readHeroIconName(ownData);
            if (nameRead) scanData.myBrawlerName = nameRead;
        }
        const enemies = [];
        const vtableProj = moduleBase.add(offsets.VTABLE_PROJECTILE_DATA);
        const objMgr = bm.add(offsets.BattleMode_objectManagerPtr).readPointer();
        if (_validPtr(objMgr))
        {
            const objects = objMgr.add(offsets.ObjectManager_objectsArray).readPointer();
            const count = objMgr.add(offsets.ObjectManager_count).readU32();
            if (_validPtr(objects) && count > 0 && count <= 1200)
            {
                const stride = offsets.ObjectManager_ptrStride;
                let batchView = null;
                try
                {
                    const buf = objects.readByteArray(count * stride);
                    if (buf) batchView = new DataView(buf);
                }
                catch (_)
                {}
                for (let i = 0; i < count; i++)
                {
                    try
                    {
                        let obj;
                        if (batchView)
                        {
                            const off = i * stride;
                            const lo = batchView.getUint32(off, true);
                            const hi = batchView.getUint32(off + 4, true);
                            if (lo === 0 && hi === 0) continue;
                            obj = ptrFromU32(lo, hi);
                        }
                        else
                        {
                            obj = objects.add(i * stride).readPointer();
                        }
                        if (!_validPtr(obj)) continue;
                        const data = functions.LogicGameObjectClient_getData(obj);
                        if (!_validPtr(data)) continue;
                        const team = obj.add(offsets.GameObj_team).readU32();
                        if (data.readPointer().equals(vtableProj))
                        {
                            if (team === scanData.myTeamId) continue;
                            _captureProjectile(obj, data, team);
                            continue;
                        }
                        if (team === scanData.myTeamId)
                        {
                            const idx = _readOwnerIndex(obj);
                            if (idx >= 0) _friendlyIdx.add(idx);
                            continue;
                        }
                        if (obj.add(offsets.GameObj_deadFlag).readU32() !== 0) continue;
                        const gid = String(functions.LogicGameObjectClient_getGlobalID(obj));
                        let brawlerName = _brawlerNameCache.get(gid);
                        if (brawlerName === void 0)
                        {
                            brawlerName = _readHeroIconName(data);
                            _brawlerNameCache.set(gid, brawlerName);
                        }
                        if (!brawlerName) continue;
                        let moveSpeed = 0;
                        try
                        {
                            moveSpeed = functions.LogicCharacterData_getSpeed ? functions.LogicCharacterData_getSpeed(data) | 0 : 0;
                        }
                        catch (_)
                        {}
                        enemies.push(
                        {
                            gid,
                            ptr: obj,
                            x: functions.LogicGameObjectClient_getX(obj) | 0,
                            y: functions.LogicGameObjectClient_getY(obj) | 0,
                            brawlerId: data.add(offsets.CharData_brawlerId).readU8() | 0,
                            brawlerName,
                            teamId: team,
                            playerIndex: _readOwnerIndex(obj),
                            moveSpeed
                        });
                    }
                    catch (_)
                    {}
                }
            }
        }
        _scanCount++;
        if ((_scanCount & 63) === 0)
        {
            _activeGidSet.clear();
            for (const enemy of enemies) _activeGidSet.add(enemy.gid);
            for (const gid of _brawlerNameCache.keys())
            {
                if (!_activeGidSet.has(gid)) _brawlerNameCache.delete(gid);
            }
        }
        scanData.enemies = enemies;
        scanData.destroyed = _destroyed.splice(0);
        scanData.projectiles = _updateLiveProjectiles(now);
        scanData.liveProjectiles = _liveProjectiles.size;
        scanData.lastUpdate = now;
    }
    catch (_)
    {}
}

export function resetScannerCache()
{
    _brawlerNameCache.clear();
    _liveProjectiles.clear();
    _friendlyIdx.clear();
    _destroyed.length = 0;
    scanData.projectiles = [];
    scanData.destroyed = [];
    scanData.liveProjectiles = 0;
    scanData.hackSpeed = 0;
}

export function initScanner(base)
{
    moduleBase = base;
}

export function enableProjectileTracking()
{
    if (moduleBase) _installProjectileHooks(moduleBase);
}
