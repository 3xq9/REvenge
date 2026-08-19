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
    getDodgeDir
}
from "./autododge.js";
import
{
    AIM_TUNING
}
from "../utils/config.js";
import
{
    isLoggingEnabled,
    logInfo,
    logEvery
}
from "../utils/logger.js";
import
{
    canonBrawlerName
}
from "../utils/brawlerName.js";

var LOL_AIMBOT_DEFAULTS = Object.freeze(
{
    lastpositionsLen: 6,
    velocitySmoothing: 0.4,
    deadzoneSpeed: 150,
    predictionStrength: 0.8,
    maxLeadTime: 0.9,
    jukePredict: Object.freeze(
    {
        enabled: true,
        reactive: true,
        bias: 0
    }),
    curvePredict: Object.freeze(
    {
        enabled: true
    }),
    projectileSpeed: 4e3
});
const BLACKLISTED_SKILLS = new Set([
    "ShamanUlti", "MechanicUlti", "ClusterBombDudeUlti", "ArcadeUlti", "ArtilleryDudeUlti",
    "SoulCollectorUlti", "MinigunDudeUlti", "KnightUlti", "DuplicatorUlti", "TwinsUlti",
    "SpawnerDudeUlti", "ConductorUlti", "MeepleUlti", "FleaUlti", "ReviverUlti", "VoodooUlti",
    "ShadowdemonUlti", "RollerUlti", "SniperUlti", "EnragerUlti", "PowerLevelerUlti",
    "DoorManUlti", "ConductorUltiSpawn"
]);

function isBlacklistedSkill(name)
{
    return !!name && BLACKLISTED_SKILLS.has(name);
}

function _skillName(skillData)
{
    const fns = getFunctions();
    if (!fns.LogicData_getName) return null;
    try
    {
        return readScString(fns.LogicData_getName(skillData), 64);
    }
    catch (_)
    {
        return null;
    }
}

function _firedSkillSpeed(skillClient)
{
    try
    {
        const fns = getFunctions();
        if (!skillClient || skillClient.isNull() || !fns.LogicSkillClient_getData) return {
            blacklisted: false,
            ulti: false,
            speed: 0
        };
        let hyper = 0;
        try
        {
            const own = scanData.ownCharacter;
            if (own && !own.isNull()) hyper = own.add(offsets.LogicCharacterClient_hyperActive).readU8() !== 0 ? 1 : 0;
        }
        catch (_)
        {}
        const skillData = fns.LogicSkillClient_getData(skillClient, hyper);
        if (!skillData || skillData.isNull()) return {
            blacklisted: false,
            ulti: false,
            speed: 0
        };
        const name = _skillName(skillData);
        const ulti = !!name && name.indexOf("Ulti") !== -1;
        if (isBlacklistedSkill(name)) return {
            blacklisted: true,
            ulti,
            speed: 0
        };
        if (!fns.LogicSkillData_getProjectileData) return {
            blacklisted: false,
            ulti,
            speed: 0
        };
        const projectile = fns.LogicSkillData_getProjectileData(skillData, 0);
        if (!projectile || projectile.isNull()) return {
            blacklisted: false,
            ulti,
            speed: 0
        };
        return {
            blacklisted: false,
            ulti,
            speed: fns.LogicProjectileData_getSpeed(projectile) | 0
        };
    }
    catch (_)
    {
        return {
            blacklisted: false,
            ulti: false,
            speed: 0
        };
    }
}

var targets = new Map();
var bestTargetId = null;
var _lastCleanupTs = 0;
var _burstLockPos = null;
var _burstLockUntil = 0;
var _burstLockTargetId = null;
var _burstLockTgtX = null;
var _burstLockTgtY = null;
var _losCache = new Map();
var _opts = {
    onManualAim: true,
    onAutoshoot: true,
    useSuper: true
};
var _superBrawlersSet = new Set();
export function setAimbotOptions(o)
{
    if (!o || typeof o !== "object") return;
    if (typeof o.onManualAim === "boolean") _opts.onManualAim = o.onManualAim;
    if (typeof o.onAutoshoot === "boolean") _opts.onAutoshoot = o.onAutoshoot;
    if (typeof o.useSuper === "boolean") _opts.useSuper = o.useSuper;
    if (Array.isArray(o.superBrawlers))
    {
        _superBrawlersSet = new Set();
        for (const name of o.superBrawlers)
        {
            const id = canonBrawlerName(name);
            if (id) _superBrawlersSet.add(id);
        }
    }
}

