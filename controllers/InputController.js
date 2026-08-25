/**
 * @file Gère toutes les entrées utilisateur : clavier, souris, tactile et joystick.
 * S'abonne aux événements du DOM et émet des événements sémantiques via l'EventBus
 * pour découpler la gestion des entrées de la logique de jeu.
 */
class InputController {
    /**
     * Mappage par défaut des touches du clavier aux actions du jeu.
     * Utilisé pour initialiser `this.keyMap` et pour la réinitialisation.
     * @type {Object<string, string>}
     * @property {string} ArrowUp - Action pour la flèche du haut.
     * @property {string} KeyW - Action pour la touche W.
     * @property {string} ArrowDown - Action pour la flèche du bas.
     * @property {string} KeyS - Action pour la touche S.
     * @property {string} ArrowLeft - Action pour la flèche de gauche.
     * @property {string} KeyD - Action pour la touche D.
     * @property {string} ArrowRight - Action pour la flèche de droite.
     * @property {string} KeyA - Action pour la touche A.
     * @property {string} Space - Action pour la barre d'espace.
     * @property {string} Equal - Action pour la touche égal.
     * @property {string} Minus - Action pour la touche moins.
     * @property {string} KeyR - Action pour la touche R.
     * @property {string} KeyC - Action pour la touche C.
     * @property {string} KeyV - Action pour la touche V.
     * @property {string} KeyG - Action pour la touche G.
     * @property {string} KeyT - Action pour la touche T.
     * @property {string} KeyI - Action pour la touche I.
     * @property {string} KeyP - Action pour la touche P.
     * @property {string} Escape - Action pour la touche Échap.
     * @property {string} KeyM - Action pour la touche M.
     * @property {string} KeyN - Action pour la touche N.
     * @static
     * @constant
     */
    static DEFAULT_KEY_MAP = {
        // Fusée - Mouvement continu
        'ArrowUp': 'thrustForward',
        'KeyW': 'thrustForward',
        'ArrowDown': 'thrustBackward',
        'KeyS': 'thrustBackward',
        'ArrowLeft': 'rotateRight', // Note: ArrowLeft -> rotateRight (fusée tourne à droite)
        'KeyD': 'rotateRight',
        'ArrowRight': 'rotateLeft', // Note: ArrowRight -> rotateLeft (fusée tourne à gauche)
        'KeyA': 'rotateLeft',
        'Space': 'boost', // Alias pour thrustForward

        // Caméra - Actions répétées si maintenues ou via molette
        'Equal': 'zoomIn',
        'Minus': 'zoomOut',
        // Plus tard, si on ajoute + et - du numpad :
        // 'NumpadAdd': 'zoomIn',
        // 'NumpadSubtract': 'zoomOut',

        // Actions "coup unique" (déclenchées sur keyup)
        'KeyR': 'resetRocket',
        'KeyC': 'centerCamera',
        'KeyV': 'toggleVectors',
        'KeyG': 'toggleGravityField',
        'KeyT': 'toggleTraces',
        'KeyI': 'toggleAI',
        'KeyP': 'pauseGame',
        'Escape': 'pauseGame',
        'KeyM': 'decreaseThrustMultiplier',
        'KeyN': 'increaseThrustMultiplier', // Nouvelle touche pour augmenter
        // Aide au pilotage (stabilisation automatique de la rotation). La fonctionnalité était
        // annoncée dans le README mais INATTEIGNABLE : son seul déclencheur était un test sur
        // `gameController.shouldToggleAssistedControlsOnClick`, propriété jamais affectée.
        'KeyH': 'toggleAssistedControls',
    };

