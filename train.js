/**
 * @file train.js
 * Script de démonstration pour l'entraînement de l'agent IA
 * Utilise l'environnement headless pour un entraînement rapide
 */

// Configuration pour le mode démo d'entraînement
const TRAINING_DEMO_CONFIG = {
    maxEpisodes: 500,
    maxStepsPerEpisode: 1000,
    targetSuccessRate: 0.7,
    evaluationInterval: 50,
    checkpointInterval: 100,
    
    // Hyperparamètres optimisés pour la démo
    learningRate: 0.002,
    epsilon: 1.0,
    epsilonMin: 0.15,
    epsilonDecay: 0.995,
    gamma: 0.99,
    batchSize: 32,
    replayBufferSize: 10000,
    
    logInterval: 25,
    headlessMode: true
};

/**
 * Fonction principale de démonstration d'entraînement
 */
async function demonstrateTraining() {
    console.log('🚀 Démonstration d\'entraînement d\'IA pour la simulation de fusée');
    console.log('===============================================================');
    
    try {
        // Initialisation des composants nécessaires
        const eventBus = new EventBus();
        const trainingOrchestrator = new TrainingOrchestrator(eventBus);
        
        // Configuration des écouteurs d'événements pour le suivi
        setupTrainingEventListeners(eventBus);
        
        console.log('📊 Configuration d\'entraînement:');
        console.table(TRAINING_DEMO_CONFIG);
        
        // Démarrage de l'entraînement
        console.log('\n🎯 Démarrage de l\'entraînement...');
        await trainingOrchestrator.startTraining(TRAINING_DEMO_CONFIG);
        
    } catch (error) {
        console.error('❌ Erreur lors de la démonstration:', error);
    }
}

/**
 * Configure les écouteurs d'événements pour suivre l'entraînement
 */
function setupTrainingEventListeners(eventBus) {
    // Début d'entraînement
    eventBus.subscribe(window.EVENTS.AI.TRAINING_STARTED, (data) => {
        console.log('✅ Entraînement démarré à', new Date(data.timestamp).toLocaleTimeString());
    });
    
    // Progression de l'entraînement
    eventBus.subscribe(window.EVENTS.AI.TRAINING_PROGRESS, (data) => {
        if (data.episode % 50 === 0) { // Log tous les 50 épisodes
            const metrics = data.metrics;
            const avgReward = metrics.averageRewards.length > 0 ? 
                metrics.averageRewards.reduce((a, b) => a + b, 0) / metrics.averageRewards.length : 0;
            const successRate = (metrics.successfulEpisodes / metrics.episode * 100).toFixed(1);
            
            console.log(`📈 Épisode ${data.episode}/${data.config.maxEpisodes}: ` +
                       `Récompense moy=${avgReward.toFixed(2)}, ` +
                       `Succès=${successRate}%, ` +
                       `Exploration=${(data.metrics.explorationRates[data.metrics.explorationRates.length - 1] || 0).toFixed(3)}`);
        }
    });
    
    // Évaluations
    eventBus.subscribe(window.EVENTS.AI.EVALUATION_COMPLETED, (data) => {
        console.log(`🎯 Évaluation à l'épisode ${data.episode}: ` +
                   `Score=${data.averageScore.toFixed(2)}, ` +
                   `Succès=${(data.successRate * 100).toFixed(1)}%, ` +
                   `Meilleur=${data.bestScore.toFixed(2)}`);
    });
    
    // Fin d'entraînement
    eventBus.subscribe(window.EVENTS.AI.TRAINING_COMPLETED, (stats) => {
        console.log('\n🎉 Entraînement terminé!');
        console.log('===============================');
        console.log(`📊 Statistiques finales:`);
        console.log(`   Épisodes: ${stats.episodes}`);
        console.log(`   Étapes totales: ${stats.totalSteps}`);
        console.log(`   Durée: ${(stats.trainingDuration / 1000 / 60).toFixed(1)} minutes`);
        console.log(`   Taux de succès final: ${(stats.finalSuccessRate * 100).toFixed(1)}%`);
        console.log(`   Meilleure récompense: ${stats.bestAverageReward.toFixed(2)}`);
        console.log(`   Durée moyenne d'épisode: ${stats.averageEpisodeLength.toFixed(0)} étapes`);
        
        // Suggestions d'amélioration
        provideFeedback(stats);
    });
    
    // Erreurs
    eventBus.subscribe(window.EVENTS.AI.TRAINING_ERROR, (data) => {
        console.error('❌ Erreur d\'entraînement:', data.error);
    });
}

