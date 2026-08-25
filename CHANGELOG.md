# CHANGELOG — Pocket Cosmos

Historique des changements notables. Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/),
ordre antéchronologique. Le dépôt n'a **pas de tags de version** ; les sections sont donc datées.
Voir aussi [PHYSICS.md](PHYSICS.md) (détails techniques), [TODO.md](TODO.md) (dettes/à faire) et
[CLAUDE.md](CLAUDE.md) (architecture).

---

## [Non publié] — Réparation de la fusion IA + audit du code amont — 2026‑08‑25

> Cette passe cible ce que la fusion `b2d2a17` (refonte IA amont + campagne de correctifs) avait
> cassé, puis le code amont jamais audité (rôles PNJ, model zoo IndexedDB, RNG seedé, état 12 dims).
> Trois audits indépendants ont convergé sur les mêmes points majeurs ; chaque correctif ci‑dessous
> a été **prouvé puis re‑vérifié** sur banc Node exécutant le vrai Matter.js et le vrai TensorFlow.js.

### Critique — le pipeline d'entraînement IA était entièrement mort

- **`TrainingOrchestrator.startTraining` : `runId` jamais déclaré.** La fusion a gardé les trois
  usages de `runId` et perdu sa déclaration. En mode strict (corps de classe), `trainingLoop(runId)`
  levait une `ReferenceError`, puis `cleanupAfterError(runId)` la relevait depuis le `catch` :
  `startTraining()` rejetait. **Aucun entraînement ne pouvait démarrer**, par aucun chemin (bouton
  de l'interface, `quickTraining()`, `trainAndDeliver()`, `runCurriculum()`). Effet de bord :
  `_runGeneration` n'était jamais incrémenté, donc toutes les gardes de génération étaient inertes.
  *Mesuré avant : `ReferenceError: runId is not defined`, `_runGeneration = 0`. Après : le run
  démarre, `_runGeneration = 1`.*
- **`RocketAI.loadModel` : `previousModel` et `loaded` jamais déclarés.** Ligne orpheline de
  l'ancien chargeur localStorage, greffée sur le chargeur `AIModelStore` amont. Elle s'exécutait
  APRÈS l'installation du nouveau modèle : `loadModel()` renvoyait donc **toujours `false`** tout en
  laissant `targetModel` périmé, `_modelLoaded` à faux et `modelName` inchangé. Conséquences : le
  bouton « Charger Modèle » et les 📂 du zoo inopérants, le warm‑start de curriculum (`loadFrom`)
  silencieusement ignoré, `compareModels()` toujours en échec, et l'inférence PNJ bloquée sur
  l'heuristique `maintainOrbit`. *Mesuré avant : « Chargement du modèle échoué : previousModel is
  not defined ». Après : chargement réussi, target network reconstruit, `AI_MODEL_LOADED` émis.*
- **`TrainingOrchestrator.evaluateAgent` : `evaluatedEpisodes` jamais déclaré.** L'incrément levait
  une `ReferenceError` dès le premier épisode d'évaluation, avalée par deux `catch` silencieux.
  L'évaluation n'aboutissait **jamais** : `bestAverageReward` restait à `-Infinity`, aucun meilleur
  modèle n'était mémorisé, l'arrêt anticipé n'avait aucune donnée, et `AI_EVALUATION_COMPLETED`
  n'était jamais émis — sans le moindre message. *Après : l'événement est émis.*

### Majeur — apprentissage faussé

- **`isDone()` avait perdu la terminaison sur succès** (absente des DEUX parents de la fusion).
  Trois conséquences : `successTimeCredit()` payait le crédit de fin ET l'agent continuait
  d'encaisser le shaping de tous les pas restants (le double‑comptage même que ce crédit doit
  empêcher) ; `isEpisodeSuccessful()` exigeant `steps < 0,8 × budget`, les rôles `orbiter` et
  `lander` enregistraient **0 % de réussite quelles que soient leurs performances** ; et le succès
  n'étant évalué qu'au pas de timeout, une fusée stabilisée puis repartie était notée en échec.
- **Terme de récompense fantôme revenu par la fusion** : `(radialVelocity / 100) * 0.5` dans
  `calculateHeadingAlignmentReward`. Son `/100` datait d'un `VELOCITY_TARGET` de 30 u/s ; à la cible
  de croisière actuelle (2500 u/s) il payait ~12,5 par pas — jusqu'à 50 à `VELOCITY_MAX` — contre un
  maximum de 1,0 pour l'alignement et un budget d'épisode entier de 3000 pour la distance. La
  politique optimale devenait un yo‑yo rapportant ~10⁵ contre 1000 pour réussir. Retiré ; le bonus
  radial légitime, mis à l'échelle par `VELOCITY_TARGET`, reste dans `calculateVelocityReward`.
- **Échelle positionnelle adaptée à la tâche ignorée.** `buildStateVector` lisait une constante fixe
  alors que ses deux appelants calculaient et transmettaient `positionScale`. Pour `orbit`/`land`
  (rôles `orbiter`/`lander`), les dims 0/1/7 restaient confinées dans [0,005 ; 0,015] pendant que les
  dims 4/5/9 étaient d'ordre 1 : ~200× de déséquilibre de conditionnement en amont de la première
  `layerNormalization`.
- **Rôle `intercept` : le shaping combattait son propre critère de succès.** La zone de freinage et
  le bonus de stabilisation paient l'immobilité, alors que réussir exige de suivre une cible qui
  s'éloigne à 800 u/s. Les deux sont désormais désactivés en mode `successMode: 'proximity'`.
- **`calculateLandingReward` comparait une vitesse en échelle Matter** à un seuil de 5, soit
  0,3 u/s : critère ~16,7× trop strict, sur le chemin chaud du rôle `lander`. Passé en u/s.
- **Statut de fin d'épisode**: une réussite franche était rapportée `max_steps_reached`, les
  missions à jeton n'étant jamais « réussies » au sens du gestionnaire de missions.

### Reproductibilité

- **La graine ne servait à rien pour les angles initiaux** : `reset()` réécrasait avec un
  `Math.random()` non seedé l'angle que l'orchestrateur venait de poser — annulant du même coup le
  **jeu d'évaluation à 10 angles fixes**, prémisse de la comparabilité des scores et de
  `compareModels`. L'orchestrateur ne demande plus la randomisation, et `reset()` accepte un
  `config.rng`.
- **L'échantillonnage du minibatch** (le plus gros consommateur d'aléa) et le repli d'`act()`
  utilisaient encore `Math.random()`.
- **`SeededRandom.mulberry32` repliait la graine 0 sur 1** via un `|| 1` hérité d'un LCG : deux runs
  distincts produisaient la même séquence. mulberry32 étant un mélangeur à compteur, l'état 0 est
  valide. *Vérifié : séquences distinctes, moyenne 0,50046 sur 200 000 tirages, déciles à ±2,3 %.*

### Model zoo (IndexedDB)

- **Aucune validation du nombre d'actions** au chargement, bien que `save()` enregistre
  `actionCount` : un modèle à sortie plus large se chargeait, puis `argMax` renvoyait un indice hors
  table et la fusée cessait de répondre, sans message.
- **`importFromFiles` ignorait le `meta.json`** qu'il excluait pourtant de la recherche : aucune
  `stateVersion` n'était vérifiée, puis `save()` estampillait la version courante — un modèle
  entraîné sous une autre sémantique d'état était réétiqueté « compatible » en silence.
- **`exportToFile`** cliquait une ancre détachée du document (ignorée par Firefox) et révoquait
  l'URL de l'objet de façon synchrone (course avec le démarrage du téléchargement sur Chromium) :
  le `meta.json` pouvait manquer — précisément le fichier qui porte `stateVersion`.
- **Les échecs de sauvegarde étaient totalement muets** (quota, navigation privée) : un run entier
  pouvait ne rien persister avec une interface d'apparence saine. Nouvel événement
  `AI_MODEL_SAVE_FAILED`, journalisé dans l'interface.

### Curriculum

- `_curriculumAborted` n'était remis à zéro qu'APRÈS la boucle, alors que `stopTraining()` le lève
  pour n'importe quel run : un simple arrêt manuel faisait avorter le curriculum suivant.
- L'état d'arrêt anticipé (`recentPerformance`, `earlyStoppingCounter`) n'était pas réinitialisé
  entre étapes : une étape démarrait avec les scores d'un autre objectif, sur une autre échelle.
- Une étape déclarant `{objective:'orbit'}` sous un `role:'race'` global entraînait `navigate`.
- Le nom de modèle par défaut était `<rôle>-default` et non `<rôle>-v<n>` : deux étapes successives
  sur le même rôle s'écrasaient dans le zoo.

### Interface d'entraînement

- **« Charger Modèle » levait `TypeError: Assignment to constant variable`** hors session (`const`
  réassigné). Le chargement exige désormais une session active, avec un message explicite.
- **« Sauvegarder » hors session écrasait un modèle entraîné par des poids aléatoires** : un agent
  neuf était créé et enregistré sous le nom visé, tandis que `AIModelStore.save` conservait les
  statistiques (épisodes, score) de l'ancien — le zoo continuait donc d'annoncer un entraînement
  qui n'existait plus. Refusé hors session.
- **Le champ « Fréquence de mise à jour » était inerte** : `runTrainingEpisode` lit
  `rocketAI.config.updateFrequency`, que l'orchestrateur ne recopiait plus.
- **`train.js`** dupliquait une table d'actions partielle : `step()` ne remettant à zéro que les
  propulseurs présents, un `thrustBackward` laissait l'arrière à fond jusqu'à la fin de l'épisode.
  Conversion factorisée sur `RocketAI.ACTION_THRUSTERS`.

### Jeu — corrections visibles par le joueur

- **La jauge de vitesse du HUD était inversée là où elle compte.** Elle comparait la vitesse
  **absolue** à `CRASH_SPEED_THRESHOLD`, alors que la détection de crash applique ce seuil à la
  vitesse **relative au corps**. Une fusée parfaitement immobile posée sur Phobos (vitesse orbitale
  960 u/s ≈ 16 000 en échelle Matter, soit 640 % du seuil) affichait une jauge ROUGE pleine, tandis
  qu'une approche réellement fatale sur une Terre immobile s'affichait en vert.
