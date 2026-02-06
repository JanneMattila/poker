// Main game logic class
import { Deck, Player, GameAction } from './gameClasses.js';
import { generateId, getNextPosition, findBestHand } from './utils.js';

export class Game {
  constructor(roomId, gameSettings) {
    this.gameId = generateId();
    this.roomId = roomId;
    this.currentHand = 0;
    this.gamePhase = 'waiting'; // 'waiting' | 'pre-flop' | 'flop' | 'turn' | 'river' | 'showdown' | 'hand-complete'
    this.players = [];
    this.pot = { mainPot: 0, sidePots: [] };
    this.communityCards = [];
    this.currentBetAmount = 0;
    this.minimumRaise = 0;
    this.dealerPosition = 0;
    this.smallBlindPosition = 1;
    this.bigBlindPosition = 2;
    this.activePlayerPosition = 3;
    this.playersInHand = [];
    this.deck = new Deck();
    this.handHistory = [];
    this.winners = [];
    this.gameSettings = {
      startingChips: 1000,
      smallBlind: 10,
      bigBlind: 20,
      maxPlayers: 6,
      timePerAction: 30,
      ...gameSettings
    };
    this.createdAt = new Date().toISOString();
    this.completedAt = null;
    this.actionTimeout = null;
  }

  addPlayer(userId, displayName, position = null) {
    if (this.players.length >= this.gameSettings.maxPlayers) {
      throw new Error('Game is full');
    }

    if (this.gamePhase !== 'waiting') {
      throw new Error('Cannot add players during active game');
    }

    // Find available position
    if (position === null) {
      position = this.findAvailablePosition();
    }

    const player = new Player(userId, displayName, this.gameSettings.startingChips, position);
    this.players.push(player);
    
    // Sort players by position
    this.players.sort((a, b) => a.position - b.position);

    return player;
  }

  findAvailablePosition() {
    const occupiedPositions = new Set(this.players.map(p => p.position));
    for (let i = 0; i < this.gameSettings.maxPlayers; i++) {
      if (!occupiedPositions.has(i)) {
        return i;
      }
    }
    throw new Error('No available positions');
  }

  removePlayer(playerId) {
    const playerIndex = this.players.findIndex(p => p.playerId === playerId);
    if (playerIndex === -1) {
      throw new Error('Player not found');
    }

    this.players.splice(playerIndex, 1);
    this.playersInHand = this.playersInHand.filter(id => id !== playerId);
  }

  startGame() {
    if (this.players.length < 2) {
      throw new Error('Need at least 2 players to start');
    }

    this.gamePhase = 'pre-flop';
    this.startNewHand();
  }

  startNewHand() {
    this.currentHand++;
    this.gamePhase = 'pre-flop';
    this.communityCards = [];
    this.currentBetAmount = 0;
    this.minimumRaise = this.gameSettings.bigBlind;
    this.pot = { mainPot: 0, sidePots: [] };
    this.handHistory = [];
    this.winners = [];

    // Reset all players for new hand
    this.players.forEach(player => player.resetForNewHand());
    
    // Set active players
    this.playersInHand = this.players
      .filter(player => player.chipStack > 0 && player.status !== 'sitting-out')
      .map(player => player.playerId);

    if (this.playersInHand.length < 2) {
      this.endGame();
      return;
    }

    // Update positions
    this.updatePositions();
    
    // Shuffle and deal cards
    this.deck.reset().shuffle();
    this.dealHoleCards();
    
    // Post blinds
    this.postBlinds();
    
    // Set first player to act (UTG)
    this.setFirstPlayerToAct();
  }

  updatePositions() {
    const activePlayers = this.players.filter(p => 
      this.playersInHand.includes(p.playerId));

    if (activePlayers.length === 2) {
      // Heads up: dealer posts small blind
      this.dealerPosition = 0;
      this.smallBlindPosition = 0;
      this.bigBlindPosition = 1;
    } else {
      // Normal game
      this.dealerPosition = (this.dealerPosition + 1) % activePlayers.length;
      this.smallBlindPosition = (this.dealerPosition + 1) % activePlayers.length;
      this.bigBlindPosition = (this.dealerPosition + 2) % activePlayers.length;
    }
  }

  dealHoleCards() {
    // Deal 2 cards to each active player
    for (let round = 0; round < 2; round++) {
      for (const playerId of this.playersInHand) {
        const player = this.getPlayer(playerId);
        const card = this.deck.dealCard(playerId, 'hole');
        player.holeCards.push(card);
      }
    }
  }