function _superAllowed(name)
{
    if (_superBrawlersSet.size === 0) return true;
    return !!name && _superBrawlersSet.has(name);
}

function _ownRange()
{
    try
    {
        const own = scanData.ownCharacter;
        if (!own || own.isNull()) return 0;
        const fns = getFunctions();
        if (!fns.LogicCharacterClient_getWeaponSkill || !fns.LogicSkillData_getCastingRange) return 0;
        const skill = fns.LogicCharacterClient_getWeaponSkill(own);
        if (!skill || skill.isNull()) return 0;
        const tiles = fns.LogicSkillData_getCastingRange(skill) | 0;
        if (tiles <= 0) return 0;
        return tiles * 100;
    }
    catch (_)
    {
        return 0;
    }
}

function pickBestTarget(enemies, myX, myY, prevGid, range)
{
    const wDist = AIM_TUNING.SCORE_DIST_WEIGHT;
    const wSpeed = AIM_TUNING.SCORE_SPEED_WEIGHT;
    const wApproach = AIM_TUNING.SCORE_APPROACH_WEIGHT;
    const wFacing = AIM_TUNING.SCORE_FACING_WEIGHT;
    const sticky = AIM_TUNING.TARGET_STICKY_RATIO;
    const statFloor = AIM_TUNING.STATIONARY_VEL_FLOOR;
    const statRatio = AIM_TUNING.STATIONARY_VEL_RATIO;
    const defMove = AIM_TUNING.DEFAULT_MOVE_SPEED;
    let bestGid = 0;
    let bestScore = 1e18;
    let prevScore = 1e18;
    let prevFound = false;
    const n = enemies.length;
    for (let i = 0; i < n; i++)
    {
        const e = enemies[i];
        if (!e.losClear) continue;
        const vx = e.vxEma;
        const vy = e.vyEma;
        const speed = Math.sqrt(vx * vx + vy * vy);
        const dx = e.x - myX;
        const dy = e.y - myY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const invD = 1 / (dist + 1e-6);
        const approach = -(dx * vx + dy * vy) * invD;
        let facing = 0;
        const move = e.moveSpeed > 0 ? e.moveSpeed : defMove;
        const thr = statFloor > move * statRatio ? statFloor : move * statRatio;
        if (speed > thr)
        {
            const maxSp = speed > 1 ? speed : 1;
            facing = (-dx * vx - dy * vy) * invD / maxSp;
        }
        let score = dist * wDist - speed * wSpeed - approach * wApproach - facing * wFacing * dist;
        if (range > 0 && dist > range) score += (dist - range) * 3;
        const gidInt = e.gidInt;
        if (prevGid !== 0 && gidInt === prevGid)
        {
            prevScore = score;
            prevFound = true;
        }
        if (score < bestScore)
        {
            bestScore = score;
            bestGid = gidInt;
        }
    }
    if (prevFound && bestGid !== prevGid && prevScore <= bestScore / sticky)
    {
        bestGid = prevGid;
    }
    return bestGid;
}
export function resetAimbot()
{
    targets.clear();
    bestTargetId = null;
    _lastCleanupTs = 0;
    _burstLockPos = null;
    _burstLockUntil = 0;
    _burstLockTargetId = null;
    _burstLockTgtX = null;
    _burstLockTgtY = null;
    _losCache.clear();
    _projSpeedCache.brawlerId = -1;
    _projSpeedCache.speed = 0;
}

function _clamp(v, lo, hi)
{
    return Math.max(lo, Math.min(hi, v));
}

