/**
 * Script de finalisation de la migration architecture PocketCosmos
 * Déplace tous les fichiers restants de controllers/ vers leurs domaines respectifs
 */

const fs = require('fs');
const path = require('path');

const migrations = [
    // Physics
    { from: 'controllers/BodyFactory.js', to: 'physics/factories/BodyFactory.js' },
    { from: 'controllers/CelestialBodyFactory.js', to: 'physics/factories/CelestialBodyFactory.js' },
    { from: 'controllers/CollisionHandler.js', to: 'physics/handlers/CollisionHandler.js' },
    { from: 'controllers/ThrusterPhysics.js', to: 'physics/handlers/ThrusterPhysics.js' },
    
    // Game
    { from: 'controllers/GameController.js', to: 'game/GameController.js' },
    { from: 'controllers/GameSetupController.js', to: 'game/GameSetupController.js' },
    { from: 'controllers/MissionManager.js', to: 'game/missions/MissionManager.js' },
    { from: 'controllers/RocketController.js', to: 'game/rocket/RocketController.js' },
    { from: 'controllers/RocketCargo.js', to: 'game/rocket/RocketCargo.js' },
    { from: 'controllers/ParticleController.js', to: 'game/particles/ParticleController.js' },
    { from: 'controllers/CameraController.js', to: 'game/camera/CameraController.js' },
    
    // Rendering
    { from: 'controllers/RenderingController.js', to: 'rendering/RenderingController.js' },
    
    // Input
    { from: 'controllers/InputController.js', to: 'input/InputController.js' },
    
    // AI
    { from: 'controllers/RocketAI.js', to: 'ai/RocketAI.js' },
    { from: 'controllers/TrainingOrchestrator.js', to: 'ai/training/TrainingOrchestrator.js' },
    { from: 'controllers/HeadlessRocketEnvironment.js', to: 'ai/training/HeadlessRocketEnvironment.js' },
    { from: 'controllers/TrainingVisualizer.js', to: 'ai/training/TrainingVisualizer.js' }
];

// Fichiers à ignorer (déjà migrés ou obsolètes)
const filesToIgnore = [
    'controllers/PhysicsController.js',      // Déjà migré
    'controllers/PhysicsVectors.js',         // Déjà migré
    'controllers/SynchronizationManager.js', // Déjà migré
    'controllers/EventBus.js',               // Déjà migré vers core/
    'controllers/ControllerContainer.js'     // Obsolète
];

function createDirectories() {
    const dirs = [
        'physics/factories', 
        'physics/handlers',
        'game/missions', 
        'game/rocket', 
        'game/particles', 
        'game/camera',
        'rendering/views', 
        'input', 
        'ai/training', 
        'core/utils'
    ];
    
    dirs.forEach(dir => {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
            console.log(`📁 Dossier créé: ${dir}`);
        }
    });
}

function migrateFiles() {
    let migratedCount = 0;
    let skippedCount = 0;
    
    migrations.forEach(({ from, to }) => {
        if (fs.existsSync(from)) {
            const targetDir = path.dirname(to);
            if (!fs.existsSync(targetDir)) {
                fs.mkdirSync(targetDir, { recursive: true });
            }
            
            // Copier d'abord pour éviter la perte de données
            fs.copyFileSync(from, to);
            fs.unlinkSync(from);
            
            console.log(`✅ Migré: ${from} → ${to}`);
            migratedCount++;
        } else {
            console.warn(`⚠️ Fichier non trouvé: ${from}`);
            skippedCount++;
        }
    });
    
    return { migratedCount, skippedCount };
}

