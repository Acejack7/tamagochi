from flask import Blueprint, render_template, redirect, url_for, request, flash, jsonify
from flask_login import login_required, current_user
from datetime import datetime, timedelta

from .models import Pet, PET_TYPES, Inventory
from .extensions import db


bp = Blueprint("main", __name__)


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
			"tree_seed": 5
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
				"coins": current_user.inventory.coins
			},
			"stats": {
				"hunger": pet.hunger,
				"happiness": pet.happiness,
				"cleanliness": pet.cleanliness,
				"energy": pet.energy
			}
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
		}
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
			"coins": current_user.inventory.coins
		}
	
	return jsonify({
		"success": True,
		"is_sleeping": pet.is_sleeping,
		"sleep_type": pet.sleep_type,
		"sleep_start_time": pet.sleep_start_time.isoformat() if pet.sleep_start_time else None,
		"sleep_end_time": pet.sleep_end_time.isoformat() if pet.sleep_end_time else None,
		"is_washing": pet.is_washing,
		"wash_type": pet.wash_type,
		"wash_start_time": pet.wash_start_time.isoformat() if pet.wash_start_time else None,
		"wash_end_time": pet.wash_end_time.isoformat() if pet.wash_end_time else None,
		"inventory": inventory_data,
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

	if not food_type or food_type not in ["tree_seed", "blueberries", "mushroom"]:
		return jsonify({"error": "Invalid food type"}), 400

	if quantity < 1 or quantity > 100:
		return jsonify({"error": "Quantity must be between 1 and 100"}), 400

	# Define prices
	prices = {
		"tree_seed": 1,
		"blueberries": 3,
		"mushroom": 2
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


