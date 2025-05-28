/**
 * Script de build automatisé pour PocketCosmos
 * Reconstruit tous les bundles selon la nouvelle architecture par domaines
 */

const fs = require('fs');
const path = require('path');

// Configuration de l'ordre des bundles (sera chargée depuis bundle-order.json si disponible)
let bundleOrder = {
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

function loadBundleOrder() {
    const configPath = 'tools/bundle-order.json';
    if (fs.existsSync(configPath)) {
        try {
            bundleOrder = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            console.log('📋 Configuration chargée depuis bundle-order.json');
        } catch (error) {
            console.warn('⚠️ Erreur lecture bundle-order.json, utilisation config par défaut');
        }
    } else {
        console.log('📋 Utilisation de la configuration par défaut');
    }
}

function buildBundle(domain, files) {
    console.log(`\n🔨 Construction du bundle ${domain}...`);
    
    const bundleContent = [];
    let totalSize = 0;
    let processedFiles = 0;
    let missingFiles = 0;
    
    // En-tête du bundle
    bundleContent.push(`// === ${domain.toUpperCase()} BUNDLE ===`);
    bundleContent.push(`// Généré automatiquement le ${new Date().toISOString()}`);
    bundleContent.push(`// Domaine: ${domain}`);
    bundleContent.push(`// Fichiers: ${files.length}`);
    bundleContent.push('');
    
    files.forEach(file => {
        const filePath = path.join(domain, file);
        
        if (fs.existsSync(filePath)) {
            try {
                const content = fs.readFileSync(filePath, 'utf8');
                const fileSize = Buffer.byteLength(content, 'utf8');
                
                bundleContent.push(`// === ${file} ===`);
                bundleContent.push(`// Taille: ${(fileSize / 1024).toFixed(2)} KB`);
                bundleContent.push('');
                bundleContent.push(content);
                bundleContent.push('');
                
                totalSize += fileSize;
                processedFiles++;
                
                console.log(`   ✅ ${file} (${(fileSize / 1024).toFixed(2)} KB)`);
            } catch (error) {
                console.warn(`   ❌ Erreur lecture ${file}: ${error.message}`);
                missingFiles++;
            }
        } else {
            console.warn(`   ⚠️ Fichier manquant: ${file}`);
            missingFiles++;
        }
    });
    
    // Pied de bundle avec métadonnées
    bundleContent.push(`// === FIN ${domain.toUpperCase()} BUNDLE ===`);
    bundleContent.push(`// Fichiers traités: ${processedFiles}/${files.length}`);
    bundleContent.push(`// Taille totale: ${(totalSize / 1024).toFixed(2)} KB`);
    bundleContent.push(`// Généré: ${new Date().toISOString()}`);
    
    const outputPath = path.join(domain, `${domain}.bundle.js`);
    const finalContent = bundleContent.join('\n');
    
    try {
        fs.writeFileSync(outputPath, finalContent);
        console.log(`   📦 Bundle créé: ${outputPath}`);
        console.log(`   📊 Taille: ${(totalSize / 1024).toFixed(2)} KB`);
        console.log(`   📈 Fichiers: ${processedFiles}/${files.length} traités`);
        
        if (missingFiles > 0) {
            console.warn(`   ⚠️ ${missingFiles} fichier(s) manquant(s)`);
        }
        
        return {
            domain,
            size: totalSize,
            files: processedFiles,
            missing: missingFiles,
            path: outputPath
        };
    } catch (error) {
        console.error(`   ❌ Erreur écriture bundle ${domain}: ${error.message}`);
        return null;
    }
}

function validateDomainStructure(domain) {
    if (!fs.existsSync(domain)) {
        console.warn(`⚠️ Domaine ${domain} non trouvé, création...`);
        fs.mkdirSync(domain, { recursive: true });
        return false;
    }
    return true;
}

function generateBuildReport(results) {
    const totalSize = results.reduce((sum, result) => sum + (result?.size || 0), 0);
    const totalFiles = results.reduce((sum, result) => sum + (result?.files || 0), 0);
    const totalMissing = results.reduce((sum, result) => sum + (result?.missing || 0), 0);
    
    const report = `
# 📊 RAPPORT DE BUILD

## Résumé Global
- **Bundles générés** : ${results.filter(r => r !== null).length}/${results.length}
- **Taille totale** : ${(totalSize / 1024).toFixed(2)} KB
- **Fichiers traités** : ${totalFiles}
- **Fichiers manquants** : ${totalMissing}
- **Date de build** : ${new Date().toISOString()}

## Détail par Bundle

${results.map(result => {
    if (!result) return '❌ **Échec de génération**';
    
    return `### ${result.domain}
- **Fichier** : \`${result.path}\`
- **Taille** : ${(result.size / 1024).toFixed(2)} KB
- **Fichiers** : ${result.files} traités
${result.missing > 0 ? `- **⚠️ Manquants** : ${result.missing}` : '- **✅ Complet**'}`;
}).join('\n\n')}

