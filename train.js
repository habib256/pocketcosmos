/**
 * @file train.js
 * Script de démonstration pour l'entraînement de l'agent IA
 * Utilise l'environnement headless pour un entraînement rapide
 */

/**
 * Convertit un indice d'action du DQN en objet action pour HeadlessRocketEnvironment, à partir de
 * la table CANONIQUE `RocketAI.ACTION_THRUSTERS` — seule source de vérité partagée par le jeu,
 * l'entraînement et les diagnostics de ce fichier.
 *
 * Les QUATRE propulseurs sont toujours spécifiés : `step()` ne remet à zéro que les propulseurs
 * présents dans l'objet, si bien qu'une table partielle laisse un propulseur allumé indéfiniment.
 *
 * @param {number} indice - Indice de sortie du réseau.
 * @return {{mainThruster:number, rearThruster:number, leftThruster:number, rightThruster:number}}
 */
function _actionPourIndice(indice) {
    const noms = RocketAI.ACTION_NAMES;
    const nom = noms[indice] || 'noAction';
    const t = RocketAI.ACTION_THRUSTERS[nom] || RocketAI.ACTION_THRUSTERS.noAction;
    return {
        mainThruster: t.main,
        rearThruster: t.rear,
        leftThruster: t.left,
        rightThruster: t.right
    };
}

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
                    // Échelle positionnelle du corps de référence (env planétaire par défaut) :
                    // sans elle, buildStateVector retombe sur 150000 alors que l'entraînement
                    // orbit/land utilise positionScaleForBody — état hors distribution.
                    positionScale: RocketAI.positionScaleForBody(
                        (testEnv.universeModel.celestialBodies[0] || {}).radius),
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
                
                // Convertir en action environnement via la table CANONIQUE (RocketAI.ACTION_THRUSTERS),
                // seule source de vérité partagée par le jeu, l'entraînement et ce diagnostic.
                // Ce fichier dupliquait sa propre table, restée divergente : elle utilisait
                // `rotationInput` et ne spécifiait qu'une partie des propulseurs, si bien qu'un
                // 'thrustBackward' laissait l'arrière bloqué à MAX jusqu'à la fin de l'épisode.
                const action = _actionPourIndice(actionIndex);
                
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
        // Dimension lue à la source (AI_TRAINING.STATE.STATE_SIZE) : ce diagnostic présentait des
        // états à 10 dims (v1 du vecteur d'état) à un réseau en attendant 12, ce qui levait et
        // faisait sauter les tests 4 et 5.
        const N = RocketAI.STATE_SIZE;
        const testStates = [Array(N).fill(0.5), Array(N).fill(-0.5)];
        const testNextStates = [Array(N).fill(0.3), Array(N).fill(-0.3)];
        const testActions = [0, 1];
        const testRewards = [1.0, -1.0];
        
        // Simuler le calcul des Q-values
        const qValues = tf.tidy(() => rocketAI.model.predict(tf.tensor2d(testStates, [2, N])));
        const nextQValues = tf.tidy(() => rocketAI.model.predict(tf.tensor2d(testNextStates, [2, N])));
        
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
                state: Array(RocketAI.STATE_SIZE).fill(Math.random() * 0.1),
                action: Math.floor(Math.random() * 5),
                reward: Math.random() * 2 - 1,
                nextState: Array(RocketAI.STATE_SIZE).fill(Math.random() * 0.1),
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
/**
 * Évalue un modèle du zoo sur un jeu d'angles initiaux FIXE (objectif 'navigate'),
 * en politique gloutonne (ε=0). Renvoie { avgReward, successRate, medianStepsToSuccess }.
 * Le jeu d'angles fixe rend les scores comparables entre modèles.
 * @param {string} modelName - nom dans AIModelStore
 * @param {number[]} angles - angles initiaux (radians)
 * @param {object} pointB - cible { x, y }
 */
