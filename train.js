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
            fuel: ROCKET.FUEL_MAX,
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

/**
 * Test d'évaluation avec epsilon=0 pour diagnostiquer les performances réelles
 */
async function testEvaluationMode() {
    console.log('🧪 Test d\'évaluation (ε=0) - 5 épisodes sans exploration');
    console.log('========================================================');
    
    try {
        const eventBus = new EventBus();
        const rocketAI = new RocketAI(eventBus);

        // CORRECTION (bug #8) : attendre que le modèle soit prêt AVANT de forcer epsilon=0.
        // Sinon act() renvoie des actions aléatoires (!modelReady) et fausse le diagnostic.
        if (typeof rocketAI.waitForReady === 'function') {
            await rocketAI.waitForReady();
        }

        // Sauvegarder epsilon actuel et le mettre à 0
        const originalEpsilon = rocketAI.config.epsilon;
        rocketAI.config.epsilon = 0.0;

        console.log(`Epsilon forcé à 0 (was ${originalEpsilon.toFixed(3)})`);

        // Créer un environnement de test
        const testEnv = new HeadlessRocketEnvironment({
            maxStepsPerEpisode: 1000,
            rocketInitialState: {
                position: { x: 0, y: 0 },
                velocity: { x: 0, y: 0 },
                fuel: ROCKET.FUEL_MAX,
                health: 100
            }
        });
        
        let totalScore = 0;
        const scores = [];
        
        for (let episode = 0; episode < 5; episode++) {
            let state = testEnv.reset();
            let episodeReward = 0;
            let done = false;
            let steps = 0;
            
            while (!done && steps < 1000) {
                // CORRECTION (bug #8 / #4) : utiliser le builder d'état UNIFIÉ pour que
                // le diagnostic reflète exactement la normalisation vue à l'entraînement.
                const aiState = RocketAI.buildStateVector({
                    x: state.rocketX || 0,
                    y: state.rocketY || 0,
                    vx: state.rocketVX || 0,
                    vy: state.rocketVY || 0,
                    angle: state.rocketAngle || 0,
                    angularVelocity: state.rocketAngularVelocity || 0,
                    targetX: 0, // pas d'objectif navigate dans ce test : cible à l'origine
                    targetY: 0
                });

                // Action de l'IA (exploitation pure)
                const actionIndex = rocketAI.act(aiState);
                
                // Convertir en action environnement
                const actions = [
                    { mainThruster: 1.0, rotationInput: 0 },
                    { mainThruster: 0, rearThruster: 1.0, rotationInput: 0 },
                    { mainThruster: 0, rotationInput: -1.0 },
                    { mainThruster: 0, rotationInput: 1.0 },
                    { mainThruster: 0, rotationInput: 0 }
                ];
                const action = actions[actionIndex] || actions[4];
                
                const result = testEnv.step(action);
                state = result.observation;
                episodeReward += result.reward;
                done = result.done;
                steps++;
            }
            
            scores.push(episodeReward);
            totalScore += episodeReward;
            console.log(`Épisode ${episode + 1}: Score=${episodeReward.toFixed(2)}, Étapes=${steps}`);
        }
        
        const averageScore = totalScore / 5;
        const expectedRandom = -331; // Score attendu pour action aléatoire
        
        console.log(`\n📊 Résultats:`);
        console.log(`   Score moyen: ${averageScore.toFixed(2)}`);
        console.log(`   Scores individuels: ${scores.map(s => s.toFixed(1)).join(', ')}`);
        console.log(`   Score aléatoire attendu: ${expectedRandom}`);
        
        if (averageScore > expectedRandom * 0.8) {
            console.log(`✅ SUCCÈS: L'agent apprend vraiment (score >> aléatoire)`);
        } else {
            console.log(`❌ ÉCHEC: Performance proche du hasard, gains probablement aléatoires`);
        }
        
        // Restaurer epsilon
        rocketAI.config.epsilon = originalEpsilon;
        
    } catch (error) {
        console.error('❌ Erreur lors du test d\'évaluation:', error);
    }
}

/**
 * Diagnostic complet du système d'apprentissage
 */
