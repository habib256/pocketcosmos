// StateManager.js
// Gestionnaire d'état du jeu (singleton global)
(function(global) {
    function StateManager() {
        this.isRunning = false;
        this.isPaused = false;
    }

    StateManager.prototype.start = function() {
        this.isRunning = true;
        this.isPaused = false;
    };

    StateManager.prototype.pause = function() {
        this.isPaused = true;
    };

    StateManager.prototype.resume = function() {
        this.isPaused = false;
    };

    StateManager.prototype.togglePause = function() {
        this.isPaused = !this.isPaused;
    };

    StateManager.prototype.stop = function() {
        this.isRunning = false;
    };

    // Singleton global
    global.StateManager = new StateManager();
})(window); 