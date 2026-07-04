/**
 * @file AIModelStore.js
 * "Model zoo" : persistance nommée des modèles DQN (pilotes IA) — base des futurs PNJ/adversaires.
 *
 * Stockage :
 *  - IndexedDB (scheme natif TF.js `indexeddb://pc-model-<nom>`) : modèles entraînés localement.
 *  - `assets/models/<nom>/model.json` (+ meta.json) : modèles pré-entraînés livrés dans le repo,
 *    chargés en fallback si le nom n'existe pas en IndexedDB (chemin "joueur frais").
 *  - Registre de métadonnées : localStorage['pocketcosmos-model-registry'] (JSON), une entrée
 *    par modèle { name, role, objective, stateVersion, stateSize, actionCount, episodes,
 *    bestEvalScore, successRate, createdAt, updatedAt, notes }.
 *
 * Compatibilité : tout chargement valide stateVersion/stateSize (AI_TRAINING.STATE) ET la forme
 * d'entrée réelle du réseau. Un modèle incompatible est refusé avec un console.warn explicite
 * (les modèles v1 à 10 dims sont obsolètes depuis STATE_VERSION 2).
 *
 * Classe purement utilitaire (méthodes statiques, pas d'EventBus) : l'émission des événements
 * AI.MODEL_SAVED/LOADED/DELETED/EXPORTED reste à la charge des appelants (RocketAI, UI).
 */
class AIModelStore {
    static get REGISTRY_KEY() { return 'pocketcosmos-model-registry'; }
    static get IDB_PREFIX() { return 'indexeddb://pc-model-'; }
    static get ASSETS_BASE() { return 'assets/models/'; }

    // ---- Registre de métadonnées (localStorage) ----

    static _readRegistry() {
        try {
            const raw = localStorage.getItem(AIModelStore.REGISTRY_KEY);
            const reg = raw ? JSON.parse(raw) : {};
            return (reg && typeof reg === 'object') ? reg : {};
        } catch (e) {
            return {};
        }
    }

    static _writeRegistry(registry) {
        try {
            localStorage.setItem(AIModelStore.REGISTRY_KEY, JSON.stringify(registry));
        } catch (e) {
            console.warn('[AIModelStore] Impossible d\'écrire le registre :', e.message);
        }
    }

    // Nom sûr pour les schemes TF.js et les chemins assets/
    static _sanitizeName(name) {
        const n = String(name || 'default').trim();
        if (!/^[a-zA-Z0-9_-]+$/.test(n)) {
            throw new Error(`[AIModelStore] Nom de modèle invalide "${n}" (autorisé : lettres, chiffres, - et _)`);
        }
        return n;
    }

    static _currentStateSpec() {
        const S = (typeof AI_TRAINING !== 'undefined' && AI_TRAINING.STATE) ? AI_TRAINING.STATE : {};
        return {
            stateVersion: S.STATE_VERSION || 2,
            stateSize: S.STATE_SIZE || 12
        };
    }

    // ---- API principale ----

