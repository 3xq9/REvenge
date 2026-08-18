import
{
    BLOCKS_PROJECTILES,
    traceWallHit
}
from "../utils/wallCache.js";

const LOGIC_TICK_MS = 50;
const SPIKE = {
    spokes: 6,
    childRadius: 50,
    spawnOffset: 200,
    childTravel: 1100,
    flightDist: 2035,
    flightTimeMs: 963,
    burstLifeMs: 360,
    blastMs: 700,
    curveDeviationDeg: 22
};
SPIKE.armLength = SPIKE.spawnOffset + SPIKE.childTravel;
const SPIKE_CURVE_ARC = [
    [0, 200, 0],
    [110, 515, 32],
    [207, 797, 216],
    [312, 999, 519],
    [411, 1066, 930],
    [513, 995, 1377],
    [557, 883, 1611]
];
var _spikeVariant = null;

function _crossProfile(spec)
{
    const armLength = spec.spawnOffset + spec.childTravel;
    const burstLifeMs = spec.childTravel / spec.childSpeed * 1e3;
    return function(projectile, now)
    {
        const cx = projectile.targetX;
        const cy = projectile.targetY;
        if (!isFinite(cx) || !isFinite(cy)) return null;
        if (cx === 0 || cy === 0) return null;
        if (Math.abs(cx) > 1e6 || Math.abs(cy) > 1e6) return null;
        const landAt = (projectile.spawnedAt || now) + spec.flightTimeMs;
        const t0 = landAt - LOGIC_TICK_MS;
        const t1 = landAt + burstLifeMs + LOGIC_TICK_MS;
        return [
        {
            ax: cx - armLength,
            ay: cy,
            bx: cx + armLength,
            by: cy,
            radius: spec.childRadius,
            t0,
            t1
        },
        {
            ax: cx,
            ay: cy - armLength,
            bx: cx,
            by: cy + armLength,
            radius: spec.childRadius,
            t0,
            t1
        }];
    };
}

function _spikeEndpoint(projectile)
{
    const rad = (projectile.angle || 0) * Math.PI / 180;
    const dirX = Math.cos(rad);
    const dirY = Math.sin(rad);
    const dist = traceWallHit(projectile.spawnX, projectile.spawnY, dirX, dirY, SPIKE.flightDist, BLOCKS_PROJECTILES);
    return {
        x: projectile.spawnX + dirX * dist,
        y: projectile.spawnY + dirY * dist,
        dist
    };
}

function _cactusProfile(projectile, now)
{
    if (!_spikeVariant) return null;
    const end = _spikeEndpoint(projectile);
    const burstAt = (projectile.spawnedAt || now) + SPIKE.flightTimeMs * (end.dist / SPIKE.flightDist);
    const hazards = [];
    if (projectile.spawnAreaRadius > 0)
    {
        hazards.push(
        {
            x: end.x,
            y: end.y,
            radius: projectile.spawnAreaRadius,
            t0: burstAt,
            t1: burstAt + (projectile.spawnAreaActiveTime || SPIKE.blastMs)
        });
    }
    if (_spikeVariant === "straight")
    {
        const t0 = burstAt - LOGIC_TICK_MS;
        const t1 = burstAt + SPIKE.burstLifeMs + LOGIC_TICK_MS;
        for (let i = 0; i < 3; i++)
        {
            const a = i * Math.PI / 3;
            const dx = Math.cos(a) * SPIKE.armLength;
            const dy = Math.sin(a) * SPIKE.armLength;
            hazards.push(
            {
                ax: end.x - dx,
                ay: end.y - dy,
                bx: end.x + dx,
                by: end.y + dy,
                radius: SPIKE.childRadius,
                t0,
                t1
            });
        }
        return hazards;
    }
    for (let s = 0; s < SPIKE.spokes; s++)
    {
        const rot = s * (2 * Math.PI / SPIKE.spokes);
        const cr = Math.cos(rot);
        const sr = Math.sin(rot);
        for (let k = 0; k + 1 < SPIKE_CURVE_ARC.length; k++)
        {
            const ta = SPIKE_CURVE_ARC[k][0];
            const ax = SPIKE_CURVE_ARC[k][1];
            const ay = SPIKE_CURVE_ARC[k][2];
            const tb = SPIKE_CURVE_ARC[k + 1][0];
            const bx = SPIKE_CURVE_ARC[k + 1][1];
            const by = SPIKE_CURVE_ARC[k + 1][2];
            hazards.push(
            {
                ax: end.x + ax * cr - ay * sr,
                ay: end.y + ax * sr + ay * cr,
                bx: end.x + bx * cr - by * sr,
                by: end.y + bx * sr + by * cr,
                radius: SPIKE.childRadius,
                t0: burstAt + ta,
                t1: burstAt + tb
            });
        }
    }
    return hazards;
}

export function noteBurstDeath(record)
{
    if (_spikeVariant || !record || record.name !== "CactusProjectile") return;
    const dx = record.x - record.spawnX;
    const dy = record.y - record.spawnY;
    if (dx * dx + dy * dy < 1) return;
    const chord = Math.atan2(dy, dx) * 180 / Math.PI;
    let deviation = Math.abs(((chord - (record.angle || 0)) % 360 + 540) % 360 - 180);
    _spikeVariant = deviation > SPIKE.curveDeviationDeg ? "curve" : "straight";
}

export function resetProfiles()
{
    _spikeVariant = null;
}

const _profiles = new Map([
    ["CrossBomberProjectile", _crossProfile(
    {
        childRadius: 125,
        childSpeed: 3e3,
        spawnOffset: 200,
        childTravel: 800,
        flightTimeMs: 1015
    })],
    ["CrossBomberUltiProjectile", _crossProfile(
    {
        childRadius: 375,
        childSpeed: 3e3,
        spawnOffset: 100,
        childTravel: 1600,
        flightTimeMs: 1115
    })],
    ["CactusProjectile", _cactusProfile],
    ["CactusSpike", function()
    {
        return _spikeVariant ? [] : null;
    }]
]);

const _replaceGeneric = new Set(["CrossBomberProjectile", "CrossBomberUltiProjectile", "CactusSpike"]);

export function blocksLinear(name)
{
    return !!name && _replaceGeneric.has(name);
}

export function shapeHazards(projectile, now)
{
    if (!projectile || !projectile.name) return null;
    const profile = _profiles.get(projectile.name);
    if (!profile) return null;
    return profile(projectile, now);
}
