"""
Configuration constants for the Tamagochi game.
Centralizes all magic numbers and configuration values.
"""

# Pet Types
PET_TYPES = ["hedgehog", "hamster", "squirrel"]
FOOD_TYPES = ["tree_seed", "blueberries", "mushroom", "acorn"]

# Stat Configuration
STAT_DECAY_RATES = {
    'normal': 8.33,      # Points per hour during normal activity
    'sleeping': 4.17     # Points per hour during sleep (slower decay)
}

STAT_LIMITS = {
    'min': 0,
    'max': 100
}

# Action Thresholds - When actions become unavailable
ACTION_THRESHOLDS = {
    'feed': {'stat': 'hunger', 'max': 80},
    'play': {'stat': 'happiness', 'max': 89},
    'wash': {'stat': 'cleanliness', 'max': 85},
    'sleep_nap': {'stat': 'energy', 'max': 50},
    'sleep_full': {'stat': 'energy', 'max': 30},
    'minigame': {'stat': 'happiness', 'min': 40}
}

# Food Configuration
FOOD_VALUES = {
    "mushroom": 10,
    "blueberries": 15,
    "tree_seed": 5,
    "acorn": 25
}

# Sleep Configuration
SLEEP_DURATIONS = {
    'nap': {
        'minutes': 1,      # TODO: Change to 60 for production
        'energy_restore': 25
    },
    'sleep': {
        'minutes': 2,      # TODO: Change to 480 (8 hours) for production
        'energy_restore': 100  # Always restore to 100 for full sleep
    }
}

# Wash Configuration
WASH_VALUES = {
    "wash_hands": 15,
    "shower": 60,
    "bath": 80
}

WASH_DURATIONS = {
    "wash_hands": 5,    # seconds
    "shower": 20,       # seconds
    "bath": 30          # seconds
}

# Play Configuration
PLAY_VALUES = {
    "play_with_ball": 25,
    "spin_in_wheel": 25
}

PLAY_RESTRICTIONS = {
    'max_joy': 89  # Joy must be 89% or lower to play
}

# Inventory Configuration
INVENTORY_DEFAULTS = {
    'tree_seed': 5,
    'blueberries': 5,
    'mushroom': 5,
    'acorn': 5,
    'coins': 100
}

INVENTORY_LIMITS = {
    'food_max': 100,      # Max quantity per food type
    'coins_max': 10000    # Max coins
}

# Shop Configuration
SHOP_PRICES = {
    "tree_seed": 1,
    "blueberries": 3,
    "mushroom": 2,
    "acorn": 6
}

# Minigame Configuration
MINIGAME_CONFIG = {
    'higher_lower': {
        'base_number': 10,
        'number_range': (0, 20),  # Excludes base_number
        'reward_coins': 2,
        'penalty_joy': 2,
        'min_joy_required': 40
    }
}

# Update Intervals
UPDATE_INTERVALS = {
    'auto_stats_update': 60,        # seconds
    'min_time_between_updates': 30  # seconds
}

# Pet Appearance Thresholds
PET_APPEARANCE_THRESHOLDS = {
    'sleeping': {'energy': 30},
    'hungry': {'hunger': 50, 'energy_min': 30},
    'sad': {'happiness': 40, 'hunger_min': 50, 'energy_min': 30},
    'happy': {'hunger': 80, 'happiness': 80, 'cleanliness': 80, 'energy': 80},
    # Default state is 'idle' when none of the above conditions are met
}
