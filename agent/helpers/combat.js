import
{
    sendCommand
}
from "../core/commands.js";
import
{
    getBase,
    getFunctions
}
from "../core/functions.js";
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
    computeAimForTarget
}
from "../features/aimbot.js";
import
{
    BLOCKS_PROJECTILES,
    losCheck
}
from "../utils/wallCache.js";

export var CASTING_RANGE_SCALE = 100;
export var BATTLE_SCREEN_MAX_AGE_MS = 200;
var FALLBACK_INTERVAL_MS = 1e3;
var STICKY_RANGE_BUFFER = 200;
export var ERROR_COOLDOWN_MS = 2e3;
export var SKILL_THROTTLE_MS = 1500;
export var MIN_FIRE_GAP_MS = 80;
export var SUPER_SKILL_SLOT = 1;
var HYPER_COMMAND_TYPE = 0x11;

var UNBOUNDED_DISTANCE_SQ = 1e18;
var MAX_ATTACK_INTERVAL_MS = 1e4;
var SKILL_KIND_MIN = 2;
var SKILL_KIND_MAX = 5;
var SKILL_LINKED_BEHAVIOUR = 3;

var _attackIntervalByBrawler = new Map();

export function setupCombat()
{}

export function resetCombat()
{
    _attackIntervalByBrawler.clear();
}

function isImmune(character)
{
    const fn = getFunctions().LogicCharacterClient_isImmuneOrUntargetable;
    if (!fn || !character || character.isNull()) return false;
    try
    {
        return !!fn(character);
    }
    catch (_)
    {
        return false;
    }
}

function weaponSkillData()
{
    try
    {
        const own = scanData.ownCharacter;
        if (!own || own.isNull()) return null;
        const skill = getFunctions().LogicCharacterClient_getWeaponSkill(own);
        return skill && !skill.isNull() ? skill : null;
    }
    catch (_)
    {
        return null;
    }
}

export function attackIntervalMs()
{
    const brawlerId = scanData.myBrawlerId | 0;
    if (_attackIntervalByBrawler.has(brawlerId)) return _attackIntervalByBrawler.get(brawlerId);
    let ms = 0;
    try
    {
        const skill = weaponSkillData();
        const fn = getFunctions().LogicSkillData_getMsBetweenAttacks;
        if (fn && skill)
        {
            const value = fn(skill) | 0;
            if (value > 0 && value < MAX_ATTACK_INTERVAL_MS) ms = value;
        }
    }
    catch (_)
    {
        ms = 0;
    }
    if (ms <= 0) ms = FALLBACK_INTERVAL_MS;
    if (brawlerId > 0) _attackIntervalByBrawler.set(brawlerId, ms);
    return ms;
}

export function characterRange(character)
{
    try
    {
        if (!character || character.isNull()) return 0;
        const fns = getFunctions();
        if (!fns.LogicCharacterClient_getWeaponSkill || !fns.LogicSkillData_getCastingRange) return 0;
        const skill = fns.LogicCharacterClient_getWeaponSkill(character);
        if (!skill || skill.isNull()) return 0;
        const tiles = fns.LogicSkillData_getCastingRange(skill) | 0;
        if (tiles <= 0) return 0;
        return tiles * CASTING_RANGE_SCALE;
    }
    catch (_)
    {
        return 0;
    }
}

export function weaponRange()
{
    return characterRange(scanData.ownCharacter);
}

export function createTargetTracker()
{
    let stickyGid = null;

    function reachable(enemy, myX, myY, launcher)
    {
        if (isImmune(enemy.ptr)) return false;
        return launcher || losCheck(myX, myY, enemy.x, enemy.y, BLOCKS_PROJECTILES);
    }

    return {
        reset()
        {
            stickyGid = null;
        },
        pick(myX, myY, rangeCheck = true)
        {
            const range = weaponRange();
            if (range <= 0) return null;
            const rangeSq = rangeCheck ? range * range : UNBOUNDED_DISTANCE_SQ;
            const stickyRange = range + STICKY_RANGE_BUFFER;
            const stickyRangeSq = rangeCheck ? stickyRange * stickyRange : UNBOUNDED_DISTANCE_SQ;
            const launcher = scanData.throwsOverWalls;
            const enemies = scanData.enemies || [];
            let best = null;

            if (stickyGid)
            {
                for (const enemy of enemies)
                {
                    if (enemy.gid !== stickyGid) continue;
                    const dx = enemy.x - myX,
                        dy = enemy.y - myY;
                    if (dx * dx + dy * dy < stickyRangeSq && reachable(enemy, myX, myY, launcher))
                    {
                        best = enemy;
                    }
                    break;
                }
                if (!best) stickyGid = null;
            }

            if (!best)
            {
                let bestDistanceSq = UNBOUNDED_DISTANCE_SQ;
                for (const enemy of enemies)
                {
                    const dx = enemy.x - myX,
                        dy = enemy.y - myY,
                        distanceSq = dx * dx + dy * dy;
                    if (distanceSq >= rangeSq || distanceSq >= bestDistanceSq) continue;
                    if (!reachable(enemy, myX, myY, launcher)) continue;
                    bestDistanceSq = distanceSq;
                    best = enemy;
                }
            }

            if (!best) return null;
            stickyGid = best.gid;
            return {
                gid: best.gid,
                x: best.x,
                y: best.y
            };
        }
    };
}