- **Les 800 étoiles avaient une luminosité `NaN`.** `UniverseModel` et `GameSetupController`
  lisaient `PARTICLES.STAR_BRIGHTNESS_BASE`/`_RANGE`/`STAR_TWINKLE_FACTOR`, qui n'existent que sous
  `RENDER`. Le garde‑fou prévu pour ce cas ne pouvait pas se déclencher (`typeof NaN === 'number'`).
  De plus `updateStars` réécrivait `brightness` à chaque frame alors que la vue recalcule le
  scintillement de son côté : 800 `Math.sin` par frame pour rien, et toute luminosité fournie par un
  preset écrasée dès la première frame. Le modèle porte désormais la luminosité de BASE, la vue
  l'anime et l'honore. *Mesuré : 800/800 étoiles `NaN` avant, 0/800 après.*
- **Vecteurs de poussée fantômes** : les visualisations ne testaient que `power > 0`, sans les deux
  conditions où `ThrusterPhysics` annule réellement la force (réservoir vide, couple latéral
  neutralisé au sol). Réservoir vide, maintenir ↑ dessinait une flèche « Poussée » pleine longueur
  et une flèche `a=F/m` incluant une poussée inexistante.
- **Le bouton 🔇 ne coupait que la musique** : la boucle des propulseurs et les impacts restaient
  audibles. `AudioManager.setEnabled()` existait pour cela mais n'était appelé de nulle part.
