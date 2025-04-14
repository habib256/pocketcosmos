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
    
    update() {
        // Mise à jour de la position
        this.x += this.vx;
        this.y += this.vy;
        
        // Mise à jour de la physique
        this.vx *= 0.98; // Friction de l'air
        this.vy *= 0.98;
        
        // Vieillissement
        this.age++;
        this.alpha = 1.0 - (this.age / this.lifetime);
        
        // Réduction de la taille
        this.size *= 0.98;
        
        // Renvoie true si la particule est encore en vie
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