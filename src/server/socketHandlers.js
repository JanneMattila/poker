// Socket.IO event handlers
import { authenticateSocket } from './auth.js';

export function setupSocketHandlers(socket, io, roomManager) {
  // Authenticate socket connection
  authenticateSocket(socket, (err) => {
    if (err) {
      console.error('Socket authentication failed:', err.message);
      socket.disconnect();
      return;
    }
    
    console.log(`User authenticated: ${socket.user.displayName} (${socket.user.userId})`);
    
    // Setup event handlers after successful authentication
    setupRoomHandlers(socket, io, roomManager);
    setupGameHandlers(socket, io, roomManager);
    setupChatHandlers(socket, io, roomManager);
  });
}

function setupRoomHandlers(socket, io, roomManager) {
  // Create room
  socket.on('createRoom', (data, callback) => {
    try {
      const { roomName, gameSettings, password } = data;
      const room = roomManager.createRoom(
        socket.user.userId,
        socket.user.displayName,
        roomName,
        { ...gameSettings, password }
      );
      
      socket.join(room.roomId);
      
      callback({
        success: true,
        room: room.getRoomState(socket.user.userId, false)
      });
      
      // Broadcast room list update
      io.emit('roomListUpdate', roomManager.getPublicRooms());
    } catch (error) {
      callback({
        success: false,
        error: error.message
      });
    }
  });

  // Join room
  socket.on('joinRoom', (data, callback) => {
    try {
      const { roomId, password, asSpectator = false } = data;
      
      let room;
      if (asSpectator) {
        room = roomManager.joinRoomAsSpectator(
          roomId,
          socket.user.userId,
          socket.user.displayName,
          socket.id
        );
      } else {
        room = roomManager.joinRoom(
          roomId,
          socket.user.userId,
          socket.user.displayName,
          socket.id,
          password
        );
      }
      
      socket.join(roomId);
      
      // Notify others in the room
      socket.to(roomId).emit('userJoined', {
        userId: socket.user.userId,
        displayName: socket.user.displayName,
        asSpectator
      });
      
      // Add system message
      const message = room.addSystemMessage(
        `${socket.user.displayName} ${asSpectator ? 'started spectating' : 'joined the game'}`
      );
      
      io.to(roomId).emit('chatMessage', message);
      
      callback({
        success: true,
        room: room.getRoomState(socket.user.userId, true)
      });
      
      // Broadcast room state update
      io.to(roomId).emit('roomUpdate', room.getRoomState());
      
      // Update public room list
      io.emit('roomListUpdate', roomManager.getPublicRooms());
    } catch (error) {
      callback({
        success: false,
        error: error.message
      });
    }
  });

  // Join by invite code
  socket.on('joinByInvite', (data, callback) => {
    try {
      const { inviteCode, password } = data;
      
      const room = roomManager.findRoomByInviteCode(inviteCode);
      if (!room) {
        return callback({
          success: false,
          error: 'Room not found'
        });
      }
      
      if (!room.validatePassword(password)) {
        return callback({
          success: false,
          error: 'Invalid password'
        });
      }
      
      // Join the room
      const joinedRoom = roomManager.joinRoom(
        room.roomId,
        socket.user.userId,
        socket.user.displayName,
        socket.id,
        password
      );
      
      socket.join(room.roomId);
      
      // Notify others
      socket.to(room.roomId).emit('userJoined', {
        userId: socket.user.userId,
        displayName: socket.user.displayName,
        asSpectator: false
      });
      
      const message = joinedRoom.addSystemMessage(
        `${socket.user.displayName} joined the game`
      );
      
      io.to(room.roomId).emit('chatMessage', message);
      
      callback({
        success: true,
        roomId: room.roomId,
        room: joinedRoom.getRoomState(socket.user.userId, true)
      });
      
      // Broadcast updates
      io.to(room.roomId).emit('roomUpdate', joinedRoom.getRoomState());
      io.emit('roomListUpdate', roomManager.getPublicRooms());
    } catch (error) {
      callback({
        success: false,
        error: error.message
      });
    }
  });

  // Leave room
  socket.on('leaveRoom', (data, callback) => {
    try {
      const { roomId } = data;
      const room = roomManager.getRoom(roomId);
      
      if (room) {
        socket.leave(roomId);
        
        // Notify others
        socket.to(roomId).emit('userLeft', {
          userId: socket.user.userId,
          displayName: socket.user.displayName
        });
        
        const message = room.addSystemMessage(
          `${socket.user.displayName} left the game`
        );
        
        io.to(roomId).emit('chatMessage', message);
        
        roomManager.leaveRoom(roomId, socket.user.userId);
        
        // Broadcast updates
        if (!room.shouldCleanup()) {
          io.to(roomId).emit('roomUpdate', room.getRoomState());
        }
        io.emit('roomListUpdate', roomManager.getPublicRooms());
      }
      
      callback({ success: true });
    } catch (error) {
      callback({
        success: false,
        error: error.message
      });
    }
  });

  // Player ready status
  socket.on('setReady', (data, callback) => {
    try {
      const { roomId, isReady } = data;
      const room = roomManager.getRoom(roomId);
      
      if (!room) {
        return callback({
          success: false,
          error: 'Room not found'
        });
      }
      
      room.updatePlayerReady(socket.user.userId, isReady);
      
      callback({ success: true });
      
      // Broadcast room state update
      io.to(roomId).emit('roomUpdate', room.getRoomState());
    } catch (error) {
      callback({
        success: false,
        error: error.message
      });
    }
  });

  // Start game
  socket.on('startGame', (data, callback) => {
    try {
      const { roomId } = data;
      const room = roomManager.getRoom(roomId);
      
      if (!room) {
        return callback({
          success: false,
          error: 'Room not found'
        });
      }
      
      if (!room.isHost(socket.user.userId)) {
        return callback({
          success: false,
          error: 'Only host can start the game'
        });
      }
      
      room.startGame();
      
      const message = room.addSystemMessage('Game started!');
      io.to(roomId).emit('chatMessage', message);
      
      callback({ success: true });
      
      // Broadcast game state
      io.to(roomId).emit('gameStarted', room.getRoomState());
      io.emit('roomListUpdate', roomManager.getPublicRooms());
    } catch (error) {
      callback({
        success: false,
        error: error.message
      });
    }
  });
}

