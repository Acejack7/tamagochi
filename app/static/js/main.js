/* global Phaser */

const GAME_WIDTH = 800;
const GAME_HEIGHT = 600;

const config = {
	type: Phaser.AUTO,
	parent: 'game-container',
	width: GAME_WIDTH,
	height: GAME_HEIGHT,
	backgroundColor: '#ffffff', // white
	scene: { preload, create, update }
};

let pet;
let petType = 'hedgehog'; // default, will be updated from server
let gameScene;
let currentPetState = 'idle';
let maturityStage = 'adult';
let foodDisplaySprite = null; // For showing food images
let foodDisplayTimer = null; // For timing food display

// Sleep state management
let sleepTimer = null;
let sleepEndTime = null;
let isSleeping = false;
window.isSleeping = isSleeping;
let autoUpdateTimer = null;


// Pet sprite mappings
const PET_SPRITES = {
	hedgehog: {
		idle: 'hedgehog_idle',
		happy: 'hedgehog_happy',
		hungry: 'hedgehog_hungry',
		sleeping: 'hedgehog_sleeping'
	},
	hamster: {
		idle: 'hamster_idle',
		happy: 'hamster_happy',
		hungry: 'hamster_hungry',
		sleeping: 'hamster_sleeping'
	},
	squirrel: {
		idle: 'squirrel_idle',
		happy: 'squirrel_happy',
		hungry: 'squirrel_hungry',
		sleeping: 'squirrel_sleeping',
		sad: 'squirrel_sad',
		dirty: 'squirrel_dirty',
		bored: 'squirrel_bored'
	}
};

// Pet colors based on type (fallback for missing sprites)
const PET_COLORS = {
	hedgehog: 0x8b4513, // brown
	hamster: 0xdaa520,  // golden
	squirrel: 0xa0522d  // sienna
};

// Global inventory state
let currentInventory = {
	tree_seed: 0,
	blueberries: 0,
	mushroom: 0,
	acorn: 0
};

// Menu Manager Class - Consolidates all menu logic
class MenuManager {
	constructor() {
		this.menus = {
			feed: {
				id: 'food-menu',
				cancelId: 'cancel-food',
				buttonClass: '.food-btn',
				dataAttr: 'food'
			},
			sleep: {
				id: 'sleep-menu',
				cancelId: 'cancel-sleep',
				buttonClass: '.sleep-btn',
				dataAttr: 'sleep'
			},
			wash: {
				id: 'wash-menu',
				cancelId: 'cancel-wash',
				buttonClass: '.wash-btn',
				dataAttr: 'wash'
			},
			play: {
				id: 'play-menu',
				cancelId: 'cancel-play',
				buttonClass: '.play-btn',
				dataAttr: 'play'
			}
		};
		this.activeMenu = null;
	}

	showMenu(menuType) {
		// Prevent showing feed menu while feeding
		if (menuType === 'feed' && isFeeding) {
			console.log('🍽️ Cannot show feed menu while pet is eating');
			return;
		}
		
		// Prevent showing play menu while playing
		if (menuType === 'play' && isPlaying) {
			console.log('🎮 Cannot show play menu while pet is playing');
			return;
		}
		
		// Prevent showing wash menu while washing
		if (menuType === 'wash' && isWashing) {
			console.log('🚿 Cannot show wash menu while pet is washing');
			return;
		}
		
		// Hide all other menus first
		this.hideAllMenus();
		
		const menuConfig = this.menus[menuType];
		if (!menuConfig) return;

		const menuElement = document.getElementById(menuConfig.id);
		if (menuElement) {
			// Update button states if needed
			if (menuType === 'feed') {
				updateFoodButtonStates();
			} else if (menuType === 'play') {
				updatePlayButtonStates();
			}
			
			menuElement.style.display = 'block';
			this.activeMenu = menuType;
		}
	}

	hideMenu(menuType) {
		const menuConfig = this.menus[menuType];
		if (!menuConfig) return;

		const menuElement = document.getElementById(menuConfig.id);
		if (menuElement) {
			menuElement.style.display = 'none';
			if (this.activeMenu === menuType) {
				this.activeMenu = null;
			}
		}
	}

	hideAllMenus() {
		Object.keys(this.menus).forEach(menuType => {
			this.hideMenu(menuType);
		});
		this.activeMenu = null;
	}

	setupMenuButtons() {
		Object.entries(this.menus).forEach(([menuType, config]) => {
			// Setup menu item buttons
			const menuButtons = document.querySelectorAll(config.buttonClass);
			menuButtons.forEach(button => {
				button.addEventListener('click', () => {
					const actionData = button.dataset[config.dataAttr];
					// Use unified action handler
					handleUnifiedAction(menuType, actionData);
				});
			});

			// Setup cancel button
			const cancelButton = document.getElementById(config.cancelId);
			if (cancelButton) {
				cancelButton.addEventListener('click', () => {
					this.hideMenu(menuType);
				});
			}
		});
	}

	isMenuOpen() {
		return this.activeMenu !== null;
	}

	getActiveMenu() {
		return this.activeMenu;
	}

	updateMaturityLabels(maturity) {
		if (!maturity) return;
		const stageEl = document.getElementById('maturity-stage');
		const nextEl = document.getElementById('maturity-next');
		if (stageEl) stageEl.textContent = `Stage: ${maturity.stage}`;
		if (nextEl) {
			nextEl.textContent = maturity.next_change_time ? `Next: ${new Date(maturity.next_change_time).toLocaleString()}` : 'Next: --';
		}
	}
}

// Initialize menu manager
const menuManager = new MenuManager();


// Animation Manager - Unified system for all overlay animations
class AnimationManager {
	constructor() {
		this.animations = {
			feed: {
				emoji: '🍽️',
				overlayId: 'feed-overlay',
				titleId: 'feed-title',
				progressFillId: 'feed-progress-fill',
				progressTextId: 'feed-progress-text',
				timerId: 'feed-timer',
				duration: 5000,
				menuType: 'feed',
				stateVar: 'isFeeding',
				endTimeVar: 'feedEndTime',
				timerVar: 'feedTimer'
			},
			play: {
				emoji: '🎮',
				overlayId: 'play-overlay',
				titleId: 'play-title',
				progressFillId: 'play-progress-fill',
				progressTextId: 'play-progress-text',
				timerId: 'play-timer',
				duration: 10000,
				menuType: 'play',
				stateVar: 'isPlaying',
				endTimeVar: 'playEndTime',
				timerVar: 'playTimer'
			},
			wash: {
				emoji: '🚿',
				overlayId: 'wash-overlay',
				titleId: 'wash-title',
				progressFillId: 'wash-progress-fill',
				progressTextId: 'wash-progress-text',
				timerId: 'wash-timer',
				duration: 5000, // Default, will be overridden based on type
				menuType: 'wash',
				stateVar: 'isWashing',
				endTimeVar: 'washEndTime',
				timerVar: 'washTimer'
			}
		};
	}

	showOverlay(animationType, subType, endTime, startTime = null) {
		const config = this.animations[animationType];
		if (!config) {
			console.error(`Unknown animation type: ${animationType}`);
			return;
		}

		// Get dynamic emoji for play animations
		const displayEmoji = animationType === 'play' ? this.getPlayEmoji(subType) : config.emoji;

		console.log(`${displayEmoji} SHOWING ${animationType.toUpperCase()} OVERLAY: ${subType} until ${endTime}`);
		console.log(`🕐 Current time: ${new Date()}`);
		console.log(`📍 Called from:`, new Error().stack.split('\n')[2]);
		
		// Hide menu during animation
		menuManager.hideMenu(config.menuType);
		console.log(`${displayEmoji} ${config.menuType} menu hidden during animation`);
		
		// Set state
		window[config.stateVar] = true;
		
		// Calculate end time
		const now = new Date();
		const duration = this.getDuration(animationType, subType);
		const calculatedEndTime = new Date(now.getTime() + duration);
		window[config.endTimeVar] = calculatedEndTime;
		
		// Show overlay
		const overlay = document.getElementById(config.overlayId);
		const title = document.getElementById(config.titleId);
		if (overlay && title) {
			title.textContent = this.getTitleText(animationType, subType);
			
			// Update emoji for play animations
			if (animationType === 'play') {
				const emojiElement = overlay.querySelector('.play-emoji');
				if (emojiElement) {
					emojiElement.textContent = displayEmoji;
				}
			}
			
			overlay.style.display = 'flex';
			console.log(`✅ Main ${animationType} overlay shown`);
		} else {
			console.error(`❌ Main ${animationType} overlay elements not found`);
		}
		
		// Disable all actions
		disableAllActions(true);
		
		// Start timer
		this.startTimer(animationType);
		
		// Protection against immediate hiding
		setTimeout(() => {
			if (!window[config.stateVar]) {
				console.error(`🚨 ${animationType.toUpperCase()} OVERLAY WAS HIDDEN IMMEDIATELY!`);
			}
		}, 100);
	}

	hideOverlay(animationType) {
		const config = this.animations[animationType];
		if (!config) return;

		console.log(`${config.emoji} HIDING ${animationType.toUpperCase()} OVERLAY`);
		
		// Reset state
		window[config.stateVar] = false;
		window[config.endTimeVar] = null;
		
		// Hide overlay
		const overlay = document.getElementById(config.overlayId);
		if (overlay) {
			// Reset emoji for play animations
			if (animationType === 'play') {
				const emojiElement = overlay.querySelector('.play-emoji');
				if (emojiElement) {
					emojiElement.textContent = config.emoji; // Reset to default 🎮
				}
			}
			
			overlay.style.display = 'none';
			console.log(`✅ Main ${animationType} overlay hidden`);
		}
		
		// Re-enable actions
		disableAllActions(false);
		
		// Clear timer
		if (window[config.timerVar]) {
			clearInterval(window[config.timerVar]);
			window[config.timerVar] = null;
			console.log(`✅ ${animationType} timer cleared`);
		}
	}

	startTimer(animationType) {
		const config = this.animations[animationType];
		if (!config) return;

		if (window[config.timerVar]) {
			clearInterval(window[config.timerVar]);
		}
		
		window[config.timerVar] = setInterval(() => this.updateProgress(animationType), 1000);
		this.updateProgress(animationType); // Initial update
	}

	updateProgress(animationType) {
		const config = this.animations[animationType];
		if (!config || !window[config.endTimeVar]) return;

		
		const timerConfig = {
			totalDuration: this.getDuration(animationType, null),
			progressFillId: config.progressFillId,
			progressTextId: config.progressTextId,
			timerId: config.timerId
		};
		
		const isRunning = TimerUtility.updateProgress(window[config.endTimeVar], timerConfig);
		
		if (!isRunning) {
			// Animation finished
			console.log(`⏰ ${animationType} timer finished - hiding overlay`);
			this.hideOverlay(animationType);
			// Show menu again after animation completes
			setTimeout(() => {
				console.log(`${config.emoji} Showing ${config.menuType} menu after animation completion`);
				menuManager.showMenu(config.menuType);
			}, 100);
		}
	}

	getDuration(animationType, subType) {
		if (animationType === 'wash') {
			return subType === 'wash_hands' ? 5000 : 
				   subType === 'shower' ? 20000 : 30000;
		}
		return this.animations[animationType].duration;
	}

	getTitleText(animationType, subType) {
		const titles = {
			feed: `Pet is eating ${subType.replace('_', ' ')}...`,
			play: `Pet is playing ${subType.replace('_', ' ')}...`,
			wash: subType === 'wash_hands' ? 'Pet is washing hands...' : 
				  subType === 'shower' ? 'Pet is taking a shower...' : 'Pet is taking a bath...'
		};
		return titles[animationType] || `Pet is ${animationType}ing...`;
	}

	getPlayEmoji(playType) {
		const playEmojis = {
			'play_with_ball': '🎾',
			'spin_in_wheel': '🎡'
		};
		return playEmojis[playType] || '🎮';
	}
}

// Initialize animation manager
const animationManager = new AnimationManager();

// DOM Cache - Improve performance by caching frequently used elements
class DOMCache {
	constructor() {
		this.cache = new Map();
		this.initialized = false;
	}

	init() {
		if (this.initialized) return;
		
		// Cache frequently used elements
		this.cache.set('actionButtons', document.querySelectorAll('.action-btn'));
		this.cache.set('statBars', document.querySelectorAll('.stat-bar'));
		this.cache.set('gameContainer', document.getElementById('game-container'));
		this.cache.set('storageModal', document.getElementById('storage-modal'));
		this.cache.set('shopModal', document.getElementById('shop-modal'));
		this.cache.set('minigameModal', document.getElementById('minigame-modal'));
		this.cache.set('sleepOverlay', document.getElementById('sleep-overlay'));
		this.cache.set('washOverlay', document.getElementById('wash-overlay'));
		this.cache.set('simpleSleepBar', document.getElementById('simple-sleep-bar'));
		
		this.initialized = true;
	}

	get(key) {
		if (!this.initialized) this.init();
		return this.cache.get(key);
	}

