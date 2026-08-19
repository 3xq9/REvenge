import
{
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
    logEvery,
    logInfo
}
from "../utils/logger.js";

var TEAM_CHAT_MESSAGE_SIZE = 512;
var MAX_MESSAGE_LENGTH = 128;
var MIN_INTERVAL_MS = 50;
var MAX_INTERVAL_MS = 6e4;

var _msgCtor = null;
var _mmSendMessage = null;
var messageManagerPtr = null;
var ready = false;
var options = {
    message: "",
    intervalMs: 600
};
var timer = null;
var _running = false;

function _sendOnce()
{
    if (!ready) return;
    const text = options.message;
    if (!text) return;
    try
    {
        const mm = messageManagerPtr.readPointer();
        if (!mm || mm.isNull()) return;
        const fns = getFunctions();
        const msg = fns.operator_new(TEAM_CHAT_MESSAGE_SIZE);
        if (!msg || msg.isNull()) return;
        _msgCtor(msg);
        const field = msg.add(offsets.TeamChatMessage_messageOffset);
        fns.StringCtor(field, Memory.allocUtf8String(text.slice(0, MAX_MESSAGE_LENGTH)));
        _mmSendMessage(mm, msg);
        logEvery(10, "chatspam sent",
        {
            length: text.length,
            intervalMs: options.intervalMs | 0,
            preview: text.slice(0, 24)
        });
    }
    catch (_)
    {}
}

function _stopTimer()
{
    if (timer !== null)
    {
        try
        {
            clearInterval(timer);
        }
        catch (_)
        {}
        timer = null;
    }
}

function _startTimer()
{
    _stopTimer();
    const ms = Math.max(MIN_INTERVAL_MS, Math.min(MAX_INTERVAL_MS, options.intervalMs | 0));
    timer = setInterval(_sendOnce, ms);
}
export function setupChatSpam(base)
{
    try
    {
        const fns = getFunctions();
        _msgCtor = fns.TeamChatMessage_ctor;
        _mmSendMessage = fns.MessageManager_sendMessage;
        if (!_msgCtor || !_mmSendMessage || !offsets.MessageManager_instance) return;
        messageManagerPtr = base.add(offsets.MessageManager_instance);
        ready = true;
    }
    catch (_)
    {
        ready = false;
    }
}
export function setChatSpamOptions(o)
{
    if (!o || typeof o !== "object") return;
    if (typeof o.message === "string")
    {
        options.message = o.message.slice(0, MAX_MESSAGE_LENGTH);
    }
    if (typeof o.intervalMs === "number" && isFinite(o.intervalMs))
    {
        options.intervalMs = Math.max(MIN_INTERVAL_MS, Math.min(MAX_INTERVAL_MS, o.intervalMs | 0));
        if (_running) _startTimer();
    }
}
export function startChatSpam()
{
    if (!ready) return false;
    if (_running) return true;
    _running = true;
    _startTimer();
    logInfo("chatspam started",
    {
        intervalMs: options.intervalMs | 0,
        length: options.message.length,
        preview: options.message.slice(0, 24)
    });
    return true;
}
export function stopChatSpam()
{
    if (_running) logInfo("chatspam stopped");
    _running = false;
    _stopTimer();
}
export function resetChatSpam()
{
    stopChatSpam();
}
