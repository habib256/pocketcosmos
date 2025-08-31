/**
 * Vue responsable du rendu des stations de surface.
 * Dessine une petite icône et, optionnellement, un label.
 */
class StationView {
    constructor() {
        // Charger l'image d'icône de station une seule fois
        this.stationImage = new Image();
        this.stationImage.src = 'assets/image/station.png';
    }
    /**
     * Dessine une station à l'écran.
     * @param {CanvasRenderingContext2D} ctx
     * @param {number} x - Position écran X
     * @param {number} y - Position écran Y
     * @param {number} size - Taille en pixels (déjà multipliée par le zoom)
     * @param {string} color - Couleur de l'icône
     * @param {string} [name] - Nom à afficher (optionnel)
     */
    drawStation(ctx, x, y, size, color, name, angleRad) {
        ctx.save();
        // Se placer au point écran voulu
        ctx.translate(x, y);
        if (typeof angleRad === 'number') {
            ctx.rotate(angleRad + Math.PI / 2);
        }

        // Si l'image est prête, l'afficher centrée en conservant le ratio
        if (this.stationImage && this.stationImage.complete && this.stationImage.naturalWidth > 0) {
            const imgW = this.stationImage.naturalWidth;
            const imgH = this.stationImage.naturalHeight;
            const ratio = imgW / imgH;
            let drawW, drawH;
            if (ratio >= 1) {
                drawW = size;
                drawH = size / ratio;
            } else {
                drawH = size;
                drawW = size * ratio;
            }
            ctx.drawImage(this.stationImage, -drawW / 2, -drawH / 2, drawW, drawH);
        } else {
            // Repli: dessiner l'ancien losange (carré tourné)
            if (!angleRad) ctx.rotate(Math.PI / 4);
            ctx.fillStyle = color || (typeof STATIONS !== 'undefined' ? STATIONS.COLOR : '#00FFCC');
            const half = size / 2;
            ctx.beginPath();
            ctx.rect(-half, -half, size, size);
            ctx.fill();
        }
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


