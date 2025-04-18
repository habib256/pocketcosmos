// ScoreManager.js
// Gestionnaire global des crédits/récompenses (singleton global)
(function(global) {
    function ScoreManager() {
        this.credits = 0;
    }

    ScoreManager.prototype.add = function(amount) {
        this.credits += amount;
        this.emitUpdate();
    };

    ScoreManager.prototype.remove = function(amount) {
        this.credits = Math.max(0, this.credits - amount);
        this.emitUpdate();
    };

    ScoreManager.prototype.reset = function(initial) {
        this.credits = typeof initial === 'number' ? initial : 10;
        this.emitUpdate();
    };

    ScoreManager.prototype.get = function() {
        return this.credits;
    };

    ScoreManager.prototype.emitUpdate = function() {
        if (window.eventBus) {
            window.eventBus.emit('UI_UPDATE_CREDITS', { credits: this.credits });
        }
    };

    // Singleton global
    global.ScoreManager = new ScoreManager();
})(window); 