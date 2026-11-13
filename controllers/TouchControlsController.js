/**
 * @file Commandes tactiles à l'écran (tablettes, téléphones).
 *
 * Construit une surcouche HTML de boutons semi-transparents au-dessus du canvas et la branche sur
 * le MÊME chemin que le clavier : aucune logique de pilotage n'est dupliquée ici.
 *  - commandes MAINTENUES (poussée, rétro, rotations) -> `InputController.appuyerCommande()` /
 *    `relacherCommande()`, qui alimentent `activeKeyActions` et émettent les mêmes
 *    `ROCKET_*_START` / `_STOP` que les touches ;
 *  - boutons PONCTUELS (T, G, V, C, pause, recommencer, zoom) ->
 *    `InputController.executerActionPonctuelle()`, comme au relâchement d'une touche.
 * Le zoom par pincement et le glissement de la vue à un doigt sont gérés par
 * `InputController.initTouchEvents()` (doigts posés sur le canvas).
 *
 * Affichage : automatique sur un appareil dont le pointeur principal est tactile
 * (`(pointer: coarse)`) ou dès le premier appui au doigt ; masqué sur un ordinateur à souris.
 * Le bouton ✋ (à côté de ⚙️) affiche/masque les commandes à tout moment ; ce choix manuel
 * l'emporte ensuite sur la détection automatique. Rien n'est enregistré ni transmis.
 */
class TouchControlsController {
    /**
     * Disposition des commandes. `action` = nom d'action de `InputController.DEFAULT_KEY_MAP`.
     * ⚠️ Rotation : on reprend la correspondance du CLAVIER. La flèche ← déclenche l'action
     * `rotateRight` (propulseur latéral droit) qui fait tourner la fusée dans le sens inverse des
     * aiguilles d'une montre à l'écran ; la flèche → déclenche `rotateLeft` (sens horaire).
     * Les boutons ↺ / ↻ décrivent donc l'effet VISIBLE, comme les flèches.
     * @static
     */
    static COMMANDES = {
        rotation: [
            { id: 'tactile-tourner-gauche', action: 'rotateRight', symbole: '↺', legende: 'Tourner', titre: 'Tourner à gauche (comme la flèche ←), maintenir' },
            { id: 'tactile-tourner-droite', action: 'rotateLeft', symbole: '↻', legende: 'Tourner', titre: 'Tourner à droite (comme la flèche →), maintenir' }
        ],
        poussee: [
            { id: 'tactile-poussee', action: 'thrustForward', symbole: '▲', legende: 'Poussée', titre: 'Propulsion principale (comme ↑ ou W), maintenir' },
            { id: 'tactile-retro', action: 'thrustBackward', symbole: '▼', legende: 'Rétro', titre: 'Propulsion arrière (comme ↓ ou S), maintenir' }
        ],
        outils: [
            { id: 'tactile-trajectoire', action: 'toggleTraces', symbole: 'T', legende: 'Trajectoire', titre: 'Afficher/cacher la trajectoire (T)' },
            { id: 'tactile-gravite', action: 'toggleGravityField', symbole: 'G', legende: 'Gravité', titre: 'Champ de gravité : flèches, lignes, rien (G)' },
            { id: 'tactile-vecteurs', action: 'toggleVectors', symbole: 'V', legende: 'Vecteurs', titre: 'Afficher/cacher les vecteurs (V)' },
            { id: 'tactile-centrer', action: 'centerCamera', symbole: 'C', legende: 'Centrer', titre: 'Centrer la caméra sur la fusée (C)' },
            { id: 'tactile-zoom-moins', action: 'zoomOut', symbole: '−', legende: 'Zoom', titre: 'Zoom arrière (−), maintenir pour répéter', repetition: true },
            { id: 'tactile-zoom-plus', action: 'zoomIn', symbole: '+', legende: 'Zoom', titre: 'Zoom avant (+), maintenir pour répéter', repetition: true },
            { id: 'tactile-pause', action: 'pauseGame', symbole: 'Ⅱ', legende: 'Pause', titre: 'Pause / reprendre (P)' },
            { id: 'tactile-recommencer', action: 'resetRocket', symbole: 'R', legende: 'Recommencer', titre: 'Recommencer : replacer la fusée (R)' }
        ]
    };

    /** Intervalle de répétition des boutons de zoom maintenus (ms). @static */
    static REPETITION_MS = 120;