    /**
     * Crée une instance de InputController.
     * @param {EventBus} eventBus - L'instance de l'EventBus pour la communication entre modules.
     */
    constructor(eventBus) {
        console.log(`[InputController] 🔵 CONSTRUCTEUR APPELÉ`);
        // Référence à l'EventBus
        this.eventBus = eventBus;
        
        /**
         * Ensemble des actions clavier continues actuellement actives.
         * Utilisé pour éviter la répétition des événements _START lors d'un appui maintenu.
         * @type {Set<string>}
         * @private
         */
        this.activeKeyActions = new Set();
        
        /**
         * Indique si un glissement avec la souris est en cours.
         * @type {boolean}
         * @private
         */
        this.isMouseDragging = false;
        
        /**
         * Indique si un glissement tactile est en cours.
         * @type {boolean}
         * @private
         */
        this.isTouchDragging = false;
        
        /**
         * Référence à l'objet Gamepad actuellement utilisé.
         * Null si aucun gamepad n'est connecté ou actif.
         * @type {?Gamepad}
         * @private
         */
        this.gamepad = null;
        
        /**
         * État actuel des axes et boutons du gamepad.
         * @type {{axes: number[], buttons: Array<{pressed: boolean, value: number}>}}
         * @property {number[]} axes - Valeurs actuelles des axes du gamepad.
         * @property {Array<{pressed: boolean, value: number}>} buttons - États actuels des boutons du gamepad.
         * @private
         */
        this.gamepadState = {
            axes: [],
            buttons: []
        };
        /**
         * Indique si le message "Aucun gamepad connecté" a déjà été loggué.
         * Initialisé ici pour éviter un état indéfini avant toute connexion de gamepad.
         * @type {boolean}
         * @private
         */
        this.noGamepadLogged = false;
        /**
         * Mappage sémantique des axes et boutons du joystick aux actions du jeu.
         * @type {{axes: Object<number, string>, buttons: Object<number, string>}}
         * @property {Object<number, string>} axes - Mappage des index d'axes aux noms d'actions.
         * @property {Object<number, string>} buttons - Mappage des index de boutons aux noms d'actions.
         * @private
         */
        this.gamepadMap = {
            axes: { // Ces actions sont gérées par GameController via EVENTS.INPUT.JOYSTICK_*
                0: 'rotate', 
                3: 'zoomAxis',
            },
            buttons: { // Ces actions émettront des événements sémantiques directs
                0: 'boost',             // Ex: Xbox A / PS Cross
                1: 'actionB',           // Ex: Xbox B / PS Circle (non mappé pour l'instant)
                2: 'actionX',           // Ex: Xbox X / PS Square (non mappé pour l'instant)
                3: 'thrustBackward',    // Ex: Xbox Y / PS Triangle
                4: 'toggleTraces',      // Ex: Xbox LB / PS L1
                5: 'toggleVectors',     // Ex: Xbox RB / PS R1
                6: 'zoomOutButton',     // Ex: Xbox LT / PS L2 (si axe utilisé comme bouton, ou bouton dédié)
                7: 'zoomInButton',      // Ex: Xbox RT / PS R2 (si axe utilisé comme bouton, ou bouton dédié)
                8: 'centerCamera',      // Ex: Xbox View/Back / PS Select
                9: 'pauseGame',         // Ex: Xbox Menu / PS Start
                10: 'resetRocket',      // Ex: Bouton Stick Gauche Press
                11: 'centerCamera',     // Bouton Stick Droit Press (R3) pour centrer la caméra
                // D-pad (peut être axes ou boutons selon le gamepad)
                // 12: 'thrustForward', // D-pad Up
                // 13: 'thrustBackward',// D-pad Down
                // 14: 'rotateLeft', // D-pad Left
                // 15: 'rotateRight', // D-pad Right
            }
        };
        /**
         * Seuil de sensibilité pour les axes du joystick.
         * Les valeurs d'axe inférieures (en valeur absolue) à ce seuil sont considérées comme neutres.
         * @type {number}
         * @private
         */
        this.axisThreshold = 0.1;
        /**
         * Zone morte dédiée à l'axe de zoom : une dérive résiduelle du stick ne doit produire
         * AUCUN zoom (au seuil général de 0,1, une manette usée emmenait la vue au zoom minimal
         * toute seule en ~3 s).
         * @type {number}
         * @private
         */
        this.zoomAxisThreshold = 0.25;
        /**
         * Stocke les valeurs des axes qui sont actuellement maintenus au-delà du seuil.
         * @type {Object<number, number>}
         * @private
         */
        this.heldAxes = {}; 
        
        /**
         * Mappage actuel des touches du clavier aux actions du jeu.
         * Initialisé avec `DEFAULT_KEY_MAP` et peut être modifié dynamiquement.
         * @type {Object<string, string>}
         */
        this.keyMap = { ...InputController.DEFAULT_KEY_MAP };
        
        // Lier les gestionnaires pour pouvoir les désabonner
        this._boundKeyDown = this.handleKeyDown.bind(this);
        this._boundKeyUp = this.handleKeyUp.bind(this);
        this._boundWheel = this.handleWheel.bind(this);
        
        /**
         * Stocke les gestionnaires d'événements de la souris pour un éventuel nettoyage.
         * @type {Object<string, Function>}
         * @private
         */
        this._mouseHandlers = {}; 
        /**
         * Stocke les gestionnaires d'événements tactiles pour un éventuel nettoyage.
         * @type {Object<string, Function>}
         * @private
         */
        this._touchHandlers = {}; 
        /**
         * Stocke les gestionnaires d'événements du gamepad pour un éventuel nettoyage.
         * @type {Object<string, Function>}
         * @private
         */
        this._gamepadHandlers = {};
        
        /**
         * Drapeau indiquant si les événements du clavier ont déjà été initialisés.
         * Empêche les initialisations multiples.
         * @type {boolean}
         * @private
         */
        this._keyboardEventsInitialized = false; // Nouveau drapeau
        
        // Initialiser les événements du clavier, souris, tactile et joystick
        console.log(`[InputController] Initialisation des événements clavier/souris/tactile/gamepad`);
        this.initKeyboardEvents();
        this.initMouseEvents(); // Renommé pour clarté
        this.initTouchEvents(); // Renommé pour clarté
        this.initGamepadEvents();

        // Lors d'un reset de la fusée, RocketModel remet les propulseurs à 0 mais notre
        // état d'entrée (activeKeyActions) conserve les touches maintenues : aucun nouveau
        // START n'est alors émis et le propulseur reste "fantôme" à 0. On purge donc l'état
        // d'entrée (et on émet les STOP correspondants) pour resynchroniser entrées et modèle.
        if (this.eventBus && typeof this.eventBus.subscribe === 'function') {
            const _unsubReset = this.eventBus.subscribe(EVENTS.ROCKET.RESET, () => this._releaseAllActiveActions());
            if (window.controllerContainer && typeof window.controllerContainer.track === 'function') {
                window.controllerContainer.track(_unsubReset);
            }
        }

        console.log(`[InputController] ✅ Événements initialisés, keyMap contient ${Object.keys(this.keyMap).length} touches`);
    }
    
    /**
     * Ajoute un écouteur d'événement à une cible et enregistre sa suppression
     * via `window.controllerContainer.track` si disponible, pour faciliter le nettoyage.
     * @private
     * @param {EventTarget} target - La cible de l'événement (ex: window, document.body, un élément HTML).
     * @param {string} type - Le type d'événement (ex: 'keydown', 'mousedown', 'touchstart').
     * @param {Function} listener - La fonction à appeler lorsque l'événement se produit.
     * @param {(Object|boolean)} [options={}] - Options pour l'écouteur d'événement (ex: { passive: false }).
     */
    /**
     * La cible d'un événement pointeur appartient-elle à la zone de jeu (canvas) ?
     * Les écouteurs de panoramique sont posés sur `window` afin de continuer à recevoir les
     * mousemove/mouseup même lorsque le pointeur sort du canvas ; ce filtre garantit qu'un
     * panoramique ne DÉMARRE que depuis le canvas, et pas depuis les contrôles HTML de la page.
     * @param {EventTarget} cible
     * @returns {boolean}
     * @private
     */
    /**
     * Le jeu doit-il laisser CETTE touche à l'élément qui a le focus ?
     *
     * Deux familles de contrôles, à traiter différemment :
     *  - Saisie/liste (`input` texte, `textarea`, `select`, zone éditable) : ils consomment
     *    réellement le clavier (lettres, flèches). On leur laisse TOUTES les touches, sinon le
     *    sélecteur de monde de l'écran de démarrage ne peut pas être piloté au clavier.
     *  - Activation (`button`, case à cocher, radio) : ils ne consomment qu'Espace et Entrée.
     *    Tout bloquer pour eux était une RÉGRESSION : un bouton garde le focus après un clic,
     *    donc cliquer sur ⚙️, sur le bouton son ou sur une case à cocher rendait ensuite le
     *    clavier du jeu totalement inopérant jusqu'à un clic sur le canvas.
     * @param {EventTarget} cible - `event.target`
     * @param {KeyboardEvent} evenement
     * @returns {boolean} true si la touche appartient à l'élément focalisé, pas au jeu.
     * @private
     */
    _estSaisieUtilisateur(cible, evenement) {
        if (!cible) return false;
        if (cible.isContentEditable === true) return true;
        if (!cible.tagName) return false;

        const tag = String(cible.tagName).toUpperCase();
        const type = cible.type ? String(cible.type).toLowerCase() : '';

        // Contrôles d'ACTIVATION : seules Espace/Entrée leur reviennent.
        const estActivation = (tag === 'BUTTON')
            || (tag === 'INPUT' && ['checkbox', 'radio', 'button', 'submit', 'reset', 'image', 'file'].includes(type));
        if (estActivation) {
            const code = evenement && (evenement.code || evenement.key);
            return code === 'Space' || code === ' ' || code === 'Enter' || code === 'NumpadEnter';
        }

        // Contrôles de SAISIE / LISTE : tout leur revient.
        return tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || tag === 'OPTION';
    }

