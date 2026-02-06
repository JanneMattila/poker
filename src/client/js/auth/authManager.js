// Authentication management
export class AuthManager {
    constructor() {
        this.storageKey = 'poker_user_token';
        this.userKey = 'poker_user_data';
    }

    // Microsoft Account integration (placeholder)
    async loginWithMicrosoft() {
        try {
            // In a real implementation, this would:
            // 1. Redirect to Microsoft OAuth endpoint
            // 2. Handle the callback with authorization code
            // 3. Exchange code for access token
            // 4. Validate token and get user info
            
            // For now, simulate the process
            return new Promise((resolve, reject) => {
                // Simulate OAuth flow delay
                setTimeout(() => {
                    const mockUser = {
                        userId: this.generateId(),
                        displayName: 'Microsoft User',
                        email: 'user@microsoft.com',
                        token: this.generateMockToken(),
                        isGuest: false,
                        provider: 'microsoft'
                    };
                    
                    this.storeUserData(mockUser);
                    resolve(mockUser);
                }, 1000);
            });
        } catch (error) {
            console.error('Microsoft login failed:', error);
            throw new Error('Microsoft login failed');
        }
    }

    // Guest user creation
    createGuestUser(displayName) {
        const guestUser = {
            userId: this.generateId(),
            displayName: displayName || `Guest_${Date.now()}`,
            email: null,
            token: null,
            isGuest: true,
            provider: 'guest'
        };
        
        this.storeUserData(guestUser);
        return guestUser;
    }

    // Token management
    getStoredToken() {
        try {
            return localStorage.getItem(this.storageKey);
        } catch (error) {
            console.error('Failed to get stored token:', error);
            return null;
        }
    }

    storeToken(token) {
        try {
            localStorage.setItem(this.storageKey, token);
        } catch (error) {
            console.error('Failed to store token:', error);
        }
    }

    removeToken() {
        try {
            localStorage.removeItem(this.storageKey);
        } catch (error) {
            console.error('Failed to remove token:', error);
        }
    }

    // User data management
    storeUserData(user) {
        try {
            localStorage.setItem(this.userKey, JSON.stringify(user));
            if (user.token) {
                this.storeToken(user.token);
            }
        } catch (error) {
            console.error('Failed to store user data:', error);
        }
    }

    getStoredUserData() {
        try {
            const userData = localStorage.getItem(this.userKey);
            return userData ? JSON.parse(userData) : null;
        } catch (error) {
            console.error('Failed to get stored user data:', error);
            return null;
        }
    }

    removeUserData() {
        try {
            localStorage.removeItem(this.userKey);
            this.removeToken();
        } catch (error) {
            console.error('Failed to remove user data:', error);
        }
    }

    // Token validation
    isTokenValid(token) {
        if (!token) return false;
        
        try {
            // Simple token validation - in production, verify with server
            const payload = this.parseJWT(token);
            if (!payload) return false;
            
            const now = Math.floor(Date.now() / 1000);
            return payload.exp > now;
        } catch (error) {
            console.error('Token validation failed:', error);
            return false;
        }
    }

    parseJWT(token) {
        try {
            const base64Url = token.split('.')[1];
            const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
            const jsonPayload = decodeURIComponent(
                atob(base64)
                    .split('')
                    .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
                    .join('')
            );
            
            return JSON.parse(jsonPayload);
        } catch (error) {
            console.error('Failed to parse JWT:', error);
            return null;
        }
    }

    getUserFromToken(token) {
        try {
            const payload = this.parseJWT(token);
            if (!payload) return null;
            
            return {
                userId: payload.userId,
                displayName: payload.displayName,
                email: payload.email,
                token: token,
                isGuest: false,
                provider: 'microsoft'
            };
        } catch (error) {
            console.error('Failed to get user from token:', error);
            return null;
        }
    }

    // Logout
    logout() {
        this.removeUserData();
    }

    // Auto-login check
    async checkAutoLogin() {
        const userData = this.getStoredUserData();
        if (!userData) return null;
        
        if (userData.isGuest) {
            // Guest users don't persist across sessions
            this.removeUserData();
            return null;
        }
        
        if (userData.token && this.isTokenValid(userData.token)) {
            return userData;
        } else {
            // Token expired, remove stored data
            this.removeUserData();
            return null;
        }
    }

    // Utility methods
    generateId() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    generateMockToken() {
        // Generate a mock JWT-like token for demo purposes
        const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
        const payload = btoa(JSON.stringify({
            userId: this.generateId(),
            displayName: 'Microsoft User',
            email: 'user@microsoft.com',
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 hours
        }));
        const signature = btoa('mock_signature');
        
        return `${header}.${payload}.${signature}`;
    }

    // Microsoft OAuth helpers (for when implementing real OAuth)
    getMicrosoftAuthUrl() {
        const clientId = process.env.MICROSOFT_CLIENT_ID || 'your_client_id';
        const redirectUri = encodeURIComponent(window.location.origin + '/auth/microsoft/callback');
        const scope = encodeURIComponent('openid profile email');
        const state = this.generateId();
        
        // Store state for validation
        sessionStorage.setItem('oauth_state', state);
        
        return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?` +
               `client_id=${clientId}&` +
               `response_type=code&` +
               `redirect_uri=${redirectUri}&` +
               `scope=${scope}&` +
               `state=${state}&` +
               `response_mode=query`;
    }

    validateOAuthState(receivedState) {
        const storedState = sessionStorage.getItem('oauth_state');
        sessionStorage.removeItem('oauth_state');
        return storedState === receivedState;
    }
}