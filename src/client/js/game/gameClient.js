// Game client for Socket.IO communication
export class GameClient {
    constructor() {
        this.socket = null;
        this.isConnected = false;
        this.currentRoom = null;
        this.eventListeners = new Map();
        
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 1000;
    }

    async connect(user) {
        return new Promise((resolve, reject) => {
            try {
                this.socket = io({
                    auth: {
                        token: user.isGuest ? null : user.token,
                        isGuest: user.isGuest,
                        displayName: user.displayName
                    }
                });

                this.setupSocketEvents();

                this.socket.on('connect', () => {
                    this.isConnected = true;
                    this.reconnectAttempts = 0;
                    this.emit('connected');
                    resolve();
                });

                this.socket.on('connect_error', (error) => {
                    console.error('Connection failed:', error);
                    reject(error);
                });

            } catch (error) {
                reject(error);
            }
        });
    }

    setupSocketEvents() {
        this.socket.on('disconnect', (reason) => {
            this.isConnected = false;
            this.emit('disconnected', reason);
            
            if (reason === 'io server disconnect') {
                // Server disconnected us, reconnect manually
                setTimeout(() => {
                    if (this.reconnectAttempts < this.maxReconnectAttempts) {
                        this.reconnectAttempts++;
                        this.socket.connect();
                    }
                }, this.reconnectDelay * this.reconnectAttempts);
            }
        });

        this.socket.on('reconnect', () => {
            this.isConnected = true;
            this.reconnectAttempts = 0;
            this.emit('connected');
        });

        // Game events
        this.socket.on('roomUpdate', (data) => {
            this.emit('roomUpdate', data);
        });

        this.socket.on('gameUpdate', (data) => {
            this.emit('gameUpdate', data);
        });

        this.socket.on('gameStarted', (data) => {
            this.emit('gameStarted', data);
        });

        this.socket.on('userJoined', (data) => {
            this.emit('userJoined', data);
        });

        this.socket.on('userLeft', (data) => {
            this.emit('userLeft', data);
        });

        this.socket.on('chatMessage', (data) => {
            this.emit('chatMessage', data);
        });

        this.socket.on('roomListUpdate', (data) => {
            this.emit('roomListUpdate', data);
        });

        this.socket.on('error', (error) => {
            this.emit('error', error);
        });
    }

    // Event handling
    on(event, callback) {
        if (!this.eventListeners.has(event)) {
            this.eventListeners.set(event, []);
        }
        this.eventListeners.get(event).push(callback);
    }

    off(event, callback) {
        const listeners = this.eventListeners.get(event);
        if (listeners) {
            const index = listeners.indexOf(callback);
            if (index > -1) {
                listeners.splice(index, 1);
            }
        }
    }

    emit(event, data) {
        const listeners = this.eventListeners.get(event);
        if (listeners) {
            listeners.forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error('Event listener error:', error);
                }
            });
        }
    }

    // Socket operations with promise wrapper
    socketEmit(event, data = {}) {
        return new Promise((resolve, reject) => {
            if (!this.socket || !this.isConnected) {
                reject(new Error('Not connected to server'));
                return;
            }

            this.socket.emit(event, data, (response) => {
                if (response.success) {
                    resolve(response);
                } else {
                    reject(new Error(response.error || 'Unknown error'));
                }
            });
        });
    }

    // Room management
    async createRoom(roomData) {
        const response = await this.socketEmit('createRoom', roomData);
        this.currentRoom = response.room;
        return response.room;
    }

    async joinRoom(roomId, password = null) {
        const response = await this.socketEmit('joinRoom', { roomId, password });
        this.currentRoom = response.room;
        return response.room;
    }

    async joinRoomByInvite(inviteCode, password = null) {
        const response = await this.socketEmit('joinByInvite', { inviteCode, password });
        this.currentRoom = response.room;
        return response;
    }

    async leaveRoom() {
        if (!this.currentRoom) return;
        
        await this.socketEmit('leaveRoom', { roomId: this.currentRoom.roomId });
        this.currentRoom = null;
    }

    async setReady(isReady) {
        if (!this.currentRoom) throw new Error('Not in a room');
        
        await this.socketEmit('setReady', { 
            roomId: this.currentRoom.roomId, 
            isReady 
        });
    }

    async startGame() {
        if (!this.currentRoom) throw new Error('Not in a room');
        
        await this.socketEmit('startGame', { 
            roomId: this.currentRoom.roomId 
        });
    }

    // Game actions
    async playerAction(actionType, amount = 0) {
        if (!this.currentRoom) throw new Error('Not in a room');
        
        const response = await this.socketEmit('playerAction', {
            roomId: this.currentRoom.roomId,
            actionType,
            amount
        });
        
        return response.action;
    }

    async getGameState() {
        if (!this.currentRoom) throw new Error('Not in a room');
        
        const response = await this.socketEmit('getGameState', {
            roomId: this.currentRoom.roomId
        });
        
        return response.room;
    }

    // Chat
    async sendMessage(message, isPrivate = false, recipientId = null) {
        if (!this.currentRoom) throw new Error('Not in a room');
        
        await this.socketEmit('sendMessage', {
            roomId: this.currentRoom.roomId,
            message,
            isPrivate,
            recipientId
        });
    }

    // REST API calls for non-realtime operations
    async getPublicRooms(page = 1, limit = 10) {
        try {
            const response = await fetch(`/api/rooms?page=${page}&limit=${limit}`);
            const data = await response.json();
            
            if (!data.success) {
                throw new Error(data.error || 'Failed to fetch rooms');
            }
            
            return data.rooms;
        } catch (error) {
            console.error('Failed to fetch public rooms:', error);
            throw error;
        }
    }

    async getRoomInfo(roomId) {
        try {
            const response = await fetch(`/api/rooms/${roomId}`, {
                headers: this.getAuthHeaders()
            });
            const data = await response.json();
            
            if (!data.success) {
                throw new Error(data.error || 'Failed to fetch room info');
            }
            
            return data.room;
        } catch (error) {
            console.error('Failed to fetch room info:', error);
            throw error;
        }
    }

    getAuthHeaders() {
        const headers = {
            'Content-Type': 'application/json'
        };
        
        // Add authentication headers if user is authenticated
        if (window.pokerApp?.currentUser && !window.pokerApp.currentUser.isGuest) {
            headers['Authorization'] = `Bearer ${window.pokerApp.currentUser.token}`;
        } else if (window.pokerApp?.currentUser?.isGuest) {
            headers['x-guest-user'] = 'true';
            headers['x-guest-name'] = window.pokerApp.currentUser.displayName;
        }
        
        return headers;
    }

    // Utility methods
    isInRoom() {
        return this.currentRoom !== null;
    }

    getCurrentRoom() {
        return this.currentRoom;
    }

    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
        this.isConnected = false;
        this.currentRoom = null;
    }
}