function _regress(samples)
{
    const n = samples.length;
    if (n < 2) return null;
    let st = 0,
        sx = 0,
        sy = 0;
    for (let i = 0; i < n; i++)
    {
        st += samples[i].t;
        sx += samples[i].x;
        sy += samples[i].y;
    }
    const mt = st / n,
        mx = sx / n,
        my = sy / n;
    let denom = 0,
        tx = 0,
        ty = 0;
    for (let i = 0; i < n; i++)
    {
        const dt = (samples[i].t - mt) / 1e3;
        denom += dt * dt;
        tx += dt * (samples[i].x - mx);
        ty += dt * (samples[i].y - my);
    }
    if (denom < 1e-8) return null;
    return {
        vx: tx / denom,
        vy: ty / denom
    };
}

function estimateAcceleration(samples)
{
    if (samples.length < 4) return {
        ax: 0,
        ay: 0
    };
    const mid = Math.floor(samples.length / 2);
    const early = _regress(samples.slice(0, mid + 1));
    const late = _regress(samples.slice(mid));
    if (!early || !late) return {
        ax: 0,
        ay: 0
    };
    const tEarly = (samples[0].t + samples[mid].t) / 2;
    const tLate = (samples[mid].t + samples[samples.length - 1].t) / 2;
    const dt = (tLate - tEarly) / 1e3;
    if (dt <= 1e-6) return {
        ax: 0,
        ay: 0
    };
    let ax = (late.vx - early.vx) / dt;
    let ay = (late.vy - early.vy) / dt;
    const speed = Math.hypot(early.vx + late.vx, early.vy + late.vy) * 0.5;
    const maxAccel = speed * 8;
    const accel = Math.hypot(ax, ay);
    if (accel > maxAccel && accel > 1e-6)
    {
        const scale = maxAccel / accel;
        ax *= scale;
        ay *= scale;
    }
    return {
        ax,
        ay
    };
}

function updateLolTracking(t, x, y, now)
{
    t.samples.push(
    {
        x,
        y,
        t: now
    });
    while (t.samples.length > LOL_AIMBOT_DEFAULTS.lastpositionsLen) t.samples.shift();
    if (t.samples.length < 2)
    {
        t.trackedVx = 0;
        t.trackedVy = 0;
        t.trackedAx = 0;
        return t;
    }
    const fit = _regress(t.samples);
    if (!fit) return t;
    const recent = _regress(t.samples.slice(-Math.min(3, t.samples.length))) || fit;
    const dot = recent.vx * t.prevVx + recent.vy * t.prevVy;
    const recentSpeed = Math.hypot(recent.vx, recent.vy);
    const reversal = LOL_AIMBOT_DEFAULTS.jukePredict.enabled && LOL_AIMBOT_DEFAULTS.jukePredict.reactive && dot < 0;
    if (!t.haveVelocity || reversal || recentSpeed > LOL_AIMBOT_DEFAULTS.deadzoneSpeed && Math.hypot(t.prevVx, t.prevVy) < LOL_AIMBOT_DEFAULTS.deadzoneSpeed)
    {
        t.trackedVx = recent.vx;
        t.trackedVy = recent.vy;
        t.haveVelocity = true;
    }
    else
    {
        const k = _clamp(LOL_AIMBOT_DEFAULTS.velocitySmoothing, 0, 0.95);
        t.trackedVx = t.trackedVx * k + fit.vx * (1 - k);
        t.trackedVy = t.trackedVy * k + fit.vy * (1 - k);
    }
    t.prevVx = t.trackedVx;
    t.prevVy = t.trackedVy;
    if (LOL_AIMBOT_DEFAULTS.curvePredict.enabled)
    {
        const acc = estimateAcceleration(t.samples);
        t.trackedAx = acc.ax;
        t.trackedAy = acc.ay;
    }
    else
    {
        t.trackedAx = 0;
        t.trackedAy = 0;
    }
    return t;
}

function hasLineOfSight(x0, y0, x1, y1)
{
    const tx0 = x0 / TILE_SIZE | 0,
        ty0 = y0 / TILE_SIZE | 0;
    const tx1 = x1 / TILE_SIZE | 0,
        ty1 = y1 / TILE_SIZE | 0;
    const key = (tx0 & 127) << 21 | (ty0 & 127) << 14 | (tx1 & 127) << 7 | ty1 & 127 | 0;
    const now = Date.now();
    const cached = _losCache.get(key);
    if (cached !== void 0 && now - cached.ts < AIM_TUNING.LOS_CACHE_TTL_MS) return cached.v;
    const v = losCheck(x0, y0, x1, y1, BLOCKS_PROJECTILES);
    _losCache.set(key,
    {
        v,
        ts: now
    });
    return v;
}
var _projSpeedCache = {
    brawlerId: -1,
    speed: 0
};

