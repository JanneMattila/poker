// Local multiplayer game - pass-and-play on a single device
// Cards are hidden by default; players tap/click to peek (with view counter).
import { Deck } from '../../../shared/gameClasses.js';
import { findBestHand, generateId } from '../../../shared/utils.js';

export class LocalGame {
    constructor(playerNames, settings = {}) {
        this.gameId = generateId();
        this.settings = {
            startingChips: 1000,
            smallBlind: 10,
            bigBlind: 20,
            ...settings
        };

        // Create players
        this.players = playerNames.map((name, i) => ({
            id: `local-${i}`,
            name,
            chips: this.settings.startingChips,
            holeCards: [],       // actual Card objects
            currentBet: 0,
            totalBetThisHand: 0,
            status: 'active',    // active | folded | all-in | sitting-out
            isReady: true,
            viewCount: 0,        // how many times hole cards were peeked (both flip together)
            position: i
        }));

        this.deck = new Deck();
        this.communityCards = [];         // Card objects
        this.communityViewCounts = [0, 0, 0, 0, 0]; // peek counts per community card
        this.pot = 0;
        this.currentBetAmount = 0;
        this.minimumRaise = this.settings.bigBlind;
        this.dealerIndex = 0;
        this.activePlayerIndex = 0;
        this.currentHand = 0;
        this.gamePhase = 'waiting'; // waiting | pre-flop | flop | turn | river | showdown | hand-complete
        this.winners = [];
        this.sidePots = [];
        this.lastAction = null;
        this.handHistory = [];

        // Track which player indexes have acted this round
        this._actedThisRound = new Set();
    }

    // ── Lifecycle ──

    startGame() {
        if (this.players.length < 2) throw new Error('Need at least 2 players');
        this.startNewHand();
    }

    startNewHand() {
        this.currentHand++;
        this.communityCards = [];
        this.communityViewCounts = [0, 0, 0, 0, 0];
        this.pot = 0;
        this.currentBetAmount = 0;
        this.minimumRaise = this.settings.bigBlind;
        this.winners = [];
        this.sidePots = [];
        this.lastAction = null;
        this.handHistory = [];
        this._actedThisRound = new Set();

        // Reset players
        this.players.forEach(p => {
            p.holeCards = [];
            p.currentBet = 0;
            p.totalBetThisHand = 0;
            p.viewCount = 0;
            if (p.chips > 0) {
                p.status = 'active';
            } else {
                p.status = 'sitting-out';
            }
        });

        const activePlayers = this._activePlayers();
        if (activePlayers.length < 2) {
            this.gamePhase = 'hand-complete';
            return;
        }

        // Advance dealer
        if (this.currentHand > 1) {
            this.dealerIndex = this._nextActiveIndex(this.dealerIndex);
        }

        // Shuffle & deal
        this.deck.reset().shuffle();
        this._dealHoleCards();

        // Post blinds
        this._postBlinds();

        this.gamePhase = 'pre-flop';

        // First to act is after big blind
        const bbIdx = this._bigBlindIndex();
        this.activePlayerIndex = this._nextActiveIndex(bbIdx);
    }

    // ── Player actions ──

    playerAction(playerIndex, actionType, amount = 0) {
        const player = this.players[playerIndex];
        if (!player) throw new Error('Invalid player');
        if (playerIndex !== this.activePlayerIndex) throw new Error('Not your turn');
        if (player.status !== 'active') throw new Error('Player cannot act');

        let actualAmount = 0;
        let finalAction = actionType;

        switch (actionType) {
            case 'fold':
                player.status = 'folded';
                break;

            case 'check':
                if (player.currentBet < this.currentBetAmount) {
                    throw new Error('Cannot check – must call or fold');
                }
                break;

            case 'call': {
                const toCall = Math.min(this.currentBetAmount - player.currentBet, player.chips);
                actualAmount = toCall;
                this._placeBet(player, toCall);
                if (player.chips === 0) finalAction = 'all-in';
                break;
            }

            case 'bet':
            case 'raise': {
                const callPart = this.currentBetAmount - player.currentBet;
                let total = callPart + amount;
                if (total > player.chips) {
                    total = player.chips;
                    finalAction = 'all-in';
                } else if (amount < this.minimumRaise && total !== player.chips) {
                    throw new Error(`Minimum raise is ${this.minimumRaise}`);
                }
                actualAmount = total;
                this._placeBet(player, total);
                this.currentBetAmount = player.currentBet;
                this.minimumRaise = Math.max(this.minimumRaise, total - callPart);
                // Reset acted set since there's a new bet to respond to
                this._actedThisRound = new Set();
                break;
            }

            default:
                throw new Error('Invalid action');
        }

        this._actedThisRound.add(playerIndex);

        this.lastAction = { playerIndex, action: finalAction, amount: actualAmount };
        this.handHistory.push({ ...this.lastAction, phase: this.gamePhase });

        // Check if hand is over (only one player left)
        const remaining = this._playersInHand();
        if (remaining.length <= 1) {
            this._resolveHand();
            return this.getState();
        }

        // Check if betting round is complete
        if (this._isBettingRoundComplete()) {
            this._nextPhase();
        } else {
            this._advanceToNextPlayer();
        }

        return this.getState();
    }