async function evaluateModelNavigate(modelName, angles, pointB = { x: 90000, y: 90000 }) {
    const eventBus = new EventBus();
    const rocketAI = new RocketAI(eventBus);
    if (typeof rocketAI.waitForReady === 'function') await rocketAI.waitForReady();

    const loaded = await rocketAI.loadModel(modelName);
    if (!loaded) throw new Error(`Modèle "${modelName}" introuvable ou incompatible`);
    rocketAI.isTraining = false; // politique gloutonne (pas d'exploration)

    const env = new HeadlessRocketEnvironment({
        maxStepsPerEpisode: 4000,
        infiniteFuel: true,
        rocketInitialState: {
            position: { x: 0, y: 0 }, velocity: { x: 0, y: 0 },
            angle: 0, fuel: ROCKET.FUEL_MAX, health: 100, isLanded: false, landedOn: null
        },
        universeConfig: { celestialBodies: [], targetPoint: pointB },
        missionConfig: { objective: 'navigate', targetPoint: pointB }
    });

    // Échelle positionnelle de la TÂCHE (|B−A|), identique à TrainingOrchestrator.getPositionScale :
    // sans elle, buildStateVector retombe sur 150000 et le modèle est noté hors de sa distribution.
    const positionScale = Math.hypot(pointB.x - 0, pointB.y - 0);

    let totalReward = 0, successCount = 0;
    const stepsToSuccess = [];
    for (let i = 0; i < angles.length; i++) {
        env.config.rocketInitialState.angle = angles[i];
        let state = env.reset();
        let done = false, reward = 0, steps = 0;
        while (!done && steps < 4000) {
            const aiState = RocketAI.buildStateVector({
                positionScale,
                x: state.rocketX || 0, y: state.rocketY || 0,
                vx: state.rocketVX || 0, vy: state.rocketVY || 0,
                angle: state.rocketAngle || 0, angularVelocity: state.rocketAngularVelocity || 0,
                targetX: pointB.x, targetY: pointB.y
            });
            // Table d'actions CANONIQUE (RocketAI.ACTION_THRUSTERS) : chaque action spécifie les
            // QUATRE propulseurs. Ce fichier dupliquait sa propre table où seul l'indice 1
            // mentionnait `rearThruster` — or step() ne touche qu'aux propulseurs PRÉSENTS dans
            // l'objet action : après un unique thrustBackward, le propulseur arrière restait à
            // fond jusqu'à la fin de l'épisode. compareModels() classait donc les modèles dans un
            // espace d'actions différent de celui de leur entraînement.
            const r = env.step(_actionPourIndice(rocketAI.act(aiState)));
            state = r.observation; reward += r.reward; done = r.done; steps++;
        }
        totalReward += reward;
        if (typeof env.checkNavigateSuccess === 'function' && env.checkNavigateSuccess()) {
            successCount++; stepsToSuccess.push(steps);
        }
    }
    rocketAI.cleanup();

    let median = null;
    if (stepsToSuccess.length) {
        stepsToSuccess.sort((a, b) => a - b);
        const m = Math.floor(stepsToSuccess.length / 2);
        median = stepsToSuccess.length % 2 ? stepsToSuccess[m]
            : Math.round((stepsToSuccess[m - 1] + stepsToSuccess[m]) / 2);
    }
    return {
        avgReward: totalReward / angles.length,
        successRate: successCount / angles.length,
        medianStepsToSuccess: median
    };
}

/**
 * Compare deux modèles 'navigate' du zoo sur le MÊME jeu d'évaluation (seed fixe).
 * Usage console : compareModels('navigate-v2', 'race-v1')
 * @param {string} nameA
 * @param {string} nameB
 * @param {number} [seed=1234] - seed du jeu d'angles fixe
 * @param {number} [n=10] - nombre d'épisodes d'évaluation
 */