	refresh(key) {
		// Force refresh a cached element
		if (key === 'statBars') {
			this.cache.set('statBars', document.querySelectorAll('.stat-bar'));
		} else if (key === 'actionButtons') {
			this.cache.set('actionButtons', document.querySelectorAll('.action-btn'));
		}
		// Add more refresh logic as needed
	}

	getElementById(id) {
		const key = `element-${id}`;
		if (!this.cache.has(key)) {
			this.cache.set(key, document.getElementById(id));
		}
		return this.cache.get(key);
	}

	querySelector(selector) {
		const key = `selector-${selector}`;
		if (!this.cache.has(key)) {
			this.cache.set(key, document.querySelector(selector));
		}
		return this.cache.get(key);
	}
}

// Initialize DOM cache
const domCache = new DOMCache();

// Unified Timer Utility - Common logic for all progress timers
class TimerUtility {
	static updateProgress(endTime, config) {
		if (!endTime) return false;
		
		const now = new Date();
		const timeRemaining = endTime - now;
		
		if (timeRemaining <= 0) {
			return false; // Timer finished
		}
		
		// Calculate progress
		const totalDurationMs = config.totalDuration;
		const elapsedMs = totalDurationMs - timeRemaining;
		const rawPercent = Math.min(100, Math.max(0, (elapsedMs / totalDurationMs) * 100));
		
		// Snap displayed progress to whole-second steps to avoid 61%, 71%, etc.
		// We compute based on elapsed/remaining whole seconds so a 10s timer shows 10%, 20%, ...
		const totalSeconds = Math.max(1, Math.round(totalDurationMs / 1000));
		const remainingSeconds = Math.ceil(timeRemaining / 1000);
		const elapsedSeconds = Math.max(0, totalSeconds - remainingSeconds);
		const steppedPercent = Math.min(100, Math.max(0, (elapsedSeconds / totalSeconds) * 100));
		
		// Use stepped percent for display (text + width) for consistent UX
		const displayPercent = steppedPercent;
		
		// Update progress bar
		if (config.progressFillId) {
			const progressFill = document.getElementById(config.progressFillId);
			const progressText = document.getElementById(config.progressTextId);
			if (progressFill && progressText) {
				progressFill.style.width = `${displayPercent}%`;
				progressText.textContent = `${Math.round(displayPercent)}%`;
			}
		}
		
		// Update timer display
		if (config.timerId) {
			// Use ceiling for remaining seconds so 0:01 is shown until completion
			const totalSeconds = Math.ceil(timeRemaining / 1000);
			const minutes = Math.floor(totalSeconds / 60);
			const seconds = totalSeconds % 60;
			const timeString = `${minutes}:${seconds.toString().padStart(2, '0')}`;
			
			const timerElement = document.getElementById(config.timerId);
			if (timerElement) {
				timerElement.textContent = `Time remaining: ${timeString}`;
			}
		}
		
		// Update simple progress bar (for sleep)
		if (config.simpleProgressFillId) {
			const simpleProgressFill = document.getElementById(config.simpleProgressFillId);
			const simpleCountdown = document.getElementById(config.simpleCountdownId);
			
			if (simpleProgressFill) {
				simpleProgressFill.style.width = `${displayPercent}%`;
			}
			if (simpleCountdown) {
				// Ceiling here as well to avoid showing 0:00 prematurely
				const totalSeconds = Math.ceil(timeRemaining / 1000);
				const minutes = Math.floor(totalSeconds / 60);
				const seconds = totalSeconds % 60;
				const timeString = `${minutes}:${seconds.toString().padStart(2, '0')}`;
				simpleCountdown.textContent = timeString;
			}
		}
		
		return true; // Timer still running
	}
}

// Action configuration for unified handling
const ACTION_CONFIG = {
	feed: {
		endpoint: '/api/pet/action',
		method: 'POST',
		statThreshold: { stat: 'hunger', max: 80 },
		buttonSelector: '[data-action="feed"]',
		requiresType: true,
		typeField: 'food_type',
		imageFunction: 'showFoodImage',
		feedbackPrefix: 'Fed'
	},
	sleep: {
		endpoint: '/api/pet/action',
		method: 'POST',
		statThreshold: { stat: 'energy', max: 50 }, // Will be checked dynamically
		buttonSelector: '[data-action="sleep"]',
		requiresType: true,
		typeField: 'sleep_type',
		imageFunction: 'showSleepImage',
		feedbackPrefix: 'Sleep'
	},
	wash: {
		endpoint: '/api/pet/action',
		method: 'POST',
		statThreshold: { stat: 'cleanliness', max: 85 },
		buttonSelector: '[data-action="wash"]',
		requiresType: true,
		typeField: 'wash_type',
		imageFunction: 'showWashImage',
		feedbackPrefix: 'Wash'
	},
	play: {
		endpoint: '/api/pet/action',
		method: 'POST',
		statThreshold: { stat: 'happiness', max: 89 },
		buttonSelector: '[data-action="play"]',
		requiresType: true,
		typeField: 'play_type',
		imageFunction: 'showPlayImage',
		feedbackPrefix: 'Play'
	}
};

// Unified action handler
async function handleUnifiedAction(actionType, actionSubType) {
	const config = ACTION_CONFIG[actionType];
	if (!config) {
		console.error(`No configuration found for action: ${actionType}`);
		return;
	}

	const button = document.querySelector(config.buttonSelector);
	
	// Check if button is already disabled
	if (button && button.disabled) {
		console.log(`Action ${actionType} is disabled`);
		return;
	}
	
	// Check stat thresholds
	if (config.statThreshold) {
		const currentStatValue = getCurrentStatValue(config.statThreshold.stat);
		
		// Special handling for sleep energy restrictions
		if (actionType === 'sleep') {
			const maxEnergy = actionSubType === 'nap' ? 50 : 30;
			if (currentStatValue > maxEnergy) {
				const actionName = actionSubType === 'nap' ? 'Nap' : 'Sleep';
				showActionFeedback(actionName, false, `Energy is too high for ${actionSubType}`);
				return;
			}
		} else if (currentStatValue > config.statThreshold.max) {
			const statName = config.statThreshold.stat === 'happiness' ? 'Joy' : config.statThreshold.stat;
			console.log(`Action ${actionType} blocked - ${statName} is ${currentStatValue}% (threshold: ${config.statThreshold.max}%)`);
			updateButtonStates({ [config.statThreshold.stat]: currentStatValue });
			return;
		}
	}
	
	// Disable button during action
	if (button) {
		button.disabled = true;
		button.style.opacity = '0.6';
	}
	
	try {
		// Show action image if configured
		if (config.imageFunction && window[config.imageFunction]) {
			window[config.imageFunction](actionSubType);
		}
		
		// Prepare request body
		const requestBody = { action: actionType };
		if (config.requiresType && actionSubType) {
			requestBody[config.typeField] = actionSubType;
		}
		
		// Send AJAX request
		const response = await fetch(config.endpoint, {
			method: config.method,
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(requestBody)
		});
		
		const data = await response.json();
		
		if (data.success) {
			// Handle response based on action type
			if (actionType === 'feed' && data.inventory) {
				updateInventoryDisplay(data.inventory);
			}
			
			// Handle frontend-managed animations (feed, play only)
			if (['feed', 'play'].includes(actionType)) {
				const now = new Date();
				const endTime = new Date(now.getTime() + animationManager.getDuration(actionType, actionSubType));
				animationManager.showOverlay(actionType, actionSubType, endTime.toISOString());
			}
			
			// Handle backend-managed overlay states (sleep, wash)
			if (actionType === 'sleep' && data.is_sleeping && data.sleep_end_time) {
				showSleepOverlay(data.sleep_type, data.sleep_end_time);
			}
			if (actionType === 'wash' && data.is_washing && data.wash_end_time) {
				showWashOverlay(data.wash_type, data.wash_end_time);
			}
			
			// Update stats
			updateStatsDisplay(data.stats);
			// Update maturity if included
			if (data.maturity) {
				maturityStage = data.maturity.stage || maturityStage;
				applyMaturitySprites();
			}
			
			// Show success feedback
			const feedbackText = actionSubType ? 
				`${config.feedbackPrefix} ${actionSubType}` : 
				config.feedbackPrefix;
			showActionFeedback(feedbackText, true);
		} else {
			showActionFeedback(config.feedbackPrefix, false, data.error);
		}
	} 	catch (error) {
		console.error(`${actionType} action failed:`, error);
		showActionFeedback(config.feedbackPrefix, false, 'Network error');
	}
}

// Helper function to get current stat value from UI
function getCurrentStatValue(statName) {
	const statBars = domCache.get('statBars');
	const displayStatName = statName === 'happiness' ? 'joy' : statName;
	
	for (const bar of statBars) {
		const label = bar.querySelector('label');
		if (label && label.textContent.toLowerCase() === displayStatName) {
			const valueSpan = bar.querySelector('span');
			if (valueSpan) {
				return parseInt(valueSpan.textContent);
			}
		}
	}
	return null;
}

function preload() {
	console.log('Preloading sprites...');
	
	// Load squirrel sprites
	this.load.image('squirrel_idle', '/static/sprites/squirrel_idle.png');
	this.load.image('squirrel_happy', '/static/sprites/squirrel_happy.png');
	this.load.image('squirrel_hungry', '/static/sprites/squirrel_hungry.png');
	this.load.image('squirrel_sleeping', '/static/sprites/squirrel_sleeping.png');
	this.load.image('squirrel_sad', '/static/sprites/squirrel_sad.png');
	
	// Load squirrel idle animation sprite sheet (adult default)
	this.load.spritesheet('squirrel_idle_anim', '/static/sprites/sheets/squirrel_idle_sprite.png', {
		frameWidth: 256,
		frameHeight: 256
	});
	
	// Load squirrel hungry animation sprite sheet (adult default)
	this.load.spritesheet('squirrel_hungry_anim', '/static/sprites/sheets/squirrel_hungry_sprite.png', {
		frameWidth: 256,
		frameHeight: 256
	});
	
	// Load squirrel sleeping animation sprite sheet (adult default)
	this.load.spritesheet('squirrel_sleeping_anim', '/static/sprites/sheets/squirrel_sleepy_sprite.png', {
		frameWidth: 256,
		frameHeight: 256
	});
	
	// Load squirrel dirty animation sprite sheet (adult default)
	this.load.spritesheet('squirrel_dirty_anim', '/static/sprites/sheets/squirrel_dirty_sprite.png', {
		frameWidth: 256,
		frameHeight: 256
	});
	
	// Load squirrel bored animation sprite sheet (adult default)
	this.load.spritesheet('squirrel_bored_anim', '/static/sprites/sheets/squirrel_bored_sprite.png', {
		frameWidth: 256,
		frameHeight: 256
	});

	// Child/Teen placeholder sprite sheet (used for all states in early stages)
	this.load.spritesheet('squirrel_placeholder_anim', '/static/sprites/sheets/placeholder_sprite.png', {
		frameWidth: 256,
		frameHeight: 256
	});
	
	// Load food images
	this.load.image('mushroom', '/static/img/mushroom.png');
	this.load.image('blueberries', '/static/img/blueberry.png');
	this.load.image('tree_seed', '/static/img/tree_seed.png');
	this.load.image('acorn', '/static/img/acorn.png');
	
	// Load sleep images
	this.load.image('squirrel_sofa', '/static/img/squirrel_sofa.png');
	this.load.image('squirrel_bed', '/static/img/squirrel_bed.png');
	
	// Load play images
	this.load.image('tennis_ball', '/static/img/tennis_ball.png');
	this.load.image('play_wheel', '/static/img/play_wheel.png');

	// Wash images used by overlay image functions
	this.load.image('washbasin', '/static/img/washbasin.png');
	this.load.image('shower_cabin', '/static/img/shower_cabin.png');
	this.load.image('bath', '/static/img/bath.png');
	
	console.log('Squirrel sprites, food, sleep, and play images loaded');
	
	// TODO: Load other pet sprites when available
	// this.load.image('hedgehog_idle', '/static/sprites/hedgehog_idle.png');
	// this.load.image('hamster_idle', '/static/sprites/hamster_idle.png');
}

