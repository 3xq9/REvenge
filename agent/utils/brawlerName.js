const ALIASES = {
    "8-BIT": "8BIT",
    EL_PRIMO: "PRIMO",
    ELPRIMO: "PRIMO",
    MR_P: "MRP",
    "MR.P": "MRP",
    LARRY_AND_LAWRIE: "TWINS",
    LOLA: "LOLLA",
    MELODIE: "MELODY",
    JESSIE: "JESS",
    DYNAMIKE: "MIKE",
    DARRYL: "BARRELBOT",
    HANK: "FISHTANK",
    MOE: "DIGGER",
    GLOWY: "GLOWBERT",
    BOLT: "BOLDER",
    KENJI: "SAMURAI",
    TARA: "TARO",
    RICO: "RICK",
    STARR_NOVA: "STELLA",
    PAM: "MJ",
    SAM: "BRONSON",
    "JAE-YONG": "JAE",
    JAE_YONG: "JAE"
};

export function canonBrawlerName(name)
{
    if (!name) return null;
    const upper = String(name).trim().toUpperCase().replace(/\s+/g, "_");
    return ALIASES[upper] || upper;
}
