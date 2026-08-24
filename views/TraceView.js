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
         * @type {number}
         * Index de tête du buffer circulaire. Une fois `maxPoints` atteint, les nouveaux
         * points écrasent les plus anciens à cet index (O(1)) au lieu d'un `shift()` O(n).
         */
        this.head = 0;
        /**
         * @type {number}
         * Seuil minimal de déplacement (au carré, en coordonnées monde) entre deux points
         * consécutifs pour qu'un nouveau point soit ajouté. Évite d'accumuler des points
         * quasi-identiques quand la fusée est immobile.
         */
        this.minStepSq = 4; // ~2 unités monde
        /**
         * @type {{x: number, y: number} | null}
         * Dernier point réel ajouté (pour le filtrage par seuil de déplacement).
         */
        this.lastPoint = null;
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

        // Filtrage par seuil de déplacement : ignorer les points trop proches du dernier
        // point réel pour ne pas accumuler de doublons quand la fusée bouge peu.
        if (this.lastPoint) {
            const dx = position.x - this.lastPoint.x;
            const dy = position.y - this.lastPoint.y;
            if (dx * dx + dy * dy < this.minStepSq) {
                return;
            }
        }

        const point = { x: position.x, y: position.y };
        this.lastPoint = point;

        // Buffer circulaire : tant que la limite n'est pas atteinte, on empile ;
        // une fois pleine, on écrase la position la plus ancienne (head) en O(1)
        // au lieu d'un shift() O(n) à chaque frame.
        if (this.traces.length < this.maxPoints) {
            this.traces.push(point);
        } else {
            this.traces[this.head] = point;
            this.head = (this.head + 1) % this.maxPoints;
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

        // Tampon réutilisé pour la projection écran (voir la note anti-allocation plus bas).
        const screenPos = this._screenPos || (this._screenPos = { x: 0, y: 0 });

        // Fenêtre d'élagage : segments entièrement hors écran. On garde une marge généreuse
        // (une pleine dimension de canvas) pour que les segments traversants restent corrects,
        // et on ne coupe qu'à partir du 2e point consécutif hors champ afin de ne jamais
        // supprimer le segment qui entre ou sort de l'écran.
        const largeur = (ctx.canvas && ctx.canvas.width) || 0;
        const hauteur = (ctx.canvas && ctx.canvas.height) || 0;
        const marge = Math.max(largeur, hauteur);
        const elagageActif = largeur > 0 && hauteur > 0;
        let precedentHorsChamp = false;
        // Dernier point écarté par l'élagage, conservé pour raccorder le segment entrant.
        const ancre = this._ancre || (this._ancre = { x: 0, y: 0 });
        let ancreValide = false;

        // Itérer sur tous les points stockés dans l'ordre chronologique.
        // Avec le buffer circulaire (une fois plein), le plus ancien point se trouve à `head`,
        // donc on parcourt depuis `head` en bouclant modulo la longueur.
        const n = this.traces.length;
        const offset = (n >= this.maxPoints) ? this.head : 0;
        for (let k = 0; k < n; k++) {
            const point = this.traces[(offset + k) % n];

            // Si le point est null, cela marque une discontinuité.
            if (point === null) {
                // Terminer le chemin actuel s'il était en cours de dessin
                if (!isNewPath) {
                    ctx.stroke(); // Dessine le segment tracé jusqu'à présent
                    isNewPath = true; // Prépare le début d'un nouveau chemin au prochain point valide
                }
                // Repartir d'un état d'élagage neuf : sans cette remise à zéro, un `precedentHorsChamp`
                // hérité d'AVANT la rupture pouvait faire écarter le premier point valide d'après,
                // donc perdre le premier segment de chaque nouveau tronçon.
                precedentHorsChamp = false;
                ancreValide = false;
                continue; // Passe au point suivant
            }

            // Vérifier que le point a des coordonnées valides avant de continuer
            if (point.x === undefined || point.y === undefined ||
                isNaN(point.x) || isNaN(point.y)) {
                // Terminer le chemin en cours AVANT de repartir à zéro : sans ce stroke(), le
                // beginPath() du point valide suivant jetait tout le tracé accumulé — un seul
                // point invalide effaçait visuellement toute la trace qui le précédait.
                if (!isNewPath) { ctx.stroke(); }
                // Avertissement throttlé : cette boucle tourne à chaque frame sur un anneau de
                // 20 000 points ; un warn non throttlé produisait 60 messages/seconde pendant
                // toute la durée de vie du point (~5 min), ce qui écroule la frame à lui seul.
                this._avertirUneFois("[TraceView] Point de trace invalide ignoré", point);
                isNewPath = true; // Un point invalide force aussi le début d'un nouveau chemin
                precedentHorsChamp = false; // même raison que pour la rupture : repartir d'un élagage neuf
                continue;
            }

            // Conversion monde -> écran SANS allocation : `camera.worldToScreen` crée un objet
            // {x,y} par appel, soit jusqu'à 20 000 objets jetables par frame une fois l'anneau
            // plein (~1,2 M/s à 60 fps). On applique donc la même formule en place.
            screenPos.x = (point.x - camera.x) * camera.zoom + camera.offsetX;
            screenPos.y = (point.y - camera.y) * camera.zoom + camera.offsetY;

            // Vérifier que les coordonnées d'écran résultantes sont valides
            if (isNaN(screenPos.x) || isNaN(screenPos.y)) {
                if (!isNewPath) { ctx.stroke(); } // ne pas jeter le tracé déjà accumulé
                this._avertirUneFois("[TraceView] Coordonnées d'écran invalides après transformation", point);
                isNewPath = true; // Coordonnées écran invalides forcent un nouveau chemin
                precedentHorsChamp = false; // idem : ne pas hériter d'un état d'élagage d'avant la rupture
                continue;
            }

            // Élagage : un point hors de la fenêtre élargie n'est soumis au rasteriseur que s'il
            // est le premier de sa série (segment sortant) ou s'il précède un point visible
            // (segment entrant, traité au tour suivant via `precedentHorsChamp`). Deux points
            // consécutifs hors champ ne peuvent pas produire de segment visible : on rompt le
            // chemin plutôt que d'empiler des lineTo à des coordonnées atteignant ±7e5 px.
            const horsChamp = elagageActif && (
                screenPos.x < -marge || screenPos.x > largeur + marge ||
                screenPos.y < -marge || screenPos.y > hauteur + marge
            );
            if (horsChamp && precedentHorsChamp) {
                if (!isNewPath) { ctx.stroke(); isNewPath = true; }
                // Mémoriser ce point comme ANCRE : s'il est suivi d'un point visible, le segment
                // qui entre à l'écran doit être tracé depuis lui. Sans cette ancre, l'élagage
                // supprimait le segment entrant (le point visible démarrait un moveTo isolé) —
                // le tracé semblait « sauter » le bord de l'écran.
                ancre.x = screenPos.x; ancre.y = screenPos.y; ancreValide = true;
                continue;
            }
            precedentHorsChamp = horsChamp;

            // Reprendre depuis l'ancre élaguée pour dessiner le segment entrant.
            if (isNewPath && ancreValide) {
                ctx.beginPath();
                ctx.moveTo(ancre.x, ancre.y);
                isNewPath = false;
            }
            ancreValide = false;

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
        // Insérer une discontinuité en RÉAFFICHANT la trace : pendant qu'elle était masquée,
        // update() ignorait les nouveaux points sans toucher à `lastPoint`. Le premier point
        // enregistré après réaffichage était donc relié en ligne droite au dernier point d'avant
        // le masquage — un trajet que la fusée n'a jamais parcouru (ex : Terre → Mars en droite
        // ligne). `clear(false)` pose un `null` (marqueur de rupture) et remet `lastPoint` à zéro.
        if (this.isVisible && typeof this.clear === 'function') {
            this.clear(false);
        }
        return this.isVisible;
    }

    /**
     * Avertissement throttlé : cette méthode est appelée depuis la boucle de rendu, qui parcourt
     * jusqu'à 20 000 points 60 fois par seconde. Un `console.warn` direct y produirait des
     * milliers de messages par seconde et effondrerait la frame à lui seul.
     * @param {string} message
     * @param {*} [detail]
     * @private
     */
    _avertirUneFois(message, detail) {
        if (!this._avertissementsVus) this._avertissementsVus = new Set();
        if (this._avertissementsVus.has(message)) return;
        this._avertissementsVus.add(message);
        console.warn(message, detail);
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
            this.head = 0;
            this.lastPoint = null;
        } else {
            // Ajouter un point null pour créer une discontinuité dans la trace
            // Cela permet de séparer visuellement différentes phases ou trajectoires.
            // Respecter le buffer circulaire et réinitialiser lastPoint pour que le
            // prochain point ne soit pas filtré par rapport à l'autre côté de la coupure.
            if (this.traces.length < this.maxPoints) {
                this.traces.push(null);
            } else {
                this.traces[this.head] = null;
                this.head = (this.head + 1) % this.maxPoints;
            }
            this.lastPoint = null;
        }
    }
} 