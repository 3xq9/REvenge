export const FITS = {
    orbit:
    {
        grow: 0.65,
        close: 18000,
        pad: 120,
        closeR: 420
    },
    long:
    {
        grow: 0.55,
        close: 12000,
        pad: 90,
        closeR: 360
    },
    thick:
    {
        grow: 0.6,
        close: 14000,
        pad: 100,
        closeR: 380
    },
    broad:
    {
        grow: 0.45,
        close: 9000,
        pad: 70,
        closeR: 320
    },
    half:
    {
        grow: 0.4,
        close: 6000,
        pad: 50,
        closeR: 260
    },
    plain:
    {
        grow: 0.45,
        close: 6000,
        pad: 60,
        closeR: 280
    },
    ray:
    {
        grow: 0.5,
        close: 11000,
        pad: 80,
        closeR: 340
    },
    thin:
    {
        grow: 0.35,
        close: 5000,
        pad: 40,
        closeR: 240
    },
    fallback:
    {
        grow: 0.45,
        close: 6000,
        pad: 60,
        closeR: 280
    }
};

export const KINDS = {
    GunslingerProjectile:
    {
        fit: "thin"
    },
    GunslingerOverchargedProjectile:
    {
        fit: "thin",
        maxRange: 2600
    },
    BeeSniperProjectile:
    {
        fit: "thin",
        maxRange: 3000
    },
    BeeSniperCirclingProjectile:
    {
        fit: "orbit",
        blob: true
    },
    BeeSniperChargedProjectile:
    {
        fit: "long",
        strip: true,
        maxRange: 2200
    },
    BeeSniperUltiProjectile:
    {
        fit: "orbit",
        blob: true
    },
    PiperHandgunProjectile:
    {
        fit: "half",
        maxRange: 2200
    },
    SniperProjectile:
    {
        fit: "long",
        strip: true
    },
    BeamerProjectile:
    {
        fit: "ray",
        chargedRange: 3900,
        speedMul: 1.15,
        strip: true
    },
    BulletstormLastShotProjectile:
    {
        fit: "long",
        maxRange: 3300
    },
    BulletstormOnShellPickedUpProjectile:
    {
        fit: "plain",
        maxRange: 3300,
        close: 8000
    },
    ElectroSniperProjectile:
    {
        fit: "long",
        strip: true
    },
    ElectroSniperMutantProjectile:
    {
        fit: "long",
        strip: true
    },
    ElectroSniperUltiProjectile:
    {
        fit: "broad"
    },
    ElectroSniperOverchargedUltiProjectile:
    {
        fit: "broad"
    },
    ElectroSniperBounceProjectile:
    {
        fit: "half"
    },
    ElectroSniperSecondaryProjectile_001:
    {
        fit: "half"
    },
    HookProjectile:
    {
        fit: "long"
    },
    SnakeOilProjectile:
    {
        fit: "long",
        strip: true
    },
    SnakeOilUltiProjectile:
    {
        fit: "broad",
        blob: true
    },
    SnakeOilHyperUltiProjectile:
    {
        fit: "broad",
        blob: true
    },
    HookProjectile2:
    {
        drop: true
    },
    SoulCollectorProjectile:
    {
        fit: "plain"
    },
    SoulCollectorUlti:
    {
        fit: "broad",
        blob: true
    },
    MosquitoProjectile:
    {
        fit: "thin"
    },
    MosquitoProjectilePoison:
    {
        fit: "long",
        strip: true,
        maxRange: 3300
    },
    SpeedyProjectile:
    {
        fit: "thin"
    },
    SpeedyOverchargedProjectile:
    {
        fit: "thin"
    },
    RollerProjectile:
    {
        fit: "broad"
    },
    RollerGadgetProjectile:
    {
        fit: "plain"
    },
    BowDudeProjectile:
    {
        fit: "plain"
    },
    BowDudeOverchargedProjectile:
    {
        fit: "plain"
    },
    BowDudeProjectileTripWire:
    {
        fit: "long",
        blob: true
    },
    BowDudeProjectileTripWireBuddy:
    {
        fit: "long",
        blob: true
    },
    BowDudeGadgetSkillProjectile:
    {},
    BowDudeGadgetSkillProjectileBuddy:
    {},
    BowDudeSpawnMineProjectile:
    {
        drop: true
    },
    BowDudeSpawnOverchargedMineProjectile:
    {
        drop: true
    },
    RocketGirlProjectile:
    {
        fit: "thick",
        blast: true,
        lockPath: true,
        growR: 280
    },
    RocketGirlGadgetProjectile:
    {
        fit: "broad",
        maxRange: 3000
    },
    RocketGirlUltiProjectile:
    {
        fit: "thick",
        blast: true,
        growR: 280
    },
    RocketGirlUltiOverchargedProjectile:
    {
        fit: "thick",
        blast: true,
        growR: 280
    },
    CannonGirlProjectile:
    {
        fit: "long",
        strip: true
    },
    CannonGirlSmallProjectile:
    {
        fit: "broad"
    },
    CannonGirlChainProjectile:
    {
        fit: "half"
    },
    CannonGirlExplosionProjectileOvercharged:
    {
        fit: "long",
        blob: true
    },
    KnightProjectile1:
    {
        fit: "thick"
    },
    KnightProjectile2:
    {
        fit: "thick"
    },
    KnightProjectile3:
    {
        fit: "thick"
    },
    KnightUltiProjectile:
    {
        fit: "thick"
    },
    DuplicatorProjectile:
    {
        fit: "long"
    },
    OverchargedDuplicatorProjectile:
    {
        fit: "long"
    },
    DuplicatorUltiProjectile:
    {
        fit: "broad",
        blob: true
    },
    OverchargedDuplicatorUltiProjectile:
    {
        fit: "broad",
        blob: true
    },
    SpawnerDudeProjectile:
    {
        fit: "long",
        strip: true,
        growR: 250
    },
    SpawnerDudeMutantProjectile:
    {
        fit: "long"
    },
    SpawnerDudeIndirectProjectile:
    {
        fit: "broad",
        blob: true
    },
    SpawnerDudeUltiProjectile:
    {
        fit: "broad",
        blob: true
    },
    SpawnerDudeOverchargedUltiProjectile:
    {
        fit: "broad",
        blob: true
    },
    CocoonerProjectile:
    {
        fit: "long",
        strip: true,
        growR: 150,
        reachAdj: -150
    },
    CocoonerProjectile2:
    {
        fit: "long",
        growR: 150,
        home: true
    },
    CocoonerUltiProjectile:
    {
        fit: "broad",
        blob: true
    },
    CocoonerOverchargedUltiProjectile:
    {
        fit: "broad",
        blob: true
    },
    AmbusherProjectile:
    {
        fit: "thick"
    },
    AmbusherUltiProjectile:
    {
        fit: "long"
    },
    AmbusherUltiProjectile2:
    {
        fit: "long"
    },
    AmbusherOverchargedUltiProjectile:
    {
        fit: "long"
    },
    CrabProjectile:
    {
        fit: "long",
        strip: true
    },
    CrabUltiProjectile:
    {
        fit: "broad"
    },
    CrabOverchargedUltiProjectile:
    {
        fit: "broad"
    },
    CrabOverchargedUltiReturnProjectile:
    {
        fit: "broad"
    },
    FishTankUltiProjectile:
    {
        fit: "broad"
    },
    FishTankUltiProjectileSmall:
    {
        fit: "broad"
    },
    CookerProjectile:
    {
        fit: "long",
        strip: true,
        reachAdj: -450
    },
    MaisieProjectile:
    {
        fit: "long",
        strip: true,
        lockPath: true,
        reachAdj: 900,
        fade: true,
        fadeBase: 786.63,
        fadeK: 0.001231
    },
    TrickShotDudeProjectile:
    {
        fit: "thin"
    },
    TrickShotDudeUltiProjectile:
    {
        fit: "thin"
    },
    TrickShotDudeOverchargedProjectile:
    {
        fit: "thin"
    },
    ControllerProjectile:
    {
        fit: "broad",
        growR: 150,
        reachAdj: 600
    },
    ControllerArchetypeCollabProjectileLvl1:
    {
        fit: "plain"
    },
    ControllerArchetypeCollabProjectileLvl2:
    {
        fit: "plain"
    },
    ControllerArchetypeCollabProjectileLvl3:
    {
        fit: "plain"
    },
    ControllerUltiProjectile:
    {
        fit: "broad",
        growR: 150
    },
    ControllerUltiOverchargedProjectile:
    {
        fit: "broad",
        growR: 150
    },
    AxeJugglerProjectile:
    {
        fit: "broad",
        reachAdj: 200
    },
    AxeJugglerProjectile2:
    {
        fit: "long"
    },
    AxeJugglerOverchargedProjectile2:
    {
        fit: "long"
    },
    SplitterProjectile:
    {
        fit: "long"
    },
    ArtilleryDudeProjectile:
    {
        fit: "broad",
        strip: true
    },
    ArtilleryDudeProjectile2:
    {
        fit: "thin"
    },
    ArtilleryDudeUltiProjectile:
    {
        fit: "broad",
        blob: true
    },
    ArtilleryDudeOverchargedUltiProjectile:
    {
        fit: "broad",
        blob: true
    },
    ArtilleryDudeTurretProjectile:
    {
        drop: true
    },
    ArtilleryDudeOverchargedTurretProjectile:
    {
        drop: true
    },
    PercenterProjectile:
    {
        fit: "long",
        strip: true,
        lockPath: true,
        maxRange: 2800
    },
    PercenterOverchargedProjectile:
    {
        fit: "long",
        strip: true,
        lockPath: true,
        maxRange: 2800
    },
    MeepleProjectile:
    {
        fit: "plain",
        growR: 150,
        reachAdj: 200
    },
    MeepleUltiProjectile:
    {
        fit: "broad",
        blob: true
    },
    MeepleOverchargedUltiProjectile:
    {
        fit: "broad",
        blob: true
    },
    MeepleWallProjectile:
    {
        drop: true
    },
    ShamanProjectile:
    {
        fit: "long",
        strip: true
    },
    CoopRangedEnemyProjectile:
    {
        maxRange: 2500
    },
    SniperHomingProjectile:
    {
        fit: "long",
        maxRange: 3500,
        growR: 100,
        strip: true
    },
    MechanicProjectile2:
    {
        fit: "fallback",
        maxRange: 2000
    },
    MechanicProjectile3:
    {
        fit: "fallback",
        maxRange: 2000
    },
    DoorManCaneGadgetProjectile:
    {
        fit: "fallback",
        maxRange: 3000
    },
    MummyProjectile:
    {
        fit: "long",
        growR: 150,
        reachAdj: -750,
        fade: true,
        fadeBase: 4461.04,
        fadeK: -0.000971
    },
    WhirlwindProjectile:
    {
        fit: "long",
        growR: 250,
        reachAdj: -250,
        lockPath: true,
        home: true
    },
    WhirlwindProjectile2:
    {
        growR: 250,
        home: true
    },
    MorningstarProjectile:
    {
        growR: 150,
        maxRange: 2700,
        home: true
    },
    MorningstarProjectileRecall:
    {
        growR: 150,
        home: true
    },
    AlternatorHealProjectile:
    {
        fit: "fallback",
        maxRange: 2800
    },
    AlternatorDamageProjectile:
    {
        fit: "fallback",
        maxRange: 2800
    },
    KickerDudeProjectile2:
    {
        fit: "fallback",
        maxRange: 2200
    },
    DancerProjectileSingle:
    {
        fit: "fallback",
        maxRange: 2700
    },
    DancerProjectileDouble:
    {
        fit: "fallback",
        maxRange: 2500
    },
    DancerProjectileTriple:
    {
        fit: "fallback",
        maxRange: 1700
    }
};

export function kindOf(name)
{
    return name && KINDS[name] || null;
}

export function fitOf(name)
{
    const spec = kindOf(name);
    if (spec && spec.fit && FITS[spec.fit]) return FITS[spec.fit];
    return FITS.fallback;
}
