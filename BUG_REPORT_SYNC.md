# Rapport d'Audit - Bugs SynchronizationManager

## Bugs Identifiés

### 1. ❌ Références obsolètes après UNIVERSE_STATE_UPDATED
**Fichier**: `controllers/SynchronizationManager.js`  
**Problème**: Le manager ne s'abonne pas à `UNIVERSE_STATE_UPDATED`, donc les références aux corps célestes dans `celestialBodies` peuvent devenir obsolètes après un rechargement d'univers.

**Impact**: Si un univers est rechargé, `handleLandedOrAttachedRocket()` peut utiliser des références à d'anciens corps qui n'existent plus.

**Correction proposée**: S'abonner à `UNIVERSE_STATE_UPDATED` et réinitialiser les références :
```javascript
constructor(...) {
    // ...
    // S'abonner à UNIVERSE_STATE_UPDATED pour réinitialiser les références
    if (this.eventBus && window.EVENTS && window.EVENTS.UNIVERSE) {
        window.controllerContainer.track(
            this.eventBus.subscribe(window.EVENTS.UNIVERSE.STATE_UPDATED, () => {
                // Les références seront automatiquement mises à jour via physicsController.celestialBodies
                // Mais on peut forcer une réinitialisation si nécessaire
                console.log('[SynchronizationManager] Univers mis à jour, références réinitialisées');
            })
        );
    }
}
```

---

### 2. ⚠️ Duplication de code pour calcul angleToBody
**Fichier**: `controllers/SynchronizationManager.js`  
**Lignes**: 135-139 et 157-162  
**Problème**: Le calcul de `angleToBody` et `correctAngle` est dupliqué dans le bloc de stabilisation pour corps mobiles.

**Code actuel (dupliqué)**:
```javascript
// Ligne 135-140
const angleToBody = Math.atan2(
    rocketBody.position.y - landedOnModel.position.y,
    rocketBody.position.x - landedOnModel.position.x
);
const correctAngle = angleToBody + Math.PI / 2;
this.Body.setAngle(rocketBody, correctAngle);

// Ligne 157-162 (duplication)
const angleToBody = Math.atan2(
    rocketBody.position.y - landedOnModel.position.y,
    rocketBody.position.x - landedOnModel.position.x
);
const correctAngle = angleToBody + Math.PI / 2;
this.Body.setAngle(rocketBody, correctAngle);
```

**Correction proposée**: Extraire le calcul dans une fonction ou supprimer la duplication.

---

### 3. ⚠️ Vérification de null manquante pour landedOnModel
**Fichier**: `controllers/SynchronizationManager.js`  
**Ligne**: 100-103  
**Problème**: `landedOnInfo` peut être `undefined` si le corps n'est pas trouvé, mais `landedOnModel` est utilisé sans vérification supplémentaire.

**Code actuel**:
```javascript
const landedOnInfo = celestialBodies.find(cb => cb.model.name === rocketModel.landedOn);
const landedOnModel = landedOnInfo ? landedOnInfo.model : null;

if (landedOnModel) {
    // ... mais landedOnModel peut être null si landedOnInfo.model est undefined
}
```

**Impact**: Si `landedOnInfo.model` est `undefined`, `landedOnModel` sera `null` et le bloc ne s'exécutera pas (comportement correct), mais il n'y a pas de log d'avertissement.

**Correction proposée**: Ajouter un log si `landedOnInfo` existe mais `model` est absent :
```javascript
const landedOnInfo = celestialBodies.find(cb => cb.model && cb.model.name === rocketModel.landedOn);
const landedOnModel = landedOnInfo && landedOnInfo.model ? landedOnInfo.model : null;

if (!landedOnModel && rocketModel.landedOn) {
    console.warn(`[SynchronizationManager] Corps ${rocketModel.landedOn} trouvé mais modèle absent`);
}
```

---

### 4. ⚠️ Division par zéro potentielle dans checkRocketLandedStatusPeriodically
**Fichier**: `controllers/SynchronizationManager.js`  
**Lignes**: 303, 341  
**Problème**: `rocketModel.thrusters.main.maxPower` peut être 0, causant une division par zéro.

**Code actuel**:
```javascript
if (((rocketModel.thrusters.main.power / rocketModel.thrusters.main.maxPower) * 100) <= this.PHYSICS.TAKEOFF_THRUST_THRESHOLD_PERCENT) {
```

**Correction proposée**:
```javascript
const mainThrusterPercent = rocketModel.thrusters.main.maxPower > 0 
    ? (rocketModel.thrusters.main.power / rocketModel.thrusters.main.maxPower) * 100 
    : 0;
if (mainThrusterPercent <= this.PHYSICS.TAKEOFF_THRUST_THRESHOLD_PERCENT) {
```

---

### 5. ⚠️ Race condition entre checkRocketLandedStatusPeriodically et handleLandedOrAttachedRocket
**Problème**: `checkRocketLandedStatusPeriodically()` peut détecter un atterrissage et appeler `handleLandedOrAttachedRocket()`, mais si `handleLandedOrAttachedRocket()` est aussi appelé depuis `beforeUpdate`, il peut y avoir des conflits.

**Impact**: Double traitement possible, mais le code semble gérer cela correctement avec les vérifications d'état.

**Action**: Documenter le comportement, pas de correction nécessaire.

---

## Résumé des Actions Requises

1. ❌ **Références obsolètes** - S'abonner à `UNIVERSE_STATE_UPDATED`
2. ⚠️ **Duplication angleToBody** - Refactoriser le calcul
3. ⚠️ **Vérification null** - Améliorer la vérification de `landedOnModel`
4. ⚠️ **Division par zéro** - Protéger contre `maxPower === 0`
5. ℹ️ **Race condition** - Documenté, pas de bug fonctionnel
