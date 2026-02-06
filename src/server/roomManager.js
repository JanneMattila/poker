// Room manager for handling multiple game rooms
import { Room } from '../shared/room.js';

export class RoomManager {
  constructor() {
    this.rooms = new Map(); // roomId -> Room
    this.inviteCodes = new Map(); // inviteCode -> roomId
    this.userSockets = new Map(); // userId -> socketId
    this.socketUsers = new Map(); // socketId -> userId
  }

  createRoom(hostUserId, displayName, roomName, gameSettings = {}) {
    const room = new Room(hostUserId, roomName, gameSettings);
    this.rooms.set(room.roomId, room);
    this.inviteCodes.set(room.inviteCode, room.roomId);
    
    // Add the host as a player
    room.addPlayer(hostUserId, displayName, null, false);
    
    console.log(`Room created: ${room.roomId} by ${displayName}`);
    return room;
  }

  getRoom(roomId) {
    return this.rooms.get(roomId);
  }

  findRoomByInviteCode(inviteCode) {
    const roomId = this.inviteCodes.get(inviteCode);
    return roomId ? this.rooms.get(roomId) : null;
  }

  deleteRoom(roomId) {
    const room = this.rooms.get(roomId);
    if (room) {
      this.inviteCodes.delete(room.inviteCode);
      this.rooms.delete(roomId);
      console.log(`Room deleted: ${roomId}`);
      return true;
    }
    return false;
  }

  getPublicRooms(visibility = 'public', page = 1, limit = 10) {
    const publicRooms = Array.from(this.rooms.values())
      .filter(room => 
        room.gameSettings.visibility === visibility &&
        room.status === 'waiting' &&
        room.currentPlayers < room.maxPlayers
      )
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice((page - 1) * limit, page * limit)
      .map(room => ({
        roomId: room.roomId,
        roomName: room.roomName,
        currentPlayers: room.currentPlayers,
        maxPlayers: room.maxPlayers,
        gameSettings: {
          startingChips: room.gameSettings.startingChips,
          smallBlind: room.gameSettings.smallBlind,
          bigBlind: room.gameSettings.bigBlind,
          spectatingAllowed: room.gameSettings.spectatingAllowed
        },
        passwordProtected: room.passwordProtected,
        createdAt: room.createdAt,
        host: Array.from(room.players.values()).find(p => p.isHost)?.displayName
      }));

    return publicRooms;
  }

  getTotalPublicRooms() {
    return Array.from(this.rooms.values())
      .filter(room => 
        room.gameSettings.visibility === 'public' &&
        room.status === 'waiting'
      ).length;
  }

  joinRoom(roomId, userId, displayName, socketId, password = null) {
    const room = this.getRoom(roomId);
    if (!room) {
      throw new Error('Room not found');
    }

    if (!room.validatePassword(password)) {
      throw new Error('Invalid password');
    }

    // Check if user is already in the room
    if (room.isPlayer(userId)) {
      // Reconnection
      room.updatePlayerSocket(userId, socketId);
    } else {
      // New player
      room.addPlayer(userId, displayName, socketId, false);
    }

    this.userSockets.set(userId, socketId);
    this.socketUsers.set(socketId, userId);

    return room;
  }

  joinRoomAsSpectator(roomId, userId, displayName, socketId) {
    const room = this.getRoom(roomId);
    if (!room) {
      throw new Error('Room not found');
    }

    room.addSpectator(userId, displayName, socketId);
    this.userSockets.set(userId, socketId);
    this.socketUsers.set(socketId, userId);

    return room;
  }

  leaveRoom(roomId, userId) {
    const room = this.getRoom(roomId);
    if (!room) {
      return false;
    }

    const removed = room.removePlayer(userId) || room.removeSpectator(userId);
    if (removed) {
      this.userSockets.delete(userId);
      
      // Clean up room if it should be deleted
      if (room.shouldCleanup()) {
        this.deleteRoom(roomId);
      }
    }

    return removed;
  }

  handleDisconnection(socketId) {
    const userId = this.socketUsers.get(socketId);
    if (!userId) {
      return;
    }

    this.socketUsers.delete(socketId);
    
    // Find which room the user was in
    for (const room of this.rooms.values()) {
      if (room.isPlayer(userId) || room.isSpectator(userId)) {
        // Mark player as disconnected but don't remove them immediately
        const player = room.players.get(userId);
        if (player) {
          player.socketId = null;
          if (room.game) {
            const gamePlayer = room.game.getPlayer(userId);
            if (gamePlayer) {
              gamePlayer.isConnected = false;
              // Give them time to reconnect
              setTimeout(() => {
                if (!gamePlayer.isConnected) {
                  gamePlayer.status = 'sitting-out';
                }
              }, 30000); // 30 seconds to reconnect
            }
          }
        }
        
        // Remove spectators immediately
        room.removeSpectator(userId);
        break;
      }
    }
  }

  getUserRoom(userId) {
    for (const room of this.rooms.values()) {
      if (room.isPlayer(userId) || room.isSpectator(userId)) {
        return room;
      }
    }
    return null;
  }

  cleanup() {
    const toDelete = [];
    
    for (const [roomId, room] of this.rooms) {
      if (room.shouldCleanup()) {
        toDelete.push(roomId);
      }
    }

    toDelete.forEach(roomId => {
      this.deleteRoom(roomId);
    });

    if (toDelete.length > 0) {
      console.log(`Cleaned up ${toDelete.length} inactive rooms`);
    }
  }

  getStats() {
    const totalRooms = this.rooms.size;
    const activeGames = Array.from(this.rooms.values())
      .filter(room => room.status === 'in-progress').length;
    const waitingRooms = Array.from(this.rooms.values())
      .filter(room => room.status === 'waiting').length;
    const totalPlayers = Array.from(this.rooms.values())
      .reduce((sum, room) => sum + room.currentPlayers, 0);

    return {
      totalRooms,
      activeGames,
      waitingRooms,
      totalPlayers,
      connectedUsers: this.userSockets.size
    };
  }
}