    _estCibleCanvas(cible) {
        if (!cible) return false;
        if (typeof HTMLCanvasElement !== 'undefined' && cible instanceof HTMLCanvasElement) return true;
        // Repli sans dépendre du constructeur (contextes de test / DOM partiels)
        return !!(cible.tagName && String(cible.tagName).toUpperCase() === 'CANVAS');
    }

    _addTrackedEventListener(target, type, listener, options = {}) {
        target.addEventListener(type, listener, options);
        // Assure la suppression de l'écouteur lors du nettoyage du contrôleur
        if (window.controllerContainer && typeof window.controllerContainer.track === 'function') {
            window.controllerContainer.track(() => target.removeEventListener(type, listener, options));
        } else {
            console.warn('[InputController] window.controllerContainer.track non disponible. Le nettoyage des écouteurs pourrait être incomplet.');
        }
    }
    
    /**
     * Initialise les écouteurs d'événements pour le clavier (keydown, keyup) et la molette de la souris (wheel).
     * S'assure que l'initialisation n'a lieu qu'une seule fois grâce au drapeau `_keyboardEventsInitialized`.
     */
    initKeyboardEvents() {
        if (this._keyboardEventsInitialized) {
            console.log(`[InputController] ⚠️ initKeyboardEvents déjà appelé, ignoré`);
            return;
        }
        console.log(`[InputController] Attachement des listeners clavier (keydown, keyup, wheel)`);
        this._addTrackedEventListener(window, 'keydown', this._boundKeyDown);
        this._addTrackedEventListener(window, 'keyup', this._boundKeyUp);
        this._addTrackedEventListener(window, 'wheel', this._boundWheel, { passive: false }); // passive: false pour preventDefault sur le zoom
        // Si le focus est perdu (alt-tab, clic hors fenêtre…), les keyup ne nous parviennent pas :
        // on relâche explicitement toutes les actions continues pour éviter les propulseurs bloqués en ON.
        this._addTrackedEventListener(window, 'blur', () => this._releaseAllActiveActions());

        this._keyboardEventsInitialized = true;
        console.log(`[InputController] ✅ Listeners clavier attachés`);
    }

    _releaseAllActiveActions() {
        // Annuler aussi un panoramique en cours : les écouteurs vivent sur `window`, donc un
        // alt-tab (ou un relâchement au-dessus de l'interface du navigateur) ne produit aucun
        // mouseup/touchend. Sans cela, au retour dans l'onglet, bouger la souris continuait à
        // faire glisser la caméra comme si le bouton était toujours enfoncé.
        if (this.isMouseDragging || this.isTouchDragging) {
            this.isMouseDragging = false;
            this.isTouchDragging = false;
            if (this.eventBus && EVENTS.CAMERA && EVENTS.CAMERA.STOP_DRAG) {
                this.eventBus.emit(EVENTS.CAMERA.STOP_DRAG);
            }
        }

        if (this.activeKeyActions && this.activeKeyActions.size > 0) {
            const stopEventByAction = {
                thrustForward: EVENTS.ROCKET.THRUST_FORWARD_STOP,
                boost: EVENTS.ROCKET.THRUST_FORWARD_STOP,
                thrustBackward: EVENTS.ROCKET.THRUST_BACKWARD_STOP,
                rotateLeft: EVENTS.ROCKET.ROTATE_LEFT_STOP,
                rotateRight: EVENTS.ROCKET.ROTATE_RIGHT_STOP,
            };
            for (const actionKey of this.activeKeyActions) {
                // Les clés clavier utilisent '-' (action-code), les clés gamepad utilisent '_'
                // (ex: 'thrustForward_gamepad_boost'). On extrait le nom d'action avant le
                // premier séparateur rencontré, quel qu'il soit, pour relâcher les deux types.
                const dashIdx = actionKey.indexOf('-');
                const underscoreIdx = actionKey.indexOf('_');
                let sepIdx = -1;
                if (dashIdx >= 0 && underscoreIdx >= 0) {
                    sepIdx = Math.min(dashIdx, underscoreIdx);
                } else {
                    sepIdx = dashIdx >= 0 ? dashIdx : underscoreIdx;
                }
                const actionName = sepIdx >= 0 ? actionKey.slice(0, sepIdx) : actionKey;
                const stopEvent = stopEventByAction[actionName];
                if (stopEvent) this.eventBus.emit(stopEvent);
            }
            this.activeKeyActions.clear();
        }

        // Régression gamepad : après avoir vidé activeKeyActions et émis les STOP, l'état
        // mémorisé des boutons (gamepadState.buttons[i].pressed) reste à `true` pour un
        // bouton physiquement maintenu. Au prochain update(), pressed === wasPressed → aucun
        // front montant → START jamais ré-émis → propulseur bloqué OFF. On réinitialise donc
        // l'état mémorisé : le prochain update() verra un front montant pour les boutons
        // encore tenus et ré-émettra START. Le clavier n'est pas concerné (keyup le gère).
        if (this.gamepadState && Array.isArray(this.gamepadState.buttons)) {
            for (let i = 0; i < this.gamepadState.buttons.length; i++) {
                if (this.gamepadState.buttons[i]) {
                    this.gamepadState.buttons[i].pressed = false;
                    this.gamepadState.buttons[i].value = 0;
                }
            }
        }
        // Idem pour les axes : on purge l'état mémorisé et on stoppe toute rotation en cours.
        // Un axe encore maintenu sera de nouveau pris en compte au prochain update().
        if (this.heldAxes && Object.keys(this.heldAxes).length > 0) {
            this.heldAxes = {};
            if (this.eventBus) this.eventBus.emit(EVENTS.INPUT.ROTATE_COMMAND, { value: 0 });
        }
    }
    
