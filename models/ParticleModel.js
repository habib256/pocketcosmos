class ParticleModel {
    constructor(x, y, vx, vy, size, lifetime, colorStart, colorEnd) {
        // Position et mouvement
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        
        // Propriétés visuelles
        this.size = size;
        this.colorStart = colorStart;
        this.colorEnd = colorEnd;
        
        // Propriétés temporelles
        this.lifetime = lifetime;
        this.age = 0;
        this.alpha = 1.0;
    }
    
    update(deltaTime) {
        // Avancement en "trames équivalentes 60 Hz" : pas de drift visuel selon le taux de rafraîchissement.
        // vx/vy sont des pixels-par-trame-60Hz et lifetime est exprimé en trames (cf. ParticleController).
        const frames = (typeof deltaTime === 'number' && deltaTime > 0) ? deltaTime * 60 : 1;
        const decay = Math.pow(0.98, frames);

        this.x += this.vx * frames;
        this.y += this.vy * frames;

        this.vx *= decay;
        this.vy *= decay;

        this.age += frames;
        // Clamp dans [0,1] : si age > lifetime, 1 - age/lifetime deviendrait négatif
        // (alpha invalide pour rgba()).
        this.alpha = Math.max(0, Math.min(1, 1.0 - (this.age / this.lifetime)));

        this.size *= decay;

        return this.age < this.lifetime;
    }
    
    // Calcule la couleur actuelle en fonction de l'âge
    getCurrentColor() {
        const progress = this.age / this.lifetime;
        const startRGB = this.hexToRgb(this.colorStart);
        const endRGB = this.hexToRgb(this.colorEnd);
        
        const r = Math.floor(startRGB.r + (endRGB.r - startRGB.r) * progress);
        const g = Math.floor(startRGB.g + (endRGB.g - startRGB.g) * progress);
        const b = Math.floor(startRGB.b + (endRGB.b - startRGB.b) * progress);
        
        return `rgba(${r}, ${g}, ${b}, ${this.alpha})`;
    }
    
    // Convertit une couleur hexadécimale en RGB
    hexToRgb(hex) {
        hex = hex.replace(/^#/, '');
        const bigint = parseInt(hex, 16);
        return {
            r: (bigint >> 16) & 255,
            g: (bigint >> 8) & 255,
            b: bigint & 255
        };
    }
} 