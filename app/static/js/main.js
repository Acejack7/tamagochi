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

// Pet colors based on type
const PET_COLORS = {
	hedgehog: 0x8b4513, // brown
	hamster: 0xdaa520,  // golden
	squirrel: 0xa0522d  // sienna
};

function preload() {
	// No external assets for now; we'll generate textures dynamically
}

function create() {
	gameScene = this;
	
	// Get pet type from the page (if available)
	const petTypeElement = document.querySelector('h1');
	if (petTypeElement && petTypeElement.textContent.includes('hedgehog')) {
		petType = 'hedgehog';
	} else if (petTypeElement && petTypeElement.textContent.includes('hamster')) {
		petType = 'hamster';
	} else if (petTypeElement && petTypeElement.textContent.includes('squirrel')) {
		petType = 'squirrel';
	}

	// Create pet texture based on type
	const graphics = this.add.graphics({ fillStyle: { color: PET_COLORS[petType] || PET_COLORS.hedgehog } });
	const radius = 60;
	graphics.fillCircle(radius, radius, radius);
	graphics.generateTexture('pet', radius * 2, radius * 2);
	graphics.destroy();

	pet = this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'pet');
	pet.setScale(1);

	// Simple breathing animation
	this.tweens.add({
		targets: pet,
		scale: 1.06,
		duration: 900,
		yoyo: true,
		repeat: -1,
		ease: 'Sine.easeInOut'
	});

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
}

async function handleAction(action) {
	// Disable button during action
	const button = document.querySelector(`[data-action="${action}"]`);
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
			// Update only the specific stat that changed
			const actionToStat = {
				'feed': 'hunger',
				'play': 'happiness', 
				'bath': 'cleanliness',
				'sleep': 'energy'
			};
			
			const changedStat = actionToStat[action];
			if (changedStat && data.stats[changedStat] !== undefined) {
				updateSingleStat(changedStat, data.stats[changedStat]);
			}
			
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
	
	// Resume breathing animation after action
	setTimeout(() => {
		if (pet) {
			gameScene.tweens.add({
				targets: pet,
				scale: 1.06,
				duration: 900,
				yoyo: true,
				repeat: -1,
				ease: 'Sine.easeInOut'
			});
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