function setupGameHandlers(socket, io, roomManager) {
  // Player game actions
  socket.on('playerAction', (data, callback) => {
    try {
      const { roomId, actionType, amount } = data;
      const room = roomManager.getRoom(roomId);
      
      if (!room) {
        return callback({
          success: false,
          error: 'Room not found'
        });
      }
      
      const result = room.playerAction(socket.user.userId, actionType, amount);
      
      // Add system message for the action
      let actionText = '';
      switch (result.actionType) {
        case 'fold':
          actionText = 'folds';
          break;
        case 'check':
          actionText = 'checks';
          break;
        case 'call':
          actionText = `calls ${result.amount}`;
          break;
        case 'bet':
          actionText = `bets ${result.amount}`;
          break;
        case 'raise':
          actionText = `raises to ${result.amount}`;
          break;
        case 'all-in':
          actionText = `goes all-in with ${result.amount}`;
          break;
      }
      
      const message = room.addSystemMessage(
        `${socket.user.displayName} ${actionText}`
      );
      
      io.to(roomId).emit('chatMessage', message);
      
      callback({
        success: true,
        action: result
      });
      
      // Broadcast game state update
      io.to(roomId).emit('gameUpdate', room.getRoomState());
    } catch (error) {
      callback({
        success: false,
        error: error.message
      });
    }
  });

  // Request game state
  socket.on('getGameState', (data, callback) => {
    try {
      const { roomId } = data;
      const room = roomManager.getRoom(roomId);
      
      if (!room) {
        return callback({
          success: false,
          error: 'Room not found'
        });
      }
      
      callback({
        success: true,
        room: room.getRoomState(socket.user.userId, true)
      });
    } catch (error) {
      callback({
        success: false,
        error: error.message
      });
    }
  });
}

function setupChatHandlers(socket, io, roomManager) {
  // Send chat message
  socket.on('sendMessage', (data, callback) => {
    try {
      const { roomId, message, isPrivate = false, recipientId = null } = data;
      const room = roomManager.getRoom(roomId);
      
      if (!room) {
        return callback({
          success: false,
          error: 'Room not found'
        });
      }
      
      if (!room.isPlayer(socket.user.userId) && !room.isSpectator(socket.user.userId)) {
        return callback({
          success: false,
          error: 'Not authorized to send messages'
        });
      }
      
      const chatMessage = room.addChatMessage(
        socket.user.userId,
        message,
        isPrivate,
        recipientId
      );
      
      if (isPrivate && recipientId) {
        // Send to specific user only
        const recipientSocket = Array.from(io.sockets.sockets.values())
          .find(s => s.user && s.user.userId === recipientId);
        
        if (recipientSocket) {
          recipientSocket.emit('chatMessage', chatMessage);
        }
        
        // Send back to sender
        socket.emit('chatMessage', chatMessage);
      } else {
        // Broadcast to all in room
        io.to(roomId).emit('chatMessage', chatMessage);
      }
      
      callback({ success: true });
    } catch (error) {
      callback({
        success: false,
        error: error.message
      });
    }
  });
}