/* global Phaser */

const GAME_WIDTH = 800;
const GAME_HEIGHT = 600;

const config = {
	type: Phaser.AUTO,
	parent: 'game-container',
	width: GAME_WIDTH,
	height: GAME_HEIGHT,
	backgroundColor: '#87ceeb', // sky blue
	scene: { preload, create, update }
};

let pet;
let petType = 'hedgehog'; // default, will be updated from server
let gameScene;
let currentPetState = 'idle';

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
		sleeping: 'squirrel_sleeping'
	}
};

// Pet colors based on type (fallback for missing sprites)
const PET_COLORS = {
	hedgehog: 0x8b4513, // brown
	hamster: 0xdaa520,  // golden
	squirrel: 0xa0522d  // sienna
};

function preload() {
	console.log('Preloading sprites...');
	
	// Load squirrel sprites
	this.load.image('squirrel_idle', '/static/sprites/squirrel_idle.png');
	this.load.image('squirrel_happy', '/static/sprites/squirrel_happy.png');
	this.load.image('squirrel_hungry', '/static/sprites/squirrel_hungry.png');
	this.load.image('squirrel_sleeping', '/static/sprites/squirrel_sleeping.png');
	
	console.log('Squirrel sprites loaded');
	
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
		// Use real squirrel sprite
		console.log('Creating squirrel sprite...');
		pet = this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'squirrel_idle');
		pet.setScale(1);
		console.log('Squirrel sprite created:', pet);
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
	// Update stats every minute (60000ms)
	setInterval(async () => {
		try {
			const response = await fetch('/api/pet/stats');
			const data = await response.json();
			
			if (data.success) {
				updateStatsDisplay(data.stats);
			}
		} catch (error) {
			console.error('Auto-update failed:', error);
		}
	}, 60000); // 60 seconds
}

async function loadCurrentStats() {
	try {
		const response = await fetch('/api/pet/stats');
		const data = await response.json();
		
		if (data.success) {
			updateStatsDisplay(data.stats);
		}
	} catch (error) {
		console.error('Failed to load stats:', error);
	}
}

function setupActionButtons() {
	const actionButtons = document.querySelectorAll('.action-btn');
	
	actionButtons.forEach(button => {
		button.addEventListener('click', function() {
			const action = this.dataset.action;
			handleAction(action);
		});
	});
	
	// Setup test buttons
	const testButtons = document.querySelectorAll('.test-btn');
	
	testButtons.forEach(button => {
		button.addEventListener('click', function() {
			const testType = this.dataset.test;
			handleTestAction(testType);
		});
	});
}

async function handleAction(action) {
	// Get the button
	const button = document.querySelector(`[data-action="${action}"]`);
	
	// Check if button is already disabled
	if (button && button.disabled) {
		console.log(`Action ${action} is disabled`);
		return;
	}
	
	// Immediately check if the action should be allowed based on current stats
	const actionToStat = {
		'feed': { stat: 'hunger', threshold: 80 },
		'play': { stat: 'happiness', threshold: 75 }, 
		'bath': { stat: 'cleanliness', threshold: 80 },
		'sleep': { stat: 'energy', threshold: 50 }
	};
	
	const statConfig = actionToStat[action];
	if (statConfig) {
		// Get current stat value from the UI
		const statBars = document.querySelectorAll('.stat-bar');
		let currentStatValue = null;
		
		for (const bar of statBars) {
			const label = bar.querySelector('label');
			if (label && label.textContent.toLowerCase() === statConfig.stat) {
				const valueSpan = bar.querySelector('span');
				if (valueSpan) {
					currentStatValue = parseInt(valueSpan.textContent);
					break;
				}
			}
		}
		
		// Check if stat is above threshold
		if (currentStatValue !== null && currentStatValue > statConfig.threshold) {
			console.log(`Action ${action} blocked - ${statConfig.stat} is ${currentStatValue}% (threshold: ${statConfig.threshold}%)`);
			// Update button state immediately
			updateButtonStates({ [statConfig.stat]: currentStatValue });
			return;
		}
	}
	
	// Disable button during action
	if (button) {
		button.disabled = true;
		button.style.opacity = '0.6';
	}
	
	try {
		// Show action animation
		playActionAnimation(action);
		
		// Send AJAX request
		const response = await fetch('/api/pet/action', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ action: action })
		});
		
		const data = await response.json();
		
		if (data.success) {
			// Update all stats and pet appearance
			updateStatsDisplay(data.stats);
			
			// Show success feedback
			showActionFeedback(action, true);
		} else {
			showActionFeedback(action, false, data.error);
		}
	} catch (error) {
		console.error('Action failed:', error);
		showActionFeedback(action, false, 'Network error');
	} finally {
		// Re-enable button
		if (button) {
			button.disabled = false;
			button.style.opacity = '1';
		}
	}
}