    // ── Card peeking ──

    peekHoleCards(playerIndex) {
        const player = this.players[playerIndex];
        if (!player || player.holeCards.length < 2) return null;
        player.viewCount++;
        return player.holeCards;
    }

    peekCommunityCard(cardIndex) {
        if (cardIndex >= this.communityCards.length) return null;
        this.communityViewCounts[cardIndex]++;
        return this.communityCards[cardIndex];
    }

    // ── State ──

    getState() {
        return {
            gameId: this.gameId,
            currentHand: this.currentHand,
            gamePhase: this.gamePhase,
            pot: this.pot,
            currentBetAmount: this.currentBetAmount,
            minimumRaise: this.minimumRaise,
            dealerIndex: this.dealerIndex,
            activePlayerIndex: this.activePlayerIndex,
            communityCardCount: this.communityCards.length,
            communityViewCounts: [...this.communityViewCounts],
            players: this.players.map(p => ({
                id: p.id,
                name: p.name,
                chips: p.chips,
                currentBet: p.currentBet,
                status: p.status,
                viewCount: p.viewCount,
                hasCards: p.holeCards.length === 2,
                position: p.position
            })),
            winners: this.winners,
            sidePots: this.sidePots,
            lastAction: this.lastAction,
            settings: this.settings
        };
    }

    // ── Internals ──

    _activePlayers() {
        return this.players.filter(p => p.status !== 'sitting-out');
    }

    _playersInHand() {
        return this.players.filter(p => p.status === 'active' || p.status === 'all-in');
    }

    _nextActiveIndex(fromIndex) {
        let idx = fromIndex;
        for (let i = 0; i < this.players.length; i++) {
            idx = (idx + 1) % this.players.length;
            if (this.players[idx].status === 'active') return idx;
        }
        return fromIndex; // fallback
    }

    _smallBlindIndex() {
        const active = this._activePlayers();
        if (active.length === 2) return this.dealerIndex; // heads-up
        return this._nextActiveIndex(this.dealerIndex);
    }

    _bigBlindIndex() {
        return this._nextActiveIndex(this._smallBlindIndex());
    }

    _dealHoleCards() {
        for (let round = 0; round < 2; round++) {
            for (const p of this.players) {
                if (p.status !== 'sitting-out') {
                    p.holeCards.push(this.deck.dealCard(p.id, 'hole'));
                }
            }
        }
    }

    _postBlinds() {
        const sbPlayer = this.players[this._smallBlindIndex()];
        const bbPlayer = this.players[this._bigBlindIndex()];

        const sbAmount = Math.min(this.settings.smallBlind, sbPlayer.chips);
        this._placeBet(sbPlayer, sbAmount);

        const bbAmount = Math.min(this.settings.bigBlind, bbPlayer.chips);
        this._placeBet(bbPlayer, bbAmount);

        this.currentBetAmount = bbAmount;
    }

    _placeBet(player, amount) {
        const actual = Math.min(amount, player.chips);
        player.chips -= actual;
        player.currentBet += actual;
        player.totalBetThisHand += actual;
        this.pot += actual;
        if (player.chips === 0 && player.status === 'active') {
            player.status = 'all-in';
        }
    }

    _advanceToNextPlayer() {
        this.activePlayerIndex = this._nextActiveIndex(this.activePlayerIndex);
    }

    _isBettingRoundComplete() {
        const active = this.players.filter(p => p.status === 'active');
        if (active.length === 0) return true;

        // All active players must have acted AND bets must be equal
        const allActed = active.every(p => this._actedThisRound.has(this.players.indexOf(p)));
        const betsEqual = active.every(p => p.currentBet === this.currentBetAmount);

        return allActed && betsEqual;
    }

