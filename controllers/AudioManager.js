class AudioManager {
    constructor() {
        this.cache = new Map(); // key -> { audio: HTMLAudioElement, loop: boolean, volume: number }
        this.enabled = true;    // Permettre de couper globalement le son si nécessaire
    }

    /**
     * Précharge un son et le garde en cache.
     * @param {string} key Clé symbolique (ex: 'thruster_main')
     * @param {string} url URL du fichier audio
     * @param {{loop?: boolean, volume?: number}} [options]
     */
    preload(key, url, options = {}) {
        if (!key || !url) return;
        if (this.cache.has(key)) return; // Déjà préchargé
        try {
            const audio = new Audio(url);
            audio.loop = !!options.loop;
            if (typeof options.volume === 'number') {
                audio.volume = options.volume;
            }
            // Déclencher un chargement anticipé
            audio.load();
            this.cache.set(key, { audio, loop: audio.loop, volume: audio.volume });
        } catch (e) {
            console.warn('[AudioManager] Erreur preload', key, url, e);
        }
    }

    /** Joue un son (depuis le cache si possible). */
    play(key) {
        if (!this.enabled) return;
        const entry = this.cache.get(key);
        if (!entry) return;
        const { audio } = entry;
        try {
            audio.currentTime = 0;
            audio.play().catch(() => {});
        } catch (e) {
            // ignorer
        }
    }

    /** Lance une boucle sonore (si loop=true) */
    startLoop(key) {
        if (!this.enabled) return;
        const entry = this.cache.get(key);
        if (!entry) return;
        const { audio } = entry;
        try {
            if (!audio.loop) audio.loop = true;
            audio.play().catch(() => {});
        } catch (e) {}
    }

    /** Arrête la lecture (utile pour boucles) */
    stop(key) {
        const entry = this.cache.get(key);
        if (!entry) return;
        const { audio } = entry;
        try {
            audio.pause();
            audio.currentTime = 0;
        } catch (e) {}
    }
}

// Exposer globalement (script non module)
window.audioManager = new AudioManager();