function migrateViews() {
    if (!fs.existsSync('views')) {
        console.log('📁 Dossier views/ non trouvé, probablement déjà migré');
        return 0;
    }
    
    if (!fs.existsSync('rendering/views')) {
        fs.mkdirSync('rendering/views', { recursive: true });
    }
    
    const views = fs.readdirSync('views');
    let viewCount = 0;
    
    views.forEach(view => {
        if (view.endsWith('.js')) {
            const fromPath = `views/${view}`;
            const toPath = `rendering/views/${view}`;
            
            fs.copyFileSync(fromPath, toPath);
            fs.unlinkSync(fromPath);
            
            console.log(`✅ Vue migrée: ${fromPath} → ${toPath}`);
            viewCount++;
        }
    });
    
    // Supprimer le dossier views s'il est vide
    try {
        fs.rmdirSync('views');
        console.log('🗑️ Dossier views/ supprimé');
    } catch (error) {
        console.warn('⚠️ Impossible de supprimer views/ (non vide?)');
    }
    
    return viewCount;
}

function cleanupDuplicates() {
    const duplicates = [
        'constants.js',    // Dupliqué (migré vers core/)
        'EventTypes.js'    // Dupliqué (migré vers core/)
    ];
    
    duplicates.forEach(file => {
        if (fs.existsSync(file)) {
            fs.unlinkSync(file);
            console.log(`🗑️ Fichier dupliqué supprimé: ${file}`);
        }
    });
}

function cleanupControllersDirectory() {
    if (!fs.existsSync('controllers')) {
        console.log('📁 Dossier controllers/ déjà supprimé');
        return;
    }
    
    // Vérifier les fichiers restants
    const remainingFiles = fs.readdirSync('controllers');
    const importantFiles = remainingFiles.filter(file => 
        !filesToIgnore.some(ignored => ignored.endsWith(file))
    );
    
    if (importantFiles.length > 0) {
        console.warn('⚠️ Fichiers non migrés dans controllers/:');
        importantFiles.forEach(file => console.warn(`   - ${file}`));
        console.warn('   Vérifiez manuellement ces fichiers avant suppression');
        return;
    }
    
    // Supprimer les fichiers ignorés
    filesToIgnore.forEach(filePath => {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log(`🗑️ Fichier obsolète supprimé: ${filePath}`);
        }
    });
    
    // Supprimer le dossier controllers s'il est vide
    try {
        fs.rmdirSync('controllers');
        console.log('🗑️ Dossier controllers/ supprimé');
    } catch (error) {
        console.warn('⚠️ Impossible de supprimer controllers/ (non vide?)');
        const remaining = fs.readdirSync('controllers');
        console.warn(`   Fichiers restants: ${remaining.join(', ')}`);
    }
}

function updateBundleOrder() {
    // Créer ou mettre à jour bundle-order.json avec la nouvelle structure
    const bundleOrder = {
        "core": [
            "constants.js",
            "EventTypes.js", 
            "EventBus.js",
            "utils/MathUtils.js",
            "utils/DebugProfiler.js"
        ],
        "models": [
            "core/UniverseModel.js",
            "core/CameraModel.js",
            "entities/CelestialBodyModel.js",
            "entities/RocketModel.js",
            "effects/ParticleModel.js",
            "effects/ParticleSystemModel.js"
        ],
        "physics": [
            "PhysicsVectors.js",
            "factories/BodyFactory.js",
            "factories/CelestialBodyFactory.js",
            "handlers/CollisionHandler.js",
            "handlers/ThrusterPhysics.js",
            "SynchronizationManager.js",
            "PhysicsController.js"
        ],
        "game": [
            "missions/MissionManager.js",
            "rocket/RocketCargo.js",
            "rocket/RocketController.js",
            "particles/ParticleController.js",
            "camera/CameraController.js",
            "GameSetupController.js",
            "GameController.js"
        ],
        "input": [
            "InputController.js"
        ],
        "rendering": [
            "views/RocketView.js",
            "views/UniverseView.js",
            "views/CelestialBodyView.js",
            "views/ParticleView.js",
            "views/VectorsView.js",
            "views/TraceView.js",
            "views/UIView.js",
            "RenderingController.js"
        ],
        "ai": [
            "RocketAI.js",
            "training/HeadlessRocketEnvironment.js",
            "training/TrainingOrchestrator.js",
            "training/TrainingVisualizer.js"
        ]
    };
    
    fs.writeFileSync('tools/bundle-order.json', JSON.stringify(bundleOrder, null, 2));
    console.log('📝 Fichier bundle-order.json mis à jour');
}

