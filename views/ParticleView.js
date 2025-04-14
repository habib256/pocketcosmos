class ParticleView {
    constructor() {
        // Options de rendu
        this.useBlur = true;
        this.useGlow = true;
    }
    
    // Méthode principale pour le rendu des particules avec la caméra
    renderParticles(ctx, particleSystemModel, camera) {
        ctx.save();
        
        // Appliquer la transformation de la caméra
        ctx.translate(camera.offsetX, camera.offsetY);
        ctx.scale(camera.zoom, camera.zoom);
        ctx.translate(-camera.x, -camera.y);
        
        // Dessiner les particules d'émetteurs
        for (const emitterName in particleSystemModel.emitters) {
            const emitter = particleSystemModel.emitters[emitterName];
            this.render(ctx, emitter.particles);
        }
        
        // Dessiner les particules de débris
        this.render(ctx, particleSystemModel.debrisParticles);
        
        ctx.restore();
    }
    
    render(ctx, particles) {
        ctx.save();
        
        // Appliquer des effets visuels si activés
        if (this.useGlow) {
            ctx.globalCompositeOperation = 'lighter';
        }
        
        // Dessiner chaque particule
        for (const particle of particles) {
            this.renderParticle(ctx, particle);
        }
        
        // Réinitialiser les propriétés de dessin
        ctx.globalAlpha = 1.0;
        ctx.globalCompositeOperation = 'source-over';
        
        ctx.restore();
    }
    
    renderParticle(ctx, particle) {
        // Obtenir la couleur actuelle de la particule
        const color = particle.getCurrentColor();
        
        // Dessiner la particule de base
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        
        // Ajouter un effet de lueur si activé
        if (this.useGlow) {
            this.renderGlow(ctx, particle);
        }
    }
    
    renderGlow(ctx, particle) {
        // Sauvegarde du contexte pour l'effet de lueur
        ctx.save();
        
        // Dessiner un halo lumineux autour de la particule
        const gradient = ctx.createRadialGradient(
            particle.x, particle.y, particle.size * 0.5,
            particle.x, particle.y, particle.size * 2
        );
        
        // Créer un dégradé pour la lueur
        gradient.addColorStop(0, `rgba(255, 255, 255, ${particle.alpha * 0.8})`);
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
        
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size * 2, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();
        
        ctx.restore();
    }
    
    // Active/désactive l'effet de flou
    setBlurEffect(enabled) {
        this.useBlur = enabled;
    }
    
    // Active/désactive l'effet de lueur
    setGlowEffect(enabled) {
        this.useGlow = enabled;
    }
} 