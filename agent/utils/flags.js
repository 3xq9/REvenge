import
{
    logInfo,
    logError
}
from "./logger.js";

var FEATURE_NAMES = [
    "aimbot",
    "autododge",
    "esp",
    "spinner",
    "killaura",
    "camera",
    "spray",
    "pin",
    "brawltv",
    "spec",
    "chatspam",
    "fps",
    "gradient",
    "holdshoot",
    "speedhack"
];

var FLAG_OF = {};
export var state = {};
FEATURE_NAMES.forEach((name, index) =>
{
    FLAG_OF[name] = 1 << index;
    state[name] = false;
});

export var FLAG_AIMBOT = FLAG_OF.aimbot;
export var FLAG_AUTODODGE = FLAG_OF.autododge;
export var FLAG_ESP = FLAG_OF.esp;
export var FLAG_SPINNER = FLAG_OF.spinner;
export var FLAG_KILLAURA = FLAG_OF.killaura;
export var FLAG_SPRAY = FLAG_OF.spray;
export var FLAG_PIN = FLAG_OF.pin;
export var FLAG_HOLDSHOOT = FLAG_OF.holdshoot;
export var FLAG_SPEEDHACK = FLAG_OF.speedhack;

var _flags = 0;
export function setState(feature, value)
{
    if (!(feature in state)) return;
    const enabled = !!value;
    state[feature] = enabled;
    if (enabled) _flags |= FLAG_OF[feature];
    else _flags &= ~FLAG_OF[feature];
}
export function getFlags()
{
    return _flags;
}
export function setupSafe(label, fn)
{
    try
    {
        fn();
        logInfo(label + " ready");
        return true;
    }
    catch (e)
    {
        const reason = e && e.message ? e.message : String(e);
        logError(label + " setup failed",
        {
            reason
        });
        try
        {
            send(
            {
                type: "ERROR",
                code: 2,
                text: `setup ${label}: ${reason}`
            });
        }
        catch (_)
        {}
        return false;
    }
}
