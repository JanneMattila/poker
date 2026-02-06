// UI management for the poker game
export class PokerUI {
    constructor() {
        this.currentScreen = null;
        this.modalOverlay = document.getElementById('modal-overlay');
        this.setupModalEvents();
    }

    showScreen(screenId, updateHash = true) {
        // Hide all screens
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.add('hidden');
        });

        // Show the requested screen
        const screen = document.getElementById(`${screenId}-screen`);
        if (screen) {
            screen.classList.remove('hidden');
            this.currentScreen = screenId;
        }

        // Update URL hash for navigation state
        if (updateHash) {
            const hash = screenId === 'welcome' ? '' : screenId;
            if (window.location.hash !== `#${hash}`) {
                window.history.pushState(null, '', hash ? `#${hash}` : window.location.pathname);
            }
        }
    }

    showError(message) {
        const errorMessage = document.getElementById('error-message');
        errorMessage.textContent = message;
        this.showModal('error-modal');
    }

    showModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            this.modalOverlay.classList.remove('hidden');
            modal.style.display = 'block';
        }
    }

    hideModal() {
        this.modalOverlay.classList.add('hidden');
        document.querySelectorAll('.modal').forEach(modal => {
            modal.style.display = 'none';
        });
    }

    setupModalEvents() {
        // Close modal when clicking overlay
        this.modalOverlay.addEventListener('click', (e) => {
            if (e.target === this.modalOverlay) {
                this.hideModal();
            }
        });

        // Close modal buttons
        document.querySelectorAll('.modal-close, #error-ok').forEach(btn => {
            btn.addEventListener('click', () => {
                this.hideModal();
            });
        });

        // Escape key closes modal
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.hideModal();
            }
        });
    }

    displayRoomsList(rooms, onJoinRoom) {
        const roomsList = document.getElementById('rooms-list');
        roomsList.innerHTML = '';

        if (!rooms || rooms.length === 0) {
            roomsList.innerHTML = '<p class="text-center">No public rooms available</p>';
            return;
        }

        rooms.forEach(room => {
            const roomElement = this.createRoomListItem(room, onJoinRoom);
            roomsList.appendChild(roomElement);
        });
    }

    createRoomListItem(room, onJoinRoom) {
        const div = document.createElement('div');
        div.className = 'room-item';
        div.innerHTML = `
            <div class="room-details">
                <h4>${this.escapeHtml(room.roomName)}</h4>
                <p>Players: ${room.currentPlayers}/${room.maxPlayers} | 
                   Host: ${this.escapeHtml(room.host)} | 
                   Blinds: $${room.gameSettings.smallBlind}/$${room.gameSettings.bigBlind}
                   ${room.passwordProtected ? ' 🔒' : ''}
                </p>
                <small>Created: ${this.formatTime(room.createdAt)}</small>
            </div>
            <div class="room-actions">
                <button class="btn btn-primary join-room-btn" data-room-id="${room.roomId}">
                    Join Room
                </button>
            </div>
        `;

        const joinBtn = div.querySelector('.join-room-btn');
        joinBtn.addEventListener('click', () => {
            onJoinRoom(room.roomId);
        });

        return div;
    }

    showGameRoom(roomState) {
        this.showScreen('game-room');
        this.updateRoomInfo(roomState);
        this.updateGameState(roomState);
    }

    updateRoomInfo(roomState) {
        document.getElementById('room-title').textContent = roomState.roomName;
        document.getElementById('room-players').textContent = 
            `${roomState.currentPlayers} / ${roomState.maxPlayers} players`;
        document.getElementById('room-status').textContent = 
            this.formatRoomStatus(roomState.status);
        document.getElementById('room-invite-code').textContent = roomState.inviteCode;

        // Update player ready states and show/hide start button
        const allReady = roomState.players.every(p => p.isReady);
        const isHost = roomState.hostUserId === this.getCurrentUserId();
        const canStart = roomState.status === 'waiting' && roomState.currentPlayers >= 2 && allReady;

        const startBtn = document.getElementById('start-game');
        const readyBtn = document.getElementById('toggle-ready');

        if (isHost && canStart) {
            startBtn.classList.remove('hidden');
        } else {
            startBtn.classList.add('hidden');
        }

        if (roomState.status === 'waiting') {
            readyBtn.disabled = false;
        } else {
            readyBtn.disabled = true;
        }
    }

    updateGameState(roomState) {
        if (!roomState.game) {
            this.hideGameElements();
            return;
        }

        const game = roomState.game;
        
        // Update game info panel
        document.getElementById('hand-number').textContent = game.currentHand;
        document.getElementById('game-phase').textContent = this.formatGamePhase(game.gamePhase);
        document.getElementById('pot-amount').textContent = game.pot.mainPot;
        document.getElementById('current-bet').textContent = game.currentBetAmount;
        document.getElementById('small-blind-amount').textContent = `$${game.gameSettings.smallBlind}`;
        document.getElementById('big-blind-amount').textContent = `$${game.gameSettings.bigBlind}`;

        // Update dealer position
        const dealerPlayer = game.players[game.dealerPosition];
        document.getElementById('dealer-name').textContent = 
            dealerPlayer ? dealerPlayer.displayName : '-';

        // Update community cards
        this.updateCommunityCards(game.communityCards);
        
        // Update player seats
        this.updatePlayerSeats(game.players, game.activePlayerPosition, game.dealerPosition);
        
        // Update current player's hand and controls
        this.updatePlayerHand(game, this.getCurrentUserId());
    }

    updateCommunityCards(communityCards) {
        for (let i = 0; i < 5; i++) {
            const cardElement = document.getElementById(`community-${i + 1}`);
            
            if (i < communityCards.length) {
                const card = communityCards[i];
                this.displayCard(cardElement, card);
                cardElement.classList.remove('hidden');
            } else {
                cardElement.classList.add('hidden');
            }
        }
    }

    updatePlayerSeats(players, activePosition, dealerPosition) {
        // Clear all seats first
        document.querySelectorAll('.player-seat').forEach(seat => {
            seat.classList.remove('occupied', 'active', 'dealer');
            seat.innerHTML = '';
        });

        players.forEach((player, index) => {
            const seatElement = document.getElementById(`seat-${player.position}`);
            if (!seatElement) return;

            seatElement.classList.add('occupied');
            
            if (index === activePosition) {
                seatElement.classList.add('active');
            }
            
            if (index === dealerPosition) {
                seatElement.classList.add('dealer');
            }

            seatElement.innerHTML = `
                <div class="player-name">${this.escapeHtml(player.displayName)}</div>
                <div class="player-chips">$${player.chipStack}</div>
                <div class="player-status">${this.formatPlayerStatus(player.status)}</div>
                ${player.currentBet > 0 ? `<div class="player-current-bet">Bet: $${player.currentBet}</div>` : ''}
            `;
        });
    }

    updatePlayerHand(game, userId) {
        const currentPlayer = game.players.find(p => p.userId === userId);
        
        if (!currentPlayer) {
            this.hidePlayerElements();
            return;
        }

        // Update player stats
        document.getElementById('player-chips').textContent = currentPlayer.chipStack;
        document.getElementById('player-bet').textContent = currentPlayer.currentBet;

        // Update hole cards
        const holeCard1 = document.getElementById('hole-card-1');
        const holeCard2 = document.getElementById('hole-card-2');
        
        if (currentPlayer.holeCards && currentPlayer.holeCards.length >= 2) {
            this.displayCard(holeCard1, currentPlayer.holeCards[0]);
            this.displayCard(holeCard2, currentPlayer.holeCards[1]);
        } else {
            this.displayCard(holeCard1, null);
            this.displayCard(holeCard2, null);
        }
    }

    updatePlayerControls(gameState, userId) {
        const controls = document.getElementById('action-controls');
        const currentPlayer = gameState.game?.players?.find(p => p.userId === userId);
        const isCurrentPlayerTurn = gameState.game?.players?.[gameState.game.activePlayerPosition]?.userId === userId;
        
        if (!currentPlayer || !isCurrentPlayerTurn || currentPlayer.status !== 'active') {
            controls.classList.add('hidden');
            return;
        }

        controls.classList.remove('hidden');

        // Update betting controls
        const maxBet = currentPlayer.chipStack;
        const currentBet = gameState.game.currentBetAmount;
        const callAmount = Math.max(0, currentBet - currentPlayer.currentBet);
        
        const slider = document.getElementById('bet-slider');
        const amountInput = document.getElementById('bet-amount');
        
        slider.max = maxBet;
        amountInput.max = maxBet;
        amountInput.min = callAmount;
        
        // Update action buttons
        const checkCallBtn = document.getElementById('check-call-btn');
        const betRaiseBtn = document.getElementById('bet-raise-btn');
        
        if (callAmount === 0) {
            checkCallBtn.textContent = 'Check';
        } else {
            checkCallBtn.textContent = `Call $${callAmount}`;
        }
        
        if (currentBet === 0) {
            betRaiseBtn.textContent = 'Bet';
        } else {
            betRaiseBtn.textContent = 'Raise';
        }
    }

    displayCard(element, card) {
        if (!card) {
            element.className = 'card face-down';
            element.textContent = '';
            return;
        }

        element.className = `card ${card.suit}`;
        element.textContent = `${card.rank}${this.getSuitSymbol(card.suit)}`;
    }

    getSuitSymbol(suit) {
        const symbols = {
            hearts: '♥',
            diamonds: '♦',
            clubs: '♣',
            spades: '♠'
        };
        return symbols[suit] || '';
    }

    addChatMessage(message) {
        const chatMessages = document.getElementById('chat-messages');
        const messageElement = document.createElement('div');
        messageElement.className = `chat-message ${message.messageType}`;
        
        messageElement.innerHTML = `
            <div class="message-author">${this.escapeHtml(message.displayName || message.messageType)}</div>
            <div class="message-content">${this.escapeHtml(message.message)}</div>
            <div class="message-time">${this.formatTime(message.timestamp)}</div>
        `;
        
        chatMessages.appendChild(messageElement);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        
        // Keep only last 50 messages
        while (chatMessages.children.length > 50) {
            chatMessages.removeChild(chatMessages.firstChild);
        }
    }

    addSystemMessage(message) {
        this.addChatMessage({
            messageType: 'system',
            displayName: 'System',
            message: message,
            timestamp: new Date().toISOString()
        });
    }

    showGameStarted(roomState) {
        this.addSystemMessage('Game has started!');
        this.updateGameState(roomState);
    }

    hideGameElements() {
        document.getElementById('action-controls').classList.add('hidden');
        document.querySelectorAll('.community-cards .card').forEach(card => {
            card.classList.add('hidden');
        });
    }

    hidePlayerElements() {
        const holeCard1 = document.getElementById('hole-card-1');
        const holeCard2 = document.getElementById('hole-card-2');
        this.displayCard(holeCard1, null);
        this.displayCard(holeCard2, null);
    }

    // Utility methods
    formatTime(timestamp) {
        return new Date(timestamp).toLocaleTimeString();
    }

    formatRoomStatus(status) {
        const statusMap = {
            waiting: 'Waiting for players',
            'in-progress': 'Game in progress',
            completed: 'Completed'
        };
        return statusMap[status] || status;
    }

    formatGamePhase(phase) {
        const phaseMap = {
            'pre-flop': 'Pre-flop',
            flop: 'Flop',
            turn: 'Turn',
            river: 'River',
            showdown: 'Showdown',
            'hand-complete': 'Hand Complete'
        };
        return phaseMap[phase] || phase;
    }

    formatPlayerStatus(status) {
        const statusMap = {
            active: 'Active',
            folded: 'Folded',
            'all-in': 'All-in',
            'sitting-out': 'Sitting Out'
        };
        return statusMap[status] || status;
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    getCurrentUserId() {
        // This should be set by the main app
        return window.pokerApp?.currentUser?.userId;
    }
}