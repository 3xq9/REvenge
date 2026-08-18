import
{
    offsets
}
from "./offsets.js";
import
{
    getBase,
    getFunctions
}
from "./functions.js";
import
{
    sha256
}
from "../utils/crypto.js";

const CMD_BUF_SIZE = 72;
const _zeroBuf = new Uint8Array(CMD_BUF_SIZE).buffer;

const MAX_TABLE_TYPE = 0x16;
const TABLE_ENTRIES = MAX_TABLE_TYPE + 1;
const FALLBACK_TYPE_CONST = 0xdeadbeef;
const MASK_SIZE = 16;

var _typeTable = null;
var _innerMask = null;
var _outerMask = null;

function _loadSigningConstants()
{
    if (_typeTable) return true;
    const base = getBase();
    const raw = base.add(offsets.ClientInput_typeConstantTable).readByteArray(TABLE_ENTRIES * 4);
    const bytes = new Uint8Array(raw);
    const table = new Uint32Array(TABLE_ENTRIES);
    for (let i = 0; i < TABLE_ENTRIES; i++)
    {
        table[i] = (bytes[i * 4] | (bytes[i * 4 + 1] << 8) | (bytes[i * 4 + 2] << 16) | (bytes[i * 4 + 3] << 24)) >>> 0;
    }
    _innerMask = new Uint8Array(base.add(offsets.ClientInput_hashInnerMask).readByteArray(MASK_SIZE));
    _outerMask = new Uint8Array(base.add(offsets.ClientInput_hashOuterMask).readByteArray(MASK_SIZE));
    _typeTable = table;
    return true;
}

function _concat(a, b)
{
    const out = new Uint8Array(a.length + b.length);
    out.set(a);
    out.set(b, a.length);
    return out;
}

function _makeHashBlock(key16, mask, padByte)
{
    const block = new Uint8Array(64);
    for (let i = 0; i < 16; i++) block[i] = key16[i] ^ mask[i];
    block.fill(padByte, 16);
    return block;
}

function _computeToken(key16, cmdData16)
{
    const typeRaw = (cmdData16[4] | (cmdData16[5] << 8) | (cmdData16[6] << 16) | (cmdData16[7] << 24)) >>> 0;
    const typeC = typeRaw <= MAX_TABLE_TYPE ? _typeTable[typeRaw] : FALLBACK_TYPE_CONST;

    const msg = new Uint8Array(20);
    for (let i = 0; i < 12; i++) msg[i] = cmdData16[4 + i];
    for (let i = 0; i < 4; i++) msg[12 + i] = cmdData16[i];
    msg[16] = typeC & 0xff;
    msg[17] = (typeC >>> 8) & 0xff;
    msg[18] = (typeC >>> 16) & 0xff;
    msg[19] = (typeC >>> 24) & 0xff;

    const inner = sha256(_concat(_makeHashBlock(key16, _innerMask, 0x36), msg));
    const digest = sha256(_concat(_makeHashBlock(key16, _outerMask, 0x5c), inner));
    let token = (digest[0] | ((digest[1] & 0x7f) << 8)) >>> 0;
    if (token <= 1) token = 1;
    return token;
}

const CLIENT_INPUT_TOKEN = 0x34;

function signClientInput(ci, battle)
{
    try
    {
        if (battle.add(offsets.BattleMode_hashEnabled).readU8() === 0) return 0;
        _loadSigningConstants();
    }
    catch (_)
    {
        return 0;
    }

    let key16;
    try
    {
        key16 = new Uint8Array(battle.add(offsets.BattleMode_hashKey).readByteArray(16));
    }
    catch (_)
    {
        return 0;
    }
    if (!key16 || key16.length < 16) return 0;

    let cmdData16;
    try
    {
        cmdData16 = new Uint8Array(ci.add(4).readByteArray(16));
    }
    catch (_)
    {
        return 0;
    }
    if (!cmdData16 || cmdData16.length < 16) return 0;

    const token = _computeToken(key16, cmdData16);
    try
    {
        ci.add(CLIENT_INPUT_TOKEN).writeU32(token);
    }
    catch (_)
    {
        return 0;
    }
    return token;
}

export function sendCommand(cmdType, fillFn)
{
    try
    {
        const fns = getFunctions();
        const battle = fns.BattleMode_getInstance();
        if (!battle || battle.isNull()) return false;

        const mgr = battle.add(offsets.BattleMode_clientInputManager).readPointer();
        if (!mgr || mgr.isNull()) return false;

        const ci = fns.operator_new(CMD_BUF_SIZE);
        if (!ci || ci.isNull()) return false;

        ci.writeByteArray(_zeroBuf);
        fns.ClientInput_constructor_int(ci, cmdType | 0);
        if (fillFn) fillFn(ci, battle);
        signClientInput(ci, battle);
        fns.ClientInputManager_addInput(mgr, ci);
        return true;
    }
    catch (_)
    {
        return false;
    }
}
