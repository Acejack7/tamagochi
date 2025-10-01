from flask import Blueprint, render_template, redirect, url_for, request, flash, jsonify, session
from flask_login import login_required, current_user
from datetime import datetime, timedelta

from .models import Pet, Inventory
from .extensions import db
from .constants import (
    PET_TYPES, FOOD_VALUES, WASH_VALUES, WASH_DURATIONS,
    SLEEP_DURATIONS, PLAY_VALUES, SHOP_PRICES, ACTION_THRESHOLDS,
    MINIGAME_CONFIG, UPDATE_INTERVALS
)


bp = Blueprint("main", __name__)


# Action Handler Functions - Split from large pet_action function
def handle_feed_action(pet, request_data):
	"""Handle feed action logic"""
	food_type = request_data.get("food_type")
	if not food_type:
		return {"success": False, "error": "Food type is required for feed action"}
	
	if food_type not in FOOD_VALUES:
		return {"success": False, "error": "Invalid food type"}
	
	# Check if user has inventory
	if not current_user.inventory:
		return {"success": False, "error": "Inventory not found"}
	
	# Check if user has enough food
	food_quantity = current_user.inventory.get_food_quantity(food_type)
	if food_quantity <= 0:
		return {"success": False, "error": f"No {food_type.replace('_', ' ')} left in inventory"}
	
	# Consume the food from inventory
	if not current_user.inventory.consume_food(food_type, 1):
		return {"success": False, "error": f"Failed to consume {food_type}"}
	
	# Apply hunger increase
	hunger_increase = FOOD_VALUES[food_type]
	old_hunger = pet.hunger
	pet.hunger = min(100, pet.hunger + hunger_increase)
	pet.last_fed = datetime.utcnow()
	pet.hunger = round(pet.hunger, 1)
	
	# Mark feeding state so frontend can restore animation on refresh
	from datetime import timedelta
	pet.is_feeding = True
	pet.feed_start_time = datetime.utcnow()
	pet.feed_type = food_type
	pet.feed_end_time = pet.feed_start_time + timedelta(seconds=5)
	print(f"FEED DEBUG: {food_type} - Hunger: {old_hunger} -> {pet.hunger} (+{hunger_increase}), Inventory: {food_quantity} -> {food_quantity - 1}")
	
	return {
		"success": True,
		"action": "feed",
		"food_type": food_type,
		"inventory": {
			"tree_seed": current_user.inventory.tree_seed,
			"blueberries": current_user.inventory.blueberries,
			"mushroom": current_user.inventory.mushroom,
			"acorn": current_user.inventory.acorn,
			"coins": current_user.inventory.coins
		},
		"stats": {
			"hunger": pet.hunger,
			"happiness": pet.happiness,
			"cleanliness": pet.cleanliness,
			"energy": pet.energy
		},
		"is_feeding": pet.is_feeding,
		"feed_type": pet.feed_type,
		"feed_start_time": pet.feed_start_time.isoformat() if pet.feed_start_time else None,
		"feed_end_time": pet.feed_end_time.isoformat() if pet.feed_end_time else None
	}


def handle_play_action(pet, request_data):
	"""Handle play action logic"""
	play_type = request_data.get("play_type")
	if not play_type:
		return {"success": False, "error": "Play type is required for play action"}
	
	# Validate play type
	if play_type not in PLAY_VALUES:
		return {"success": False, "error": "Invalid play type"}
	
	# Check joy restrictions
	max_joy = ACTION_THRESHOLDS['play']['max']
	if pet.happiness >= max_joy:
		return {"success": False, "error": f"Joy is too high for playing (max {max_joy-1}%)"}
	
	# Apply joy restoration
	old_happiness = pet.happiness
	joy_increase = PLAY_VALUES[play_type]
	pet.happiness = min(100, pet.happiness + joy_increase)
	pet.last_played = datetime.utcnow()
	pet.happiness = round(pet.happiness, 1)
	
	# Mark playing state so frontend can restore animation on refresh
	from datetime import timedelta
	pet.is_playing = True
	pet.play_start_time = datetime.utcnow()
	pet.play_type = play_type
	pet.play_end_time = pet.play_start_time + timedelta(seconds=10)
	print(f"PLAY DEBUG: {play_type} - Joy: {old_happiness} -> {pet.happiness} (+{joy_increase})")
	
	return {
		"success": True,
		"action": "play",
		"play_type": play_type,
		"stats": {
			"hunger": pet.hunger,
			"happiness": pet.happiness,
			"cleanliness": pet.cleanliness,
			"energy": pet.energy
		},
		"is_playing": pet.is_playing,
		"play_type": pet.play_type,
		"play_start_time": pet.play_start_time.isoformat() if pet.play_start_time else None,
		"play_end_time": pet.play_end_time.isoformat() if pet.play_end_time else None
	}