    /**
     * Sauvegarde un modèle sous un nom + met à jour le registre de métadonnées.
     * @param {tf.LayersModel} model
     * @param {string} name
     * @param {object} metadata - { role?, objective?, episodes?, bestEvalScore?, successRate?, notes? }
     * @return {Promise<object>} L'entrée de registre écrite.
     */
    static async save(model, name, metadata = {}) {
        const n = AIModelStore._sanitizeName(name);
        if (!model || typeof model.save !== 'function') {
            throw new Error('[AIModelStore] save() : modèle invalide');
        }
        await model.save(AIModelStore.IDB_PREFIX + n);

        const spec = AIModelStore._currentStateSpec();
        const registry = AIModelStore._readRegistry();
        const existing = registry[n] || {};
        const entry = {
            name: n,
            role: metadata.role || existing.role || null,
            objective: metadata.objective || existing.objective || null,
            stateVersion: spec.stateVersion,
            stateSize: spec.stateSize,
            actionCount: (model.outputs && model.outputs[0] && model.outputs[0].shape)
                ? model.outputs[0].shape[model.outputs[0].shape.length - 1] : null,
            episodes: (metadata.episodes !== undefined) ? metadata.episodes : (existing.episodes || 0),
            bestEvalScore: (metadata.bestEvalScore !== undefined) ? metadata.bestEvalScore : (existing.bestEvalScore ?? null),
            successRate: (metadata.successRate !== undefined) ? metadata.successRate : (existing.successRate ?? null),
            notes: metadata.notes || existing.notes || '',
            source: 'indexeddb',
            createdAt: existing.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        registry[n] = entry;
        AIModelStore._writeRegistry(registry);
        return entry;
    }

    /**
     * Charge un modèle par nom : IndexedDB d'abord, sinon assets/models/<nom>/model.json
     * (modèles pré-entraînés livrés dans le repo, avec meta.json à côté).
     * Valide la compatibilité (stateVersion/stateSize + forme d'entrée du réseau).
     * @return {Promise<{model: tf.LayersModel, metadata: object}>}
     * @throws si introuvable ou incompatible.
     */
    static async load(name) {
        const n = AIModelStore._sanitizeName(name);
        let model = null;
        let metadata = AIModelStore.getMetadata(n);

        try {
            model = await tf.loadLayersModel(AIModelStore.IDB_PREFIX + n);
        } catch (e) {
            // Pas en IndexedDB -> tenter les assets livrés dans le repo
            try {
                model = await tf.loadLayersModel(AIModelStore.ASSETS_BASE + n + '/model.json');
                if (!metadata) {
                    try {
                        const resp = await fetch(AIModelStore.ASSETS_BASE + n + '/meta.json');
                        if (resp.ok) metadata = await resp.json();
                    } catch (metaErr) { /* meta.json optionnel */ }
                }
                if (metadata) metadata.source = 'assets';
            } catch (assetErr) {
                throw new Error(`[AIModelStore] Modèle "${n}" introuvable (ni IndexedDB, ni ${AIModelStore.ASSETS_BASE}${n}/)`);
            }
        }

        try {
            AIModelStore._validateCompatibility(model, metadata, n);
        } catch (validationError) {
            try { model.dispose(); } catch (e) { /* ignore */ }
            throw validationError;
        }
        return { model, metadata: metadata || null };
    }

    /**
     * Refuse un modèle dont la version/dimension d'état ne correspond pas au vecteur courant.
     * Deux niveaux : métadonnées (si présentes) et forme d'entrée réelle du réseau (toujours).
     */
    static _validateCompatibility(model, metadata, name) {
        const spec = AIModelStore._currentStateSpec();

        const inputShape = (model.inputs && model.inputs[0] && model.inputs[0].shape) ? model.inputs[0].shape : null;
        const inputSize = inputShape ? inputShape[inputShape.length - 1] : null;
        if (inputSize !== null && inputSize !== spec.stateSize) {
            console.warn(`[AIModelStore] Modèle "${name}" refusé : entrée réseau ${inputSize} dims ≠ vecteur d'état courant ${spec.stateSize} dims (STATE_VERSION ${spec.stateVersion}). Ré-entraînez ou importez un modèle compatible.`);
            throw new Error(`[AIModelStore] Modèle "${name}" incompatible (stateSize ${inputSize} ≠ ${spec.stateSize})`);
        }

        if (metadata && metadata.stateVersion !== undefined && metadata.stateVersion !== spec.stateVersion) {
            console.warn(`[AIModelStore] Modèle "${name}" refusé : stateVersion ${metadata.stateVersion} ≠ ${spec.stateVersion} (sémantique du vecteur d'état différente malgré une dimension identique).`);
            throw new Error(`[AIModelStore] Modèle "${name}" incompatible (stateVersion ${metadata.stateVersion} ≠ ${spec.stateVersion})`);
        }
    }

    /**
     * Liste les modèles connus : fusion du registre (métadonnées) et du contenu réel
     * d'IndexedDB (au cas où le registre aurait été perdu/désynchronisé).
     * @return {Promise<object[]>} Entrées triées par updatedAt décroissant.
     */
    static async list() {
        const registry = AIModelStore._readRegistry();
        try {
            const stored = await tf.io.listModels();
            for (const url of Object.keys(stored)) {
                if (url.startsWith(AIModelStore.IDB_PREFIX)) {
                    const n = url.slice(AIModelStore.IDB_PREFIX.length);
                    if (!registry[n]) {
                        registry[n] = {
                            name: n,
                            source: 'indexeddb',
                            notes: '(hors registre — métadonnées inconnues)',
                            updatedAt: stored[url].dateSaved ? new Date(stored[url].dateSaved).toISOString() : null
                        };
                    }
                }
            }
        } catch (e) { /* tf.io.listModels indisponible : registre seul */ }
        return Object.values(registry).sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
    }

    /** Métadonnées d'un modèle (registre local uniquement, synchrone). */
    static getMetadata(name) {
        const n = AIModelStore._sanitizeName(name);
        return AIModelStore._readRegistry()[n] || null;
    }

    /** Supprime un modèle d'IndexedDB et du registre. */
    static async delete(name) {
        const n = AIModelStore._sanitizeName(name);
        try {
            await tf.io.removeModel(AIModelStore.IDB_PREFIX + n);
        } catch (e) { /* absent d'IndexedDB : on nettoie quand même le registre */ }
        const registry = AIModelStore._readRegistry();
        delete registry[n];
        AIModelStore._writeRegistry(registry);
        return true;
    }

    /**
     * Exporte un modèle vers des fichiers téléchargés (<nom>.json + <nom>.weights.bin
     * + <nom>.meta.json). À copier dans assets/models/<nom>/ (renommer en model.json /
     * meta.json) pour livrer un modèle pré-entraîné dans le repo.
     */
    static async exportToFile(name) {
        const n = AIModelStore._sanitizeName(name);
        const { model, metadata } = await AIModelStore.load(n);
        try {
            await model.save('downloads://' + n);
            const meta = metadata || { name: n, ...AIModelStore._currentStateSpec() };
            const blob = new Blob([JSON.stringify(meta, null, 2)], { type: 'application/json' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = n + '.meta.json';
            a.click();
            URL.revokeObjectURL(a.href);
        } finally {
            try { model.dispose(); } catch (e) { /* ignore */ }
        }
        return true;
    }

    /**
     * Importe un modèle depuis des fichiers locaux (model .json + .weights.bin, sortis
     * d'exportToFile) et le sauvegarde en IndexedDB sous `name`.
     * @param {FileList|File[]} fileList
     * @param {string} name
     * @param {object} metadata
     */
    static async importFromFiles(fileList, name, metadata = {}) {
        const n = AIModelStore._sanitizeName(name);
        const files = Array.from(fileList || []);
        const jsonFile = files.find(f => f.name.endsWith('.json') && !f.name.endsWith('.meta.json'));
        const weightFiles = files.filter(f => f.name.endsWith('.bin'));
        if (!jsonFile || weightFiles.length === 0) {
            throw new Error('[AIModelStore] importFromFiles : sélectionnez le fichier .json du modèle ET son .weights.bin');
        }
        const model = await tf.loadLayersModel(tf.io.browserFiles([jsonFile, ...weightFiles]));
        try {
            AIModelStore._validateCompatibility(model, metadata, n);
            const entry = await AIModelStore.save(model, n, { notes: 'importé depuis fichiers', ...metadata });
            return entry;
        } finally {
            try { model.dispose(); } catch (e) { /* ignore */ }
        }
    }
}

// Exposition globale (pas de modules ES6 dans ce projet)
window.AIModelStore = AIModelStore;