/**
 * Fournit un retour sur les performances et suggestions d'amélioration
 */
function provideFeedback(stats) {
    console.log('\n💡 Analyse et recommandations:');
    console.log('===============================');
    
    if (stats.finalSuccessRate < 0.3) {
        console.log('⚠️  Taux de succès faible. Suggestions:');
        console.log('   - Augmenter le nombre d\'épisodes d\'entraînement');
        console.log('   - Réduire le taux d\'apprentissage (learningRate)');
        console.log('   - Ajuster la fonction de récompense');
        console.log('   - Vérifier la normalisation des états');
    } else if (stats.finalSuccessRate < 0.6) {
        console.log('⚡ Performances modérées. Améliorations possibles:');
        console.log('   - Augmenter la taille du replay buffer');
        console.log('   - Ajuster epsilon decay pour plus d\'exploration');
        console.log('   - Optimiser l\'architecture du réseau');
    } else {
        console.log('🌟 Excellentes performances! L\'agent a bien appris.');
        console.log('   - Tester sur des scénarios plus complexes');
        console.log('   - Expérimenter avec different objectifs');
        console.log('   - Sauvegarder ce modèle comme référence');
    }
    
    if (stats.averageEpisodeLength > stats.episodes * 0.8) {
        console.log('⏱️  Épisodes très longs détectés:');
        console.log('   - L\'agent pourrait être bloqué dans certains états');
        console.log('   - Considérer une récompense de forme (shaping reward)');
        console.log('   - Réduire maxStepsPerEpisode pour forcer des décisions');
    }
    
    console.log('\n🔬 Pour des analyses plus poussées:');
    console.log('   - Visualiser les courbes d\'apprentissage');
    console.log('   - Analyser la distribution des actions');
    console.log('   - Tester l\'agent sur des scenarios spécifiques');
    console.log('   - Comparer avec des baselines (contrôle aléatoire, PID, etc.)');
}

/**
 * Fonction d'entraînement rapide pour tests
 */
async function quickTraining() {
    const quickConfig = {
        ...TRAINING_DEMO_CONFIG,
        maxEpisodes: 100,
        evaluationInterval: 20,
        checkpointInterval: 50,
        logInterval: 10
    };
    
    console.log('⚡ Entraînement rapide (100 épisodes)...');
    
    const eventBus = new EventBus();
    const trainingOrchestrator = new TrainingOrchestrator(eventBus);
    setupTrainingEventListeners(eventBus);
    
    await trainingOrchestrator.startTraining(quickConfig);
}

/**
 * Test de performance de l'environnement headless
 */
async function benchmarkEnvironment() {
    console.log('🏃‍♂️ Test de performance de l\'environnement...');
    
    const env = new HeadlessRocketEnvironment({
        maxStepsPerEpisode: 1000,
        rocketInitialState: {
            position: { x: 0, y: 0 },
            velocity: { x: 0, y: 0 },
            fuel: ROCKET.FUEL_CAPACITY,
            health: 100
        }
    });
    
    const numEpisodes = 10;
    const startTime = Date.now();
    
    for (let i = 0; i < numEpisodes; i++) {
        let state = env.reset();
        let done = false;
        let steps = 0;
        
        while (!done && steps < 1000) {
            // Action aléatoire pour le test
            const action = {
                mainThruster: Math.random() > 0.7 ? 1.0 : 0,
                rotationInput: (Math.random() - 0.5) * 2
            };
            
            const result = env.step(action);
            state = result.observation;
            done = result.done;
            steps++;
        }
    }
    
    const duration = Date.now() - startTime;
    const stepsPerSecond = (numEpisodes * 1000) / (duration / 1000);
    
    console.log(`⚡ Performance: ${stepsPerSecond.toFixed(0)} étapes/seconde`);
    console.log(`📊 ${numEpisodes} épisodes en ${duration}ms`);
}

// Exportation pour utilisation dans la console du navigateur
if (typeof window !== 'undefined') {
    window.demonstrateTraining = demonstrateTraining;
    window.quickTraining = quickTraining;
    window.benchmarkEnvironment = benchmarkEnvironment;
    
    // Instructions pour l'utilisateur
    console.log('\n🎮 Commandes disponibles dans la console:');
    console.log('   demonstrateTraining() - Démo complète d\'entraînement');
    console.log('   quickTraining() - Entraînement rapide (100 épisodes)');
    console.log('   benchmarkEnvironment() - Test de performance');
}

// Exportation pour Node.js (si applicable)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        demonstrateTraining,
        quickTraining,
        benchmarkEnvironment,
        TRAINING_DEMO_CONFIG
    };
} 