def handle_wash_action(pet, request_data):
	"""Handle wash action logic"""
	wash_type = request_data.get("wash_type")
	if not wash_type:
		return {"success": False, "error": "Wash type is required for wash action"}
	
	# Validate wash type
	if wash_type not in WASH_VALUES:
		return {"success": False, "error": "Invalid wash type"}
	
	# Check cleanliness restrictions
	max_cleanliness = ACTION_THRESHOLDS['wash']['max']
	if pet.cleanliness > max_cleanliness:
		return {"success": False, "error": f"Cleanliness too high for washing (max {max_cleanliness}%)"}
	
	# Apply cleanliness restoration
	old_cleanliness = pet.cleanliness
	now = datetime.utcnow()
	
	# Bath always restores to 100, others add their value
	if wash_type == "bath":
		pet.cleanliness = 100
		cleanliness_increase = 100 - old_cleanliness
	else:
		cleanliness_increase = WASH_VALUES[wash_type]
		pet.cleanliness = min(100, pet.cleanliness + cleanliness_increase)
	
	pet.last_bathed = datetime.utcnow()
	pet.cleanliness = round(pet.cleanliness, 1)
	
	# Set washing state with duration from constants
	wash_duration_seconds = WASH_DURATIONS[wash_type]
	pet.is_washing = True
	pet.wash_start_time = now
	pet.wash_type = wash_type
	pet.wash_end_time = now + timedelta(seconds=wash_duration_seconds)
	
	print(f"WASH DEBUG: {wash_type} - Cleanliness: {old_cleanliness} -> {pet.cleanliness} (+{cleanliness_increase})")
	
	return {
		"success": True,
		"action": "wash",
		"wash_type": wash_type,
		"is_washing": pet.is_washing,
		"wash_start_time": pet.wash_start_time.isoformat() if pet.wash_start_time else None,
		"wash_end_time": pet.wash_end_time.isoformat() if pet.wash_end_time else None,
		"stats": {
			"hunger": pet.hunger,
			"happiness": pet.happiness,
			"cleanliness": pet.cleanliness,
			"energy": pet.energy
		}
	}


def handle_sleep_action(pet, request_data):
	"""Handle sleep action logic"""
	sleep_type = request_data.get("sleep_type")
	auto_sleep = request_data.get("auto_sleep", False)
	
	if not sleep_type and not auto_sleep:
		return {"success": False, "error": "Sleep type is required for sleep action"}
	
	# If auto_sleep is True, force sleep type to 'sleep'
	if auto_sleep:
		sleep_type = 'sleep'
	
	# Validate sleep type
	if sleep_type not in SLEEP_DURATIONS:
		return {"success": False, "error": "Invalid sleep type"}
	
	# Check energy restrictions (unless it's auto-sleep)
	if not auto_sleep:
		max_energy = ACTION_THRESHOLDS[f'sleep_{sleep_type}']['max'] if sleep_type == 'nap' else ACTION_THRESHOLDS['sleep_full']['max']
		if pet.energy > max_energy:
			return {"success": False, "error": f"Energy too high for {sleep_type} (max {max_energy}%)"}
	
	# Apply energy restoration using constants
	old_energy = pet.energy
	now = datetime.utcnow()
	
	sleep_config = SLEEP_DURATIONS[sleep_type]
	if sleep_type == 'nap':
		pet.energy = min(100, pet.energy + sleep_config['energy_restore'])
	else:  # sleep_type == 'sleep'
		pet.energy = sleep_config['energy_restore']  # Always restore to 100 for sleep
	
	# Set sleeping state using duration from constants
	sleep_duration_minutes = sleep_config['minutes']
	pet.is_sleeping = True
	pet.sleep_start_time = now
	pet.sleep_type = sleep_type
	pet.sleep_end_time = now + timedelta(minutes=sleep_duration_minutes)
	
	pet.last_slept = datetime.utcnow()
	pet.energy = round(pet.energy, 1)
	
	print(f"SLEEP DEBUG: {sleep_type} - Energy: {old_energy} -> {pet.energy}")
	
	return {
		"success": True,
		"action": "sleep",
		"sleep_type": sleep_type,
		"auto_sleep": auto_sleep,
		"is_sleeping": pet.is_sleeping,
		"sleep_start_time": pet.sleep_start_time.isoformat() if pet.sleep_start_time else None,
		"sleep_end_time": pet.sleep_end_time.isoformat() if pet.sleep_end_time else None,
		"stats": {
			"hunger": pet.hunger,
			"happiness": pet.happiness,
			"cleanliness": pet.cleanliness,
			"energy": pet.energy
		}
	}


