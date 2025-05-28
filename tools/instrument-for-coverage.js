/**
 * Script pour instrumenter les fichiers source et permettre la mesure de couverture
 * Ce script copie les sources vers un répertoire temporaire avec instrumentation
 */

const fs = require('fs');
const path = require('path');

// Répertoires à traiter
const sourceDirs = ['core', 'models', 'physics', 'game', 'input', 'rendering', 'ai'];
const outputDir = '.coverage-instrumented';

// Nettoyer le répertoire de sortie
if (fs.existsSync(outputDir)) {
    fs.rmSync(outputDir, { recursive: true, force: true });
}

// Créer le répertoire de sortie
fs.mkdirSync(outputDir, { recursive: true });

/**
 * Copie récursivement un répertoire en instrumentant les fichiers JS
 */
function copyAndInstrument(sourceDir, targetDir) {
    if (!fs.existsSync(sourceDir)) {
        console.log(`⚠️ Répertoire source non trouvé: ${sourceDir}`);
        return;
    }

    if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
    }

    const items = fs.readdirSync(sourceDir);
    
    for (const item of items) {
        const sourcePath = path.join(sourceDir, item);
        const targetPath = path.join(targetDir, item);
        const stat = fs.statSync(sourcePath);
        
        if (stat.isDirectory()) {
            // Copier récursivement les sous-répertoires
            copyAndInstrument(sourcePath, targetPath);
        } else if (item.endsWith('.js') && !item.includes('.bundle.')) {
            // Instrumenter les fichiers JS (sauf les bundles)
            try {
                let content = fs.readFileSync(sourcePath, 'utf8');
                
                // Instrumentation simple : ajouter des compteurs globaux
                // Ceci n'est qu'une instrumentation basique pour permettre à Jest de voir le code
                const instrumentedContent = addBasicInstrumentation(content, sourcePath);
                
                fs.writeFileSync(targetPath, instrumentedContent, 'utf8');
                console.log(`✅ Instrumenté: ${sourcePath} → ${targetPath}`);
            } catch (error) {
                console.error(`❌ Erreur lors de l'instrumentation de ${sourcePath}:`, error.message);
                // En cas d'erreur, copier le fichier original
                fs.copyFileSync(sourcePath, targetPath);
            }
        } else {
            // Copier les autres fichiers sans modification
            fs.copyFileSync(sourcePath, targetPath);
        }
    }
}

/**
 * Ajoute une instrumentation basique au code JavaScript
 */
function addBasicInstrumentation(content, filePath) {
    // Pour l'instant, nous allons simplement copier le contenu
    // Jest peut instrumenter automatiquement si les fichiers sont dans le bon format
    
    // Ajouter un commentaire d'identification pour le coverage
    const header = `/* Coverage instrumented file: ${filePath} */\n`;
    
    // S'assurer que les variables globales sont disponibles
    const globals = `
if (typeof global !== 'undefined') {
    // Exposer les classes définies dans ce fichier au niveau global
    const originalEval = eval;
    eval = function(code) {
        const result = originalEval.call(this, code);
        // Exposer automatiquement les classes qui commencent par une majuscule
        const classMatches = code.match(/class\\s+([A-Z][A-Za-z0-9]*)/g);
        if (classMatches) {
            classMatches.forEach(match => {
                const className = match.replace('class ', '');
                try {
                    if (typeof originalEval(className) !== 'undefined') {
                        global[className] = originalEval(className);
                    }
                } catch (e) {
                    // Ignorer les erreurs
                }
            });
        }
        return result;
    };
}
`;
    
    return header + globals + content;
}

// Traiter chaque répertoire source
sourceDirs.forEach(dir => {
    const sourceDir = path.resolve(dir);
    const targetDir = path.join(outputDir, dir);
    
    console.log(`📂 Traitement du répertoire: ${dir}`);
    copyAndInstrument(sourceDir, targetDir);
});

console.log(`🎯 Instrumentation terminée. Fichiers générés dans: ${outputDir}`);
console.log(`ℹ️ Vous pouvez maintenant utiliser ces fichiers instrumentés pour les tests de couverture.`);

// Créer un fichier d'index pour faciliter l'import
const indexContent = sourceDirs.map(dir => {
    return `// Exports from ${dir}
// Les classes seront disponibles globalement après le chargement des fichiers`;
}).join('\n\n');

fs.writeFileSync(path.join(outputDir, 'index.js'), indexContent, 'utf8');
console.log(`✅ Fichier d'index créé: ${outputDir}/index.js`); 