async function handleTestAction(testType) {
	// Disable button during action
	const button = document.querySelector(`[data-test="${testType}"]`);
	if (button) {
		button.disabled = true;
		button.style.opacity = '0.6';
	}
	
	try {
		// Send AJAX request to reduce stats
		const response = await fetch('/api/pet/test-action', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ test_action: testType })
		});
		
		const data = await response.json();
		
		if (data.success) {
			// Update the specific stat that changed
			if (data.stats) {
				updateStatsDisplay(data.stats);
			}
			
			// Show success feedback
			showActionFeedback(testType.replace('-', ' '), true);
		} else {
			showActionFeedback(testType.replace('-', ' '), false, data.error);
		}
	} catch (error) {
		console.error('Test action failed:', error);
		showActionFeedback(testType.replace('-', ' '), false, 'Network error');
	} finally {
		// Re-enable button
		if (button) {
			button.disabled = false;
			button.style.opacity = '1';
		}
	}
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
			
		case 'bath':
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
		const statBars = document.querySelectorAll('.stat-bar');
		let targetBar = null;
		
		for (const bar of statBars) {
			const label = bar.querySelector('label');
			if (label && label.textContent.toLowerCase() === statName) {
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
}

function updateButtonStates(stats) {
	// Define which action corresponds to which stat and their thresholds
	const actionToStat = {
		'feed': { stat: 'hunger', threshold: 80 },
		'play': { stat: 'happiness', threshold: 75 }, 
		'bath': { stat: 'cleanliness', threshold: 80 },
		'sleep': { stat: 'energy', threshold: 50 }
	};
	
	// Check each action button
	Object.keys(actionToStat).forEach(action => {
		const statConfig = actionToStat[action];
		const statName = statConfig.stat;
		const threshold = statConfig.threshold;
		const statValue = stats[statName];
		const button = document.querySelector(`[data-action="${action}"]`);
		
		if (button && statValue !== undefined) {
			// Disable button if stat is above its threshold
			if (statValue > threshold) {
				button.disabled = true;
				button.style.opacity = '0.5';
				button.style.cursor = 'not-allowed';
				button.title = `${statName.charAt(0).toUpperCase() + statName.slice(1)} is too high (${statValue}%). Wait until it drops to ${threshold}% or below.`;
				console.log(`Disabled ${action} button - ${statName} is ${statValue}% (threshold: ${threshold}%)`);
			} else {
				button.disabled = false;
				button.style.opacity = '1';
				button.style.cursor = 'pointer';
				button.title = `Use ${action} to improve ${statName}`;
				console.log(`Enabled ${action} button - ${statName} is ${statValue}% (threshold: ${threshold}%)`);
			}
		}
	});
}

function updatePetAppearance(stats) {
	if (!pet || petType !== 'squirrel') return;
	
	// Determine pet state based on stats
	let newState = 'idle';
	
	// Priority order: sleeping > hungry > happy > idle
	
	// 1. Check if energy is lower than 30 (sleeping takes priority)
	if (stats.energy < 30) {
		newState = 'sleeping';
	}
	// 2. Check if hunger is lower than 50 (but energy is 30 or higher)
	else if (stats.hunger < 50) {
		newState = 'hungry';
	}
	// 3. Check if ALL stats are 80 or higher (happy state)
	else if (stats.hunger >= 80 && stats.happiness >= 80 && stats.cleanliness >= 80 && stats.energy >= 80) {
		newState = 'happy';
	}
	// 4. Default to idle state
	else {
		newState = 'idle';
	}
	
	// Only change if state actually changed
	if (newState !== currentPetState) {
		changePetState(newState);
	}
}

function changePetState(newState) {
	if (!pet || petType !== 'squirrel') {
		console.log('Cannot change pet state:', { pet: !!pet, petType, newState });
		return;
	}
	
	console.log('Changing pet state from', currentPetState, 'to', newState);
	currentPetState = newState;
	const spriteKey = PET_SPRITES[petType][newState];
	
	console.log('Sprite key:', spriteKey, 'Texture exists:', gameScene.textures.exists(spriteKey));
	
	if (spriteKey && gameScene.textures.exists(spriteKey)) {
		pet.setTexture(spriteKey);
		console.log('Texture changed to:', spriteKey);
		
		// Add a subtle transition effect
		pet.setAlpha(0.8);
		gameScene.tweens.add({
			targets: pet,
			alpha: 1,
			duration: 200,
			ease: 'Power2'
		});
	} else {
		console.log('Failed to change texture:', { spriteKey, exists: gameScene.textures.exists(spriteKey) });
	}
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

window.addEventListener('load', () => {
	new Phaser.Game(config);
});