    /**
     * @param {EventBus} eventBus
     * @param {InputController} inputController - chemin commun des commandes.
     */
    constructor(eventBus, inputController) {
        this.eventBus = eventBus;
        this.inputController = inputController;

        /** Commandes maintenues : action -> Set des pointerId appuyés. @private */
        this._pointeursParAction = new Map();
        /** Boutons à répétition en cours : pointerId -> id de setInterval. @private */
        this._repetitions = new Map();
        /** L'utilisateur a choisi lui-même (bouton ✋) : plus de bascule automatique. */
        this.choixManuel = false;
        /** Commandes demandées (auto ou manuel). */
        this.visible = false;
        /** Une partie est lancée (écran de démarrage refermé). */
        this.partieEnCours = false;
        /** Dernier type de pointeur posé sur le canvas (menu contextuel tactile). @private */
        this._dernierPointeurCanvas = '';

        this._construireInterface();
        this._installerEcouteursGlobaux();

        const tactilePrincipal = TouchControlsController.pointeurPrincipalTactile();
        this.definirVisible(tactilePrincipal, false);
    }

    /**
     * Le pointeur principal de l'appareil est-il un doigt ? (tablette, téléphone)
     * Un ordinateur portable à écran tactile répond « non » : ses commandes n'apparaissent
     * qu'au premier vrai appui au doigt.
     * @returns {boolean}
     */
    static pointeurPrincipalTactile() {
        try {
            return !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
        } catch (e) {
            return false;
        }
    }

    /**
     * Ajoute un écouteur et confie son retrait au ControllerContainer (même convention
     * qu'InputController).
     * @private
     */
    _ecouter(cible, type, fn, options) {
        cible.addEventListener(type, fn, options);
        if (window.controllerContainer && typeof window.controllerContainer.track === 'function') {
            window.controllerContainer.track(() => cible.removeEventListener(type, fn, options));
        }
    }

    /** @private */
    _construireInterface() {
        const racine = document.createElement('div');
        racine.id = 'commandesTactiles';
        racine.setAttribute('aria-label', 'Commandes tactiles');

        const groupe = (classe, liste, fabrique) => {
            const g = document.createElement('div');
            g.className = 'groupe-tactile ' + classe;
            liste.forEach((def) => g.appendChild(fabrique(def)));
            racine.appendChild(g);
            return g;
        };
        groupe('groupe-rotation', TouchControlsController.COMMANDES.rotation, (d) => this._creerBoutonMaintenu(d, 'bouton-rotation'));
        groupe('groupe-poussee', TouchControlsController.COMMANDES.poussee, (d) => this._creerBoutonMaintenu(d, d.action === 'thrustForward' ? 'bouton-poussee' : 'bouton-retro'));
        groupe('barre-outils', TouchControlsController.COMMANDES.outils, (d) => this._creerBoutonPonctuel(d));

        // Pas de menu contextuel ni de sélection sur appui long, pas de double-tap zoom.
        this._ecouter(racine, 'contextmenu', (e) => e.preventDefault());
        this._ecouter(racine, 'selectstart', (e) => e.preventDefault());
        document.body.appendChild(racine);
        this.racine = racine;

        // Bouton ✋ : à côté de ⚙️ (toujours visible, y compris sur ordinateur).
        const bascule = document.createElement('button');
        bascule.id = 'basculeTactile';
        bascule.type = 'button';
        bascule.textContent = '✋';
        bascule.title = 'Afficher / masquer les commandes tactiles';
        bascule.setAttribute('aria-label', 'Afficher ou masquer les commandes tactiles');
        bascule.setAttribute('tabindex', '-1');
        // Activation au RELÂCHEMENT du pointeur sur le bouton, comme les boutons ponctuels : le
        // `click` n'est pas fiable au doigt quand un autre doigt est déjà posé (Chrome ne
        // synthétise pas de « tap » pour un second doigt — mesuré au banc : ✋ touché pendant
        // que le pouce tenait ▲ restait sans effet). pointerdown + preventDefault : pas de
        // focus (la barre Espace doit rester au jeu) et pas d'événements souris émulés.
        const pointeursBascule = new Set();
        this._ecouter(bascule, 'pointerdown', (e) => {
            if (e.pointerType === 'mouse' && e.button !== 0) return;
            e.preventDefault();
            try { bascule.setPointerCapture(e.pointerId); } catch (err) { /* ignoré */ }
            pointeursBascule.add(e.pointerId);
        });
        this._ecouter(bascule, 'pointerup', (e) => {
            if (!pointeursBascule.delete(e.pointerId)) return;
            const r = bascule.getBoundingClientRect();
            if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return;
            this.choixManuel = true;
            this.definirVisible(!this.visible, true);
        });
        const oublier = (e) => { pointeursBascule.delete(e.pointerId); };
        this._ecouter(bascule, 'pointercancel', oublier);
        this._ecouter(bascule, 'lostpointercapture', oublier);
        // Le clic qui suit éventuellement ne doit pas remonter jusqu'au document (fermeture
        // du panneau d'options) ni basculer une seconde fois.
        this._ecouter(bascule, 'click', (e) => { e.stopPropagation(); });
        const zoneAudio = document.getElementById('audioControls');
        if (zoneAudio) {
            zoneAudio.insertBefore(bascule, zoneAudio.firstChild);
        } else {
            bascule.classList.add('bascule-seule');
            document.body.appendChild(bascule);
        }
        this.boutonBascule = bascule;
    }

