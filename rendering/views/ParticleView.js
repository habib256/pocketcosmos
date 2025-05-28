/**
 * @fileoverview Gère le rendu visuel de tous les types de particules sur le canvas.
 * Fait partie de la couche VUE de l'architecture MVC étendue. Ne contient aucune logique métier
 * ou physique, seulement le dessin basé sur les données fournies.
 */
class ParticleView {
    /**
     * Initialise la vue des particules.
     */
    constructor() {
        // Option pour activer/désactiver l'effet de lueur (glow)
        // Note : useBlur a été supprimé car non utilisé.
        this.useGlow = true;
    }

    /**
     * Méthode principale pour le rendu de toutes les particules.
     * Applique les transformations de la caméra et délègue le rendu spécifique
     * à d'autres méthodes ou gère directement certains types.
     *
     * @param {CanvasRenderingContext2D} ctx - Le contexte de rendu 2D du canvas.
     * @param {object} particleSystemModel - L'objet contenant l'état de toutes les particules (emitters, debris, text, celebration). Probablement géré par ParticleController.
     * @param {object} camera - L'objet caméra contenant les informations de vue (position x, y, zoom, offsetX, offsetY).
     * @param {object} rocketModel - Le modèle de la fusée, utilisé ici pour vérifier si elle est détruite.
     */
    renderParticles(ctx, particleSystemModel, camera, rocketModel) {
        ctx.save(); // Sauvegarde l'état global du contexte (transformations, styles, etc.)

        // --- Application de la Transformation Caméra ---
        // Ces transformations permettent de dessiner les particules dans le "monde"
        // et de les voir correctement à travers la caméra (position et zoom).
        ctx.translate(camera.offsetX, camera.offsetY); // Centre la vue
        ctx.scale(camera.zoom, camera.zoom);          // Applique le zoom
        ctx.translate(-camera.x, -camera.y);          // Positionne la caméra sur le monde

        // --- Rendu des Particules des Émetteurs (Propulsion, etc.) ---
        // Conditionnel : N'affiche les particules des émetteurs (ex: propulsion)
        // que si la fusée n'est pas considérée comme détruite.
        if (!rocketModel || !rocketModel.isDestroyed) {
            for (const emitterName in particleSystemModel.emitters) {
                const emitter = particleSystemModel.emitters[emitterName];
                // Délègue le rendu des particules de cet émetteur
                this.render(ctx, emitter.particles);
            }
        }

        // --- Rendu des Particules de Débris (Explosions) ---
        // Toujours affichées, même si la fusée est détruite.
        this.render(ctx, particleSystemModel.debrisParticles);

        // --- Rendu des Particules Texte (ex: "Mission Réussie") ---
        // Gère le rendu spécifique de particules textuelles.
        if (particleSystemModel.textParticles && particleSystemModel.textParticles.length > 0) {
            // Note : Ce rendu est spécifique et n'utilise pas la méthode `render` générale.
            for (const p of particleSystemModel.textParticles) {
                ctx.save(); // Isoler les styles de texte
                ctx.globalAlpha = p.alpha; // Appliquer la transparence de la particule
                ctx.font = `${p.size || 32}px Impact, Arial, sans-serif`; // Définir la police et la taille
                ctx.fillStyle = p.color || '#FFD700'; // Couleur de remplissage
                ctx.strokeStyle = '#222'; // Couleur du contour
                ctx.lineWidth = 2; // Épaisseur du contour
                ctx.textAlign = 'center'; // Centrer le texte horizontalement
                ctx.textBaseline = 'middle'; // Centrer le texte verticalement
                // Dessiner le contour et le remplissage pour une meilleure lisibilité
                ctx.strokeText(p.char, p.x, p.y);
                ctx.fillText(p.char, p.x, p.y);
                ctx.restore(); // Restaurer les styles précédents
            }
        }

        // --- Rendu et Mise à Jour des Particules de Célébration ---
        // Gère le rendu et, fait inhabituel, la mise à jour/suppression de ces particules ici.
        if (particleSystemModel.celebrationParticles && particleSystemModel.celebrationParticles.length > 0) {
             // Itération en sens inverse pour permettre la suppression sûre (splice) pendant l'itération.
            for (let i = particleSystemModel.celebrationParticles.length - 1; i >= 0; i--) {
                const p = particleSystemModel.celebrationParticles[i];
                ctx.save(); // Isoler les styles/effets de cette particule
                ctx.globalAlpha = p.alpha; // Transparence
                ctx.beginPath(); // Commencer le dessin de la particule (cercle)
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); // Définir le cercle
                ctx.fillStyle = p.color; // Couleur de remplissage
                // Effet de lueur simple via shadowBlur
                ctx.shadowColor = p.color;
                ctx.shadowBlur = 16;
                ctx.fill(); // Dessiner la particule
                ctx.restore(); // Restaurer les styles/effets

                // --- Point Important : Mise à jour dans la boucle de rendu ---
                // La méthode `update` de la particule est appelée ici. Si elle retourne `false`
                // (indiquant que la particule a expiré), elle est retirée du tableau.
                // C'est atypique, la mise à jour est souvent séparée du rendu.
                // SUPPRESSION DE LA LOGIQUE DE MISE A JOUR ICI
                // if (!p.update()) {
                //     particleSystemModel.celebrationParticles.splice(i, 1);
                // }
            }
        }