@bp.route("/")
def index():
	if not current_user.is_authenticated:
		return render_template("index.html")
	
	# Check if user has a pet
	if not current_user.pet:
		return redirect(url_for("main.select_pet"))
	
	# Update pet stats based on time passed
	current_user.pet.update_stats()
	
	# Check if user has inventory, create one if missing (for existing users)
	if not current_user.inventory:
		inventory = Inventory(owner_id=current_user.id)
		db.session.add(inventory)
		db.session.commit()
	
	return render_template("game.html", pet=current_user.pet, inventory=current_user.inventory)


@bp.route("/select-pet", methods=["GET", "POST"])
@login_required
def select_pet():
	if current_user.pet:
		return redirect(url_for("main.index"))
	
	if request.method == "POST":
		pet_type = request.form.get("pet_type")
		pet_name = request.form.get("pet_name", "").strip()
		
		if not pet_type or pet_type not in PET_TYPES:
			flash("Please select a valid pet type", "error")
			return render_template("select_pet.html", pet_types=PET_TYPES)
		
		if not pet_name:
			flash("Please enter a name for your pet", "error")
			return render_template("select_pet.html", pet_types=PET_TYPES)
		
		# Create the pet
		pet = Pet(
			owner_id=current_user.id,
			pet_type=pet_type,
			name=pet_name
		)
		db.session.add(pet)
		
		# Create the inventory with default food quantities
		inventory = Inventory(owner_id=current_user.id)
		db.session.add(inventory)
		
		db.session.commit()
		
		flash(f"Welcome {pet_name} the {pet_type}!", "success")
		return redirect(url_for("main.index"))
	
	return render_template("select_pet.html", pet_types=PET_TYPES)


