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

        // L'affichage du nom des stations est piloté par UI_STATE.showStations
        const showLabels = (typeof window !== 'undefined' && window.UI_STATE && window.UI_STATE.showStations) ? true : false;
        if (name && showLabels) {
            // Simplifier le nom: garder la partie avant le premier tiret
            let base = name;
            if (typeof name === 'string') {
                const parts = name.split('-');
                if (parts.length > 0) {
                    base = parts[0] || name;
                }
                // Déterminer un suffixe numérique si le nom encode plusieurs stations (ex: Terre-Station-A / -B / -3)
                let suffix = '';
                const last = parts[parts.length - 1];
                const prev = parts.length >= 2 ? parts[parts.length - 2] : '';
                if (/^[A-Z]$/.test(last)) {
                    // Lettre unique -> numéro (A→1, B→2, ...)
                    suffix = String(last.charCodeAt(0) - 64);
                } else if (/^\d+$/.test(last)) {
                    suffix = last;
                } else if (/^Station$/i.test(last) && /^[A-Z]$/.test(prev)) {
                    suffix = String(prev.charCodeAt(0) - 64);
                }
                // Concaténer sans espace entre l'icône et le nom
                const display = `⛽${base}${suffix}`;
                ctx.save();
                ctx.font = `${Math.max(10, size)}px Arial`;
                ctx.fillStyle = 'white';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'top';
                ctx.fillText(display, x, y + size * 0.8);
                ctx.restore();
                return;
            }
            const fallbackDisplay = `⛽${base}`;
            ctx.save();
            ctx.font = `${Math.max(10, size)}px Arial`;
            ctx.fillStyle = 'white';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillText(fallbackDisplay, x, y + size * 0.8);
            ctx.restore();
        }
    }
}


