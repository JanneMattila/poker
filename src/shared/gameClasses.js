// Shared game logic for both frontend and backend
import { generateId } from './utils.js';

export class Card {
  constructor(suit, rank) {
    this.suit = suit;
    this.rank = rank;
    this.value = this.getRankValue(rank);
  }

  getRankValue(rank) {
    const values = {
      '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
      '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14
    };
    return values[rank];
  }

  toString() {
    return `${this.rank} of ${this.suit}`;
  }
}

export class Deck {
  constructor() {
    this.cards = this.createDeck();
    this.shuffleHistory = [];
    this.dealHistory = [];
  }

  createDeck() {
    const suits = ['hearts', 'diamonds', 'clubs', 'spades'];
    const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    const deck = [];

    for (const suit of suits) {
      for (const rank of ranks) {
        deck.push(new Card(suit, rank));
      }
    }

    return deck;
  }

  shuffle(randomSeed = Date.now().toString()) {
    // Simple shuffle algorithm using seed for reproducibility
    const shuffled = [...this.cards];
    let currentIndex = shuffled.length;

    // Convert seed to a simple pseudorandom number generator
    let seed = this.hashCode(randomSeed);

    while (currentIndex !== 0) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      const randomIndex = seed % currentIndex;
      currentIndex--;

      [shuffled[currentIndex], shuffled[randomIndex]] = 
        [shuffled[randomIndex], shuffled[currentIndex]];
    }

    this.cards = shuffled;
    this.shuffleHistory.push({
      timestamp: new Date().toISOString(),
      randomSeed: randomSeed
    });

    return this;
  }

  hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  dealCard(playerId = null, type = 'hole') {
    if (this.cards.length === 0) {
      throw new Error('Cannot deal from empty deck');
    }

    const card = this.cards.pop();
    this.dealHistory.push({
      cardIndex: 52 - this.cards.length - 1,
      playerId,
      type,
      timestamp: new Date().toISOString()
    });

    return card;
  }

  reset() {
    this.cards = this.createDeck();
    this.shuffleHistory = [];
    this.dealHistory = [];
    return this;
  }
}

export class Player {
  constructor(userId, displayName, chipStack = 1000, position = 0) {
    this.playerId = generateId();
    this.userId = userId;
    this.displayName = displayName;
    this.chipStack = chipStack;
    this.position = position;
    this.holeCards = [];
    this.currentBet = 0;
    this.totalBetThisHand = 0;
    this.status = 'active';
    this.actionTimeUsed = 0;
    this.isConnected = true;
    this.lastAction = null;
    this.statistics = {
      handsPlayed: 0,
      handsWon: 0,
      totalWinnings: 0,
      totalLosses: 0,
      biggestPot: 0,
      vpip: 0,
      pfr: 0
    };
  }

  dealHoleCards(card1, card2) {
    this.holeCards = [card1, card2];
  }

  bet(amount) {
    if (amount > this.chipStack) {
      amount = this.chipStack; // All-in
      this.status = 'all-in';
    }
    
    this.chipStack -= amount;
    this.currentBet += amount;
    this.totalBetThisHand += amount;
    
    return amount;
  }

  fold() {
    this.status = 'folded';
    this.holeCards = []; // Clear hole cards for security
  }

  resetForNewHand() {
    this.holeCards = [];
    this.currentBet = 0;
    this.totalBetThisHand = 0;
    this.status = this.chipStack > 0 ? 'active' : 'sitting-out';
    this.actionTimeUsed = 0;
    this.lastAction = null;
  }

  canAct() {
    return this.status === 'active' && this.isConnected;
  }
}

export class GameAction {
  constructor(gameId, handNumber, playerId, actionType, amount = 0, gamePhase, position) {
    this.actionId = generateId();
    this.gameId = gameId;
    this.handNumber = handNumber;
    this.playerId = playerId;
    this.actionType = actionType;
    this.amount = amount;
    this.gamePhase = gamePhase;
    this.position = position;
    this.timestamp = new Date().toISOString();
    this.timeToAct = 0;
    this.potSizeBeforeAction = 0;
    this.chipStackBeforeAction = 0;
  }
}