# Modèles IA livrés (pilotes PNJ)

Ce dossier contient les **modèles DQN pré‑entraînés** livrés avec le jeu. Chaque modèle est chargeable
au démarrage par `AIModelStore.load('<nom>')` (repli automatique ici si le modèle n'est pas déjà en
IndexedDB). C'est ce qui permettra aux PNJ/adversaires de voler avec un pilote entraîné dès la première
partie, sans que le joueur ait à entraîner quoi que ce soit.

Voir [CLAUDE.md](../../CLAUDE.md) §AI System et [CHANGELOG.md](../../CHANGELOG.md) (pipeline d'entraînement IA).

## Structure attendue

Un modèle = un sous‑dossier `assets/models/<nom>/` contenant **3 fichiers** :

```
assets/models/<nom>/
├── model.json          ← topologie du réseau + manifeste des poids
├── <nom>.weights.bin   ← poids binaires (nom référencé À L'INTÉRIEUR de model.json)
└── meta.json           ← métadonnées (objectif/rôle, stateVersion, épisodes, score…)
```

> ⚠️ **Compatibilité** : seuls les modèles `stateVersion: 2` / `stateSize: 12` sont acceptés au
> chargement (voir `AI_TRAINING.STATE` dans `constants.js`). Un modèle incompatible est refusé avec un
> avertissement console. Ne pas éditer `model.json`/`meta.json` à la main.

## Entraîner et livrer un modèle (procédure)

Tout se passe **dans le navigateur** (l'entraînement utilise TensorFlow.js). Deux options :

### Option A — console (recommandée pour la livraison)

1. Sers le projet en local : `python -m http.server 8000` puis ouvre
   `http://localhost:8000/training-interface.html` (ou `index.html`).
2. Ouvre la console développeur (F12) et lance :
   ```js
   await trainAndDeliver()                                   // navigate, 800 épisodes, seed 1234 → 'navigate-v1'
   // ou un rôle :
   await trainAndDeliver({ role: 'race', episodes: 1200 })   // → 'race-v1'
   await trainAndDeliver({ role: 'intercept', episodes: 1500 })
   ```
   **Garde l'onglet au premier plan** pendant l'entraînement (en arrière‑plan, TF.js ralentit beaucoup).
3. En fin d'entraînement, 3 fichiers sont **téléchargés** : `<nom>.json`, `<nom>.weights.bin`,
   `<nom>.meta.json`. La console affiche la marche à suivre exacte.
4. Range‑les dans `assets/models/<nom>/` en **renommant** :
   - `<nom>.json` → `model.json`
   - `<nom>.weights.bin` → **garde ce nom** (référencé dans `model.json`)
   - `<nom>.meta.json` → `meta.json`
5. Commit le dossier.

Pour livrer un modèle déjà entraîné (via l'UI) : `await deliverModel('<nom>')`.

### Option B — interface graphique

`training-interface.html` : renseigne « Nom du modèle », choisis un rôle/objectif, lance l'entraînement,
puis dans le **panneau Model Zoo** clique sur ⬇️ (exporter). Range/renomme les fichiers comme ci‑dessus.

## Vérifier / comparer

```js
await AIModelStore.list()                       // modèles connus (zoo + assets)
await compareModels('navigate-v1', 'race-v1')   // duel sur un jeu d'évaluation fixe
```

## Charger un modèle dans une partie

```js
const ai = new RocketAI(window.eventBus);
await ai.waitForReady();
await ai.loadModel('navigate-v1');   // depuis IndexedDB, sinon assets/models/navigate-v1/
// ai pilote désormais en inférence pure (posture PNJ) dès qu'il est actif
```

_(Aucun modèle n'est encore livré : ce dossier ne contient que ce README tant que le premier
entraînement n'a pas été commité.)_