@bp.route("/api/pet/action", methods=["POST"])
@login_required
def pet_action():
	if not current_user.pet:
		return jsonify({"error": "No pet found"}), 404
	
	action = request.json.get("action")
	if not action or action not in ["feed", "play", "wash", "sleep"]:
		return jsonify({"error": "Invalid action"}), 400
	
	pet = current_user.pet
	
	# Check if pet should wake up first
	if pet.is_sleeping:
		pet.check_wake_up()
		db.session.commit()
	
	# Check if pet is still sleeping and block non-sleep actions
	if pet.is_sleeping and action != "sleep":
		return jsonify({"error": f"Pet is sleeping! Cannot {action} until {pet.sleep_end_time.strftime('%H:%M:%S') if pet.sleep_end_time else 'unknown time'}"}), 400
	
	# Update only the corresponding stat based on action
	if action == "feed":
		# Get food type from request
		food_type = request.json.get("food_type")
		if not food_type:
			return jsonify({"error": "Food type is required for feed action"}), 400
		
		# Define food types and their hunger values
		food_values = {
			"mushroom": 10,
			"blueberries": 15,
			"tree_seed": 5,
			"acorn": 25
		}
		
		if food_type not in food_values:
			return jsonify({"error": "Invalid food type"}), 400
		
		# Check if user has inventory
		if not current_user.inventory:
			return jsonify({"error": "Inventory not found"}), 404
		
		# Check if user has enough food
		food_quantity = current_user.inventory.get_food_quantity(food_type)
		if food_quantity <= 0:
			return jsonify({"error": f"No {food_type.replace('_', ' ')} left in inventory"}), 400
		
		# Consume the food from inventory
		if not current_user.inventory.consume_food(food_type, 1):
			return jsonify({"error": f"Failed to consume {food_type}"}), 400
		
		hunger_increase = food_values[food_type]
		old_hunger = pet.hunger
		pet.hunger = min(100, pet.hunger + hunger_increase)
		pet.last_fed = datetime.utcnow()
		pet.hunger = round(pet.hunger, 1)
		
		# Persist feeding state for refresh-safe animation (5s)
		pet.is_feeding = True
		pet.feed_start_time = datetime.utcnow()
		pet.feed_type = food_type
		pet.feed_end_time = pet.feed_start_time + timedelta(seconds=5)
		print(f"FEED DEBUG: {food_type} - Hunger: {old_hunger} -> {pet.hunger} (+{hunger_increase}), Inventory: {food_quantity} -> {food_quantity - 1}")
		

		# Commit the changes immediately for feed action
		db.session.commit()
		
		# Return food type and updated inventory for frontend display
		return jsonify({
			"success": True,
			"action": action,
			"food_type": food_type,
			"inventory": {
				"tree_seed": current_user.inventory.tree_seed,
				"blueberries": current_user.inventory.blueberries,
				"mushroom": current_user.inventory.mushroom,
				"acorn": current_user.inventory.acorn,
				"coins": current_user.inventory.coins
			},
			"stats": {
				"hunger": pet.hunger,
				"happiness": pet.happiness,
				"cleanliness": pet.cleanliness,
			"energy": pet.energy
			},
			"is_feeding": pet.is_feeding,
			"feed_type": pet.feed_type,
			"feed_start_time": pet.feed_start_time.isoformat() if pet.feed_start_time else None,
			"feed_end_time": pet.feed_end_time.isoformat() if pet.feed_end_time else None
		})
	elif action == "play":
		# Get play type from request
		play_type = request.json.get("play_type")
		if not play_type:
			return jsonify({"error": "Play type is required for play action"}), 400
		
		# Validate play type
		if play_type not in ['play_with_ball', 'spin_in_wheel']:
			return jsonify({"error": "Invalid play type"}), 400
		
		# Check joy restrictions (all play types require joy 90 or lower)
		if pet.happiness >= 90:
			return jsonify({"error": "Joy is too high for playing (max 89%)"}), 400
		
		# Apply joy restoration (+25 for both play types)
		old_happiness = pet.happiness
		pet.happiness = min(100, pet.happiness + 25)
		pet.last_played = datetime.utcnow()
		pet.happiness = round(pet.happiness, 1)
		
		print(f"PLAY DEBUG: {play_type} - Joy: {old_happiness} -> {pet.happiness} (+25)")
		# Mark playing state
		pet.is_playing = True
		pet.play_start_time = datetime.utcnow()
		pet.play_type = play_type
		pet.play_end_time = pet.play_start_time + timedelta(seconds=10)

	elif action == "wash":
		# Get wash type from request
		wash_type = request.json.get("wash_type")
		if not wash_type:
			return jsonify({"error": "Wash type is required for wash action"}), 400
		
		# Validate wash type
		if wash_type not in ['wash_hands', 'shower', 'bath']:
			return jsonify({"error": "Invalid wash type"}), 400
		
		# Check cleanliness restrictions (all wash types require cleanliness 85 or lower)
		if pet.cleanliness > 85:
			return jsonify({"error": "Cleanliness too high for washing (max 85%)"}), 400
		
		# Apply cleanliness restoration
		old_cleanliness = pet.cleanliness
		now = datetime.utcnow()
		
		# Define wash types and their cleanliness values
		wash_values = {
			"wash_hands": 15,
			"shower": 60,
			"bath": 80
		}
		
		# Bath always restores to 100, others add their value
		if wash_type == "bath":
			pet.cleanliness = 100
			cleanliness_increase = 100 - old_cleanliness
		else:
			cleanliness_increase = wash_values[wash_type]
			pet.cleanliness = min(100, pet.cleanliness + cleanliness_increase)
		
		pet.last_bathed = datetime.utcnow()
		pet.cleanliness = round(pet.cleanliness, 1)
		
		# Set washing state with different durations
		wash_duration_seconds = {
			"wash_hands": 5,
			"shower": 20,
			"bath": 30
		}
		
		pet.is_washing = True
		pet.wash_start_time = now
		pet.wash_type = wash_type
		pet.wash_end_time = now + timedelta(seconds=wash_duration_seconds[wash_type])
		
		print(f"WASH DEBUG: {wash_type} - Cleanliness: {old_cleanliness} -> {pet.cleanliness} (+{cleanliness_increase})")
		
		# Commit the changes immediately for wash action
		db.session.commit()
		
		# Return wash type and timing info for frontend display
		return jsonify({
			"success": True,
			"action": action,
			"wash_type": wash_type,
			"is_washing": pet.is_washing,
			"wash_start_time": pet.wash_start_time.isoformat() if pet.wash_start_time else None,
			"wash_end_time": pet.wash_end_time.isoformat() if pet.wash_end_time else None,
			"stats": {
				"hunger": pet.hunger,
				"happiness": pet.happiness,
				"cleanliness": pet.cleanliness,
				"energy": pet.energy
			}
		})
	elif action == "sleep":
		# Get sleep type from request
		sleep_type = request.json.get("sleep_type")
		auto_sleep = request.json.get("auto_sleep", False)
		
		if not sleep_type and not auto_sleep:
			return jsonify({"error": "Sleep type is required for sleep action"}), 400
		
		# If auto_sleep is True, force sleep type to 'sleep'
		if auto_sleep:
			sleep_type = 'sleep'
		
		# Validate sleep type
		if sleep_type not in ['nap', 'sleep']:
			return jsonify({"error": "Invalid sleep type"}), 400
		
		# Check energy restrictions (unless it's auto-sleep)
		if not auto_sleep:
			if sleep_type == 'nap' and pet.energy > 50:
				return jsonify({"error": "Energy too high for nap (max 50%)"}), 400
			if sleep_type == 'sleep' and pet.energy > 30:
				return jsonify({"error": "Energy too high for sleep (max 30%)"}), 400
		
		# Apply energy restoration
		old_energy = pet.energy
		now = datetime.utcnow()
		
		if sleep_type == 'nap':
			pet.energy = min(100, pet.energy + 25)
			# Set sleeping state for nap (1 minute for testing, 1 hour in future)
			sleep_duration_minutes = 1  # TODO: Change to 60 for production
			pet.is_sleeping = True
			pet.sleep_start_time = now
			pet.sleep_type = 'nap'
			pet.sleep_end_time = now + timedelta(minutes=sleep_duration_minutes)
		elif sleep_type == 'sleep':
			pet.energy = 100  # Always restore to 100 for sleep
			# Set sleeping state for sleep (2 minutes for testing, 8 hours in future)
			sleep_duration_minutes = 2  # TODO: Change to 480 (8 hours) for production
			pet.is_sleeping = True
			pet.sleep_start_time = now
			pet.sleep_type = 'sleep'
			pet.sleep_end_time = now + timedelta(minutes=sleep_duration_minutes)
		
		pet.last_slept = datetime.utcnow()
		pet.energy = round(pet.energy, 1)
		
		print(f"SLEEP DEBUG: {sleep_type} - Energy: {old_energy} -> {pet.energy}")
		
		# Commit the changes immediately for sleep action
		db.session.commit()
		
		# Return sleep type and timing info for frontend display
		return jsonify({
			"success": True,
			"action": action,
			"sleep_type": sleep_type,
			"auto_sleep": auto_sleep,
			"is_sleeping": pet.is_sleeping,
			"sleep_start_time": pet.sleep_start_time.isoformat() if pet.sleep_start_time else None,
			"sleep_end_time": pet.sleep_end_time.isoformat() if pet.sleep_end_time else None,
			"stats": {
				"hunger": pet.hunger,
				"happiness": pet.happiness,
				"cleanliness": pet.cleanliness,
				"energy": pet.energy
			}
		})
	
	db.session.commit()
	
	return jsonify({
		"success": True,
		"action": action,
		"stats": {
			"hunger": pet.hunger,
			"happiness": pet.happiness,
			"cleanliness": pet.cleanliness,
			"energy": pet.energy
		},
		"is_feeding": pet.is_feeding,
		"feed_type": pet.feed_type,
		"feed_start_time": pet.feed_start_time.isoformat() if pet.feed_start_time else None,
		"feed_end_time": pet.feed_end_time.isoformat() if pet.feed_end_time else None,
		"is_playing": pet.is_playing,
		"play_type": pet.play_type,
		"play_start_time": pet.play_start_time.isoformat() if pet.play_start_time else None,
		"play_end_time": pet.play_end_time.isoformat() if pet.play_end_time else None
	})


