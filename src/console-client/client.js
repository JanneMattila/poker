#!/usr/bin/env node
/**
 * Console Client for Texas Hold'em Poker
 *
 * Connects to the game server via Socket.IO, authenticates as a guest,
 * and provides an interactive CLI to create/join rooms and play poker.
 *
 * Usage:
 *   node src/console-client/client.js [--server URL] [--name NAME]
 *
 * This client can be used for:
 *   - Manual testing of the server
 *   - Future integration of external computer players (bots)
 */

import { io } from 'socket.io-client';
import readline from 'readline';

// ── Configuration ──

const args = process.argv.slice(2);
function getArg(flag, defaultValue) {
    const idx = args.indexOf(flag);
    return idx !== -1 && args[idx + 1] ? args[idx + 1] : defaultValue;
}

const SERVER_URL = getArg('--server', 'http://localhost:3001');
const DISPLAY_NAME = getArg('--name', `Bot_${Date.now().toString(36)}`);

// ── Helpers ──

const SUIT_SYMBOLS = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' };
const COLORS = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
};

function c(color, text) {
    return `${COLORS[color]}${text}${COLORS.reset}`;
}

function formatCard(card) {
    if (!card) return '??';
    const sym = SUIT_SYMBOLS[card.suit] || card.suit;
    const isRed = card.suit === 'hearts' || card.suit === 'diamonds';
    return c(isRed ? 'red' : 'white', `${card.rank}${sym}`);
}

function log(msg) {
    process.stdout.write('\r\x1b[K'); // clear current line
    console.log(msg);
    showPrompt();
}

function showPrompt() {
    rl.prompt();
}

// ── State ──

let currentRoom = null;
let currentRoomId = null;
let myUserId = null;
let gameState = null;

// ── Readline ──

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: c('cyan', 'poker> '),
});

// ── Socket.IO Connection ──

console.log(c('yellow', `\n  Texas Hold'em Poker - Console Client`));
console.log(c('dim', `  Connecting to ${SERVER_URL} as "${DISPLAY_NAME}"...\n`));

const socket = io(SERVER_URL, {
    auth: {
        token: null,
        isGuest: true,
        displayName: DISPLAY_NAME,
    },
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 2000,
});

// ── Socket Events ──

socket.on('connect', () => {
    log(c('green', `✓ Connected (socket ${socket.id})`));
});

socket.on('disconnect', (reason) => {
    log(c('red', `✗ Disconnected: ${reason}`));
});

socket.on('connect_error', (err) => {
    log(c('red', `Connection error: ${err.message}`));
});

socket.on('roomUpdate', (data) => {
    currentRoom = data;
    log(c('blue', `[Room Update] Players: ${data.players?.length || '?'}, Status: ${data.status || data.gamePhase || '?'}`));
    if (data.game) {
        gameState = data.game;
    }
});

socket.on('gameUpdate', (data) => {
    currentRoom = data;
    gameState = data.game || data;
    printGameState(data);
});

socket.on('gameStarted', (data) => {
    currentRoom = data;
    gameState = data.game || data;
    log(c('green', '\n  ★ Game Started! ★\n'));
    printGameState(data);
});

socket.on('userJoined', (data) => {
    log(c('green', `  → ${data.displayName} joined`));
});

socket.on('userLeft', (data) => {
    log(c('yellow', `  ← ${data.displayName} left`));
});

socket.on('chatMessage', (data) => {
    if (data.type === 'system') {
        log(c('dim', `  [sys] ${data.message || data.text}`));
    } else {
        log(`  [${data.sender || '?'}] ${data.message || data.text}`);
    }
});

socket.on('error', (data) => {
    log(c('red', `  Error: ${data.message || JSON.stringify(data)}`));
});

// ── Emit helper ──

function emitAsync(event, data) {
    return new Promise((resolve, reject) => {
        socket.emit(event, data, (response) => {
            if (response && response.success) {
                resolve(response);
            } else {
                reject(new Error(response?.error || 'Unknown error'));
            }
        });
    });
}