function _readOwnProjSpeedRuntime()
{
    try
    {
        const own = scanData.ownCharacter;
        if (!own || own.isNull()) return 0;
        const fns = getFunctions();
        const skill = fns.LogicCharacterClient_getWeaponSkill(own);
        if (!skill || skill.isNull()) return 0;
        const projData = fns.LogicSkillData_getProjectileData(skill, 0);
        if (!projData || projData.isNull()) return 0;
        const speed = fns.LogicProjectileData_getSpeed(projData);
        if (speed >= 500 && speed <= 15e3) return speed >>> 0;
    }
    catch (_)
    {}
    return 0;
}

function resolveProjSpeed()
{
    const bid = scanData.myBrawlerId | 0;
    if (bid === _projSpeedCache.brawlerId && _projSpeedCache.speed > 0)
    {
        return _projSpeedCache.speed;
    }
    const s = _readOwnProjSpeedRuntime();
    if (s > 0)
    {
        _projSpeedCache.brawlerId = bid;
        _projSpeedCache.speed = s;
        return s;
    }
    return 0;
}
export function computeAimForTarget(targetId, ownX, ownY, projSpeedOverride)
{
    const tgt = targets.get(targetId);
    if (!tgt)
    {
        logEvery(30, "aimbot no target in map",
        {
            targetId,
            mapSize: targets.size
        });
        return null;
    }
    if (tgt.samples.length < 1)
    {
        logEvery(30, "aimbot not enough history",
        {
            targetId,
            hist: tgt.samples.length
        });
        return null;
    }
    const projSpeed = projSpeedOverride > 0 ? projSpeedOverride : resolveProjSpeed();
    const speed = Math.hypot(tgt.trackedVx, tgt.trackedVy);
    if (projSpeed <= 0 || speed < LOL_AIMBOT_DEFAULTS.deadzoneSpeed)
    {
        return {
            x: Math.round(tgt.x),
            y: Math.round(tgt.y),
            mode: "LOL_STABLE"
        };
    }
    const strength = LOL_AIMBOT_DEFAULTS.predictionStrength;
    const vx = tgt.trackedVx * strength;
    const vy = tgt.trackedVy * strength;
    const ax = tgt.trackedAx * strength;
    const ay = tgt.trackedAy * strength;
    let lead = Math.hypot(tgt.x - ownX, tgt.y - ownY) / projSpeed;
    for (let i = 0; i < 6; i++)
    {
        const px = tgt.x + vx * lead + 0.5 * ax * lead * lead;
        const py = tgt.y + vy * lead + 0.5 * ay * lead * lead;
        const next = Math.hypot(px - ownX, py - ownY) / projSpeed;
        lead = _clamp(next, 0, LOL_AIMBOT_DEFAULTS.maxLeadTime);
    }
    let aimX = tgt.x + vx * lead + 0.5 * ax * lead * lead;
    let aimY = tgt.y + vy * lead + 0.5 * ay * lead * lead;
    const bias = _clamp(LOL_AIMBOT_DEFAULTS.jukePredict.bias, 0, 1);
    if (LOL_AIMBOT_DEFAULTS.jukePredict.enabled && bias > 0)
    {
        let reverseLead = Math.hypot(tgt.x - ownX, tgt.y - ownY) / projSpeed;
        for (let i = 0; i < 6; i++)
        {
            const px = tgt.x - vx * reverseLead;
            const py = tgt.y - vy * reverseLead;
            reverseLead = _clamp(Math.hypot(px - ownX, py - ownY) / projSpeed, 0, LOL_AIMBOT_DEFAULTS.maxLeadTime);
        }
        const reverseX = tgt.x - vx * reverseLead;
        const reverseY = tgt.y - vy * reverseLead;
        aimX = aimX * (1 - bias) + reverseX * bias;
        aimY = aimY * (1 - bias) + reverseY * bias;
    }
    if (!isFinite(aimX) || !isFinite(aimY)) return null;
    return {
        x: Math.round(aimX),
        y: Math.round(aimY),
        mode: "LOL_INTERCEPT"
    };
}