    /**
     * Initialise les écouteurs d'événements pour la souris (mousedown, mousemove, mouseup).
     * Gère le glissement (drag) de la caméra et les clics sur les éléments de l'interface utilisateur (UI).
     * @listens mousedown sur `window`
     * @listens mousemove sur `window`
     * @listens mouseup sur `window`
     */
    initMouseEvents() {
        const mouseDownHandler = (e) => {
            // Le panoramique ne doit démarrer QUE sur la zone de jeu. L'écouteur est posé sur
            // `window` (pour continuer à recevoir mousemove/mouseup hors canvas), mais sans ce
            // filtre un clic sur le bouton ⚙️, le bouton son ou une case à cocher déclenchait un
            // panoramique et faisait sortir la caméra du mode suivi : le joueur cochait une
            // option et la fusée disparaissait de l'écran.
            if (!this._estCibleCanvas(e.target)) return;
            // Permettre le drag uniquement avec le bouton gauche ou le bouton du milieu
            if (e.button === 0 || e.button === 1) {
                this.isMouseDragging = true;
                this.eventBus.emit(EVENTS.CAMERA.START_DRAG, { x: e.clientX, y: e.clientY });
                // e.preventDefault(); // Peut-être nécessaire si le canvas est dans un élément scrollable
            }
        };
        this._mouseHandlers.mousedown = mouseDownHandler;
        this._addTrackedEventListener(window, 'mousedown', mouseDownHandler);

        const mouseMoveHandler = (e) => {
            if (this.isMouseDragging) {
                this.eventBus.emit(EVENTS.CAMERA.DRAG, { x: e.clientX, y: e.clientY });
                // e.preventDefault(); 
            }
        };
        this._mouseHandlers.mousemove = mouseMoveHandler;
        this._addTrackedEventListener(window, 'mousemove', mouseMoveHandler);
        
        const mouseUpHandler = (e) => {
            const wasDragging = this.isMouseDragging;
            if (this.isMouseDragging) {
                this.isMouseDragging = false;
                this.eventBus.emit(EVENTS.CAMERA.STOP_DRAG);
            }
            // Découplage UI: la détection des clics UI est gérée par UIView via EventBus.
        };
        this._mouseHandlers.mouseup = mouseUpHandler;
        // Écouter sur window pour capturer même si la souris sort du canvas
        this._addTrackedEventListener(window, 'mouseup', mouseUpHandler);
    }
    
    /**
     * Initialise les écouteurs d'événements pour les interactions tactiles (touchstart, touchmove, touchend, touchcancel).
     * Gère le glissement (drag) de la caméra sur les appareils tactiles.
     * @listens touchstart sur `window`
     * @listens touchmove sur `window`
     * @listens touchend sur `window`
     * @listens touchcancel sur `window`
     */
    initTouchEvents() {
        const touchStartHandler = (event) => {
            // Même règle qu'à la souris : ne pas démarrer un panoramique depuis les contrôles
            // de la page (et ne pas leur voler leur comportement via preventDefault).
            if (!this._estCibleCanvas(event.target)) return;
            if (event.touches.length === 1) { // Gérer le drag avec un seul doigt
                const touch = event.touches[0];
                this.isTouchDragging = true;
                this.eventBus.emit(EVENTS.CAMERA.START_DRAG, { x: touch.clientX, y: touch.clientY });
                event.preventDefault(); // Empêcher le défilement de la page
            }
        };
        this._touchHandlers.touchstart = touchStartHandler;
        this._addTrackedEventListener(window, 'touchstart', touchStartHandler, { passive: false });

        const touchMoveHandler = (event) => {
            // Un second doigt met fin au panoramique : sinon `isTouchDragging` restait vrai alors
            // que plus aucun preventDefault n'était appelé — la page se mettait à défiler/zoomer
            // derrière le canvas, et lever un seul doigt émettait STOP_DRAG doigt encore posé.
            if (this.isTouchDragging && event.touches.length !== 1) {
                this.isTouchDragging = false;
                if (this.eventBus && EVENTS.CAMERA && EVENTS.CAMERA.STOP_DRAG) {
                    this.eventBus.emit(EVENTS.CAMERA.STOP_DRAG);
                }
                return;
            }
            if (this.isTouchDragging && event.touches.length === 1) {
                const touch = event.touches[0];
                this.eventBus.emit(EVENTS.CAMERA.DRAG, { x: touch.clientX, y: touch.clientY });
                event.preventDefault();
            }
        };
        this._touchHandlers.touchmove = touchMoveHandler;
        this._addTrackedEventListener(window, 'touchmove', touchMoveHandler, { passive: false });

        const touchEndHandler = (event) => {
            if (this.isTouchDragging) {
                this.isTouchDragging = false;
                this.eventBus.emit(EVENTS.CAMERA.STOP_DRAG);
                // event.preventDefault(); // Peut être nécessaire sur certains appareils
            }
        };
        this._touchHandlers.touchend = touchEndHandler;
        this._addTrackedEventListener(window, 'touchend', touchEndHandler);
        this._addTrackedEventListener(window, 'touchcancel', touchEndHandler); // Gérer aussi touchcancel
    }
    
    /**
     * Initialise la détection et la gestion des événements de manette de jeu (gamepad).
     * S'abonne aux événements `gamepadconnected` et `gamepaddisconnected` de la fenêtre.
     * Vérifie également les manettes déjà connectées au moment de l'initialisation.
     * @listens gamepadconnected sur `window`
     * @listens gamepaddisconnected sur `window`
     */
    initGamepadEvents() {
        // Écouter les connexions futures
        const gpConnectHandler = (event) => {
            this.connectGamepad(event.gamepad);
        };
        this._gamepadHandlers.connected = gpConnectHandler;
        this._addTrackedEventListener(window, 'gamepadconnected', gpConnectHandler);

        // Écouter les déconnexions futures
        const gpDisconnectHandler = (event) => {
            if (this.gamepad && this.gamepad.index === event.gamepad.index) {
                this.disconnectGamepad(event.gamepad);
            }
        };
        this._gamepadHandlers.disconnected = gpDisconnectHandler;
        this._addTrackedEventListener(window, 'gamepaddisconnected', gpDisconnectHandler);

        // Vérifier immédiatement les gamepads déjà connectés
        const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
        for (const gp of gamepads) {
            if (gp) {
                this.connectGamepad(gp);
                break;
            }
        }
    }

    /**
     * Gère la connexion d'une nouvelle manette de jeu.
     * Stocke la référence à la manette et initialise son état.
     * Émet un événement `EVENTS.INPUT.GAMEPAD_CONNECTED`.
     * @param {Gamepad} gamepad - L'objet Gamepad fourni par l'API Web Gamepad.
     */
    connectGamepad(gamepad) {
        if (this.gamepad) {
            return;
        }
        this.gamepad = gamepad;
        this.gamepadState.axes = Array(this.gamepad.axes.length).fill(0);
        this.gamepadState.buttons = Array.from({ length: this.gamepad.buttons.length }, () => ({ pressed: false, value: 0 }));
        this.eventBus.emit(EVENTS.INPUT.GAMEPAD_CONNECTED, { id: this.gamepad.id });
        /**
         * Indique si le message "Aucun gamepad connecté" a déjà été loggué pour la session courante (ou depuis la dernière connexion).
         * Utilisé pour éviter le spamming de la console.
         * @type {boolean}
         * @private
         */
        this.noGamepadLogged = false;
    }