## Ordre de Chargement Recommandé

\`\`\`html
<!-- Dans index.html -->
<script src="core/core.bundle.js"></script>
<script src="models/models.bundle.js"></script>
<script src="physics/physics.bundle.js"></script>
<script src="game/game.bundle.js"></script>
<script src="input/input.bundle.js"></script>
<script src="rendering/rendering.bundle.js"></script>

<!-- Dans training-interface.html (ajouter) -->
<script src="ai/ai.bundle.js"></script>
\`\`\`

## Prochaines Étapes

1. **Optimiser** : \`node tools/optimize.js\`
2. **Tester** : \`npm test\`
3. **Valider** : Ouvrir index.html et vérifier le fonctionnement

Build terminé ! 🎉
`;
    
    fs.writeFileSync('BUILD_RAPPORT.md', report);
    console.log('\n📄 Rapport de build généré: BUILD_RAPPORT.md');
}

function buildAll() {
    console.log('🚀 Démarrage du build PocketCosmos...\n');
    
    // Charger la configuration
    loadBundleOrder();
    
    const results = [];
    let successCount = 0;
    
    // Construire chaque bundle
    Object.entries(bundleOrder).forEach(([domain, files]) => {
        console.log(`\n📁 Traitement du domaine: ${domain}`);
        
        // Valider la structure
        const domainExists = validateDomainStructure(domain);
        
        if (!domainExists && files.length > 0) {
            console.warn(`   ⚠️ Domaine vide, bundle sera minimal`);
        }
        
        // Construire le bundle
        const result = buildBundle(domain, files);
        results.push(result);
        
        if (result) {
            successCount++;
        }
    });
    
    // Résumé final
    console.log('\n' + '='.repeat(50));
    console.log('📊 RÉSUMÉ DU BUILD');
    console.log('='.repeat(50));
    
    const totalSize = results.reduce((sum, result) => sum + (result?.size || 0), 0);
    
    console.log(`✅ Bundles réussis: ${successCount}/${results.length}`);
    console.log(`📦 Taille totale: ${(totalSize / 1024).toFixed(2)} KB`);
    
    if (successCount === results.length) {
        console.log('🎉 Build terminé avec succès !');
    } else {
        console.warn(`⚠️ ${results.length - successCount} bundle(s) en échec`);
    }
    
    // Générer le rapport
    generateBuildReport(results);
    
    console.log('\n📋 Prochaines étapes recommandées :');
    console.log('   1. node tools/optimize.js  # Optimiser les bundles');
    console.log('   2. npm test                # Valider les tests');
    console.log('   3. Ouvrir index.html       # Tester le jeu');
    
    return successCount === results.length;
}

// Fonction utilitaire pour build d'un seul domaine
function buildSingle(domain) {
    loadBundleOrder();
    
    if (!bundleOrder[domain]) {
        console.error(`❌ Domaine '${domain}' non trouvé dans la configuration`);
        console.log(`Domaines disponibles: ${Object.keys(bundleOrder).join(', ')}`);
        return false;
    }
    
    console.log(`🔨 Build du domaine: ${domain}`);
    validateDomainStructure(domain);
    const result = buildBundle(domain, bundleOrder[domain]);
    
    if (result) {
        console.log(`✅ Build ${domain} terminé avec succès !`);
        return true;
    } else {
        console.error(`❌ Échec du build ${domain}`);
        return false;
    }
}

module.exports = { buildAll, buildSingle, loadBundleOrder };

// Exécuter si appelé directement
if (require.main === module) {
    const args = process.argv.slice(2);
    
    if (args.length > 0) {
        // Build d'un domaine spécifique
        const domain = args[0];
        const success = buildSingle(domain);
        process.exit(success ? 0 : 1);
    } else {
        // Build complet
        const success = buildAll();
        process.exit(success ? 0 : 1);
    }
} 