function create() {
	gameScene = this;
	
	// Get pet type from the page (if available)
	const petTypeElement = document.querySelector('h1');
	console.log('Pet type element text:', petTypeElement ? petTypeElement.textContent : 'No h1 found');
	
	// Convert to lowercase for case-insensitive comparison
	const h1Text = petTypeElement ? petTypeElement.textContent.toLowerCase() : '';
	
	if (h1Text.includes('hedgehog')) {
		petType = 'hedgehog';
	} else if (h1Text.includes('hamster')) {
		petType = 'hamster';
	} else if (h1Text.includes('squirrel')) {
		petType = 'squirrel';
	}
	
	console.log('Detected pet type:', petType);

	// Create pet based on type
	if (petType === 'squirrel') {
		// Use animated squirrel sprite
		console.log('Creating animated squirrel sprite...');
		const initialKey = getStageSpriteKey('idle');
		pet = this.add.sprite(GAME_WIDTH / 2, GAME_HEIGHT / 2, initialKey);
		
		// Since frames are already 256x256, we don't need to scale x2
		pet.setScale(1);
		
		// Create idle animation (4 frames)
		this.anims.create({
			key: 'squirrel_idle_animation',
			frames: this.anims.generateFrameNumbers('squirrel_idle_anim', { start: 0, end: 3 }),
			frameRate: 0.65,
			repeat: -1
		});
		
		// Create hungry animation (4 frames at 2fps = 2 seconds total)
		this.anims.create({
			key: 'squirrel_hungry_animation',
			frames: this.anims.generateFrameNumbers('squirrel_hungry_anim', { start: 0, end: 3 }),
			frameRate: 0.65,
			repeat: -1 // Loop forever
		});
		
		// Create sleeping animation (4 frames at 2fps = 2 seconds total)
		this.anims.create({
			key: 'squirrel_sleeping_animation',
			frames: this.anims.generateFrameNumbers('squirrel_sleeping_anim', { start: 0, end: 3 }),
			frameRate: 0.65,
			repeat: -1 // Loop forever
		});
		
		// Create dirty animation (4 frames at 2fps = 2 seconds total)
		this.anims.create({
			key: 'squirrel_dirty_animation',
			frames: this.anims.generateFrameNumbers('squirrel_dirty_anim', { start: 0, end: 3 }),
			frameRate: 0.65,
			repeat: -1 // Loop forever
		});
		
		// Create bored animation (4 frames at 2fps = 2 seconds total)
		this.anims.create({
			key: 'squirrel_bored_animation',
			frames: this.anims.generateFrameNumbers('squirrel_bored_anim', { start: 0, end: 3 }),
			frameRate: 0.65,
			repeat: -1 // Loop forever
		});
		
		// Start the idle animation (may be overridden to placeholder later)
		pet.play(getStageAnimationKey('idle'));
		
		console.log('Animated squirrel sprite created:', pet);
		
	} else {
		// Fallback to colored circle for other pets
		console.log('Creating fallback circle for:', petType);
		const graphics = this.add.graphics({ fillStyle: { color: PET_COLORS[petType] || PET_COLORS.hedgehog } });
		const radius = 60;
		graphics.fillCircle(radius, radius, radius);
		graphics.generateTexture('pet', radius * 2, radius * 2);
		graphics.destroy();

		pet = this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'pet');
		pet.setScale(1);
		
	}

	// No breathing animation for now - keeping pets at consistent scale

	// Set up action button handlers
	setupActionButtons();
	
	// Load current stats
	loadCurrentStats();
	
	// Set up automatic stat updates every minute
	setupAutoUpdates();
}

function update() {
	// Reserved for future game loop logic
}


function setupAutoUpdates() {
	// Update stats every minute (60000ms) - but pause during sleep
	autoUpdateTimer = setInterval(async () => {
		// Skip auto-update if pet is sleeping to avoid interference
		if (isSleeping) {
			console.log('🔄 Auto-update: Skipping (pet is sleeping)');
			return;
		}
		
		try {
			console.log('🔄 Auto-update: Fetching current stats...');
			const response = await fetch('/api/pet/stats');
			const data = await response.json();
			
			if (data.success) {
				// Use loadCurrentStats logic to handle sleep state properly
				updateStatsDisplay(data.stats);
				// Maturity info in auto update
				if (data.maturity) {
					maturityStage = data.maturity.stage || maturityStage;
					const stageEl = document.getElementById('maturity-stage');
					const nextEl = document.getElementById('maturity-next');
					if (stageEl) stageEl.textContent = `Stage: ${maturityStage}`;
					if (nextEl) {
						if (data.maturity.next_change_time) {
							nextEl.textContent = `Next: ${new Date(data.maturity.next_change_time).toLocaleString()}`;
						} else {
							nextEl.textContent = 'Next: --';
						}
					}
					applyMaturitySprites();
				}
				
				// Check sleep state (same logic as loadCurrentStats)
				if (data.is_sleeping && data.sleep_end_time && !isSleeping) {
					console.log('🔄 Auto-update: Pet is sleeping, showing overlay');
					showSleepOverlay(data.sleep_type, data.sleep_end_time);
				}
			}
		} catch (error) {
			console.error('Auto-update failed:', error);
		}
	}, 60000); // 60 seconds
}

async function loadCurrentStats() {
	try {
		console.log('🔄 loadCurrentStats called - fetching from backend...');
		const response = await fetch('/api/pet/stats');
		const data = await response.json();
		
		console.log('📦 Backend response:', data);
		
		if (data.success) {
			updateStatsDisplay(data.stats);
			// Update maturity UI and stage
			if (data.maturity) {
				maturityStage = data.maturity.stage || 'adult';
				const stageEl = document.getElementById('maturity-stage');
				const nextEl = document.getElementById('maturity-next');
				if (stageEl) stageEl.textContent = `Stage: ${maturityStage}`;
				if (nextEl) {
					if (data.maturity.next_change_time) {
						nextEl.textContent = `Next: ${new Date(data.maturity.next_change_time).toLocaleString()}`;
					} else {
						nextEl.textContent = 'Next: --';
					}
				}
				applyMaturitySprites();
			}
			
			// Update inventory
			if (data.inventory) {
				updateInventoryDisplay(data.inventory);
			}
			
			// Check if pet is sleeping and show overlay
			
			if (data.is_sleeping && data.sleep_end_time) {
				console.log('🔄 Backend says sleeping - showing overlay');
				// For page refresh, calculate the correct remaining time
				showSleepOverlay(data.sleep_type, data.sleep_end_time, data.sleep_start_time);
			} else if (isSleeping && !data.is_sleeping) {
				// Pet woke up on backend, hide overlay
				console.log('🌅 Backend says pet woke up - hiding overlay');
				hideSleepOverlay();
			} else if (!data.is_sleeping && !isSleeping) {
				console.log('😴 No sleep state change needed');
			} else {
				console.log('🤔 Unexpected sleep state combination');
			}
			
			// Check if pet is washing and show overlay
			
			if (data.is_washing && data.wash_end_time) {
				console.log('🔄 Backend says washing - showing overlay');
				// For page refresh, calculate the correct remaining time
				showWashOverlay(data.wash_type, data.wash_end_time, data.wash_start_time);
			} else if (isWashing && !data.is_washing) {
				// Pet finished washing on backend, hide overlay
				console.log('🚿 Backend says pet finished washing - hiding overlay');
				hideWashOverlay();
			} else if (!data.is_washing && !isWashing) {
				console.log('🚿 No wash state change needed');
			} else {
				console.log('🤔 Unexpected wash state combination');
			}
		}
	} catch (error) {
		console.error('Failed to load stats:', error);
	}
}

function setupActionButtons() {
	const actionButtons = domCache.get('actionButtons');
	
	actionButtons.forEach(button => {
		button.addEventListener('click', function() {
			const action = this.dataset.action;
			if (action === 'feed') {
				menuManager.showMenu('feed');
			} else if (action === 'sleep') {
				menuManager.showMenu('sleep');
			} else if (action === 'wash') {
				menuManager.showMenu('wash');
			} else if (action === 'play') {
				menuManager.showMenu('play');
		}
		});
	});
	
	// Setup all menu buttons using MenuManager
	menuManager.setupMenuButtons();
	
	// Setup storage button
	const storageButton = domCache.getElementById('storage-btn');
	if (storageButton) {
		storageButton.addEventListener('click', showStorageModal);
	}

	// Setup close storage button
	const closeStorageButton = domCache.getElementById('close-storage');
	if (closeStorageButton) {
		closeStorageButton.addEventListener('click', hideStorageModal);
	}

	// Setup storage modal click outside to close
	const storageModal = domCache.get('storageModal');
	if (storageModal) {
		storageModal.addEventListener('click', function(e) {
			if (e.target === storageModal) {
				hideStorageModal();
			}
		});
	}

	// Setup shop button
	const shopButton = domCache.getElementById('shop-btn');
	if (shopButton) {
		shopButton.addEventListener('click', showShopModal);
	}

	// Setup close shop button
	const closeShopButton = domCache.getElementById('close-shop');
	if (closeShopButton) {
		closeShopButton.addEventListener('click', hideShopModal);
	}

	// Setup shop modal click outside to close
	const shopModal = domCache.get('shopModal');
	if (shopModal) {
		shopModal.addEventListener('click', function(e) {
			if (e.target === shopModal) {
				hideShopModal();
			}
		});
	}

	// Setup quantity selectors
	setupQuantitySelectors();

	// Setup buy buttons
	setupBuyButtons();

	// Admin create user modal controls (if present)
	const adminBtn = document.getElementById('admin-create-user-btn');
	const adminModal = document.getElementById('admin-create-user-modal');
	const closeAdminBtn = document.getElementById('close-admin-create');
	if (adminBtn && adminModal) {
		adminBtn.addEventListener('click', () => { adminModal.style.display = 'flex'; });
	}
	if (closeAdminBtn && adminModal) {
		closeAdminBtn.addEventListener('click', () => { adminModal.style.display = 'none'; });
	}

	// Setup maturity debug buttons
	const maturityUp = document.getElementById('maturity-up');
	const maturityDown = document.getElementById('maturity-down');
	if (maturityUp) {
		maturityUp.addEventListener('click', async () => {
			await changeMaturity('up');
		});
	}
	if (maturityDown) {
		maturityDown.addEventListener('click', async () => {
			await changeMaturity('down');
		});
	}
	
	
	// Global menu closing functionality
	document.addEventListener('click', function(e) {
		// Check if click is outside any menu
		const menuIds = Object.values(menuManager.menus).map(config => config.id);
		const clickedMenu = menuIds.find(menuId => {
			const menu = document.getElementById(menuId);
			return menu && menu.contains(e.target);
		});
		
		// If click is outside all menus and not on action buttons, close all menus
		if (!clickedMenu && !e.target.closest('.action-btn')) {
			menuManager.hideAllMenus();
		}
	});
	
	// Close all menus on escape key
	document.addEventListener('keydown', function(e) {
		if (e.key === 'Escape') {
			menuManager.hideAllMenus();
		}
	});
}

async function changeMaturity(action) {
	try {
		const response = await fetch('/api/pet/maturity', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action })
		});
		const data = await response.json();
		if (data && data.success && data.maturity) {
			maturityStage = data.maturity.stage || maturityStage;
			menuManager.updateMaturityLabels(data.maturity);
			applyMaturitySprites();
		}
	} catch (e) {
		console.error('Failed to change maturity:', e);
	}
}




// Legacy function - now uses MenuManager
function hideAllMenus() {
	menuManager.hideAllMenus();
}

// Individual menu functions removed - now handled by MenuManager class



function showFoodImage(foodType) {
	if (!gameScene || !pet) return;
	
	// Clear any existing food display
	clearFoodDisplay();
	
	// Create food sprite
	foodDisplaySprite = gameScene.add.image(pet.x, pet.y, foodType);
	foodDisplaySprite.setScale(1.2);
	
	// Hide the pet temporarily
	pet.setVisible(false);
	
	// Set timer to hide food and show pet after 3 seconds
	foodDisplayTimer = setTimeout(() => {
		clearFoodDisplay();
	}, 3000);
}

function clearFoodDisplay() {
	if (foodDisplaySprite) {
		foodDisplaySprite.destroy();
		foodDisplaySprite = null;
	}
	
	if (pet) {
		pet.setVisible(true);
	}
	
	if (foodDisplayTimer) {
		clearTimeout(foodDisplayTimer);
		foodDisplayTimer = null;
	}
}

function showSleepImage(sleepType) {
	if (!gameScene || !pet) return;
	
	// Clear any existing food display
	clearFoodDisplay();
	
	// Map sleep types to image keys
	const sleepImageMap = {
		'nap': 'squirrel_sofa',
		'sleep': 'squirrel_bed'
	};
	
	const imageKey = sleepImageMap[sleepType];
	if (!imageKey) return;
	
	// Create sleep sprite
	foodDisplaySprite = gameScene.add.image(pet.x, pet.y, imageKey);
	foodDisplaySprite.setScale(1.2);
	
	// Hide the pet temporarily
	pet.setVisible(false);
	
	// Set timer to hide sleep image and show pet after 3 seconds
	foodDisplayTimer = setTimeout(() => {
		clearFoodDisplay();
	}, 3000);
}

function showWashImage(washType) {
	if (!gameScene || !pet) return;
	
	// Clear any existing food display
	clearFoodDisplay();
	
	// Map wash types to image keys
	const washImageMap = {
		'wash_hands': 'washbasin',
		'shower': 'shower_cabin',
		'bath': 'bath'
	};
	
	const imageKey = washImageMap[washType];
	if (!imageKey) return;
	
	// Create wash sprite
	foodDisplaySprite = gameScene.add.image(pet.x, pet.y, imageKey);
	foodDisplaySprite.setScale(1.2);
	
	// Hide the pet temporarily
	pet.setVisible(false);
	
	// Set timer to hide wash image and show pet after 3 seconds
	foodDisplayTimer = setTimeout(() => {
		clearFoodDisplay();
	}, 3000);
}

