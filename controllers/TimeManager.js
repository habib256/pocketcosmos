// TimeManager.js
// Gestionnaire du temps de jeu (singleton global)
(function(global) {
    function TimeManager() {
        this.lastTimestamp = 0;
        this.elapsedTime = 0;
    }

    TimeManager.prototype.init = function(timestamp) {
        this.lastTimestamp = timestamp || performance.now();
        this.elapsedTime = 0;
    };

    TimeManager.prototype.update = function(timestamp) {
        if (typeof timestamp !== 'number') return;
        const delta = (timestamp - this.lastTimestamp) / 1000; // secondes
        this.elapsedTime += delta;
        this.lastTimestamp = timestamp;
        return delta;
    };

    TimeManager.prototype.reset = function() {
        this.lastTimestamp = performance.now();
        this.elapsedTime = 0;
    };

    // Singleton global
    global.TimeManager = new TimeManager();
})(window); 