    /**
     * Contenu commun d'un bouton : grand symbole + légende courte.
     * @private
     */
    _creerBouton(def, classe) {
        const b = document.createElement('button');
        b.type = 'button';
        b.id = def.id;
        b.className = 'bouton-tactile ' + (classe || '');
        b.dataset.action = def.action;
        b.title = def.titre;
        b.setAttribute('aria-label', def.titre);
        b.setAttribute('tabindex', '-1'); // le clavier a ses propres touches ; garder Espace au jeu
        const s = document.createElement('span');
        s.className = 'symbole';
        s.textContent = def.symbole;
        const l = document.createElement('span');
        l.className = 'legende';
        l.textContent = def.legende;
        b.appendChild(s);
        b.appendChild(l);
        return b;
    }

    /**
     * Bouton MAINTENU : la commande dure tant qu'un doigt (ou le bouton gauche de la souris)
     * reste appuyé. Chaque doigt est suivi par son pointerId : plusieurs doigts peuvent agir en
     * même temps sur des boutons différents (poussée + rotation).
     * @private
     */
    _creerBoutonMaintenu(def, classe) {
        const b = this._creerBouton(def, classe);
        const action = def.action;
        if (!this._pointeursParAction.has(action)) this._pointeursParAction.set(action, new Set());

        this._ecouter(b, 'pointerdown', (e) => {
            if (e.pointerType === 'mouse' && e.button !== 0) return;
            e.preventDefault(); // ni focus, ni souris émulée, ni geste du navigateur
            try { b.setPointerCapture(e.pointerId); } catch (err) { /* pointeur déjà relâché */ }
            const pointeurs = this._pointeursParAction.get(action);
            const etaitLibre = pointeurs.size === 0;
            pointeurs.add(e.pointerId);
            if (etaitLibre) {
                b.classList.add('actif');
                this.inputController.appuyerCommande(action);
            }
        });
        const fin = (e) => {
            const pointeurs = this._pointeursParAction.get(action);
            if (!pointeurs.delete(e.pointerId)) return;
            if (pointeurs.size === 0) {
                b.classList.remove('actif');
                this.inputController.relacherCommande(action);
            }
        };
        this._ecouter(b, 'pointerup', fin);
        this._ecouter(b, 'pointercancel', fin);
        this._ecouter(b, 'lostpointercapture', fin);
        return b;
    }

    /**
     * Bouton PONCTUEL : l'action part quand le doigt se lève SUR le bouton (glisser hors du
     * bouton annule). Les boutons de zoom agissent dès l'appui et se répètent si on maintient.
     * @private
     */
    _creerBoutonPonctuel(def) {
        const b = this._creerBouton(def, 'bouton-outil');
        const enCours = new Set();

        this._ecouter(b, 'pointerdown', (e) => {
            if (e.pointerType === 'mouse' && e.button !== 0) return;
            e.preventDefault();
            try { b.setPointerCapture(e.pointerId); } catch (err) { /* ignoré */ }
            enCours.add(e.pointerId);
            b.classList.add('actif');
            if (def.repetition) {
                this.inputController.executerActionPonctuelle(def.action);
                this._arreterRepetition(e.pointerId);
                this._repetitions.set(e.pointerId, setInterval(() => {
                    this.inputController.executerActionPonctuelle(def.action);
                }, TouchControlsController.REPETITION_MS));
            }
        });
        const terminer = (e, valider) => {
            if (!enCours.delete(e.pointerId)) return;
            if (enCours.size === 0) b.classList.remove('actif');
            if (def.repetition) {
                this._arreterRepetition(e.pointerId);
                return;
            }
            if (!valider) return;
            const r = b.getBoundingClientRect();
            const dedans = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
            if (dedans) this.inputController.executerActionPonctuelle(def.action);
        };
        this._ecouter(b, 'pointerup', (e) => terminer(e, true));
        this._ecouter(b, 'pointercancel', (e) => terminer(e, false));
        this._ecouter(b, 'lostpointercapture', (e) => terminer(e, false));
        return b;
    }