function showPlayImage(playType) {
	if (!gameScene || !pet) return;
	
	// Clear any existing food display
	clearFoodDisplay();
	
	// Map play types to image keys
	const playImageMap = {
		'play_with_ball': 'tennis_ball',
		'spin_in_wheel': 'play_wheel'
	};
	
	const imageKey = playImageMap[playType];
	if (!imageKey) return;
	
	// Create play sprite
	foodDisplaySprite = gameScene.add.image(pet.x, pet.y, imageKey);
	foodDisplaySprite.setScale(1.2);
	
	// Hide the pet temporarily
	pet.setVisible(false);
	
	// Set timer to hide play image and show pet after 3 seconds
	foodDisplayTimer = setTimeout(() => {
		clearFoodDisplay();
	}, 3000);
}


function playActionAnimation(action) {
	if (!gameScene || !pet) return;
	
	// Stop any existing animations
	gameScene.tweens.killTweensOf(pet);
	
	// Different animations for each action
	switch (action) {
		case 'feed':
			// Bounce and scale up
			gameScene.tweens.add({
				targets: pet,
				scale: 1.3,
				duration: 300,
				yoyo: true,
				repeat: 1,
				ease: 'Bounce.easeOut'
			});
			break;
			
		case 'play':
			// Spin around
			gameScene.tweens.add({
				targets: pet,
				angle: 360,
				duration: 500,
				ease: 'Power2'
			});
			break;
			
		case 'wash':
			// Shake side to side
			gameScene.tweens.add({
				targets: pet,
				x: pet.x + 20,
				duration: 100,
				yoyo: true,
				repeat: 3,
				ease: 'Sine.easeInOut'
			});
			break;
			
		case 'sleep':
			// Gentle fade and scale down
			gameScene.tweens.add({
				targets: pet,
				scale: 0.8,
				alpha: 0.7,
				duration: 400,
				yoyo: true,
				repeat: 1,
				ease: 'Sine.easeInOut'
			});
			break;
	}
	
	// Reset to normal scale after action
	setTimeout(() => {
		if (pet) {
			pet.setScale(1);
		}
	}, 1000);
}

function updateStatsDisplay(stats) {
	// Update each stat bar
	Object.keys(stats).forEach(statName => {
		const statValue = stats[statName];
		
		// Find the stat bar by looking for the label text
		const statBars = domCache.get('statBars');
		let targetBar = null;
		
		// Map "happiness" to "joy" for display purposes
		const displayStatName = statName === 'happiness' ? 'joy' : statName;
		
		for (const bar of statBars) {
			const label = bar.querySelector('label');
			if (label && label.textContent.toLowerCase() === displayStatName) {
				targetBar = bar;
				break;
			}
		}
		
		if (targetBar) {
			const fillBar = targetBar.querySelector('.fill');
			const valueSpan = targetBar.querySelector('span');
			
			if (fillBar) {
				fillBar.style.width = `${statValue}%`;
			}
			if (valueSpan) {
				valueSpan.textContent = `${statValue}%`;
			}
		}
	});
	
	// Update pet appearance based on stats
	updatePetAppearance(stats);
	
	// Update button states based on stats
	updateButtonStates(stats);
	
	// Update minigame button state
	if (window.updateMinigameButtonFromStats) {
		window.updateMinigameButtonFromStats(stats);
	}
	
	// Check for auto-sleep when energy reaches 0 (but only if not already sleeping)
	if (stats.energy <= 0 && !isSleeping) {
		console.log('Energy reached 0, triggering auto-sleep');
		autoSleep();
	}
}

function updateButtonStates(stats) {
	// Don't update button states if any animation is active
	if (isFeeding || isPlaying || isWashing || isSleeping) {
		console.log('🚫 Skipping button state update - animation is active:', {
			isFeeding, isPlaying, isWashing, isSleeping
		});
		return;
	}
	
	// Define which action corresponds to which stat and their thresholds
	const actionToStat = {
		'feed': { stat: 'hunger', threshold: 80 },
		'play': { stat: 'happiness', threshold: 89 }, // Changed to 89 (joy < 90)
		'wash': { stat: 'cleanliness', threshold: 85 },
		'sleep': { stat: 'energy', threshold: 50 },
		'shop': { stat: 'sleep', threshold: 0, sleepDisabled: true } // Special case for shop
	};
	
	// Check each action button
	Object.keys(actionToStat).forEach(action => {
		const statConfig = actionToStat[action];
		const statName = statConfig.stat;
		const threshold = statConfig.threshold;
		const statValue = stats[statName];
		const button = document.querySelector(`[data-action="${action}"]`) || document.getElementById(`${action}-btn`);

		if (button && statValue !== undefined) {
			// Special handling for sleep button
			if (action === 'sleep') {
				// Sleep button is enabled if energy is 50 or below (for nap)
				if (statValue > 50) {
					button.disabled = true;
					button.style.opacity = '0.5';
					button.style.cursor = 'not-allowed';
					button.title = `Energy is too high (${statValue}%). Need 50% or below for nap, 30% or below for sleep.`;
					console.log(`Disabled ${action} button - ${statName} is ${statValue}% (max: 50%)`);
				} else {
					button.disabled = false;
					button.style.opacity = '1';
					button.style.cursor = 'pointer';
					button.title = `Take rest to restore energy`;
					console.log(`Enabled ${action} button - ${statName} is ${statValue}% (max: 50%)`);
				}
			} else if (action === 'shop' && statConfig.sleepDisabled) {
				// Special handling for shop button - disabled during sleep
				if (isSleeping) {
					button.disabled = true;
					button.style.opacity = '0.5';
					button.style.cursor = 'not-allowed';
					button.title = 'Cannot shop while pet is sleeping';
					console.log(`Disabled ${action} button - pet is sleeping`);
				} else {
					button.disabled = false;
					button.style.opacity = '1';
					button.style.cursor = 'pointer';
					button.title = 'Buy food to replenish your inventory';
					console.log(`Enabled ${action} button - pet is awake`);
				}
			} else {
				// Regular threshold check for other buttons
				if (statValue > threshold) {
					button.disabled = true;
					button.style.opacity = '0.5';
					button.style.cursor = 'not-allowed';
					// Special message for play button (show "Joy" instead of "happiness")
					const displayStatName = (action === 'play' && statName === 'happiness') ? 'Joy' : statName.charAt(0).toUpperCase() + statName.slice(1);
					button.title = `${displayStatName} is too high (${statValue}%). Wait until it drops to ${threshold}% or below.`;
					console.log(`Disabled ${action} button - ${statName} is ${statValue}% (threshold: ${threshold}%)`);
				} else {
					button.disabled = false;
					button.style.opacity = '1';
					button.style.cursor = 'pointer';
					// Special message for play button (show "Joy" instead of "happiness")
					const displayStatName = (action === 'play' && statName === 'happiness') ? 'Joy' : statName;
					button.title = `Use ${action} to improve ${displayStatName}`;
					console.log(`Enabled ${action} button - ${statName} is ${statValue}% (threshold: ${threshold}%)`);
				}
			}
		}
	});
	
	// Update minigame button state based on joy requirement
	const minigameBtn = document.getElementById('minigame-btn');
	if (minigameBtn && stats.happiness !== undefined) {
		const joyValue = stats.happiness;
		if (joyValue < 40) {
			minigameBtn.disabled = true;
			minigameBtn.style.opacity = '0.5';
			minigameBtn.style.cursor = 'not-allowed';
			minigameBtn.title = `Joy too low! Need at least 40% (current: ${joyValue}%)`;
			console.log(`Disabled minigame button - Joy is ${joyValue}% (min: 40%)`);
		} else {
			minigameBtn.disabled = false;
			minigameBtn.style.opacity = '1';
			minigameBtn.style.cursor = 'pointer';
			minigameBtn.title = 'Play minigames with your pet!';
			console.log(`Enabled minigame button - Joy is ${joyValue}% (min: 40%)`);
		}
	}
}

function updatePetAppearance(stats) {
	if (!pet || petType !== 'squirrel') return;

	// Apply maturity sprites before computing states
	applyMaturitySprites();
	
	// Determine active states based on thresholds (multiple states can be active)
	const activeStates = [];
	
	// Check each condition independently
	if (stats.energy < 30) {
		activeStates.push('sleeping');
	}
	if (stats.hunger < 50) {
		activeStates.push('hungry');
	}
	if (stats.cleanliness < 40) {
		activeStates.push('dirty');
	}
	if (stats.happiness < 50) {
		activeStates.push('bored');
	}
	
	// Special states that override others
	if (stats.hunger >= 80 && stats.happiness >= 80 && stats.cleanliness >= 80 && stats.energy >= 80) {
		activeStates.length = 0; // Clear other states
		activeStates.push('happy');
	}
	
	// If no negative conditions are met, default to idle
	if (activeStates.length === 0) {
		activeStates.push('idle');
	}
	
	// Create a state key for comparison (sorted to ensure consistency)
	const newStateKey = activeStates.sort().join('+');
	
	// Only change if state combination actually changed
	if (newStateKey !== currentPetState) {
		changePetStateMulti(activeStates, newStateKey);
	}
}

// Select appropriate sprite sheet per maturity stage
function getStageSpriteKey(state) {
	if (petType !== 'squirrel') return 'squirrel_idle_anim';
	const isAdult = maturityStage === 'adult';
	if (!isAdult) {
		return 'squirrel_placeholder_anim';
	}
	const mapping = {
		'idle': 'squirrel_idle_anim',
		'hungry': 'squirrel_hungry_anim',
		'sleeping': 'squirrel_sleeping_anim',
		'dirty': 'squirrel_dirty_anim',
		'bored': 'squirrel_bored_anim'
	};
	return mapping[state] || 'squirrel_idle_anim';
}

function getStageAnimationKey(state) {
	if (petType !== 'squirrel') return 'squirrel_idle_animation';
	const isAdult = maturityStage === 'adult';
	if (!isAdult) return 'squirrel_placeholder_animation';
	return `squirrel_${state}_animation`;
}

function ensurePlaceholderAnimation() {
	if (!gameScene) return;
	if (!gameScene.anims.exists('squirrel_placeholder_animation')) {
		gameScene.anims.create({
			key: 'squirrel_placeholder_animation',
			frames: gameScene.anims.generateFrameNumbers('squirrel_placeholder_anim', { start: 0, end: 3 }),
			frameRate: 0.65,
			repeat: -1
		});
	}
}

function applyMaturitySprites() {
	if (!pet || petType !== 'squirrel') return;
	const isAdult = maturityStage === 'adult';
	if (!isAdult) {
		ensurePlaceholderAnimation();
		pet.stop();
		pet.setTexture('squirrel_placeholder_anim');
		pet.play('squirrel_placeholder_animation');
	} else {
		// switch back to correct animation for current state
		const states = currentPetState.includes('+') ? currentPetState.split('+') : [currentPetState];
		if (states.length === 1) {
			const key = getStageSpriteKey(states[0]);
			pet.stop();
			pet.setTexture(key);
			pet.play(getStageAnimationKey(states[0]));
		}
	}
}

function changePetStateMulti(activeStates, stateKey) {
	if (!pet || petType !== 'squirrel') {
		console.log('Cannot change pet state:', { pet: !!pet, petType, activeStates });
		return;
	}
	
	console.log('Changing pet state from', currentPetState, 'to', stateKey, '(states:', activeStates, ')');
	currentPetState = stateKey;
	
	// Map state names to their animation sprite sheet keys (stage-aware)
	const stateToSpriteSheet = {
		'idle': getStageSpriteKey('idle'),
		'hungry': getStageSpriteKey('hungry'),
		'sleeping': getStageSpriteKey('sleeping'),
		'dirty': getStageSpriteKey('dirty'),
		'bored': getStageSpriteKey('bored')
	};
	
	// Handle single states that use animated sprites
	if (activeStates.length === 1) {
		const state = activeStates[0];
		
		if (stateToSpriteSheet[state]) {
			// Use animated sprite
			console.log(`Switching to animated ${state} state`);
			pet.stop();
			pet.setTexture(stateToSpriteSheet[state]);
			pet.play(getStageAnimationKey(state));
			console.log(`Animated ${state} state activated`);
		} else {
			// Use static sprite (happy, sad)
			const spriteKey = PET_SPRITES[petType][state];
			console.log('Sprite key:', spriteKey, 'Texture exists:', gameScene.textures.exists(spriteKey));
			
			if (spriteKey && gameScene.textures.exists(spriteKey)) {
				pet.stop();
				pet.setTexture(spriteKey);
				console.log('Texture changed to:', spriteKey);
			} else {
				console.log('Failed to change texture:', { spriteKey, exists: gameScene.textures.exists(spriteKey) });
			}
		}
	} else {
		// Handle multiple states - create combined animation
		createCombinedAnimation(activeStates, stateKey);
	}
	
	// Add a subtle transition effect
	pet.setAlpha(0.8);
	gameScene.tweens.add({
		targets: pet,
		alpha: 1,
		duration: 300,
		ease: 'Power2'
	});
}

