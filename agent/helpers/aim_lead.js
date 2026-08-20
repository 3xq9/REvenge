import
{
    canonBrawlerName
}
from "../utils/brawlerName.js";

export const LEAD_DEFAULT = 65;

export const LEAD = Object.freeze(
{
    "8BIT": 70,
    AMBER: 83,
    ANGELO: 60,
    BEA: 56,
    BELLE: 56,
    BO: 74,
    BONNIE: 59,
    BROCK: 70,
    BYRON: 59,
    CARL: 76,
    CLANCY: 72,
    COLETTE: 57,
    COLT: 62,
    EVE: 75,
    FINX: 68,
    GALE: 68,
    GRAY: 56,
    GRIFF: 68,
    GUS: 68,
    JAE: 60,
    JANET: 65,
    JESS: 72,
    LILY: 68,
    LOU: 60,
    MAISIE: 78,
    MANDY: 65,
    MAX: 68,
    MEG: 54,
    MRP: 65,
    NANI: 98,
    OTIS: 60,
    MJ: 69,
    PEARL: 69,
    PENNY: 61,
    PIPER: 56,
    RICK: 68,
    RT: 55,
    RUFFS: 66,
    SPIKE: 65,
    SQUEAK: 74,
    STU: 60,
    SURGE: 72
});

export function leadOf(name)
{
    const id = canonBrawlerName(name);
    if (id && LEAD[id] > 0) return LEAD[id];
    return LEAD_DEFAULT;
}
