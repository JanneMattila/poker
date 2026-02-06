// Room management for game lobbies
import { generateId, createInviteCode } from './utils.js';
import { Game } from './game.js';

export class Room {
  constructor(hostUserId, roomName, gameSettings = {}) {
    this.roomId = generateId();
    this.hostUserId = hostUserId;
    this.roomName = roomName || `${hostUserId}'s Game`;
    this.maxPlayers = gameSettings.maxPlayers || 6;
    this.currentPlayers = 0;
    this.gameSettings = {
      startingChips: 1000,
      smallBlind: 10,
      bigBlind: 20,
      blindIncreaseInterval: 15,
      timePerAction: 30,
      visibility: 'public',
      spectatingAllowed: true,
      ...gameSettings
    };
    this.status = 'waiting'; // 'waiting' | 'in-progress' | 'completed'
    this.createdAt = new Date().toISOString();
    this.gameStartedAt = null;
    this.inviteCode = createInviteCode();
    this.passwordProtected = !!gameSettings.password;
    this.password = gameSettings.password || null;
    
    // Connected users
    this.players = new Map(); // userId -> player info
    this.spectators = new Map(); // userId -> spectator info
    
    // Game instance
    this.game = null;
    
    // Chat messages
    this.chatMessages = [];
  }

  // Player management
  addPlayer(userId, displayName, socketId, isGuest = false) {
    if (this.currentPlayers >= this.maxPlayers) {
      throw new Error('Room is full');
    }

    if (this.players.has(userId)) {
      throw new Error('Player already in room');
    }

    if (this.status === 'in-progress') {
      throw new Error('Cannot join game in progress');
    }

    const playerInfo = {
      userId,
      displayName,
      socketId,
      isGuest,
      joinedAt: new Date().toISOString(),
      isReady: false,
      isHost: userId === this.hostUserId
    };

    this.players.set(userId, playerInfo);
    this.currentPlayers++;

    return playerInfo;
  }

  removePlayer(userId) {
    if (!this.players.has(userId)) {
      return false;
    }

    this.players.delete(userId);
    this.currentPlayers--;

    // If game is in progress, handle disconnection
    if (this.game && this.status === 'in-progress') {
      const gamePlayer = this.game.getPlayer(userId);
      if (gamePlayer) {
        gamePlayer.isConnected = false;
        gamePlayer.status = 'sitting-out';
      }
    }

    // If host leaves, transfer ownership
    if (userId === this.hostUserId && this.currentPlayers > 0) {
      const newHost = Array.from(this.players.values())[0];
      this.hostUserId = newHost.userId;
      newHost.isHost = true;
    }

    // If room is empty, mark for cleanup
    if (this.currentPlayers === 0) {
      this.status = 'completed';
    }

    return true;
  }

  addSpectator(userId, displayName, socketId) {
    if (!this.gameSettings.spectatingAllowed) {
      throw new Error('Spectating not allowed in this room');
    }

    if (this.spectators.has(userId)) {
      throw new Error('Already spectating this room');
    }

    const spectatorInfo = {
      userId,
      displayName,
      socketId,
      joinedAt: new Date().toISOString(),
      permissions: ['view-chat', 'view-statistics']
    };

    this.spectators.set(userId, spectatorInfo);
    return spectatorInfo;
  }

  removeSpectator(userId) {
    return this.spectators.delete(userId);
  }

  updatePlayerReady(userId, isReady) {
    const player = this.players.get(userId);
    if (player) {
      player.isReady = isReady;
      return true;
    }
    return false;
  }

  canStartGame() {
    if (this.currentPlayers < 2) {
      return { canStart: false, reason: 'Need at least 2 players' };
    }

    const readyPlayers = Array.from(this.players.values()).filter(p => p.isReady);
    if (readyPlayers.length < this.currentPlayers) {
      return { canStart: false, reason: 'All players must be ready' };
    }

    return { canStart: true };
  }

  startGame() {
    const canStart = this.canStartGame();
    if (!canStart.canStart) {
      throw new Error(canStart.reason);
    }

    this.status = 'in-progress';
    this.gameStartedAt = new Date().toISOString();
    
    // Create game instance
    this.game = new Game(this.roomId, this.gameSettings);
    
    // Add all players to the game
    let position = 0;
    for (const [userId, playerInfo] of this.players) {
      this.game.addPlayer(userId, playerInfo.displayName, position++);
    }

    // Start the game
    this.game.startGame();

    return this.game;
  }