    /**
     * Gère la déconnexion d'une manette de jeu.
     * Réinitialise l'état de la manette dans le contrôleur.
     * Émet un événement `EVENTS.INPUT.GAMEPAD_DISCONNECTED`.
     * @param {Gamepad} gamepad - La manette déconnectée, telle que fournie par l'API Gamepad.
     */
    disconnectGamepad(gamepad) {
        // On compare par `index` (slot physique) pour rester cohérent avec le handler
        // `gamepaddisconnected`. Comparer par `id` échouait quand une autre manette est
        // branchée sur le même slot (même index, id différent) : `this.gamepad` n'était
        // alors jamais libéré et `connectGamepad` rejetait le pad de remplacement.
        if (this.gamepad && gamepad && this.gamepad.index === gamepad.index) {
            const disconnectedId = this.gamepad.id;
            this.gamepad = null;
            this.gamepadState.axes.fill(0);
            this.gamepadState.buttons = Array.from({ length: this.gamepadState.buttons.length }, () => ({ pressed: false, value: 0 }));
            // Vider les axes maintenus et arrêter toute rotation en cours pour éviter une rotation bloquée.
            this.heldAxes = {};
            this.eventBus.emit(EVENTS.INPUT.ROTATE_COMMAND, { value: 0 });
            // Relâcher uniquement les actions issues de la MANETTE : une manette débranchée
            // bouton enfoncé laisse sinon 'thrustForward_gamepad_boost' dans activeKeyActions.
            // Comme _hasActiveSourceFor() y verrait toujours une source active, plus aucun
            // relâchement clavier ne pourrait couper le propulseur.
            // On ne touche pas aux touches clavier encore physiquement enfoncées (les relâcher
            // couperait la poussée d'un joueur qui maintient W au moment du débranchement).
            this._releaseGamepadActions();
            this.eventBus.emit(EVENTS.INPUT.GAMEPAD_DISCONNECTED, { id: disconnectedId });
            this.noGamepadLogged = false; // Réinitialiser lors de la déconnexion

            // Ré-adopter une autre manette encore branchée. Le scan initial n'a lieu que dans le
            // constructeur et `gamepadconnected` ne sera pas réémis pour une manette déjà là :
            // avec deux manettes, débrancher l'active laissait le jeu SANS manette jusqu'à ce que
            // le joueur débranche/rebranche la seconde.
            try {
                const pads = (typeof navigator !== 'undefined' && navigator.getGamepads) ? navigator.getGamepads() : [];
                for (let i = 0; i < pads.length; i++) {
                    // Exclure explicitement la manette qu'on vient de débrancher : certains
                    // navigateurs laissent son entrée dans le tableau au moment de l'événement.
                    // L'adopter à nouveau serait sans retour : update() sortirait aussitôt
                    // (slot devenu null) et connectGamepad refuserait toute manette suivante.
                    if (pads[i] && pads[i].index !== gamepad.index) { this.connectGamepad(pads[i]); break; }
                }
            } catch (e) { /* API indisponible : on reste sans manette */ }
        }
    }
    
    /**
     * Gère les événements d'appui sur une touche du clavier (`keydown`).
     * Identifie l'action associée à la touche et émet les événements appropriés
     * via l'EventBus. Empêche le comportement par défaut du navigateur pour les touches de jeu.
     * Pour les actions continues (ex: propulsion), un état est maintenu pour éviter la répétition
     * des événements `_START`.
     * @param {KeyboardEvent} event - L'objet événement keydown.
     */
    handleKeyDown(event) {
        // Ne pas capter le clavier quand la saisie appartient à un contrôle HTML de la page.
        // L'écouteur vit sur `window` : sans ce filtre, une flèche pressée sur le sélecteur de
        // monde de l'écran de démarrage était AVALÉE par preventDefault() (impossible de changer
        // de monde au clavier) tout en émettant une commande de poussée à la fusée. Idem pour
        // Espace/Échap sur un bouton ou une case à cocher ayant le focus.
        if (this._estSaisieUtilisateur(event.target, event)) return;

        // Ne pas détourner les raccourcis système/navigateur. Les modificateurs n'étaient testés
        // que pour décider du preventDefault : le `switch` s'exécutait quand même, si bien que
        // Cmd/Ctrl+C recentrait la caméra, Cmd/Ctrl+V basculait les vecteurs, Ctrl+R
        // réinitialisait la fusée et Cmd+A allumait un propulseur latéral.
        if (event.ctrlKey || event.metaKey || event.altKey) return;

        const actionName = this.keyMap[event.code] || this.keyMap[event.key];
        if (!actionName) return;

        // Empêcher le comportement par défaut pour les touches de jeu
        const isFunctionKey = event.key && event.key.startsWith('F') && event.key.length <= 3;
        if (!event.ctrlKey && !event.metaKey && !event.altKey && !isFunctionKey) {
            event.preventDefault();
        }

        const actionKey = `${actionName}-${event.code || event.key}`; // Clé unique pour activeKeyActions

        switch (actionName) {
            case 'thrustForward':
            case 'boost': // boost est un alias pour thrustForward
                if (!this.activeKeyActions.has(actionKey)) {
                    this.activeKeyActions.add(actionKey);
                    console.log(`[InputController] Touche ${event.code || event.key} détectée, émission THRUST_FORWARD_START`);
                    this.eventBus.emit(EVENTS.ROCKET.THRUST_FORWARD_START);
                } else {
                    console.log(`[InputController] Touche ${event.code || event.key} déjà active, pas de ré-émission`);
                }
                break;
            case 'thrustBackward':
                if (!this.activeKeyActions.has(actionKey)) {
                    this.activeKeyActions.add(actionKey);
                    this.eventBus.emit(EVENTS.ROCKET.THRUST_BACKWARD_START);
                }
                break;
            case 'rotateLeft':
                if (!this.activeKeyActions.has(actionKey)) {
                    this.activeKeyActions.add(actionKey);
                    this.eventBus.emit(EVENTS.ROCKET.ROTATE_LEFT_START);
                }
                break;
            case 'rotateRight':
                if (!this.activeKeyActions.has(actionKey)) {
                    this.activeKeyActions.add(actionKey);
                    this.eventBus.emit(EVENTS.ROCKET.ROTATE_RIGHT_START);
                }
                break;
            case 'zoomIn':
                this.eventBus.emit(EVENTS.CAMERA.ZOOM_IN); // Se répète si la touche est maintenue
                break;
            case 'zoomOut':
                this.eventBus.emit(EVENTS.CAMERA.ZOOM_OUT); // Se répète si la touche est maintenue
                break;
            // Les actions "coup unique" sont gérées dans handleKeyUp
        }
    }
    
