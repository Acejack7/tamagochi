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
let foodDisplaySprite = null; // For showing food images
let foodDisplayTimer = null; // For timing food display

// Sleep state management
let sleepTimer = null;
let sleepEndTime = null;
let isSleeping = false;
let autoUpdateTimer = null;

// Test function to force sleep visibility
function testSleep() {
	console.log('🧪 TESTING SLEEP - forcing sleep overlay');
	const now = new Date();
	const endTime = new Date(now.getTime() + 60000); // 1 minute from now
	
	// Force the sleeping state
	isSleeping = false; // Reset first
	console.log('🔧 Force calling showSleepOverlay...');
	showSleepOverlay('nap', endTime.toISOString());
	
	// Verify it's set
	setTimeout(() => {
		console.log('🔍 Sleep state after 1 second:', {
			isSleeping,
			sleepEndTime,
			simpleBarVisible: document.getElementById('simple-sleep-bar')?.style.display
		});
	}, 1000);
}

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

// Global inventory state
let currentInventory = {
	tree_seed: 0,
	blueberries: 0,
	mushroom: 0
};

function preload() {
	console.log('Preloading sprites...');
	
	// Load squirrel sprites
	this.load.image('squirrel_idle', '/static/sprites/squirrel_idle.png');
	this.load.image('squirrel_happy', '/static/sprites/squirrel_happy.png');
	this.load.image('squirrel_hungry', '/static/sprites/squirrel_hungry.png');
	this.load.image('squirrel_sleeping', '/static/sprites/squirrel_sleeping.png');
	
	// Load food images
	this.load.image('mushroom', '/static/img/mushroom.png');
	this.load.image('blueberries', '/static/img/blueberry.png');
	this.load.image('tree_seed', '/static/img/tree_seed.png');
	
	// Load sleep images
	this.load.image('squirrel_sofa', '/static/img/squirrel_sofa.png');
	this.load.image('squirrel_bed', '/static/img/squirrel_bed.png');
	
	console.log('Squirrel sprites and food images loaded');
	
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
			
			// Update inventory
			if (data.inventory) {
				updateInventoryDisplay(data.inventory);
			}
			
			// Check if pet is sleeping and show overlay
			console.log('📊 loadCurrentStats - checking sleep state:', {
				backendSleeping: data.is_sleeping,
				frontendSleeping: isSleeping,
				sleepType: data.sleep_type,
				sleepEndTime: data.sleep_end_time,
				sleepStartTime: data.sleep_start_time
			});
			
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
			console.log('📊 loadCurrentStats - checking wash state:', {
				backendWashing: data.is_washing,
				frontendWashing: isWashing,
				washType: data.wash_type,
				washEndTime: data.wash_end_time,
				washStartTime: data.wash_start_time
			});
			
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
	const actionButtons = document.querySelectorAll('.action-btn');
	
	actionButtons.forEach(button => {
		button.addEventListener('click', function() {
			const action = this.dataset.action;
			if (action === 'feed') {
				showFoodMenu();
			} else if (action === 'sleep') {
				showSleepMenu();
			} else if (action === 'wash') {
				showWashMenu();
			} else {
				handleAction(action);
			}
		});
	});
	
	// Setup food menu buttons
	const foodButtons = document.querySelectorAll('.food-btn');
	foodButtons.forEach(button => {
		button.addEventListener('click', function() {
			const foodType = this.dataset.food;
			handleFeedAction(foodType);
		});
	});
	
	// Setup cancel button
	const cancelButton = document.getElementById('cancel-food');
	if (cancelButton) {
		cancelButton.addEventListener('click', hideFoodMenu);
	}
	
	// Setup sleep menu buttons
	const sleepButtons = document.querySelectorAll('.sleep-btn');
	sleepButtons.forEach(button => {
		button.addEventListener('click', function() {
			const sleepType = this.dataset.sleep;
			handleSleepAction(sleepType);
		});
	});
	
	// Setup cancel sleep button
	const cancelSleepButton = document.getElementById('cancel-sleep');
	if (cancelSleepButton) {
		cancelSleepButton.addEventListener('click', hideSleepMenu);
	}
	
	// Setup wash menu buttons
	const washButtons = document.querySelectorAll('.wash-btn');
	washButtons.forEach(button => {
		button.addEventListener('click', function() {
			const washType = this.dataset.wash;
			handleWashAction(washType);
		});
	});
	
	// Setup cancel wash button
	const cancelWashButton = document.getElementById('cancel-wash');
	if (cancelWashButton) {
		cancelWashButton.addEventListener('click', hideWashMenu);
	}
	
	// Setup storage button
	const storageButton = document.getElementById('storage-btn');
	if (storageButton) {
		storageButton.addEventListener('click', showStorageModal);
	}

	// Setup close storage button
	const closeStorageButton = document.getElementById('close-storage');
	if (closeStorageButton) {
		closeStorageButton.addEventListener('click', hideStorageModal);
	}

	// Setup storage modal click outside to close
	const storageModal = document.getElementById('storage-modal');
	if (storageModal) {
		storageModal.addEventListener('click', function(e) {
			if (e.target === storageModal) {
				hideStorageModal();
			}
		});
	}

	// Setup shop button
	const shopButton = document.getElementById('shop-btn');
	if (shopButton) {
		shopButton.addEventListener('click', showShopModal);
	}

	// Setup close shop button
	const closeShopButton = document.getElementById('close-shop');
	if (closeShopButton) {
		closeShopButton.addEventListener('click', hideShopModal);
	}

	// Setup shop modal click outside to close
	const shopModal = document.getElementById('shop-modal');
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
		'wash': { stat: 'cleanliness', threshold: 85 },
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

async function handleFeedAction(foodType) {
	// Hide the food menu
	hideFoodMenu();
	
	// Get the feed button
	const button = document.querySelector('[data-action="feed"]');
	
	// Check if button is already disabled
	if (button && button.disabled) {
		console.log('Feed action is disabled');
		return;
	}
	
	// Check if hunger is above threshold
	const statBars = document.querySelectorAll('.stat-bar');
	let currentHunger = null;
	
	for (const bar of statBars) {
		const label = bar.querySelector('label');
		if (label && label.textContent.toLowerCase() === 'hunger') {
			const valueSpan = bar.querySelector('span');
			if (valueSpan) {
				currentHunger = parseInt(valueSpan.textContent);
				break;
			}
		}
	}
	
	if (currentHunger !== null && currentHunger > 80) {
		console.log(`Feed action blocked - hunger is ${currentHunger}% (threshold: 80%)`);
		updateButtonStates({ hunger: currentHunger });
		return;
	}
	
	// Disable button during action
	if (button) {
		button.disabled = true;
		button.style.opacity = '0.6';
	}
	
	try {
		// Show food image for 3 seconds
		showFoodImage(foodType);
		
		// Send AJAX request
		const response = await fetch('/api/pet/action', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ action: 'feed', food_type: foodType })
		});
		
		const data = await response.json();
		
		if (data.success) {
			// Update all stats and pet appearance
			updateStatsDisplay(data.stats);
			
			// Update inventory display
			if (data.inventory) {
				updateInventoryDisplay(data.inventory);
			}
			
			// Show success feedback
			showActionFeedback(`Fed ${foodType}`, true);
		} else {
			showActionFeedback('Feed', false, data.error);
		}
	} catch (error) {
		console.error('Feed action failed:', error);
		showActionFeedback('Feed', false, 'Network error');
	} finally {
		// Re-enable button
		if (button) {
			button.disabled = false;
			button.style.opacity = '1';
		}
	}
}