async function compareModels(nameA, nameB, seed = 1234, n = 10) {
    console.log(`⚖️  Comparaison "${nameA}" vs "${nameB}" (seed=${seed}, ${n} épisodes)`);
    const angles = SeededRandom.angleSet(seed >>> 0, n);
    try {
        const [a, b] = await Promise.all([
            evaluateModelNavigate(nameA, angles),
            evaluateModelNavigate(nameB, angles)
        ]);
        const fmt = (m) => `récompense=${m.avgReward.toFixed(1)}  succès=${(m.successRate * 100).toFixed(0)}%  médiane steps=${m.medianStepsToSuccess ?? '—'}`;
        console.log(`   ${nameA} : ${fmt(a)}`);
        console.log(`   ${nameB} : ${fmt(b)}`);
        const winner = a.successRate !== b.successRate
            ? (a.successRate > b.successRate ? nameA : nameB)
            : (a.avgReward >= b.avgReward ? nameA : nameB);
        console.log(`   🏆 Meilleur : ${winner}`);
        return { [nameA]: a, [nameB]: b, winner };
    } catch (error) {
        console.error('❌ compareModels :', error.message);
        throw error;
    }
}

/**
 * Affiche la marche à suivre pour livrer un modèle du zoo dans le dépôt (assets/models/),
 * afin qu'il soit chargeable au démarrage du jeu par un PNJ.
 * @param {string} name - nom du modèle (celui exporté via downloads://)
 */
function printDeliveryInstructions(name) {
    console.log(
`
📦 LIVRAISON — pour rendre "${name}" chargeable au démarrage du jeu (PNJ) :
   1. Crée le dossier :   assets/models/${name}/
   2. Déplace-y les 3 fichiers téléchargés, en RENOMMANT deux d'entre eux :
        ${name}.json         →  assets/models/${name}/model.json
        ${name}.weights.bin  →  assets/models/${name}/${name}.weights.bin   (⚠️ garde ce nom exact :
                                  il est référencé à l'intérieur de model.json)
        ${name}.meta.json    →  assets/models/${name}/meta.json
   3. Commit le dossier. Le modèle se charge ensuite via  AIModelStore.load('${name}')
      (ou automatiquement s'il n'est pas déjà en IndexedDB).
`);
}

/**
 * Exporte un modèle DÉJÀ présent dans le zoo (entraîné via l'UI ou trainAndDeliver) vers des
 * fichiers téléchargés, et affiche la notice de livraison. Usage console : deliverModel('navigate-v1')
 * @param {string} name
 */
async function deliverModel(name) {
    try {
        await AIModelStore.exportToFile(name);
        printDeliveryInstructions(name);
        return true;
    } catch (error) {
        console.error(`❌ deliverModel("${name}") :`, error.message,
            '\n   (Le modèle existe-t-il dans le zoo ? Vérifie avec AIModelStore.list().)');
        return false;
    }
}

/**
 * ENTRAÎNE puis LIVRE un premier modèle, en headless, depuis la console (index.html ou
 * training-interface.html). Garde l'onglet actif pendant l'entraînement.
 *
 * Usage :
 *   await trainAndDeliver()                                  // navigate, 800 ép., seed 1234, nom 'navigate-v1'
 *   await trainAndDeliver({ role: 'race', episodes: 1200 })  // rôle course
 *   await trainAndDeliver({ objective: 'navigate', name: 'navigate-v1', export: false })
 *
 * @param {object} [opts]
 * @param {string} [opts.objective='navigate'] - objectif brut (si pas de rôle)
 * @param {string} [opts.role=null]            - rôle PNJ (race/intercept/lander/orbiter)
 * @param {number} [opts.episodes=800]         - nombre d'épisodes
 * @param {number} [opts.seed=1234]            - seed de reproductibilité
 * @param {string} [opts.name]                 - nom du modèle (défaut '<rôle|objectif>-v1')
 * @param {boolean}[opts.export=true]          - exporter les fichiers en fin d'entraînement
 * @return {Promise<{name:string, finalStats:object|null}>}
 */
