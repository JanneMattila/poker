# Texas Hold'em Poker Game

A full-featured Texas Hold'em poker game with both online multiplayer and local offline modes. Built with Node.js, vanilla JavaScript, and Socket.IO for real-time gameplay.

## Features

### Game Modes
- **Online Multiplayer**: Create or join rooms with up to 9 players
- **Local Multiplayer**: Play offline with multiple players on the same device
- **Spectator Mode**: Watch ongoing games without participating

### Game Features
- Complete Texas Hold'em rules implementation
- Real-time gameplay with WebSocket connections
- Chat system with public and private messages
- Player statistics and game history
- Comprehensive hand evaluation and winner determination
- Blind structure and betting rounds
- All-in and side pot calculations
- Reconnection handling for dropped connections
- Anti-cheat measures with action verification

### User Interface
- Responsive design for desktop and mobile
- Animated card dealing and betting actions
- Real-time pot and betting information
- Player status indicators and turn management
- Room management and player controls
- Guest and authenticated user support

## Technology Stack

### Frontend
- **Vanilla JavaScript** - No framework dependencies
- **HTML5 & CSS3** - Modern web standards
- **Vite** - Fast build tool and dev server
- **Socket.IO Client** - Real-time communication

### Backend
- **Node.js** - Runtime environment
- **Express.js** - Web application framework
- **Socket.IO** - Real-time bidirectional communication
- **JWT** - Authentication and session management

### Shared Logic
- **ES6 Modules** - Shared game logic between client and server
- **Game Classes** - Card, Deck, Player, Game, and Room management
- **Utilities** - Hand evaluation, betting calculations, and game state management

## Installation

### Prerequisites
- Node.js 18+ 
- npm or yarn

### Local Development Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/JanneMattila/poker.git
   cd poker
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Setup environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Start development servers**
   ```bash
   npm run dev
   ```
   This starts both the client dev server (http://localhost:5173) and the backend server (http://localhost:3000)

5. **Access the game**
   Open http://localhost:5173 in your browser

## Available Scripts

- `npm run dev` - Start both client and server in development mode
- `npm run build` - Build the client for production
- `npm run preview` - Preview the built client
- `npm run server:dev` - Start only the server in development mode
- `npm run server:prod` - Start the server in production mode
- `npm run client:dev` - Start only the client dev server
- `npm test` - Run tests (when implemented)
- `npm run lint` - Run ESLint
- `npm run format` - Format code with Prettier

## Game Rules

### Texas Hold'em Basics

1. **Setup**: Each player receives 2 hole cards
2. **Betting Rounds**:
   - Pre-flop: After hole cards are dealt
   - Flop: After first 3 community cards
   - Turn: After 4th community card
   - River: After 5th community card
3. **Actions**: Fold, Check, Call, Bet, Raise, All-in
4. **Winner**: Best 5-card hand using hole cards and community cards

### Hand Rankings (High to Low)
1. Royal Flush
2. Straight Flush
3. Four of a Kind
4. Full House
5. Flush
6. Straight
7. Three of a Kind
8. Two Pair
9. One Pair
10. High Card

## Authentication

### Supported Methods
- **Microsoft Account**: OAuth 2.0 integration
- **Guest Access**: Play without registration

### Security Features
- JWT token-based authentication
- Session management
- Input validation and sanitization
- Anti-cheat measures

## Deployment

### Azure App Service Deployment

The game is designed to be deployed on Azure App Service:

1. **Build the application**
   ```bash
   npm run build
   ```

2. **Deploy using Azure CLI**
   ```bash
   az webapp deployment source config-zip \
     --resource-group poker-game-rg \
     --name texas-holdem-poker \
     --src dist.zip
   ```

3. **Set environment variables**
   Configure in Azure App Service settings:
   - `NODE_ENV=production`
   - `PORT=80`
   - `JWT_SECRET=your-production-secret`

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT License - see LICENSE file for details

---

**Enjoy the game! 🃏**