function createCombinedAnimation(activeStates, stateKey) {
	const animationKey = `squirrel_combined_${stateKey.replace(/\+/g, '_')}`;
	
	// Check if this combined animation already exists
	if (gameScene.anims.exists(animationKey)) {
		console.log(`Using existing combined animation: ${animationKey}`);
		pet.stop();
		pet.setTexture(getStageSpriteKey('idle')); // Use stage-based base texture
		pet.play(animationKey);
		return;
	}
	
	console.log(`Creating combined animation: ${animationKey} for states:`, activeStates);
	
	// Build combined frame sequence
	const combinedFrames = [];
	const stateToSpriteSheet = {
		'idle': getStageSpriteKey('idle'),
		'hungry': getStageSpriteKey('hungry'),
		'sleeping': getStageSpriteKey('sleeping'),
		'dirty': getStageSpriteKey('dirty'),
		'bored': getStageSpriteKey('bored')
	};
	
	// Add frames from each active state (only animated states)
	activeStates.forEach(state => {
		const spriteSheetKey = stateToSpriteSheet[state];
		if (spriteSheetKey) {
			// Add all 4 frames from this state's sprite sheet
			for (let i = 0; i < 4; i++) {
				combinedFrames.push({
					key: spriteSheetKey,
					frame: i
				});
			}
		}
	});
	
	// If no animated states, fall back to idle
	if (combinedFrames.length === 0) {
		for (let i = 0; i < 4; i++) {
			combinedFrames.push({
				key: getStageSpriteKey('idle'),
				frame: i
			});
		}
	}
	
	// Create the combined animation
	gameScene.anims.create({
		key: animationKey,
		frames: combinedFrames,
		frameRate: 0.65,
		repeat: -1
	});
	
	console.log(`Created combined animation with ${combinedFrames.length} frames:`, combinedFrames.map(f => `${f.key}:${f.frame}`));
	
	// Play the combined animation
	pet.stop();
	pet.setTexture(getStageSpriteKey('idle')); // Use stage-based base texture
	pet.play(animationKey);
}

function changePetState(newState) {
	if (!pet || petType !== 'squirrel') {
		console.log('Cannot change pet state:', { pet: !!pet, petType, newState });
		return;
	}
	
	console.log('Changing pet state from', currentPetState, 'to', newState);
	currentPetState = newState;
	
	if (newState === 'idle') {
		// For idle state, use the animated sprite
		console.log('Switching to animated idle state');
		
		// Stop any current animation
		pet.stop();
		
		// Set to animated sprite texture and start animation
		pet.setTexture(getStageSpriteKey('idle'));
		pet.play(getStageAnimationKey('idle'));
		
		console.log('Animated idle state activated');
	} else if (newState === 'hungry') {
		// For hungry state, use the animated sprite
		console.log('Switching to animated hungry state');
		
		// Stop any current animation
		pet.stop();
		
		// Set to animated sprite texture and start animation
		pet.setTexture(getStageSpriteKey('hungry'));
		pet.play(getStageAnimationKey('hungry'));
		
		console.log('Animated hungry state activated');
	} else if (newState === 'sleeping') {
		// For sleeping state, use the animated sprite
		console.log('Switching to animated sleeping state');
		
		// Stop any current animation
		pet.stop();
		
		// Set to animated sprite texture and start animation
		pet.setTexture(getStageSpriteKey('sleeping'));
		pet.play(getStageAnimationKey('sleeping'));
		
		console.log('Animated sleeping state activated');
	} else if (newState === 'dirty') {
		// For dirty state, use the animated sprite
		console.log('Switching to animated dirty state');
		
		// Stop any current animation
		pet.stop();
		
		// Set to animated sprite texture and start animation
		pet.setTexture(getStageSpriteKey('dirty'));
		pet.play(getStageAnimationKey('dirty'));
		
		console.log('Animated dirty state activated');
	} else {
		// For other states, use static sprites
		const spriteKey = PET_SPRITES[petType][newState];
		
		console.log('Sprite key:', spriteKey, 'Texture exists:', gameScene.textures.exists(spriteKey));
		
		if (spriteKey && gameScene.textures.exists(spriteKey)) {
			// Stop animation and switch to static sprite
			pet.stop();
			pet.setTexture(spriteKey);
			console.log('Texture changed to:', spriteKey);
		} else {
			console.log('Failed to change texture:', { spriteKey, exists: gameScene.textures.exists(spriteKey) });
		}
	}
	
	// Add a subtle transition effect
	pet.setAlpha(0.8);
	gameScene.tweens.add({
		targets: pet,
		alpha: 1,
		duration: 200,
		ease: 'Power2'
	});
}

function updateSingleStat(statName, value) {
	const statBars = document.querySelectorAll('.stat-bar');
	
	for (const bar of statBars) {
		const label = bar.querySelector('label');
		if (label && label.textContent.toLowerCase() === statName) {
			const fillBar = bar.querySelector('.fill');
			const valueSpan = bar.querySelector('span');
			
			if (fillBar) {
				fillBar.style.width = `${value}%`;
			}
			if (valueSpan) {
				valueSpan.textContent = `${value}%`;
			}
			break;
		}
	}
}

function showActionFeedback(action, success, error = null) {
	// Create feedback element
	const feedback = document.createElement('div');
	feedback.className = `action-feedback ${success ? 'success' : 'error'}`;
	feedback.textContent = success ? 
		`${action.charAt(0).toUpperCase() + action.slice(1)} successful!` : 
		`${action.charAt(0).toUpperCase() + action.slice(1)} failed: ${error}`;
	
	// Add to page
	document.body.appendChild(feedback);
	
	// Animate in
	setTimeout(() => feedback.classList.add('show'), 10);
	
	// Remove after 3 seconds
	setTimeout(() => {
		feedback.classList.remove('show');
		setTimeout(() => feedback.remove(), 300);
	}, 3000);
}

async function autoSleep() {
	console.log('Auto-sleep triggered - energy at 0');
	
	try {
		// Show sleep image for 3 seconds
		showSleepImage('sleep');
		
		// Send AJAX request for auto-sleep
		const response = await fetch('/api/pet/action', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ action: 'sleep', sleep_type: 'sleep', auto_sleep: true })
		});
		
		const data = await response.json();
		
		if (data.success) {
			// Update all stats and pet appearance
			updateStatsDisplay(data.stats);
			
			// Show sleep overlay for auto-sleep
			if (data.is_sleeping && data.sleep_end_time) {
				showSleepOverlay(data.sleep_type, data.sleep_end_time);
			}
			
			// Show success feedback
			showActionFeedback('Auto-sleep started', true);
		} else {
			console.error('Auto-sleep failed:', data.error);
		}
	} catch (error) {
		console.error('Auto-sleep failed:', error);
	}
}

// Sleep management functions
function showSleepOverlay(sleepType, endTime, startTime = null) {
	console.log(`🛌 SHOWING SLEEP OVERLAY: ${sleepType} until ${endTime}`);
	console.log(`🕐 Current time: ${new Date()}`);
	console.log(`📍 Called from:`, new Error().stack.split('\n')[2]);
	
	isSleeping = true;
	window.isSleeping = isSleeping;
	
	// Always work in UTC to match backend
	// Backend sends UTC times, so we need to compare with UTC
	if (startTime) {
		// Ensure we're parsing the UTC time correctly
		const backendStartTime = new Date(startTime + (startTime.endsWith('Z') ? '' : 'Z')); 
		const backendEndTime = new Date(endTime + (endTime.endsWith('Z') ? '' : 'Z'));
		const nowUTC = new Date();
		
		// Simple approach: use the backend's actual end time if it's in the future
		const timeToEnd = backendEndTime - nowUTC;
		
		if (timeToEnd > 0) {
			// Backend end time is in the future, use it directly
			sleepEndTime = backendEndTime;
			console.log(`✅ Using backend end time directly: ${timeToEnd}ms (${Math.round(timeToEnd/1000)}s) remaining`);
		} else {
			// Calculate from start time + duration (fallback)
			const elapsedMs = nowUTC - backendStartTime;
			const totalDurationMs = sleepType === 'nap' ? 60000 : 120000; // 1 or 2 minutes
			const remainingMs = Math.max(0, totalDurationMs - elapsedMs); // Don't go negative
			
			sleepEndTime = new Date(nowUTC.getTime() + remainingMs);
			
			console.log(`⏰ Fallback calculation:`, {
				backendStartUTC: backendStartTime.toISOString(),
				nowUTC: nowUTC.toISOString(), 
				elapsedMs: Math.round(elapsedMs/1000) + 's',
				totalDurationMs: Math.round(totalDurationMs/1000) + 's', 
				remainingMs: Math.round(remainingMs/1000) + 's',
				endTimeUTC: sleepEndTime.toISOString()
			});
		}
	} else {
		// No start time provided, calculate from current UTC time
		const nowUTC = new Date();
		const sleepDurationMs = sleepType === 'nap' ? 60000 : 120000; // 1 or 2 minutes
		sleepEndTime = new Date(nowUTC.getTime() + sleepDurationMs);
		console.log(`✅ New sleep - end time UTC: ${sleepEndTime.toISOString()}, local: ${sleepEndTime.toLocaleString()}`);
	}
	
	// Show simple progress bar (always visible)
	const simpleBar = document.getElementById('simple-sleep-bar');
	const simpleText = document.getElementById('simple-sleep-text');
	if (simpleBar && simpleText) {
		simpleText.textContent = sleepType === 'nap' ? 'Pet is napping...' : 'Pet is sleeping...';
		simpleBar.style.display = 'block';
		console.log('✅ Simple progress bar shown');
	} else {
		console.error('❌ Simple progress bar elements not found');
	}
	
	// Show main sleep overlay
	const overlay = document.getElementById('sleep-overlay');
	const title = document.getElementById('sleep-title');
	if (overlay && title) {
		title.textContent = sleepType === 'nap' ? 'Pet is taking a nap...' : 'Pet is sleeping...';
		overlay.style.display = 'flex';
		console.log('✅ Main sleep overlay shown');
	} else {
		console.error('❌ Main sleep overlay elements not found');
	}
	
	// Sleep status indicator removed - only main overlay now
	
	// Disable all action buttons
	disableAllActions(true);
	
	// Start the countdown timer
	startSleepTimer();
	
	// Add protection against immediate hiding
	setTimeout(() => {
		if (!isSleeping) {
			console.error('🚨 SLEEP OVERLAY WAS HIDDEN IMMEDIATELY! Something called hideSleepOverlay()');
		}
	}, 100);
}

function hideSleepOverlay() {
	console.log('🌅 HIDING SLEEP OVERLAY - called from:', new Error().stack.split('\n')[2]);
	
	isSleeping = false;
	window.isSleeping = isSleeping;
	sleepEndTime = null;
	
	// Hide simple progress bar
	const simpleBar = document.getElementById('simple-sleep-bar');
	if (simpleBar) {
		simpleBar.style.display = 'none';
		console.log('✅ Simple progress bar hidden');
	}
	
	// Hide main sleep overlay
	const overlay = document.getElementById('sleep-overlay');
	if (overlay) {
		overlay.style.display = 'none';
		console.log('✅ Main sleep overlay hidden');
	}
	
	// Sleep status indicator removed - no longer needed
	
	// Re-enable action buttons
	disableAllActions(false);
	
	// Clear the timer
	if (sleepTimer) {
		clearInterval(sleepTimer);
		sleepTimer = null;
		console.log('✅ Sleep timer cleared');
	}
}

function startSleepTimer() {
	if (sleepTimer) {
		clearInterval(sleepTimer);
	}
	
	sleepTimer = setInterval(updateSleepProgress, 1000);
	updateSleepProgress(); // Initial update
}

function updateSleepProgress() {
	if (!sleepEndTime) return;
	
	
	// Determine sleep duration from title
	const sleepType = document.getElementById('sleep-title').textContent.toLowerCase();
	const totalDurationMs = sleepType.includes('nap') ? 60000 : 120000; // 1 or 2 minutes
	
	const timerConfig = {
		totalDuration: totalDurationMs,
		progressFillId: 'sleep-progress-fill',
		progressTextId: 'sleep-progress-text',
		timerId: 'sleep-timer',
		simpleProgressFillId: 'simple-progress-fill',
		simpleCountdownId: 'simple-sleep-countdown'
	};
	
	const isRunning = TimerUtility.updateProgress(sleepEndTime, timerConfig);
	
	if (!isRunning) {
		// Sleep finished
		console.log('⏰ Sleep timer finished - hiding overlay');
		hideSleepOverlay();
		// DON'T call loadCurrentStats() here - it causes infinite loop
	}
}