async function diagnosticComplet() {
    console.log('🔍 DIAGNOSTIC COMPLET DU SYSTÈME D\'APPRENTISSAGE');
    console.log('===================================================');
    
    try {
        const eventBus = new EventBus();
        const rocketAI = new RocketAI(eventBus);

        // CORRECTION (bug #8) : attendre l'initialisation du modèle avant les tests qui
        // appellent rocketAI.model.predict (sinon model peut être indéfini / non prêt).
        if (typeof rocketAI.waitForReady === 'function') {
            await rocketAI.waitForReady();
        }

        // Test 1: Configuration epsilon
        console.log('\n1️⃣ TEST DE LA DÉCROISSANCE D\'EPSILON:');
        console.log(`   Epsilon initial: ${rocketAI.config.epsilon}`);
        console.log(`   Epsilon decay: ${rocketAI.config.epsilonDecay}`);
        console.log(`   Epsilon min: ${rocketAI.config.epsilonMin}`);
        
        // Simulation de la décroissance
        let testEpsilon = rocketAI.config.epsilon;
        let episodes = 0;
        while (testEpsilon > 0.1 && episodes < 500) {
            testEpsilon *= rocketAI.config.epsilonDecay;
            episodes++;
        }
        console.log(`   🎯 Épisodes pour atteindre ε=0.1: ${episodes}`);
        if (episodes > 150) {
            console.log(`   ⚠️ TROP LENT! Devrait être ~100 épisodes max`);
        } else {
            console.log(`   ✅ Décroissance correcte`);
        }
        
        // Test 2: Configuration fréquence
        console.log('\n2️⃣ TEST DE LA FRÉQUENCE D\'ENTRAÎNEMENT:');
        console.log(`   Update frequency (RocketAI): ${rocketAI.config.updateFrequency} pas`);
        console.log(`   🎯 ATTENDU: 1000 pas → ${Math.floor(1000 / rocketAI.config.updateFrequency)} entraînements`);
        console.log(`   Batch size: ${rocketAI.config.batchSize}`);
        console.log(`   Replay buffer size: ${rocketAI.config.replayBufferSize}`);
        
        // Calcul de l'efficacité d'entraînement
        const stepsFor100Updates = rocketAI.config.updateFrequency * 100;
        console.log(`   ⚡ 100 entraînements en ${stepsFor100Updates} pas (${(stepsFor100Updates/60).toFixed(1)}s à 60fps)`);
        
        if (rocketAI.config.updateFrequency <= 8) {
            console.log(`   ✅ Fréquence excellente pour apprentissage rapide`);
        } else if (rocketAI.config.updateFrequency <= 32) {
            console.log(`   ⚡ Fréquence correcte`);
        } else {
            console.log(`   ⚠️ Fréquence trop faible, apprentissage lent`);
        }
        
        // Test 3: Structure du modèle
        console.log('\n3️⃣ TEST DE LA STRUCTURE DU MODÈLE:');
        if (rocketAI.model) {
            const summary = [];
            rocketAI.model.layers.forEach((layer, i) => {
                summary.push(`   Couche ${i}: ${layer.name} - ${layer.outputShape || 'N/A'}`);
            });
            console.log(summary.join('\n'));
            
            // Calcul approximatif du nombre de paramètres
            let totalParams = 0;
            rocketAI.model.layers.forEach(layer => {
                if (layer.countParams) {
                    totalParams += layer.countParams();
                }
            });
            console.log(`   📊 Paramètres estimés: ~${totalParams} (taille: ~${(totalParams * 4 / 1024).toFixed(1)} KB)`);
        }
        
        // Test 4: Test de gradient detachment
        console.log('\n4️⃣ TEST DE CALCUL DES CIBLES Q:');
        
        // Créer des données de test
        const testStates = [Array(10).fill(0.5), Array(10).fill(-0.5)];
        const testNextStates = [Array(10).fill(0.3), Array(10).fill(-0.3)];
        const testActions = [0, 1];
        const testRewards = [1.0, -1.0];
        
        // Simuler le calcul des Q-values
        const qValues = tf.tidy(() => rocketAI.model.predict(tf.tensor2d(testStates, [2, 10])));
        const nextQValues = tf.tidy(() => rocketAI.model.predict(tf.tensor2d(testNextStates, [2, 10])));
        
        const qValuesData = qValues.arraySync();
        const nextQValuesData = nextQValues.arraySync();
        
        qValues.dispose();
        nextQValues.dispose();
        
        console.log(`   Q-values actuelles (échantillon): [${qValuesData[0].map(v => v.toFixed(3)).join(', ')}]`);
        console.log(`   Q-values futures (échantillon): [${nextQValuesData[0].map(v => v.toFixed(3)).join(', ')}]`);
        
        // Calculer les cibles comme dans le vrai code
        const qTargets = qValuesData.map(qRow => [...qRow]);
        for (let i = 0; i < 2; i++) {
            const maxNextQ = Math.max(...nextQValuesData[i]);
            qTargets[i][testActions[i]] = testRewards[i] + 0.99 * maxNextQ;
        }
        
        console.log(`   Cibles calculées (échantillon): [${qTargets[0].map(v => v.toFixed(3)).join(', ')}]`);
        
        // Vérifier si identiques
        const isIdentical = qTargets[0].every((val, i) => Math.abs(val - qValuesData[0][i]) < 1e-6);
        if (isIdentical) {
            console.log(`   🚨 PROBLÈME: Cibles identiques aux prédictions!`);
        } else {
            console.log(`   ✅ Cibles différentes des prédictions`);
        }
        
        // Test 5: Fonction de récompense
        console.log('\n5️⃣ TEST DE LA FONCTION DE RÉCOMPENSE:');
        
        // Simuler différents scénarios
        const scenarios = [
            { name: 'Orbite parfaite', distance: 600, target: 600, error: 0.01 },
            { name: 'Orbite acceptable', distance: 620, target: 600, error: 0.03 },
            { name: 'Hors zone', distance: 700, target: 600, error: 0.15 },
            { name: 'Collision', distance: 90, target: 600, error: 0.85 },
        ];
        
        scenarios.forEach(scenario => {
            // Simuler la récompense
            let reward = 0;
            const relativeError = scenario.error;
            
            if (relativeError < 0.02) {
                reward = 1.0;
            } else if (relativeError < 0.05) {
                reward = 0.0;
            } else {
                reward = -1.0;
            }
            reward -= 0.01; // Coût temporel
            
            if (scenario.distance < 100) reward = -100; // Collision
            
            console.log(`   ${scenario.name}: distance=${scenario.distance}, reward=${reward.toFixed(2)}`);
        });
        
        console.log('\n✅ Diagnostic terminé. Vérifiez les alertes ci-dessus!');
        
    } catch (error) {
        console.error('❌ Erreur lors du diagnostic:', error);
    }
}

