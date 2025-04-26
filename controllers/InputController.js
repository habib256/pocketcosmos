class InputController {
    // Définition de la constante de mappage des touches au niveau de la classe
    static DEFAULT_KEY_MAP = {
        'ArrowUp': 'thrustForward',
        'ArrowDown': 'thrustBackward',
        'ArrowLeft': 'rotateRight',
        'ArrowRight': 'rotateLeft',

        'Space': 'boost',
        'KeyW': 'thrustForward',
        'KeyS': 'thrustBackward',
        'KeyA': 'rotateLeft',
        'KeyD': 'rotateRight',
        'KeyR': 'resetRocket',
        'KeyC': 'centerCamera',
        'KeyV': 'toggleVectors',
        'KeyG': 'toggleGravityField',
        'KeyI': 'toggleAI',
        'Equal': 'zoomIn',
        'Minus': 'zoomOut',
        'Escape': 'pauseGame'
    };

    constructor(eventBus) {
        // Référence à l'EventBus
        this.eventBus = eventBus;
        
        // État des touches
        this.keys = {
            ArrowUp: false,     // Propulseur principal
            ArrowDown: false,   // Propulseur arrière
            ArrowLeft: false,   // Propulseur gauche 
            ArrowRight: false,  // Propulseur droit
            w: false,           // Alternative au propulseur principal
            s: false,           // Alternative au propulseur arrière
            a: false,           // Alternative au propulseur gauche
            d: false,           // Alternative au propulseur droit
            r: false,           // Réinitialiser
            t: false,           // Augmenter le multiplicateur de poussée
            p: false,           // Diminuer le multiplicateur de poussée
            c: false,           // Centrer la caméra
            v: false,           // Afficher les vecteurs
            i: false,           // Activer/désactiver l'IA
        };
        
        // État du joystick
        this.gamepad = null;
        this.gamepadState = {
            axes: [],
            buttons: []
        };
        this.gamepadMap = { // Exemple de mappage (peut varier selon le joystick)
            axes: {
                0: 'rotate', // Axe horizontal (gauche/droite) -> Rotation
                // 1: 'rotate', // Axe vertical retiré
                // 2: // Axe Y Stick Droit (non utilisé pour l'instant)
                3: 'zoomAxis', // Axe X Stick Droit -> Zoom
            },
            buttons: {
                0: 'boost',     // Bouton A (Xbox) / Croix (PS) - Action principale (ex: Poussée principale)
                1: 'actionB',   // Bouton B (Xbox) / Cercle (PS)
                2: 'actionX',   // Bouton X (Xbox) / Carré (PS)
                3: 'thrustBackward', // Bouton Y (Xbox) / Triangle (PS) -> Propulseur arrière
                // ... autres boutons ...
                6: 'zoomOutButton', // Bouton 6 (LB/L1 ?) -> Zoom Out
                7: 'zoomInButton',  // Bouton 7 (RB/R1 ?) -> Zoom In
                10: 'resetRocket',   // Bouton 10 (souvent Start/Menu) -> Reset
                11: 'toggleVectors', // Bouton 11 (souvent Select/View ?) -> Toggle Vectors
            }
        };
        this.axisThreshold = 0.1; // Seuil pour ignorer les petites dérives des axes
        // Ajout: Stocker l'état précédent des axes maintenus
        this.heldAxes = {}; 
        
        // Mapping des touches aux actions
        this.keyMap = {
            // Touches fléchées
            'ArrowUp': 'thrustForward',
            'ArrowDown': 'thrustBackward',
            ArrowLeft: 'rotateRight',
            ArrowRight: 'rotateLeft',
            
            // Touches WASD alternatives
            'w': 'thrustForward',
            's': 'thrustBackward',
            'a': 'rotateLeft',
            'd': 'rotateRight',
            'W': 'thrustForward',
            'S': 'thrustBackward',
            'A': 'rotateLeft',
            'D': 'rotateRight',
            'KeyW': 'thrustForward',
            'KeyS': 'thrustBackward',
            'KeyA': 'rotateLeft',
            'KeyD': 'rotateRight',
            
            // Autres touches
            'r': 'resetRocket',
            'R': 'resetRocket',
            'KeyR': 'resetRocket',
            'c': 'centerCamera',
            'C': 'centerCamera',
            'KeyC': 'centerCamera',
            'v': 'toggleVectors',
            'V': 'toggleVectors',
            'KeyV': 'toggleVectors',
            'g': 'toggleGravityField',
            'G': 'toggleGravityField',
            'KeyG': 'toggleGravityField',
            't': 'toggleTraces',        // Afficher/masquer les traces
            'T': 'toggleTraces',
            'KeyT': 'toggleTraces',
            'p': 'pauseGame',           // Pause avec P
            'P': 'pauseGame',
            'KeyP': 'pauseGame',
            'Escape': 'pauseGame',      // Pause avec Escape
            'm': 'decreaseThrustMultiplier',
            'M': 'decreaseThrustMultiplier',
            'KeyM': 'decreaseThrustMultiplier',
            'i': 'toggleAI',            // Activer/désactiver l'IA
            'I': 'toggleAI',
            'KeyI': 'toggleAI'
        };
        
        // Initialiser les événements du clavier, souris, tactile et joystick
        this.initKeyboardEvents();
        this.initGamepadEvents();
    }
    
    initKeyboardEvents() {
        // Écouter les événements du clavier
        window.addEventListener('keydown', this.handleKeyDown.bind(this));
        window.addEventListener('keyup', this.handleKeyUp.bind(this));
        
        // Écouter les événements de la souris pour le zoom et le déplacement
        window.addEventListener('wheel', this.handleWheel.bind(this));
        
        // Utiliser une méthode commune pour les événements souris
        this.setupMouseEvents();
        
        // Utiliser une méthode commune pour les événements tactiles
        this.setupTouchEvents();
    }
    
    // Méthode factorisée pour configurer les événements souris
    setupMouseEvents() {
        const mouseEvents = [
            { name: 'mousedown', eventType: EVENTS.INPUT.MOUSEDOWN },
            { name: 'mousemove', eventType: EVENTS.INPUT.MOUSEMOVE },
            { name: 'mouseup', eventType: EVENTS.INPUT.MOUSEUP }
        ];
        
        mouseEvents.forEach(event => {
            window.addEventListener(event.name, (e) => {
                this.eventBus.emit(event.eventType, {
                    x: e.clientX,
                    y: e.clientY,
                    button: e.button || 0
                });
            });
        });
    }
    
    // Méthode factorisée pour configurer les événements tactiles
    setupTouchEvents() {
        // Événements tactiles pour appareils mobiles avec passive: true pour de meilleures performances
        window.addEventListener('touchstart', (event) => {
            const touch = event.touches[0];
            this.eventBus.emit(EVENTS.INPUT.TOUCHSTART, { x: touch.clientX, y: touch.clientY });
            // Pas de preventDefault() pour permettre passive: true
        }, { passive: true });
        
        window.addEventListener('touchmove', (event) => {
            const touch = event.touches[0];
            this.eventBus.emit(EVENTS.INPUT.TOUCHMOVE, { x: touch.clientX, y: touch.clientY });
            // Pas de preventDefault() pour permettre passive: true
        }, { passive: true });
        
        window.addEventListener('touchend', (event) => {
            this.eventBus.emit(EVENTS.INPUT.TOUCHEND, {});
            // Pas de preventDefault() pour permettre passive: true
        }, { passive: true });
    }
    
    // Nouvelle méthode pour initialiser le support du joystick
    initGamepadEvents() {
        // Écouter les connexions futures
        window.addEventListener('gamepadconnected', (event) => {
            this.connectGamepad(event.gamepad);
        });

        // Écouter les déconnexions futures
        window.addEventListener('gamepaddisconnected', (event) => {
            if (this.gamepad && this.gamepad.index === event.gamepad.index) {
                this.disconnectGamepad(event.gamepad.id);
            }
        });

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
        // Mettre à jour l'état des touches
        const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
        if (this.keys.hasOwnProperty(key)) {
            this.keys[key] = true;
        }
        // Convertir la touche en action
        let action = this.keyMap[event.key];
        if (!action) {
            // Essayer avec la version minuscule
            action = this.keyMap[event.key.toLowerCase()];
        }
        if (!action && event.code) {
            action = this.keyMap[event.code];
        }
        if (action) {
            // Ne bloque pas les touches système (F1-F12, Ctrl, Alt, Meta)
            const isFunctionKey = event.key && event.key.startsWith('F') && event.key.length <= 3;
            if (!event.ctrlKey && !event.metaKey && !event.altKey && !isFunctionKey) {
                event.preventDefault();
            }
            // Émettre l'événement correspondant
            this.eventBus.emit(EVENTS.INPUT.KEYDOWN, { action, key: event.key });
            // Ajout : toggleGravityField
            if (action === 'toggleGravityField') {
                this.eventBus.emit(EVENTS.RENDER.TOGGLE_GRAVITY_FIELD);
            }
        }
    }
    
    // Gérer les événements keyup
    handleKeyUp(event) {
        // Mettre à jour l'état des touches
        if (this.keys.hasOwnProperty(event.key)) {
            this.keys[event.key] = false;
        }
        
        // Convertir la touche en action
        const action = this.keyMap[event.key];
        if (action) {
            event.preventDefault();
            
            // Émettre l'événement correspondant
            this.eventBus.emit(EVENTS.INPUT.KEYUP, { action, key: event.key });
        }
    }
    
    // Mettre à jour l'état des entrées (clavier + joystick)
    update() {
        // --- Gestion Clavier ---
        for (const key in this.keys) {
            if (this.keys[key]) {
                const action = this.keyMap[key];
                if (action) {
                    if (action === 'thrustForward' || action === 'thrustBackward' || 
                        action === 'rotateLeft' || action === 'rotateRight' || 
                        action === 'zoomIn' || action === 'zoomOut') {
                        this.eventBus.emit(EVENTS.INPUT.KEYDOWN, { action, key });
                    } else if (action !== 'pauseGame') {
                        this.eventBus.emit(EVENTS.INPUT.KEYPRESS, { action, key });
                        this.keys[key] = false;
                    }
                }
            }
        }

        // --- Gestion Joystick ---
        if (this.gamepad) {
            const currentGamepad = navigator.getGamepads()[this.gamepad.index];
            if (!currentGamepad) {
                return;
            }

            const currentHeldAxes = {};
            for (let i = 0; i < currentGamepad.axes.length; i++) {
                const value = currentGamepad.axes[i];
                const prevValue = this.gamepadState.axes[i];
                const adjustedValue = Math.abs(value) < this.axisThreshold ? 0 : value;
                const adjustedPrevValue = Math.abs(prevValue) < this.axisThreshold ? 0 : prevValue;

                const action = this.gamepadMap.axes[i];

                // 1. Gérer l'événement de CHANGEMENT (une seule fois)
                if (adjustedValue !== adjustedPrevValue) {
                    this.gamepadState.axes[i] = value;
                    if (action) {
                        this.eventBus.emit(EVENTS.INPUT.JOYSTICK_AXIS_CHANGED, {
                            action: action,
                            axis: i,
                            value: adjustedValue
                        });
                    }
                }

                // 2. Gérer l'événement MAINTENU (pour les axes mappés)
                if (action && adjustedValue !== 0) {
                    currentHeldAxes[i] = true;
                    this.eventBus.emit(EVENTS.INPUT.JOYSTICK_AXIS_HELD, {
                        action: action,
                        axis: i,
                        value: adjustedValue
                    });
                    this.heldAxes[i] = true;
                }
            }
            for(const axisIndex in this.heldAxes) {
                if (this.heldAxes[axisIndex] && !currentHeldAxes[axisIndex]) {
                    const action = this.gamepadMap.axes[axisIndex];
                    if (action) {
                        this.eventBus.emit(EVENTS.INPUT.JOYSTICK_AXIS_RELEASED, {
                            action: action,
                            axis: parseInt(axisIndex, 10)
                        });
                    }
                    this.heldAxes[axisIndex] = false;
                }
            }

            // Traiter les boutons
            for (let i = 0; i < currentGamepad.buttons.length; i++) {
                const button = currentGamepad.buttons[i];
                const prevButtonState = this.gamepadState.buttons[i];

                if (button.pressed !== prevButtonState.pressed) {
                    this.gamepadState.buttons[i] = { pressed: button.pressed, value: button.value };
                    const action = this.gamepadMap.buttons[i];
                    if (action) {
                        const eventType = button.pressed ? EVENTS.INPUT.JOYSTICK_BUTTON_DOWN : EVENTS.INPUT.JOYSTICK_BUTTON_UP;
                        this.eventBus.emit(eventType, {
                            action: action,
                            button: i,
                            value: button.value
                        });
                    }
                }
            }
        } else {
            this.noGamepadLogged = true; 
        }
    }
    
    // Gérer les événements de la souris
    handleWheel(event) {
        this.eventBus.emit(EVENTS.INPUT.WHEEL, {
            delta: event.deltaY
        });
    }
    
    // Vérifier si une touche est actuellement pressée
    isKeyDown(keyCode) {
        return this.keys[keyCode] === true;
    }
    
    // Vérifier si une action est actuellement active
    isActionActive(action) {
        // Trouver toutes les touches qui déclenchent cette action
        for (const key in this.keyMap) {
            if (this.keyMap[key] === action && this.keys[key]) {
                return true;
            }
        }
        return false;
    }
    
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