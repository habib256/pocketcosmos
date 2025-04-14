class EventBus {
    constructor() {
        this.listeners = new Map();
    }
    
    subscribe(eventType, callback) {
        if (!this.listeners.has(eventType)) {
            this.listeners.set(eventType, new Set());
        }
        this.listeners.get(eventType).add(callback);
        
        // Retourner une fonction pour se désabonner facilement
        return () => this.unsubscribe(eventType, callback);
    }
    
    // Alias pour subscribe, compatible avec la syntaxe utilisée dans PhysicsController
    on(eventType, callback) {
        return this.subscribe(eventType, callback);
    }
    
    unsubscribe(eventType, callback) {
        if (this.listeners.has(eventType)) {
            this.listeners.get(eventType).delete(callback);
        }
    }
    
    // Alias pour unsubscribe, compatible avec la syntaxe utilisée dans PhysicsController
    off(eventType, callback) {
        this.unsubscribe(eventType, callback);
    }
    
    emit(eventType, data) {
        if (this.listeners.has(eventType)) {
            for (const callback of this.listeners.get(eventType)) {
                callback(data);
            }
        }
    }
    
    clear() {
        this.listeners.clear();
    }
} 