  // Chat functionality
  addChatMessage(userId, message, isPrivate = false, recipientId = null) {
    const user = this.players.get(userId) || this.spectators.get(userId);
    if (!user) {
      throw new Error('User not in room');
    }

    const chatMessage = {
      messageId: generateId(),
      roomId: this.roomId,
      playerId: userId,
      displayName: user.displayName,
      message,
      messageType: 'player',
      timestamp: new Date().toISOString(),
      isPrivate,
      recipientId
    };

    this.chatMessages.push(chatMessage);

    // Keep only last 100 messages
    if (this.chatMessages.length > 100) {
      this.chatMessages.shift();
    }

    return chatMessage;
  }

  addSystemMessage(message) {
    const chatMessage = {
      messageId: generateId(),
      roomId: this.roomId,
      playerId: null,
      displayName: 'System',
      message,
      messageType: 'system',
      timestamp: new Date().toISOString(),
      isPrivate: false,
      recipientId: null
    };

    this.chatMessages.push(chatMessage);
    return chatMessage;
  }

  // Game actions
  playerAction(userId, actionType, amount) {
    if (!this.game) {
      throw new Error('No active game');
    }

    if (this.status !== 'in-progress') {
      throw new Error('Game not in progress');
    }

    const player = this.players.get(userId);
    if (!player) {
      throw new Error('Player not in room');
    }

    return this.game.playerAction(userId, actionType, amount);
  }

  // Room state
  getRoomState(userId = null, includePrivateInfo = false) {
    const isPlayer = userId && this.players.has(userId);
    const isSpectator = userId && this.spectators.has(userId);
    const isAuthorized = isPlayer || isSpectator;

    const state = {
      roomId: this.roomId,
      roomName: this.roomName,
      hostUserId: this.hostUserId,
      maxPlayers: this.maxPlayers,
      currentPlayers: this.currentPlayers,
      status: this.status,
      gameSettings: this.gameSettings,
      inviteCode: this.inviteCode,
      passwordProtected: this.passwordProtected,
      createdAt: this.createdAt,
      gameStartedAt: this.gameStartedAt,
      players: Array.from(this.players.values()).map(p => ({
        userId: p.userId,
        displayName: p.displayName,
        isReady: p.isReady,
        isHost: p.isHost,
        joinedAt: p.joinedAt
      })),
      spectators: Array.from(this.spectators.values()).map(s => ({
        userId: s.userId,
        displayName: s.displayName,
        joinedAt: s.joinedAt
      })),
      chatMessages: isAuthorized ? this.chatMessages : [],
      game: this.game ? this.game.getGameState(!includePrivateInfo || !isPlayer) : null
    };

    return state;
  }

  // Utility methods
  isHost(userId) {
    return userId === this.hostUserId;
  }

  isPlayer(userId) {
    return this.players.has(userId);
  }

  isSpectator(userId) {
    return this.spectators.has(userId);
  }

  updatePlayerSocket(userId, socketId) {
    const player = this.players.get(userId);
    if (player) {
      player.socketId = socketId;
      
      // If game is active, reconnect the player
      if (this.game) {
        const gamePlayer = this.game.getPlayer(userId);
        if (gamePlayer) {
          gamePlayer.isConnected = true;
          if (gamePlayer.status === 'sitting-out' && gamePlayer.chipStack > 0) {
            gamePlayer.status = 'active';
          }
        }
      }
      return true;
    }

    const spectator = this.spectators.get(userId);
    if (spectator) {
      spectator.socketId = socketId;
      return true;
    }

    return false;
  }

  validatePassword(password) {
    if (!this.passwordProtected) {
      return true;
    }
    return this.password === password;
  }

  // Cleanup
  shouldCleanup() {
    const inactiveTime = Date.now() - new Date(this.createdAt).getTime();
    const maxInactiveTime = 24 * 60 * 60 * 1000; // 24 hours

    return (
      this.status === 'completed' ||
      (this.currentPlayers === 0 && inactiveTime > maxInactiveTime)
    );
  }
}