async function handleSleepAction(sleepType) {
	// Hide the sleep menu
	hideSleepMenu();
	
	// Get the sleep button
	const button = document.querySelector('[data-action="sleep"]');
	
	// Check if button is already disabled
	if (button && button.disabled) {
		console.log('Sleep action is disabled');
		return;
	}
	
	// Check energy-based restrictions
	const statBars = document.querySelectorAll('.stat-bar');
	let currentEnergy = null;
	
	for (const bar of statBars) {
		const label = bar.querySelector('label');
		if (label && label.textContent.toLowerCase() === 'energy') {
			const valueSpan = bar.querySelector('span');
			if (valueSpan) {
				currentEnergy = parseInt(valueSpan.textContent);
				break;
			}
		}
	}
	
	// Check restrictions: Nap (0-50), Sleep (0-30 only)
	if (currentEnergy !== null) {
		if (sleepType === 'nap' && currentEnergy > 50) {
			console.log(`Nap action blocked - energy is ${currentEnergy}% (max: 50%)`);
			showActionFeedback('Nap', false, 'Energy is too high for a nap');
			return;
		}
		if (sleepType === 'sleep' && currentEnergy > 30) {
			console.log(`Sleep action blocked - energy is ${currentEnergy}% (max: 30%)`);
			showActionFeedback('Sleep', false, 'Energy is too high for sleep');
			return;
		}
	}
	
	// Disable button during action
	if (button) {
		button.disabled = true;
		button.style.opacity = '0.6';
	}
	
	try {
		// Show sleep image for 3 seconds
		showSleepImage(sleepType);
		
		// Send AJAX request
		const response = await fetch('/api/pet/action', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ action: 'sleep', sleep_type: sleepType })
		});
		
		const data = await response.json();
		
		console.log('🔍 SLEEP ACTION RESPONSE:', data);
		
		if (data.success) {
			// Show sleep overlay FIRST, before updating stats
			console.log(`🛌 Checking sleep state: is_sleeping=${data.is_sleeping}, sleep_end_time=${data.sleep_end_time}`);
			if (data.is_sleeping && data.sleep_end_time) {
				console.log('✅ Triggering sleep overlay...');
				showSleepOverlay(data.sleep_type, data.sleep_end_time);
			} else {
				console.log('❌ NOT showing sleep overlay - missing data');
			}
			
			// Update all stats and pet appearance AFTER showing overlay
			updateStatsDisplay(data.stats);
			
			// Show success feedback
			showActionFeedback(`${sleepType.charAt(0).toUpperCase() + sleepType.slice(1)} started`, true);
		} else {
			showActionFeedback('Sleep', false, data.error);
		}
	} catch (error) {
		console.error('Sleep action failed:', error);
		showActionFeedback('Sleep', false, 'Network error');
	} finally {
		// Re-enable button
		if (button) {
			button.disabled = false;
			button.style.opacity = '1';
		}
	}
}