  postBlinds() {
    const activePlayers = this.players.filter(p => 
      this.playersInHand.includes(p.playerId));

    if (activePlayers.length < 2) return;

    const smallBlindPlayer = activePlayers[this.smallBlindPosition];
    const bigBlindPlayer = activePlayers[this.bigBlindPosition];

    // Post small blind
    const smallBlindAmount = Math.min(this.gameSettings.smallBlind, smallBlindPlayer.chipStack);
    smallBlindPlayer.bet(smallBlindAmount);
    this.pot.mainPot += smallBlindAmount;
    
    this.recordAction(smallBlindPlayer.playerId, 'bet', smallBlindAmount);

    // Post big blind
    const bigBlindAmount = Math.min(this.gameSettings.bigBlind, bigBlindPlayer.chipStack);
    bigBlindPlayer.bet(bigBlindAmount);
    this.pot.mainPot += bigBlindAmount;
    this.currentBetAmount = bigBlindAmount;
    
    this.recordAction(bigBlindPlayer.playerId, 'bet', bigBlindAmount);
  }

  setFirstPlayerToAct() {
    const activePlayers = this.players.filter(p => 
      this.playersInHand.includes(p.playerId));

    if (this.gamePhase === 'pre-flop') {
      // Pre-flop: first to act is UTG (after big blind)
      this.activePlayerPosition = (this.bigBlindPosition + 1) % activePlayers.length;
    } else {
      // Post-flop: first to act is small blind (or next active player)
      this.activePlayerPosition = this.smallBlindPosition;
      while (!this.canPlayerAct(activePlayers[this.activePlayerPosition])) {
        this.activePlayerPosition = (this.activePlayerPosition + 1) % activePlayers.length;
      }
    }
  }

  canPlayerAct(player) {
    return player && 
           this.playersInHand.includes(player.playerId) && 
           player.status === 'active' && 
           player.isConnected;
  }

  getPlayer(playerId) {
    return this.players.find(p => p.playerId === playerId);
  }

  getCurrentPlayer() {
    const activePlayers = this.players.filter(p => 
      this.playersInHand.includes(p.playerId));
    return activePlayers[this.activePlayerPosition];
  }

  playerAction(playerId, actionType, amount = 0) {
    const player = this.getPlayer(playerId);
    if (!player) {
      throw new Error('Player not found');
    }

    const currentPlayer = this.getCurrentPlayer();
    if (!currentPlayer || currentPlayer.playerId !== playerId) {
      throw new Error('Not your turn');
    }

    if (!this.canPlayerAct(player)) {
      throw new Error('Player cannot act');
    }

    let actualAmount = 0;
    let finalActionType = actionType;

    switch (actionType) {
      case 'fold':
        player.fold();
        this.playersInHand = this.playersInHand.filter(id => id !== playerId);
        break;

      case 'check':
        if (player.currentBet < this.currentBetAmount) {
          throw new Error('Cannot check, must call or fold');
        }
        break;

      case 'call':
        actualAmount = Math.min(
          this.currentBetAmount - player.currentBet,
          player.chipStack
        );
        player.bet(actualAmount);
        this.pot.mainPot += actualAmount;
        
        if (actualAmount === player.chipStack && player.chipStack > 0) {
          finalActionType = 'all-in';
        }
        break;

      case 'bet':
      case 'raise':
        if (this.currentBetAmount > 0 && actionType === 'bet') {
          throw new Error('Cannot bet, must call or raise');
        }
        
        const callAmount = this.currentBetAmount - player.currentBet;
        const totalAmount = callAmount + amount;
        
        if (totalAmount > player.chipStack) {
          // All-in
          actualAmount = player.chipStack;
          finalActionType = 'all-in';
        } else {
          actualAmount = totalAmount;
        }

        if (actualAmount < this.minimumRaise + callAmount && actualAmount !== player.chipStack) {
          throw new Error(`Minimum raise is ${this.minimumRaise}`);
        }

        player.bet(actualAmount);
        this.pot.mainPot += actualAmount;
        this.currentBetAmount = player.currentBet;
        this.minimumRaise = actualAmount - callAmount;
        break;

      default:
        throw new Error('Invalid action type');
    }

    this.recordAction(playerId, finalActionType, actualAmount);

    // Move to next player or next phase
    if (this.isBettingRoundComplete()) {
      this.nextPhase();
    } else {
      this.nextPlayer();
    }

    return { actionType: finalActionType, amount: actualAmount };
  }

  recordAction(playerId, actionType, amount) {
    const player = this.getPlayer(playerId);
    const action = new GameAction(
      this.gameId,
      this.currentHand,
      playerId,
      actionType,
      amount,
      this.gamePhase,
      player.position
    );

    action.potSizeBeforeAction = this.pot.mainPot;
    action.chipStackBeforeAction = player.chipStack + amount;

    this.handHistory.push(action);
    player.lastAction = action;
  }

