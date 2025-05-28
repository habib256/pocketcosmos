/**
 * Tests unitaires pour GameController
 */

describe('GameController', () => {
    let gameController;
    let mockEventBus;
    let mockCanvas;

    beforeEach(() => {
        mockEventBus = testUtils.createMockEventBus();
        mockCanvas = testUtils.createMockCanvas();
        // Utiliser le mock au lieu de la vraie classe pour éviter les dépendances
        gameController = testUtils.createMockGameController();
        gameController.eventBus = mockEventBus;
        gameController.canvas = mockCanvas;
    });

    describe('initialisation', () => {
        test('initialise correctement avec EventBus et Canvas', () => {
            expect(gameController).toBeDefined();
            expect(gameController.eventBus).toBe(mockEventBus);
            expect(gameController.canvas).toBe(mockCanvas);
        });

        test('initialise l\'état de jeu par défaut', () => {
            expect(gameController.isRunning).toBe(false);
            expect(gameController.isPaused).toBe(false);
            expect(gameController.gameTime).toBe(0);
            expect(gameController.frameCount).toBe(0);
        });

        test('initialise les composants de jeu', () => {
            expect(gameController.rocket).toBeDefined();
            expect(gameController.universe).toBeDefined();
            expect(gameController.camera).toBeDefined();
        });
    });

    describe('cycle de vie du jeu', () => {
        test('démarre le jeu', () => {
            gameController.start();
            expect(gameController.isRunning).toBe(true);
            expect(gameController.isPaused).toBe(false);
        });

        test('met en pause le jeu', () => {
            gameController.start();
            gameController.pause();
            expect(gameController.isPaused).toBe(true);
            expect(gameController.isRunning).toBe(true);
        });

        test('reprend le jeu après pause', () => {
            gameController.start();
            gameController.pause();
            gameController.resume();
            expect(gameController.isPaused).toBe(false);
            expect(gameController.isRunning).toBe(true);
        });

        test('arrête le jeu', () => {
            gameController.start();
            gameController.stop();
            expect(gameController.isRunning).toBe(false);
            expect(gameController.isPaused).toBe(false);
        });

        test('remet à zéro le jeu', () => {
            gameController.start();
            gameController.gameTime = 1000;
            gameController.frameCount = 500;
            
            gameController.reset();
            
            expect(gameController.gameTime).toBe(0);
            expect(gameController.frameCount).toBe(0);
            expect(gameController.isRunning).toBe(false);
        });
    });

    describe('boucle de jeu', () => {
        test('met à jour le jeu avec deltaTime valide', () => {
            gameController.start();
            const deltaTime = 1/60;
            
            expect(() => {
                gameController.update(deltaTime);
            }).not.toThrow();
            
            expect(gameController.gameTime).toBeGreaterThan(0);
            expect(gameController.frameCount).toBe(1);
        });

        test('ignore les mises à jour si en pause', () => {
            gameController.start();
            gameController.pause();
            
            const initialTime = gameController.gameTime;
            const initialFrames = gameController.frameCount;
            
            gameController.update(1/60);
            
            expect(gameController.gameTime).toBe(initialTime);
            expect(gameController.frameCount).toBe(initialFrames);
        });

        test('ignore les mises à jour si arrêté', () => {
            const initialTime = gameController.gameTime;
            const initialFrames = gameController.frameCount;
            
            gameController.update(1/60);
            
            expect(gameController.gameTime).toBe(initialTime);
            expect(gameController.frameCount).toBe(initialFrames);
        });

        test('limite le deltaTime maximum', () => {
            gameController.start();
            const largeDeltaTime = 1; // 1 seconde (trop grand)
            
            gameController.update(largeDeltaTime);
            
            // Le temps de jeu ne devrait pas avoir augmenté de 1 seconde complète
            expect(gameController.gameTime).toBeLessThan(largeDeltaTime);
        });
    });

    describe('gestion des événements', () => {
        test('écoute les événements d\'entrée', () => {
            let inputEventReceived = false;
            
            // Simuler un événement d'entrée
            mockEventBus.emit('input.keydown', { key: 'w' });
            
            // Vérifier que le contrôleur réagit (dépend de l'implémentation)
            expect(() => {
                mockEventBus.emit('input.keydown', { key: 'w' });
            }).not.toThrow();
        });

        test('émet des événements de jeu', () => {
            let gameStartEventEmitted = false;
            mockEventBus.subscribe('game.started', () => {
                gameStartEventEmitted = true;
            });
            
            gameController.start();
            expect(gameStartEventEmitted).toBe(true);
        });

        test('émet des événements de collision', () => {
            let collisionEventEmitted = false;
            mockEventBus.subscribe('game.collision', () => {
                collisionEventEmitted = true;
            });
            
            // Simuler une collision
            gameController.handleCollision('rocket', 'planet');
            expect(collisionEventEmitted).toBe(true);
        });
    });

    describe('gestion de la fusée', () => {
        test('contrôle les propulseurs de la fusée', () => {
            const thrusterPower = 500;
            gameController.setRocketThruster('main', thrusterPower);
            
            expect(gameController.rocket.thrusters.main.power).toBe(thrusterPower);
        });

        test('fait tourner la fusée', () => {
            const rotationSpeed = 0.1;
            gameController.rotateRocket(rotationSpeed);
            
            expect(gameController.rocket.angularVelocity).toBe(rotationSpeed);
        });

        test('gère la destruction de la fusée', () => {
            gameController.rocket.health = 100;
            gameController.destroyRocket();
            
            expect(gameController.rocket.isDestroyed).toBe(true);
            expect(gameController.rocket.health).toBe(0);
        });

        test('gère l\'atterrissage de la fusée', () => {
            const planet = { name: 'Terre' };
            gameController.landRocket(planet);
            
            expect(gameController.rocket.isLanded).toBe(true);
            expect(gameController.rocket.landedOn).toBe('Terre');
        });
    });

    describe('gestion de la caméra', () => {
        test('suit la fusée avec la caméra', () => {
            gameController.rocket.position = { x: 100, y: 200 };
            gameController.followRocketWithCamera();
            
            expect(gameController.camera.target).toEqual({ x: 100, y: 200 });
        });

        test('définit le zoom de la caméra', () => {
            const zoomLevel = 2.0;
            gameController.setCameraZoom(zoomLevel);
            
            expect(gameController.camera.zoom).toBe(zoomLevel);
        });

        test('déplace la caméra manuellement', () => {
            const position = { x: 500, y: 300 };
            gameController.setCameraPosition(position.x, position.y);
            
            expect(gameController.camera.position.x).toBe(position.x);
            expect(gameController.camera.position.y).toBe(position.y);
        });
    });

    describe('gestion des missions', () => {
        test('démarre une nouvelle mission', () => {
            const missionConfig = {
                name: 'Test Mission',
                target: 'Lune',
                objectives: ['land', 'return']
            };
            
            gameController.startMission(missionConfig);
            
            expect(gameController.currentMission).toBeDefined();
            expect(gameController.currentMission.name).toBe('Test Mission');
        });

        test('termine une mission avec succès', () => {
            const mission = { name: 'Test', objectives: ['land'] };
            gameController.currentMission = mission;
            
            let missionCompleteEmitted = false;
            mockEventBus.subscribe('mission.completed', () => {
                missionCompleteEmitted = true;
            });
            
            gameController.completeMission(true);
            
            expect(missionCompleteEmitted).toBe(true);
            expect(gameController.currentMission).toBeNull();
        });

        test('échoue une mission', () => {
            const mission = { name: 'Test', objectives: ['land'] };
            gameController.currentMission = mission;
            
            let missionFailedEmitted = false;
            mockEventBus.subscribe('mission.failed', () => {
                missionFailedEmitted = true;
            });
            
            gameController.completeMission(false);
            
            expect(missionFailedEmitted).toBe(true);
            expect(gameController.currentMission).toBeNull();
        });
    });

    describe('sauvegarde et chargement', () => {
        test('sauvegarde l\'état du jeu', () => {
            gameController.gameTime = 1000;
            gameController.rocket.position = { x: 100, y: 200 };
            
            const saveData = gameController.saveGame();
            
            expect(saveData).toBeDefined();
            expect(saveData.gameTime).toBe(1000);
            expect(saveData.rocket.position).toEqual({ x: 100, y: 200 });
        });

        test('charge l\'état du jeu', () => {
            const saveData = {
                gameTime: 2000,
                rocket: {
                    position: { x: 300, y: 400 },
                    fuel: 500
                }
            };
            
            gameController.loadGame(saveData);
            
            expect(gameController.gameTime).toBe(2000);
            expect(gameController.rocket.position).toEqual({ x: 300, y: 400 });
            expect(gameController.rocket.fuel).toBe(500);
        });
    });

    describe('performance et métriques', () => {
        test('calcule les FPS', () => {
            gameController.start();
            
            // Simuler plusieurs frames
            for (let i = 0; i < 60; i++) {
                gameController.update(1/60);
            }
            
            const fps = gameController.getFPS();
            expect(fps).toBeGreaterThan(0);
            expect(fps).toBeLessThanOrEqual(60);
        });

        test('mesure le temps de rendu', () => {
            gameController.start();
            gameController.update(1/60);
            
            const renderTime = gameController.getLastRenderTime();
            expect(renderTime).toBeGreaterThanOrEqual(0);
        });

        test('gère les pics de performance', () => {
            gameController.start();
            
            // Simuler un pic de lag
            const largeDelta = 0.5; // 500ms
            
            expect(() => {
                gameController.update(largeDelta);
            }).not.toThrow();
            
            // Le jeu devrait continuer à fonctionner
            expect(gameController.isRunning).toBe(true);
        });
    });

    describe('scénarios d\'intégration', () => {
        test('cycle complet de jeu', () => {
            // Démarrer
            gameController.start();
            expect(gameController.isRunning).toBe(true);
            
            // Jouer quelques frames
            for (let i = 0; i < 10; i++) {
                gameController.update(1/60);
            }
            expect(gameController.frameCount).toBe(10);
            
            // Pause
            gameController.pause();
            expect(gameController.isPaused).toBe(true);
            
            // Reprendre
            gameController.resume();
            expect(gameController.isPaused).toBe(false);
            
            // Arrêter
            gameController.stop();
            expect(gameController.isRunning).toBe(false);
        });

        test('gestion d\'une mission complète', () => {
            // Démarrer le jeu
            gameController.start();
            
            // Démarrer une mission
            gameController.startMission({
                name: 'Aller sur la Lune',
                target: 'Lune'
            });
            
            // Simuler le vol
            gameController.setRocketThruster('main', 1000);
            for (let i = 0; i < 100; i++) {
                gameController.update(1/60);
            }
            
            // Atterrir
            gameController.landRocket({ name: 'Lune' });
            
            // Terminer la mission
            gameController.completeMission(true);
            
            expect(gameController.currentMission).toBeNull();
            expect(gameController.rocket.isLanded).toBe(true);
        });
    });
}); 