    /** @private */
    _arreterRepetition(pointerId) {
        const t = this._repetitions.get(pointerId);
        if (t !== undefined) {
            clearInterval(t);
            this._repetitions.delete(pointerId);
        }
    }

    /**
     * Relâche TOUTES les commandes tactiles (perte de focus, onglet masqué, interface masquée,
     * reset de la fusée). Émet les _STOP nécessaires via InputController.
     */
    relacherTout() {
        for (const [action, pointeurs] of this._pointeursParAction) {
            if (pointeurs.size > 0) {
                pointeurs.clear();
                this.inputController.relacherCommande(action);
            }
        }
        for (const id of Array.from(this._repetitions.keys())) this._arreterRepetition(id);
        if (this.racine) {
            this.racine.querySelectorAll('.bouton-tactile.actif').forEach((b) => b.classList.remove('actif'));
        }
    }

    /** @private */
    _installerEcouteursGlobaux() {
        // Perte de focus / onglet masqué : les pointerup ne nous parviendront pas.
        this._ecouter(window, 'blur', () => this.relacherTout());
        this._ecouter(window, 'pagehide', () => this.relacherTout());
        this._ecouter(document, 'visibilitychange', () => {
            if (document.visibilityState === 'hidden') this.relacherTout();
        });

        // Premier appui AU DOIGT : afficher les commandes (sauf choix contraire de l'utilisateur).
        this._ecouter(window, 'pointerdown', (e) => {
            if (e.pointerType === 'touch' && !this.choixManuel && !this.visible) {
                this.definirVisible(true, false);
            }
            if (e.target && e.target.id === 'gameCanvas') this._dernierPointeurCanvas = e.pointerType;
        }, true);

        // Appui long sur le canvas au doigt : pas de menu « Enregistrer l'image ». Le clic droit
        // de la souris garde son comportement habituel.
        const canvas = document.getElementById('gameCanvas');
        if (canvas) {
            this._ecouter(canvas, 'contextmenu', (e) => {
                if (this._dernierPointeurCanvas === 'touch' || this._dernierPointeurCanvas === 'pen') e.preventDefault();
            });
        }
        // Safari iOS : empêcher le zoom de la PAGE par pincement (le pincement zoome la caméra).
        this._ecouter(document, 'gesturestart', (e) => e.preventDefault(), { passive: false });

        if (this.eventBus && window.EVENTS) {
            const suivre = (unsub) => {
                if (window.controllerContainer && typeof window.controllerContainer.track === 'function') {
                    window.controllerContainer.track(unsub);
                }
            };
            // Le reset purge déjà les commandes dans InputController ; on resynchronise l'affichage.
            if (EVENTS.ROCKET && EVENTS.ROCKET.RESET) {
                suivre(this.eventBus.subscribe(EVENTS.ROCKET.RESET, () => this.relacherTout()));
            }
            // Les commandes n'apparaissent qu'une fois l'écran de démarrage refermé.
            if (EVENTS.UNIVERSE && EVENTS.UNIVERSE.RELOAD_COMPLETED) {
                suivre(this.eventBus.subscribe(EVENTS.UNIVERSE.RELOAD_COMPLETED, () => {
                    this.partieEnCours = true;
                    this._appliquerAffichage();
                }));
            }
        }
    }

    /**
     * Affiche ou masque les commandes tactiles.
     * @param {boolean} visible
     * @param {boolean} [manuel=false] - vient du bouton ✋
     */
    definirVisible(visible, manuel = false) {
        this.visible = !!visible;
        if (manuel) this.choixManuel = true;
        if (!this.visible) this.relacherTout();
        this._appliquerAffichage();
    }

    /** @private */
    _appliquerAffichage() {
        const affiche = this.visible && this.partieEnCours;
        document.body.classList.toggle('commandes-tactiles', affiche);
        if (this.boutonBascule) {
            this.boutonBascule.setAttribute('aria-pressed', this.visible ? 'true' : 'false');
            this.boutonBascule.classList.toggle('actif', this.visible);
        }
        // Lu par UIView pour adapter les consignes (« touchez R » plutôt que « appuyez sur R »).
        if (typeof window.UI_STATE === 'undefined') window.UI_STATE = {};
        window.UI_STATE.commandesTactiles = affiche;
    }
}