// Wash state management
let washTimer = null;
let washEndTime = null;
let isWashing = false;
window.isWashing = isWashing;

// Feed state management
let feedTimer = null;
let feedEndTime = null;
let isFeeding = false;
window.isFeeding = isFeeding;

// Play state management
let playTimer = null;
let playEndTime = null;
let isPlaying = false;
window.isPlaying = isPlaying;

function showWashOverlay(washType, endTime, startTime = null) {
	console.log(`🚿 SHOWING WASH OVERLAY: ${washType} until ${endTime}`);
	console.log(`🕐 Current time: ${new Date()}`);
	console.log(`📍 Called from:`, new Error().stack.split('\n')[2]);
	
	// Ensure wash menu is hidden during animation
	menuManager.hideMenu('wash');
	console.log('🚿 Wash menu hidden during animation');
	
	isWashing = true;
	window.isWashing = isWashing;
	
	// Always work in UTC to match backend
	// Backend sends UTC times, so we need to compare with UTC
	if (startTime) {
		// Ensure we're parsing the UTC time correctly
		const backendStartTime = new Date(startTime + (startTime.endsWith('Z') ? '' : 'Z')); 
		const backendEndTime = new Date(endTime + (endTime.endsWith('Z') ? '' : 'Z'));
		const nowUTC = new Date();
		
		// Simple approach: use the backend's actual end time if it's in the future
		const timeToEnd = backendEndTime - nowUTC;
		
		if (timeToEnd > 0) {
			// Backend end time is in the future, use it directly
			washEndTime = backendEndTime;
			console.log(`✅ Using backend end time directly: ${timeToEnd}ms (${Math.round(timeToEnd/1000)}s) remaining`);
		} else {
			// Calculate from start time + duration (fallback)
			const elapsedMs = nowUTC - backendStartTime;
			const totalDurationMs = washType === 'wash_hands' ? 5000 : washType === 'shower' ? 20000 : 30000; // 5s, 20s, 30s
			const remainingMs = Math.max(0, totalDurationMs - elapsedMs); // Don't go negative
			
			washEndTime = new Date(nowUTC.getTime() + remainingMs);
			
			console.log(`⏰ Fallback calculation:`, {
				backendStartUTC: backendStartTime.toISOString(),
				nowUTC: nowUTC.toISOString(), 
				elapsedMs: Math.round(elapsedMs/1000) + 's',
				totalDurationMs: Math.round(totalDurationMs/1000) + 's', 
				remainingMs: Math.round(remainingMs/1000) + 's',
				endTimeUTC: washEndTime.toISOString()
			});
		}
	} else {
		// No start time provided, calculate from current UTC time
		const nowUTC = new Date();
		const washDurationMs = washType === 'wash_hands' ? 5000 : washType === 'shower' ? 20000 : 30000; // 5s, 20s, 30s
		washEndTime = new Date(nowUTC.getTime() + washDurationMs);
		console.log(`✅ New wash - end time UTC: ${washEndTime.toISOString()}, local: ${washEndTime.toLocaleString()}`);
	}
	
	// Show wash overlay
	const overlay = document.getElementById('wash-overlay');
	const title = document.getElementById('wash-title');
	if (overlay && title) {
		title.textContent = washType === 'wash_hands' ? 'Pet is washing hands...' : 
						   washType === 'shower' ? 'Pet is taking a shower...' : 'Pet is taking a bath...';
		overlay.style.display = 'flex';
		console.log('✅ Main wash overlay shown');
	} else {
		console.error('❌ Main wash overlay elements not found');
	}
	
	// Disable all action buttons
	disableAllActions(true);
	
	// Start the countdown timer
	startWashTimer();
	
	// Add protection against immediate hiding
	setTimeout(() => {
		if (!isWashing) {
			console.error('🚨 WASH OVERLAY WAS HIDDEN IMMEDIATELY! Something called hideWashOverlay()');
		}
	}, 100);
}

function hideWashOverlay() {
	console.log('🚿 HIDING WASH OVERLAY');
	
	isWashing = false;
	window.isWashing = isWashing;
	washEndTime = null;
	
	// Hide main wash overlay
	const overlay = document.getElementById('wash-overlay');
	if (overlay) {
		overlay.style.display = 'none';
		console.log('✅ Main wash overlay hidden');
	}
	
	// Re-enable action buttons
	disableAllActions(false);
	
	// Clear the timer
	if (washTimer) {
		clearInterval(washTimer);
		washTimer = null;
		console.log('✅ Wash timer cleared');
	}
}

function startWashTimer() {
	if (washTimer) {
		clearInterval(washTimer);
	}
	
	washTimer = setInterval(updateWashProgress, 1000);
	updateWashProgress(); // Initial update
}

function updateWashProgress() {
	if (!washEndTime) return;
	
	
	// Determine wash duration from title
	const washTitle = document.getElementById('wash-title');
	const washType = washTitle ? washTitle.textContent.toLowerCase() : '';
	const totalDurationMs = washType.includes('hands') ? 5000 : 
							washType.includes('shower') ? 20000 : 
							washType.includes('bath') ? 30000 : 5000; // Default to 5s
	
	const timerConfig = {
		totalDuration: totalDurationMs,
		progressFillId: 'wash-progress-fill',
		progressTextId: 'wash-progress-text',
		timerId: 'wash-timer'
	};
	
	const isRunning = TimerUtility.updateProgress(washEndTime, timerConfig);
	
	if (!isRunning) {
		// Wash finished
		console.log('⏰ Wash timer finished - hiding overlay');
		hideWashOverlay();
		// Show wash menu again after animation completes
		setTimeout(() => {
			console.log('🚿 Showing wash menu after animation completion');
			menuManager.showMenu('wash');
		}, 100); // Small delay to ensure overlay is fully hidden
	}
}



function updateInventoryDisplay(inventory) {
	// Update global inventory state
	currentInventory = { ...inventory };
	
	// Update food quantity displays
	Object.keys(inventory).forEach(foodType => {
		const quantity = inventory[foodType];
		const quantityElements = document.querySelectorAll(`[data-food-type="${foodType}"]`);
		
		quantityElements.forEach(element => {
			element.textContent = `(${quantity})`;
			
			// Add styling based on quantity
			element.classList.remove('low-quantity', 'zero-quantity');
			if (quantity === 0) {
				element.classList.add('zero-quantity');
			} else if (quantity <= 2) {
				element.classList.add('low-quantity');
			}
		});
	});
	
	// Update storage modal quantities
	updateStorageQuantities(inventory);
	
	// Update food button states
	updateFoodButtonStates();
	
	console.log('📦 Inventory updated:', inventory);
}

function updateFoodButtonStates() {
	const foodButtons = document.querySelectorAll('.food-btn');
	
	foodButtons.forEach(button => {
		const foodType = button.dataset.food;
		const quantity = currentInventory[foodType] || 0;
		
		if (quantity <= 0) {
			button.disabled = true;
			button.style.opacity = '0.5';
			button.style.cursor = 'not-allowed';
			button.title = `No ${foodType.replace('_', ' ')} left in inventory`;
			button.classList.add('food-disabled');
		} else {
			button.disabled = false;
			button.style.opacity = '1';
			button.style.cursor = 'pointer';
			button.title = `Feed ${foodType.replace('_', ' ')} (${quantity} remaining)`;
			button.classList.remove('food-disabled');
		}
	});
}

function updatePlayButtonStates() {
	// Get current joy value from the UI
	const statBars = document.querySelectorAll('.stat-bar');
	let currentJoy = null;
	
	for (const bar of statBars) {
		const label = bar.querySelector('label');
		if (label && label.textContent.toLowerCase() === 'joy') {
			const valueSpan = bar.querySelector('span');
			if (valueSpan) {
				currentJoy = parseInt(valueSpan.textContent);
				break;
			}
		}
	}
	
	// Update play button states
	const playButtons = document.querySelectorAll('.play-btn');
	
	playButtons.forEach(button => {
		if (currentJoy !== null && currentJoy >= 90) {
			button.disabled = true;
			button.style.opacity = '0.5';
			button.style.cursor = 'not-allowed';
			button.title = 'Joy is too high for playing (max 89%)';
			button.classList.add('play-disabled');
		} else {
			button.disabled = false;
			button.style.opacity = '1';
			button.style.cursor = 'pointer';
			button.title = `${button.dataset.play.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())} (+25 Joy)`;
			button.classList.remove('play-disabled');
		}
	});
}

function disableAllActions(disabled) {
	const actionButtons = document.querySelectorAll('.action-btn');
	const shopButton = document.getElementById('shop-btn');
	const storageButton = document.getElementById('storage-btn');
	const minigameButton = document.getElementById('minigame-btn');

	// Disable all action buttons (feed, play, wash, sleep) during animations
	actionButtons.forEach(button => {
		button.disabled = disabled;
		
		if (disabled) {
			// Add a class for forced disabled styling
			button.classList.add('action-disabled-override');
			button.style.opacity = '0.5';
			button.style.cursor = 'not-allowed';
			button.style.background = '#6a737d';
			button.style.borderColor = '#6a737d';
			
			if (isSleeping) {
				button.title = 'Pet is sleeping - actions disabled';
			} else if (isWashing) {
				button.title = 'Pet is washing - actions disabled';
			} else if (isFeeding) {
				button.title = 'Pet is eating - actions disabled';
			} else if (isPlaying) {
				button.title = 'Pet is playing - actions disabled';
			}
		} else {
			// Remove the override class and reset styles
			button.classList.remove('action-disabled-override');
			button.style.opacity = '1';
			button.style.cursor = 'pointer';
			button.style.background = '';
			button.style.borderColor = '';
		}
	});

	// Keep shop button enabled during animations (user can still shop)
	if (shopButton) {
		shopButton.disabled = false; // Always enabled
		shopButton.style.opacity = '1';
		shopButton.title = 'Buy food to replenish your inventory';
	}
	
	// Keep storage button enabled during animations (user can still check storage)
	if (storageButton) {
		storageButton.disabled = false; // Always enabled
		storageButton.style.opacity = '1';
		storageButton.title = 'View your inventory';
	}
	
	// Disable minigame button during animations
	if (minigameButton) {
		minigameButton.disabled = disabled;
		minigameButton.style.opacity = disabled ? '0.5' : '1';
		if (disabled) {
			if (isSleeping) {
				minigameButton.title = 'Cannot play minigames while pet is sleeping';
			} else if (isWashing) {
				minigameButton.title = 'Cannot play minigames while pet is washing';
			} else if (isFeeding) {
				minigameButton.title = 'Cannot play minigames while pet is eating';
			} else if (isPlaying) {
				minigameButton.title = 'Cannot play minigames while pet is playing';
			}
		}
	}

}

// Storage modal functions
function showStorageModal() {
	const storageModal = document.getElementById('storage-modal');
	if (storageModal) {
		// Update storage quantities before showing
		updateStorageQuantities(currentInventory);
		storageModal.style.display = 'flex';
		
		// Add fade-in animation
		storageModal.style.opacity = '0';
		setTimeout(() => {
			storageModal.style.opacity = '1';
		}, 10);
		
		console.log('📦 Storage modal opened');
	}
}

function hideStorageModal() {
	const storageModal = document.getElementById('storage-modal');
	if (storageModal) {
		storageModal.style.display = 'none';
		console.log('📦 Storage modal closed');
	}
}

function updateStorageQuantities(inventory) {
	Object.keys(inventory).forEach(foodType => {
		const quantity = inventory[foodType];
		const quantityElement = document.getElementById(`storage-${foodType}`);

		if (quantityElement) {
			quantityElement.textContent = quantity;

			// Update styling based on quantity
			quantityElement.classList.remove('zero', 'low');
			if (quantity === 0) {
				quantityElement.classList.add('zero');
			} else if (quantity <= 2) {
				quantityElement.classList.add('low');
			}
		}
	});

	console.log('📦 Storage quantities updated:', inventory);
}

// Shop modal functions
function showShopModal() {
	// Shop is always available - no restrictions during animations

	const shopModal = document.getElementById('shop-modal');
	if (shopModal) {
		// Update shop quantities and coin display before showing
		updateShopDisplay(currentInventory);
		shopModal.style.display = 'flex';

		// Add fade-in animation
		shopModal.style.opacity = '0';
		setTimeout(() => {
			shopModal.style.opacity = '1';
		}, 10);

		console.log('🛍️ Shop modal opened');
	}
}

function hideShopModal() {
	const shopModal = document.getElementById('shop-modal');
	if (shopModal) {
		shopModal.style.display = 'none';
		console.log('🛍️ Shop modal closed');
	}
}

function updateShopDisplay(inventory) {
	const coins = inventory.coins || 0;

	// Update coin display
	const coinElement = document.getElementById('shop-coins');
	if (coinElement) {
		coinElement.textContent = coins;
	}

	// Update quantity selectors based on affordability
	updateQuantityLimits(coins);

	console.log('🛍️ Shop display updated:', inventory);
}

