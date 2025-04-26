/**
 * Gère l'affichage de la trajectoire d'un objet (ex: la fusée).
 * Stocke une liste de points et les relie pour former une trace visuelle.
 * Gère les discontinuités dans la trace (par exemple, après un téléportage ou une réinitialisation partielle).
 */
class TraceView {
    /**
     * Initialise une nouvelle instance de TraceView.
     */
    constructor() {
        /**
         * @type {({x: number, y: number} | null)[]}
         * Tableau stockant les points successifs de la trace.
         * Un élément `null` indique une discontinuité dans la trace.
         */
        this.traces = [];
        /**
         * @type {number}
         * Nombre maximum de points stockés dans la trace (x2 coordonnées par point).
         * Les points les plus anciens sont supprimés lorsque cette limite est atteinte.
         * Voir la méthode `update`.
         */
        this.maxPoints = 20000;
        /**
         * @type {boolean}
         * Indique si la trace doit être affichée (`true`) ou non (`false`).
         */
        this.isVisible = true;

        // Les variables relatives à la lune (moonRelativeTraces, attachedToMoon) ont été supprimées car non utilisées.
    }

    /**
     * Ajoute un nouveau point à la trace.
     * Si le nombre maximum de points est dépassé, le point le plus ancien est retiré.
     * @param {{x: number, y: number}} position - La position absolue (coordonnées monde) à ajouter à la trace.
     */
    update(position) {
        if (!this.isVisible) return;

        // Ajouter simplement le point de position absolue
        this.traces.push({ ...position });

        // Limiter le nombre de points en retirant le plus ancien si nécessaire
        if (this.traces.length > this.maxPoints) {
            this.traces.shift(); // Retire le premier élément (le plus ancien)
        }
    }

    /**
     * Dessine la trace sur le canvas en utilisant le contexte de rendu et la caméra fournis.
     * Gère les discontinuités (points `null`) et les points invalides.
     * @param {CanvasRenderingContext2D} ctx - Le contexte de rendu 2D du canvas.
     * @param {Camera} camera - L'objet caméra utilisé pour convertir les coordonnées monde en coordonnées écran.
     */
    render(ctx, camera) {
        if (!this.isVisible || this.traces.length < 2) return;

        ctx.save(); // Sauvegarde l'état actuel du contexte (style, transformation)

        ctx.strokeStyle = 'rgba(255, 100, 100, 0.5)'; // Couleur et transparence de la trace
        ctx.lineWidth = 2; // Épaisseur de la trace

        let isNewPath = true; // Indicateur pour savoir si on doit commencer un nouveau segment de tracé

        // Itérer sur tous les points stockés
        for (let i = 0; i < this.traces.length; i++) {
            const point = this.traces[i];

            // Si le point est null, cela marque une discontinuité.
            if (point === null) {
                // Terminer le chemin actuel s'il était en cours de dessin
                if (!isNewPath) {
                    ctx.stroke(); // Dessine le segment tracé jusqu'à présent
                    isNewPath = true; // Prépare le début d'un nouveau chemin au prochain point valide
                }
                continue; // Passe au point suivant
            }

            // Vérifier que le point a des coordonnées valides avant de continuer
            if (point.x === undefined || point.y === undefined ||
                isNaN(point.x) || isNaN(point.y)) {
                console.warn("[TraceView] Point de trace invalide ignoré:", point);
                isNewPath = true; // Un point invalide force aussi le début d'un nouveau chemin
                continue;
            }

            // Convertir les coordonnées du monde en coordonnées de l'écran via la caméra
            const screenPos = camera.worldToScreen(point.x, point.y);

            // Vérifier que les coordonnées d'écran résultantes sont valides
            if (isNaN(screenPos.x) || isNaN(screenPos.y)) {
                console.warn("[TraceView] Coordonnées d'écran invalides après transformation:", screenPos, "depuis", point);
                isNewPath = true; // Coordonnées écran invalides forcent un nouveau chemin
                continue;
            }

            if (isNewPath) {
                // Commencer un nouveau segment de tracé
                ctx.beginPath(); // Commence un nouveau chemin
                ctx.moveTo(screenPos.x, screenPos.y); // Se déplace au premier point du segment
                isNewPath = false; // Le chemin est maintenant en cours
            } else {
                // Continuer le segment de tracé existant
                ctx.lineTo(screenPos.x, screenPos.y); // Ajoute une ligne vers le nouveau point
            }
        }

        // Terminer le dernier segment s'il était en cours
        if (!isNewPath) {
            ctx.stroke(); // Dessine le dernier segment
        }

        ctx.restore(); // Restaure l'état précédent du contexte
    }

    /**
     * Bascule la visibilité de la trace.
     * @returns {boolean} Le nouvel état de visibilité.
     */
    toggleVisibility() {
        this.isVisible = !this.isVisible;
        return this.isVisible;
    }

    /**
     * Efface la trace. Peut soit tout effacer, soit insérer une discontinuité.
     * @param {boolean} [all=false] - Si `true`, efface complètement tous les points de la trace.
     *                                Si `false` (défaut), insère un `null` pour créer une discontinuité visuelle
     *                                lors du prochain rendu, sans effacer l'historique des points.
     */
    clear(all = false) {
        if (all) {
            // Effacement complet de toutes les traces
            this.traces = [];
        } else {
            // Ajouter un point null pour créer une discontinuité dans la trace
            // Cela permet de séparer visuellement différentes phases ou trajectoires.
            this.traces.push(null);
        }
    }
} 