@bp.route("/api/pet/stats", methods=["GET"])
@login_required
def get_pet_stats():
	if not current_user.pet:
		return jsonify({"error": "No pet found"}), 404
	
	pet = current_user.pet
	
	# Only update stats if enough time has passed since last action (at least 30 seconds)
	now = datetime.utcnow()
	time_since_last_action = min(
		(now - pet.last_fed).total_seconds(),
		(now - pet.last_played).total_seconds(),
		(now - pet.last_bathed).total_seconds(),
		(now - pet.last_slept).total_seconds()
	)
	
	# Check if pet should wake up from sleep
	if pet.is_sleeping:
		pet.check_wake_up()
		db.session.commit()
	
	# Check if pet should finish washing
	if pet.is_washing:
		pet.check_wash_finish()
		db.session.commit()

	# Ensure feed/play states are cleared if ended
	pet.check_feed_finish()
	pet.check_play_finish()
	db.session.commit()
	
	# Only update stats if at least 30 seconds have passed since any action
	if time_since_last_action >= 30:
		pet.update_stats()
		db.session.commit()
	
	# Get inventory data
	inventory_data = {}
	if current_user.inventory:
		inventory_data = {
			"tree_seed": current_user.inventory.tree_seed,
			"blueberries": current_user.inventory.blueberries,
			"mushroom": current_user.inventory.mushroom,
			"acorn": current_user.inventory.acorn,
			"coins": current_user.inventory.coins
		}
	
	# Maturity info
	stage = pet.compute_maturity_stage()
	next_change_dt = pet.compute_next_maturity_change()

	return jsonify({
		"success": True,
		"is_sleeping": pet.is_sleeping,
		"sleep_type": pet.sleep_type,
		"sleep_start_time": pet.sleep_start_time.isoformat() if pet.sleep_start_time else None,
		"sleep_end_time": pet.sleep_end_time.isoformat() if pet.sleep_end_time else None,
		"is_washing": pet.is_washing,
		# Feed/play states for refresh-safe animations
		"is_feeding": pet.is_feeding,
		"feed_type": pet.feed_type,
		"feed_start_time": pet.feed_start_time.isoformat() if pet.feed_start_time else None,
		"feed_end_time": pet.feed_end_time.isoformat() if pet.feed_end_time else None,
		"is_playing": pet.is_playing,
		"play_type": pet.play_type,
		"play_start_time": pet.play_start_time.isoformat() if pet.play_start_time else None,
		"play_end_time": pet.play_end_time.isoformat() if pet.play_end_time else None,
		"wash_type": pet.wash_type,
		"wash_start_time": pet.wash_start_time.isoformat() if pet.wash_start_time else None,
		"wash_end_time": pet.wash_end_time.isoformat() if pet.wash_end_time else None,
		"inventory": inventory_data,
		"maturity": {
			"stage": stage,
			"next_change_time": next_change_dt.isoformat() if next_change_dt else None
		},
		"stats": {
			"hunger": pet.hunger,
			"happiness": pet.happiness,
			"cleanliness": pet.cleanliness,
			"energy": pet.energy
		}
	})