async function trainAndDeliver(opts = {}) {
    const objective = opts.objective || 'navigate';
    const role = opts.role || null;
    const episodes = opts.episodes || 800;
    const seed = (opts.seed != null) ? opts.seed : 1234;
    const name = opts.name || ((role || objective) + '-v1');
    const doExport = (opts.export !== false);

    console.log(`🚀 Entraînement "${name}" — ${role ? 'rôle ' + role : 'objectif ' + objective}, ${episodes} épisodes, seed ${seed}`);
    console.log('   Headless. GARDE CET ONGLET ACTIF (le passage en arrière-plan ralentit fortement TF.js).');

    const eventBus = new EventBus();
    const orchestrator = new TrainingOrchestrator(eventBus);

    // Journal de progression (toutes les ~50 épisodes)
    let lastLogged = -Infinity;
    eventBus.subscribe(window.EVENTS.AI.TRAINING_PROGRESS, (d) => {
        const ep = (d && d.episode) || 0;
        if (ep - lastLogged >= 50) {
            lastLogged = ep;
            const m = (d && d.metrics) || {};
            const sr = (m.recentSuccessRate != null) ? (m.recentSuccessRate * 100).toFixed(0) : '?';
            console.log(`   ép ${ep}/${d.totalEpisodes}  succès≈${sr}%  steps/s ${m.stepsPerSecond || 0}`);
        }
    });
    let finalStats = null;
    eventBus.subscribe(window.EVENTS.AI.TRAINING_COMPLETED, (s) => { finalStats = s; });

    await orchestrator.startTraining({
        objectives: [objective],
        role: role,
        maxEpisodes: episodes,
        headlessMode: true,
        seed: seed,
        modelName: name
    });

    console.log(`✅ Entraînement terminé. Modèle "${name}" sauvegardé dans le zoo (IndexedDB).`);
    if (finalStats) {
        console.log(`   Succès final: ${((finalStats.finalSuccessRate || 0) * 100).toFixed(1)}%  |  meilleur score éval: ${(finalStats.bestAverageReward || 0).toFixed(1)}`);
    }

    if (typeof orchestrator.cleanup === 'function') orchestrator.cleanup();

    if (doExport) {
        console.log('⬇️  Export des fichiers (3 téléchargements)…');
        const ok = await deliverModel(name);
        if (!ok) console.warn('   Export échoué — réessaie avec  deliverModel("' + name + '")');
    } else {
        console.log(`ℹ️  Pour livrer plus tard :  deliverModel('${name}')`);
    }
    return { name, finalStats };
}

if (typeof window !== 'undefined') {
    window.demonstrateTraining = demonstrateTraining;
    window.quickTraining = quickTraining;
    window.benchmarkEnvironment = benchmarkEnvironment;
    window.testEvaluationMode = testEvaluationMode;
    window.diagnosticComplet = diagnosticComplet;
    window.testUpdateFrequency = testUpdateFrequency;
    window.compareModels = compareModels;
    window.evaluateModelNavigate = evaluateModelNavigate;
    window.trainAndDeliver = trainAndDeliver;
    window.deliverModel = deliverModel;
    
    // Instructions pour l'utilisateur
    console.log('\n🎮 Commandes disponibles dans la console:');
    console.log('   demonstrateTraining() - Démo complète d\'entraînement');
    console.log('   quickTraining() - Entraînement rapide (100 épisodes)');
    console.log('   benchmarkEnvironment() - Test de performance');
    console.log('   testEvaluationMode() - Test ε=0 pour détecter l\'apprentissage réel');
    console.log('   diagnosticComplet() - Diagnostic complet du système');
    console.log('   testUpdateFrequency() - Test du nombre d\'updates réels');
    console.log('   compareModels(a, b) - Compare 2 modèles du zoo sur un jeu d\'éval fixe');
    console.log('   trainAndDeliver() - Entraîne PUIS exporte un premier modèle (livraison assets/models/)');
    console.log('   deliverModel(name) - Exporte un modèle du zoo déjà entraîné (+ notice de livraison)');
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
        compareModels,
        evaluateModelNavigate,
        trainAndDeliver,
        deliverModel,
        TRAINING_DEMO_CONFIG
    };
} 