    _nextPhase() {
        // Reset per-round state
        this.players.forEach(p => (p.currentBet = 0));
        this.currentBetAmount = 0;
        this.minimumRaise = this.settings.bigBlind;
        this._actedThisRound = new Set();

        switch (this.gamePhase) {
            case 'pre-flop':
                this.gamePhase = 'flop';
                this._dealCommunityCards(3);
                break;
            case 'flop':
                this.gamePhase = 'turn';
                this._dealCommunityCards(1);
                break;
            case 'turn':
                this.gamePhase = 'river';
                this._dealCommunityCards(1);
                break;
            case 'river':
                this._resolveHand();
                return;
        }

        // First to act post-flop: small blind or next active
        const sbIdx = this._smallBlindIndex();
        if (this.players[sbIdx].status === 'active') {
            this.activePlayerIndex = sbIdx;
        } else {
            this.activePlayerIndex = this._nextActiveIndex(sbIdx);
        }
    }

    _dealCommunityCards(count) {
        // Burn one
        this.deck.dealCard(null, 'burn');
        for (let i = 0; i < count; i++) {
            this.communityCards.push(this.deck.dealCard(null, 'community'));
        }
    }

    /**
     * Calculate side pots based on each player's totalBetThisHand.
     * Returns an array of { amount, eligible: [playerIndex, ...] }.
     */
    _calculateSidePots() {
        // Gather all players who have invested chips this hand
        const contribs = this.players
            .map((p, i) => ({ index: i, total: p.totalBetThisHand, inHand: p.status === 'active' || p.status === 'all-in' }))
            .filter(c => c.total > 0);

        // Sort by total bet ascending so we can peel pots
        contribs.sort((a, b) => a.total - b.total);

        const pots = [];
        let processed = 0; // cumulative level already accounted for

        for (let i = 0; i < contribs.length; i++) {
            const level = contribs[i].total;
            if (level <= processed) continue; // skip duplicate levels

            const increment = level - processed;
            // Every contributor with total >= level pays "increment" into this pot
            const contributors = contribs.filter(c => c.total >= level);
            const potAmount = increment * contributors.length;
            // Only players still in hand (not folded) are eligible to win
            const eligible = contributors.filter(c => c.inHand).map(c => c.index);

            pots.push({ amount: potAmount, eligible });
            processed = level;
        }

        return pots;
    }

    _resolveHand() {
        const inHand = this._playersInHand();

        if (inHand.length === 1) {
            // Unopposed winner — gets everything
            const winner = inHand[0];
            this.winners = [{ playerIndex: this.players.indexOf(winner), name: winner.name, amount: this.pot, handType: 'unopposed' }];
            winner.chips += this.pot;
        } else {
            // Deal remaining community cards if needed
            while (this.communityCards.length < 5) {
                this.deck.dealCard(null, 'burn');
                this.communityCards.push(this.deck.dealCard(null, 'community'));
            }

            // Evaluate hands
            const evaluated = inHand.map(p => {
                const best = findBestHand(p.holeCards, this.communityCards);
                return { player: p, index: this.players.indexOf(p), rank: best.rank, cards: best.cards };
            });

            // Sort by hand strength (best first)
            evaluated.sort((a, b) => {
                if (a.rank.value !== b.rank.value) return b.rank.value - a.rank.value;
                return b.rank.high - a.rank.high;
            });

            // Calculate side pots and distribute
            const sidePots = this._calculateSidePots();
            this.sidePots = sidePots; // store for UI

            this.winners = [];
            const winMap = new Map(); // playerIndex -> { amount, handType, name }

            for (const pot of sidePots) {
                // Find best hand among eligible players for this pot
                const eligibleEval = evaluated.filter(e => pot.eligible.includes(e.index));
                if (eligibleEval.length === 0) continue;

                const bestRank = eligibleEval[0].rank;
                const potWinners = eligibleEval.filter(e =>
                    e.rank.value === bestRank.value && e.rank.high === bestRank.high
                );

                const share = Math.floor(pot.amount / potWinners.length);
                for (const w of potWinners) {
                    w.player.chips += share;
                    const existing = winMap.get(w.index);
                    if (existing) {
                        existing.amount += share;
                    } else {
                        winMap.set(w.index, {
                            playerIndex: w.index,
                            name: w.player.name,
                            amount: share,
                            handType: w.rank.type
                        });
                    }
                }
            }

            this.winners = Array.from(winMap.values());
        }

        this.gamePhase = 'showdown';
    }

    /** Advance to next hand (call after showdown UI is done) */
    nextHand() {
        if (this.players.filter(p => p.chips > 0).length < 2) {
            this.gamePhase = 'hand-complete';
            return this.getState();
        }
        this.startNewHand();
        return this.getState();
    }
}
