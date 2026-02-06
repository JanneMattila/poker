// Main server implementation
import express from 'express';
import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { RoomManager } from './roomManager.js';
import { authenticateUser } from './auth.js';
import { setupSocketHandlers } from './socketHandlers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);
const io = new SocketServer(server, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', '..', 'dist')));

// Global room manager
const roomManager = new RoomManager();

// REST API Routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Room management routes
app.post('/api/rooms', authenticateUser, (req, res) => {
  try {
    const { roomName, gameSettings, password } = req.body;
    const userId = req.user.userId;
    const displayName = req.user.displayName;

    const room = roomManager.createRoom(userId, displayName, roomName, {
      ...gameSettings,
      password
    });

    res.status(201).json({
      success: true,
      room: room.getRoomState(userId, false)
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/api/rooms', (req, res) => {
  try {
    const { page = 1, limit = 10, visibility = 'public' } = req.query;
    const rooms = roomManager.getPublicRooms(visibility, parseInt(page), parseInt(limit));
    
    res.json({
      success: true,
      rooms,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: roomManager.getTotalPublicRooms()
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/api/rooms/:roomId', authenticateUser, (req, res) => {
  try {
    const { roomId } = req.params;
    const userId = req.user.userId;
    
    const room = roomManager.getRoom(roomId);
    if (!room) {
      return res.status(404).json({
        success: false,
        error: 'Room not found'
      });
    }

    res.json({
      success: true,
      room: room.getRoomState(userId, false)
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.post('/api/rooms/join/:inviteCode', authenticateUser, (req, res) => {
  try {
    const { inviteCode } = req.params;
    const { password } = req.body;
    const userId = req.user.userId;
    const displayName = req.user.displayName;

    const room = roomManager.findRoomByInviteCode(inviteCode);
    if (!room) {
      return res.status(404).json({
        success: false,
        error: 'Room not found'
      });
    }

    if (!room.validatePassword(password)) {
      return res.status(401).json({
        success: false,
        error: 'Invalid password'
      });
    }

    res.json({
      success: true,
      roomId: room.roomId,
      room: room.getRoomState(userId, false)
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// Game action routes
app.post('/api/rooms/:roomId/actions', authenticateUser, (req, res) => {
  try {
    const { roomId } = req.params;
    const { actionType, amount } = req.body;
    const userId = req.user.userId;

    const room = roomManager.getRoom(roomId);
    if (!room) {
      return res.status(404).json({
        success: false,
        error: 'Room not found'
      });
    }

    const result = room.playerAction(userId, actionType, amount);
    
    // Broadcast game state update to all clients in the room
    io.to(roomId).emit('gameUpdate', room.getRoomState());

    res.json({
      success: true,
      action: result,
      gameState: room.getRoomState(userId, true)
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);
  
  // Setup all socket event handlers
  setupSocketHandlers(socket, io, roomManager);

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    roomManager.handleDisconnection(socket.id);
  });
});

// Serve the client application
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', '..', 'dist', 'index.html'));
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Server Error:', error);
  res.status(500).json({
    success: false,
    error: 'Internal server error'
  });
});

// Cleanup old rooms periodically
setInterval(() => {
  roomManager.cleanup();
}, 60 * 1000); // Every minute

// Start server
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});