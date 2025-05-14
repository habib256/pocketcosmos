class InputController {
    // Définition de la constante de mappage des touches au niveau de la classe
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

    constructor(eventBus) {
        // Référence à l'EventBus
        this.eventBus = eventBus;
        
        // État des actions clavier continues actives (pour éviter répétition de _START)
        this.activeKeyActions = new Set();
        // État du glisser pour la souris et le tactile
        this.isMouseDragging = false;
        this.isTouchDragging = false;
        
        // État du joystick
        this.gamepad = null;
        this.gamepadState = {
            axes: [],
            buttons: []
        };
        // Mappage SÉMANTIQUE des boutons du joystick
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
                // 11: // Bouton Stick Droit Press (non mappé)
                // D-pad (peut être axes ou boutons selon le gamepad)
                // 12: 'thrustForward', // D-pad Up
                // 13: 'thrustBackward',// D-pad Down
                // 14: 'rotateLeft', // D-pad Left
                // 15: 'rotateRight', // D-pad Right
            }
        };
        this.axisThreshold = 0.1; 
        this.heldAxes = {}; 
        
        // Initialiser this.keyMap avec une copie de DEFAULT_KEY_MAP
        this.keyMap = { ...InputController.DEFAULT_KEY_MAP };
        
        // Lier les gestionnaires pour pouvoir les désabonner
        this._boundKeyDown = this.handleKeyDown.bind(this);
        this._boundKeyUp = this.handleKeyUp.bind(this);
        this._boundWheel = this.handleWheel.bind(this);
        this._mouseHandlers = {}; // Reste pour la structure, mais les handlers seront spécifiques
        this._touchHandlers = {}; // Idem
        this._gamepadHandlers = {};
        
        this._keyboardEventsInitialized = false; // Nouveau drapeau
        
        // Initialiser les événements du clavier, souris, tactile et joystick
        this.initKeyboardEvents();
        this.initMouseEvents(); // Renommé pour clarté
        this.initTouchEvents(); // Renommé pour clarté
        this.initGamepadEvents();
    }
    
    initKeyboardEvents() {
        if (this._keyboardEventsInitialized) { // Vérifier le drapeau
            return;
        }
        window.addEventListener('keydown', this._boundKeyDown);
        window.controllerContainer.track(() => window.removeEventListener('keydown', this._boundKeyDown));
        window.addEventListener('keyup', this._boundKeyUp);
        window.controllerContainer.track(() => window.removeEventListener('keyup', this._boundKeyUp));
        
        window.addEventListener('wheel', this._boundWheel, { passive: false }); // passive: false pour preventDefault sur le zoom
        window.controllerContainer.track(() => window.removeEventListener('wheel', this._boundWheel));
        
        this._keyboardEventsInitialized = true; // Mettre le drapeau à true après l'initialisation
    }
    
    // Méthode pour configurer les événements souris pour le glisser de la caméra
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
        window.addEventListener('mousedown', mouseDownHandler);
        window.controllerContainer.track(() => window.removeEventListener('mousedown', mouseDownHandler));

        const mouseMoveHandler = (e) => {
            if (this.isMouseDragging) {
                this.eventBus.emit(EVENTS.CAMERA.DRAG, { x: e.clientX, y: e.clientY });
                // e.preventDefault(); 
            }
        };
        this._mouseHandlers.mousemove = mouseMoveHandler;
        window.addEventListener('mousemove', mouseMoveHandler);
        window.controllerContainer.track(() => window.removeEventListener('mousemove', mouseMoveHandler));
        
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
        window.addEventListener('mouseup', mouseUpHandler); // Écouter sur window pour capturer même si la souris sort du canvas
        window.controllerContainer.track(() => window.removeEventListener('mouseup', mouseUpHandler));
    }
    
    // Méthode pour configurer les événements tactiles pour le glisser de la caméra
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
        window.addEventListener('touchstart', touchStartHandler, { passive: false });
        window.controllerContainer.track(() => window.removeEventListener('touchstart', touchStartHandler));

        const touchMoveHandler = (event) => {
            if (this.isTouchDragging && event.touches.length === 1) {
                const touch = event.touches[0];
                this.eventBus.emit(EVENTS.CAMERA.DRAG, { x: touch.clientX, y: touch.clientY });
                event.preventDefault();
            }
        };
        this._touchHandlers.touchmove = touchMoveHandler;
        window.addEventListener('touchmove', touchMoveHandler, { passive: false });
        window.controllerContainer.track(() => window.removeEventListener('touchmove', touchMoveHandler));

        const touchEndHandler = (event) => {
            if (this.isTouchDragging) {
                this.isTouchDragging = false;
                this.eventBus.emit(EVENTS.CAMERA.STOP_DRAG);
                // event.preventDefault(); // Peut être nécessaire sur certains appareils
            }
        };
        this._touchHandlers.touchend = touchEndHandler;
        window.addEventListener('touchend', touchEndHandler);
        window.controllerContainer.track(() => window.removeEventListener('touchend', touchEndHandler));
        window.addEventListener('touchcancel', touchEndHandler); // Gérer aussi touchcancel
        window.controllerContainer.track(() => window.removeEventListener('touchcancel', touchEndHandler));
    }
    
    // Nouvelle méthode pour initialiser le support du joystick
    initGamepadEvents() {
        // Écouter les connexions futures
        const gpConnectHandler = (event) => {
            this.connectGamepad(event.gamepad);
        };
        this._gamepadHandlers.connected = gpConnectHandler;
        window.addEventListener('gamepadconnected', gpConnectHandler);
        window.controllerContainer.track(() => window.removeEventListener('gamepadconnected', gpConnectHandler));

        // Écouter les déconnexions futures
        const gpDisconnectHandler = (event) => {
            if (this.gamepad && this.gamepad.index === event.gamepad.index) {
                this.disconnectGamepad(event.gamepad.id);
            }
        };
        this._gamepadHandlers.disconnected = gpDisconnectHandler;
        window.addEventListener('gamepaddisconnected', gpDisconnectHandler);
        window.controllerContainer.track(() => window.removeEventListener('gamepaddisconnected', gpDisconnectHandler));

        // Vérifier immédiatement les gamepads déjà connectés
        const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
        for (const gp of gamepads) {
            if (gp) {
                this.connectGamepad(gp);
                break;
            }
        }
    }

    // Nouvelle méthode pour gérer la connexion (appelée par l'event ou la vérification initiale)
    connectGamepad(gamepad) {
        if (this.gamepad) {
            return;
        }
        this.gamepad = gamepad;
        this.gamepadState.axes = Array(this.gamepad.axes.length).fill(0);
        this.gamepadState.buttons = Array(this.gamepad.buttons.length).fill({ pressed: false, value: 0 });
        this.eventBus.emit(EVENTS.INPUT.GAMEPAD_CONNECTED, { id: this.gamepad.id });
        this.noGamepadLogged = false;
    }

    // Nouvelle méthode pour gérer la déconnexion
    disconnectGamepad(gamepadId) {
        if (this.gamepad && this.gamepad.id === gamepadId) {
            const index = this.gamepad.index;
            this.gamepad = null;
            this.gamepadState.axes.fill(0);
            this.gamepadState.buttons.fill({ pressed: false, value: 0 });
            this.eventBus.emit(EVENTS.INPUT.GAMEPAD_DISCONNECTED, { id: gamepadId });
            this.noGamepadLogged = false;
        }
    }
    
    // Gérer les événements keydown
    handleKeyDown(event) {
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
    
    // Gérer les événements keyup
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
    
    // Mettre à jour l'état des entrées (joystick uniquement maintenant)
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
                    this.eventBus.emit(EVENTS.INPUT.ZOOM_COMMAND, { value: axisValue });
                }
                // Conserver l'ancienne logique pour les autres types d'axes si nécessaire
                // ou la supprimer si 'rotate' et 'zoomAxis' sont les seuls utilisés ici.
                // Pour l'instant, on ne gère que rotate et zoomAxis pour les nouveaux événements sémantiques.

                this.heldAxes[index] = axisValue; // Mettre à jour l'état maintenu
            } else if (Math.abs(lastAxisValue) > this.axisThreshold && Math.abs(axisValue) <= this.axisThreshold) {
                // L'axe vient d'être relâché (était au-delà du seuil, maintenant en dessous)
                if (action === 'rotate') {
                    // Pour la rotation, un relâchement pourrait signifier arrêter la rotation (valeur 0)
                    this.eventBus.emit(EVENTS.INPUT.ROTATE_COMMAND, { value: 0 });
                }
                // Pour le zoom, l'événement ZOOM_COMMAND avec une valeur suffit, pas besoin d'événement de relâchement spécifique.
                
                delete this.heldAxes[index]; // Supprimer de l'état maintenu
            }
            this.gamepadState.axes[index] = axisValue; // Mettre à jour l'état
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
                            this.activeKeyActions.add('thrustForward'); // Simuler un état actif pour la logique dekeyup
                            break;
                        case 'thrustBackward': // Bouton Y
                            this.eventBus.emit(EVENTS.ROCKET.THRUST_BACKWARD_START);
                            this.activeKeyActions.add('thrustBackward');
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
                            this.activeKeyActions.delete('thrustForward');
                            break;
                        case 'thrustBackward':
                            this.eventBus.emit(EVENTS.ROCKET.THRUST_BACKWARD_STOP);
                            this.activeKeyActions.delete('thrustBackward');
                            break;
                        // Les autres actions sont des "toggles" ou des actions uniques, pas besoin de _STOP
                    }
                }
            }
            // Mettre à jour l'état du bouton
            this.gamepadState.buttons[index] = { pressed: isPressed, value: button.value };
        });
    }
    
    // Gérer les événements de la molette souris
    handleWheel(event) {
        event.preventDefault(); // Empêcher le défilement de la page
        if (event.deltaY < 0) { // Scroll vers le haut ou vers l'avant
            this.eventBus.emit(EVENTS.CAMERA.ZOOM_IN);
        } else if (event.deltaY > 0) { // Scroll vers le bas ou vers l'arrière
            this.eventBus.emit(EVENTS.CAMERA.ZOOM_OUT);
        }
    }
    
    // La méthode isKeyDown n'est plus pertinente car l'état est géré par activeKeyActions
    // ou les événements START/STOP
    // isKeyDown(keyCode) { ... } 
    
    // La méthode isActionActive n'est plus directement utilisable de la même manière
    // isActionActive(action) { ... }
    
    // Configurer une nouvelle touche pour une action
    mapKey(key, action) {
        this.keyMap[key] = action;
        this.eventBus.emit(EVENTS.INPUT.KEYMAP_CHANGED, { key, action });
    }
    
    // Réinitialiser la configuration des touches
    resetKeyMap() {
        this.keyMap = { ...InputController.DEFAULT_KEY_MAP };
        this.eventBus.emit(EVENTS.INPUT.KEYMAP_RESET, {});
    }
} 