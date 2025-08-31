/**
 * Vue responsable du rendu des stations de surface.
 * Dessine une petite icône et, optionnellement, un label.
 */
class StationView {
    /**
     * Dessine une station à l'écran.
     * @param {CanvasRenderingContext2D} ctx
     * @param {number} x - Position écran X
     * @param {number} y - Position écran Y
     * @param {number} size - Taille en pixels (déjà multipliée par le zoom)
     * @param {string} color - Couleur de l'icône
     * @param {string} [name] - Nom à afficher (optionnel)
     */
    drawStation(ctx, x, y, size, color, name) {
        ctx.save();
        // Dessiner un losange (carré tourné) comme balise de station
        ctx.translate(x, y);
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = color || (typeof STATIONS !== 'undefined' ? STATIONS.COLOR : '#00FFCC');
        const half = size / 2;
        ctx.beginPath();
        ctx.rect(-half, -half, size, size);
        ctx.fill();
        ctx.restore();

        const hideNames = (typeof window !== 'undefined' && window.UI_STATE && window.UI_STATE.hideBodyNames) ? true : false;
        if (name && !hideNames) {
            ctx.save();
            ctx.font = `${Math.max(10, size)}px Arial`;
            ctx.fillStyle = 'white';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillText(name, x, y + size * 0.8);
            ctx.restore();
        }
    }
}


