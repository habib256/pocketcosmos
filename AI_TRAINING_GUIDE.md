# Guide d'Entraînement de l'Agent IA pour la Simulation de Fusée

## 🚀 Vue d'ensemble

Ce guide explique comment utiliser le système d'entraînement IA intégré pour entraîner un agent capable de contrôler une fusée dans la simulation spatiale. L'agent utilise un algorithme DQN (Deep Q-Network) avec TensorFlow.js.

## 📋 Prérequis

### ✅ Composants Implémentés

- **RocketAI.js** : Agent IA avec réseau de neurones DQN
- **HeadlessRocketEnvironment.js** : Environnement de simulation sans rendu graphique
- **TrainingOrchestrator.js** : Orchestrateur d'entraînement avec métriques et contrôles
- **training-interface.html** : Interface web pour surveiller l'entraînement
- **train.js** : Scripts de démonstration et d'entraînement

### ⚡ Nouvelles Fonctionnalités

1. **Entraînement Headless** : Simulation rapide sans rendu visuel
2. **Interface de Monitoring** : Suivi en temps réel des métriques
3. **Sauvegarde Automatique** : Checkpoints et modèles optimaux
4. **Early Stopping** : Arrêt automatique si pas d'amélioration
5. **Évaluation Périodique** : Tests sur environnement séparé
6. **Configuration Flexible** : Hyperparamètres ajustables

## 🎯 Comment Démarrer l'Entraînement

### Méthode 1 : Interface Web

1. Ouvrir `training-interface.html` dans un navigateur
2. Ajuster les paramètres d'entraînement :
   - **Épisodes** : 500-1000 pour un bon entraînement
   - **Taux d'apprentissage** : 0.001-0.005
   - **Epsilon** : Commencer à 1.0 pour l'exploration
   - **Objectif** : Choisir entre orbite, atterrissage, exploration
3. Cliquer sur "🎯 Démarrer l'Entraînement"
4. Surveiller les métriques en temps réel

### Méthode 2 : Console du Navigateur

```javascript
// Entraînement complet (500 épisodes)
demonstrateTraining();

// Entraînement rapide (100 épisodes)
quickTraining();

// Test de performance de l'environnement
benchmarkEnvironment();
```

### Méthode 3 : Code Personnalisé

```javascript
// Configuration personnalisée
const customConfig = {
    maxEpisodes: 1000,
    learningRate: 0.002,
    epsilon: 1.0,
    targetSuccessRate: 0.8,
    objective: 'orbit'
};

// Démarrage
const eventBus = new EventBus();
const trainer = new TrainingOrchestrator(eventBus);
await trainer.startTraining(customConfig);
```

## 📊 Métriques d'Entraînement

### Métriques Principales

- **Récompense Moyenne** : Progression de l'apprentissage
- **Taux de Succès** : Pourcentage d'épisodes réussis
- **Exploration (ε)** : Taux d'exploration vs exploitation
- **Perte d'Entraînement** : Qualité de l'apprentissage du réseau

### Critères de Succès

| Objectif | Critère de Succès | Récompense Typique |
|----------|-------------------|-------------------|
| **Orbite** | Maintenir une orbite stable | > 50 points |
| **Atterrissage** | Atterrir avec vitesse < 5 m/s | > 100 points |
| **Exploration** | Maximiser la distance parcourue | Variable |

## ⚙️ Configuration des Hyperparamètres

### Paramètres Recommandés

```javascript
const OPTIMAL_CONFIG = {
    // Durée d'entraînement
    maxEpisodes: 1000,
    maxStepsPerEpisode: 2000,
    
    // Réseau de neurones
    learningRate: 0.001,      // Plus faible = apprentissage stable
    batchSize: 64,            // Plus grand = apprentissage stable
    
    // Exploration vs Exploitation
    epsilon: 1.0,             // Exploration initiale maximale
    epsilonMin: 0.1,          // Exploration minimale finale
    epsilonDecay: 0.995,      // Décroissance progressive
    
    // Apprentissage par renforcement
    gamma: 0.99,              // Facteur de décompte futur
    replayBufferSize: 50000,  // Mémoire des expériences
    
    // Évaluation et sauvegarde
    evaluationInterval: 100,   // Évaluer tous les 100 épisodes
    checkpointInterval: 500,   // Sauvegarder tous les 500 épisodes
    targetSuccessRate: 0.8     // Objectif de 80% de succès
};
```

### Ajustement selon les Performances

| Problème | Solution |
|----------|----------|
| **Apprentissage trop lent** | ↑ learningRate, ↓ epsilon decay |
| **Instabilité** | ↓ learningRate, ↑ batchSize |
| **Pas d'exploration** | ↑ epsilon, ↓ epsilon decay |
| **Surapprentissage** | ↓ replay buffer, + early stopping |

