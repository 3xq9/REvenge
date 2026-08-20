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
    getBattleScreen,
    getBattleScreenTs
}
from "./camera.js";
import
{
    attackIntervalMs,
    BATTLE_SCREEN_MAX_AGE_MS,
    castSkill,
    createTargetTracker,
    ERROR_COOLDOWN_MS,
    fireAt,
    MIN_FIRE_GAP_MS,
    resolveFirePoint,
    SKILL_THROTTLE_MS,
    skillDataAt,
    skillProjectileSpeed,
    SUPER_SKILL_SLOT
}
from "../helpers/combat.js";
import
{
    state
}
from "../utils/flags.js";
import
{
    logError,
    logEvery,
    logInfo
}
from "../utils/logger.js";

var STALE_SCAN_MS = 500;

var options = {
    aim: true,
    rangeCheck: true,
    useUlti: false
};
var targets = createTargetTracker();
var errorUntil = 0;
var lastAttackMs = 0;
var lastSuperMs = 0;
var previousUltiHeld = 0;

export function setHoldShootOptions(o)
{
    if (!o || typeof o !== "object") return;
    if (typeof o.aim === "boolean") options.aim = o.aim;
    if (typeof o.rangeCheck === "boolean") options.rangeCheck = o.rangeCheck;
    if (typeof o.useUlti === "boolean") options.useUlti = o.useUlti;
}

export function resetHoldShoot()
{
    targets.reset();
    lastAttackMs = 0;
    lastSuperMs = 0;
    previousUltiHeld = 0;
}

function aimPoint(myX, myY, target, projectileSpeed)
{
    if (options.aim) return resolveFirePoint(myX, myY, target, projectileSpeed);
    return {
        fireX: target.x,
        fireY: target.y
    };
}

export function updateHoldShoot(now)
{
    if (!state.holdshoot) return;
    if (!scanData.battleModeClient || scanData.battleModeClient.isNull()) return;
    const battleScreen = getBattleScreen();
    if (!battleScreen) return;
    if (now === void 0) now = Date.now();
    if (now < errorUntil) return;
    if (now - scanData.lastUpdate > STALE_SCAN_MS) return;
    if (now - getBattleScreenTs() > BATTLE_SCREEN_MAX_AGE_MS) return;
    if (scanData.hasCarryable) return;

    let attackHeld = 0,
        ultiHeld = 0;
    try
    {
        ultiHeld = battleScreen.add(offsets.BattleScreen_ultiJoyHeld).readU8();
        if (!ultiHeld)
        {
            attackHeld = battleScreen.add(offsets.BattleScreen_autoFireBtnHeld).readU8() |
                battleScreen.add(offsets.BattleScreen_attackJoyHeld).readU8();
        }
    }
    catch (_)
    {
        previousUltiHeld = 0;
        return;
    }
    const ultiRising = ultiHeld && !previousUltiHeld;
    previousUltiHeld = ultiHeld;
    if (!attackHeld && !ultiRising) return;

    try
    {
        const own = scanData.ownCharacter;
        if (!own || own.isNull()) return;
        const myX = scanData.myX,
            myY = scanData.myY;
        const target = targets.pick(myX, myY, options.rangeCheck);
        if (!target) return;

        if (attackHeld)
        {
            const interval = Math.max(MIN_FIRE_GAP_MS, attackIntervalMs());
            if (now - lastAttackMs >= interval)
            {
                const fire = aimPoint(myX, myY, target, 0);
                if (fireAt(battleScreen, own, fire.fireX, fire.fireY, target.gid))
                {
                    lastAttackMs = now;
                    logEvery(20, "holdshoot attack",
                    {
                        id: target.gid,
                        x: fire.fireX | 0,
                        y: fire.fireY | 0,
                        myX: myX | 0,
                        myY: myY | 0,
                        dist: Math.hypot(fire.fireX - myX, fire.fireY - myY) | 0
                    });
                }
            }
        }

        if (ultiRising && options.useUlti && now - lastSuperMs >= SKILL_THROTTLE_MS)
        {
            lastSuperMs = now;
            const data = skillDataAt(own, SUPER_SKILL_SLOT);
            const fire = aimPoint(myX, myY, target, skillProjectileSpeed(data));
            logInfo("holdshoot super",
            {
                id: target.gid,
                x: fire.fireX | 0,
                y: fire.fireY | 0,
                myX: myX | 0,
                myY: myY | 0,
                dist: Math.hypot(fire.fireX - myX, fire.fireY - myY) | 0,
                resolved: !!data
            });
            castSkill(data, myX, myY, fire.fireX, fire.fireY);
        }
    }
    catch (e)
    {
        errorUntil = Date.now() + ERROR_COOLDOWN_MS;
        logError("holdshoot tick failed",
        {
            err: String(e && e.message || e)
        });
    }
}
