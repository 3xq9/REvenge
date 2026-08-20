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
    activateHypercharge,
    attackIntervalMs,
    BATTLE_SCREEN_MAX_AGE_MS,
    castSkill,
    createTargetTracker,
    ERROR_COOLDOWN_MS,
    fireAt,
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
import
{
    canonBrawlerName
}
from "../utils/brawlerName.js";

var STALE_SCAN_MS = 500;

var options = {
    useAttack: true,
    useSuper: false,
    useHyper: false
};
var superBrawlers = new Set();
var targets = createTargetTracker();
var errorUntil = 0;
var lastAttackMs = 0;
var lastSuperMs = 0;
var lastHyperMs = 0;

export function setKillauraOptions(o)
{
    if (!o || typeof o !== "object") return;
    if (typeof o.useAttack === "boolean") options.useAttack = o.useAttack;
    if (typeof o.useSuper === "boolean") options.useSuper = o.useSuper;
    if (typeof o.useHyper === "boolean") options.useHyper = o.useHyper;
    if (Array.isArray(o.superBrawlers))
    {
        superBrawlers = new Set();
        for (const name of o.superBrawlers)
        {
            const id = canonBrawlerName(name);
            if (id) superBrawlers.add(id);
        }
    }
}

export function resetKillaura()
{
    targets.reset();
    lastAttackMs = 0;
    lastSuperMs = 0;
    lastHyperMs = 0;
}

function superAllowed(name)
{
    if (superBrawlers.size === 0) return true;
    return !!name && superBrawlers.has(name);
}

export function updateKillaura(now)
{
    if (!state.killaura) return;
    if (!options.useAttack && !options.useSuper && !options.useHyper) return;
    const battleScreen = getBattleScreen();
    if (!battleScreen) return;
    if (now === void 0) now = Date.now();
    if (now < errorUntil) return;
    if (now - scanData.lastUpdate > STALE_SCAN_MS) return;
    if (now - getBattleScreenTs() > BATTLE_SCREEN_MAX_AGE_MS) return;
    if (scanData.hasCarryable) return;
    try
    {
        const own = scanData.ownCharacter;
        if (!own || own.isNull()) return;
        const myX = scanData.myX,
            myY = scanData.myY;
        const target = targets.pick(myX, myY);
        if (!target) return;

        if (options.useAttack && now - lastAttackMs >= attackIntervalMs())
        {
            const fire = resolveFirePoint(myX, myY, target, 0);
            if (fireAt(battleScreen, own, fire.fireX, fire.fireY, target.gid))
            {
                lastAttackMs = now;
                logEvery(20, "killaura attack",
                {
                    id: target.gid,
                    x: fire.fireX | 0,
                    y: fire.fireY | 0,
                    myX: myX | 0,
                    myY: myY | 0,
                    dist: Math.hypot(fire.fireX - myX, fire.fireY - myY) | 0,
                    brawler: scanData.myBrawlerName || ""
                });
            }
        }

        if (options.useSuper && now - lastSuperMs >= SKILL_THROTTLE_MS && superAllowed(scanData.myBrawlerName))
        {
            lastSuperMs = now;
            const data = skillDataAt(own, SUPER_SKILL_SLOT);
            const fire = resolveFirePoint(myX, myY, target, skillProjectileSpeed(data));
            logInfo("killaura super",
            {
                id: target.gid,
                x: fire.fireX | 0,
                y: fire.fireY | 0,
                myX: myX | 0,
                myY: myY | 0,
                dist: Math.hypot(fire.fireX - myX, fire.fireY - myY) | 0,
                resolved: !!data,
                brawler: scanData.myBrawlerName || ""
            });
            castSkill(data, myX, myY, fire.fireX, fire.fireY);
        }

        if (options.useHyper && now - lastHyperMs >= SKILL_THROTTLE_MS)
        {
            lastHyperMs = now;
            logInfo("killaura hypercharge",
            {
                id: target.gid,
                x: target.x | 0,
                y: target.y | 0,
                myX: myX | 0,
                myY: myY | 0,
                dist: Math.hypot(target.x - myX, target.y - myY) | 0,
                brawler: scanData.myBrawlerName || ""
            });
            activateHypercharge();
        }
    }
    catch (e)
    {
        errorUntil = Date.now() + ERROR_COOLDOWN_MS;
        logError("killaura tick failed",
        {
            err: String(e && e.message || e)
        });
    }
}
