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
    };

    /**
     * Crée une instance de InputController.
     * @param {EventBus} eventBus - L'instance de l'EventBus pour la communication entre modules.
     */
    constructor(eventBus) {
        this.eventBus = eventBus;
        
        // Stockage des écouteurs d'événements pour nettoyage
        this._eventListeners = [];
        
        // Stockage des handlers pour référence
        this._mouseHandlers = {};
        this._touchHandlers = {};
        this._gamepadHandlers = {};
        
        // État des touches et boutons
        this.keys = {};
        this.mouseButtons = {};
        this.touches = {};
        
        // État de la souris et du tactile
        this.mousePosition = { x: 0, y: 0 };
        this.lastMousePosition = { x: 0, y: 0 };
        this.isDragging = false;
        this.isMouseDragging = false;
        this.isTouchDragging = false;
        this.dragStartPosition = { x: 0, y: 0 };
        
        // État du gamepad
        this.gamepad = null;
        this.gamepadIndex = -1;
        this.gamepadConnected = false;
        this.gamepadState = { axes: [], buttons: [] };
        this.lastGamepadState = {};
        this.noGamepadLogged = false;
        
        // Propriétés pour le gamepad
        this.keyMap = { ...InputController.DEFAULT_KEY_MAP };
        this.gamepadMap = {
            axes: {
                0: 'rotate', // Stick gauche horizontal
                2: 'zoomAxis' // Stick droit horizontal pour zoom
            },
            buttons: {
                0: 'boost', // Bouton A
                3: 'thrustBackward', // Bouton Y
                4: 'toggleTraces', // Bouton LB
                5: 'toggleVectors', // Bouton RB
                6: 'zoomOutButton', // Bouton LT
                7: 'zoomInButton', // Bouton RT
                8: 'centerCamera', // Bouton View/Back
                9: 'pauseGame', // Bouton Menu/Start
                10: 'resetRocket' // Bouton Stick Gauche Press
            }
        };
        this.axisThreshold = 0.1;
        this.activeKeyActions = new Set();
        this.heldAxes = {};
        
        // Flags d'initialisation pour éviter les doublons
        this._keyboardEventsInitialized = false;
        this._mouseEventsInitialized = false;
        this._touchEventsInitialized = false;
        this._gamepadEventsInitialized = false;
        
        // Configuration des seuils
        this.config = {
            gamepadDeadzone: 0.1,
            gamepadSensitivity: 1.0,
            mouseWheelSensitivity: 1.0,
            touchSensitivity: 1.0
        };
        
        // Bind des méthodes pour les événements
        this._boundKeyDown = this.handleKeyDown.bind(this);
        this._boundKeyUp = this.handleKeyUp.bind(this);
        this._boundWheel = this.handleWheel.bind(this);
        
        // Initialiser les gestionnaires d'événements
        this.initEventHandlers();
    }
    
    /**
     * Ajoute un écouteur d'événement et le suit pour nettoyage automatique.
     * @param {EventTarget} target - L'élément cible (ex: document, window).
     * @param {string} type - Le type d'événement (ex: 'keydown').
     * @param {Function} listener - La fonction de rappel.
     * @param {Object} [options] - Options pour addEventListener.
     */
    _addTrackedEventListener(target, type, listener, options) {
        target.addEventListener(type, listener, options);
        // Stocker la fonction de nettoyage pour la désabonnement
        this._eventListeners.push(() => target.removeEventListener(type, listener, options));
    }
    
    /**
     * Initialise les écouteurs d'événements pour le clavier (keydown, keyup) et la molette de la souris (wheel).
     * S'assure que l'initialisation n'a lieu qu'une seule fois grâce au drapeau `_keyboardEventsInitialized`.
     */
    initKeyboardEvents() {
        if (this._keyboardEventsInitialized) { 
            return;
        }
        this._addTrackedEventListener(window, 'keydown', this._boundKeyDown);
        this._addTrackedEventListener(window, 'keyup', this._boundKeyUp);
        this._addTrackedEventListener(window, 'wheel', this._boundWheel, { passive: false }); // passive: false pour preventDefault sur le zoom
        
        this._keyboardEventsInitialized = true; 
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

            // Gérer les clics sur les boutons UI si ce n'était pas un drag
            if (!wasDragging && e.button === 0) { // Clic gauche et pas un drag
                // Assurez-vous que this.uiView est disponible et correctement initialisé.
                // Normalement, il est passé via GameSetupController -> GameController -> InputController.
                // Pour l'instant, nous allons supposer qu'il est accessible via une référence globale
                // ou qu'il sera injecté correctement. L'idéal serait une injection de dépendance.
                // TODO: Remplacer window.uiView par une véritable injection de dépendance.
                const uiView = window.uiView; // TEMPORAIRE: en attendant une meilleure injection

                if (uiView && typeof uiView.getAssistedControlsButtonBounds === 'function') {
                    const bounds = uiView.getAssistedControlsButtonBounds();
                    if (bounds && 
                        e.clientX >= bounds.x && e.clientX <= bounds.x + bounds.width &&
                        e.clientY >= bounds.y && e.clientY <= bounds.y + bounds.height) {
                        console.log('[InputController] Clic détecté sur le bouton des contrôles assistés.'); // AJOUT D'UN LOG
                        this.eventBus.emit(EVENTS.UI.TOGGLE_ASSISTED_CONTROLS);
                    }
                }
            }
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
                this.disconnectGamepad(event.gamepad.id);
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
        this.gamepadState.buttons = Array(this.gamepad.buttons.length).fill({ pressed: false, value: 0 });
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
     * @param {string} gamepadId - L'ID de la manette déconnectée, tel que fourni par l'API Gamepad.
     */
    disconnectGamepad(gamepadId) {
        if (this.gamepad && this.gamepad.id === gamepadId) {
            const index = this.gamepad.index;
            this.gamepad = null;
            this.gamepadState.axes.fill(0);
            this.gamepadState.buttons.fill({ pressed: false, value: 0 });
            this.eventBus.emit(EVENTS.INPUT.GAMEPAD_DISCONNECTED, { id: gamepadId });
            this.noGamepadLogged = false; // Réinitialiser lors de la déconnexion
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
        const actionName = this.keyMap[event.code] || this.keyMap[event.key];
        if (!actionName) {
            return;
        }

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
                    this.eventBus.emit(EVENTS.ROCKET.THRUST_FORWARD_START);
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
     * Gère les événements de relâchement d'une touche du clavier (`keyup`).
     * Identifie l'action associée à la touche. Pour les actions continues (ex: propulsion),
     * émet un événement `_STOP` via l'EventBus et met à jour `activeKeyActions`.
     * Pour les actions "coup unique" (ex: pause, reset), émet l'événement correspondant directement.
     * @param {KeyboardEvent} event - L'objet événement keyup.
     */
    handleKeyUp(event) {
        const actionName = this.keyMap[event.code] || this.keyMap[event.key];
        if (!actionName) return;
        
        const actionKey = `${actionName}-${event.code || event.key}`;

        switch (actionName) {
            case 'thrustForward':
            case 'boost':
                if (this.activeKeyActions.has(actionKey)) {
                    this.activeKeyActions.delete(actionKey);
                    this.eventBus.emit(EVENTS.ROCKET.THRUST_FORWARD_STOP);
                }
                break;
            case 'thrustBackward':
                if (this.activeKeyActions.has(actionKey)) {
                    this.activeKeyActions.delete(actionKey);
                    this.eventBus.emit(EVENTS.ROCKET.THRUST_BACKWARD_STOP);
                }
                break;
            case 'rotateLeft':
                if (this.activeKeyActions.has(actionKey)) {
                    this.activeKeyActions.delete(actionKey);
                    this.eventBus.emit(EVENTS.ROCKET.ROTATE_LEFT_STOP);
                }
                break;
            case 'rotateRight':
                if (this.activeKeyActions.has(actionKey)) {
                    this.activeKeyActions.delete(actionKey);
                    this.eventBus.emit(EVENTS.ROCKET.ROTATE_RIGHT_STOP);
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
     */
    update() {
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
                    this.eventBus.emit(EVENTS.INPUT.ZOOM_COMMAND, { value: axisValue });
                }
                // Note: Aucune autre action d'axe n'est actuellement gérée pour l'émission d'événements directs ici.
                this.heldAxes[index] = axisValue;
            } else if (Math.abs(lastAxisValue) > this.axisThreshold && Math.abs(axisValue) <= this.axisThreshold) {
                // L'axe vient d'être relâché
                if (action === 'rotate') {
                    this.eventBus.emit(EVENTS.INPUT.ROTATE_COMMAND, { value: 0 }); // Arrêter la rotation
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
                            this.eventBus.emit(EVENTS.CAMERA.CENTER_CAMERA_ON_ROCKET);
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
                            this.eventBus.emit(EVENTS.ROCKET.THRUST_FORWARD_STOP);
                            this.activeKeyActions.delete('thrustForward_gamepad_boost');
                            break;
                        case 'thrustBackward':
                            this.eventBus.emit(EVENTS.ROCKET.THRUST_BACKWARD_STOP);
                            this.activeKeyActions.delete('thrustBackward_gamepad');
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
     * Empêche le défilement par défaut de la page et émet des événements
     * `EVENTS.CAMERA.ZOOM_IN` ou `EVENTS.CAMERA.ZOOM_OUT` en fonction de la direction du défilement.
     * @param {WheelEvent} event - L'objet événement wheel.
     */
    handleWheel(event) {
        event.preventDefault(); // Empêcher le défilement de la page et le zoom par défaut du navigateur
        if (event.deltaY < 0) { // Scroll vers le haut ou vers l'avant
            this.eventBus.emit(EVENTS.CAMERA.ZOOM_IN);
        } else if (event.deltaY > 0) { // Scroll vers le bas ou vers l'arrière
            this.eventBus.emit(EVENTS.CAMERA.ZOOM_OUT);
        }
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

    /**
     * Initialise tous les gestionnaires d'événements.
     */
    initEventHandlers() {
        this.initKeyboardEvents();
        this.initMouseEvents();
        this.initTouchEvents();
        this.initGamepadEvents();
    }

    /**
     * Nettoie tous les écouteurs d'événements.
     */
    cleanup() {
        this._eventListeners.forEach(removeListener => removeListener());
        this._eventListeners = [];
    }
}
// Rendre disponible globalement
window.InputController = InputController;