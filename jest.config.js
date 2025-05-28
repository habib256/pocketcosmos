module.exports = {
  // Environnement de test (jsdom pour simuler le navigateur)
  testEnvironment: 'jsdom',
  
  // Configuration après setup
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  
  // Patterns de fichiers de test
  testMatch: [
    '<rootDir>/tests/**/*.test.js',
    '<rootDir>/tests/**/*.spec.js'
  ],
  
  // Collecte de couverture
  collectCoverageFrom: [
    'core/**/*.js',
    'models/**/*.js',
    'physics/**/*.js',
    'game/**/*.js',
    'input/**/*.js',
    'rendering/**/*.js',
    'ai/**/*.js',
    '!**/*.bundle.js',
    '!**/node_modules/**'
  ],
  
  // Seuils de couverture
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 75,
      lines: 80,
      statements: 80
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
  testTimeout: 10000,
  
  // Affichage verbeux
  verbose: true
}; 