export function resolveFirePoint(myX, myY, target, projectileSpeed)
{
    const aim = computeAimForTarget(target.gid, myX, myY, projectileSpeed);
    if (aim) return {
        fireX: aim.x,
        fireY: aim.y
    };
    return {
        fireX: target.x,
        fireY: target.y
    };
}

export function hasWeaponAmmo(own)
{
    const fns = getFunctions();
    if (!fns.LogicCharacterClient_getSkillAt || !fns.LogicSkillClient_canActivate || !own || own.isNull()) return true;
    try
    {
        const skill = fns.LogicCharacterClient_getSkillAt(own, 0);
        if (!skill || skill.isNull()) return true;
        return !!fns.LogicSkillClient_canActivate(skill, ptr(0), own);
    }
    catch (_)
    {
        return true;
    }
}

export function fireAt(battleScreen, own, fireX, fireY, targetGid)
{
    const fire = getFunctions().BattleScreen_fireWrapper;
    if (!fire) return false;
    if (!hasWeaponAmmo(own)) return false;
    const gid = parseInt(targetGid, 10);
    if (!isFinite(gid) || gid <= 0) return false;
    try
    {
        battleScreen.add(offsets.BattleScreen_aimX).writeS32(fireX);
        battleScreen.add(offsets.BattleScreen_aimY).writeS32(fireY);
        battleScreen.add(offsets.BattleScreen_aimTargetId).writeS32(gid);
        fire(battleScreen, own);
        return true;
    }
    catch (_)
    {
        return false;
    }
}

export function skillDataAt(own, slot)
{
    const fns = getFunctions();
    if (!fns.LogicCharacterClient_getSkillAt || !fns.LogicSkillClient_getData || !own || own.isNull()) return null;
    try
    {
        const skill = fns.LogicCharacterClient_getSkillAt(own, slot);
        if (!skill || skill.isNull()) return null;
        const hypercharged = own.add(offsets.LogicCharacterClient_hyperActive).readU8() !== 0 ? 1 : 0;
        let data = fns.LogicSkillClient_getData(skill, hypercharged);
        if (!data || data.isNull()) return null;
        if (fns.LogicSkillData_getBehaviour && fns.LogicSkillData_getLinkedSkill && fns.LogicSkillData_getBehaviour(data) === SKILL_LINKED_BEHAVIOUR)
        {
            const linked = fns.LogicSkillData_getLinkedSkill(data);
            if (linked && !linked.isNull()) data = linked;
        }
        return data;
    }
    catch (_)
    {
        return null;
    }
}

export function skillProjectileSpeed(data)
{
    if (!data || data.isNull()) return 0;
    try
    {
        const fns = getFunctions();
        const projectile = fns.LogicSkillData_getProjectileData(data, 0);
        if (!projectile || projectile.isNull()) return 0;
        return fns.LogicProjectileData_getSpeed(projectile) | 0;
    }
    catch (_)
    {
        return 0;
    }
}

function _skillCommandType(data)
{
    try
    {
        const kind = data.add(offsets.LogicSkillData_kind).readS32();
        if (kind < SKILL_KIND_MIN || kind > SKILL_KIND_MAX) return 0;
        return getBase().add(offsets.SkillCommandTypeTable).add((kind - SKILL_KIND_MIN) * 4).readU32();
    }
    catch (_)
    {
        return 0;
    }
}

export function castSkill(data, myX, myY, fireX, fireY)
{
    if (!data) return false;
    const commandType = _skillCommandType(data);
    if (!commandType) return false;
    return sendCommand(commandType, (ci) =>
    {
        ci.add(offsets.ClientInput_x).writeS32(fireX - myX | 0);
        ci.add(offsets.ClientInput_y).writeS32(fireY - myY | 0);
        ci.add(offsets.ClientInput_skillData).writePointer(data);
    });
}

export function activateHypercharge()
{
    return sendCommand(HYPER_COMMAND_TYPE, null);
}
