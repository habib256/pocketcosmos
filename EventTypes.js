// EventTypes.js
// Fichier centralisant tous les types d'événements utilisés dans l'application
window.EVENTS = {
  INPUT: {
    KEYDOWN: 'INPUT_KEYDOWN',
    KEYUP: 'INPUT_KEYUP',
    KEYPRESS: 'INPUT_KEYPRESS',
    WHEEL: 'INPUT_WHEEL',
    MOUSEDOWN: 'INPUT_MOUSEDOWN',
    MOUSEMOVE: 'INPUT_MOUSEMOVE',
    MOUSEUP: 'INPUT_MOUSEUP',
    TOUCHSTART: 'INPUT_TOUCHSTART',
    TOUCHMOVE: 'INPUT_TOUCHMOVE',
    TOUCHEND: 'INPUT_TOUCHEND',
    GAMEPAD_CONNECTED: 'INPUT_GAMEPAD_CONNECTED',
    GAMEPAD_DISCONNECTED: 'INPUT_GAMEPAD_DISCONNECTED',
    JOYSTICK_AXIS_CHANGED: 'INPUT_JOYSTICK_AXIS_CHANGED',
    JOYSTICK_AXIS_HELD: 'INPUT_JOYSTICK_AXIS_HELD',
    JOYSTICK_AXIS_RELEASED: 'INPUT_JOYSTICK_AXIS_RELEASED',
    ROTATE_COMMAND: 'input:rotateCommand',
    ZOOM_COMMAND: 'input:zoomCommand',
    KEYMAP_CHANGED: 'INPUT_KEYMAP_CHANGED',
    KEYMAP_RESET: 'INPUT_KEYMAP_RESET'
  },
  PHYSICS: {
    UPDATED: 'PHYSICS_UPDATED',
    COLLISION: 'PHYSICS_COLLISION',
    TOGGLE_FORCES: 'PHYSICS_TOGGLE_FORCES'
  },
  RENDER: {
    UPDATE: 'RENDER_UPDATE',
    TOGGLE_VECTORS: 'RENDER_TOGGLE_VECTORS',
    TOGGLE_GRAVITY_FIELD: 'RENDER_TOGGLE_GRAVITY_FIELD',
    TOGGLE_TRACES: 'RENDER_TOGGLE_TRACES'
  },
  SIMULATION: {
    UPDATED: 'SIMULATION_UPDATED'
  },
  UI: {
    UPDATE: 'UI_UPDATE',
    CREDITS_UPDATED: 'UI_UPDATE_CREDITS',
    TOGGLE_ASSISTED_CONTROLS: 'UI_TOGGLE_ASSISTED_CONTROLS',
    ASSISTED_CONTROLS_STATE_CHANGED: 'UI_ASSISTED_CONTROLS_STATE_CHANGED',
    SHOW_LOADING_SCREEN: 'UI_SHOW_LOADING_SCREEN',
    SHOW_MAIN_MENU: 'UI_SHOW_MAIN_MENU',
    HIDE_MAIN_MENU: 'UI_HIDE_MAIN_MENU',
    SHOW_PAUSE_MENU: 'UI_SHOW_PAUSE_MENU',
    HIDE_PAUSE_MENU: 'UI_HIDE_PAUSE_MENU',
    SHOW_GAME_OVER_SCREEN: 'UI_SHOW_GAME_OVER_SCREEN',
    HIDE_GAME_OVER_SCREEN: 'UI_HIDE_GAME_OVER_SCREEN'
  },
  ROCKET: {
    STATE_UPDATED: 'ROCKET_STATE_UPDATED',
    LANDED: 'ROCKET_LANDED',
    CRASHED: 'ROCKET_CRASHED',
    DESTROYED: 'ROCKET_DESTROYED',
    THRUST_FORWARD_START: 'ROCKET_THRUST_FORWARD_START',
    THRUST_FORWARD_STOP: 'ROCKET_THRUST_FORWARD_STOP',
    THRUST_BACKWARD_START: 'ROCKET_THRUST_BACKWARD_START',
    THRUST_BACKWARD_STOP: 'ROCKET_THRUST_BACKWARD_STOP',
    ROTATE_LEFT_START: 'ROCKET_ROTATE_LEFT_START',
    ROTATE_LEFT_STOP: 'ROCKET_ROTATE_LEFT_STOP',
    ROTATE_RIGHT_START: 'ROCKET_ROTATE_RIGHT_START',
    ROTATE_RIGHT_STOP: 'ROCKET_ROTATE_RIGHT_STOP',
    SET_THRUSTER_POWER: 'rocket:setThrusterPower',
    RESET: 'ROCKET_RESET',
    INCREASE_THRUST_MULTIPLIER: 'ROCKET_INCREASE_THRUST_MULTIPLIER',
    DECREASE_THRUST_MULTIPLIER: 'ROCKET_DECREASE_THRUST_MULTIPLIER'
  },
  CAMERA: {
    ZOOM_IN: 'CAMERA_ZOOM_IN',
    ZOOM_OUT: 'CAMERA_ZOOM_OUT',
    CAMERA_ZOOM_ADJUST: 'camera:zoomAdjust',
    CENTER_ON_ROCKET: 'CAMERA_CENTER_ON_ROCKET',
    START_DRAG: 'CAMERA_START_DRAG',
    DRAG: 'CAMERA_DRAG',
    STOP_DRAG: 'CAMERA_STOP_DRAG'
  },
  GAME: {
    TOGGLE_PAUSE: 'GAME_TOGGLE_PAUSE',
    RESUME_IF_PAUSED: 'GAME_RESUME_IF_PAUSED',
    GAME_PAUSED: 'GAME_PAUSED',
    GAME_RESUMED: 'GAME_RESUMED',
    GAME_STARTED: 'GAME_STARTED',
    STATE_CHANGED: 'GAME_STATE_CHANGED'
  },
  UNIVERSE: {
    STATE_UPDATED: 'UNIVERSE_STATE_UPDATED'
  },
  PARTICLE_SYSTEM: {
    UPDATED: 'PARTICLE_SYSTEM_UPDATED'
  },
  SYSTEM: {
    CONTROLLERS_SETUP: 'CONTROLLERS_SETUP',
    CANVAS_RESIZED: 'system:canvasResized'
  },
  MISSION: {
    FAILED: 'MISSION_FAILED',
    COMPLETED: 'MISSION_COMPLETED'
  },
  AI: {
    TOGGLE_CONTROL: 'AI_TOGGLE_CONTROL',
    TOGGLE_TRAINING: 'AI_TOGGLE_TRAINING',
    CONTROL_CHANGED: 'AI_CONTROL_CHANGED',
    TRAINING_CHANGED: 'AI_TRAINING_CHANGED',
    CONTROL_ACTION: 'AI_CONTROL_ACTION',
    
    // Événements d'entraînement
    START_TRAINING: 'AI_START_TRAINING',
    STOP_TRAINING: 'AI_STOP_TRAINING',
    PAUSE_TRAINING: 'AI_PAUSE_TRAINING',
    RESUME_TRAINING: 'AI_RESUME_TRAINING',
    TRAINING_STARTED: 'AI_TRAINING_STARTED',
    TRAINING_STOPPED: 'AI_TRAINING_STOPPED',
    TRAINING_PAUSED: 'AI_TRAINING_PAUSED',
    TRAINING_RESUMED: 'AI_TRAINING_RESUMED',
    TRAINING_COMPLETED: 'AI_TRAINING_COMPLETED',
    TRAINING_ERROR: 'AI_TRAINING_ERROR',
    TRAINING_PROGRESS: 'AI_TRAINING_PROGRESS',
    UPDATE_CONFIG: 'AI_UPDATE_CONFIG',
    
    // Événements d'évaluation
    EVALUATION_STARTED: 'AI_EVALUATION_STARTED',
    EVALUATION_COMPLETED: 'AI_EVALUATION_COMPLETED',
    MODEL_SAVED: 'AI_MODEL_SAVED',
    MODEL_LOADED: 'AI_MODEL_LOADED',
    
    // Événements de visualisation
    TRAINING_STEP: 'AI_TRAINING_STEP',
    EPISODE_STARTED: 'AI_EPISODE_STARTED',
    EPISODE_ENDED: 'AI_EPISODE_ENDED'
  },
  PARTICLES: {
    CREATE_EXPLOSION: 'particles:createExplosion',
    EXPLOSION_COMPLETED: 'particles:explosionCompleted'
  }
}; 