@bp.route("/api/shop/purchase", methods=["POST"])
@login_required
def shop_purchase():
	if not current_user.pet:
		return jsonify({"error": "No pet found"}), 404

	if not current_user.inventory:
		return jsonify({"error": "No inventory found"}), 404

	# Check if pet is sleeping
	if current_user.pet.is_sleeping:
		return jsonify({"error": "Cannot shop while pet is sleeping"}), 400

	food_type = request.json.get("food_type")
	quantity = request.json.get("quantity", 1)

	if not food_type or food_type not in ["tree_seed", "blueberries", "mushroom", "acorn"]:
		return jsonify({"error": "Invalid food type"}), 400

	if quantity < 1 or quantity > 100:
		return jsonify({"error": "Quantity must be between 1 and 100"}), 400

	# Define prices
	prices = {
		"tree_seed": 1,
		"blueberries": 3,
		"mushroom": 2,
		"acorn": 6
	}

	price_per_unit = prices[food_type]
	total_cost = price_per_unit * quantity

	# Check if user can afford
	if not current_user.inventory.can_afford(total_cost):
		return jsonify({"error": f"Insufficient coins. Need {total_cost}, have {current_user.inventory.coins}"}), 400

	# Check if adding would exceed inventory limit
	current_quantity = getattr(current_user.inventory, food_type)
	if current_quantity + quantity > 100:
		max_affordable = 100 - current_quantity
		return jsonify({"error": f"Inventory full. Can buy maximum {max_affordable} more"}), 400

	# Process purchase
	if not current_user.inventory.spend_coins(total_cost):
		return jsonify({"error": "Failed to process payment"}), 500

	if not current_user.inventory.add_food(food_type, quantity):
		# Refund coins if food addition fails
		current_user.inventory.add_coins(total_cost)
		return jsonify({"error": "Failed to add food to inventory"}), 500

	db.session.commit()

	print(f"SHOP: {current_user.username} bought {quantity} {food_type} for {total_cost} coins")

	return jsonify({
		"success": True,
		"food_type": food_type,
		"quantity": quantity,
		"total_cost": total_cost,
		"inventory": {
			"tree_seed": current_user.inventory.tree_seed,
			"blueberries": current_user.inventory.blueberries,
			"mushroom": current_user.inventory.mushroom,
			"coins": current_user.inventory.coins
		}
	})


@bp.route("/api/minigame/availability", methods=["GET"])
@login_required
def minigame_availability():
	"""Check which minigames are available to play"""
	can_play_hl = current_user.can_play_higher_lower()
	
	return jsonify({
		"success": True,
		"minigames": {
			"higher_lower": {
				"available": can_play_hl,
				"message": "Available to play!" if can_play_hl else "Already played today! Resets at 6:00 AM"
			}
		}
	})