    /**
     * Relâche les seules actions provenant de la manette (entrées `${action}_gamepad...`),
     * en n'émettant un _STOP que si plus aucune autre source (clavier) ne maintient l'action.
     * Utilisé au débranchement de la manette : ses boutons ne produiront plus jamais de front
     * descendant, leurs entrées resteraient donc actives à vie.
     * @private
     */
    _releaseGamepadActions() {
        if (!this.activeKeyActions || this.activeKeyActions.size === 0) return;

        const groupesParAction = {
            thrustForward: ['thrustForward', 'boost'],
            boost: ['thrustForward', 'boost'],
            thrustBackward: ['thrustBackward'],
            rotateLeft: ['rotateLeft'],
            rotateRight: ['rotateRight'],
        };
        const stopEventByAction = {
            thrustForward: EVENTS.ROCKET.THRUST_FORWARD_STOP,
            boost: EVENTS.ROCKET.THRUST_FORWARD_STOP,
            thrustBackward: EVENTS.ROCKET.THRUST_BACKWARD_STOP,
            rotateLeft: EVENTS.ROCKET.ROTATE_LEFT_STOP,
            rotateRight: EVENTS.ROCKET.ROTATE_RIGHT_STOP,
        };

        // Collecter d'abord (on ne modifie pas le Set pendant l'itération).
        const entreesGamepad = [];
        for (const entry of this.activeKeyActions) {
            const idx = entry.indexOf('_gamepad');
            if (idx > 0) entreesGamepad.push({ entry, action: entry.slice(0, idx) });
        }
        for (const { entry, action } of entreesGamepad) {
            this.activeKeyActions.delete(entry);
            const groupe = groupesParAction[action];
            const stopEvent = stopEventByAction[action];
            if (stopEvent && (!groupe || !this._hasActiveSourceFor(groupe))) {
                this.eventBus.emit(stopEvent);
            }
        }
    }

    /**
     * Indique si au moins une source (touche clavier ou bouton gamepad) est encore active
     * pour l'une des actions données.
     * Plusieurs touches sont des alias de la même action (ArrowUp / KeyW / Space -> poussée
     * principale, ArrowRight / KeyA -> rotation gauche, etc.). Sans ce comptage, relâcher
     * une seule des touches maintenues coupait le propulseur alors qu'une autre était
     * toujours enfoncée — et la répétition clavier ne pouvait pas le réarmer, la touche
     * restant présente dans `activeKeyActions`.
     * @param {string[]} actionNames - Noms d'actions formant le même groupe logique.
     * @returns {boolean} true si une source du groupe est encore active.
     * @private
     */
    _hasActiveSourceFor(actionNames) {
        for (const entry of this.activeKeyActions) {
            for (const name of actionNames) {
                // Entrées clavier: `${action}-${code}` ; entrées gamepad: `${action}_gamepad...`
                if (entry === name || entry.startsWith(`${name}-`) || entry.startsWith(`${name}_`)) {
                    return true;
                }
            }
        }
        return false;
    }

    /**
     * Gère les événements de relâchement d'une touche du clavier (`keyup`).
     * Identifie l'action associée à la touche. Pour les actions continues (ex: propulsion),
     * émet un événement `_STOP` via l'EventBus et met à jour `activeKeyActions`.
     * Pour les actions "coup unique" (ex: pause, reset), émet l'événement correspondant directement.
     * @param {KeyboardEvent} event - L'objet événement keyup.
     */
    handleKeyUp(event) {
        // Symétrique de handleKeyDown pour les raccourcis système. On NE filtre pas les
        // relâchements d'actions continues : si une touche a été enfoncée sans modificateur puis
        // relâchée avec (l'utilisateur presse Cmd entre-temps), l'arrêt doit passer quand même,
        // sans quoi le propulseur resterait allumé.
        const actionNamePeutEtreContinu = this.keyMap[event.code] || this.keyMap[event.key];
        const estContinu = ['thrustForward', 'boost', 'thrustBackward', 'rotateLeft', 'rotateRight']
            .includes(actionNamePeutEtreContinu);
        if (!estContinu && (event.ctrlKey || event.metaKey || event.altKey)) return;

        const actionName = this.keyMap[event.code] || this.keyMap[event.key];
        if (!actionName) return;

        // Le RELÂCHEMENT d'une action continue est toujours traité, quel que soit l'élément
        // focalisé : il ne peut qu'ARRÊTER quelque chose. Le focus peut changer touche enfoncée
        // (maintenir W puis cliquer sur un contrôle de la page) ; filtrer ce keyup comme le
        // keydown laisserait le propulseur allumé indéfiniment, sans aucun moyen de le couper.
        // Les actions "coup unique" (R, P, T, V, I, H, zoom…), elles, sont bien filtrées :
        // elles déclenchent une commande de jeu et ne doivent pas partir pendant une saisie.
        const estRelachementContinu = (actionName === 'thrustForward' || actionName === 'boost'
            || actionName === 'thrustBackward' || actionName === 'rotateLeft' || actionName === 'rotateRight');
        if (!estRelachementContinu && this._estSaisieUtilisateur(event.target, event)) return;

        const actionKey = `${actionName}-${event.code || event.key}`;

        switch (actionName) {
            case 'thrustForward':
            case 'boost':
                if (this.activeKeyActions.has(actionKey)) {
                    this.activeKeyActions.delete(actionKey);
                    if (!this._hasActiveSourceFor(['thrustForward', 'boost'])) {
                        this.eventBus.emit(EVENTS.ROCKET.THRUST_FORWARD_STOP);
                    }
                }
                break;
            case 'thrustBackward':
                if (this.activeKeyActions.has(actionKey)) {
                    this.activeKeyActions.delete(actionKey);
                    if (!this._hasActiveSourceFor(['thrustBackward'])) {
                        this.eventBus.emit(EVENTS.ROCKET.THRUST_BACKWARD_STOP);
                    }
                }
                break;
            case 'rotateLeft':
                if (this.activeKeyActions.has(actionKey)) {
                    this.activeKeyActions.delete(actionKey);
                    if (!this._hasActiveSourceFor(['rotateLeft'])) {
                        this.eventBus.emit(EVENTS.ROCKET.ROTATE_LEFT_STOP);
                    }
                }
                break;
            case 'rotateRight':
                if (this.activeKeyActions.has(actionKey)) {
                    this.activeKeyActions.delete(actionKey);
                    if (!this._hasActiveSourceFor(['rotateRight'])) {
                        this.eventBus.emit(EVENTS.ROCKET.ROTATE_RIGHT_STOP);
                    }
                }
                break;
            // Actions "coup unique"
            case 'resetRocket':
                this.eventBus.emit(EVENTS.ROCKET.RESET);
                break;
            case 'centerCamera':
                this.eventBus.emit(EVENTS.CAMERA.CENTER_ON_ROCKET);
                break;
            case 'toggleVectors':
                this.eventBus.emit(EVENTS.RENDER.TOGGLE_VECTORS);
                break;
            case 'toggleGravityField':
                this.eventBus.emit(EVENTS.RENDER.TOGGLE_GRAVITY_FIELD);
                break;
            case 'toggleTraces':
                this.eventBus.emit(EVENTS.RENDER.TOGGLE_TRACES);
                break;
            case 'toggleAI':
                console.log("[InputController] Émission de EVENTS.AI.TOGGLE_CONTROL due à KeyI (keyup)");
                this.eventBus.emit(EVENTS.AI.TOGGLE_CONTROL);
                break;
            case 'toggleAssistedControls':
                if (EVENTS.UI && EVENTS.UI.TOGGLE_ASSISTED_CONTROLS) {
                    this.eventBus.emit(EVENTS.UI.TOGGLE_ASSISTED_CONTROLS);
                }
                break;
            case 'pauseGame':
                this.eventBus.emit(EVENTS.GAME.TOGGLE_PAUSE);
                break;
            case 'increaseThrustMultiplier':
                this.eventBus.emit(EVENTS.ROCKET.INCREASE_THRUST_MULTIPLIER);
                break;
            case 'decreaseThrustMultiplier':
                this.eventBus.emit(EVENTS.ROCKET.DECREASE_THRUST_MULTIPLIER);
                break;
        }
    }
    
