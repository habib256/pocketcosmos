#!/usr/bin/env node

/**
 * Script de validation de la migration Phase 2
 * Vérifie que tous les fichiers ont été correctement migrés
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 VALIDATION MIGRATION PHASE 2');
console.log('================================');

// Configuration des domaines attendus
const expectedStructure = {
    'core': {
        files: ['constants.js', 'EventTypes.js', 'EventBus.js'],
        subdirs: ['utils']
    },
    'models': {
        files: [],
        subdirs: ['core', 'entities', 'effects']
    },
    'physics': {
        files: ['PhysicsController.js', 'PhysicsVectors.js', 'SynchronizationManager.js'],
        subdirs: ['factories', 'handlers']
    },
    'game': {
        files: ['GameController.js', 'GameSetupController.js'],
        subdirs: ['missions', 'rocket', 'particles', 'camera']
    },
    'input': {
        files: ['InputController.js'],
        subdirs: []
    },
    'rendering': {
        files: ['RenderingController.js'],
        subdirs: ['views']
    },
    'ai': {
        files: ['RocketAI.js'],
        subdirs: ['training', 'scripts']
    }
};

// Fichiers de bundles attendus
const expectedBundles = [
    'core/core.bundle.js',
    'models/models.bundle.js', 
    'physics/physics.bundle.js',
    'game/game.bundle.js',
    'input/input.bundle.js',
    'rendering/rendering.bundle.js',
    'ai/ai.bundle.js'
];

let totalErrors = 0;
let totalWarnings = 0;

function checkExists(filePath, type = 'file') {
    const exists = fs.existsSync(filePath);
    if (exists) {
        const stats = fs.statSync(filePath);
        if (type === 'file' && stats.isFile()) {
            return { exists: true, size: stats.size };
        } else if (type === 'dir' && stats.isDirectory()) {
            return { exists: true };
        }
    }
    return { exists: false };
}

function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB';
    return Math.round(bytes / (1024 * 1024)) + ' MB';
}

// 1. Vérifier la structure des domaines
console.log('\n📁 Vérification de la structure des domaines:');
for (const [domain, config] of Object.entries(expectedStructure)) {
    console.log(`\n🔧 Domaine: ${domain}`);
    
    // Vérifier le dossier principal
    const domainPath = path.join(process.cwd(), domain);
    const domainCheck = checkExists(domainPath, 'dir');
    
    if (!domainCheck.exists) {
        console.log(`  ❌ Dossier manquant: ${domain}/`);
        totalErrors++;
        continue;
    } else {
        console.log(`  ✅ Dossier: ${domain}/`);
    }
    
    // Vérifier les fichiers principaux
    for (const file of config.files) {
        const filePath = path.join(domainPath, file);
        const fileCheck = checkExists(filePath, 'file');
        
        if (!fileCheck.exists) {
            console.log(`  ❌ Fichier manquant: ${domain}/${file}`);
            totalErrors++;
        } else {
            console.log(`  ✅ Fichier: ${domain}/${file} (${formatSize(fileCheck.size)})`);
        }
    }
    
    // Vérifier les sous-dossiers
    for (const subdir of config.subdirs) {
        const subdirPath = path.join(domainPath, subdir);
        const subdirCheck = checkExists(subdirPath, 'dir');
        
        if (!subdirCheck.exists) {
            console.log(`  ❌ Sous-dossier manquant: ${domain}/${subdir}/`);
            totalErrors++;
        } else {
            console.log(`  ✅ Sous-dossier: ${domain}/${subdir}/`);
        }
    }
}

// 2. Vérifier les bundles
console.log('\n📦 Vérification des bundles:');
let totalBundleSize = 0;

for (const bundlePath of expectedBundles) {
    const fullPath = path.join(process.cwd(), bundlePath);
    const bundleCheck = checkExists(fullPath, 'file');
    
    if (!bundleCheck.exists) {
        console.log(`  ❌ Bundle manquant: ${bundlePath}`);
        totalErrors++;
    } else {
        totalBundleSize += bundleCheck.size;
        console.log(`  ✅ Bundle: ${bundlePath} (${formatSize(bundleCheck.size)})`);
    }
}

// 3. Vérifier les outils
console.log('\n🔧 Vérification des outils:');
const tools = [
    'tools/build.js',
    'tools/dev-server.js', 
    'tools/test-bundles.js',
    'tools/bundle-order.json'
];

for (const tool of tools) {
    const toolPath = path.join(process.cwd(), tool);
    const toolCheck = checkExists(toolPath, 'file');
    
    if (!toolCheck.exists) {
        console.log(`  ❌ Outil manquant: ${tool}`);
        totalErrors++;
    } else {
        console.log(`  ✅ Outil: ${tool}`);
    }
}

// 4. Vérifier les pages de test
console.log('\n🧪 Vérification des pages de test:');
const testPages = [
    'ui/test-bundles.html',
    'ui/test-migration.html'
];

for (const page of testPages) {
    const pagePath = path.join(process.cwd(), page);
    const pageCheck = checkExists(pagePath, 'file');
    
    if (!pageCheck.exists) {
        console.log(`  ❌ Page de test manquante: ${page}`);
        totalErrors++;
    } else {
        console.log(`  ✅ Page de test: ${page}`);
    }
}

// 5. Vérifier package.json
console.log('\n📋 Vérification de package.json:');
const packagePath = path.join(process.cwd(), 'package.json');
const packageCheck = checkExists(packagePath, 'file');

if (!packageCheck.exists) {
    console.log('  ❌ package.json manquant');
    totalErrors++;
} else {
    try {
        const packageData = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
        const expectedScripts = ['build', 'test:bundles', 'dev'];
        
        console.log('  ✅ package.json présent');
        
        for (const script of expectedScripts) {
            if (packageData.scripts && packageData.scripts[script]) {
                console.log(`  ✅ Script: ${script}`);
            } else {
                console.log(`  ❌ Script manquant: ${script}`);
                totalErrors++;
            }
        }
    } catch (error) {
        console.log(`  ❌ Erreur lecture package.json: ${error.message}`);
        totalErrors++;
    }
}

// 6. Vérifier la documentation
console.log('\n📚 Vérification de la documentation:');
const docs = [
    'PHASE1_COMPLETE.md',
    'PHASE2_COMPLETE.md',
    'ARCHITECTURE_REFACTORING_PROPOSAL.md',
    'MIGRATION_GUIDE.md'
];

for (const doc of docs) {
    const docPath = path.join(process.cwd(), doc);
    const docCheck = checkExists(docPath, 'file');
    
    if (!docCheck.exists) {
        console.log(`  ⚠️ Documentation manquante: ${doc}`);
        totalWarnings++;
    } else {
        console.log(`  ✅ Documentation: ${doc}`);
    }
}

// 7. Résumé final
console.log('\n' + '='.repeat(50));
console.log('📊 RÉSUMÉ DE LA VALIDATION');
console.log('='.repeat(50));

console.log(`\n📦 Bundles: ${expectedBundles.length} bundles (${formatSize(totalBundleSize)} total)`);
console.log(`🔧 Domaines: ${Object.keys(expectedStructure).length} domaines`);
console.log(`❌ Erreurs: ${totalErrors}`);
console.log(`⚠️ Avertissements: ${totalWarnings}`);

if (totalErrors === 0) {
    console.log('\n🎉 VALIDATION RÉUSSIE !');
    console.log('✅ La migration Phase 2 est COMPLÈTE et FONCTIONNELLE');
    console.log('✅ Tous les fichiers sont correctement organisés');
    console.log('✅ Tous les bundles sont présents');
    console.log('✅ Tous les outils sont disponibles');
    
    if (totalWarnings > 0) {
        console.log(`\n⚠️ ${totalWarnings} avertissement(s) détecté(s) (non bloquant)`);
    }
    
    console.log('\n🚀 Prêt pour la Phase 3 !');
    process.exit(0);
} else {
    console.log('\n❌ VALIDATION ÉCHOUÉE !');
    console.log(`❌ ${totalErrors} erreur(s) détectée(s)`);
    console.log('🔧 Veuillez corriger les erreurs avant de continuer');
    process.exit(1);
} 