// Authentication middleware and utilities
import jwt from 'jsonwebtoken';
import { generateId } from '../shared/utils.js';

const JWT_SECRET = process.env.JWT_SECRET || 'poker-game-secret-key';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

// Middleware to authenticate users
export function authenticateUser(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // For development, allow guest users
      if (req.headers['x-guest-user'] === 'true') {
        req.user = {
          userId: generateId(),
          displayName: req.headers['x-guest-name'] || `Guest_${Date.now()}`,
          isGuest: true
        };
        return next();
      }
      
      return res.status(401).json({
        success: false,
        error: 'No token provided'
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    const decoded = jwt.verify(token, JWT_SECRET);
    
    req.user = {
      userId: decoded.userId,
      displayName: decoded.displayName,
      email: decoded.email,
      isGuest: false
    };
    
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    return res.status(401).json({
      success: false,
      error: 'Invalid token'
    });
  }
}

// Generate JWT token for authenticated users
export function generateToken(user) {
  const payload = {
    userId: user.userId,
    displayName: user.displayName,
    email: user.email
  };
  
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

// Microsoft Account authentication (placeholder)
export async function authenticateMicrosoftAccount(accessToken) {
  try {
    // In a real implementation, you would:
    // 1. Validate the Microsoft access token
    // 2. Get user profile information from Microsoft Graph API
    // 3. Create or update user in your database
    
    // For now, return mock user data
    return {
      userId: generateId(),
      microsoftAccountId: 'mock-microsoft-id',
      displayName: 'Microsoft User',
      email: 'user@microsoft.com',
      avatarUrl: null
    };
  } catch (error) {
    console.error('Microsoft authentication error:', error);
    throw new Error('Failed to authenticate with Microsoft Account');
  }
}

// Socket authentication
export function authenticateSocket(socket, next) {
  try {
    const token = socket.handshake.auth.token;
    
    if (!token) {
      // Allow guest users for development
      if (socket.handshake.auth.isGuest) {
        socket.user = {
          userId: generateId(),
          displayName: socket.handshake.auth.displayName || `Guest_${Date.now()}`,
          isGuest: true
        };
        return next();
      }
      
      return next(new Error('No token provided'));
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    
    socket.user = {
      userId: decoded.userId,
      displayName: decoded.displayName,
      email: decoded.email,
      isGuest: false
    };
    
    next();
  } catch (error) {
    console.error('Socket authentication error:', error);
    next(new Error('Invalid token'));
  }
}

// Create guest user for offline/local play
export function createGuestUser(displayName = null) {
  return {
    userId: generateId(),
    displayName: displayName || `Guest_${Date.now()}`,
    isGuest: true
  };
}