- **La caméra était figée en pause** alors que la scène y est désormais dessinée : le joueur voyait
  une scène vivante qu'il ne pouvait ni déplacer ni zoomer. Zoom, glissement et recentrage sont
  rétablis en pause (opérations de vue pures, aucune physique n'avance).
- **Champ de gravité (touche G)** : le frein de recalcul de la grille ne pouvait jamais s'enclencher,
  sa signature de cache changeant à chaque frame (la caméra suit la fusée, les corps orbitent). Le
  frein sert désormais dès que la caméra est lente ou immobile. *Mesuré : un recalcul complet coûte
  9,6 ms (grille 80×80, 21 corps), soit ~58 % du budget d'une frame à 60 fps ; en vol à vitesse de
  croisière il reste nécessaire à chaque frame pour rester exact — cf. TODO.md.*
- **Deux vecteurs calculés à chaque frame et jamais dessinés** (attractions Terre et Lune) : leurs
  branches d'affichage sont inatteignables. Calculs supprimés.
- **Vecteur d'état 12 dims en jeu** : les dims 10‑11 (vitesse de la cible) étaient structurellement
  nulles côté jeu, la cible et le corps de référence étant construits sans vitesse. Un modèle
  entraîné à intercepter voyait donc une caractéristique constamment nulle à l'inférence.
  *Vérifié : corps à 960 u/s → dim 10 = 0,384 = 960/2500, exactement l'échelle d'entraînement.*

---

## [Non publié] — Chasse aux bugs 7e passe — 2026‑08‑24

### Critique — la page pouvait geler définitivement
- **La boucle de jeu n'avait aucune résilience.** `gameLoop` ne planifiait la frame suivante qu'à sa
  toute dernière ligne, sans `try`. La moindre exception dans `update()` ou `render()` — typiquement
  un NaN atteignant Matter, qui fait échouer le solveur de collision — **tuait définitivement la
  chaîne `requestAnimationFrame`** : image gelée, plus aucune entrée, plus de pause, aucun message,
  rechargement de page obligatoire. Le corps de frame est désormais protégé et la frame suivante
  planifiée dans un `finally` (erreurs journalisées de façon throttlée). Vérifié : six exceptions
  consécutives, six frames planifiées, la boucle survit.
- **Une exception pendant la construction du monde était avalée et rapportée comme un SUCCÈS.**
  `buildWorldFromData` journalisait puis renvoyait l'univers partiellement construit :
  `RELOAD_COMPLETED` était émis, l'écran de démarrage disparaissait, et le joueur se retrouvait
  dans un **vide sans corps ni gravité**, la touche R sans effet — seul F5 en sortait. Un simple
  `null` égaré dans `bodies`, ou un `parentName` valant `"constructor"`, suffisait à le déclencher.
  L'erreur est désormais propagée : le chemin d'échec (`LOAD_FAILED`, réarmement de l'écran de
  démarrage) s'applique.

### Haute — une fusée posée « tremblait » et affichait la mauvaise vitesse
- **Le crochet `afterUpdate` écrasait l'épinglage au sol à chaque frame.** Il appelait
  `syncModelWithPhysics` **sans condition**, et comme il s'exécute à la FIN de `Engine.update`, il
  passait AVANT le garde équivalent de `PhysicsController.update` (étape 6) — lequel ne pouvait
  donc **jamais** rien empêcher. Chaque frame, la position dérivée de `relativePosition` et la
  vélocité du corps porteur, écrites volontairement par `handleLandedOrAttachedRocket`, étaient
  remplacées par l'état post‑solveur.
  **Mesuré en headless** (sur les scripts de reproduction de l'audit) : sur Phobos (`orbitSpeed`
  0,8) la position du modèle oscillait de **±16 unités, soit ~40 % du rayon du corps** — largement
  visible, pas « sub‑pixel » ; sur la Lune, la barre de vitesse indiquait 7,6–8,4 u/s au lieu des
  10 u/s du corps porteur, en clignotant (les frames où la vérification périodique réépinglait
  rétablissaient la bonne valeur).
  **Après correction** : écrasement 0,000 u, distance au centre constante, vitesse exacte.
  **Aucune régression mesurée** : atterrissage, ré‑atterrissage après un saut (`maxAlt` et instant
  d'atterrissage identiques au dixième de frame) et décollage donnent des profils inchangés.
  Le prédicat est désormais une **source unique** (`SynchronizationManager.isRocketHandledManually`),
  appelée par le crochet ET par l'étape 6, au lieu d'être dupliquée dans le contrôleur et absente
  du crochet. [PHYSICS.md §4.1/§4.2](PHYSICS.md) documentaient un comportement que le code n'avait
  pas : corrigé.
  Vérifié au passage : dans les 6 mondes, **seul l'astre central est sans parent** — tous les corps
  sur lesquels on peut se poser sont donc couverts, et le cas `'Terre'` codé en dur est redondant.

### IA — l'agent était récompensé pour ÉCHOUER (audit numérique mesuré)
Un balayage a instrumenté la boucle d'entraînement avec un vrai TensorFlow.js et mesuré chaque
composante de récompense. Résultats corrigés :
- **Atteindre l'objectif était PUNI.** La réussite termine l'épisode et abandonne donc le façonnage
  restant, qui dépassait largement le bonus terminal : flâner à 3100 unités du point B rapportait
  **65 308** contre **55 014** en réussissant (×1,19 en faveur de l'échec) ; sur `orbit`, rester
  hors de la fenêtre de vitesse 2000 pas rapportait 980 contre 249 pour une orbite parfaite (×4).
  Les réussites créditent désormais les pas non consommés (`SUCCESS_TIME_CREDIT`) : succès ×1,17
  sur `navigate`, ×4,13 sur `orbit`.
- **Un terme caché pesait 55 % de la récompense totale.** `(radialVelocity/100)*0.5` était calibré
  pour un `VELOCITY_TARGET` de 30 u/s, devenu 2500 : il totalisait **30 551** par épisode quand la
  composante officielle de rapprochement est mathématiquement plafonnée à **100**. Parts réelles
  avant : cap 85,7 % / rapprochement **0,18 %**. Après suppression et rééquilibrage sur les sommes
  d'épisode : rapprochement 35 % · cap 39 % · vitesse 15 % · zones 11 % — l'ordre documenté.
- **S'auto-détruire valait 44× mieux que survivre** : la pénalité de crash était du code mort
  (`calculateReward()` était appelée AVANT `isDone()`, seul endroit qui pose `isDestroyed`).
  Crasher au pas 30 rapportait −0,45 contre −20 pour 2000 pas de survie ; désormais −100,45.
- **Le crash lunaire était mathématiquement inatteignable** : seule la détection de crash imminent
  posait `isDestroyed`, sans jamais renseigner le corps heurté, alors que la condition de réussite
  l'exige. Vérifié sur toute la plage 100→3000 u/s : 0 réussite avant, réussite à chaque vitesse
  après.
- **Les objectifs non-`navigate` démarraient à 90° de l'axe de poussée** (`-π/2` au lieu de `π`) :
  plein gaz depuis le sol menait au crash au pas 30 ; après correction, altitude 217 320 atteinte.
- **La détection d'atterrissage était bridée par une horloge TEMPS RÉEL** (150 ms) : en headless,
  **1 vérification tous les 3578 pas simulés**, soit ~60 s de simulation, alors que la fenêtre de
  contact fait 15 unités. Ramené à 1 par pas simulé, sans coût de débit mesurable.
- **Un dépassement de budget de pas était stocké comme état terminal** : la cible TD valait `r` seul
  au lieu de `r + γ·max Q'`, injectant une discontinuité d'environ 2000 une fois par épisode. Le
  drapeau `truncated` distingue désormais fin réelle et troncature temporelle.
- **L'échelle de l'état n'était calibrée que pour `navigate`** : sur `orbit`/`land`, les features de
  position restaient dans `[0,005 ; 0,015]` face à des features angulaires en O(1) — un déséquilibre
  de conditionnement d'environ ×200, en amont de la première couche de normalisation. Échelle
  désormais dépendante de la tâche (`STATE_SCALE_VERSION` 4).

> ⚠️ **Un constat de cet audit a été RÉFUTÉ par la mesure** et ne doit pas être « recorrigé » :
> il affirmait que `collisionFilter.group` était absent, donc qu'aucune paire de collision n'était
> jamais créée et que tout `CollisionHandler` était mort. Vérification directe sur les corps réels :
> `group` vaut 0, `Detector.canCollide` renvoie `true`, et un chevauchement franc produit bien une
> paire et déclenche `collisionStart`. Voir [TODO.md](TODO.md).

### Durcissement du chargement des mondes (audit par fuzzing)
Un balayage a soumis au vrai chargeur des dizaines de presets malformés. Aucune validation de
**finitude** n'existait : `physics.G = 1e400`, une masse `1e400`, un `orbitDistance` valant `"abc"`,
une `position` sous forme de tableau ou de chaîne — tout passait et empoisonnait le monde de NaN,
le plus souvent **sans le moindre avertissement**, jusqu'au gel de la page (cf. plus haut).
- Tous les champs numériques exigent désormais un nombre **fini** (et positif là où c'est requis),
  avec un message nommant le corps et le champ. Un `physics.G` non fini fait échouer le chargement
  (aucune récupération n'est possible) ; les autres champs retombent sur un défaut sain.
  Ajout d'une borne haute : `radius = 1e300` est *fini* mais fait déborder le calcul d'aire de
  Matter — c'était encore un monde NaN silencieux.
- **Cycles de parents de longueur ≥ 2** détectés et rompus (le système entier s'échappait à
  ~20 000 unités/frame, en silence).
- Un **`spawn.angle` mal typé** ne fait plus apparaître la fusée à (0,0), c'est‑à‑dire dans l'astre
  central (éjection à |v| ≈ 1,1e5) : repli explicite et bruyant. Le repli de la touche R a été
  aligné sur celui du chargement — il cherchait un corps littéralement nommé « Terre », donc les
  mondes 2 à 6 laissaient la fusée à (0,0).
- **Noms de corps dupliqués** signalés (le premier gagne, cohérent avec toutes les recherches par
  nom du jeu) ; un corps nommé `"__proto__"` ne peut plus corrompre la table de noms
  (`Object.create(null)` + `hasOwnProperty`).
- **Compteurs bornés** : nombre de ceintures, total d'astéroïdes, tableaux `stars`/`asteroids`
  explicites, avec avertissement (jamais de troncature silencieuse). 2000 ceintures × 20 000
  passaient de **28 s et 2 Go** à 55 ms. Avertissement au‑delà de 200 corps, troncature à 1000
  (la gravité du plugin est quadratique : 3003 corps = 718 ms/frame).
- Une quinzaine de mauvais types jusque‑là **silencieux** sont désormais signalés.

> **Non‑régression vérifiée** : un instantané complet des 6 mondes livrés (corps, masses, rayons,
> positions, vitesses, parents, anneaux, stations, étoiles, astéroïdes, spawn de la fusée) donne un
> **diff vide** avant/après, sans aucun message console nouveau.
>
> Bonne nouvelle du même audit : la **pollution de prototype n'est pas atteignable** — sondée à tous
> les niveaux du JSON, aucun prototype global n'est modifié.

### Corrections de régressions du tour précédent
- **Le retour au neutre du stick relançait la partie tout seul, propulseur latéral à fond.** Mon
  réarmement de la rotation clavier émettait `ROTATE_LEFT_START`, dont le gestionnaire demande la
  reprise du jeu — or ce code s'exécute dans `update()`, désormais appelé aussi en pause. Il émet
  maintenant un `ROTATE_COMMAND`, ignoré en pause.
- Les abonnements `RELOAD_COMPLETED` / `LOAD_FAILED` de l'écran de démarrage étaient enregistrés
  **dans** le gestionnaire du bouton : chaque nouvelle tentative après un échec en rajoutait une
  paire. Posés une seule fois, et suivis par `controllerContainer`.
- Le repli « sans EventBus » retirait le panneau **avant** son ajout au DOM (no-op garanti) : en cas
  d'échec de chargement d'un script, le panneau devenait impossible à fermer.
- Cliquer le **libellé** d'une case à cocher produit un clic synthétique (`detail === 0`)
  indiscernable du clavier : le focus restait sur la case et la barre Espace la cochait au lieu de
  propulser. Distinction souris/clavier faite par `pointerdown`.
- L'élagage de la trace supprimait le segment qui **entre** à l'écran (contrairement à ce que son
  propre commentaire affirmait) : le dernier point élagué sert désormais d'ancre.
- Le re-scan de manettes au débranchement pouvait ré-adopter la manette qu'on venait de débrancher
  (certains navigateurs laissent son entrée dans le tableau) — état sans retour. Garde d'index ajouté.

---

## [Non publié] — Chasse aux bugs 6e passe (blocages, entrées, ordonnancement) — 2026‑08‑24

Balayage de 4 agents (revue de régression du tour précédent, parcours de joueur EXÉCUTÉS en
headless, ordonnancement & machine à états, cas limites d'entrées + interface d'entraînement).

### Haute
- **Un échec de chargement du monde figeait le jeu définitivement.** `handleUniverseLoadRequested`
  est asynchrone, mais l'écran de démarrage était retiré du DOM dès le clic sur « Prêt ! ». Si le
  `fetch` échouait (404, JSON invalide, ou simplement l'ouverture d'`index.html` en `file://` —
  le piège que CLAUDE.md signale), le jeu retombait en `LOADING`, état que la boucle de jeu ne
  traite pas, **sans panneau de démarrage ni aucune touche opérante** : seul un rechargement de la
  page en sortait. Nouvel événement `UNIVERSE.LOAD_FAILED` ; le panneau n'est plus retiré qu'au
  chargement effectif et se réarme avec un message explicite en cas d'échec.
- **Régression du tour précédent — le clavier du jeu devenait inopérant** après un clic sur ⚙️, sur
  le bouton son ou sur une case à cocher : ces éléments gardent le focus, et mon filtre de saisie
  bloquait alors TOUTES les touches. Le filtre distingue désormais les contrôles de saisie
  (`select`, champ texte : tout leur revient) des contrôles d'activation (`button`, case à cocher :
  seuls Espace/Entrée). Un `blur()` est en outre rendu au jeu après un clic **souris** sur ces
  contrôles, sinon la barre Espace — touche de poussée documentée — refermait le panneau d'options
  au lieu de propulser.
- **Régression du tour précédent — propulseur bloqué en marche** si le focus changeait touche
  enfoncée (maintenir W puis cliquer un contrôle) : le relâchement était filtré comme l'appui. Les
  relâchements d'actions continues sont désormais toujours traités ; seules les actions « coup
  unique » restent filtrées pendant une saisie.

### Moyenne
- **Les raccourcis système pilotaient la fusée** : les modificateurs n'étaient testés que pour
  décider du `preventDefault`, le traitement s'exécutant quand même. Cmd/Ctrl+C recentrait la
  caméra, Cmd/Ctrl+V basculait les vecteurs, Ctrl+R réinitialisait la fusée, Cmd+A allumait un
  propulseur latéral. Filtrés — sauf les relâchements continus, pour ne jamais bloquer un propulseur.
- **Relâcher le stick gamepad tuait définitivement une rotation clavier maintenue** : le `value:0`
  coupe les deux propulseurs latéraux, et aucun nouveau `_START` ne pouvait être émis (la touche
  étant déjà mémorisée). La rotation clavier est maintenant réarmée.
- **Avec deux manettes, débrancher l'active laissait le jeu sans manette** (le scan n'a lieu qu'au
  démarrage et `gamepadconnected` n'est pas réémis pour une manette déjà branchée).
- **Un second doigt laissait le panoramique tactile actif** : plus aucun `preventDefault`, donc la
  page défilait derrière le canvas, et lever un doigt émettait un arrêt doigt encore posé.
- **L'image de pause n'était pas figée** : `elapsedTime` continuait d'avancer, donc les étoiles
  scintillaient sous le voile de pause depuis que la scène y est dessinée.
- **Blocage latent après échec de chargement** : une fusée détruite pouvait être remise en `PLAYING`,
  d'où un retour immédiat en `CRASH_ANIMATION` dont plus rien ne fait sortir (aucune explosion en
  cours, `ROCKET.DESTROYED` non réémis sur une épave). Elle est désormais renvoyée en `GAME_OVER`.
- **Trace** : les deux branches « point invalide » héritaient d'un état d'élagage périmé et
  pouvaient perdre le premier segment d'un tronçon.

### Basse
- Message de crash affichant la vitesse angulaire en « rad/s » alors qu'elle est en échelle Matter
  (il affiche maintenant les deux). L'aide de démarrage annonçait encore « C — Vue fusée / Vue
  libre » alors que C recentre désormais toujours.
- [PHYSICS.md §1.2](PHYSICS.md) documente désormais le piège d'unités de la vitesse **angulaire**
  (échelle Matter, ~×16,7), symétrique de celui des vitesses linéaires.

### Interface d'entraînement IA
- **Arrêter puis relancer un entraînement en moins d'une seconde tuait le second run.** La
  finalisation asynchrone de l'ancien run libérait `rocketAI`/`trainingEnv`/`evaluationEnv` alors
  que le nouveau les avait déjà recréés → `TypeError` et « Erreur d'entraînement ». Compteur de
  génération de session propagé à toute la chaîne asynchrone.
- **« Charger Modèle » pendant un entraînement détruisait le modèle en cours d'utilisation par
  `model.fit()`** — et l'échec était silencieux (le message contenait « dispos »). Refusé pendant
  un entraînement, et le bouton (comme « Reset ») est désactivé tant qu'une session est ouverte.
- **En mode visuel, l'objectif `navigate` affichait une Terre et une Lune FANTÔMES** (corps codés
  en dur injectés quand la liste est vide) et verrouillait la caméra ~370× trop loin : le couloir
  A→B de 127 000 unités faisait 0,3 px et les repères A/B étaient invisibles.
- Les courbes d'un second run s'ajoutaient à celles du premier ; `maxStepsPerEpisode` fuyait d'un
  run `navigate` (4000) vers un run `orbit`/`land` suivant ; trois statistiques restaient périmées
  après « Reset » ; « Meilleure Récompense » pouvait **diminuer** (max sur une fenêtre glissante) ;
  « Efficacité » dupliquait « Taux de Succès » ; le repli WebGL→CPU était du code mort
  (`setBackend` renvoie `false`, il ne lève pas) ; les métriques finales n'atteignaient jamais
  l'interface en cas de convergence ou d'arrêt anticipé ; deux flux d'événements alimentaient le
  visualiseur en double.

### Vérification
Harnais headless étendu au **pipeline de rendu complet** (vues réelles injectées) : aucune
exception ni rayon invalide en jeu comme en pause, `save`/`restore` équilibrés, et scène bien
dessinée en pause (4932 appels canvas identiques dans les deux états). Balayage du rendu sur
**toute la plage de zoom** (0,0025 → 6) × 3 mondes, vecteurs et équipotentielles activés : sain.

---

## [Non publié] — Chasse aux bugs 5e passe (entrées, caméra, rendu, contenu) — 2026‑08‑24

Balayage de 4 agents (revue de régression du tour précédent, économie/contenu des mondes,
robustesse numérique, vues & caméra). Les constats de contenu sont chiffrés.

### Haute — le jeu était inutilisable dans plusieurs situations
- **Injouable sur écran tactile.** `touchstart` était écouté sur `window` avec `preventDefault()`
  inconditionnel : le tap sur « Prêt ! » n'était jamais suivi du `click` synthétisé (Chrome/Safari),
  donc **le monde ne se chargeait jamais**. Idem pour le sélecteur de monde, ⚙️, le son et les cases
  à cocher. Le panoramique tactile ne démarre plus que depuis le canvas.
- **Le clavier volait les touches des contrôles HTML** : sur l'écran de démarrage, une flèche sur le
  sélecteur de monde était avalée par `preventDefault()` (impossible de changer de monde au clavier)
  *et* émettait une commande de poussée. `handleKeyDown`/`handleKeyUp` ignorent désormais les
  événements destinés à un `input`/`select`/`button`/`textarea`/zone éditable.
- **Le monde disparaissait entièrement en pause** : seul l'UI était rendu, puis le voile de pause
  semi-transparent était peint sur un canvas VIDE. La scène est maintenant rendue puis assombrie.
- **La touche C détachait la caméra au lieu de recentrer** dans le cas le plus courant (le mode
  par défaut étant déjà « suivi ») : la fusée sortait de l'écran. C recentre désormais toujours,
  immédiatement.
- **Un clic n'importe où sur la page démarrait un panoramique** (bouton ⚙️, son, cases à cocher) et
  sortait silencieusement la caméra du mode suivi. Le glissement ne démarre plus que sur le canvas.

### Régressions des correctifs du tour précédent
- **Propulseur latéral bloqué en marche après une pause** : le garde « ignorer la rotation en
  pause » avalait aussi `ROTATE_COMMAND {value: 0}` — l'unique signal qui remet les propulseurs
  latéraux à zéro, émis précisément pendant la pause (front descendant de l'axe, `blur`,
  déconnexion manette) et consommé au passage. À la reprise la fusée tournait sur elle-même en
  brûlant du carburant. L'arrêt est désormais toujours honoré ; seules les commandes actives sont
  ignorées.
- **Panache réduit à une seule particule** : `powerLevel` n'était écrit que par
  `handleSetThrusterPower`, donc un passage à 0 (désactivation de l'IA, rotation gamepad) le
  laissait figé bas pour toute la session. Les quatre démarrages de propulseur le rétablissent.
- **Test de grâce de décollage dupliqué** dans `SynchronizationManager`, resté en temps réel : en
  headless, le modèle se déclarait posé pendant que l'épinglage physique restait désactivé.
- Modes de spawn « hôte » et « absolu » rendus exactement complémentaires (un preset avec `hostName`
  sans `angle` numérique n'était traité par aucun des deux au chargement, mais l'était par R).

### Autres corrections
- **Ralentissement progressif du jeu** : la trace (anneau de 20 000 points) était intégralement
  reprojetée et re-tracée à chaque frame, sans élagage, avec une allocation d'objet par point
  (~1,2 M/s à 60 fps) — l'anneau se remplit en ~5,5 min de vol. Ajout d'un tampon réutilisé et d'un
  élagage hors écran : mesuré 1000 opérations de tracé au lieu de 6000 sur un cas de test.
- **Masquer puis réafficher la trace (T)** dessinait une ligne droite fictive entre les deux points,
  un trajet jamais parcouru. Une rupture est maintenant insérée.
- Un point de trace invalide **effaçait tout le tracé précédent** et déclenchait 60 avertissements
  console par seconde pendant ~5 minutes. Corrigé et throttlé.
- **Atterrir en escale détruisait la cargaison de mission** : `loadCargoForCurrentLocationMission`
  vidait le cargo INCONDITIONNELLEMENT, même quand aucune mission ne partait de ce lieu — or faire
  le plein impose justement de se poser. Le cargo n'est plus touché s'il n'y a rien à charger.
- `RocketCargo.addCargo` renvoyait `true` sur un chargement PARTIEL : une mission dépassant la
  capacité se serait chargée incomplètement, donc jamais validable, sans aucun signal.
- **Feature de vitesse angulaire de l'IA saturée** : `angularVelocity` est en échelle Matter
  (≈ rad/s × 16,7, mesuré) et non en rad/s ; la plage observable s'arrêtait à 1/8 du seuil de crash,
  le réseau ne distinguait pas une rotation sûre d'une rotation fatale. Recalibrée sur
  `CRASH_ANGULAR_VELOCITY` ; `STATE_SCALE_VERSION` passe à 3. Annotations d'unités corrigées.
- La récompense orbitale en jeu gardait l'ancienne convention d'angle (90° d'écart) et comparait une
  vitesse angulaire Matter à un seuil en rad/s.
- Glissement en cours non annulé sur `blur` (au retour, la caméra suivait la souris sans bouton) ni
  sur rechargement de monde (ancres périmées → saut arbitraire dans le vide).
- Durcissements contre des états irrécupérables : `setZoom` filtre NaN (`Math.max` ne le fait pas,
  un zoom NaN rendait le canvas définitivement blanc) ; un corps déclaré parent de lui-même est
  rejeté (sa vélocité doublait par frame jusqu'à l'infini) ; une hauteur d'atmosphère négative est
  rejetée (`ctx.arc` lève et fige l'écran à chaque frame).
- Bouton son : `play()` sans `.catch()` et icône 🔊 affichée même quand la lecture échouait.

### Contenu & équilibrage — signalé, NON corrigé (décisions d'auteur)
- **`5_Endor` — « Endor III » est inutilisable** : `orbitDistance 1200`, rayon 120, parent de rayon
  1050 ⇒ **30 unités** de corridor (la fusée en fait 60). Face interne : la fusée est dans la
  planète. Face externe : rapport poussée/gravité **0,68** ⇒ échouée définitivement.
- **`1_solar` — les missions m7/m8 sont impossibles à démarrer** : elles exigent de partir de
  Jupiter (ratio 0,583) et Saturne (0,595), or le cargo n'est délivré qu'en s'y **posant** — et on
  ne peut ni s'y poser ni en repartir. 780 crédits sur 2390 sont inatteignables et **l'état de
  victoire du seul monde à missions est donc hors d'atteinte**.
- **8 stations de ravitaillement sont posées sur des corps dont on ne peut pas redécoller**
  (Uranus 0,758 · Duna 0,847 · Ohann 0,486 · Adriana 0,528 · Endor Prime 0,535 · Calpamos 0,535 ·
  2 sur l'étoile Grand Feu 0,083) : un piège qui attire le joueur avec la promesse d'un plein.
- **Les marges de décollage au spawn sont bien plus faibles qu'annoncé** une fois la gravité du
  corps parent prise en compte : Kerbin **1,10**, Acheron **1,17**, Forêt-lune **1,18**, Terre 1,47
  — quatre des six mondes sous la cible 1,5–3 de [PHYSICS.md §2.3](PHYSICS.md). Aucun n'est
  injouable (le décollage vertical coûte de 577 à 1703 de carburant sur 6000).
- **Récompenses incohérentes** : m1 et m2 sont le même saut de 2000 unités, m2 paie 25 % de plus ;
  m3 (320) contre m4 (520) pour une distance identique. Les deux missions les mieux payées à
  l'unité de carburant sont justement les deux impossibles.
- **Sauts de lune à lune au-delà du seuil de crash** aux mauvaises phases orbitales : Phobos↔Deimos
  atteint 1680 u/s relatifs, soit **11× le seuil**. Conséquence des orbites cinématiques.
- **La tolérance d'amarrage est inversée par la taille** : plafonnée à π/12, elle donne ±97 unités
  sur Terre mais ±13 sur « Trou blanc » (rayon 50), dont l'icône couvre pourtant tout le corps.
- `R` reste un plein de carburant + téléportation gratuits, ce qui rend les stations presque
  redondantes ; les crédits n'ont aucun puits de dépense.

---

## [Non publié] — Chasse aux bugs 4e passe (physique, IA, câblage) — 2026‑08‑24

Balayage de 4 agents (revue de régression des correctifs précédents, particules/audio/poussée,
système d'événements & cycle de vie, IA en jeu & parité entraînement), findings vérifiés avant
correction. ~40 correctifs supplémentaires.

### Critique / haute
- **Un corps céleste présentait au solveur de collision une vitesse 1000× trop grande.**
  `Body.setVelocity` applique `timeScale = body.deltaTime / _baseDelta`, or `Engine._bodiesUpdate`
  **saute les corps statiques** : ils gardent `deltaTime = _baseDelta` (⇒ `timeScale = 1`) alors que
  la fusée obtient `≈ 0,001`. Le facteur `MATTER_BASE_DELTA`, correct pour la fusée, était donc faux
  ici : la fusée était éjectée de tout corps en orbite dès qu'elle n'était plus épinglée (décollage
  d'une lune, contact rasant). Remplacé par le `deltaTime` en secondes. Mécanisme vérifié contre le
  vrai Matter.js 0.19 (166,7 u/pas mesurés au lieu de 0,167). [PHYSICS.md §1.4](PHYSICS.md) corrigé.
- **`angularDamping` n'existe pas dans Matter.js** : les trois écritures de cette propriété étaient
  sans effet, et les constantes `ASSISTED_/NORMAL_ANGULAR_DAMPING` ne sont lues par aucun moteur.
  Façade supprimée ; l'assistance réelle (`applyRotationStabilization`) était en outre appliquée
  **par frame** et non par seconde — 2,4× plus forte à 144 Hz qu'à 60 Hz. Rendue indépendante du
  framerate (comportement strictement inchangé à 60 Hz).
- **L'espace d'action de l'IA était corrompu en entraînement** : l'environnement n'appliquait que les
  propulseurs présents dans l'objet action, si bien qu'un seul `thrustBackward` laissait le rétro à
  pleine puissance jusqu'à la fin de l'épisode ; `noAction` ne le coupait pas, et `rotate` coupait le
  principal en entraînement mais pas en jeu. Table canonique unique (`RocketAI.ACTION_THRUSTERS`)
  désormais lue par le jeu, l'entraînement et `train.js`.
- **Collisions désactivées pendant tout l'entraînement headless** : le garde de 2 s de
  `COLLISION_DELAY` est en temps RÉEL, or un épisode s'exécute en bien moins de 2 s — `isLanded` et
  `isDestroyed` n'étaient jamais posés par le chemin de collision, rendant l'objectif `land`
  inapprenable. Collisions activées d'emblée en headless.
- **Délai de grâce de décollage en temps réel** (500 ms) : même cause, il couvrait des milliers de
  pas simulés. Basculé sur une horloge de **temps simulé** (garde-fou temps réel conservé). Vérifié :
  ~31 pas simulés au lieu d'une éternité.
- **L'arrêt manuel d'un entraînement perdait le meilleur modèle** (finalisation sautée) et laissait
  agent, environnements et écouteurs Matter en vie.
- **L'arrêt anticipé se déclenchait systématiquement** dès que la meilleure récompense moyenne était
  négative (`best × 0,95 > best`) : tout entraînement s'arrêtait vers l'épisode ~300.

### Régressions des correctifs précédents (détectées et corrigées avant publication)
- Un échec interne de `resetWorld` laissait l'écran de chargement **bloqué en permanence**
  (l'exception était avalée, `restoreAfterFailure` n'était jamais appelé). `resetWorld` retourne
  désormais un booléen que l'appelant contrôle.
- Les crédits repartaient à 10 alors que les missions accomplies sont désormais conservées : les
  gains devenaient **irrécupérables** à chaque appui sur R. Crédits conservés.
- La rotation gamepad demandait la reprise à chaque frame : **mettre en pause devenait impossible**
  tant que le stick était dévié (ou simplement en dérive). `RocketController` suit maintenant l'état
  de pause et ignore ces commandes continues.
- Le débranchement de la manette relâchait aussi les touches **clavier** encore enfoncées.
- Modes de spawn `hostName` et absolu rendus exclusifs ; garde de chargement ajoutée à la bascule de
  pause (P/Échap pouvait relancer l'ancien monde pendant un fetch).

### Autres corrections
- Son du propulseur principal tournant **en boucle par-dessus le menu de pause** : son unique chemin
  d'arrêt testait des champs situés sur le mauvais objet (branche morte).
- Panache d'échappement identique à 5 % et à 100 % de poussée (`setEmitterPowerLevel` n'était appelé
  nulle part) : intensité désormais proportionnelle à la puissance réelle.
- `maintainOrbit()` — l'heuristique qui pilote réellement la fusée en jeu — visait un cap **à 90°**
  de l'axe de poussée et comparait des vitesses en échelle Matter à des seuils en u/s (~16,7×).
- Désactiver l'IA en vol laissait les **propulseurs allumés**.
- `loadModel()` acceptait silencieusement un modèle d'architecture incompatible (l'agent renvoyait
  ensuite des actions aléatoires à vie) ; validation + métadonnées de version ajoutées.
- « Sauvegarder » sans session écrasait le modèle entraîné par des **poids aléatoires**.
- `TrainingVisualizer` dessinait fusée et planètes en multipliant par le zoom au lieu de diviser :
  invisibles à l'échelle de travail. Fuites d'abonnements (agent IA, visualiseur) corrigées.
- `HeadlessRocketEnvironment` ignorait silencieusement le `config.eventBus` fourni.
- L'aide au pilotage, annoncée dans le README, était **inatteignable** (déclencheur jamais affecté) :
  touche **H** ajoutée et documentée.
- `index.html` lisait `UI.ICONS` avant le chargement de `constants.js` ; HUD DOM mort supprimé
  (`#altitude` affichait « -- » en permanence) ; code de modale inexistant retiré de `main.js`.
- Clic UI capté sur `window` (donc sur toute la page) au lieu du canvas, et coordonnées écran
  rapportées comme des coordonnées canvas.
- Documentation remise en accord avec le code : table des événements de CLAUDE.md (fausse sur
  9 lignes, + liste des événements sans consommateur et des handlers morts), génération procédurale
  annoncée mais non implémentée, constantes inexistantes citées dans le README.

### Connu, non corrigé (décision à prendre)
- **`STATION_DOCKED` / `STATION_REFUELED` n'ont toujours aucun abonné** : le ravitaillement reste
  silencieux. Le son `sputnik-beep.mp3` conviendrait, mais le choix relève du design sonore.
- **L'IA en jeu n'utilise jamais le réseau entraîné** : `AI_TOGGLE_TRAINING` n'est émis nulle part et
  aucun `loadModel()` n'est appelé côté jeu, donc la touche `I` lance l'heuristique `maintainOrbit`.
  De plus la distribution d'états en jeu (cible = centre d'un astre proche, échelle ~10³) n'a rien à
  voir avec celle de l'entraînement `navigate` (cible à 127 000 unités) : un modèle entraîné y verrait
  un vecteur quasi nul. **Rebrancher l'IA entraînée en jeu est un chantier de conception**, pas un
  correctif.
- `Kerbin` (monde 2) a un rapport poussée/gravité de **1,09** (marge de 9 %) — décollable mais très
  limite, hors de la plage 1,5–3 recommandée par [PHYSICS.md §2.3](PHYSICS.md). Équilibrage.
- Le garde de 150 ms (temps réel) de la vérification périodique d'atterrissage reste inadapté au
  headless (sans effet visible depuis que le chemin de collision fonctionne).

---

## [Non publié] — Chasse aux bugs 3e passe (jeu, rendu, IA) — 2026‑08‑24

Balayage de 4 agents (physique/sync, orchestration/événements, rendu/vues, IA/entraînement),
findings vérifiés dans le code avant correction. 29 bugs corrigés.

### Critique / haute — jeu cassé
- **Cargo jamais initialisé au démarrage normal → système de missions inerte.**
  `rocketModel.cargo` n'était créé que dans `GameController.resetRocket()` (touche R) ; au
  lancement normal il valait `undefined` et le garde de `handleRocketLanded` sautait
  silencieusement **complétion de mission et chargement du cargo**. L'invariant est désormais
  porté par le modèle : création dans le constructeur de `RocketModel`, purge dans `reset()`.
- **Écouteurs de collision empilés à chaque reset → dégâts d'impact multipliés.**
  Le moteur Matter est créé une seule fois, mais `initPhysics()` rappelait
  `setupCollisionEvents()` à chaque reset / changement de monde / épisode IA sans jamais
  désabonner : après 9 resets, un frôlement à 10 u/s détruisait la fusée. `Events.off` ajouté en
  tête (forme multi-noms validée contre la source Matter.js 0.19). Vérifié : 10 `initPhysics`
  → 1 écouteur par événement.
- **Target network jamais synchronisé pendant l'entraînement orchestré (DQN cassé).**
  La synchro périodique ne vivait que dans `RocketAI.step()`, que `TrainingOrchestrator`
  n'appelle jamais (il pilote via `act()`/`train()`) : tous les runs apprenaient contre les
  poids initiaux **aléatoires**. Synchro déplacée dans `train()`, sur un compteur unique
  partagé par les deux chemins.
- **Cap de la fusée à 90° de l'axe de poussée** dans la récompense d'alignement *et* la
  feature d'état : le nez est à `angle − π/2`, pas `angle`. L'IA était récompensée quand son
  **flanc** visait la cible (alignement parfait ⇒ récompense 0, opposé ⇒ −1).
- **Manette morte en pause : un joueur 100 % gamepad ne pouvait plus reprendre la partie.**
  Le gamepad est lu par polling, et l'état `PAUSED` n'appelait pas `inputController.update()`.
- **Objectif `orbit` quasi impossible à réussir** : vitesses comparées en échelle Matter
  (≈ u/s × 16,7) contre des seuils en u/s. Conversion ajoutée dans `checkOrbitSuccess`,
  `checkLandingSuccess`, `calculateOrbitReward`, shaping orbit et explore.

### Moyenne
- **Missions jamais rejouées après un crash** : la destruction les marque toutes « failed » et
  le respawn n'appelait pas `resetMissions()` → session définitivement sans mission ni crédits.
- **Propulseur coupé alors qu'une touche aliasée restait enfoncée** (W + Espace, KeyA +
  ArrowRight…) : un seul `_STOP` partagé, sans comptage de sources, et la répétition clavier ne
  pouvait pas le réarmer. Ajout de `InputController._hasActiveSourceFor()` (clavier + gamepad).
- **Bonus de vitesse radiale non borné** écrasant les incitations à freiner près du point B
  (+12,5/pas en croisière contre 10 max pour la stabilisation) : désormais coupé dans la zone
  de freinage, comme le bonus radial jumeau.
- **Features de vitesse saturées** dès 2000 u/s (`VELOCITY_SCALE` 1000, clamp ±2) alors que la
  cible est 2500 et le max 10000 : le réseau ne distinguait pas croisière et survitesse.
- **Angle initial « aléatoire » tiré une seule fois par run** (et non par épisode) : la
  politique surapprenait une orientation de départ unique.
- **Carburant jamais consommé en headless** : `rocketModel.update()` n'était pas appelé, donc
  la terminaison `fuel <= 0` et le statut `out_of_fuel` étaient du code mort.
- **Epsilon jamais décru en entraînement dans le jeu** (pas d'orchestrateur) : l'IA restait à
  100 % d'actions aléatoires. Décroissance centralisée dans `RocketAI.decayEpsilon()`.
- **HUD « Missions réussies ! » inatteignable** : la vue filtrait elle-même par statut mais ne
  recevait que les missions `pending`. La liste complète lui est désormais transmise.
- **Vecteurs de debug des propulseurs ancrés dans le mauvais repère** (offset local non tourné,
  direction en repère monde) et **dessinés sous la transformation zoom** alors que leurs
  longueurs/polices sont en pixels (invisibles au zoom arrière, démesurés au zoom avant).
- **Touche R pendant un chargement de monde** contournait le garde `_universeLoadInFlight` et
  relançait l'ancien monde (ou un monde vide au premier lancement).

### Basse
- `_lastRocketDestroyed` non purgé au rechargement de monde (prochain crash sans `MISSION.FAILED`).
- Échec de chargement forçant la reprise d'une partie volontairement mise en pause.
- Menu de pause clignotant pendant chaque `fetch` de monde, y compris au tout premier lancement.
- `_lastLandedEventBody` non purgé au reset : pas de ré-émission de `ROCKET.LANDED` au respawn
  sur le même corps (ravitaillement / vérification de mission manqués).
- `landedOn` renseigné après un simple rebond et laissé tel quel en plein vol.
- `orbitSuccessCounter` incrémenté 2 à 3× par pas (durée de stabilité divisée d'autant).
- Rotation gauche/droite inversée dans le diagnostic d'évaluation de `train.js`.
- Curseur « Fréquence de mise à jour » de l'interface d'entraînement sans aucun effet.
- Fuite de 2 modèles TF.js par clic sur Sauvegarder/Charger hors session (et chargement sans effet).
- `TrainingVisualizer.setFollowRocket(false)` réactivait le suivi.
- Scintillement des étoiles ~1000× trop lent (coefficient par milliseconde appliqué à des secondes).
- `UniverseView.updateTrace` passait des coordonnées écran à `TraceView` qui attend du monde.

### 2e balayage : revue de régression des correctifs + zones non couvertes

Trois régressions introduites par les correctifs ci-dessus ont été détectées et corrigées avant
publication, ainsi que 8 bugs des sous-systèmes non balayés en 1re passe.

- **Régression — les flèches de mission suivaient une mission déjà accomplie.** Le passage de la
  liste complète des missions au rendu n'avait pas été répercuté sur le bloc qui construit les
  vecteurs Orig/Dest (`RenderingController`), lequel ne filtrait pas par statut. Filtre ajouté.
- **Régression — la touche R effaçait la progression.** `resetMissions()` reconstruit **toutes**
  les missions en « pending », y compris celles déjà accomplies. Remplacé par
  `MissionManager.reactivateFailedMissions()`, qui ne réarme que les missions échouées.
- **Régression — propulseur bloqué en marche après débranchement de la manette.** Le comptage de
  sources introduit pour les touches aliasées voyait indéfiniment l'entrée gamepad orpheline
  laissée par `disconnectGamepad()`. Celui-ci relâche désormais toutes les actions actives.
- **Fusée posée dérivant le long de la surface** (`RocketModel.updateAbsolutePosition`) : le point
  d'attache était recalculé avec `currentOrbitAngle`, comme si les corps étaient en rotation
  synchrone. Or aucun corps ne tourne sur lui-même (ni au rendu, ni pour les stations, posées à un
  angle monde fixe) : une fusée amarrée quittait la tolérance d'amarrage lunaire en ~52 s et
  faisait le tour de Phobos en ~8 s. L'angle monde figé à l'atterrissage est désormais utilisé.
  Vérifié headless : dérive nulle, suivi du corps en orbite préservé.
- **Missions du monde précédent conservées au changement d'univers** : `loadFromData` n'était
  appelé que si le monde déclarait une clé `missions` (seul le monde 1 en a une). Les missions
  survivaient donc au changement, impossibles à accomplir, et étaient réinjectées au reset.
- **Luminosité `NaN` pour toutes les étoiles issues des presets** : `twinkleSpeed` n'était pas
  généré, et `UniverseModel.updateStars` calculait `Math.sin(t × undefined)` à chaque frame.
- **HUD « Missions réussies ! » affiché aussi quand toutes les missions avaient échoué.**
- **Écran vide pendant le chargement d'un monde** : la suppression du menu de pause ne laissait
  aucun retour visuel. L'écran de chargement est affiché à la place — avec masquage garanti à
  l'entrée en jeu (le chemin `PAUSED → PLAYING` ne passe pas par `_onExitState(LOADING)`).
- **Physique désynchronisée de l'état** après un échec de chargement avec pause utilisateur
  (`changeState` court-circuite `PAUSED → PAUSED`, la simulation restait relancée).
- **Rotation gamepad écrivant dans le modèle pendant la pause** : `handleRotateCommand` était le
  seul chemin de contrôle à ne pas demander `RESUME_IF_PAUSED`.
- **Vitesse de spawn en mode absolu ~16,7× trop lente** : conversion `× MATTER_BASE_DELTA`
  manquante (mode `position/velocity` des presets), aux deux emplacements concernés.
- **`landedOn` restauré sur le mauvais critère** après un rebond survécu (test sur `isLanded` au
  lieu du corps heurté).
- **`main.js` — tableau `missions` codé en dur supprimé** : jamais lu, et de schéma incompatible
  avec `MissionManager` (`origin/destination/itemName` vs `from/to/requiredCargo`).

### Connu, non corrigé (hors périmètre « bug »)
- **5 mondes sur 6 n'ont aucune mission** (`2_kerbol`, `3_outerwilds`, `4_Tatoo`, `5_Endor`,
  `6_alien`) : missions, cargo et crédits sont donc inertes hors du monde 1. C'est du **contenu**
  à écrire, pas un défaut de code.
- **`STATION_DOCKED` / `STATION_REFUELED` n'ont aucun abonné** : le ravitaillement est totalement
  silencieux (ni son, ni message). De plus il ne se déclenche que sur le front d'atterrissage :
  une fusée déjà posée qui consomme du carburant ne se ravitaille pas.
- **`universeModel.narratives`** est renseigné depuis les presets mais jamais lu par aucune vue.
- **`physics.timeStepMs`** présent dans les 6 presets n'est lu nulle part (champ de schéma mort).

---

## [Non publié] — Pipeline d'entraînement IA (fondations PNJ/adversaires) — 2026‑07‑03

Objectif : entraîner des pilotes IA fiables et **réutilisables** comme futurs PNJ/adversaires. Phases 1
à 3 (qualité d'entraînement + rôles) livrées. Voir [CLAUDE.md](CLAUDE.md) §AI et [PHYSICS.md §1.5](PHYSICS.md).

### Phase 3 — rôles de PNJ (course, interception, atterrisseur, orbiteur)

- **Registre de rôles** (`AI_TRAINING.ROLES`) : `race`, `intercept`, `lander`, `orbiter`. Un rôle est
  une variation d'un objectif de base (navigate/land/orbit) + des paramètres de mission. C'est le
  catalogue des pilotes entraînables et livrables (`assets/models/`).
- **Cibles mobiles** (`HeadlessRocketEnvironment`) : le rôle `intercept` fait bouger la cible
  (patterns `linear` / `circular`). L'observation expose désormais `targetX/Y/VX/VY` et le vecteur
  d'état **active enfin les dims 10-11** (vitesse propre de la cible, réservées en phase 1). Succès
  `proximity` : rester à portée d'une cible mobile pendant K steps (≠ stabilisation à l'arrêt).
- **Bonus de course** : le rôle `race` ajoute une récompense terminale proportionnelle au budget de
  steps restant (finir plus tôt = plus de bonus) + pénalité par step accrue.
- **File de runs séquentiels** (`TrainingOrchestrator.runCurriculum`) : `config.trainingRuns`
  `[{ role, episodes, loadFrom?, saveAs }]` exécutés en séquence, avec **warm-start** optionnel
  (`loadFrom` charge un modèle du zoo avant d'entraîner → transfert, ex : `race` depuis `navigate`).
  Événements `AI.CURRICULUM_STAGE_STARTED/COMPLETED/COMPLETED`. Remplace l'ancienne limite « premier
  objectif seulement ».
- **UI** : dropdown « Rôle » dans `training-interface.html`.

- **Script de livraison** : `trainAndDeliver({ role, episodes })` (console, `train.js`) entraîne en
  headless puis exporte le modèle en 3 fichiers ; `deliverModel('<nom>')` exporte un modèle déjà
  entraîné. Dossier `assets/models/` + `README.md` (procédure de livraison) ajoutés.

> ⏳ Reste manuel : **exécuter** `trainAndDeliver()` dans le navigateur puis **committer** les fichiers
> dans `assets/models/<nom>/` (l'entraînement TF.js tourne dans le navigateur, pas en CI/Node).

### Phase 2 — qualité d'apprentissage

- **Double DQN** (`RocketAI.train`) : l'action du prochain état est choisie par le modèle **online**
  (argmax), sa valeur lue sur le modèle **target**. Découple sélection et évaluation → réduit la
  surestimation systématique du DQN standard. Une prédiction de plus par batch (négligeable).
- **IA = inférence pure en jeu (posture PNJ)** : suppression de `RocketAI.step()` (boucle d'apprentissage
  in-game) et de `RocketAI.calculateReward()` (récompense d'orbite codée en dur, **divergente** de celle
  de l'environnement). Il n'existe plus qu'**une seule définition de récompense**
  (`HeadlessRocketEnvironment`). En jeu, si un modèle a été **chargé**, la politique gloutonne du réseau
  pilote (`makeDecision` → `act`) ; sinon repli sur l'heuristique `maintainOrbit`.
- **Limites de simulation** (`HeadlessRocketEnvironment._isOutOfBounds`) : `SAFETY.MAX_SIMULATION_DISTANCE`
  enfin appliqué, **borné par objectif** (navigate : 3× distance initiale ; autres : 50000). Termine les
  épisodes « fugueurs » (statut `out_of_bounds`) avec pénalité au lieu de brûler tout le budget de steps.
- **Reproductibilité** (`controllers/SeededRandom.js`, nouveau — mulberry32) : `config.seed` rend
  déterministes l'angle initial (par épisode) et l'exploration epsilon. **Jeu d'évaluation fixe** (N angles
  dérivés du seed) → scores comparables entre runs et entre modèles. Champ « Seed » dans l'UI.
- **`compareModels(a, b)`** (`train.js`) : compare deux modèles du zoo sur le même jeu d'éval fixe
  (récompense / taux de succès / médiane steps→succès).

### Phase 1 — fondations (model zoo, état, métriques)

Objectif : entraîner des pilotes IA fiables et **réutilisables** comme futurs PNJ/adversaires. Voir
[CLAUDE.md](CLAUDE.md) §AI et [PHYSICS.md §1.5](PHYSICS.md).

### ⚠️ Rupture de compatibilité : modèles v1 obsolètes
- Le vecteur d'état passe de **10 à 12 dimensions** (`STATE_VERSION 2`). Les deux nouvelles dimensions
  (10‑11) encodent la **vitesse propre de la cible** (= 0 pour une cible fixe ; prépare les cibles
  mobiles type intercept/escorte **sans nouvelle rupture** future). Les modèles v1 (10 dims, stockés
  en `localStorage://rocket-ai-model`) sont **refusés au chargement** avec un avertissement console
  explicite. Aucun modèle pré‑entraîné n'était livré, le coût est nul.

### Model zoo — persistance nommée (`controllers/AIModelStore.js`, nouveau)
- Modèles **nommés par rôle/objectif**, stockés en **IndexedDB** (`indexeddb://pc-model-<nom>`) avec un
  registre de métadonnées en `localStorage` (objectif, `stateVersion`/`stateSize`, épisodes, meilleur
  score d'éval, taux de succès…). Fin du modèle unique éphémère.
- **Export/Import fichiers** (`downloads://` + `tf.io.browserFiles`) → un modèle entraîné peut être
  livré dans `assets/models/<nom>/` (`model.json` + `meta.json`), chargé au démarrage via
  `AIModelStore.load()` (chemin « joueur frais », base des PNJ).
- **Validation de compatibilité** au chargement (dimension d'entrée réseau + `stateVersion`) : un
  modèle incompatible est refusé proprement.
- `RocketAI.saveModel(name)` / `loadModel(name)` délèguent au zoo ; `TrainingOrchestrator` sauvegarde
  checkpoints et modèle final sous `config.modelName` (défaut `<objectif>-default`) avec métadonnées.

### Correction de la saturation d'état
- Les canaux de vitesse (dims 2/3/8) saturaient à ±2 (échelle 1000, clamp ±2 ≈ ±2000 u/s) alors que la
  **croisière cible est 2500 u/s** : le réseau ne « voyait » pas les hautes vitesses. Échelle portée à
  **2500** (croisière ≈ 1.0) et clamp à **±4** (couvre `VELOCITY_MAX` 10000 u/s). Échelles centralisées
  dans `AI_TRAINING.STATE` (`constants.js`), source unique consommée par `buildStateVector`.

### Conversion d'unités Matter→u/s centralisée
- Nouveau point unique `PhysicsVectors.matterToGameVelocity(v)` (= `v / MATTER_BASE_DELTA`), remplaçant
  la constante `1000/60` réécrite en dur dans `RocketAI` + 3 sites de `HeadlessRocketEnvironment` —
  footgun récurrent de parité entraînement/jeu. Voir [PHYSICS.md §1.5](PHYSICS.md).

### Métriques & UI d'entraînement
- `TrainingOrchestrator` expose **steps/s** (fenêtre 20 épisodes), **taux de succès récent** (fenêtre
  glissante 50 épisodes, plus lisible que le cumul global) et **médiane steps→succès** à l'évaluation.
- `training-interface.html` : champ **« Nom du modèle »**, **panneau Model Zoo** (liste, charger,
  exporter, importer, supprimer), affichage steps/s. Nouveaux événements `AI.MODEL_DELETED` /
  `AI.MODEL_EXPORTED`, payload `{name, metadata}` sur `AI.MODEL_SAVED`/`MODEL_LOADED`.

---

## [Non publié] — Corrections du décollage (corps mobiles) — 2026‑06‑04

### Chasse aux bugs — 2e passe (5 agents), correctifs « Tier 1 » (faible risque)
- **O1 — Les missions n'échouaient jamais à la destruction de la fusée.** La logique d'échec
  dépendait de `ROCKET.STATE_UPDATED`, un événement **jamais émis**. Désormais déclenchée
  directement dans `update()` à la transition `PLAYING → CRASH_ANIMATION` (appel idempotent à
  `handleRocketStateUpdated`). Abonnement mort retiré.
- **P2 — Décollage sous le seuil.** `ThrusterPhysics.applyThrusterForce` déclenchait `handleLiftoff`
  dès `thrustForce > 0`, court-circuitant le seuil `TAKEOFF_THRUST_THRESHOLD_PERCENT` (10 %) appliqué
  ailleurs : la fusée « sautait » à ~5 %. Le décollage est désormais gaté par le même seuil. Vérifié
  headless (5 % reste posé, 50 % décolle).
- **P1 — `isOnMobileBody` toujours vrai** (`PhysicsController`) : le test `typeof updateOrbit ===
  'function'` (méthode de prototype, toujours présente) ne distinguait jamais un corps statique.
  Remplacé par `parentBody != null` (cohérent avec `SynchronizationManager`). Non-régression du suivi
  d'épave vérifiée headless.
- **D1 — Vélocité de respawn non convertie.** `resetRocket` posait la vélocité héritée sans
  `× MATTER_BASE_DELTA` (≠ `buildWorldFromData`) → glitch d'~1 frame au respawn sur astres mobiles
  (mondes 3/5/6). Conversion ajoutée.
- **O2 — Course au reload.** Une touche pressée pendant le `fetch` async d'un monde pouvait
  relancer l'**ancien** monde (`RESUME_IF_PAUSED`). Garde ajoutée sur `_universeLoadInFlight`.
- **O3 — Ré-atterrissage manqué après reload.** `_lastLandedEventBody` (état rémanent de
  `SynchronizationManager`) n'était pas réinitialisé : après un reload où la fusée respawn posée sur
  le **même** corps, `ROCKET.LANDED` n'était pas ré-émis (ravitaillement / mission « déjà posé »
  manqués). Reset ajouté sur `UNIVERSE.STATE_UPDATED`.
- **R1 — Frame cassée par une station mal formée.** Le rendu des stations lisait `host.position.x`
  sans garde → `TypeError` interrompant **toute** la frame (avant fusée+UI). Gardes ajoutées sur
  `host.position` et `host.radius`.
- **A1 — Tracé d'entraînement corrompu.** `TrainingOrchestrator` émettait `TRAINING_STEP` avec
  `rocketModel.x/.vx/.isCrashed` (inexistants → `undefined`/NaN). Corrigé en `position/velocity`/
  `isDestroyed`. N'affectait que la visualisation (l'état réseau était déjà correct).

### IA / entraînement — RACINE corrigée (apprentissage enfin actif) + calibration vitesse
- **🎯 BUG RACINE : `updateTargetModel()` détruisait les poids du modèle.** L'« optimisation
  memory leak » faisait `this.model.getWeights().forEach(w => w.dispose())` — or `getWeights()`
  renvoie les **tenseurs vivants des variables** (pas des copies). Résultat : dès `initModel`, le
  noyau `dense_Dense1/kernel` était disposé, et **`model.fit()` levait `LayersVariable … is already
  disposed` à CHAQUE appel** → `successfulTrainings` restait à 0, perte plate, aucun apprentissage.
  L'epsilon initial à 1.0 (actions aléatoires) masquait le défaut : la fusée bougeait sans jamais
  utiliser le réseau. **Correctif : `targetModel.setWeights(model.getWeights())` sans aucun dispose.**
- **Diagnostic instrumenté** (qui a permis de remonter à la racine) : `train()` instrumenté sur
  toutes ses sorties (`guard`/`buffer`/`inprogress`/`fit-start`/`ok` + 5 `return`), `catch`
  dé-filtré, et traces côté `TrainingOrchestrator` (taille du buffer, `isTraining`, site d'appel).
  `testUpdateFrequency()` rendu fiable (attend `waitForReady`, rapporte les updates réelles).
- **Calibration vitesse par cohérence d'unités** (cibles documentées en u/s mais comparées à une
  vitesse en échelle Matter, ×16,67) :
  - État (`RocketAI.buildStateVector`) : `vx/vy` ramenés en **u/s** (÷ `MATTER_BASE_DELTA`) → fin de la
    **saturation** (croisière ~382 u/s : feature 2,000 saturé → **0,382** informatif, vérifié en node).
  - Récompenses navigate (`calculateVelocityReward`, stabilisation, `checkNavigateSuccess`) : vitesse
    mesurée en **u/s** via `_rocketSpeedUnitsPerSec()` → cibles `VELOCITY_TARGET/MAX` et seuil de succès
    enfin cohérents (avant, la vitesse de croisière requise était **pénalisée**).
  - Stabilisation : poids dédié `STABILIZE_REWARD_WEIGHT` (au lieu de réutiliser `DISTANCE_DELTA=100`).
  > ⚠️ Valeurs absolues à **valider par un entraînement réel** une fois l'apprentissage rétabli.
- **Interface d'entraînement — bascule de vue + nettoyage.** Le bouton « 🌌 Vue absolue » devient une
  **bascule** vue vaisseau (suivi) ↔ vue absolue (centrée A↔B) via `TrainingVisualizer.toggleView()`
  (avant : impossible de revenir au suivi de la fusée). Les traces de diagnostic verbeuses
  (`[RocketAI.train]`, `[Orchestrator]`) sont désormais **silencieuses par défaut**, activables via
  `window.DEBUG_AI = true` ; les vraies erreurs de `model.fit` restent toujours remontées. Le replay
  buffer (poussé directement par l'orchestrateur) est **borné** à `replayBufferSize` (avant : croissance
  illimitée, ~270 000 entrées observées → fuite mémoire).
- **Vitesse d'entraînement.** Le mode « Sans rendu (rapide) » est désormais réellement rapide (plus
  d'émission d'événements de rendu par step, cession au navigateur 10× plus rare). En mode visuel, un
  **curseur de vitesse ⏩ ×1→×20** règle la cadence de rendu (1 rendu tous les `10 × vitesse` steps)
  pour observer en avance rapide ; modifiable **en direct** pendant l'entraînement.
- **Temps de vol A→B réduit ~5×.** Budget d'épisode navigate `20000 → 4000` steps (~66 s) + cibles de
  vitesse mises à l'échelle ×5 (`VELOCITY_TARGET 500 → 2500` u/s, `MAX 2000 → 10000`, `SIGMA 200 → 1000`,
  `MIN 50 → 250`) pour que la fusée croise assez vite et atteigne B dans le budget réduit.
  ⚠️ À valider par un entraînement (freinage/stabilisation plus serrés).

### Corrigé
- **Décollage propre depuis un corps en orbite** (`ThrusterPhysics.handleLiftoff`) — `35352c8`.
  La vélocité orbitale héritée passe de `× deltaTime` (~0,0167, soit ~1000× trop petit) à
  `× (1000/60)` (`MATTER_BASE_DELTA`). Cause : le jeu passe `deltaTime` en **secondes** à
  `Engine.update` alors que Matter suppose des **ms** (`_baseDelta = 1000/60`). Vérifié en headless
  (vrai Matter.js) : dérive tangentielle au décollage **−6,64° → −2,65°** (niveau d'un corps fixe).
  No‑op pour les corps immobiles → aucune régression ; améliore aussi le décollage des lunes en orbite.
- **Catapulte tangentielle au décollage** (`PhysicsController.update`, étape 1) — `0851b0b`.
  La vélocité Matter des corps mobiles est convertie en par‑pas (`× lastDeltaTime`) ; complète le
  fix d'unités `96b471b` qui avait oublié cette ligne.
- **Cohérence des unités de vélocité (secondes↔ms).** Détection atterrissage/crash
  (`CollisionHandler.getCelestialBodyVelocity`), stabilisation posé/débris (`SynchronizationManager`),
  vélocité de collision des corps mobiles (`PhysicsController` étape 1) et vélocité de spawn
  (`GameSetupController`) passent toutes de `× deltaTime` (~1000× trop petit) à `× MATTER_BASE_DELTA`
  (`= 1000/60`), désormais **centralisée** dans `constants.js`. Vérifié en headless : un atterrissage
  **co-mobile** sur un corps rapide (~960 u/s), auparavant classé à tort comme **crash**, est
  maintenant correctement détecté comme **atterrissage**, sans régression du décollage (dérive et
  catapulte inchangées). Achève l'intention du commit `0e9546e` (« vitesse relative au corps ») que
  le bug d'unités rendait inopérante.
- **Reload d'univers pendant un décollage** (`GameSetupController.buildWorldFromData`) : le
  `rocketModel` est désormais réinitialisé (`reset()`) avant d'appliquer le spawn. Sans cela, l'état
  en cours (propulseurs tenus, période de grâce, `relativePosition`/`attachedTo` périmés) "fuyait"
  dans le nouveau monde → redécollage immédiat du spawn / téléport. Vérifié en headless (avant :
  `power=1000`, redécolle ; après : `power=0`, reste posé).
- **Épave qui ne suivait pas une planète MOBILE après un crash.** Le crash via le chemin "impact"
  (`CollisionHandler` collisionStart, choc de côté/angle) posait `landedOn` mais **pas** `attachedTo`,
  or le suivi de l'épave (`SynchronizationManager` CAS débris) exigeait `attachedTo` → l'épave restait
  fixe pendant que la planète s'éloignait. Double correctif : (1) ce chemin pose désormais `attachedTo`
  (+ `relativePosition=null`) à la destruction ; (2) le CAS débris retombe sur `landedOn` si
  `attachedTo` est absent. Vérifié headless (corps mobile ~72 u/s : dérive de l'épave 72 u → **1,5 u**).

### Modifié
- **Rééquilibrage des masses du monde Outer Wilds** (`assets/worlds/3_outerwilds.json`) — `145e3bb`,
  `0851b0b`. Âtrebois `2e11 → 3e10` (à `2e11`, gravité 3,3× la poussée → décollage impossible).
  10 des 13 corps avaient un rapport poussée/gravité < 1 ; masses ré‑échelonnées pour viser ~1,5–3
  en préservant les écarts relatifs. *Grand Feu* (étoile) gardé lourd (ancre la gravité
  interplanétaire) ; *Trou blanc*/*L'Intrus* (exotiques) laissés tels quels. Orbites inchangées
  (cinématiques).

### Nettoyage / hygiène
- `globalThis.DEBUG` repassé à `false` ; les logs de décollage fréquents (`[LIFTOFF]`, `[DECOLLAGE]`)
  gatés derrière `if (globalThis.DEBUG)`.
- Constantes en dur centralisées dans `constants.js` : `MATTER_BASE_DELTA` (1000/60),
  `LANDING_PROXIMITY_THRESHOLD` (15), `CRASH_SINK_DEPTH` (40).
- Audit d'équilibrage des 6 mondes : **tous les corps de spawn sont décollables** (Tatooine corrigé :
  masse 3e11 → 1,4e11, ratio 0,85 → 1,82). Les corps à forte gravité non‑spawn sont laissés
  volontairement inaccessibles au vaisseau actuel (cibles de futurs vaisseaux plus puissants).

### Unification de la gravité (Option A)
- `PHYSICS.G` devient la **source unique** : `PhysicsController.initPhysics` et `GameSetupController`
  copient `PHYSICS.G` dans `MatterAttractors.Attractors.gravityConstant` ⇒ gravité réelle = viz = IA.
- `PHYSICS.G` et les `physics.G` des 6 presets passés de `0,0001` à **`0,001`** (la valeur réelle déjà
  en vigueur) → **gameplay inchangé** ; seules la visualisation du champ de gravité et l'IA (qui
  utilisaient 0,0001) deviennent correctes. Cibles `AI_TRAINING.ORBIT` recalculées ×√10 (calibrage
  absolu IA à valider par entraînement). Vérifié en headless : gravité réelle inchangée (0,001).

### Robustesse / nettoyage (chasse aux bugs — workflow de 5 agents)
- Code mort : abonnement à `ROCKET.CRASHED` (jamais émis) retiré de `RocketAI` — le crash passe par
  `ROCKET.DESTROYED` ; constante `PHYSICS.MAX_SPEED` (inutilisée) retirée (`MAX_COORDINATE` conservée,
  utilisée par `UniverseModel`).
- `GameController._universeLoadInFlight` désormais initialisé dans le constructeur (au lieu de
  reposer sur `undefined`).
- Abonnement `ROCKET.RESET` de `InputController` désormais tracké via `controllerContainer`.
- Gardes défensives : `CameraModel.screenToWorld` protège contre `zoom<=0` ; le rendu des stations
  protège contre un `angle` non fini (coordonnées NaN).
- IA : décroissance d'epsilon dédupliquée — gérée une seule fois par épisode par
  `TrainingOrchestrator` (retirée de `RocketAI.handleCrash`/`handleSuccess` où elle s'ajoutait,
  causant une décroissance ~2× trop rapide et ratant les épisodes en timeout).
- Faux positifs écartés après vérification (aucun changement) : « fuite » `newWeights.dispose()`
  (code correct, `setWeights` copie), overlap audio thruster, double `STATION.REFUELED`, fuites
  d'écouteurs au reload (vues/input créés une seule fois), `bestModelWeights` (déjà libéré).

---

## 2026‑06‑02 — Stabilisation décollage & atterrissage relatif

### Corrigé
- `6d9c88e` — Re‑collage de la fusée sur les corps mobiles au décollage : machine à états de la
  période de grâce (empêche `isLanded` d'être ré‑armé pendant la montée) + diagnostic
  `window.DEBUG_LIFTOFF`.
- `e3f4246` — Direction de l'impulsion de décollage : pousse vers l'extérieur (`angle - π/2`) et non
  vers le centre de la planète.
- `96b471b` — Incohérence d'unités : conversion de la vélocité des corps célestes (u/s → par‑pas
  Matter via `× deltaTime`) dans `handleLiftoff`, la stabilisation et `getCelestialBodyVelocity`.
- `0e9546e` — Détection atterrissage/crash basée sur la vitesse **relative** au corps céleste.

### Notes
- Correctifs IA/entraînement, particules et rendu groupés (`c97977c`, `0421d97`, série de bugfixes).

---

## Antérieur — par thème

> Résumé thématique des évolutions structurantes (avant la campagne décollage). Voir `git log` pour
> le détail commit par commit.

### Système d'univers & écran de démarrage
- Écran de démarrage avec sélection parmi 6 mondes (`1_solar`, `2_kerbol`, `3_outerwilds`, `4_Tatoo`,
  `5_Endor`, `6_alien`) et bouton « Prêt ! » ; émission de `UNIVERSE_LOAD_REQUESTED`.
- Chargement de monde par preset JSON (`GameSetupController.buildWorldFromData`) : corps, stations,
  étoiles, ceintures d'astéroïdes, récits, spawn fusée. Génération procédurale & rechargement
  d'univers modulaires.
- Nouveaux corps (Cérès, Pluton), ceintures d'astéroïdes, atmosphères (ombres, couches avant/arrière),
  anneaux planétaires.

### IA (Deep Q‑Network, TensorFlow.js)
- Agent `RocketAI`, `TrainingOrchestrator`, environnement headless `HeadlessRocketEnvironment`,
  visualiseur `TrainingVisualizer`. Objectifs : `navigate` (défaut), `orbit`, `land`, `crash`.
- Système de récompenses `navigate` (6 composantes) ; constantes `AI_TRAINING` ; nettoyages mémoire
  (tenseurs `tf.tidy`/`dispose`) ; repli backend CPU si WebGL échoue.

### Audio
- `AudioManager` : préchargement et lecture des SFX (propulseur, collision) et ambiances ; déverrouillage
  audio au premier clic/touche.

### Rendu
- Pipeline `RenderingController` : fond/étoiles, corps célestes (ombres jour/nuit, atmosphère, anneaux),
  stations, traces, particules, fusée, vecteurs/champ de gravité, HUD.

### Refactors & robustesse
- Découplage via `EventBus` ; `ControllerContainer.track` pour le nettoyage des abonnements (anti‑fuite
  au rechargement d'univers) ; centralisation de la consommation de carburant dans `RocketModel`.

---

## Conventions de mise à jour de ce fichier

- À chaque changement notable, ajouter une entrée sous **[Non publié]** (catégories : *Ajouté*,
  *Modifié*, *Corrigé*, *Supprimé*, *Connu/non corrigé*) avec le hash de commit court.
- Tout changement **physique** doit référencer la section concernée de [PHYSICS.md](PHYSICS.md) et
  idéalement être vérifié par le harnais headless (vrai Matter.js).
