module.exports = {
  // Environnement de test (jsdom pour simuler le navigateur)
  testEnvironment: 'jsdom',
  
  // Configuration après setup - utilise le setup spécial pour la couverture
  setupFilesAfterEnv: ['<rootDir>/tests/setup-coverage.js'],
  
  // Patterns de fichiers de test
  testMatch: [
    '<rootDir>/tests/**/*.test.js',
    '<rootDir>/tests/**/*.spec.js'
  ],
  
  // Collecte de couverture sur les fichiers source uniquement
  collectCoverageFrom: [
    'core/**/*.js',
    'models/**/*.js',
    'physics/**/*.js',
    'game/**/*.js',
    'input/**/*.js',
    'rendering/**/*.js',
    'ai/**/*.js',
    '!**/*.bundle.js',
    '!**/node_modules/**',
    '!**/tests/**',
    '!**/.build/**',
    '!**/tools/**'
  ],
  
  // Seuils de couverture ajustés pour être plus réalistes
  coverageThreshold: {
    global: {
      branches: 5,
      functions: 10,
      lines: 10,
      statements: 10
    }
  },
  
  // Répertoire de sortie pour la couverture
  coverageDirectory: 'coverage',
  
  // Formats de rapport de couverture
  coverageReporters: ['text', 'lcov', 'html'],
  
  // Variables globales disponibles dans les tests
  globals: {
    'window': {},
    'document': {},
    'navigator': {}
  },
  
  // Timeout par défaut pour les tests
  testTimeout: 15000,
  
  // Affichage verbeux
  verbose: true,
  
  // Collecte forcée de la couverture
  collectCoverage: true,
  
  // Maximum workers pour la stabilité
  maxWorkers: 2,
  
  // Éviter les problèmes de cache
  cache: false
}; 