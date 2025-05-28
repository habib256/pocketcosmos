#!/usr/bin/env node

/**
 * Serveur de développement avec hot reload pour PocketCosmos
 * Usage: node tools/dev-server.js [--port=8080] [--watch]
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

// Configuration
const DEFAULT_PORT = 8080;
const ROOT_DIR = path.join(__dirname, '..');

// Types MIME
const MIME_TYPES = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

// Couleurs pour les logs
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`${colors[color]}[${timestamp}] ${message}${colors.reset}`);
}

class DevServer {
    constructor(port = DEFAULT_PORT, watchMode = false) {
        this.port = port;
        this.watchMode = watchMode;
        this.server = null;
        this.watchers = [];
        this.buildInProgress = false;
    }

    start() {
        this.server = http.createServer((req, res) => this.handleRequest(req, res));
        
        this.server.listen(this.port, () => {
            log(`🚀 Serveur de développement démarré`, 'green');
            log(`📍 URL: http://localhost:${this.port}`, 'cyan');
            log(`📁 Répertoire: ${ROOT_DIR}`, 'blue');
            
            if (this.watchMode) {
                this.setupWatchers();
                log(`👀 Mode surveillance activé`, 'yellow');
            }
            
            log(`\n🎮 Pages disponibles:`, 'bright');
            log(`   http://localhost:${this.port}/          # Jeu principal`, 'blue');
            log(`   http://localhost:${this.port}/training  # Interface IA`, 'blue');
            log(`\n⚡ Appuyez sur Ctrl+C pour arrêter`, 'yellow');
        });

        this.server.on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                log(`❌ Port ${this.port} déjà utilisé`, 'red');
                process.exit(1);
            } else {
                log(`❌ Erreur serveur: ${err.message}`, 'red');
            }
        });
    }

    handleRequest(req, res) {
        let urlPath = req.url;
        
        // Routing simple
        if (urlPath === '/') {
            urlPath = '/index.html';
        } else if (urlPath === '/training') {
            urlPath = '/training-interface.html';
        }
        
        // Nettoyer l'URL
        urlPath = urlPath.split('?')[0]; // Supprimer query params
        
        // Déterminer le chemin du fichier
        let filePath;
        if (urlPath.endsWith('.html')) {
            // Fichiers HTML à la racine
            filePath = path.join(ROOT_DIR, path.basename(urlPath));
        } else {
            // Autres fichiers (bundles, assets, etc.)
            filePath = path.join(ROOT_DIR, urlPath.substring(1));
        }
        
        this.serveFile(filePath, res);
    }

    serveFile(filePath, res) {
        // Vérifier que le fichier existe
        if (!fs.existsSync(filePath)) {
            log(`❌ 404: ${filePath}`, 'red');
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('404 - Fichier non trouvé');
            return;
        }

        // Déterminer le type MIME
        const ext = path.extname(filePath).toLowerCase();
        const mimeType = MIME_TYPES[ext] || 'application/octet-stream';

        try {
            const content = fs.readFileSync(filePath);
            
            // Headers avec cache désactivé pour le développement
            res.writeHead(200, {
                'Content-Type': mimeType,
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
            });
            
            res.end(content);
            
            // Log des requêtes importantes
            if (ext === '.html' || ext === '.js') {
                log(`📄 ${path.basename(filePath)} (${(content.length / 1024).toFixed(1)} KB)`, 'green');
            }
            
        } catch (error) {
            log(`❌ Erreur lecture: ${error.message}`, 'red');
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('500 - Erreur serveur');
        }
    }

    setupWatchers() {
        const domains = ['core', 'models', 'physics', 'game', 'input', 'rendering', 'ai'];
        
        domains.forEach(domain => {
            const domainPath = path.join(ROOT_DIR, domain);
            
            if (fs.existsSync(domainPath)) {
                // Surveiller le dossier principal
                this.watchDirectory(domainPath, domain);
                log(`👁️ Surveillance: ${domain}/`, 'blue');
            }
        });
    }

    watchDirectory(dirPath, domain) {
        try {
            // Surveiller le dossier lui-même
            const watcher = fs.watch(dirPath, (eventType, filename) => {
                if (filename && filename.endsWith('.js') && !filename.endsWith('.bundle.js')) {
                    this.onFileChanged(domain, filename);
                }
            });
            this.watchers.push(watcher);

            // Lire le contenu du dossier et surveiller les sous-dossiers
            const items = fs.readdirSync(dirPath, { withFileTypes: true });
            
            for (const item of items) {
                if (item.isDirectory()) {
                    const subDirPath = path.join(dirPath, item.name);
                    this.watchDirectory(subDirPath, domain);
                }
            }
        } catch (error) {
            log(`⚠️ Impossible de surveiller ${dirPath}: ${error.message}`, 'yellow');
        }
    }

    onFileChanged(domain, filename) {
        if (this.buildInProgress) {
            return; // Éviter les builds multiples simultanés
        }

        log(`🔄 Changement détecté: ${domain}/${filename}`, 'yellow');
        this.rebuildBundle(domain);
    }

    rebuildBundle(domain) {
        this.buildInProgress = true;
        
        const buildCommand = `node tools/build.js --domain=${domain}`;
        
        exec(buildCommand, { cwd: ROOT_DIR }, (error, stdout, stderr) => {
            this.buildInProgress = false;
            
            if (error) {
                log(`❌ Erreur build ${domain}: ${error.message}`, 'red');
                if (stderr) log(stderr, 'red');
            } else {
                log(`✅ Bundle ${domain} reconstruit`, 'green');
                if (stdout) {
                    // Afficher seulement les lignes importantes du build
                    const lines = stdout.split('\n').filter(line => 
                        line.includes('Bundle créé') || line.includes('Fichiers traités')
                    );
                    lines.forEach(line => log(`   ${line}`, 'blue'));
                }
            }
        });
    }

    stop() {
        if (this.server) {
            this.server.close();
            log('🛑 Serveur arrêté', 'yellow');
        }
        
        this.watchers.forEach(watcher => watcher.close());
        this.watchers = [];
    }
}

// Fonctions utilitaires
function showHelp() {
    log('📖 Serveur de développement PocketCosmos', 'bright');
    log('');
    log('Usage:', 'bright');
    log('  node tools/dev-server.js                # Serveur simple', 'blue');
    log('  node tools/dev-server.js --port=3000    # Port personnalisé', 'blue');
    log('  node tools/dev-server.js --watch        # Avec hot reload', 'blue');
    log('  node tools/dev-server.js --help         # Cette aide', 'blue');
    log('');
    log('Fonctionnalités:', 'bright');
    log('  🌐 Serveur HTTP local', 'green');
    log('  📁 Serving des fichiers statiques', 'green');
    log('  🔄 Hot reload des bundles (avec --watch)', 'green');
    log('  📍 Routing automatique (/ → index.html, /training → training-interface.html)', 'green');
    log('  🚫 Cache désactivé pour le développement', 'green');
}

function buildAllBundles() {
    return new Promise((resolve, reject) => {
        log('🔨 Construction initiale des bundles...', 'cyan');
        
        exec('node tools/build.js', { cwd: ROOT_DIR }, (error, stdout, stderr) => {
            if (error) {
                log(`❌ Erreur build initial: ${error.message}`, 'red');
                if (stderr) log(stderr, 'red');
                reject(error);
            } else {
                log('✅ Bundles construits avec succès', 'green');
                resolve();
            }
        });
    });
}

// Point d'entrée principal
async function main() {
    const args = process.argv.slice(2);
    
    // Analyser les arguments
    const isHelp = args.includes('--help') || args.includes('-h');
    const isWatch = args.includes('--watch');
    const portArg = args.find(arg => arg.startsWith('--port='));
    const port = portArg ? parseInt(portArg.split('=')[1]) : DEFAULT_PORT;
    
    if (isHelp) {
        showHelp();
        return;
    }
    
    // Validation du port
    if (isNaN(port) || port < 1 || port > 65535) {
        log(`❌ Port invalide: ${port}`, 'red');
        process.exit(1);
    }
    
    try {
        // Build initial si en mode watch
        if (isWatch) {
            await buildAllBundles();
        }
        
        // Démarrer le serveur
        const server = new DevServer(port, isWatch);
        server.start();
        
        // Gestion de l'arrêt propre
        process.on('SIGINT', () => {
            log('\n👋 Arrêt du serveur...', 'yellow');
            server.stop();
            process.exit(0);
        });
        
    } catch (error) {
        log(`💥 Erreur fatale: ${error.message}`, 'red');
        process.exit(1);
    }
}

// Gestion des erreurs non capturées
process.on('uncaughtException', (error) => {
    log(`💥 Erreur non gérée: ${error.message}`, 'red');
    console.error(error.stack);
    process.exit(1);
});

// Lancer le serveur
main(); 