function showFoodMenu() {
	const foodMenu = document.getElementById('food-menu');
	if (foodMenu) {
		// Update food button states before showing menu
		updateFoodButtonStates();
		foodMenu.style.display = 'block';
	}
}

function hideFoodMenu() {
	const foodMenu = document.getElementById('food-menu');
	if (foodMenu) {
		foodMenu.style.display = 'none';
	}
}

function showSleepMenu() {
	const sleepMenu = document.getElementById('sleep-menu');
	if (sleepMenu) {
		sleepMenu.style.display = 'block';
	}
}

function hideSleepMenu() {
	const sleepMenu = document.getElementById('sleep-menu');
	if (sleepMenu) {
		sleepMenu.style.display = 'none';
	}
}

function showWashMenu() {
	const washMenu = document.getElementById('wash-menu');
	if (washMenu) {
		washMenu.style.display = 'block';
	}
}

function hideWashMenu() {
	const washMenu = document.getElementById('wash-menu');
	if (washMenu) {
		washMenu.style.display = 'none';
	}
}

async function handleWashAction(washType) {
	// Hide the wash menu
	hideWashMenu();
	
	// Get the wash button
	const button = document.querySelector('[data-action="wash"]');
	
	// Check if button is already disabled
	if (button && button.disabled) {
		console.log('Wash action is disabled');
		return;
	}
	
	// Check cleanliness-based restrictions
	const statBars = document.querySelectorAll('.stat-bar');
	let currentCleanliness = null;
	
	for (const bar of statBars) {
		const label = bar.querySelector('label');
		if (label && label.textContent.toLowerCase() === 'cleanliness') {
			const valueSpan = bar.querySelector('span');
			if (valueSpan) {
				currentCleanliness = parseInt(valueSpan.textContent);
				break;
			}
		}
	}
	
	// Check restrictions: All wash types require cleanliness 85 or lower
	if (currentCleanliness !== null && currentCleanliness > 85) {
		console.log(`Wash action blocked - cleanliness is ${currentCleanliness}% (max: 85%)`);
		showActionFeedback('Wash', false, 'Cleanliness is too high for washing');
		return;
	}
	
	// Disable button during action
	if (button) {
		button.disabled = true;
		button.style.opacity = '0.6';
	}
	
	try {
		// Show wash image for 3 seconds
		showWashImage(washType);
		
		// Send AJAX request
		const response = await fetch('/api/pet/action', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ action: 'wash', wash_type: washType })
		});
		
		const data = await response.json();
		
		console.log('🔍 WASH ACTION RESPONSE:', data);
		
		if (data.success) {
			// Show wash overlay FIRST, before updating stats
			console.log(`🚿 Checking wash state: is_washing=${data.is_washing}, wash_end_time=${data.wash_end_time}`);
			if (data.is_washing && data.wash_end_time) {
				console.log('✅ Triggering wash overlay...');
				showWashOverlay(data.wash_type, data.wash_end_time);
			} else {
				console.log('❌ NOT showing wash overlay - missing data');
			}
			
			// Update all stats and pet appearance AFTER showing overlay
			updateStatsDisplay(data.stats);
			
			// Show success feedback
			showActionFeedback(`${washType.replace('_', ' ').charAt(0).toUpperCase() + washType.replace('_', ' ').slice(1)} started`, true);
		} else {
			showActionFeedback('Wash', false, data.error);
		}
	} catch (error) {
		console.error('Wash action failed:', error);
		showActionFeedback('Wash', false, 'Network error');
	} finally {
		// Re-enable button
		if (button) {
			button.disabled = false;
			button.style.opacity = '1';
		}
	}
}

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
	
	// Check for auto-sleep when energy reaches 0 (but only if not already sleeping)
	if (stats.energy <= 0 && !isSleeping) {
		console.log('Energy reached 0, triggering auto-sleep');
		autoSleep();
	}
}