function _writeAimArgs(args, aim)
{
    args[1] = ptr(aim.x);
    args[2] = ptr(aim.y);
}

function _shooterPos()
{
    const dodge = getDodgeDir();
    const mySpd = scanData.mySpeed || AIM_TUNING.DEFAULT_MOVE_SPEED;
    return {
        x: scanData.myX + (dodge ? dodge.x * mySpd * AIM_TUNING.SHOOT_LAG_S : 0),
        y: scanData.myY + (dodge ? dodge.y * mySpd * AIM_TUNING.SHOOT_LAG_S : 0)
    };
}

function _aimAttack(args, enemyId, speed)
{
    const from = _shooterPos();
    const aim = computeAimForTarget(enemyId, from.x, from.y, speed);
    if (!aim) return;
    if (!scanData.throwsOverWalls && !hasLineOfSight(scanData.myX, scanData.myY, aim.x, aim.y)) return;
    try
    {
        _writeAimArgs(args, aim);
    }
    catch (_)
    {}
}

function _aimSuper(args, enemyId)
{
    const nowMs = Date.now();
    if (_burstLockPos && _burstLockTargetId === enemyId && nowMs < _burstLockUntil)
    {
        const tgtNow = targets.get(enemyId);
        let drifted = false;
        if (tgtNow && _burstLockTgtX !== null)
        {
            const ddx = tgtNow.x - _burstLockTgtX;
            const ddy = tgtNow.y - _burstLockTgtY;
            if (ddx * ddx + ddy * ddy > AIM_TUNING.BURST_LOCK_MAX_DRIFT * AIM_TUNING.BURST_LOCK_MAX_DRIFT) drifted = true;
        }
        if (!drifted)
        {
            try
            {
                _writeAimArgs(args, _burstLockPos);
            }
            catch (_)
            {}
            return;
        }
    }
    const from = _shooterPos();
    const aim = computeAimForTarget(enemyId, from.x, from.y);
    if (!aim) return;
    if (!scanData.throwsOverWalls && !hasLineOfSight(scanData.myX, scanData.myY, aim.x, aim.y)) return;
    _burstLockPos = aim;
    _burstLockTargetId = enemyId;
    _burstLockUntil = nowMs + AIM_TUNING.BURST_LOCK_MS;
    const lockTgt = targets.get(enemyId);
    if (lockTgt)
    {
        _burstLockTgtX = lockTgt.x;
        _burstLockTgtY = lockTgt.y;
    }
    try
    {
        _writeAimArgs(args, aim);
    }
    catch (_)
    {}
}

