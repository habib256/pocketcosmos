#!/usr/bin/env node

/**
 * Script de test pour vérifier l'état des bundles
 */

const fs = require('fs');
const path = require('path');

const domains = ['core', 'models', 'physics', 'game', 'input', 'rendering', 'ai'];

console.log('🧪 Test des bundles...\n');

let allPresent = true;

domains.forEach(domain => {
    const bundlePath = path.join(domain, `${domain}.bundle.js`);
    const exists = fs.existsSync(bundlePath);
    
    if (exists) {
        const stats = fs.statSync(bundlePath);
        const sizeKB = Math.round(stats.size / 1024);
        console.log(`✅ ${domain.padEnd(10)} - ${sizeKB} KB`);
    } else {
        console.log(`❌ ${domain.padEnd(10)} - manquant`);
        allPresent = false;
    }
});

console.log('\n' + '='.repeat(40));

if (allPresent) {
    console.log('🎉 Tous les bundles sont présents !');
    process.exit(0);
} else {
    console.log('⚠️ Certains bundles sont manquants.');
    console.log('💡 Exécutez "npm run build" pour les créer.');
    process.exit(1);
} 