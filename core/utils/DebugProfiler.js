/**
 * Utilitaires de debug et profiling pour PocketCosmos
 */

const DebugProfiler = {
    timers: new Map(),
    
    /**
     * Démarre un timer de profiling
     */
    startTimer(name) {
        this.timers.set(name, performance.now());
    },

    /**
     * Arrête un timer et retourne le temps écoulé
     */
    endTimer(name) {
        const startTime = this.timers.get(name);
        if (startTime === undefined) {
            console.warn(`Timer '${name}' not found`);
            return 0;
        }
        const elapsed = performance.now() - startTime;
        this.timers.delete(name);
        return elapsed;
    },

    /**
     * Log avec timestamp
     */
    log(message, category = 'DEBUG') {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] [${category}] ${message}`);
    },

    /**
     * Affiche les informations de performance
     */
    logPerformance(name, duration) {
        this.log(`${name}: ${duration.toFixed(2)}ms`, 'PERF');
    }
};

// Rendre disponible globalement
window.DebugProfiler = DebugProfiler; 