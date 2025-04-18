// AudioManager.js
// Gestionnaire global de l'audio (singleton global)
(function(global) {
    function AudioManager() {
        this.sounds = {};
        this.muted = false;
    }

    AudioManager.prototype.play = function(name, src, options) {
        if (this.muted) return;
        let sound = this.sounds[name];
        if (!sound) {
            sound = new Audio(src);
            sound.loop = options && options.loop;
            sound.volume = (options && typeof options.volume === 'number') ? options.volume : 1.0;
            this.sounds[name] = sound;
        } else {
            // Si le son change de source, on le remplace
            if (sound.src !== (new URL(src, window.location)).href) {
                sound.pause();
                sound = new Audio(src);
                sound.loop = options && options.loop;
                sound.volume = (options && typeof options.volume === 'number') ? options.volume : 1.0;
                this.sounds[name] = sound;
            }
        }
        sound.currentTime = 0;
        sound.play().catch(function(e) {
            console.error('Erreur lors de la lecture du son', name, e);
        });
    };

    AudioManager.prototype.stop = function(name) {
        const sound = this.sounds[name];
        if (sound) {
            sound.pause();
            sound.currentTime = 0;
        }
    };

    AudioManager.prototype.setVolume = function(name, volume) {
        const sound = this.sounds[name];
        if (sound) sound.volume = volume;
    };

    AudioManager.prototype.mute = function() {
        this.muted = true;
        for (const name in this.sounds) {
            this.sounds[name].pause();
        }
    };

    AudioManager.prototype.unmute = function() {
        this.muted = false;
    };

    // Singleton global
    global.AudioManager = new AudioManager();
})(window); 