function updateQuantityLimits(coins) {
	const foodItems = ['tree_seed', 'mushroom', 'blueberries'];
	const prices = { tree_seed: 1, mushroom: 2, blueberries: 3 };

	foodItems.forEach(foodType => {
		const price = prices[foodType];
		const maxAffordable = Math.floor(coins / price);
		const qtyInput = document.getElementById(`qty-${foodType}`);
		const buyButton = document.getElementById(`buy-${foodType}`);

		if (qtyInput) {
			// Set max attribute to affordable amount
			qtyInput.max = maxAffordable;

			// If current value exceeds max affordable, adjust it
			const currentValue = parseInt(qtyInput.value) || 1;
			if (currentValue > maxAffordable) {
				qtyInput.value = maxAffordable || 1;
				updateTotalCost(foodType);
			}
		}

		if (buyButton) {
			buyButton.disabled = maxAffordable < 1;
		}
	});
}

function setupQuantitySelectors() {
	const minusButtons = document.querySelectorAll('.minus-btn');
	const plusButtons = document.querySelectorAll('.plus-btn');
	const qtyInputs = document.querySelectorAll('.qty-input');

	minusButtons.forEach(button => {
		button.addEventListener('click', function() {
			const foodType = this.dataset.food;
			const qtyInput = document.getElementById(`qty-${foodType}`);
			if (qtyInput) {
				const currentValue = parseInt(qtyInput.value) || 1;
				const newValue = Math.max(1, currentValue - 1);
				qtyInput.value = newValue;
				updateTotalCost(foodType);
			}
		});
	});

	plusButtons.forEach(button => {
		button.addEventListener('click', function() {
			const foodType = this.dataset.food;
			const qtyInput = document.getElementById(`qty-${foodType}`);
			if (qtyInput) {
				const currentValue = parseInt(qtyInput.value) || 1;
				const maxValue = parseInt(qtyInput.max) || 100;
				const newValue = Math.min(maxValue, currentValue + 1);
				qtyInput.value = newValue;
				updateTotalCost(foodType);
			}
		});
	});

	qtyInputs.forEach(input => {
		input.addEventListener('input', function() {
			const foodType = this.id.replace('qty-', '');
			let value = parseInt(this.value) || 1;

			// Ensure value is within bounds
			const min = parseInt(this.min) || 1;
			const max = parseInt(this.max) || 100;
			value = Math.max(min, Math.min(max, value));

			this.value = value;
			updateTotalCost(foodType);
		});

		input.addEventListener('change', function() {
			const foodType = this.id.replace('qty-', '');
			updateTotalCost(foodType);
		});
	});
}

function updateTotalCost(foodType) {
	const prices = { tree_seed: 1, mushroom: 2, blueberries: 3 };
	const price = prices[foodType];
	const qtyInput = document.getElementById(`qty-${foodType}`);
	const totalElement = document.getElementById(`total-${foodType}`);

	if (qtyInput && totalElement) {
		const quantity = parseInt(qtyInput.value) || 1;
		const total = price * quantity;
		totalElement.textContent = total;
	}
}

function setupBuyButtons() {
	const buyButtons = document.querySelectorAll('.buy-btn');

	buyButtons.forEach(button => {
		button.addEventListener('click', function() {
			const foodType = this.dataset.food;
			const qtyInput = document.getElementById(`qty-${foodType}`);

			if (qtyInput) {
				const quantity = parseInt(qtyInput.value) || 1;
				buyFood(foodType, quantity);
			}
		});
	});
}

async function buyFood(foodType, quantity) {
	try {
		// Disable button during purchase
		const buyButton = document.getElementById(`buy-${foodType}`);
		if (buyButton) {
			buyButton.disabled = true;
			buyButton.textContent = 'Buying...';
		}

		const response = await fetch('/api/shop/purchase', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				food_type: foodType,
				quantity: quantity
			})
		});

		const data = await response.json();

		if (data.success) {
			// Update inventory and display
			updateInventoryDisplay(data.inventory);

			// Show success message
			showActionFeedback(`Bought ${quantity} ${foodType.replace('_', ' ')}!`, true);

			// Reset quantity to 1
			const qtyInput = document.getElementById(`qty-${foodType}`);
			if (qtyInput) {
				qtyInput.value = 1;
				updateTotalCost(foodType);
			}
		} else {
			showActionFeedback(data.error, false);
		}
	} catch (error) {
		console.error('Shop purchase failed:', error);
		showActionFeedback('Purchase failed', false);
	} finally {
		// Re-enable button
		if (buyButton) {
			buyButton.disabled = false;
			buyButton.textContent = 'Buy';
		}
	}
}

// Initialize stat bar widths from data-value attributes
function initializeStatBars() {
	const statFills = document.querySelectorAll('.fill[data-value]');
	statFills.forEach(fill => {
		const value = parseInt(fill.getAttribute('data-value')) || 50;
		fill.style.width = `${value}%`;
	});
}

