import
{
    logInfo
}
from "../utils/logger.js";
var _lastServerIP = null;
var _pollTimer = null;

function isPublicIp(ip)
{
    if (!ip || !/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip)) return false;
    const p = ip.split(".").map(Number);
    if (p[0] === 0 || p[0] === 127) return false;
    if (p[0] === 10) return false;
    if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return false;
    if (p[0] === 192 && p[1] === 168) return false;
    if (p[0] === 169 && p[1] === 254) return false;
    if (p[0] >= 224) return false;
    return true;
}

function reportIp(ip, port)
{
    const full = ip + ":" + port;
    if (_lastServerIP === full) return;
    _lastServerIP = full;
    logInfo("server ip captured",
    {
        endpoint: full
    });
    if (_pollTimer !== null)
    {
        clearInterval(_pollTimer);
        _pollTimer = null;
    }
    send(
    {
        type: "IP_CAPTURED",
        data: full
    });
}

function parseTcpEndpoint(value)
{
    try
    {
        const parts = String(value || "").split(":");
        if (parts.length !== 2 || parts[0].length !== 8) return null;
        const bytes = [];
        for (let i = 0; i < 4; i++)
        {
            const byte = parseInt(parts[0].slice(i * 2, i * 2 + 2), 16);
            if (!Number.isFinite(byte)) return null;
            bytes.push(byte);
        }
        bytes.reverse();
        const port = parseInt(parts[1], 16);
        if (!Number.isFinite(port) || port <= 0 || port > 65535) return null;
        return {
            ip: bytes.join("."),
            port
        };
    }
    catch (_)
    {
        return null;
    }
}

function scanEstablishedConnections()
{
    try
    {
        if (typeof File !== "function") return false;
        const lines = File.readAllText("/proc/self/net/tcp").split(/\r?\n/);
        for (let i = 1; i < lines.length; i++)
        {
            const fields = lines[i].trim().split(/\s+/);
            const state = fields[3];
            if (fields.length < 4 || state !== "01") continue;
            const endpoint = parseTcpEndpoint(fields[2]);
            if (!endpoint || !isPublicIp(endpoint.ip)) continue;
            if (endpoint.port !== 80 && endpoint.port !== 443)
            {
                reportIp(endpoint.ip, endpoint.port);
                return true;
            }
        }
    }
    catch (_)
    {}
    return false;
}
export function setupIPGrabber()
{
    if (scanEstablishedConnections() || _pollTimer !== null) return;
    _pollTimer = setInterval(scanEstablishedConnections, 1000);
}
export function resetIPGrabber()
{
    if (_pollTimer !== null)
    {
        clearInterval(_pollTimer);
        _pollTimer = null;
    }
}
export function getServerIP()
{
    return _lastServerIP || "Not connected";
}