// ── Print game state ──

function printGameState(data) {
    const game = data?.game || data;
    if (!game) return;

    const lines = [];
    lines.push('');
    lines.push(c('bright', '  ── Game State ──'));

    if (game.phase || game.gamePhase) {
        lines.push(`  Phase: ${c('yellow', game.phase || game.gamePhase)}`);
    }
    if (game.pot !== undefined) {
        const potVal = typeof game.pot === 'object' ? game.pot.mainPot : game.pot;
        lines.push(`  Pot: ${c('yellow', '$' + potVal)}   Bet: $${game.currentBetAmount || 0}`);
    }

    // Community cards
    if (game.communityCards && game.communityCards.length > 0) {
        const cards = game.communityCards.map(formatCard).join(' ');
        lines.push(`  Board: ${cards}`);
    }

    // Players
    const players = game.players || data.players || [];
    if (players.length > 0) {
        lines.push('  Players:');
        players.forEach((p, i) => {
            const isActive = (game.currentPlayerIndex === i || game.activePlayerIndex === i) ? ' ◄' : '';
            const chips = p.chipStack ?? p.chips ?? '?';
            const status = p.status || (p.isFolded ? 'folded' : 'active');
            const bet = p.currentBet ?? p.bet ?? 0;
            const name = p.displayName || p.name || p.userId;
            lines.push(`    ${i}: ${name} - $${chips} (bet $${bet}) [${status}]${c('green', isActive)}`);

            // Show hole cards if visible (your own)
            if (p.holeCards && p.holeCards.length > 0) {
                const hc = p.holeCards.map(formatCard).join(' ');
                lines.push(`       Cards: ${hc}`);
            }
        });
    }

    lines.push('');
    log(lines.join('\n'));
}

// ── Commands ──

const COMMANDS = {
    help: {
        desc: 'Show available commands',
        fn: cmdHelp,
    },
    create: {
        desc: 'Create a new room: create [roomName]',
        fn: cmdCreate,
    },
    join: {
        desc: 'Join room by invite code: join <code>',
        fn: cmdJoin,
    },
    leave: {
        desc: 'Leave current room',
        fn: cmdLeave,
    },
    ready: {
        desc: 'Toggle ready status',
        fn: cmdReady,
    },
    start: {
        desc: 'Start the game (host only)',
        fn: cmdStart,
    },
    state: {
        desc: 'Print current game state',
        fn: cmdState,
    },
    fold: {
        desc: 'Fold',
        fn: () => cmdAction('fold'),
    },
    check: {
        desc: 'Check',
        fn: () => cmdAction('check'),
    },
    call: {
        desc: 'Call',
        fn: () => cmdAction('call'),
    },
    bet: {
        desc: 'Bet amount: bet <amount>',
        fn: (args) => cmdAction('bet', parseInt(args[0]) || 0),
    },
    raise: {
        desc: 'Raise amount: raise <amount>',
        fn: (args) => cmdAction('raise', parseInt(args[0]) || 0),
    },
    allin: {
        desc: 'Go all-in',
        fn: () => cmdAction('all-in'),
    },
    rooms: {
        desc: 'List public rooms',
        fn: cmdRooms,
    },
    quit: {
        desc: 'Disconnect and exit',
        fn: cmdQuit,
    },
};

function cmdHelp() {
    const lines = ['\n  ' + c('bright', 'Available Commands:')];
    for (const [name, cmd] of Object.entries(COMMANDS)) {
        lines.push(`    ${c('cyan', name.padEnd(10))} ${cmd.desc}`);
    }
    lines.push('');
    log(lines.join('\n'));
}

async function cmdCreate(args) {
    const roomName = args.join(' ') || `${DISPLAY_NAME}'s Room`;
    try {
        const resp = await emitAsync('createRoom', {
            roomName,
            gameSettings: {
                maxPlayers: 6,
                startingChips: 1000,
                smallBlind: 10,
                bigBlind: 20,
                visibility: 'public',
                spectatingAllowed: true,
            },
            password: null,
        });
        currentRoom = resp.room;
        currentRoomId = resp.room.roomId;
        log(c('green', `✓ Room created: "${roomName}"  Invite: ${resp.room.inviteCode}`));
    } catch (err) {
        log(c('red', `Failed to create room: ${err.message}`));
    }
}