## 🔬 Analyse des Résultats

### Graphiques de Performance

L'interface affiche deux graphiques principaux :

1. **Récompense au fil du temps** : Doit être croissante
2. **Perte d'entraînement** : Doit être décroissante et se stabiliser

### Diagnostic des Problèmes

#### Courbe de Récompense Plate
```
Causes possibles :
- Fonction de récompense mal calibrée
- Taux d'apprentissage trop faible
- Problème de normalisation des états
```

#### Instabilité dans l'Apprentissage
```
Solutions :
- Réduire le taux d'apprentissage
- Augmenter la taille du batch
- Ajuster le gamma (facteur de décompte)
```

#### Agent Bloqué dans un Comportement
```
Solutions :
- Augmenter l'exploration (epsilon)
- Modifier la fonction de récompense
- Redémarrer avec des poids aléatoires
```

## 🎮 Utilisation de l'Agent Entraîné

### Activation du Contrôle IA

1. **Dans le jeu principal** :
   - Appuyer sur la touche `I` pour activer/désactiver l'IA
   - L'IA prend le contrôle de la fusée automatiquement

2. **Via le code** :
   ```javascript
   // Activer l'IA
   eventBus.emit(EVENTS.AI.TOGGLE_CONTROL);
   
   // Charger un modèle pré-entraîné
   await rocketAI.loadModel();
   ```

### Test de Performance

```javascript
// Tester l'agent sur plusieurs missions
for (let mission of ['orbit', 'land', 'explore']) {
    rocketAI.setObjective(mission);
    // Lancer la simulation et observer les résultats
}
```

## 🔧 Dépannage

### Erreurs Communes

#### "Module not found" ou Scripts non chargés
```
Solution : Vérifier l'ordre de chargement dans index.html
L'ordre correct est :
1. EventTypes.js
2. Modèles (models/)
3. Contrôleurs de base (controllers/)
4. HeadlessRocketEnvironment.js
5. TrainingOrchestrator.js
6. train.js
```

#### Entraînement Très Lent
```
Solutions :
- Utiliser le mode headless (sans rendu)
- Réduire maxStepsPerEpisode
- Augmenter batchSize pour moins d'updates
- Fermer l'onglet de visualisation pendant l'entraînement
```

#### Modèle ne se Sauvegarde Pas
```
Vérifications :
- LocalStorage disponible dans le navigateur
- Pas de mode navigation privée
- Suffisamment d'espace de stockage
```

## 📈 Performance Attendue

### Benchmarks Typiques

| Métrique | Valeur Attendue | Temps Estimé |
|----------|----------------|--------------|
| **100 épisodes** | 20-30% succès | 2-5 minutes |
| **500 épisodes** | 60-80% succès | 10-20 minutes |
| **1000 épisodes** | 80-95% succès | 20-40 minutes |

### Facteurs Influençant la Performance

- **CPU/GPU** : WebGL accélère TensorFlow.js
- **Complexité de l'objectif** : Orbite < Atterrissage < Exploration complexe
- **Configuration** : Hyperparamètres optimaux essentiels

## 🚀 Prochaines Étapes

### Améliorations Possibles

1. **Architectures avancées** :
   - Réseaux convolutionnels pour l'analyse visuelle
   - LSTM pour la mémoire temporelle
   - Actor-Critic au lieu de DQN

2. **Environnements plus complexes** :
   - Obstacles spatiaux
   - Multiples corps célestes
   - Missions avec contraintes temporelles

3. **Apprentissage multi-objectifs** :
   - Optimiser plusieurs critères simultanément
   - Transfert d'apprentissage entre missions

4. **Interface avancée** :
   - Visualisation de l'espace des états
   - Analyse des stratégies apprises
   - Comparaison de différents modèles

## 📚 Ressources Supplémentaires

### Documentation Technique

- **TensorFlow.js** : https://www.tensorflow.org/js
- **Reinforcement Learning** : Sutton & Barto "Reinforcement Learning: An Introduction"
- **DQN Paper** : "Playing Atari with Deep Reinforcement Learning" (Mnih et al.)

### Exemples et Tutoriels

- **TensorFlow.js Examples** : https://github.com/tensorflow/tfjs-examples
- **DQN Implementation** : Voir `controllers/RocketAI.js`
- **Training Loop** : Voir `controllers/TrainingOrchestrator.js`

---

## 🎯 Résumé pour Démarrer Rapidement

1. **Ouvrir** `training-interface.html`
2. **Configurer** 500 épisodes, objectif "orbit"
3. **Démarrer** l'entraînement
4. **Surveiller** la progression (récompense croissante)
5. **Tester** l'agent dans le jeu principal (touche `I`)

**Temps estimé pour un agent fonctionnel : 15-30 minutes** 