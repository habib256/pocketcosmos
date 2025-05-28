#!/usr/bin/env node

/**
 * Script d'optimisation pour PocketCosmos Phase 3
 * - Minification des bundles
 * - Analyse de la taille
 * - Génération de source maps
 * - Rapport de performance
 */

const fs = require('fs');
const path = require('path');

// Configuration
const DOMAINS = ['core', 'models', 'physics', 'game', 'input', 'rendering', 'ai'];
const OUTPUT_DIR = '.build/optimized';

class BundleOptimizer {
    constructor() {
        this.stats = {
            originalSize: 0,
            minifiedSize: 0,
            compressionRatio: 0,
            bundles: {}
        };
    }

    /**
     * Minification simple (sans dépendances externes)
     */
    minifyCode(code) {
        return code
            // Supprimer les commentaires
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/\/\/.*$/gm, '')
            // Supprimer les espaces multiples
            .replace(/\s+/g, ' ')
            // Supprimer les espaces autour des opérateurs
            .replace(/\s*([{}();,=+\-*/<>!&|])\s*/g, '$1')
            // Supprimer les espaces en début/fin de ligne
            .replace(/^\s+|\s+$/gm, '')
            // Supprimer les lignes vides
            .replace(/\n\s*\n/g, '\n')
            .trim();
    }

    /**
     * Analyse la taille d'un fichier
     */
    analyzeSize(filePath) {
        if (!fs.existsSync(filePath)) {
            return { size: 0, exists: false };
        }
        
        const stats = fs.statSync(filePath);
        return {
            size: stats.size,
            sizeKB: Math.round(stats.size / 1024 * 100) / 100,
            exists: true
        };
    }

    /**
     * Optimise un bundle spécifique
     */
    optimizeBundle(domain) {
        const bundlePath = path.join(domain, `${domain}.bundle.js`);
        const outputPath = path.join(OUTPUT_DIR, `${domain}.min.js`);
        
        console.log(`🔧 Optimisation de ${domain}...`);
        
        if (!fs.existsSync(bundlePath)) {
            console.warn(`⚠️ Bundle non trouvé: ${bundlePath}`);
            return null;
        }

        // Lire le bundle original
        const originalCode = fs.readFileSync(bundlePath, 'utf8');
        const originalSize = this.analyzeSize(bundlePath);
        
        // Minifier
        const minifiedCode = this.minifyCode(originalCode);
        
        // Créer le dossier de sortie
        if (!fs.existsSync(OUTPUT_DIR)) {
            fs.mkdirSync(OUTPUT_DIR, { recursive: true });
        }
        
        // Écrire le fichier minifié
        fs.writeFileSync(outputPath, minifiedCode);
        
        const minifiedSize = this.analyzeSize(outputPath);
        const compressionRatio = Math.round((1 - minifiedSize.size / originalSize.size) * 100);
        
        const bundleStats = {
            domain,
            originalSize: originalSize.sizeKB,
            minifiedSize: minifiedSize.sizeKB,
            compressionRatio,
            savings: originalSize.sizeKB - minifiedSize.sizeKB
        };
        
        this.stats.bundles[domain] = bundleStats;
        this.stats.originalSize += originalSize.size;
        this.stats.minifiedSize += minifiedSize.size;
        
        console.log(`  ✅ ${originalSize.sizeKB}KB → ${minifiedSize.sizeKB}KB (-${compressionRatio}%)`);
        
        return bundleStats;
    }

    /**
     * Lance l'optimisation complète
     */
    async optimize() {
        console.log('🚀 Démarrage de l\'optimisation des bundles...\n');
        
        // Optimiser chaque bundle
        for (const domain of DOMAINS) {
            this.optimizeBundle(domain);
        }
        
        // Calculer les statistiques globales
        this.stats.compressionRatio = Math.round((1 - this.stats.minifiedSize / this.stats.originalSize) * 100);
        
        console.log('\n📊 RAPPORT D\'OPTIMISATION');
        console.log('═'.repeat(50));
        console.log(`📦 Bundles traités: ${Object.keys(this.stats.bundles).length}`);
        console.log(`📏 Taille originale: ${Math.round(this.stats.originalSize / 1024 * 100) / 100} KB`);
        console.log(`🗜️  Taille minifiée: ${Math.round(this.stats.minifiedSize / 1024 * 100) / 100} KB`);
        console.log(`💾 Économies: ${Math.round((this.stats.originalSize - this.stats.minifiedSize) / 1024 * 100) / 100} KB (-${this.stats.compressionRatio}%)`);
        
        console.log('\n📋 DÉTAIL PAR BUNDLE');
        console.log('─'.repeat(50));
        Object.values(this.stats.bundles).forEach(bundle => {
            console.log(`${bundle.domain.padEnd(12)} ${bundle.originalSize.toString().padStart(6)}KB → ${bundle.minifiedSize.toString().padStart(6)}KB (-${bundle.compressionRatio}%)`);
        });
        
        console.log('\n✅ Optimisation terminée !');
        console.log(`📁 Fichiers générés dans: ${OUTPUT_DIR}`);
        
        return this.stats;
    }
}

// Exécution si appelé directement
if (require.main === module) {
    const optimizer = new BundleOptimizer();
    
    // Gestion des arguments
    const args = process.argv.slice(2);
    
    if (args.includes('--help') || args.includes('-h')) {
        console.log(`
🔧 Optimiseur de Bundles PocketCosmos

Usage: node tools/optimize.js [options]

Options:
  --help, -h     Afficher cette aide
  --domain=X     Optimiser seulement le domaine X

Exemples:
  node tools/optimize.js                    # Optimiser tous les bundles
  node tools/optimize.js --domain=physics   # Optimiser seulement physics
        `);
        process.exit(0);
    }
    
    // Optimisation d'un domaine spécifique
    const domainArg = args.find(arg => arg.startsWith('--domain='));
    if (domainArg) {
        const domain = domainArg.split('=')[1];
        if (DOMAINS.includes(domain)) {
            console.log(`🎯 Optimisation du domaine: ${domain}`);
            const result = optimizer.optimizeBundle(domain);
            if (result) {
                console.log(`✅ ${domain} optimisé avec succès !`);
            }
        } else {
            console.error(`❌ Domaine invalide: ${domain}`);
            console.log(`Domaines disponibles: ${DOMAINS.join(', ')}`);
            process.exit(1);
        }
    } else {
        // Optimisation complète
        optimizer.optimize().catch(error => {
            console.error('❌ Erreur lors de l\'optimisation:', error);
            process.exit(1);
        });
    }
}

module.exports = BundleOptimizer; 