@bp.route("/api/minigame/higher-lower", methods=["POST"])
@login_required
def minigame_higher_lower():
	if not current_user.pet:
		return jsonify({"error": "No pet found"}), 404
	
	if not current_user.inventory:
		return jsonify({"error": "No inventory found"}), 404
	
	# Check if pet is sleeping
	if current_user.pet.is_sleeping:
		return jsonify({"error": "Cannot play minigames while pet is sleeping"}), 400
	
	# Check joy requirement (minimum 40)
	if current_user.pet.happiness < 40:
		return jsonify({"error": "Joy too low! Need at least 40% to play minigames"}), 400
	
	# Check daily limit (once per day, resets at 6 AM)
	if not current_user.can_play_higher_lower():
		return jsonify({"error": "Already played today! Resets at 6:00 AM"}), 400
	
	# Get user's guess
	guess = request.json.get("guess")
	if not guess or guess not in ["higher", "lower"]:
		return jsonify({"error": "Invalid guess. Must be 'higher' or 'lower'"}), 400
	
	# Generate random number between 0-20, excluding 10
	import random
	possible_numbers = list(range(0, 10)) + list(range(11, 21))
	rolled_number = random.choice(possible_numbers)
	
	# Determine if guess is correct
	base_number = 10
	is_correct = False
	
	if guess == "higher" and rolled_number > base_number:
		is_correct = True
	elif guess == "lower" and rolled_number < base_number:
		is_correct = True
	
	# Apply consequences
	if is_correct:
		# Grant 20 coins
		current_user.inventory.add_coins(20)
		reward_message = f"Correct! You earned 20 coins! 🪙"
	else:
		# Reduce joy by 2 points
		old_happiness = current_user.pet.happiness
		current_user.pet.happiness = max(0, current_user.pet.happiness - 2)
		current_user.pet.happiness = round(current_user.pet.happiness, 1)
		reward_message = f"Wrong! Pet lost 2 joy points 😢"
	
	# Update last played timestamp
	current_user.last_played_higher_lower = datetime.utcnow()
	
	# Commit changes
	db.session.commit()
	
	print(f"MINIGAME: {current_user.username} played Higher/Lower - Guess: {guess}, Rolled: {rolled_number}, Correct: {is_correct}")
	
	return jsonify({
		"success": True,
		"game": "higher_lower",
		"guess": guess,
		"rolled_number": rolled_number,
		"base_number": base_number,
		"is_correct": is_correct,
		"reward_message": reward_message,
		"stats": {
			"happiness": current_user.pet.happiness,
			"coins": current_user.inventory.coins
		}
	})


@bp.route("/api/minigame/labyrinth", methods=["POST"])
@login_required
def minigame_labyrinth():
	if not current_user.pet:
		return jsonify({"error": "No pet found"}), 404
	
	if not current_user.inventory:
		return jsonify({"error": "No inventory found"}), 404
	
	# Check if pet is sleeping or washing
	if current_user.pet.is_sleeping:
		return jsonify({"error": "Cannot play minigames while pet is sleeping"}), 400
	
	if current_user.pet.is_washing:
		return jsonify({"error": "Cannot play minigames while pet is washing"}), 400
	
	# Check joy requirement (minimum 40)
	if current_user.pet.happiness < 40:
		return jsonify({"error": "Joy too low! Need at least 40% to play minigames"}), 400
	
	# Get collected items
	collected = request.json.get("collected", {})
	blueberries = collected.get("blueberry", 0)
	acorns = collected.get("acorn", 0)
	
	# Validate input
	if not isinstance(blueberries, int) or not isinstance(acorns, int):
		return jsonify({"error": "Invalid collected items data"}), 400
	
	if blueberries < 0 or acorns < 0 or blueberries > 2 or acorns > 2:
		return jsonify({"error": "Invalid number of collected items"}), 400
	
	total_collected = blueberries + acorns
	
	if total_collected == 0:
		return jsonify({"error": "No items collected"}), 400
	
	# Add collected items to inventory
	if blueberries > 0:
		current_user.inventory.add_food("blueberries", blueberries)
	
	if acorns > 0:
		# Add acorns to inventory
		current_user.inventory.add_food("acorn", acorns)
	
	# Increase pet happiness slightly for playing
	old_happiness = current_user.pet.happiness
	happiness_bonus = min(2, total_collected)  # 1 point per item, max 2
	current_user.pet.happiness = min(100, current_user.pet.happiness + happiness_bonus)
	current_user.pet.happiness = round(current_user.pet.happiness, 1)
	
	# Commit changes
	db.session.commit()
	
	# Create reward message
	items_text = []
	if blueberries > 0:
		items_text.append(f"{blueberries} blueberr{'y' if blueberries == 1 else 'ies'}")
	if acorns > 0:
		items_text.append(f"{acorns} acorn{'s' if acorns != 1 else ''}")
	
	reward_message = f"Great job! You collected {' and '.join(items_text)}! +{happiness_bonus} joy 🎉"
	
	print(f"MINIGAME: {current_user.username} played Labyrinth - Collected: {blueberries} blueberries, {acorns} acorns")
	
	return jsonify({
		"success": True,
		"game": "labyrinth",
		"collected": {
			"blueberry": blueberries,
			"acorn": acorns
		},
		"reward_message": reward_message,
		"inventory": {
			"blueberries": current_user.inventory.blueberries,
			"acorn": current_user.inventory.acorn
		},
		"stats": {
			"happiness": current_user.pet.happiness
		}
	})


