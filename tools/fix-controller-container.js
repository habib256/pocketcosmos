/**
 * Script pour supprimer automatiquement toutes les références à window.controllerContainer.track()
 * et les remplacer par des appels directs à eventBus.subscribe()
 */

const fs = require('fs');
const path = require('path');

// Fichiers à traiter
const filesToFix = [
    'game/particles/ParticleController.js',
    'game/rocket/RocketController.js',
    'rendering/RenderingController.js',
    'input/InputController.js'
];

function fixControllerContainerReferences(filePath) {
    console.log(`🔧 Traitement de ${filePath}...`);
    
    if (!fs.existsSync(filePath)) {
        console.warn(`⚠️ Fichier non trouvé: ${filePath}`);
        return false;
    }
    
    let content = fs.readFileSync(filePath, 'utf8');
    let modified = false;
    
    // Pattern pour détecter window.controllerContainer.track(this.eventBus.subscribe(...))
    const pattern1 = /window\.controllerContainer\.track\(\s*this\.eventBus\.subscribe\(/g;
    if (pattern1.test(content)) {
        content = content.replace(pattern1, 'this.eventBus.subscribe(');
        modified = true;
        console.log(`   ✅ Remplacé window.controllerContainer.track(this.eventBus.subscribe(`);
    }
    
    // Pattern pour détecter window.controllerContainer.track(eventBus.subscribe(...))
    const pattern2 = /window\.controllerContainer\.track\(\s*eventBus\.subscribe\(/g;
    if (pattern2.test(content)) {
        content = content.replace(pattern2, 'eventBus.subscribe(');
        modified = true;
        console.log(`   ✅ Remplacé window.controllerContainer.track(eventBus.subscribe(`);
    }
    
    // Pattern pour détecter window.controllerContainer.track(subscription)
    const pattern3 = /window\.controllerContainer\.track\(\s*([^)]+)\s*\);/g;
    if (pattern3.test(content)) {
        content = content.replace(pattern3, '$1;');
        modified = true;
        console.log(`   ✅ Remplacé window.controllerContainer.track(subscription)`);
    }
    
    // Supprimer les parenthèses fermantes orphelines
    const pattern4 = /this\.eventBus\.subscribe\([^)]+\)\s*\)\s*;/g;
    content = content.replace(pattern4, (match) => {
        return match.replace(/\)\s*\)\s*;/, ');');
    });
    
    // Supprimer les commentaires sur controllerContainer
    const pattern5 = /\/\/.*controllerContainer.*\n/g;
    if (pattern5.test(content)) {
        content = content.replace(pattern5, '');
        modified = true;
        console.log(`   ✅ Supprimé commentaires controllerContainer`);
    }
    
    // Supprimer les conditions if (window.controllerContainer...)
    const pattern6 = /if\s*\(\s*window\.controllerContainer[^{]*\{\s*([^}]+)\s*\}/g;
    if (pattern6.test(content)) {
        content = content.replace(pattern6, '$1');
        modified = true;
        console.log(`   ✅ Supprimé conditions if (window.controllerContainer...)`);
    }
    
    if (modified) {
        fs.writeFileSync(filePath, content);
        console.log(`   💾 Fichier sauvegardé: ${filePath}`);
        return true;
    } else {
        console.log(`   ℹ️ Aucune modification nécessaire`);
        return false;
    }
}

function main() {
    console.log('🚀 Démarrage de la correction des références controllerContainer...\n');
    
    let totalFixed = 0;
    
    filesToFix.forEach(filePath => {
        if (fixControllerContainerReferences(filePath)) {
            totalFixed++;
        }
        console.log('');
    });
    
    console.log('📊 RÉSUMÉ');
    console.log('='.repeat(50));
    console.log(`✅ Fichiers traités: ${filesToFix.length}`);
    console.log(`🔧 Fichiers modifiés: ${totalFixed}`);
    console.log(`ℹ️ Fichiers inchangés: ${filesToFix.length - totalFixed}`);
    
    if (totalFixed > 0) {
        console.log('\n🎉 Correction terminée avec succès !');
        console.log('\n📋 Prochaines étapes recommandées :');
        console.log('   1. npm run build          # Reconstruire les bundles');
        console.log('   2. node tools/optimize.js # Optimiser les bundles');
        console.log('   3. npm test               # Valider les tests');
    } else {
        console.log('\n✨ Aucune correction nécessaire, tous les fichiers sont déjà propres !');
    }
}

// Exécuter si appelé directement
if (require.main === module) {
    main();
}

module.exports = { fixControllerContainerReferences }; 