from flask import Blueprint, render_template, redirect, url_for, request, flash, jsonify
from flask_login import login_required, current_user
from datetime import datetime

from .models import Pet, PET_TYPES
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
	
	return render_template("game.html", pet=current_user.pet)


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
	if not action or action not in ["feed", "play", "bath", "sleep"]:
		return jsonify({"error": "Invalid action"}), 400
	
	pet = current_user.pet
	
	# Update only the corresponding stat based on action
	if action == "feed":
		pet.hunger = min(100, pet.hunger + 25)
		pet.last_fed = datetime.utcnow()
	elif action == "play":
		pet.happiness = min(100, pet.happiness + 25)
		pet.last_played = datetime.utcnow()
	elif action == "bath":
		pet.cleanliness = min(100, pet.cleanliness + 25)
		pet.last_bathed = datetime.utcnow()
	elif action == "sleep":
		pet.energy = min(100, pet.energy + 25)
		pet.last_slept = datetime.utcnow()
	
	# Round the updated stat to one decimal
	if action == "feed":
		pet.hunger = round(pet.hunger, 1)
	elif action == "play":
		pet.happiness = round(pet.happiness, 1)
	elif action == "bath":
		pet.cleanliness = round(pet.cleanliness, 1)
	elif action == "sleep":
		pet.energy = round(pet.energy, 1)
	
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
	
	# Update stats based on time passed
	pet.update_stats()
	db.session.commit()
	
	return jsonify({
		"success": True,
		"stats": {
			"hunger": pet.hunger,
			"happiness": pet.happiness,
			"cleanliness": pet.cleanliness,
			"energy": pet.energy
		}
	})


@bp.route("/api/pet/test-action", methods=["POST"])
@login_required
def pet_test_action():
	if not current_user.pet:
		return jsonify({"error": "No pet found"}), 404
	
	test_action = request.json.get("test_action")
	if not test_action or test_action not in ["reduce-hunger", "reduce-energy"]:
		return jsonify({"error": "Invalid test action"}), 400
	
	pet = current_user.pet
	
	# Reduce the corresponding stat by 10 points
	if test_action == "reduce-hunger":
		pet.hunger = max(0, pet.hunger - 10)
		pet.hunger = round(pet.hunger, 1)
	elif test_action == "reduce-energy":
		pet.energy = max(0, pet.energy - 10)
		pet.energy = round(pet.energy, 1)
	
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