// Minigame functionality
document.addEventListener('DOMContentLoaded', function() {
	// Minigame button functionality
	const minigameBtn = document.getElementById('minigame-btn');
	const minigameModal = document.getElementById('minigame-modal');
	const closeMinigameBtn = document.getElementById('close-minigame');
	const higherLowerGame = document.getElementById('higher-lower-game');
	const closeHigherLowerBtn = document.getElementById('close-higher-lower');
	const labyrinthGame = document.getElementById('labyrinth-game');
	const closeLabyrinthBtn = document.getElementById('close-labyrinth');
	
	// Check joy requirement and update button state
	function updateMinigameButtonState() {
		const joyValue = parseInt(minigameBtn.dataset.joy) || 0;
		
		// Check if pet is in any animation state
		if (window.isSleeping || window.isWashing || window.isFeeding || window.isPlaying) {
			minigameBtn.disabled = true;
			minigameBtn.style.opacity = '0.5';
			if (window.isSleeping) {
				minigameBtn.title = 'Cannot play minigames while pet is sleeping';
			} else if (window.isWashing) {
				minigameBtn.title = 'Cannot play minigames while pet is washing';
			} else if (window.isFeeding) {
				minigameBtn.title = 'Cannot play minigames while pet is eating';
			} else if (window.isPlaying) {
				minigameBtn.title = 'Cannot play minigames while pet is playing';
			}
		} else if (joyValue < 40) {
			minigameBtn.disabled = true;
			minigameBtn.style.opacity = '0.5';
			minigameBtn.title = `Joy too low! Need at least 40% (current: ${joyValue}%)`;
		} else {
			minigameBtn.disabled = false;
			minigameBtn.style.opacity = '1';
			minigameBtn.title = 'Play minigames with your pet!';
		}
	}
	
	// Update button state on page load
	updateMinigameButtonState();
	
	// Update button state when stats change
	function updateMinigameButtonFromStats(stats) {
		if (stats && stats.happiness !== undefined) {
			minigameBtn.dataset.joy = stats.happiness;
			updateMinigameButtonState();
		}
	}
	
	// Open minigame modal
	minigameBtn.addEventListener('click', function() {
		if (!minigameBtn.disabled) {
			// Additional check for all animation states
			if (window.isSleeping || window.isWashing || window.isFeeding || window.isPlaying) {
				showActionFeedback('Cannot play minigames while pet is busy', false);
				return;
			}
			minigameModal.style.display = 'flex';
		}
	});
	
	// Close minigame modal
	closeMinigameBtn.addEventListener('click', function() {
		minigameModal.style.display = 'none';
	});
	
	// Close modal when clicking outside
	minigameModal.addEventListener('click', function(e) {
		if (e.target === minigameModal) {
			minigameModal.style.display = 'none';
		}
	});
	
	// Play minigame buttons
	document.querySelectorAll('.play-minigame-btn').forEach(btn => {
		btn.addEventListener('click', function() {
			const gameType = this.dataset.game;
			if (gameType === 'higher_lower') {
				startHigherLowerGame();
			} else if (gameType === 'labyrinth') {
				startLabyrinthGame();
			}
		});
	});
	
	// Start Higher or Lower game
	function startHigherLowerGame() {
		minigameModal.style.display = 'none';
		higherLowerGame.style.display = 'flex';
		
		// Reset game state
		document.getElementById('game-result').style.display = 'none';
		document.querySelectorAll('.guess-btn').forEach(btn => btn.disabled = false);
	}
	
	// Close Higher or Lower game
	closeHigherLowerBtn.addEventListener('click', function() {
		higherLowerGame.style.display = 'none';
	});
	
	// Close game when clicking outside
	higherLowerGame.addEventListener('click', function(e) {
		if (e.target === higherLowerGame) {
			higherLowerGame.style.display = 'none';
		}
	});
	
	// Guess buttons
	document.querySelectorAll('.guess-btn').forEach(btn => {
		btn.addEventListener('click', function() {
			const guess = this.dataset.guess;
			playHigherLowerGame(guess);
		});
	});
	
	// Play the game
	function playHigherLowerGame(guess) {
		// Disable buttons during game
		document.querySelectorAll('.guess-btn').forEach(btn => btn.disabled = true);
		
		// Show loading state
		const resultDiv = document.getElementById('game-result');
		resultDiv.style.display = 'block';
		document.getElementById('result-number').textContent = '🎲 Rolling...';
		document.getElementById('result-message').textContent = 'Tamagochi is thinking...';
		document.getElementById('result-reward').textContent = '';
		
		// Make API call
		fetch('/api/minigame/higher-lower', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ guess: guess })
		})
		.then(response => response.json())
		.then(data => {
			if (data.success) {
				// Show result
				document.getElementById('result-number').textContent = data.rolled_number;
				document.getElementById('result-message').textContent = data.reward_message;
				document.getElementById('result-message').className = 'result-message ' + (data.is_correct ? 'success' : 'error');
				
				if (data.is_correct) {
					document.getElementById('result-reward').textContent = `+2 coins earned! Total: ${data.stats.coins} coins`;
					document.getElementById('result-reward').className = 'result-reward coins';
				} else {
					document.getElementById('result-reward').textContent = `Joy decreased to ${data.stats.happiness}%`;
					document.getElementById('result-reward').className = 'result-reward joy-loss';
				}
				
				// Update global stats
				updateMinigameButtonFromStats(data.stats);
				
				// Update inventory display if shop is open
				if (window.currentInventory) {
					window.currentInventory.coins = data.stats.coins;
					updateInventoryDisplay();
				}
			} else {
				// Show error
				document.getElementById('result-number').textContent = '❌';
				document.getElementById('result-message').textContent = data.error;
				document.getElementById('result-message').className = 'result-message error';
				document.getElementById('result-reward').textContent = '';
			}
		})
		.catch(error => {
			console.error('Error playing minigame:', error);
			document.getElementById('result-number').textContent = '❌';
			document.getElementById('result-message').textContent = 'An error occurred while playing the game.';
			document.getElementById('result-message').className = 'result-message error';
			document.getElementById('result-reward').textContent = '';
		});
	}
	
	// Play again button
	document.getElementById('play-again-btn').addEventListener('click', function() {
		// Reset game state
		document.getElementById('game-result').style.display = 'none';
		document.querySelectorAll('.guess-btn').forEach(btn => btn.disabled = false);
	});
	
	// Update inventory display function (if it exists)
	function updateInventoryDisplay() {
		// Update shop coins display
		const shopCoins = document.getElementById('shop-coins');
		if (shopCoins && window.currentInventory) {
			shopCoins.textContent = window.currentInventory.coins;
		}
	}
	
	// Labyrinth game variables
	let labyrinthCanvas, labyrinthCtx;
	let labyrinthGameState = {
		player: { x: 1, y: 1 },
		foods: [],
		exit: { x: 0, y: 0 },
		collected: { blueberry: 0, acorn: 0 },
		gameSize: 21, // Odd number for proper maze generation
		cellSize: 23, // Smaller cells to fit larger maze
		gameActive: false,
		images: {},
		maze: [] // 2D array representing the maze
	};
	
	// Start Labyrinth game
	function startLabyrinthGame() {
		minigameModal.style.display = 'none';
		labyrinthGame.style.display = 'flex';
		
		// Reset game state
		document.getElementById('labyrinth-result').style.display = 'none';
		labyrinthGameState.collected = { blueberry: 0, acorn: 0 };
		labyrinthGameState.gameActive = true;
		
		// Initialize canvas
		labyrinthCanvas = document.getElementById('labyrinth-canvas');
		labyrinthCtx = labyrinthCanvas.getContext('2d');
		
		// Load images and start game
		loadLabyrinthImages().then(() => {
			initializeLabyrinthGame();
		}).catch(error => {
			console.error('Error loading labyrinth images:', error);
			showLabyrinthResult('Error loading game images', false);
		});
	}
	
	// Load game images
	function loadLabyrinthImages() {
		return new Promise((resolve, reject) => {
			const imagesToLoad = [
				{ key: 'squirrel', src: '/static/img/minigames/lab/squrirrel.png' },
				{ key: 'blueberry', src: '/static/img/minigames/lab/blueberry.png' },
				{ key: 'acorn', src: '/static/img/minigames/lab/acorn.png' }
			];
			
			let loadedCount = 0;
			const totalImages = imagesToLoad.length;
			
			imagesToLoad.forEach(imageInfo => {
				const img = new Image();
				img.onload = () => {
					labyrinthGameState.images[imageInfo.key] = img;
					loadedCount++;
					if (loadedCount === totalImages) {
						resolve();
					}
				};
				img.onerror = () => reject(new Error(`Failed to load ${imageInfo.key}`));
				img.src = imageInfo.src;
			});
		});
	}
	
	// Maze generation using recursive backtracking algorithm
	function generateMaze(size) {
		// Initialize maze with all walls (0 = wall, 1 = path)
		const maze = [];
		for (let y = 0; y < size; y++) {
			maze[y] = [];
			for (let x = 0; x < size; x++) {
				maze[y][x] = 0; // Start with all walls
			}
		}
		
		// Stack for backtracking
		const stack = [];
		
		// Start at position (1, 1) - always odd coordinates for maze generation
		const start = { x: 1, y: 1 };
		maze[start.y][start.x] = 1; // Mark as path
		stack.push(start);
		
		// Directions: up, right, down, left (2 steps to skip walls)
		const directions = [
			{ x: 0, y: -2 }, // up
			{ x: 2, y: 0 },  // right
			{ x: 0, y: 2 },  // down
			{ x: -2, y: 0 }  // left
		];
		
		while (stack.length > 0) {
			const current = stack[stack.length - 1];
			
			// Find unvisited neighbors
			const unvisitedNeighbors = [];
			
			for (let dir of directions) {
				const newX = current.x + dir.x;
				const newY = current.y + dir.y;
				
				// Check bounds and if cell is unvisited (wall)
				if (newX > 0 && newX < size - 1 && 
					newY > 0 && newY < size - 1 && 
					maze[newY][newX] === 0) {
					unvisitedNeighbors.push({ x: newX, y: newY, dir: dir });
				}
			}
			
			if (unvisitedNeighbors.length > 0) {
				// Choose random unvisited neighbor
				const randomNeighbor = unvisitedNeighbors[Math.floor(Math.random() * unvisitedNeighbors.length)];
				
				// Remove wall between current and chosen neighbor
				const wallX = current.x + randomNeighbor.dir.x / 2;
				const wallY = current.y + randomNeighbor.dir.y / 2;
				maze[wallY][wallX] = 1;
				
				// Mark neighbor as visited
				maze[randomNeighbor.y][randomNeighbor.x] = 1;
				
				// Add neighbor to stack
				stack.push({ x: randomNeighbor.x, y: randomNeighbor.y });
			} else {
				// No unvisited neighbors, backtrack
				stack.pop();
			}
		}
		
		return maze;
	}
	
	// Find all accessible cells in the maze
	function getAccessibleCells(maze) {
		const accessibleCells = [];
		for (let y = 0; y < maze.length; y++) {
			for (let x = 0; x < maze[y].length; x++) {
				if (maze[y][x] === 1) { // Path cell
					accessibleCells.push({ x, y });
				}
			}
		}
		return accessibleCells;
	}
	
	// Initialize game board
	function initializeLabyrinthGame() {
		const gameSize = labyrinthGameState.gameSize;
		
		// Generate maze
		labyrinthGameState.maze = generateMaze(gameSize);
		
		// Get all accessible cells
		const accessibleCells = getAccessibleCells(labyrinthGameState.maze);
		
		// Set player starting position (always at 1,1)
		labyrinthGameState.player = { x: 1, y: 1 };
		
		// Find furthest accessible cell from start for exit
		let maxDistance = 0;
		let exitPosition = { x: 1, y: 1 };
		
		for (let cell of accessibleCells) {
			const distance = Math.abs(cell.x - 1) + Math.abs(cell.y - 1); // Manhattan distance
			if (distance > maxDistance) {
				maxDistance = distance;
				exitPosition = cell;
			}
		}
		labyrinthGameState.exit = exitPosition;
		
		// Generate food positions in accessible cells (avoiding player and exit)
		labyrinthGameState.foods = [];
		const availableCells = accessibleCells.filter(cell => 
			!(cell.x === labyrinthGameState.player.x && cell.y === labyrinthGameState.player.y) &&
			!(cell.x === labyrinthGameState.exit.x && cell.y === labyrinthGameState.exit.y)
		);
		
		// Add 2 blueberries and 2 acorns at random accessible positions
		const foodTypes = ['blueberry', 'blueberry', 'acorn', 'acorn'];
		
		foodTypes.forEach(type => {
			if (availableCells.length > 0) {
				const randomIndex = Math.floor(Math.random() * availableCells.length);
				const position = availableCells.splice(randomIndex, 1)[0]; // Remove to avoid duplicates
				position.type = type;
				labyrinthGameState.foods.push(position);
			}
		});
		
		// Update UI
		updateLabyrinthUI();
		
		// Draw initial state
		drawLabyrinthGame();
		
		// Add keyboard listeners
		document.addEventListener('keydown', handleLabyrinthKeydown);
	}
	
	// Handle keyboard input
	function handleLabyrinthKeydown(event) {
		if (!labyrinthGameState.gameActive) return;
		
		const player = labyrinthGameState.player;
		const maze = labyrinthGameState.maze;
		const gameSize = labyrinthGameState.gameSize;
		let newX = player.x;
		let newY = player.y;
		
		switch(event.key) {
			case 'ArrowUp':
				newY = player.y - 1;
				event.preventDefault();
				break;
			case 'ArrowDown':
				newY = player.y + 1;
				event.preventDefault();
				break;
			case 'ArrowLeft':
				newX = player.x - 1;
				event.preventDefault();
				break;
			case 'ArrowRight':
				newX = player.x + 1;
				event.preventDefault();
				break;
			default:
				return;
		}
		
		// Check boundaries and wall collision
		if (newX >= 0 && newX < gameSize && 
			newY >= 0 && newY < gameSize && 
			maze[newY][newX] === 1) { // 1 = path, 0 = wall
			
			// Update player position
			labyrinthGameState.player.x = newX;
			labyrinthGameState.player.y = newY;
			
			// Check for food collection
			checkFoodCollection();
			
			// Check if player reached exit
			if (newX === labyrinthGameState.exit.x && newY === labyrinthGameState.exit.y) {
				checkExitCondition();
			}
			
			// Redraw game
			drawLabyrinthGame();
			
			// Update UI
			updateLabyrinthUI();
		}
		// If move is invalid (wall or boundary), do nothing
	}
	
	// Check if player collected any food
	function checkFoodCollection() {
		const player = labyrinthGameState.player;
		const foodIndex = labyrinthGameState.foods.findIndex(food => 
			food.x === player.x && food.y === player.y
		);
		
		if (foodIndex !== -1) {
			const food = labyrinthGameState.foods[foodIndex];
			labyrinthGameState.collected[food.type]++;
			labyrinthGameState.foods.splice(foodIndex, 1);
		}
	}
	
	// Check if player can exit (all food collected)
	function checkExitCondition() {
		if (labyrinthGameState.foods.length === 0) {
			// All food collected, player can exit
			completeLabyrinthGame();
		} else {
			// Show message that more food needs to be collected
			const remaining = labyrinthGameState.foods.length;
			document.getElementById('remaining-items').textContent = `Collect all ${remaining} items before exiting!`;
			document.getElementById('remaining-items').style.color = '#ff6b6b';
			
			// Reset color after 2 seconds
			setTimeout(() => {
				document.getElementById('remaining-items').style.color = '';
				updateLabyrinthUI();
			}, 2000);
		}
	}
	
	// Update UI elements
	function updateLabyrinthUI() {
		document.getElementById('blueberry-count').textContent = `🫐 × ${labyrinthGameState.collected.blueberry}`;
		document.getElementById('acorn-count').textContent = `🌰 × ${labyrinthGameState.collected.acorn}`;
		document.getElementById('remaining-items').textContent = `Items left: ${labyrinthGameState.foods.length}`;
	}
	
	// Draw the game
	function drawLabyrinthGame() {
		const ctx = labyrinthCtx;
		const cellSize = labyrinthGameState.cellSize;
		const gameSize = labyrinthGameState.gameSize;
		const maze = labyrinthGameState.maze;
		
		// Clear canvas
		ctx.clearRect(0, 0, labyrinthCanvas.width, labyrinthCanvas.height);
		
		// Draw maze
		for (let y = 0; y < gameSize; y++) {
			for (let x = 0; x < gameSize; x++) {
				const cellX = x * cellSize;
				const cellY = y * cellSize;
				
				if (maze[y][x] === 1) {
					// Path - light color
					ctx.fillStyle = '#f0f8ff';
				} else {
					// Wall - dark color
					ctx.fillStyle = '#2c3e50';
				}
				
				ctx.fillRect(cellX, cellY, cellSize, cellSize);
			}
		}
		
		// Draw exit (bright green square)
		const exit = labyrinthGameState.exit;
		ctx.fillStyle = '#27ae60';
		ctx.fillRect(exit.x * cellSize + 2, exit.y * cellSize + 2, cellSize - 4, cellSize - 4);
		
		// Draw exit symbol
		ctx.fillStyle = 'white';
		ctx.font = `${cellSize * 0.6}px Arial`;
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText('🚪', exit.x * cellSize + cellSize/2, exit.y * cellSize + cellSize/2);
		
		// Draw borders around the entire maze
		ctx.strokeStyle = '#333';
		ctx.lineWidth = 3;
		ctx.strokeRect(0, 0, gameSize * cellSize, gameSize * cellSize);
		
		// Draw food items
		labyrinthGameState.foods.forEach(food => {
			const img = labyrinthGameState.images[food.type];
			if (img) {
				ctx.drawImage(img, food.x * cellSize + 1, food.y * cellSize + 1, cellSize - 2, cellSize - 2);
			}
		});
		
		// Draw player (squirrel) with slight padding
		const player = labyrinthGameState.player;
		const squirrelImg = labyrinthGameState.images.squirrel;
		if (squirrelImg) {
			ctx.drawImage(squirrelImg, player.x * cellSize + 1, player.y * cellSize + 1, cellSize - 2, cellSize - 2);
		}
	}
	
	// Complete the game
	function completeLabyrinthGame() {
		labyrinthGameState.gameActive = false;
		document.removeEventListener('keydown', handleLabyrinthKeydown);
		
		const totalCollected = labyrinthGameState.collected.blueberry + labyrinthGameState.collected.acorn;
		
		// Send results to server
		sendLabyrinthResults();
		
		// Show completion message
		showLabyrinthResult(`Congratulations! You collected all ${totalCollected} items and escaped the maze!`, true);
	}
	
	// Send results to server
	function sendLabyrinthResults() {
		fetch('/api/minigame/labyrinth', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				collected: labyrinthGameState.collected
			})
		})
		.then(response => response.json())
		.then(data => {
			if (data.success) {
				document.getElementById('labyrinth-reward').textContent = data.reward_message;
				
				// Update inventory display if available
				if (data.inventory && window.updateInventoryDisplay) {
					window.updateInventoryDisplay(data.inventory);
				}
			}
		})
		.catch(error => {
			console.error('Error sending labyrinth results:', error);
		});
	}
	
	// Show game result
	function showLabyrinthResult(message, success) {
		document.getElementById('labyrinth-message').textContent = message;
		document.getElementById('labyrinth-message').className = success ? 'result-message success' : 'result-message error';
		document.getElementById('labyrinth-result').style.display = 'block';
	}
	
	// Close Labyrinth game
	closeLabyrinthBtn.addEventListener('click', function() {
		labyrinthGame.style.display = 'none';
		labyrinthGameState.gameActive = false;
		document.removeEventListener('keydown', handleLabyrinthKeydown);
	});
	
	// Close game when clicking outside
	labyrinthGame.addEventListener('click', function(e) {
		if (e.target === labyrinthGame) {
			labyrinthGame.style.display = 'none';
			labyrinthGameState.gameActive = false;
			document.removeEventListener('keydown', handleLabyrinthKeydown);
		}
	});
	
	// Play again button for labyrinth
	document.getElementById('labyrinth-play-again').addEventListener('click', function() {
		// Reset and restart the game
		document.getElementById('labyrinth-result').style.display = 'none';
		labyrinthGameState.collected = { blueberry: 0, acorn: 0 };
		labyrinthGameState.gameActive = true;
		initializeLabyrinthGame();
	});
	
	// Exit button for labyrinth
	document.getElementById('labyrinth-exit').addEventListener('click', function() {
		labyrinthGame.style.display = 'none';
		labyrinthGameState.gameActive = false;
		document.removeEventListener('keydown', handleLabyrinthKeydown);
		document.getElementById('labyrinth-result').style.display = 'none';
	});

	// Make updateMinigameButtonFromStats available globally
	window.updateMinigameButtonFromStats = updateMinigameButtonFromStats;
});

window.addEventListener('load', () => {
	initializeStatBars();
	new Phaser.Game(config);
});