        ctx.restore(); // Restaure l'état global du contexte d'avant les transformations caméra.
    }

    /**
     * Rend une liste générique de particules.
     * Applique potentiellement des effets globaux comme la lueur.
     *
     * @param {CanvasRenderingContext2D} ctx - Le contexte de rendu.
     * @param {Array<object>} particles - Un tableau d'objets particules à dessiner. Chaque particule doit avoir au moins x, y, size, et une méthode getCurrentColor().
     */
    render(ctx, particles) {
        if (!particles || particles.length === 0) return; // Ne rien faire si pas de particules

        ctx.save(); // Sauvegarder l'état pour isoler les effets de cette méthode

        // Appliquer l'effet de "lueur additive" si activé.
        // 'lighter' additionne les couleurs où les formes se superposent, créant un effet lumineux.
        if (this.useGlow) {
            // Attention: globalCompositeOperation affecte TOUT ce qui est dessiné après,
            // jusqu'à ce qu'il soit réinitialisé.
            ctx.globalCompositeOperation = 'lighter';
        }

        // Dessiner chaque particule de la liste
        for (const particle of particles) {
            // Délègue le dessin d'une particule individuelle
            this.renderParticle(ctx, particle);
        }

        // Réinitialiser les propriétés de dessin potentiellement modifiées
        // ctx.globalAlpha = 1.0; // Normalement géré par renderParticle/renderGlow via save/restore ou couleur alpha
        // Rétablir l'opération de composition par défaut pour ne pas affecter le reste du rendu.
        ctx.globalCompositeOperation = 'source-over';

        ctx.restore(); // Restaurer l'état du contexte d'avant cette méthode
    }

    /**
     * Rend une particule individuelle simple (un cercle coloré).
     * Appelle `renderGlow` si l'effet est activé.
     *
     * @param {CanvasRenderingContext2D} ctx - Le contexte de rendu.
     * @param {object} particle - L'objet particule à dessiner (avec x, y, size, alpha, getCurrentColor()).
     */
    renderParticle(ctx, particle) {
        // Obtenir la couleur actuelle (peut inclure l'alpha)
        const color = particle.getCurrentColor(); // Ex: 'rgba(255, 85, 0, 0.8)'

        // Dessiner la particule de base (un cercle)
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        ctx.fillStyle = color; // Appliquer la couleur (avec potentiellement l'alpha)
        ctx.fill();

        // Ajouter un effet de lueur distinct si activé et si la méthode renderGlow est utilisée.
        // Note: Si la lueur de `render` (via globalCompositeOperation) est suffisante,
        // cet appel pourrait être redondant ou créer un double effet. À évaluer visuellement.
        // Pour l'instant, on garde la structure originale.
        if (this.useGlow) {
            // Note : `renderGlow` a son propre ctx.save/restore.
            this.renderGlow(ctx, particle);
        }
    }

    /**
     * Rend un effet de lueur autour d'une particule en utilisant un dégradé radial.
     * Cet effet est superposé à la particule dessinée dans `renderParticle`.
     *
     * @param {CanvasRenderingContext2D} ctx - Le contexte de rendu.
     * @param {object} particle - La particule pour laquelle dessiner la lueur.
     */
    renderGlow(ctx, particle) {
        // Sauvegarde du contexte pour l'effet de lueur, afin de ne pas affecter
        // le dessin d'autres particules ou éléments.
        ctx.save();

        // Créer un dégradé radial centré sur la particule.
        // Il va du blanc semi-transparent (au centre) à transparent (sur les bords).
        const gradient = ctx.createRadialGradient(
            particle.x, particle.y, particle.size * 0.5, // Cercle intérieur (début dégradé)
            particle.x, particle.y, particle.size * 2   // Cercle extérieur (fin dégradé)
        );

        // Définir les couleurs du dégradé.
        // Utilise l'alpha de la particule pour que la lueur s'estompe avec elle.
        gradient.addColorStop(0, `rgba(255, 255, 255, ${particle.alpha * 0.8})`); // Blanc lumineux au centre
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');                   // Transparent à l'extérieur

        // Dessiner un cercle plus grand rempli avec ce dégradé pour simuler la lueur.
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size * 2, 0, Math.PI * 2);
        ctx.fillStyle = gradient; // Utiliser le dégradé comme remplissage
        ctx.fill();

        ctx.restore(); // Restaurer l'état du contexte d'avant la lueur.
    }

    // Méthode pour activer/désactiver l'effet de lueur dynamiquement
    setGlowEffect(enabled) {
        this.useGlow = enabled;
        console.log("Particle glow effect:", enabled); // Log pour le débogage
    }
}
// Assurez-vous que la classe est exportée ou disponible globalement selon votre système de modules.
// Exemple simple (si pas de système de module) :
// window.ParticleView = ParticleView;
// Si vous utilisez des modules ES6 : export default ParticleView; 