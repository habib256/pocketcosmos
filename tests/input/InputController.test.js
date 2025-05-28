/**
 * Tests pour InputController - Gestion des entrées utilisateur
 */

describe('InputController', () => {
    let inputController;
    let mockEventBus;

    beforeEach(() => {
        // Mock de l'EventBus
        mockEventBus = {
            emit: jest.fn(),
            subscribe: jest.fn(),
            unsubscribe: jest.fn()
        };

        // Mock des événements DOM avec Jest
        global.window = {
            addEventListener: jest.fn(),
            removeEventListener: jest.fn(),
            navigator: {
                getGamepads: jest.fn(() => [])
            }
        };

        global.document = {
            addEventListener: jest.fn(),
            removeEventListener: jest.fn()
        };

        // Mock des constantes d'événements
        global.EVENTS = {
            CAMERA: {
                START_DRAG: 'camera.start_drag',
                DRAG: 'camera.drag',
                END_DRAG: 'camera.end_drag',
                ZOOM_IN: 'camera.zoom_in',
                ZOOM_OUT: 'camera.zoom_out',
                CENTER: 'camera.center'
            },
            ROCKET: {
                THRUST_FORWARD: 'rocket.thrust_forward',
                THRUST_BACKWARD: 'rocket.thrust_backward',
                ROTATE_LEFT: 'rocket.rotate_left',
                ROTATE_RIGHT: 'rocket.rotate_right',
                BOOST: 'rocket.boost',
                RESET: 'rocket.reset'
            },
            GAME: {
                PAUSE: 'game.pause',
                RESUME: 'game.resume'
            },
            UI: {
                TOGGLE_VECTORS: 'ui.toggle_vectors',
                TOGGLE_GRAVITY_FIELD: 'ui.toggle_gravity_field',
                TOGGLE_TRACES: 'ui.toggle_traces',
                TOGGLE_AI: 'ui.toggle_ai'
            },
            INPUT: {
                GAMEPAD_CONNECTED: 'input.gamepad_connected',
                GAMEPAD_DISCONNECTED: 'input.gamepad_disconnected',
                KEYMAP_CHANGED: 'input.keymap_changed'
            }
        };

        inputController = new InputController(mockEventBus);
    });

    afterEach(() => {
        if (inputController) {
            inputController.cleanup();
        }
    });

    describe('initialisation', () => {
        test('initialise correctement avec EventBus', () => {
            expect(inputController.eventBus).toBe(mockEventBus);
            expect(inputController.keys).toEqual({});
            expect(inputController.mouseButtons).toEqual({});
            expect(inputController.touches).toEqual({});
        });

        test('initialise les propriétés par défaut', () => {
            expect(inputController.mousePosition).toEqual({ x: 0, y: 0 });
            expect(inputController.isDragging).toBe(false);
            expect(inputController.gamepadConnected).toBe(false);
            expect(inputController.keyMap).toEqual(InputController.DEFAULT_KEY_MAP);
        });

        test('configuration par défaut est correcte', () => {
            expect(inputController.config.gamepadDeadzone).toBe(0.1);
            expect(inputController.config.gamepadSensitivity).toBe(1.0);
            expect(inputController.config.mouseWheelSensitivity).toBe(1.0);
            expect(inputController.config.touchSensitivity).toBe(1.0);
        });
    });

    describe('DEFAULT_KEY_MAP', () => {
        test('contient les mappages de base', () => {
            const keyMap = InputController.DEFAULT_KEY_MAP;
            
            expect(keyMap['ArrowUp']).toBe('thrustForward');
            expect(keyMap['KeyW']).toBe('thrustForward');
            expect(keyMap['ArrowDown']).toBe('thrustBackward');
            expect(keyMap['KeyS']).toBe('thrustBackward');
            expect(keyMap['Space']).toBe('boost');
            expect(keyMap['KeyR']).toBe('resetRocket');
            expect(keyMap['KeyP']).toBe('pauseGame');
        });

        test('contient les mappages de caméra', () => {
            const keyMap = InputController.DEFAULT_KEY_MAP;
            
            expect(keyMap['Equal']).toBe('zoomIn');
            expect(keyMap['Minus']).toBe('zoomOut');
            expect(keyMap['KeyC']).toBe('centerCamera');
        });

        test('contient les mappages d\'interface', () => {
            const keyMap = InputController.DEFAULT_KEY_MAP;
            
            expect(keyMap['KeyV']).toBe('toggleVectors');
            expect(keyMap['KeyG']).toBe('toggleGravityField');
            expect(keyMap['KeyT']).toBe('toggleTraces');
            expect(keyMap['KeyI']).toBe('toggleAI');
        });
    });

    describe('mappage des touches', () => {
        test('mappe une touche à une action', () => {
            inputController.mapKey('KeyX', 'customAction');
            expect(inputController.keyMap['KeyX']).toBe('customAction');
        });

        test('remet à zéro le mappage des touches', () => {
            inputController.mapKey('KeyX', 'customAction');
            inputController.resetKeyMap();
            expect(inputController.keyMap).toEqual(InputController.DEFAULT_KEY_MAP);
        });
    });

    describe('gestion du clavier', () => {
        test('gère keydown pour action connue', () => {
            const keyEvent = {
                code: 'ArrowUp',
                preventDefault: jest.fn(),
                repeat: false
            };

            inputController.handleKeyDown(keyEvent);
            expect(keyEvent.preventDefault).toHaveBeenCalled();
        });

        test('gère keyup pour action ponctuelle', () => {
            const keyEvent = {
                code: 'KeyR',
                preventDefault: jest.fn()
            };

            inputController.handleKeyUp(keyEvent);
            expect(mockEventBus.emit).toHaveBeenCalledWith('rocket.reset');
        });

        test('ignore les touches inconnues', () => {
            const keyEvent = {
                code: 'UnknownKey',
                preventDefault: jest.fn(),
                repeat: false
            };

            mockEventBus.emit.mockClear();
            inputController.handleKeyDown(keyEvent);
            expect(mockEventBus.emit).not.toHaveBeenCalled();
        });
    });

    describe('gestion de la molette', () => {
        test('gère le zoom avant avec molette', () => {
            const wheelEvent = {
                deltaY: -100,
                preventDefault: jest.fn()
            };

            inputController.handleWheel(wheelEvent);
            expect(mockEventBus.emit).toHaveBeenCalledWith('camera.zoom_in');
            expect(wheelEvent.preventDefault).toHaveBeenCalled();
        });

        test('gère le zoom arrière avec molette', () => {
            const wheelEvent = {
                deltaY: 100,
                preventDefault: jest.fn()
            };

            inputController.handleWheel(wheelEvent);
            expect(mockEventBus.emit).toHaveBeenCalledWith('camera.zoom_out');
        });
    });

    describe('initialisation des gestionnaires', () => {
        test('initKeyboardEvents ne plante pas', () => {
            expect(() => inputController.initKeyboardEvents()).not.toThrow();
        });

        test('initMouseEvents ne plante pas', () => {
            expect(() => inputController.initMouseEvents()).not.toThrow();
        });

        test('initTouchEvents ne plante pas', () => {
            expect(() => inputController.initTouchEvents()).not.toThrow();
        });

        test('initGamepadEvents ne plante pas', () => {
            expect(() => inputController.initGamepadEvents()).not.toThrow();
        });

        test('initEventHandlers ne plante pas', () => {
            expect(() => inputController.initEventHandlers()).not.toThrow();
        });
    });

    describe('gamepad basique', () => {
        test('état initial du gamepad', () => {
            expect(inputController.gamepadConnected).toBe(false);
            expect(inputController.gamepadIndex).toBe(-1);
            expect(inputController.gamepad).toBeNull();
        });

        test('update sans gamepad ne plante pas', () => {
            expect(() => inputController.update()).not.toThrow();
        });
    });

    describe('nettoyage', () => {
        test('cleanup ne plante pas', () => {
            expect(() => inputController.cleanup()).not.toThrow();
        });

        test('cleanup vide les écouteurs', () => {
            const initialListenersCount = inputController._eventListeners.length;
            inputController.cleanup();
            expect(inputController._eventListeners.length).toBe(0);
        });
    });

    describe('propriétés d\'état', () => {
        test('utilise le seuil d\'axe par défaut', () => {
            expect(inputController.axisThreshold).toBe(0.1);
        });

        test('a des ensembles d\'actions vides au départ', () => {
            expect(inputController.activeKeyActions.size).toBe(0);
        });

        test('position de souris initiale', () => {
            expect(inputController.mousePosition).toEqual({ x: 0, y: 0 });
            expect(inputController.lastMousePosition).toEqual({ x: 0, y: 0 });
        });

        test('état de glissement initial', () => {
            expect(inputController.isDragging).toBe(false);
            expect(inputController.isMouseDragging).toBe(false);
            expect(inputController.isTouchDragging).toBe(false);
        });
    });

    describe('scénarios d\'utilisation', () => {
        test('séquence simple d\'actions clavier', () => {
            mockEventBus.emit.mockClear();
            
            // Action ponctuelle
            inputController.handleKeyUp({ code: 'KeyR', preventDefault: jest.fn() });
            
            // Zoom
            inputController.handleWheel({ deltaY: -100, preventDefault: jest.fn() });
            
            expect(mockEventBus.emit).toHaveBeenCalledTimes(2);
        });

        test('gère la reconfiguration de touches', () => {
            const originalAction = inputController.keyMap['KeyX'];
            
            inputController.mapKey('KeyX', 'newAction');
            expect(inputController.keyMap['KeyX']).toBe('newAction');
            
            inputController.resetKeyMap();
            expect(inputController.keyMap['KeyX']).toBe(originalAction);
        });
    });
}); 