@bp.route("/api/pet/test-action", methods=["POST"])
@login_required
def pet_test_action():
	if not current_user.pet:
		return jsonify({"error": "No pet found"}), 404

	test_action = request.json.get("test_action")
	if not test_action or test_action not in ["reduce-hunger", "reduce-energy", "reduce-cleanliness", "reduce-joy"]:
		return jsonify({"error": "Invalid test action"}), 400

	pet = current_user.pet

	# Reduce the corresponding stat by 10 points
	if test_action == "reduce-hunger":
		pet.hunger = max(0, pet.hunger - 10)
		pet.hunger = round(pet.hunger, 1)
	elif test_action == "reduce-energy":
		pet.energy = max(0, pet.energy - 10)
		pet.energy = round(pet.energy, 1)
	elif test_action == "reduce-cleanliness":
		pet.cleanliness = max(0, pet.cleanliness - 10)
		pet.cleanliness = round(pet.cleanliness, 1)
	elif test_action == "reduce-joy":
		pet.happiness = max(0, pet.happiness - 10)
		pet.happiness = round(pet.happiness, 1)

	db.session.commit()

	return jsonify({
		"success": True,
		"test_action": test_action,
		"stats": {
			"hunger": pet.hunger,
			"happiness": pet.happiness,
			"cleanliness": pet.cleanliness,
			"energy": pet.energy
		}
	})


# Debug maturity controls
@bp.route("/api/pet/maturity", methods=["POST"])
@login_required
def set_maturity_stage():
	if not current_user.pet:
		return jsonify({"error": "No pet found"}), 404

	action = request.json.get("action")  # 'up' | 'down' | 'set'
	stage = request.json.get("stage")    # optional when action == 'set'
	if action not in ["up", "down", "set"]:
		return jsonify({"error": "Invalid action"}), 400

	pet = current_user.pet
	current_stage = pet.compute_maturity_stage()

	from datetime import timedelta
	# Calculate desired stage index
	from .constants import MATURITY_ORDER, MATURITY_DURATIONS_DAYS
	idx = MATURITY_ORDER.index(current_stage)

	if action == 'up' and idx < len(MATURITY_ORDER) - 1:
		desired_idx = idx + 1
	elif action == 'down' and idx > 0:
		desired_idx = idx - 1
	elif action == 'set':
		if stage not in MATURITY_ORDER:
			return jsonify({"error": "Invalid stage"}), 400
		desired_idx = MATURITY_ORDER.index(stage)
	else:
		desired_idx = idx

	# Adjust created_at to simulate stage
	child_days = MATURITY_DURATIONS_DAYS.get("child") or 0
	teen_days = MATURITY_DURATIONS_DAYS.get("teen") or 0
	if desired_idx == 0:  # child
		pet.created_at = datetime.utcnow() - timedelta(hours=1)
	elif desired_idx == 1:  # teen -> just past child duration
		pet.created_at = datetime.utcnow() - timedelta(days=child_days, hours=1)
	else:  # adult -> past child+teen
		pet.created_at = datetime.utcnow() - timedelta(days=child_days + teen_days, hours=1)

	# Return updated maturity info
	stage = pet.compute_maturity_stage()
	next_change_dt = pet.compute_next_maturity_change()

	from .extensions import db
	db.session.commit()

	return jsonify({
		"success": True,
		"maturity": {
			"stage": stage,
			"next_change_time": next_change_dt.isoformat() if next_change_dt else None
		}
	})