    /**
     * Met à jour l'état des entrées, principalement pour la manette de jeu (gamepad).
     * Cette méthode doit être appelée à chaque frame de la boucle de jeu principale.
     * Elle lit l'état actuel des axes et des boutons de la manette connectée,
     * le compare avec l'état précédent stocké dans `this.gamepadState`,
     * et émet des événements sémantiques via l'EventBus en conséquence.
     * Gère les seuils pour les axes et la détection des appuis/relâchements de boutons.
     * @param {number} [deltaTime=1/60] - Le temps écoulé (en secondes) depuis la dernière frame,
     *   relayé aux commandes analogiques continues (zoom au stick) pour qu'elles soient
     *   indépendantes du framerate.
     */
    update(deltaTime = 1 / 60) {
        if (!this.gamepad) {
            if (!this.noGamepadLogged) {
                // console.log("[InputController] Aucun gamepad connecté ou actif."); // Optionnel
                this.noGamepadLogged = true;
            }
            return; 
        }

        const newGamepad = navigator.getGamepads()[this.gamepad.index];
        if (!newGamepad) return; // Le gamepad pourrait avoir été déconnecté

        this.gamepad = newGamepad; // Mettre à jour avec le dernier état

        // --- Traitement des Axes ---
        this.gamepad.axes.forEach((axisValue, index) => {
            const lastAxisValue = this.gamepadState.axes[index];
            const action = this.gamepadMap.axes[index];

            if (Math.abs(axisValue) > this.axisThreshold) {
                // L'axe est actif au-delà du seuil
                if (action === 'rotate') {
                    this.eventBus.emit(EVENTS.INPUT.ROTATE_COMMAND, { value: axisValue });
                } else if (action === 'zoomAxis') {
                    // Pour le zoom via axe, on envoie une commande continue.
                    // CameraController devra interpréter cette valeur.
                    // Zone morte dédiée + remise à l'échelle après seuil : une manette dont l'axe
                    // dérive au repos ne doit plus emmener la vue au zoom minimal toute seule.
                    const seuil = this.zoomAxisThreshold;
                    const amplitude = Math.abs(axisValue);
                    if (amplitude > seuil) {
                        const v = Math.sign(axisValue) * (amplitude - seuil) / (1 - seuil);
                        this.eventBus.emit(EVENTS.INPUT.ZOOM_COMMAND, { value: v, deltaTime });
                    }
                }
                // Note: Aucune autre action d'axe n'est actuellement gérée pour l'émission d'événements directs ici.
                this.heldAxes[index] = axisValue;
            } else if (Math.abs(lastAxisValue) > this.axisThreshold && Math.abs(axisValue) <= this.axisThreshold) {
                // L'axe vient d'être relâché
                if (action === 'rotate') {
                    this.eventBus.emit(EVENTS.INPUT.ROTATE_COMMAND, { value: 0 }); // Arrêter la rotation
                    // Le zéro ci-dessus coupe les DEUX propulseurs latéraux. Si une touche de
                    // rotation est encore physiquement maintenue au clavier, il faut la réarmer :
                    // sans cela, relâcher le stick tuait définitivement la rotation clavier
                    // (aucun nouveau _START n'est émis, la touche étant déjà dans activeKeyActions).
                    //
                    // ⚠️ On réémet un ROTATE_COMMAND, PAS un ROTATE_LEFT/RIGHT_START : ces derniers
                    // demandent la reprise du jeu (RESUME_IF_PAUSED). Or ce code s'exécute dans
                    // update(), désormais appelé aussi en pause — un stick qui revient au neutre
                    // aurait donc RELANCÉ la partie tout seul, propulseur latéral à pleine
                    // puissance. ROTATE_COMMAND, lui, est ignoré en pause (cf. handleRotateCommand).
                    const gauche = this._hasActiveSourceFor(['rotateLeft']);
                    const droite = this._hasActiveSourceFor(['rotateRight']);
                    if (gauche !== droite) {   // une seule direction tenue : les deux s'annulent
                        this.eventBus.emit(EVENTS.INPUT.ROTATE_COMMAND, { value: gauche ? 1 : -1 });
                    }
                } else if (action === 'zoomAxis') {
                    // Pour le zoom, un événement ZOOM_COMMAND avec valeur 0 peut être émis si nécessaire,
                    // ou la logique consommatrice peut simplement arrêter le zoom en l'absence de nouvelles commandes.
                    // Actuellement, on ne fait rien de spécial au relâchement de l'axe de zoom,
                    // CameraController doit gérer l'absence de commande.
                }
                delete this.heldAxes[index];
            }
            this.gamepadState.axes[index] = axisValue;
        });


        // --- Traitement des Boutons ---
        this.gamepad.buttons.forEach((button, index) => {
            const wasPressed = this.gamepadState.buttons[index] && this.gamepadState.buttons[index].pressed;
            const isPressed = button.pressed;
            const action = this.gamepadMap.buttons[index];

            if (action) { // Si une action est mappée pour ce bouton
                if (isPressed && !wasPressed) { // Le bouton vient d'être pressé
                    // Émettre un événement sémantique direct basé sur le mapping
                    // Ex: this.eventBus.emit(EVENTS.ROCKET.BOOST_START); si action === 'boost'
                    // La logique actuelle de GameController attend des événements plus spécifiques (ex: EVENTS.GAME.TOGGLE_PAUSE)
                    // Nous devons mapper 'action' aux événements attendus par GameController ou RocketController
                    
                    switch (action) {
                        case 'boost': // SPACE ou Bouton A
                            // Note: 'boost' est un alias pour 'thrustForward' dans le keyMap actuel
                            // GameController/RocketController attend THRUST_FORWARD_START
                            this.eventBus.emit(EVENTS.ROCKET.THRUST_FORWARD_START);
                            // Simule un état actif pour que la logique de "relâchement" du bouton fonctionne
                            // de manière similaire à celle du clavier si d'autres systèmes en dépendent.
                            // TODO: Envisager de découpler complètement la gestion d'état gamepad de activeKeyActions.
                            this.activeKeyActions.add('thrustForward_gamepad_boost'); 
                            break;
                        case 'thrustBackward': // Bouton Y
                            this.eventBus.emit(EVENTS.ROCKET.THRUST_BACKWARD_START);
                            this.activeKeyActions.add('thrustBackward_gamepad');
                            break;
                        case 'toggleTraces': // Bouton LB
                            this.eventBus.emit(EVENTS.RENDER.TOGGLE_TRACES);
                            break;
                        case 'toggleVectors': // Bouton RB
                            this.eventBus.emit(EVENTS.RENDER.TOGGLE_VECTORS);
                            break;
                        case 'zoomOutButton': // Bouton LT (si utilisé comme bouton)
                            // Si c'est un bouton, il agit comme un 'tick' de zoom
                            // CameraController s'attend à CAMERA_ZOOM_ADJUST avec un facteur
                            this.eventBus.emit(EVENTS.CAMERA.CAMERA_ZOOM_ADJUST, { factor: 1 / RENDER.CAMERA_ZOOM_BUTTON_FACTOR });
                            break;
                        case 'zoomInButton': // Bouton RT (si utilisé comme bouton)
                            this.eventBus.emit(EVENTS.CAMERA.CAMERA_ZOOM_ADJUST, { factor: RENDER.CAMERA_ZOOM_BUTTON_FACTOR });
                            break;
                        case 'centerCamera': // Bouton View/Back
                            this.eventBus.emit(EVENTS.CAMERA.CENTER_ON_ROCKET);
                            break;
                        case 'pauseGame': // Bouton Menu/Start
                            this.eventBus.emit(EVENTS.GAME.TOGGLE_PAUSE);
                            break;
                        case 'resetRocket': // Bouton Stick Gauche Press
                            this.eventBus.emit(EVENTS.ROCKET.RESET);
                            break;
                        // Ajouter d'autres cas pour les boutons mappés si nécessaire
                    }

                } else if (!isPressed && wasPressed) { // Le bouton vient d'être relâché
                    // Gérer le relâchement si nécessaire (par exemple, pour arrêter une action continue)
                    switch (action) {
                        case 'boost':
                            // Même règle qu'au clavier : ne couper que si plus aucune source
                            // (touche ou bouton) ne demande la poussée avant.
                            this.activeKeyActions.delete('thrustForward_gamepad_boost');
                            if (!this._hasActiveSourceFor(['thrustForward', 'boost'])) {
                                this.eventBus.emit(EVENTS.ROCKET.THRUST_FORWARD_STOP);
                            }
                            break;
                        case 'thrustBackward':
                            this.activeKeyActions.delete('thrustBackward_gamepad');
                            if (!this._hasActiveSourceFor(['thrustBackward'])) {
                                this.eventBus.emit(EVENTS.ROCKET.THRUST_BACKWARD_STOP);
                            }
                            break;
                        // Les autres actions sont des "toggles" ou des actions uniques, pas besoin de _STOP
                    }
                }
            }
            // Mettre à jour l'état du bouton
            this.gamepadState.buttons[index] = { pressed: isPressed, value: button.value };
        });
    }
    