  isBettingRoundComplete() {
    const activePlayers = this.players.filter(p => 
      this.playersInHand.includes(p.playerId) && p.canAct());

    if (activePlayers.length <= 1) {
      return true;
    }

    // Check if all players have acted and bets are equal
    const playersWhoCanRaise = activePlayers.filter(p => 
      p.chipStack > 0 && p.currentBet === this.currentBetAmount);

    return playersWhoCanRaise.length <= 1;
  }

  nextPlayer() {
    const activePlayers = this.players.filter(p => 
      this.playersInHand.includes(p.playerId));

    do {
      this.activePlayerPosition = (this.activePlayerPosition + 1) % activePlayers.length;
    } while (!this.canPlayerAct(activePlayers[this.activePlayerPosition]));
  }

  nextPhase() {
    // Reset bets for next betting round
    this.players.forEach(player => player.currentBet = 0);
    this.currentBetAmount = 0;
    this.minimumRaise = this.gameSettings.bigBlind;

    switch (this.gamePhase) {
      case 'pre-flop':
        this.gamePhase = 'flop';
        this.dealCommunityCards(3);
        break;
      case 'flop':
        this.gamePhase = 'turn';
        this.dealCommunityCards(1);
        break;
      case 'turn':
        this.gamePhase = 'river';
        this.dealCommunityCards(1);
        break;
      case 'river':
        this.gamePhase = 'showdown';
        this.processShowdown();
        return;
    }

    this.setFirstPlayerToAct();
  }

  dealCommunityCards(count) {
    // Burn one card first
    this.deck.dealCard(null, 'burn');
    
    for (let i = 0; i < count; i++) {
      const card = this.deck.dealCard(null, 'community');
      this.communityCards.push(card);
    }
  }

  processShowdown() {
    const activePlayers = this.players.filter(p => 
      this.playersInHand.includes(p.playerId));

    if (activePlayers.length === 1) {
      // Only one player left, they win
      this.winners = [{
        playerId: activePlayers[0].playerId,
        amount: this.pot.mainPot,
        handType: 'unopposed'
      }];
    } else {
      // Evaluate hands and determine winners
      this.evaluateHands();
    }

    this.distributePot();
    this.gamePhase = 'hand-complete';
    
    // Start new hand after delay
    setTimeout(() => {
      if (this.shouldContinueGame()) {
        this.startNewHand();
      } else {
        this.endGame();
      }
    }, 5000);
  }

  evaluateHands() {
    const playerHands = [];

    for (const playerId of this.playersInHand) {
      const player = this.getPlayer(playerId);
      const bestHand = findBestHand(player.holeCards, this.communityCards);
      playerHands.push({
        playerId,
        hand: bestHand.cards,
        rank: bestHand.rank,
        player
      });
    }

    // Sort by hand strength (best first)
    playerHands.sort((a, b) => {
      if (a.rank.value !== b.rank.value) {
        return b.rank.value - a.rank.value;
      }
      return b.rank.high - a.rank.high;
    });

    // Find all winners (tied hands)
    const bestRank = playerHands[0].rank;
    const winners = playerHands.filter(h => 
      h.rank.value === bestRank.value && h.rank.high === bestRank.high);

    this.winners = winners.map(w => ({
      playerId: w.playerId,
      amount: Math.floor(this.pot.mainPot / winners.length),
      handType: w.rank.type
    }));
  }

  distributePot() {
    this.winners.forEach(winner => {
      const player = this.getPlayer(winner.playerId);
      player.chipStack += winner.amount;
      player.statistics.totalWinnings += winner.amount;
      player.statistics.handsWon++;
    });

    // Update statistics for all players
    this.players.forEach(player => {
      player.statistics.handsPlayed++;
      if (!this.winners.find(w => w.playerId === player.playerId)) {
        player.statistics.totalLosses += player.totalBetThisHand;
      }
    });
  }

  shouldContinueGame() {
    const playersWithChips = this.players.filter(p => p.chipStack > 0);
    return playersWithChips.length > 1;
  }

  endGame() {
    this.gamePhase = 'completed';
    this.completedAt = new Date().toISOString();
    
    // Update final statistics
    const winner = this.players.reduce((prev, current) => 
      (prev.chipStack > current.chipStack) ? prev : current);
    
    winner.statistics.gamesWon++;
  }

  getGameState(excludePrivateInfo = false) {
    const state = {
      gameId: this.gameId,
      roomId: this.roomId,
      currentHand: this.currentHand,
      gamePhase: this.gamePhase,
      pot: this.pot,
      communityCards: this.communityCards,
      currentBetAmount: this.currentBetAmount,
      minimumRaise: this.minimumRaise,
      dealerPosition: this.dealerPosition,
      activePlayerPosition: this.activePlayerPosition,
      players: this.players.map(player => ({
        ...player,
        holeCards: excludePrivateInfo ? [] : player.holeCards
      })),
      winners: this.winners,
      gameSettings: this.gameSettings
    };

    return state;
  }
}