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
            
            // Autres touches
            'r': 'resetRocket',
            'c': 'centerCamera',
            'v': 'toggleVectors',
            'g': 'toggleGravityField',
            't': 'toggleTraces',        // Afficher/masquer les traces
            'p': 'pauseGame',           // Pause avec P
            'Escape': 'pauseGame',      // Pause avec Escape
            'm': 'decreaseThrustMultiplier',
            'i': 'toggleAI'             // Activer/désactiver l'IA
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
            { name: 'mousedown', eventType: 'INPUT_MOUSEDOWN' },
            { name: 'mousemove', eventType: 'INPUT_MOUSEMOVE' },
            { name: 'mouseup', eventType: 'INPUT_MOUSEUP' }
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
            this.eventBus.emit('INPUT_TOUCHSTART', {
                x: touch.clientX,
                y: touch.clientY
            });
            // Pas de preventDefault() pour permettre passive: true
        }, { passive: true });
        
        window.addEventListener('touchmove', (event) => {
            const touch = event.touches[0];
            this.eventBus.emit('INPUT_TOUCHMOVE', {
                x: touch.clientX,
                y: touch.clientY
            });
            // Pas de preventDefault() pour permettre passive: true
        }, { passive: true });
        
        window.addEventListener('touchend', (event) => {
            this.eventBus.emit('INPUT_TOUCHEND', {});
            // Pas de preventDefault() pour permettre passive: true
        }, { passive: true });
    }
    
    // Nouvelle méthode pour initialiser le support du joystick
    initGamepadEvents() {
        // Écouter les connexions futures
        window.addEventListener('gamepadconnected', (event) => {
            console.log('%c[InputController] Événement \'gamepadconnected\' reçu:', 'color: green; font-weight: bold;', event.gamepad.id, 'Index:', event.gamepad.index);
            this.connectGamepad(event.gamepad);
        });

        // Écouter les déconnexions futures
        window.addEventListener('gamepaddisconnected', (event) => {
            console.log('%c[InputController] Gamepad déconnecté:', 'color: red; font-weight: bold;', event.gamepad.id);
            if (this.gamepad && this.gamepad.index === event.gamepad.index) {
                this.disconnectGamepad(event.gamepad.id);
            }
        });

        // Vérifier immédiatement les gamepads déjà connectés
        const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
        // console.log(`%c[InputController] Vérification initiale: ${gamepads.length} slots de gamepad trouvés.`, 'color: purple;');
        for (const gp of gamepads) {
            if (gp) {
                console.log(`%c[InputController] -> Gamepad trouvé lors de la vérification initiale: Index ${gp.index}, ID: ${gp.id}`, 'color: purple; font-weight: bold;');
                this.connectGamepad(gp);
                break; // Se connecter au premier trouvé pour l'instant
            }
        }
        // if (!this.gamepad) {
        //     console.log('%c[InputController] Aucun gamepad actif trouvé lors de la vérification initiale. En attente de l\'événement \'gamepadconnected\'...', 'color: orange;');
        // }
    }

    // Nouvelle méthode pour gérer la connexion (appelée par l'event ou la vérification initiale)
    connectGamepad(gamepad) {
        if (this.gamepad) { // Si un autre est déjà connecté, on l'ignore pour l'instant
            console.warn(`[InputController] Un autre gamepad (Index ${this.gamepad.index}) est déjà actif. Ignoré: ${gamepad.id}`);
            return;
        }
        this.gamepad = gamepad;
        this.gamepadState.axes = Array(this.gamepad.axes.length).fill(0);
        this.gamepadState.buttons = Array(this.gamepad.buttons.length).fill({ pressed: false, value: 0 });
        // Log simplifié
        console.log(`[InputController] Gamepad ACTIVÉ - Index: ${this.gamepad.index}, Axes: ${this.gamepad.axes.length}, Boutons: ${this.gamepad.buttons.length}, ID: ${this.gamepad.id}`);
        this.eventBus.emit('INPUT_GAMEPAD_CONNECTED', { id: this.gamepad.id });
        this.noGamepadLogged = false; // Réinitialiser le flag pour les logs dans update()
    }

    // Nouvelle méthode pour gérer la déconnexion
    disconnectGamepad(gamepadId) {
        if (this.gamepad && this.gamepad.id === gamepadId) {
            const index = this.gamepad.index;
            this.gamepad = null;
            this.gamepadState.axes.fill(0);
            this.gamepadState.buttons.fill({ pressed: false, value: 0 });
            // Log simplifié
            console.log(`[InputController] Gamepad DÉSACTIVÉ - Index: ${index}, ID: ${gamepadId}`);
            this.eventBus.emit('INPUT_GAMEPAD_DISCONNECTED', { id: gamepadId });
            this.noGamepadLogged = false; // Réinitialiser aussi ici
        }
    }
    
    // Gérer les événements keydown
    handleKeyDown(event) {
        // Mettre à jour l'état des touches
        if (this.keys.hasOwnProperty(event.key)) {
            this.keys[event.key] = true;
        }
        
        // Convertir la touche en action
        const action = this.keyMap[event.key];
        if (action) {
            event.preventDefault();
            
            // Émettre l'événement correspondant
            this.eventBus.emit('INPUT_KEYDOWN', { action, key: event.key });
            // Ajout : toggleGravityField
            if (action === 'toggleGravityField') {
                this.eventBus.emit('toggleGravityField');
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
            this.eventBus.emit('INPUT_KEYUP', { action, key: event.key });
        }
    }
    
    // Mettre à jour l'état des entrées (clavier + joystick)
    update() {
        // --- Gestion Clavier ---
        // Vérifier les touches maintenues pour les actions continues
        for (const key in this.keys) {
            if (this.keys[key]) {
                // Convertir la touche en action
                const action = this.keyMap[key];
                if (action) {
                    // Émettre l'événement correspondant pour les actions qui doivent être répétées
                    if (action === 'thrustForward' || action === 'thrustBackward' || 
                        action === 'rotateLeft' || action === 'rotateRight' || 
                        action === 'zoomIn' || action === 'zoomOut') {
                        this.eventBus.emit('INPUT_KEYDOWN', { action, key });
                    } else if (action !== 'pauseGame') { // Ne jamais répéter pauseGame ici
                        // Pour les actions ponctuelles, envoyer un événement keypress une seule fois
                        this.eventBus.emit('INPUT_KEYPRESS', { action, key });
                        // Réinitialiser l'état de la touche pour éviter les répétitions
                        this.keys[key] = false;
                    }
                }
            }
        }

        // --- Gestion Joystick ---
        if (this.gamepad) {
            const currentGamepad = navigator.getGamepads()[this.gamepad.index];
            if (!currentGamepad) {
                // Optionnel: gérer si le gamepad disparaît soudainement
                // console.warn('[InputController] Gamepad non trouvé à l\'index', this.gamepad.index);
                // this.gamepad = null; 
                return;
            }

            // Traiter les axes
            const currentHeldAxes = {}; // Axes maintenus dans cette frame
            for (let i = 0; i < currentGamepad.axes.length; i++) {
                const value = currentGamepad.axes[i];
                const prevValue = this.gamepadState.axes[i];
                const adjustedValue = Math.abs(value) < this.axisThreshold ? 0 : value;
                const adjustedPrevValue = Math.abs(prevValue) < this.axisThreshold ? 0 : prevValue;

                const action = this.gamepadMap.axes[i];

                // 1. Gérer l'événement de CHANGEMENT (une seule fois)
                if (adjustedValue !== adjustedPrevValue) {
                    console.log(`%c[InputController] Axe ${i} changé: ${prevValue.toFixed(2)} -> ${value.toFixed(2)} (Ajusté: ${adjustedPrevValue.toFixed(2)} -> ${adjustedValue.toFixed(2)})`, 'color: blue;');
                    this.gamepadState.axes[i] = value; // Mettre à jour l'état stocké
                    if (action) {
                        // Émettre l'événement CHANGED pour tous les axes mappés
                        console.log(`%c[InputController] -> Émission EventBus: INPUT_JOYSTICK_AXIS_CHANGED { action: '${action}', axis: ${i}, value: ${adjustedValue.toFixed(2)} }`, 'color: darkblue;');
                        this.eventBus.emit('INPUT_JOYSTICK_AXIS_CHANGED', {
                            action: action,
                            axis: i,
                            value: adjustedValue
                        });
                    } else {
                        console.log(`%c[InputController] -> Axe ${i} non mappé.`, 'color: gray;');
                    }
                }

                // 2. Gérer l'événement MAINTENU (pour les axes mappés)
                if (action && adjustedValue !== 0) {
                    currentHeldAxes[i] = true; // Marquer comme maintenu cette frame
                    // Émettre l'événement HELD à chaque update tant que l'axe est incliné
                    // console.log(`%c[InputController] -> Émission EventBus: INPUT_JOYSTICK_AXIS_HELD { action: '${action}', axis: ${i}, value: ${adjustedValue.toFixed(2)} }`, 'color: purple;'); // Peut spammer, désactiver par défaut
                    this.eventBus.emit('INPUT_JOYSTICK_AXIS_HELD', {
                        action: action,
                        axis: i,
                        value: adjustedValue
                    });
                    // Marquer que cet axe est actuellement maintenu
                    this.heldAxes[i] = true;
                }
            }
            
            // 3. Gérer l'événement RELACHÉ (pour les axes qui étaient maintenus mais ne le sont plus)
            for(const axisIndex in this.heldAxes) {
                if (this.heldAxes[axisIndex] && !currentHeldAxes[axisIndex]) {
                    const action = this.gamepadMap.axes[axisIndex];
                    if (action) {
                        console.log(`%c[InputController] -> Émission EventBus: INPUT_JOYSTICK_AXIS_RELEASED { action: '${action}', axis: ${axisIndex} }`, 'color: brown;');
                         this.eventBus.emit('INPUT_JOYSTICK_AXIS_RELEASED', {
                            action: action,
                            axis: parseInt(axisIndex, 10)
                        });
                    }
                     // Marquer comme non maintenu
                    this.heldAxes[axisIndex] = false;
                }
            }

            // Traiter les boutons
            for (let i = 0; i < currentGamepad.buttons.length; i++) {
                const button = currentGamepad.buttons[i];
                const prevButtonState = this.gamepadState.buttons[i];

                if (button.pressed !== prevButtonState.pressed) {
                     console.log(`%c[InputController] Bouton ${i} changé: ${prevButtonState.pressed} -> ${button.pressed} (Valeur: ${button.value.toFixed(2)})`, 'color: orange;');
                    this.gamepadState.buttons[i] = { pressed: button.pressed, value: button.value };
                    const action = this.gamepadMap.buttons[i];
                    if (action) {
                        const eventName = button.pressed ? 'INPUT_JOYSTICK_BUTTON_DOWN' : 'INPUT_JOYSTICK_BUTTON_UP';
                         console.log(`%c[InputController] -> Émission EventBus: ${eventName} { action: '${action}', button: ${i}, value: ${button.value.toFixed(2)} }`, 'color: darkorange;');
                        this.eventBus.emit(eventName, {
                            action: action,
                            button: i,
                            value: button.value
                        });
                        // Émission 'changed' (optionnel)
                        // this.eventBus.emit('INPUT_JOYSTICK_BUTTON_CHANGED', { action: action, button: i, pressed: button.pressed, value: button.value });
                    } else {
                         console.log(`%c[InputController] -> Bouton ${i} non mappé.`, 'color: gray;');
                    }
                }
            }
        } else {
             // Log si aucun gamepad detecte (une seule fois)
             if (typeof this.noGamepadLogged === 'undefined' || !this.noGamepadLogged) {
                 console.log('[InputController] Aucun gamepad detecte. En attente de connexion...');
                 this.noGamepadLogged = true; 
             }
        }
    }
    
    // Gérer les événements de la souris
    handleWheel(event) {
        this.eventBus.emit('INPUT_WHEEL', {
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
        this.eventBus.emit('INPUT_KEYMAP_CHANGED', { key, action });
    }
    
    // Réinitialiser la configuration des touches
    resetKeyMap() {
        this.keyMap = { ...InputController.DEFAULT_KEY_MAP };
        this.eventBus.emit('INPUT_KEYMAP_RESET', {});
    }
} 