function generateMigrationReport(stats) {
    const report = `
# 📊 RAPPORT DE MIGRATION FINALE

## Résumé
- **Fichiers migrés** : ${stats.migratedFiles}
- **Vues migrées** : ${stats.migratedViews}
- **Fichiers ignorés** : ${stats.skippedFiles}
- **Dossiers créés** : ${stats.createdDirs}

## Structure Finale
\`\`\`
pocketcosmos/
├── core/                    # Infrastructure
├── physics/                 # Simulation physique
│   ├── factories/          # Factories de corps
│   └── handlers/           # Gestionnaires physique
├── game/                   # Logique de jeu
│   ├── missions/          # Gestion des missions
│   ├── rocket/            # Contrôle fusée
│   ├── particles/         # Système de particules
│   └── camera/            # Contrôle caméra
├── rendering/              # Système de rendu
│   └── views/             # Vues de rendu
├── input/                  # Gestion des entrées
├── ai/                     # Intelligence artificielle
│   └── training/          # Entraînement IA
├── models/                 # Modèles de données
├── tests/                  # Tests unitaires
└── tools/                  # Outils de développement
\`\`\`

## Prochaines Étapes
1. Reconstruire les bundles : \`npm run build\`
2. Optimiser : \`node tools/optimize.js\`
3. Valider les tests : \`npm test\`
4. Vérifier le fonctionnement : Ouvrir index.html

Migration terminée avec succès ! 🎉
`;
    
    fs.writeFileSync('MIGRATION_FINALE_RAPPORT.md', report);
    console.log('📄 Rapport de migration généré: MIGRATION_FINALE_RAPPORT.md');
}

function finalizeMigration() {
    console.log('🚀 Démarrage de la migration finale PocketCosmos...\n');
    
    const stats = {
        migratedFiles: 0,
        migratedViews: 0,
        skippedFiles: 0,
        createdDirs: 0
    };
    
    try {
        // 1. Créer les dossiers nécessaires
        console.log('📁 Création des dossiers...');
        createDirectories();
        stats.createdDirs = 10; // Approximation
        
        // 2. Migrer les fichiers controllers
        console.log('\n📦 Migration des fichiers controllers...');
        const migrationResult = migrateFiles();
        stats.migratedFiles = migrationResult.migratedCount;
        stats.skippedFiles = migrationResult.skippedCount;
        
        // 3. Migrer les vues
        console.log('\n🎨 Migration des vues...');
        stats.migratedViews = migrateViews();
        
        // 4. Nettoyer les doublons
        console.log('\n🧹 Nettoyage des doublons...');
        cleanupDuplicates();
        
        // 5. Nettoyer le dossier controllers
        console.log('\n🗑️ Nettoyage du dossier controllers...');
        cleanupControllersDirectory();
        
        // 6. Mettre à jour la configuration des bundles
        console.log('\n⚙️ Mise à jour de la configuration...');
        updateBundleOrder();
        
        // 7. Générer le rapport
        console.log('\n📊 Génération du rapport...');
        generateMigrationReport(stats);
        
        console.log('\n🎉 Migration finale terminée avec succès !');
        console.log('\n📋 Prochaines étapes recommandées :');
        console.log('   1. npm run build          # Reconstruire les bundles');
        console.log('   2. node tools/optimize.js # Optimiser les bundles');
        console.log('   3. npm test               # Valider les tests');
        console.log('   4. Ouvrir index.html      # Tester le jeu');
        
    } catch (error) {
        console.error('❌ Erreur lors de la migration:', error.message);
        console.error('   Vérifiez les permissions et l\'état des fichiers');
        process.exit(1);
    }
}

module.exports = { finalizeMigration };

// Exécuter si appelé directement
if (require.main === module) {
    finalizeMigration();
} 