async function cmdJoin(args) {
    const code = (args[0] || '').toUpperCase();
    if (!code) {
        log(c('red', 'Usage: join <inviteCode>'));
        return;
    }
    try {
        const resp = await emitAsync('joinByInvite', { inviteCode: code, password: null });
        currentRoom = resp.room;
        currentRoomId = resp.roomId || resp.room.roomId;
        log(c('green', `✓ Joined room (invite ${code})`));
    } catch (err) {
        log(c('red', `Failed to join: ${err.message}`));
    }
}

async function cmdLeave() {
    if (!currentRoomId) {
        log(c('yellow', 'Not in a room'));
        return;
    }
    try {
        await emitAsync('leaveRoom', { roomId: currentRoomId });
        currentRoom = null;
        currentRoomId = null;
        gameState = null;
        log(c('green', '✓ Left room'));
    } catch (err) {
        log(c('red', `Failed to leave: ${err.message}`));
    }
}

async function cmdReady() {
    if (!currentRoomId) {
        log(c('yellow', 'Not in a room'));
        return;
    }
    try {
        await emitAsync('setReady', { roomId: currentRoomId, isReady: true });
        log(c('green', '✓ Ready'));
    } catch (err) {
        log(c('red', `Failed: ${err.message}`));
    }
}

async function cmdStart() {
    if (!currentRoomId) {
        log(c('yellow', 'Not in a room'));
        return;
    }
    try {
        await emitAsync('startGame', { roomId: currentRoomId });
        log(c('green', '✓ Game starting...'));
    } catch (err) {
        log(c('red', `Failed to start: ${err.message}`));
    }
}

function cmdState() {
    if (!currentRoom) {
        log(c('yellow', 'No game state available. Join a room first.'));
        return;
    }
    printGameState(currentRoom);
}

async function cmdAction(actionType, amount = 0) {
    if (!currentRoomId) {
        log(c('yellow', 'Not in a room'));
        return;
    }
    try {
        const resp = await emitAsync('playerAction', {
            roomId: currentRoomId,
            actionType,
            amount,
        });
        log(c('green', `✓ ${actionType}${amount > 0 ? ' $' + amount : ''}`));
    } catch (err) {
        log(c('red', `Action failed: ${err.message}`));
    }
}

async function cmdRooms() {
    try {
        const resp = await fetch(`${SERVER_URL}/api/rooms?page=1&limit=10`);
        const data = await resp.json();
        if (data.rooms && data.rooms.length > 0) {
            const lines = ['\n  ' + c('bright', 'Public Rooms:')];
            data.rooms.forEach((r, i) => {
                lines.push(`    ${i + 1}. ${r.roomName || r.name} (${r.playerCount || '?'}/${r.maxPlayers || '?'}) Invite: ${r.inviteCode || '?'}`);
            });
            lines.push('');
            log(lines.join('\n'));
        } else {
            log(c('dim', '  No public rooms available'));
        }
    } catch (err) {
        log(c('red', `Failed to list rooms: ${err.message}`));
    }
}

function cmdQuit() {
    console.log(c('yellow', '\nGoodbye!\n'));
    socket.disconnect();
    process.exit(0);
}

// ── Input Loop ──

rl.on('line', async (line) => {
    const parts = line.trim().split(/\s+/);
    const cmd = (parts[0] || '').toLowerCase();
    const cmdArgs = parts.slice(1);

    if (!cmd) {
        showPrompt();
        return;
    }

    const handler = COMMANDS[cmd];
    if (handler) {
        await handler.fn(cmdArgs);
    } else {
        log(c('red', `Unknown command: "${cmd}". Type "help" for available commands.`));
    }
});

rl.on('close', () => {
    cmdQuit();
});

// Start
cmdHelp();
showPrompt();