    /**
     * Gère les événements de la molette de la souris (`wheel`).
     * Empêche le défilement par défaut de la page et émet un `EVENTS.CAMERA.CAMERA_ZOOM_ADJUST`
     * dont le facteur est proportionnel à l'amplitude du défilement (et non au nombre d'événements).
     * @param {WheelEvent} event - L'objet événement wheel.
     */
    handleWheel(event) {
        event.preventDefault(); // Empêcher le défilement de la page et le zoom par défaut du navigateur
        const brut = event.deltaY;
        if (typeof brut !== 'number' || !isFinite(brut) || brut === 0) return;

        // Le pas de zoom doit être proportionnel à l'AMPLITUDE du défilement, pas au NOMBRE
        // d'événements : un trackpad envoie des dizaines d'événements de |deltaY| ≈ 1..3 px là où
        // une molette à crans en envoie un seul de ~100 px. Sans cette normalisation, un simple
        // glissement à deux doigts saturait le zoom (10 événements suffisaient pour 1 -> MAX_ZOOM).
        const parUnite = event.deltaMode === 1
            ? 16                                                    // DOM_DELTA_LINE : ~16 px par ligne
            : event.deltaMode === 2
                ? (window.innerHeight || RENDER.CANVAS_HEIGHT)      // DOM_DELTA_PAGE
                : 1;                                                // DOM_DELTA_PIXEL
        const cran = (RENDER.WHEEL_NOTCH_DELTA || 100);             // |deltaY| (px) d'un cran de molette classique
        const borne = 4 * cran;                                     // un seul événement ne vaut jamais plus de ~4 crans
        const px = Math.max(-borne, Math.min(borne, brut * parUnite));
        // Calibrage : |px| = cran redonne exactement le facteur (1 + ZOOM_SPEED).
        const parPixel = Math.log(1 + RENDER.ZOOM_SPEED) / cran;
        this.eventBus.emit(EVENTS.CAMERA.CAMERA_ZOOM_ADJUST, { factor: Math.exp(-px * parPixel) });
    }
    
    // Les méthodes isKeyDown et isActionActive ont été supprimées car leur logique
    // est maintenant gérée par les événements _START/_STOP et l'état interne activeKeyActions
    // ou directement par la logique de update() pour le gamepad.
    
    /**
     * Permet de reconfigurer dynamiquement une touche du clavier pour une action spécifique.
     * Met à jour `this.keyMap` avec la nouvelle association.
     * Émet un événement `EVENTS.INPUT.KEYMAP_CHANGED` pour informer les autres modules du changement.
     * @param {string} key - Le code de la touche (attribut `event.code`, ex: 'KeyW', 'ArrowUp') ou la valeur de la touche (attribut `event.key`). Il est préférable d'utiliser `event.code` pour une indépendance de la disposition du clavier.
     * @param {string} action - Le nom de l'action à associer à cette touche (doit correspondre aux actions gérées par `handleKeyDown`/`handleKeyUp`).
     */
    mapKey(key, action) {
        this.keyMap[key] = action;
        this.eventBus.emit(EVENTS.INPUT.KEYMAP_CHANGED, { key, action });
    }
    
    /**
     * Réinitialise la configuration des touches du clavier à ses valeurs par défaut
     * (définies dans `InputController.DEFAULT_KEY_MAP`).
     * Émet un événement `EVENTS.INPUT.KEYMAP_RESET`.
     */
    resetKeyMap() {
        this.keyMap = { ...InputController.DEFAULT_KEY_MAP };
        this.eventBus.emit(EVENTS.INPUT.KEYMAP_RESET, {});
    }
} 