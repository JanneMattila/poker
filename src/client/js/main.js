// Main client-side JavaScript for Texas Hold'em Poker
import { PokerUI } from './ui/pokerUI.js';
import { GameClient } from './game/gameClient.js';
import { AuthManager } from './auth/authManager.js';
import { LocalGame } from './game/localGame.js';

const SUIT_SYMBOLS = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' };

// Coin/bill emojis for pot decoration
const POT_COINS = ['🪙', '🪙', '🪙', '🪙', '🪙'];
const POT_BILLS = ['💵', '💵', '💸'];

class PokerApp {
    constructor() {
        this.ui = new PokerUI();
        this.gameClient = new GameClient();
        this.authManager = new AuthManager();
        
        this.currentUser = null;
        this.currentRoom = null;
        
        this.init();
    }

    async init() {
        try {
            // Show loading screen
            this.ui.showScreen('loading', false);
            
            // Initialize network status detection
            this.setupNetworkDetection();
            
            // Initialize components
            await this.setupEventListeners();
            await this.initializeAuth();
            
            // Route based on URL hash, or show welcome
            this.handleRoute();

            // Listen for browser back/forward
            window.addEventListener('popstate', () => this.handleRoute());
            
        } catch (error) {
            console.error('Failed to initialize app:', error);
            this.ui.showError('Failed to initialize application');
        }
    }

    setupNetworkDetection() {
        // Initial check
        this.updateNetworkStatus();

        // Listen for online/offline events
        window.addEventListener('online', () => this.updateNetworkStatus());
        window.addEventListener('offline', () => this.updateNetworkStatus());
    }

    updateNetworkStatus() {
        const isOnline = navigator.onLine;
        const body = document.body;
        const statusBanner = document.getElementById('network-status');

        if (isOnline) {
            body.classList.remove('offline');
            if (statusBanner) statusBanner.classList.add('hidden');
        } else {
            body.classList.add('offline');
            if (statusBanner) statusBanner.classList.remove('hidden');
        }

        // Update online-only button states
        const onlineButtons = document.querySelectorAll('.online-only');
        onlineButtons.forEach(btn => {
            if (isOnline && this.currentUser) {
                btn.disabled = false;
            } else if (!isOnline) {
                btn.disabled = true;
            }
        });
    }

    handleRoute() {
        const path = window.location.pathname;

        // URL like /rooms/join/INVITE_CODE — auto-join by invite code
        const joinMatch = path.match(/^\/rooms\/join\/([A-Za-z0-9]+)$/);
        if (joinMatch) {
            document.getElementById('invite-code').value = joinMatch[1].toUpperCase();
            this.ui.showScreen('join-room', false);
            return;
        }

        // URL like /rooms/ROOM_ID — active game room
        const roomMatch = path.match(/^\/rooms\/([A-Za-z0-9]+)$/);
        if (roomMatch && !['create', 'join', 'browse'].includes(roomMatch[1])) {
            // Could reconnect to room — for now show welcome
            this.ui.showScreen('welcome', false);
            return;
        }

        // Map path to screen
        const screenId = PokerUI.PATH_TO_SCREEN[path];

        if (screenId === 'local-game') {
            this.startLocalGame();
            return;
        }

        if (screenId === 'local-play') {
            if (this.localGame) {
                this.ui.showScreen('local-play', false);
            } else {
                // No active game — redirect to setup
                this.startLocalGame();
            }
            return;
        }

        if (screenId) {
            this.ui.showScreen(screenId, false);
            if (screenId === 'browse-rooms') {
                this.loadPublicRooms();
            }
        } else {
            this.ui.showScreen('welcome', false);
        }
    }

    setupEventListeners() {
        // Authentication events
        document.getElementById('microsoft-login-btn').addEventListener('click', () => {
            this.handleMicrosoftLogin();
        });

        document.getElementById('guest-login-btn').addEventListener('click', () => {
            this.handleGuestLogin();
        });

        // Navigation events
        document.getElementById('create-room-btn').addEventListener('click', () => {
            this.navigate('create-room');
        });

        document.getElementById('join-room-btn').addEventListener('click', () => {
            this.navigate('join-room');
        });

        document.getElementById('browse-rooms-btn').addEventListener('click', () => {
            this.navigate('browse-rooms');
            this.loadPublicRooms();
        });

        document.getElementById('local-game-btn').addEventListener('click', () => {
            this.navigate('local-game');
        });

        // Back buttons
        document.getElementById('back-to-welcome').addEventListener('click', () => {
            this.navigate('welcome');
        });

        document.getElementById('back-to-welcome-join').addEventListener('click', () => {
            this.navigate('welcome');
        });

        document.getElementById('back-to-welcome-browse').addEventListener('click', () => {
            this.navigate('welcome');
        });

        // Form submissions
        document.getElementById('create-room-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleCreateRoom();
        });

