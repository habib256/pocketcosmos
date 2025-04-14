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
            't': 'toggleTraces',        // Afficher/masquer les traces
            'p': 'pauseGame',
            'm': 'decreaseThrustMultiplier',
            'i': 'toggleAI'             // Activer/désactiver l'IA
        };
        
        // Initialiser les événements du clavier
        this.initKeyboardEvents();
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
    
    // Mettre à jour l'état des entrées
    update() {
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
                    } else {
                        // Pour les actions ponctuelles, envoyer un événement keypress une seule fois
                        this.eventBus.emit('INPUT_KEYPRESS', { action, key });
                        // Réinitialiser l'état de la touche pour éviter les répétitions
                        this.keys[key] = false;
                    }
                }
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