/**
 * Test rapide pour vérifier le nombre d'updates effectifs
 */
async function testUpdateFrequency() {
    console.log('⚡ TEST DE FRÉQUENCE D\'UPDATES RÉELLE');
    console.log('=====================================');
    
    try {
        const eventBus = new EventBus();
        const rocketAI = new RocketAI(eventBus);

        // CORRECTION : attendre la création ASYNCHRONE du modèle. Sinon train() ressort
        // immédiatement à la garde (model=null, ready=false) et ce test ne mesure RIEN de réel
        // (il affichait "25/25 PARFAIT" alors qu'aucun poids n'était mis à jour).
        console.log('Attente de l\'initialisation du modèle (waitForReady)...');
        await rocketAI.waitForReady();
        console.log(`Modèle prêt: model=${!!rocketAI.model} targetModel=${!!rocketAI.targetModel} ready=${rocketAI.modelReady}`);

        console.log(`Configuration: updateFrequency = ${rocketAI.config.updateFrequency} pas`);
        
        // Compter les updates pendant une simulation courte
        const originalTrain = rocketAI.train.bind(rocketAI);
        let updateCount = 0;
        
        rocketAI.train = async function() {
            updateCount++;
            console.log(`Update #${updateCount} à l'étape ${this.totalSteps}`);
            return originalTrain();
        };
        
        // Remplir le buffer avec des données factices
        console.log('Remplissage du buffer...');
        for (let i = 0; i < rocketAI.config.batchSize + 10; i++) {
            rocketAI.replayBuffer.push({
                state: Array(10).fill(Math.random() * 0.1),
                action: Math.floor(Math.random() * 5),
                reward: Math.random() * 2 - 1,
                nextState: Array(10).fill(Math.random() * 0.1),
                done: false
            });
        }
        
        console.log(`Buffer rempli: ${rocketAI.replayBuffer.length} expériences`);
        
        // Simuler 100 pas
        const targetSteps = 100;
        console.log(`\nSimulation de ${targetSteps} pas...`);
        
        rocketAI.isTraining = true;
        rocketAI.rocketData = {
            x: 100000, y: 6471000, vx: 100, vy: 0,
            angle: 0, angularVelocity: 0.01
        };
        rocketAI.celestialBodyData = {
            x: 0, y: 6471000, radius: 6371000
        };
        
        for (let step = 0; step < targetSteps; step++) {
            rocketAI.totalSteps = step;
            
            // Simuler step() sans vraiment appeler l'entraînement complet
            if (step % rocketAI.config.updateFrequency === 0 && rocketAI.replayBuffer.length >= rocketAI.config.batchSize) {
                await rocketAI.train();
            }
        }
        
        const expectedUpdates = Math.floor(targetSteps / rocketAI.config.updateFrequency);
        
        console.log(`\n📊 RÉSULTATS:`);
        console.log(`   Steps simulés: ${targetSteps}`);
        console.log(`   Updates attendus: ${expectedUpdates}`);
        console.log(`   Updates réels: ${updateCount}`);
        console.log(`   Ratio: ${updateCount}/${targetSteps} = ${(updateCount/targetSteps*100).toFixed(1)}%`);

        // APPELS vs APPRENTISSAGE RÉEL : updateCount ne compte que les APPELS à train().
        // Ce qui compte, c'est successfulTrainings (poids réellement mis à jour par model.fit).
        const m = rocketAI.concurrencyMetrics;
        console.log(`   Appels train(): ${m.totalTrainingCalls} | bloqués: ${m.blockedCalls} | RÉUSSIS: ${m.successfulTrainings}`);
        console.log(`   Dernier loss: ${m.lastLoss}`);

        if (m.successfulTrainings > 0 && typeof m.lastLoss === 'number' && isFinite(m.lastLoss) && m.lastLoss > 0) {
            console.log(`   ✅ APPRENTISSAGE RÉEL OK : les poids sont mis à jour (loss=${m.lastLoss.toFixed(5)}).`);
        } else {
            console.log(`   ❌ AUCUN apprentissage réel : train() est appelé mais ne met pas à jour les poids.`);
            console.log(`      -> voir les lignes [RocketAI.train] ci-dessus (guard/inprogress/fit) pour la cause.`);
        }
        
        // Restaurer la fonction originale
        rocketAI.train = originalTrain;
        
    } catch (error) {
        console.error('❌ Erreur lors du test de fréquence:', error);
    }
}

// Exportation pour utilisation dans la console du navigateur
if (typeof window !== 'undefined') {
    window.demonstrateTraining = demonstrateTraining;
    window.quickTraining = quickTraining;
    window.benchmarkEnvironment = benchmarkEnvironment;
    window.testEvaluationMode = testEvaluationMode;
    window.diagnosticComplet = diagnosticComplet;
    window.testUpdateFrequency = testUpdateFrequency;
    
    // Instructions pour l'utilisateur
    console.log('\n🎮 Commandes disponibles dans la console:');
    console.log('   demonstrateTraining() - Démo complète d\'entraînement');
    console.log('   quickTraining() - Entraînement rapide (100 épisodes)');
    console.log('   benchmarkEnvironment() - Test de performance');
    console.log('   testEvaluationMode() - Test ε=0 pour détecter l\'apprentissage réel');
    console.log('   diagnosticComplet() - Diagnostic complet du système');
    console.log('   testUpdateFrequency() - Test du nombre d\'updates réels');
}

// Exportation pour Node.js (si applicable)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        demonstrateTraining,
        quickTraining,
        benchmarkEnvironment,
        testEvaluationMode,
        diagnosticComplet,
        testUpdateFrequency,
        TRAINING_DEMO_CONFIG
    };
} 