        document.getElementById('join-room-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleJoinRoom();
        });

        // Room controls
        document.getElementById('refresh-rooms').addEventListener('click', () => {
            this.loadPublicRooms();
        });

        // Game room events
        document.getElementById('toggle-ready').addEventListener('click', () => {
            this.toggleReady();
        });

        document.getElementById('start-game').addEventListener('click', () => {
            this.startGame();
        });

        document.getElementById('leave-room').addEventListener('click', () => {
            this.leaveRoom();
        });

        // Game actions
        document.getElementById('fold-btn').addEventListener('click', () => {
            this.playerAction('fold');
        });

        document.getElementById('check-call-btn').addEventListener('click', () => {
            const btn = document.getElementById('check-call-btn');
            const actionType = btn.textContent.toLowerCase();
            this.playerAction(actionType);
        });

        document.getElementById('bet-raise-btn').addEventListener('click', () => {
            const amount = parseInt(document.getElementById('bet-amount').value) || 0;
            const btn = document.getElementById('bet-raise-btn');
            const actionType = btn.textContent.toLowerCase().includes('bet') ? 'bet' : 'raise';
            this.playerAction(actionType, amount);
        });

        // Betting controls
        document.getElementById('bet-slider').addEventListener('input', (e) => {
            document.getElementById('bet-amount').value = e.target.value;
        });

        document.getElementById('bet-amount').addEventListener('input', (e) => {
            document.getElementById('bet-slider').value = e.target.value;
        });

        // Quick bet buttons
        document.querySelectorAll('.quick-bet').forEach(btn => {
            btn.addEventListener('click', () => {
                const type = btn.dataset.type;
                this.setQuickBet(type);
            });
        });

        // Chat
        // (Chat removed)

        // Invite code copy to clipboard
        document.getElementById('invite-players').addEventListener('click', () => {
            this.copyInviteCode();
        });

        // Game Info collapse toggle
        document.getElementById('game-info-toggle').addEventListener('click', () => {
            const gameInfo = document.querySelector('.game-info');
            gameInfo.classList.toggle('collapsed');
        });

        // Password toggle
        document.getElementById('password-protected').addEventListener('change', (e) => {
            const passwordInput = document.getElementById('room-password');
            if (e.target.checked) {
                passwordInput.classList.remove('hidden');
                passwordInput.required = true;
            } else {
                passwordInput.classList.add('hidden');
                passwordInput.required = false;
                passwordInput.value = '';
            }
        });

        // Game client events
        this.gameClient.on('connected', () => {
            console.log('Connected to server');
            this.updateConnectionStatus(true);
        });

        this.gameClient.on('disconnected', () => {
            console.log('Disconnected from server');
            this.updateConnectionStatus(false);
        });

        this.gameClient.on('roomUpdate', (roomState) => {
            this.handleRoomUpdate(roomState);
        });

        this.gameClient.on('gameUpdate', (roomState) => {
            this.handleGameUpdate(roomState);
        });

        this.gameClient.on('gameStarted', (roomState) => {
            this.handleGameStarted(roomState);
        });

        this.gameClient.on('chatMessage', (message) => {
            // Chat removed - ignore chat messages
        });

        this.gameClient.on('userJoined', (user) => {
            this.ui.addSystemMessage(`${user.displayName} joined the game`);
        });

        this.gameClient.on('userLeft', (user) => {
            this.ui.addSystemMessage(`${user.displayName} left the game`);
        });

        this.gameClient.on('error', (error) => {
            this.ui.showError(error.message || 'An error occurred');
        });
    }

    async initializeAuth() {
        // Check if user has existing auth token
        const token = this.authManager.getStoredToken();
        if (token && this.authManager.isTokenValid(token)) {
            this.currentUser = this.authManager.getUserFromToken(token);
            this.updateUIForUser();
        }
    }

    async handleMicrosoftLogin() {
        try {
            const user = await this.authManager.loginWithMicrosoft();
            this.currentUser = user;
            this.updateUIForUser();
            await this.gameClient.connect(user);
        } catch (error) {
            console.error('Microsoft login failed:', error);
            this.ui.showError('Microsoft login failed. Please try again.');
        }
    }

    async handleGuestLogin() {
        try {
            const name = document.getElementById('guest-name').value.trim();
            if (!name) {
                this.ui.showError('Please enter your name');
                return;
            }

            const user = this.authManager.createGuestUser(name);
            this.currentUser = user;
            this.updateUIForUser();
            await this.gameClient.connect(user);
        } catch (error) {
            console.error('Guest login failed:', error);
            this.ui.showError('Failed to join as guest. Please try again.');
        }
    }

    updateUIForUser() {
        if (this.currentUser) {
            // Update button states (respects network status)
            this.updateNetworkStatus();
        }
    }

    async handleCreateRoom() {
        try {
            const formData = this.getCreateRoomFormData();
            const room = await this.gameClient.createRoom(formData);
            
            this.currentRoom = room;
            this.ui.showGameRoom(room);
            this.ui.updateRoomInfo(room);

            // Update URL with invite code for sharing
            if (room.inviteCode) {
                this.navigateToRoom(room.inviteCode);
            }
        } catch (error) {
            console.error('Failed to create room:', error);
            this.ui.showError(error.message || 'Failed to create room');
        }
    }

    getCreateRoomFormData() {
        const passwordProtected = document.getElementById('password-protected').checked;
        
        return {
            roomName: document.getElementById('room-name').value.trim(),
            gameSettings: {
                maxPlayers: parseInt(document.getElementById('max-players').value),
                startingChips: parseInt(document.getElementById('starting-chips').value),
                smallBlind: parseInt(document.getElementById('small-blind').value),
                bigBlind: parseInt(document.getElementById('big-blind').value),
                visibility: document.getElementById('visibility').value,
                spectatingAllowed: document.getElementById('spectating-allowed').checked
            },
            password: passwordProtected ? document.getElementById('room-password').value : null
        };
    }

    async handleJoinRoom() {
        try {
            const inviteCode = document.getElementById('invite-code').value.trim().toUpperCase();
            const password = document.getElementById('join-password').value;
            
            const { roomId, room } = await this.gameClient.joinRoomByInvite(inviteCode, password);
            
            this.currentRoom = room;
            this.ui.showGameRoom(room);
            this.ui.updateRoomInfo(room);

            // Update URL with invite code for sharing
            this.navigateToRoom(inviteCode);
        } catch (error) {
            console.error('Failed to join room:', error);
            this.ui.showError(error.message || 'Failed to join room');
        }
    }

    async loadPublicRooms() {
        try {
            const rooms = await this.gameClient.getPublicRooms();
            this.ui.displayRoomsList(rooms, (roomId) => {
                this.joinPublicRoom(roomId);
            });
        } catch (error) {
            console.error('Failed to load rooms:', error);
            this.ui.showError('Failed to load rooms list');
        }
    }

    async joinPublicRoom(roomId) {
        try {
            const room = await this.gameClient.joinRoom(roomId);
            this.currentRoom = room;
            this.ui.showGameRoom(room);
            this.ui.updateRoomInfo(room);
        } catch (error) {
            console.error('Failed to join room:', error);
            this.ui.showError(error.message || 'Failed to join room');
        }
    }

    async toggleReady() {
        try {
            const readyBtn = document.getElementById('toggle-ready');
            const isReady = readyBtn.textContent === 'Ready';
            
            await this.gameClient.setReady(!isReady);
            readyBtn.textContent = isReady ? 'Not Ready' : 'Ready';
            readyBtn.classList.toggle('btn-success', !isReady);
            readyBtn.classList.toggle('btn-primary', isReady);
        } catch (error) {
            console.error('Failed to toggle ready:', error);
            this.ui.showError('Failed to update ready status');
        }
    }

    async startGame() {
        try {
            await this.gameClient.startGame();
        } catch (error) {
            console.error('Failed to start game:', error);
            this.ui.showError(error.message || 'Failed to start game');
        }
    }

    async leaveRoom() {
        try {
            await this.gameClient.leaveRoom();
            this.currentRoom = null;
            this.navigate('welcome');
        } catch (error) {
            console.error('Failed to leave room:', error);
            this.ui.showError('Failed to leave room');
        }
    }

    navigate(screenId) {
        if (screenId === 'local-game') {
            this.startLocalGame();
        } else {
            this.ui.showScreen(screenId);
        }
    }

    navigateToRoom(inviteCode) {
        const path = `/rooms/join/${inviteCode}`;
        window.history.replaceState(null, '', path);
    }

    async playerAction(actionType, amount = 0) {
        try {
            await this.gameClient.playerAction(actionType, amount);
        } catch (error) {
            console.error('Failed to perform action:', error);
            this.ui.showError(error.message || 'Failed to perform action');
        }
    }

    setQuickBet(type) {
        if (!this.currentRoom || !this.currentRoom.game) return;

        const pot = this.currentRoom.game.pot.mainPot;
        const currentBet = this.currentRoom.game.currentBetAmount;
        const playerChips = this.getCurrentPlayerChips();
        
        let amount = 0;
        
        switch (type) {
            case 'min':
                amount = currentBet;
                break;
            case 'quarter':
                amount = Math.floor(pot * 0.25);
                break;
            case 'half':
                amount = Math.floor(pot * 0.5);
                break;
            case 'pot':
                amount = pot;
                break;
            case 'all-in':
                amount = playerChips;
                break;
        }
        
        amount = Math.min(amount, playerChips);
        document.getElementById('bet-amount').value = amount;
        document.getElementById('bet-slider').value = amount;
    }

    getCurrentPlayerChips() {
        if (!this.currentRoom || !this.currentRoom.game) return 0;
        
        const player = this.currentRoom.game.players.find(p => 
            p.userId === this.currentUser.userId);
        
        return player ? player.chipStack : 0;
    }

    async sendMessage() {
        // Chat removed
    }

    async copyInviteCode() {
        const inviteCode = document.getElementById('room-invite-code').textContent;
        const shareUrl = `${window.location.origin}${window.location.pathname}#room/${inviteCode}`;
        try {
            await navigator.clipboard.writeText(shareUrl);
            const btn = document.getElementById('invite-players');
            const original = btn.innerHTML;
            btn.innerHTML = 'Link Copied! &#10003;';
            setTimeout(() => {
                btn.innerHTML = original;
            }, 2000);
        } catch (err) {
            // Fallback for older browsers
            const textarea = document.createElement('textarea');
            textarea.value = shareUrl;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
        }
    }

    handleRoomUpdate(roomState) {
        this.currentRoom = roomState;
        this.ui.updateRoomInfo(roomState);
        this.ui.updateGameState(roomState);
    }

    handleGameUpdate(roomState) {
        this.currentRoom = roomState;
        this.ui.updateGameState(roomState);
        this.ui.updatePlayerControls(roomState, this.currentUser.userId);
    }

    handleGameStarted(roomState) {
        this.currentRoom = roomState;
        this.ui.showGameStarted(roomState);
        this.ui.updateGameState(roomState);
    }

    startLocalGame() {
        this.ui.showScreen('local-game');
        this._setupLocalGameSetup();
    }

    // ── Local Game Setup ──

    _setupLocalGameSetup() {
        const countSelect = document.getElementById('local-player-count');
        const namesDiv = document.getElementById('local-player-names');

        const renderNameInputs = () => {
            const count = parseInt(countSelect.value);
            namesDiv.innerHTML = '';
            for (let i = 0; i < count; i++) {
                const div = document.createElement('div');
                div.className = 'form-group';
                div.innerHTML = `<label for="local-name-${i}">Player ${i + 1} Name</label>
                    <input type="text" id="local-name-${i}" placeholder="Player ${i + 1}" maxlength="20">`;
                namesDiv.appendChild(div);
            }
        };

        countSelect.removeEventListener('change', renderNameInputs);
        countSelect.addEventListener('change', renderNameInputs);
        renderNameInputs();

        // Back button
        const backBtn = document.getElementById('back-to-welcome-local');
        backBtn.onclick = () => this.navigate('welcome');

        // Form submit
        const form = document.getElementById('local-game-form');
        form.onsubmit = (e) => {
            e.preventDefault();
            const count = parseInt(countSelect.value);
            const names = [];
            for (let i = 0; i < count; i++) {
                const val = document.getElementById(`local-name-${i}`).value.trim();
                names.push(val || `Player ${i + 1}`);
            }
            const settings = {
                startingChips: parseInt(document.getElementById('local-starting-chips').value),
                smallBlind: parseInt(document.getElementById('local-small-blind').value),
                bigBlind: parseInt(document.getElementById('local-big-blind').value)
            };
            this._startLocalPlay(names, settings);
        };
    }

    // ── Local Game Play ──

    _startLocalPlay(playerNames, settings) {
        this.localGame = new LocalGame(playerNames, settings);
        this.localGame.startGame();
        this._localPeeking = {}; // track which cards are currently shown face-up
        this._localTrackedBets = {}; // track last known bet per player for incremental coin rendering
        this._localCoinSeed = 42; // running seed so new coins get unique positions

        // Map player indices to seat positions for even distribution around table
        const seatMaps = {
            2: [0, 4],
            3: [0, 3, 6],
            4: [0, 2, 4, 6],
            5: [0, 2, 3, 5, 6],
            6: [0, 1, 3, 4, 5, 7]
        };
        this._localSeatMap = seatMaps[playerNames.length] || seatMaps[6];

        // Create persistent seat elements (reused across renders for CSS transition)
        const seatsContainer = document.getElementById('local-player-seats');
        seatsContainer.innerHTML = '';
        this._localSeatElements = playerNames.map((_, i) => {
            const seat = document.createElement('div');
            seat.className = 'player-seat occupied local-seat-animated';
            seat.setAttribute('data-player-index', i);

            const nameDiv = document.createElement('div');
            nameDiv.className = 'player-name';
            const chipsDiv = document.createElement('div');
            chipsDiv.className = 'player-chips';
            const statusDiv = document.createElement('div');
            statusDiv.className = 'player-status';

            seat.appendChild(nameDiv);
            seat.appendChild(chipsDiv);
            seat.appendChild(statusDiv);
            seatsContainer.appendChild(seat);
            return seat;
        });

        this.ui.showScreen('local-play');
        this._setupLocalPlayEvents();
        this._renderLocalState();
    }

    _setupLocalPlayEvents() {
        document.getElementById('local-leave-btn').onclick = () => {
            this.localGame = null;
            this.navigate('welcome');
        };

        // Double-tap safety: first click arms, second click fires
        this._armedAction = null;

        const armOrFire = (btnEl, actionFn) => {
            if (this._armedAction === btnEl) {
                // Second tap — fire
                this._armedAction = null;
                document.querySelectorAll('#local-action-controls .action-btn').forEach(b => b.classList.remove('armed'));
                actionFn();
            } else {
                // First tap — arm this button, disarm others
                this._armedAction = btnEl;
                document.querySelectorAll('#local-action-controls .action-btn').forEach(b => b.classList.remove('armed'));
                btnEl.classList.add('armed');
            }
        };

        document.getElementById('local-fold-btn').onclick = () => {
            armOrFire(document.getElementById('local-fold-btn'), () => this._localAction('fold'));
        };
        document.getElementById('local-check-call-btn').onclick = () => {
            const btn = document.getElementById('local-check-call-btn');
            armOrFire(btn, () => this._localAction(btn.dataset.action || 'check'));
        };
        document.getElementById('local-bet-raise-btn').onclick = () => {
            const btn = document.getElementById('local-bet-raise-btn');
            armOrFire(btn, () => {
                const amount = parseInt(document.getElementById('local-bet-amount').value) || 0;
                this._localAction(btn.dataset.action || 'bet', amount);
            });
        };
        document.getElementById('local-next-hand-btn').onclick = () => {
            this._localPeeking = {};
            this.localGame.nextHand();
            this._renderLocalState();
        };

        // Hamburger menu toggle
        document.getElementById('local-hamburger-btn').onclick = () => {
            document.getElementById('local-hamburger-panel').classList.toggle('hidden');
        };
        // Close hamburger panel when clicking outside
        document.getElementById('local-play-screen').addEventListener('click', (e) => {
            const panel = document.getElementById('local-hamburger-panel');
            const btn = document.getElementById('local-hamburger-btn');
            if (!panel.contains(e.target) && !btn.contains(e.target)) {
                panel.classList.add('hidden');
            }
        });
    }

    _localAction(actionType, amount = 0) {
        try {
            const state = this.localGame.getState();
            const actorIndex = state.activePlayerIndex;
            const seatEl = this._localSeatElements[actorIndex];

            // Capture seat position BEFORE game state changes (for accurate animation origin)
            const seatRect = seatEl ? seatEl.getBoundingClientRect() : null;

            // Execute the action in the game engine
            this.localGame.playerAction(actorIndex, actionType, amount);
            this._localPeeking = {}; // clear peeks on turn change

            const newState = this.localGame.getState();
            const isShowdown = newState.gamePhase === 'showdown';

            // ── Fold animation: cards fly to table center ──
            if (actionType === 'fold' && seatRect) {
                this._animateFoldCards(seatRect);
            }

            // ── Money-to-pot animation (from pre-rotation position) ──
            if (['call', 'bet', 'raise', 'all-in'].includes(actionType) && seatRect) {
                const potEl = document.getElementById('local-pot-money');
                if (potEl) {
                    const potRect = potEl.getBoundingClientRect();
                    const fly = document.createElement('span');
                    fly.className = 'money-fly-to-pot';
                    fly.textContent = '\uD83E\uDE99';
                    fly.style.left = (seatRect.left + seatRect.width / 2) + 'px';
                    fly.style.top = (seatRect.top + seatRect.height / 2) + 'px';
                    fly.style.transition = 'left 0.5s ease-in, top 0.5s ease-in';
                    document.body.appendChild(fly);
                    requestAnimationFrame(() => {
                        fly.style.left = (potRect.left + potRect.width / 2) + 'px';
                        fly.style.top = (potRect.top + potRect.height / 2) + 'px';
                    });
                    setTimeout(() => fly.remove(), 650);
                }
            }

            // Delay the render (seat rotation) so money animation plays from the old position first
            const renderDelay = (actionType === 'fold' || ['call', 'bet', 'raise', 'all-in'].includes(actionType)) ? 400 : 0;

            setTimeout(() => {
                this._renderLocalState();

                // ── Win animation (after seats have settled) ──
                if (isShowdown && newState.winners.length > 0) {
                    setTimeout(() => {
                        newState.winners.forEach(w => {
                            const winnerSeatEl = this._localSeatElements[w.playerIndex];
                            this._animateWinFromPot('local-pot-money', winnerSeatEl);
                        });
                    }, 700);
                }
            }, renderDelay);
        } catch (err) {
            this.ui.showError(err.message);
        }
    }

    /** Animate cards flying from a seat to the table center (fold) */
    _animateFoldCards(seatRect) {
        const table = document.querySelector('#local-play-screen .poker-table');
        if (!table) return;
        const tableRect = table.getBoundingClientRect();
        const destX = tableRect.left + tableRect.width / 2;
        const destY = tableRect.top + tableRect.height / 2;

        for (let i = 0; i < 2; i++) {
            const card = document.createElement('div');
            card.className = 'fold-card-fly';
            card.textContent = '\uD83C\uDCA0'; // card back emoji
            card.style.left = (seatRect.left + seatRect.width / 2 + (i - 0.5) * 16) + 'px';
            card.style.top = (seatRect.top + seatRect.height / 2) + 'px';
            card.style.transition = `left 0.45s ease-in, top 0.45s ease-in, opacity 0.45s ease-in, transform 0.45s ease-in`;
            card.style.transitionDelay = (i * 0.08) + 's';
            document.body.appendChild(card);

            requestAnimationFrame(() => {
                card.style.left = destX + 'px';
                card.style.top = destY + 'px';
                card.style.opacity = '0';
                card.style.transform = `scale(0.4) rotate(${(i - 0.5) * 40}deg)`;
            });

            setTimeout(() => card.remove(), 600);
        }
    }

    _renderLocalState() {
        const state = this.localGame.getState();
        const isShowdown = state.gamePhase === 'showdown';
        const isHandComplete = state.gamePhase === 'hand-complete';
        const activePlayer = state.players[state.activePlayerIndex];

        // Clear armed action on every render (turn change, new hand, etc.)
        this._armedAction = null;
        document.querySelectorAll('#local-action-controls .action-btn').forEach(b => b.classList.remove('armed'));

        // Players stay in fixed seat positions; active highlight moves around the table

        // Seat position coordinates (center-point %) for each of the 9 slots
        const SEAT_COORDS = [
            { top: '-1%',   left: '50%' },   // 0: top center
            { top: '22%',   left: '101%' },  // 1: upper right
            { top: '78%',   left: '101%' },  // 2: lower right
            { top: '101%',  left: '70%' },   // 3: bottom right
            { top: '101%',  left: '30%' },   // 4: bottom left
            { top: '78%',   left: '-1%' },   // 5: lower left
            { top: '22%',   left: '-1%' },   // 6: upper left
            { top: '-1%',   left: '28%' },   // 7: top left
            { top: '-1%',   left: '72%' },   // 8: top right
        ];

        // ── Update persistent seat elements ──
        state.players.forEach((p, i) => {
            const seat = this._localSeatElements[i];
            const seatPos = this._localSeatMap[i];
            const coords = SEAT_COORDS[seatPos];

            // Position via inline styles (enables CSS transition)
            seat.style.top = coords.top;
            seat.style.left = coords.left;
            seat.setAttribute('data-position', seatPos);

            // Classes
            seat.className = 'player-seat occupied local-seat-animated';
            if (i === state.activePlayerIndex && !isShowdown && !isHandComplete) seat.classList.add('active');
            if (i === state.dealerIndex) seat.classList.add('dealer');
            if (p.status === 'folded') seat.classList.add('folded');

            // Content updates
            seat.querySelector('.player-name').textContent = p.name;
            seat.querySelector('.player-chips').textContent = `$${p.chips}`;
            const statusDiv = seat.querySelector('.player-status');
            if (p.currentBet > 0) {
                statusDiv.textContent = `Bet: $${p.currentBet}`;
            } else if (p.status !== 'active') {
                statusDiv.textContent = p.status;
            } else {
                statusDiv.textContent = '';
            }
        });

        // ── Community cards (face-up on the table) ──
        const ccContainer = document.getElementById('local-community-cards');
        ccContainer.innerHTML = '';
        for (let i = 0; i < 5; i++) {
            if (i < state.communityCardCount) {
                const card = this.localGame.communityCards[i];
                const el = document.createElement('div');
                el.className = `community-card-faceup ${card.suit}`;
                el.textContent = `${card.rank}${SUIT_SYMBOLS[card.suit] || ''}`;
                ccContainer.appendChild(el);
            } else {
                const ph = document.createElement('div');
                ph.className = 'card-placeholder';
                ccContainer.appendChild(ph);
            }
        }

        // ── Pot info ──
        document.getElementById('local-pot').textContent = state.pot;
        document.getElementById('local-current-bet').textContent = state.currentBetAmount;
        this._renderPlayerBets('local-player-bets', state.players);

        // ── Side pots display ──
        let sidePotsEl = document.getElementById('local-side-pots');
        if (!sidePotsEl) {
            sidePotsEl = document.createElement('div');
            sidePotsEl.id = 'local-side-pots';
            sidePotsEl.className = 'side-pots-info';
            document.querySelector('#local-play-screen .pot-info').appendChild(sidePotsEl);
        }
        if (state.sidePots && state.sidePots.length > 1) {
            sidePotsEl.innerHTML = state.sidePots.map((sp, idx) =>
                `<span class="side-pot-badge">${idx === 0 ? 'Main' : 'Side ' + idx}: $${sp.amount}</span>`
            ).join('');
            sidePotsEl.classList.remove('hidden');
        } else {
            sidePotsEl.innerHTML = '';
            sidePotsEl.classList.add('hidden');
        }

        // ── Hole cards (both flip together, single counter) ──
        const playerArea = document.getElementById('local-player-area');
        const holeContainer = document.getElementById('local-hole-cards');
        holeContainer.innerHTML = '';

        if (isShowdown || isHandComplete) {
            playerArea.classList.add('hidden');
        } else {
            playerArea.classList.remove('hidden');
            document.getElementById('local-active-player-name').textContent = activePlayer.name;
            document.getElementById('local-player-chips').textContent = activePlayer.chips;
            document.getElementById('local-player-bet').textContent = activePlayer.currentBet;

            if (activePlayer.hasCards) {
                const cards = this.localGame.players[state.activePlayerIndex].holeCards;
                const viewCount = state.players[state.activePlayerIndex].viewCount;
                const peekKey = `h-${state.activePlayerIndex}`;
                const isPeeking = !!this._localPeeking[peekKey];

                const pair = this._createHoleCardPair(cards, viewCount, isPeeking, () => {
                    if (!this._localPeeking[peekKey]) {
                        this.localGame.peekHoleCards(state.activePlayerIndex);
                    }
                    this._localPeeking[peekKey] = !this._localPeeking[peekKey];
                    this._renderLocalState();
                });
                holeContainer.appendChild(pair);
            }
        }

        // ── Hamburger menu game info ──
        document.getElementById('local-menu-hand').textContent = state.currentHand;
        document.getElementById('local-menu-phase').textContent = state.gamePhase.replace(/-/g, ' ');
        document.getElementById('local-menu-dealer').textContent = state.players[state.dealerIndex].name;
        document.getElementById('local-menu-sb').textContent = `$${state.settings.smallBlind}`;
        document.getElementById('local-menu-bb').textContent = `$${state.settings.bigBlind}`;

        // ── Action controls vs showdown ──
        const actionControls = document.getElementById('local-action-controls');
        const showdownDiv = document.getElementById('local-showdown');

        if (isShowdown || isHandComplete) {
            actionControls.classList.add('hidden');
            showdownDiv.classList.remove('hidden');

            const winnerText = document.getElementById('local-winner-text');
            if (isHandComplete) {
                const finalWinner = state.players.reduce((a, b) => a.chips > b.chips ? a : b);
                winnerText.textContent = `Game Over! ${finalWinner.name} wins!`;
                document.getElementById('local-next-hand-btn').textContent = 'New Game';
                document.getElementById('local-next-hand-btn').onclick = () => {
                    this.localGame = null;
                    this.navigate('local-game');
                };
            } else {
                const winnerNames = state.winners.map(w => `${w.name} ($${w.amount}${w.handType !== 'unopposed' ? ' - ' + w.handType.replace(/-/g, ' ') : ''})`).join(', ');
                winnerText.textContent = `Winner: ${winnerNames}`;
            }

            // Show all players' cards (skip if win was by fold — "unopposed")
            const showdownCards = document.getElementById('local-showdown-cards');
            showdownCards.innerHTML = '';
            const wonByFold = state.winners.length > 0 && state.winners.every(w => w.handType === 'unopposed');
            if (!wonByFold) {
                state.players.forEach((p, i) => {
                    const player = this.localGame.players[i];
                    if (player.holeCards.length === 0) return;
                    const div = document.createElement('div');
                    div.className = 'showdown-player';
                    let cardsHTML = '';
                    player.holeCards.forEach(card => {
                        cardsHTML += `<div class="revealed-card ${card.suit}">${card.rank}${SUIT_SYMBOLS[card.suit] || ''}</div>`;
                    });
                    div.innerHTML = `<div class="showdown-name">${this._escapeHtml(p.name)} ${p.status === 'folded' ? '(folded)' : ''}</div><div class="showdown-hand">${cardsHTML}</div>`;
                    showdownCards.appendChild(div);
                });
            }
        } else {
            actionControls.classList.remove('hidden');
            showdownDiv.classList.add('hidden');

            // Update check/call and bet/raise labels
            const callAmount = Math.max(0, state.currentBetAmount - activePlayer.currentBet);
            const checkCallBtn = document.getElementById('local-check-call-btn');
            const betRaiseBtn = document.getElementById('local-bet-raise-btn');
            if (callAmount === 0) {
                checkCallBtn.textContent = 'Check';
                checkCallBtn.dataset.action = 'check';
            } else {
                checkCallBtn.textContent = `Call $${callAmount}`;
                checkCallBtn.dataset.action = 'call';
            }
            if (state.currentBetAmount === 0) {
                betRaiseBtn.textContent = 'Bet';
                betRaiseBtn.dataset.action = 'bet';
            } else {
                betRaiseBtn.textContent = 'Raise';
                betRaiseBtn.dataset.action = 'raise';
            }

            // ── Raise preset buttons ──
            this._renderRaisePresets(state, activePlayer);
        }
    }

    /** Create a pair of hole cards that flip together with a single view count badge */
    _createHoleCardPair(cards, viewCount, isPeeking, onToggle) {
        const container = document.createElement('div');
        container.className = 'hole-card-pair';

        for (const card of cards) {
            const wrapper = document.createElement('div');
            wrapper.className = 'peekable-card' + (isPeeking ? ' peeking' : '');
            wrapper.addEventListener('click', onToggle);

            const inner = document.createElement('div');
            inner.className = 'peekable-card-inner';

            const front = document.createElement('div');
            front.className = 'peekable-card-front';
            front.textContent = '🂠';

            const back = document.createElement('div');
            back.className = `peekable-card-back ${card.suit}`;
            back.textContent = `${card.rank}${SUIT_SYMBOLS[card.suit] || ''}`;

            inner.appendChild(front);
            inner.appendChild(back);
            wrapper.appendChild(inner);
            container.appendChild(wrapper);
        }

        // Single view count badge for the pair
        if (viewCount > 0) {
            const badge = document.createElement('div');
            badge.className = 'peek-count';
            badge.textContent = viewCount;
            container.appendChild(badge);
        }

        return container;
    }

    _createPeekableCard(card, viewCount, isPeeking, onClick) {
        const wrapper = document.createElement('div');
        wrapper.className = 'peekable-card' + (isPeeking ? ' peeking' : '');
        wrapper.addEventListener('click', onClick);

        // View count badge
        if (viewCount > 0) {
            const badge = document.createElement('div');
            badge.className = 'peek-count';
            badge.textContent = viewCount;
            wrapper.appendChild(badge);
        }

        const inner = document.createElement('div');
        inner.className = 'peekable-card-inner';

        const front = document.createElement('div');
        front.className = 'peekable-card-front';
        front.textContent = '🂠';

        const back = document.createElement('div');
        back.className = `peekable-card-back ${card.suit}`;
        back.textContent = `${card.rank}${SUIT_SYMBOLS[card.suit] || ''}`;

        inner.appendChild(front);
        inner.appendChild(back);
        wrapper.appendChild(inner);
        return wrapper;
    }

    _escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ── Raise Presets ──

    /** Render context-aware raise preset buttons */
    _renderRaisePresets(state, activePlayer) {
        const container = document.getElementById('local-raise-presets');
        if (!container) return;
        container.innerHTML = '';

        const bb = state.settings.bigBlind;
        const pot = state.pot;
        const chips = activePlayer.chips;
        const callAmount = Math.max(0, state.currentBetAmount - activePlayer.currentBet);
        const minRaise = state.minimumRaise;

        // Build list of presets with label, display value, and actual raise amount
        const presets = [];

        if (state.currentBetAmount === 0) {
            // No bet yet — offer bet sizes
            presets.push({ label: 'Min', value: minRaise, desc: `$${minRaise}` });
            if (2 * bb > minRaise && 2 * bb < chips) {
                presets.push({ label: '2x BB', value: 2 * bb, desc: `$${2 * bb}` });
            }
            if (3 * bb > minRaise && 3 * bb < chips) {
                presets.push({ label: '3x BB', value: 3 * bb, desc: `$${3 * bb}` });
            }
            const half = Math.floor(pot * 0.5);
            if (half > minRaise && half < chips) {
                presets.push({ label: '½ Pot', value: half, desc: `$${half}` });
            }
            if (pot > minRaise && pot < chips) {
                presets.push({ label: 'Pot', value: pot, desc: `$${pot}` });
            }
        } else {
            // There's an existing bet — offer raise amounts (on TOP of the call)
            presets.push({ label: 'Min', value: minRaise, desc: `$${callAmount + minRaise}` });
            const raise2x = 2 * state.currentBetAmount;
            if (raise2x - activePlayer.currentBet > callAmount + minRaise && raise2x - activePlayer.currentBet < chips) {
                presets.push({ label: '2x', value: raise2x - activePlayer.currentBet - callAmount, desc: `$${raise2x - activePlayer.currentBet}` });
            }
            const raise3x = 3 * state.currentBetAmount;
            if (raise3x - activePlayer.currentBet > callAmount + minRaise && raise3x - activePlayer.currentBet < chips) {
                presets.push({ label: '3x', value: raise3x - activePlayer.currentBet - callAmount, desc: `$${raise3x - activePlayer.currentBet}` });
            }
            const halfPot = Math.floor(pot * 0.5);
            if (halfPot > minRaise && callAmount + halfPot < chips) {
                presets.push({ label: '½ Pot', value: halfPot, desc: `$${callAmount + halfPot}` });
            }
            if (pot > minRaise && callAmount + pot < chips) {
                presets.push({ label: 'Pot', value: pot, desc: `$${callAmount + pot}` });
            }
        }

        // Always add All-In
        presets.push({ label: 'All In', value: chips, desc: `$${chips}` });

        // De-duplicate by value
        const seen = new Set();
        for (const p of presets) {
            if (seen.has(p.value)) continue;
            seen.add(p.value);

            const btn = document.createElement('button');
            btn.className = 'raise-preset-btn';
            btn.innerHTML = `${p.label}<span class="preset-label">${p.desc}</span>`;
            btn.addEventListener('click', () => {
                // Set the bet amount and highlight selected preset
                document.getElementById('local-bet-amount').value = p.value;
                container.querySelectorAll('.raise-preset-btn').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');

                // Pre-arm the raise button so only one tap is needed
                const raiseBtn = document.getElementById('local-bet-raise-btn');
                this._armedAction = raiseBtn;
                document.querySelectorAll('#local-action-controls .action-btn').forEach(b => b.classList.remove('armed'));
                raiseBtn.classList.add('armed');
            });
            container.appendChild(btn);
        }
    }

    // ── Pot Money Visuals ──

    /** Render scattered coins/bills on the table for current bets — only adds new, never moves existing */
    _renderPlayerBets(containerId, players) {
        const container = document.getElementById(containerId);
        if (!container) return;

        // If all bets are zero (new round), clear everything
        const anyBets = players.some(p => p.currentBet > 0);
        if (!anyBets) {
            container.innerHTML = '';
            this._localTrackedBets = {};
            return;
        }

        const seededRand = () => {
            this._localCoinSeed = (this._localCoinSeed * 16807 + 0) % 2147483647;
            return this._localCoinSeed / 2147483647;
        };

        // Pick emoji: bills for amounts >= 50, coins for smaller
        const pickEmoji = (amount) => {
            if (amount >= 500) return '💸';
            if (amount >= 50) return '💵';
            return '🪙';
        };

        players.forEach(p => {
            const prevBet = this._localTrackedBets[p.id] || 0;
            const curBet = p.currentBet;

            if (curBet > prevBet) {
                const added = curBet - prevBet;
                const newCoins = added > 200 ? 4 : added > 50 ? 3 : 2;

                for (let i = 0; i < newCoins; i++) {
                    // Place in lower semicircle only (angle π/6 to 5π/6 → below center)
                    const angle = (Math.PI / 6) + seededRand() * (4 * Math.PI / 6);
                    const dist = (seededRand() + seededRand()) / 2; // bias toward center
                    const radius = 25 + dist * 23; // 25-48% from center (well clear of pot area)

                    const x = 50 + Math.cos(angle) * radius;
                    const y = 50 + Math.sin(angle) * radius;

                    const coin = document.createElement('span');
                    coin.className = 'bet-coin';
                    coin.textContent = pickEmoji(added);
                    coin.style.left = x + '%';
                    coin.style.top = y + '%';
                    coin.style.animationDelay = (i * 0.08) + 's';
                    container.appendChild(coin);
                }
            }

            this._localTrackedBets[p.id] = curBet;
        });
    }

    /** Render coin/bill emojis in the pot-money container based on pot size */
    _renderPotMoney(containerId, potAmount) {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = '';
        if (potAmount <= 0) return;

        // Scale: more money items as pot grows
        const coinCount = Math.min(5, Math.max(1, Math.ceil(potAmount / 100)));
        const billCount = Math.min(3, Math.max(0, Math.ceil(potAmount / 300) - 1));

        const positions = [
            { left: 5, top: 8 }, { left: 30, top: 2 }, { left: 55, top: 12 },
            { left: 80, top: 4 }, { left: 95, top: 10 }
        ];
        const billPositions = [
            { left: 15, top: 18 }, { left: 50, top: 22 }, { left: 75, top: 16 }
        ];

        for (let i = 0; i < coinCount; i++) {
            const coin = document.createElement('span');
            coin.className = 'pot-coin';
            coin.textContent = POT_COINS[i % POT_COINS.length];
            coin.style.left = positions[i].left + 'px';
            coin.style.top = positions[i].top + 'px';
            coin.style.animationDelay = (i * 0.3) + 's';
            container.appendChild(coin);
        }
        for (let i = 0; i < billCount; i++) {
            const bill = document.createElement('span');
            bill.className = 'pot-bill';
            bill.textContent = POT_BILLS[i % POT_BILLS.length];
            bill.style.left = billPositions[i].left + 'px';
            bill.style.top = billPositions[i].top + 'px';
            bill.style.animationDelay = (i * 0.5 + 0.2) + 's';
            container.appendChild(bill);
        }
    }

    /** Animate money flying from a seat to the pot */
    _animateBetToPot(seatElement, potContainerId) {
        const potEl = document.getElementById(potContainerId);
        if (!seatElement || !potEl) return;

        const seatRect = seatElement.getBoundingClientRect();
        const potRect = potEl.getBoundingClientRect();

        const fly = document.createElement('span');
        fly.className = 'money-fly-to-pot';
        fly.textContent = '🪙';
        fly.style.left = (seatRect.left + seatRect.width / 2) + 'px';
        fly.style.top = (seatRect.top + seatRect.height / 2) + 'px';
        // Animate towards pot center
        fly.style.transition = 'left 0.5s ease-in, top 0.5s ease-in';
        document.body.appendChild(fly);

        requestAnimationFrame(() => {
            fly.style.left = (potRect.left + potRect.width / 2) + 'px';
            fly.style.top = (potRect.top + potRect.height / 2) + 'px';
        });

        setTimeout(() => fly.remove(), 650);
    }

    /** Animate money flying from pot to winner seat */
    _animateWinFromPot(potContainerId, seatElement) {
        const potEl = document.getElementById(potContainerId);
        if (!seatElement || !potEl) return;

        const potRect = potEl.getBoundingClientRect();
        const seatRect = seatElement.getBoundingClientRect();

        // Spawn 3 money items with stagger
        for (let i = 0; i < 3; i++) {
            setTimeout(() => {
                const fly = document.createElement('span');
                fly.className = 'money-fly-to-winner';
                fly.textContent = i % 2 === 0 ? '🪙' : '💵';
                fly.style.left = (potRect.left + potRect.width / 2 + (i - 1) * 10) + 'px';
                fly.style.top = (potRect.top + potRect.height / 2) + 'px';
                fly.style.transition = 'left 0.6s ease-out, top 0.6s ease-out';
                document.body.appendChild(fly);

                requestAnimationFrame(() => {
                    fly.style.left = (seatRect.left + seatRect.width / 2) + 'px';
                    fly.style.top = (seatRect.top + seatRect.height / 2) + 'px';
                });

                setTimeout(() => fly.remove(), 750);
            }, i * 120);
        }
    }

    updateConnectionStatus(connected) {
        // TODO: Add connection status indicator to UI
        if (!connected) {
            this.ui.showError('Connection lost. Attempting to reconnect...');
        }
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.pokerApp = new PokerApp();
});