function _enemyPtr(enemyId)
{
    const enemies = scanData.enemies || [];
    for (let i = 0; i < enemies.length; i++)
    {
        if (enemies[i].gid === enemyId) return enemies[i].ptr || null;
    }
    return null;
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
            const enemyId = bestTargetId;
            if (!enemyId || !targets.has(enemyId)) return;
            const fired = _firedSkillSpeed(args[4]);
            if (fired.blacklisted) return;
            if (fired.ulti)
            {
                if (!_opts.useSuper || !_superAllowed(scanData.myBrawlerName)) return;
                _aimSuper(args, enemyId);
                return;
            }
            let targetId = 0;
            try
            {
                targetId = args[6].toInt32();
            }
            catch (_)
            {}
            const manual = _opts.onManualAim && targetId === 0;
            const auto = _opts.onAutoshoot && targetId !== 0;
            if (!manual && !auto) return;
            _aimAttack(args, enemyId, fired.speed);
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
            const enemyId = bestTargetId;
            if (!enemyId || !targets.has(enemyId)) return;
            const enemyPtr = _enemyPtr(enemyId);
            if (!enemyPtr || enemyPtr.isNull()) return;
            try
            {
                retval.replace(enemyPtr);
                logEvery(120, "aimbot autoshoot override",
                {
                    target: enemyId,
                    srcAim: aimActive,
                    srcKill: killActive,
                    hasCarryable: !!scanData.hasCarryable,
                    myTeam: scanData.myTeamId
                });
            }
            catch (_)
            {}
        }
    });
}
export function updateAimbot(now)
{
    if (!state.aimbot && !state.killaura || scanData.lastUpdate === 0) return;
    const myX = scanData.myX,
        myY = scanData.myY;
    if (now === void 0) now = Date.now();
    const prevTargetId = bestTargetId;
    bestTargetId = null;
    const enemies = scanData.enemies || [];
    const activeEnemies = [];
    for (let i = 0; i < enemies.length; i++)
    {
        const enemy = enemies[i];
        if (!enemy.brawlerName) continue;
        if (enemy.teamId === scanData.myTeamId) continue;
        const gid = enemy.gid;
        let t = targets.get(gid);
        if (!t)
        {
            t = {
                samples: [],
                haveVelocity: false,
                prevVx: 0,
                prevVy: 0,
                trackedVx: 0,
                trackedVy: 0,
                trackedAx: 0,
                trackedAy: 0,
                lastUpdate: now,
                x: enemy.x,
                y: enemy.y,
                brawlerId: enemy.brawlerId,
                moveSpeed: enemy.moveSpeed || AIM_TUNING.DEFAULT_MOVE_SPEED
            };
            targets.set(gid, t);
        }
        t.x = enemy.x;
        t.y = enemy.y;
        t.brawlerId = enemy.brawlerId;
        if (enemy.moveSpeed > 0) t.moveSpeed = enemy.moveSpeed;
        updateLolTracking(t, enemy.x, enemy.y, now);
        t.lastUpdate = now;
        const losClear = scanData.throwsOverWalls || hasLineOfSight(myX, myY, enemy.x, enemy.y) ? 1 : 0;
        activeEnemies.push(
        {
            gid,
            gidInt: parseInt(gid) | 0,
            x: enemy.x,
            y: enemy.y,
            brawlerId: enemy.brawlerId,
            moveSpeed: t.moveSpeed,
            histLen: t.samples.length,
            vxEma: t.trackedVx,
            vyEma: t.trackedVy,
            losClear
        });
    }
    if (activeEnemies.length > 0)
    {
        const prevGid = prevTargetId ? parseInt(prevTargetId) | 0 : 0;
        const bestGid = pickBestTarget(activeEnemies, myX, myY, prevGid, _ownRange());
        if (bestGid !== 0) bestTargetId = bestGid.toString();
    }
    if (isLoggingEnabled() && bestTargetId !== prevTargetId)
    {
        const nextEnemy = bestTargetId ? targets.get(bestTargetId) : null;
        logInfo("aimbot best target changed",
        {
            prev: prevTargetId,
            next: bestTargetId,
            activeEnemies: activeEnemies.length,
            allEnemies: enemies.length,
            myX: myX | 0,
            myY: myY | 0,
            nextX: nextEnemy ? nextEnemy.x | 0 : 0,
            nextY: nextEnemy ? nextEnemy.y | 0 : 0,
            nextBrawler: nextEnemy ? nextEnemy.brawlerId : 0,
            nextHist: nextEnemy ? nextEnemy.samples.length : 0,
            nextVx: nextEnemy ? +nextEnemy.trackedVx.toFixed(2) : 0,
            nextVy: nextEnemy ? +nextEnemy.trackedVy.toFixed(2) : 0
        });
    }
    if (bestTargetId !== _burstLockTargetId)
    {
        _burstLockPos = null;
        _burstLockTargetId = null;
        _burstLockTgtX = null;
        _burstLockTgtY = null;
    }
    if (now - _lastCleanupTs > 1e3)
    {
        for (const [id, t] of targets)
        {
            if (now - t.lastUpdate > AIM_TUNING.STALE_MS) targets.delete(id);
        }
        for (const [k, v] of _losCache)
        {
            if (now - v.ts > AIM_TUNING.LOS_CACHE_PURGE_MS) _losCache.delete(k);
        }
        _lastCleanupTs = now;
    }
}
