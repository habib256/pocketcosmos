/**
 * Tests unitaires pour EventBus
 */

describe('EventBus', () => {
    let eventBus;

    beforeEach(() => {
        eventBus = new EventBus();
    });

    afterEach(() => {
        // Nettoyer les événements si possible
        if (eventBus && typeof eventBus.clear === 'function') {
            eventBus.clear();
        }
    });

    describe('subscribe', () => {
        test('permet de s\'abonner à un événement', () => {
            const callback = jest.fn();
            
            expect(() => {
                eventBus.subscribe('test-event', callback);
            }).not.toThrow();
            
            // Tester que l'abonnement fonctionne en émettant l'événement
            eventBus.emit('test-event', { data: 'test' });
            expect(callback).toHaveBeenCalledWith({ data: 'test' });
        });

        test('permet plusieurs abonnements au même événement', () => {
            const callback1 = jest.fn();
            const callback2 = jest.fn();
            
            eventBus.subscribe('test-event', callback1);
            eventBus.subscribe('test-event', callback2);
            
            eventBus.emit('test-event', { data: 'test' });
            
            expect(callback1).toHaveBeenCalledWith({ data: 'test' });
            expect(callback2).toHaveBeenCalledWith({ data: 'test' });
        });

        test('gère les événements différents séparément', () => {
            const callback1 = jest.fn();
            const callback2 = jest.fn();
            
            eventBus.subscribe('event-1', callback1);
            eventBus.subscribe('event-2', callback2);
            
            eventBus.emit('event-1', { data: 'test1' });
            eventBus.emit('event-2', { data: 'test2' });
            
            expect(callback1).toHaveBeenCalledWith({ data: 'test1' });
            expect(callback2).toHaveBeenCalledWith({ data: 'test2' });
            expect(callback1).not.toHaveBeenCalledWith({ data: 'test2' });
            expect(callback2).not.toHaveBeenCalledWith({ data: 'test1' });
        });
    });

    describe('emit', () => {
        test('déclenche les callbacks abonnés', () => {
            const callback = jest.fn();
            eventBus.subscribe('test-event', callback);
            
            eventBus.emit('test-event', { data: 'test' });
            
            expect(callback).toHaveBeenCalledTimes(1);
            expect(callback).toHaveBeenCalledWith({ data: 'test' });
        });

        test('déclenche tous les callbacks abonnés', () => {
            const callback1 = jest.fn();
            const callback2 = jest.fn();
            
            eventBus.subscribe('test-event', callback1);
            eventBus.subscribe('test-event', callback2);
            
            eventBus.emit('test-event', { data: 'test' });
            
            expect(callback1).toHaveBeenCalledTimes(1);
            expect(callback2).toHaveBeenCalledTimes(1);
            expect(callback1).toHaveBeenCalledWith({ data: 'test' });
            expect(callback2).toHaveBeenCalledWith({ data: 'test' });
        });

        test('ne déclenche rien pour un événement sans abonnés', () => {
            const callback = jest.fn();
            eventBus.subscribe('other-event', callback);
            
            eventBus.emit('test-event', { data: 'test' });
            
            expect(callback).not.toHaveBeenCalled();
        });

        test('gère les données nulles ou undefined', () => {
            const callback = jest.fn();
            eventBus.subscribe('test-event', callback);
            
            eventBus.emit('test-event', null);
            eventBus.emit('test-event', undefined);
            eventBus.emit('test-event');
            
            expect(callback).toHaveBeenCalledTimes(3);
            expect(callback).toHaveBeenNthCalledWith(1, null);
            expect(callback).toHaveBeenNthCalledWith(2, undefined);
            expect(callback).toHaveBeenNthCalledWith(3, undefined);
        });
    });

    describe('unsubscribe', () => {
        test('supprime un callback spécifique', () => {
            const callback1 = jest.fn();
            const callback2 = jest.fn();
            
            eventBus.subscribe('test-event', callback1);
            eventBus.subscribe('test-event', callback2);
            
            eventBus.unsubscribe('test-event', callback1);
            
            eventBus.emit('test-event', { data: 'test' });
            
            expect(callback1).not.toHaveBeenCalled();
            expect(callback2).toHaveBeenCalledWith({ data: 'test' });
        });

        test('ne fait rien si le callback n\'existe pas', () => {
            const callback1 = jest.fn();
            const callback2 = jest.fn();
            
            eventBus.subscribe('test-event', callback1);
            
            expect(() => {
                eventBus.unsubscribe('test-event', callback2);
            }).not.toThrow();
            
            eventBus.emit('test-event', { data: 'test' });
            expect(callback1).toHaveBeenCalledWith({ data: 'test' });
        });

        test('ne fait rien si l\'événement n\'existe pas', () => {
            const callback = jest.fn();
            
            expect(() => {
                eventBus.unsubscribe('non-existent-event', callback);
            }).not.toThrow();
        });

        test('après désabonnement, le callback n\'est plus appelé', () => {
            const callback = jest.fn();
            
            eventBus.subscribe('test-event', callback);
            eventBus.emit('test-event', { data: 'test1' });
            
            eventBus.unsubscribe('test-event', callback);
            eventBus.emit('test-event', { data: 'test2' });
            
            expect(callback).toHaveBeenCalledTimes(1);
            expect(callback).toHaveBeenCalledWith({ data: 'test1' });
        });
    });

    describe('publish (alias pour emit)', () => {
        test('fonctionne comme emit', () => {
            const callback = jest.fn();
            eventBus.subscribe('test-event', callback);
            
            eventBus.publish('test-event', { data: 'test' });
            
            expect(callback).toHaveBeenCalledTimes(1);
            expect(callback).toHaveBeenCalledWith({ data: 'test' });
        });
    });

    describe('scénarios d\'intégration', () => {
        test('gère un flux d\'événements complexe', () => {
            const results = [];
            
            const callback1 = (data) => results.push(`cb1: ${data.value}`);
            const callback2 = (data) => results.push(`cb2: ${data.value}`);
            
            eventBus.subscribe('event-a', callback1);
            eventBus.subscribe('event-b', callback2);
            eventBus.subscribe('event-a', callback2);
            
            eventBus.emit('event-a', { value: 1 });
            eventBus.emit('event-b', { value: 2 });
            eventBus.emit('event-a', { value: 3 });
            
            expect(results).toEqual([
                'cb1: 1', 'cb2: 1',  // event-a
                'cb2: 2',            // event-b
                'cb1: 3', 'cb2: 3'   // event-a
            ]);
        });

        test('gère les erreurs dans les callbacks', () => {
            const goodCallback = jest.fn();
            const badCallback = jest.fn(() => {
                throw new Error('Callback error');
            });
            
            eventBus.subscribe('test-event', goodCallback);
            eventBus.subscribe('test-event', badCallback);
            
            // L'EventBus devrait gérer les erreurs sans planter
            expect(() => {
                eventBus.emit('test-event', { data: 'test' });
            }).not.toThrow();
            
            expect(goodCallback).toHaveBeenCalled();
            expect(badCallback).toHaveBeenCalled();
        });

        test('performance avec beaucoup d\'événements', () => {
            const callbacks = [];
            
            // Créer 100 callbacks
            for (let i = 0; i < 100; i++) {
                const callback = jest.fn();
                callbacks.push(callback);
                eventBus.subscribe('performance-test', callback);
            }
            
            const startTime = performance.now();
            eventBus.emit('performance-test', { data: 'test' });
            const endTime = performance.now();
            
            // Vérifier que tous les callbacks ont été appelés
            callbacks.forEach(callback => {
                expect(callback).toHaveBeenCalledTimes(1);
            });
            
            // Le temps d'exécution devrait être raisonnable (< 10ms)
            expect(endTime - startTime).toBeLessThan(10);
        });
    });
}); 