function updateButtonStates(stats) {
	// Define which action corresponds to which stat and their thresholds
	const actionToStat = {
		'feed': { stat: 'hunger', threshold: 80 },
		'play': { stat: 'happiness', threshold: 75 },
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
	
	const now = new Date();
	const timeRemaining = sleepEndTime - now;
	
	console.log(`🕐 Sleep check: now=${now.toISOString()}, end=${sleepEndTime.toISOString()}, remaining=${timeRemaining}ms`);
	
	if (timeRemaining <= 0) {
		// Sleep finished
		console.log('⏰ Sleep timer finished - hiding overlay');
		hideSleepOverlay();
		// DON'T call loadCurrentStats() here - it causes infinite loop
		return;
	}
	
	// Calculate progress - we need to track total duration
	// For now, estimate based on sleep type (1 min nap, 2 min sleep)
	const sleepType = document.getElementById('sleep-title').textContent.toLowerCase();
	const totalDurationMs = sleepType.includes('nap') ? 60000 : 120000; // 1 or 2 minutes
	const elapsedMs = totalDurationMs - timeRemaining;
	const progressPercent = Math.min(100, Math.max(0, (elapsedMs / totalDurationMs) * 100));
	
	// Update simple progress bar (most important - always visible)
	const simpleProgressFill = document.getElementById('simple-progress-fill');
	const simpleCountdown = document.getElementById('simple-sleep-countdown');
	
	// Format time for display
	const minutes = Math.floor(timeRemaining / 60000);
	const seconds = Math.floor((timeRemaining % 60000) / 1000);
	const timeString = `${minutes}:${seconds.toString().padStart(2, '0')}`;
	
	if (simpleProgressFill) {
		simpleProgressFill.style.width = `${progressPercent}%`;
		// Temporarily disable progress logging to clean console
		// if (Math.round(progressPercent) % 10 === 0) {
		// 	console.log(`⏱️ Progress: ${Math.round(progressPercent)}% | Time: ${timeString}`);
		// }
	}
	if (simpleCountdown) {
		simpleCountdown.textContent = timeString;
	}
	
	// Update main progress bar
	const progressFill = document.getElementById('sleep-progress-fill');
	const progressText = document.getElementById('sleep-progress-text');
	if (progressFill && progressText) {
		progressFill.style.width = `${progressPercent}%`;
		progressText.textContent = `${Math.round(progressPercent)}%`;
	}
	
	// Update main timer
	const timerElement = document.getElementById('sleep-timer');
	if (timerElement) {
		timerElement.textContent = `Time remaining: ${timeString}`;
	}
}

// Wash state management
let washTimer = null;
let washEndTime = null;
let isWashing = false;

function showWashOverlay(washType, endTime, startTime = null) {
	console.log(`🚿 SHOWING WASH OVERLAY: ${washType} until ${endTime}`);
	console.log(`🕐 Current time: ${new Date()}`);
	console.log(`📍 Called from:`, new Error().stack.split('\n')[2]);
	
	isWashing = true;
	
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
	
	const now = new Date();
	const timeRemaining = washEndTime - now;
	
	console.log(`🕐 Wash check: now=${now.toISOString()}, end=${washEndTime.toISOString()}, remaining=${timeRemaining}ms`);
	
	if (timeRemaining <= 0) {
		// Wash finished
		console.log('⏰ Wash timer finished - hiding overlay');
		hideWashOverlay();
		// DON'T call loadCurrentStats() here - it causes infinite loop
		return;
	}
	
	// Calculate progress - we need to track total duration
	const washType = document.getElementById('wash-title').textContent.toLowerCase();
	const totalDurationMs = washType.includes('hands') ? 5000 : washType.includes('shower') ? 20000 : 30000; // 5s, 20s, 30s
	const elapsedMs = totalDurationMs - timeRemaining;
	const progressPercent = Math.min(100, Math.max(0, (elapsedMs / totalDurationMs) * 100));
	
	// Update main progress bar
	const progressFill = document.getElementById('wash-progress-fill');
	const progressText = document.getElementById('wash-progress-text');
	if (progressFill && progressText) {
		progressFill.style.width = `${progressPercent}%`;
		progressText.textContent = `${Math.round(progressPercent)}%`;
	}
	
	// Format time for display
	const minutes = Math.floor(timeRemaining / 60000);
	const seconds = Math.floor((timeRemaining % 60000) / 1000);
	const timeString = `${minutes}:${seconds.toString().padStart(2, '0')}`;
	
	// Update main timer
	const timerElement = document.getElementById('wash-timer');
	if (timerElement) {
		timerElement.textContent = `Time remaining: ${timeString}`;
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

function disableAllActions(disabled) {
	const actionButtons = document.querySelectorAll('.action-btn');
	const shopButton = document.getElementById('shop-btn');
	const testButtons = document.querySelectorAll('.test-btn');

	actionButtons.forEach(button => {
		button.disabled = disabled;
		button.style.opacity = disabled ? '0.5' : '1';
		if (disabled) {
			if (isSleeping) {
				button.title = 'Pet is sleeping - actions disabled';
			} else if (isWashing) {
				button.title = 'Pet is washing - actions disabled';
			}
		}
	});

	// Disable shop button during sleep or washing
	if (shopButton) {
		shopButton.disabled = disabled;
		shopButton.style.opacity = disabled ? '0.5' : '1';
		if (disabled) {
			if (isSleeping) {
				shopButton.title = 'Cannot shop while pet is sleeping';
			} else if (isWashing) {
				shopButton.title = 'Cannot shop while pet is washing';
			}
		}
	}

	testButtons.forEach(button => {
		button.disabled = disabled;
		button.style.opacity = disabled ? '0.5' : '1';
	});
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
	// Check if pet is sleeping
	if (isSleeping) {
		showActionFeedback('Cannot shop while pet is sleeping', false);
		return;
	}

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

window.addEventListener('load', () => {
	initializeStatBars();
	new Phaser.Game(config);
});



