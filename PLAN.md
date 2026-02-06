# Texas Hold'em Poker Game Plan

This document outlines the plan for developing a Texas Hold'em Poker game. It includes the game rules, features, and development milestones.

## Technologies

- Programming Language: Node.js
- Frontend: Vanilla JavaScript, HTML, CSS
- Backend: Vite with Node.js
- Database: SQL database
- All the code will be vanilla JavaScript and all business logic code will be shared between frontend and backend.
- Frontend SPA as aggressive caching for all resources to support offline mode.
  - You can play locally againts other players on the same device. Card dealing and shuffling will be done on the client side. Game state will be stored in IndexedDB. Cards can be revealed only to the player who owns them and view count is tracked.
- For online multiplayer, WebSocket will be used for real-time communication.
- All game actions will be persisted so that games can be replayed and verified for fairness later.
- Microsoft Account authentication will be used for user login and management.

## Game Modes

- Create Game: Host a new game and invite friends via a unique link.
  - Game settings: number of players, starting chips, blind structure, time limits and visibility options.
  - Spectate Game: Watch an ongoing game without participating.
- Join Game: Join an existing game using the provided link.
- Local Multiplayer: Play against other players on the same device in offline mode.

## Deployment

The game will be deployed to Azure using Azure App Service for hosting the application and Azure SQL Database for storing game data.

## Data Structures

### **Room/Game Lobby**
```javascript
Room {
  roomId: string (UUID)
  hostUserId: string
  roomName: string
  maxPlayers: number (2-9)
  currentPlayers: number
  gameSettings: {
    startingChips: number
    smallBlind: number
    bigBlind: number
    blindIncreaseInterval: number (minutes)
    timePerAction: number (seconds)
    visibility: 'public' | 'private' | 'friends-only'
    spectatingAllowed: boolean
  }
  status: 'waiting' | 'in-progress' | 'completed'
  createdAt: timestamp
  gameStartedAt: timestamp
  inviteCode: string
  passwordProtected: boolean
  password?: string
}
```

### **Game State**
```javascript
Game {
  gameId: string (UUID)
  roomId: string
  currentHand: number
  gamePhase: 'pre-flop' | 'flop' | 'turn' | 'river' | 'showdown' | 'hand-complete'
  pot: {
    mainPot: number
    sidePots: Array<{amount: number, eligiblePlayers: string[]}>
  }
  communityCards: Array<Card> (max 5)
  currentBetAmount: number
  minimumRaise: number
  dealerPosition: number
  smallBlindPosition: number
  bigBlindPosition: number
  activePlayerPosition: number
  playersInHand: Array<string> // playerIds still in hand
  deck: Array<Card>
  handHistory: Array<GameAction>
  winners: Array<{playerId: string, amount: number, handType: string}>
  createdAt: timestamp
  completedAt?: timestamp
}
```

### **Player State**
```javascript
Player {
  playerId: string (UUID)
  userId?: string (null for offline/guest players)
  displayName: string
  chipStack: number
  position: number (0-8, seat at table)
  holeCards: Array<Card> (2 cards)
  currentBet: number
  totalBetThisHand: number
  status: 'active' | 'folded' | 'all-in' | 'sitting-out'
  actionTimeUsed: number (seconds)
  isConnected: boolean
  lastAction?: GameAction
  statistics: PlayerStats
}

PlayerStats {
  handsPlayed: number
  handsWon: number
  totalWinnings: number
  totalLosses: number
  biggestPot: number
  vpip: number // voluntarily put money in pot percentage
  pfr: number // pre-flop raise percentage
}
```

### **Card Management**
```javascript
Card {
  suit: 'hearts' | 'diamonds' | 'clubs' | 'spades'
  rank: 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K'
  value: number (2-14, where A=14 for high, 1 for low)
}

Deck {
  cards: Array<Card>
  shuffleHistory: Array<{timestamp: timestamp, random_seed: string}>
  dealHistory: Array<{cardIndex: number, playerId?: string, type: 'hole' | 'community'}>
}
```

### **Game Actions & History**
```javascript
GameAction {
  actionId: string (UUID)
  gameId: string
  handNumber: number
  playerId: string
  actionType: 'fold' | 'call' | 'bet' | 'raise' | 'check' | 'all-in'
  amount?: number
  gamePhase: 'pre-flop' | 'flop' | 'turn' | 'river'
  position: number
  timestamp: timestamp
  timeToAct: number (milliseconds taken)
  potSizeBeforeAction: number
  chipStackBeforeAction: number
}

HandHistory {
  handId: string (UUID)
  gameId: string
  handNumber: number
  dealerPosition: number
  smallBlind: number
  bigBlind: number
  communityCards: Array<Card>
  playerHands: Array<{playerId: string, holeCards: Array<Card>}>
  actions: Array<GameAction>
  winners: Array<{playerId: string, winningHand: string, amount: number}>
  totalPot: number
  handStartTime: timestamp
  handEndTime: timestamp
  handDuration: number
}
```

### **User Management**
```javascript
User {
  userId: string (UUID)
  microsoftAccountId: string
  displayName: string
  email: string
  avatarUrl?: string
  totalChipsEarned: number
  totalChipsLost: number
  gamesPlayed: number
  gamesWon: number
  longestWinStreak: number
  currentWinStreak: number
  achievements: Array<Achievement>
  preferences: UserPreferences
  createdAt: timestamp
  lastLoginAt: timestamp
}

UserPreferences {
  autoMuck: boolean // hide cards when folding
  autoPostBlinds: boolean
  showPotOdds: boolean
  soundEnabled: boolean
  animationsEnabled: boolean
  tableTheme: string
  cardBack: string
}

Achievement {
  achievementId: string
  name: string
  description: string
  unlockedAt: timestamp
  iconUrl: string
}
```

### **Session & Connection Management**
```javascript
PlayerSession {
  sessionId: string (UUID)
  playerId: string
  roomId: string
  socketId: string
  connectionStatus: 'connected' | 'disconnected' | 'reconnecting'
  lastHeartbeat: timestamp
  joinedAt: timestamp
  disconnectedAt?: timestamp
  ipAddress: string
  userAgent: string
}

SpectatorSession {
  sessionId: string (UUID)
  userId?: string
  roomId: string
  socketId: string
  joinedAt: timestamp
  permissions: Array<'view-hands' | 'view-chat' | 'view-statistics'>
}
```

### **Chat System**
```javascript
ChatMessage {
  messageId: string
  roomId: string
  playerId?: string
  message: string
  messageType: 'player' | 'system' | 'admin'
  timestamp: timestamp
  isPrivate: boolean
  recipientId?: string
}
```

### **Anti-Cheat & Fairness**
```javascript
FairnessVerification {
  handId: string
  shuffleSeed: string
  shuffleAlgorithm: string
  cardDistribution: Array<Card>
  verificationHash: string
  timestamp: timestamp
}
