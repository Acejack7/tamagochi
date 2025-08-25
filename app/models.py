from __future__ import annotations

from datetime import datetime, timedelta
from typing import Optional

from flask_login import UserMixin

from .extensions import db, login_manager

PET_TYPES = ["hedgehog", "hamster", "squirrel"]


class User(db.Model, UserMixin):
	__tablename__ = "users"

	id = db.Column(db.Integer, primary_key=True)
	username = db.Column(db.String(80), unique=True, nullable=False, index=True)
	password_hash = db.Column(db.String(255), nullable=False)
	created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
	pet = db.relationship("Pet", back_populates="owner", uselist=False)

	def get_id(self) -> str:
		return str(self.id)


class Pet(db.Model):
	__tablename__ = "pets"

	id = db.Column(db.Integer, primary_key=True)
	owner_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, unique=True)
	pet_type = db.Column(db.String(20), nullable=False)  # hedgehog, hamster, squirrel
	name = db.Column(db.String(50), nullable=False)
	
	# Stats (0-100, decay over time)
	hunger = db.Column(db.Integer, nullable=False, default=50)
	happiness = db.Column(db.Integer, nullable=False, default=50)
	cleanliness = db.Column(db.Integer, nullable=False, default=50)
	energy = db.Column(db.Integer, nullable=False, default=50)
	
	# Timestamps for decay calculations
	last_fed = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
	last_played = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
	last_bathed = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
	last_slept = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
	created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
	
	# Sleep state tracking
	is_sleeping = db.Column(db.Boolean, nullable=False, default=False)
	sleep_start_time = db.Column(db.DateTime, nullable=True)

	# Relationships
	owner = db.relationship("User", back_populates="pet")

	def update_stats(self):
		"""Update stats based on time passed since last actions"""
		now = datetime.utcnow()
		
		# Decay rates: Normal = 8.33 points per hour, During sleep = 4.17 points per hour
		normal_decay_rate = 8.33
		sleep_decay_rate = 4.17
		
		# Check if pet is currently sleeping and determine decay rate
		if self.is_sleeping:
			decay_rate = sleep_decay_rate
			print(f"DECAY DEBUG: Pet is sleeping, using slower decay rate: {decay_rate}/hour")
		else:
			decay_rate = normal_decay_rate
			print(f"DECAY DEBUG: Pet is awake, using normal decay rate: {decay_rate}/hour")
		
		# Calculate time passed since last actions
		hours_since_fed = (now - self.last_fed).total_seconds() / 3600
		hours_since_played = (now - self.last_played).total_seconds() / 3600
		hours_since_bathed = (now - self.last_bathed).total_seconds() / 3600
		hours_since_slept = (now - self.last_slept).total_seconds() / 3600
		
		# Only apply decay if enough time has passed (at least 1 minute)
		if hours_since_fed >= 1/60:  # 1 minute
			old_hunger = self.hunger
			self.hunger = round(max(0, self.hunger - (hours_since_fed * decay_rate)), 1)
			self.last_fed = now
			print(f"DECAY DEBUG: Hunger decay - {old_hunger} -> {self.hunger} (hours: {hours_since_fed:.2f}, rate: {decay_rate})")
		
		if hours_since_played >= 1/60:  # 1 minute
			old_happiness = self.happiness
			self.happiness = round(max(0, self.happiness - (hours_since_played * decay_rate)), 1)
			self.last_played = now
			print(f"DECAY DEBUG: Happiness decay - {old_happiness} -> {self.happiness} (hours: {hours_since_played:.2f}, rate: {decay_rate})")
		
		if hours_since_bathed >= 1/60:  # 1 minute
			old_cleanliness = self.cleanliness
			self.cleanliness = round(max(0, self.cleanliness - (hours_since_bathed * decay_rate)), 1)
			self.last_bathed = now
			print(f"DECAY DEBUG: Cleanliness decay - {old_cleanliness} -> {self.cleanliness} (hours: {hours_since_bathed:.2f}, rate: {decay_rate})")
		
		if hours_since_slept >= 1/60:  # 1 minute
			old_energy = self.energy
			# Energy always decays at normal rate unless sleeping actively restores it
			energy_decay_rate = normal_decay_rate if not self.is_sleeping else sleep_decay_rate
			self.energy = round(max(0, self.energy - (hours_since_slept * energy_decay_rate)), 1)
			self.last_slept = now
			print(f"DECAY DEBUG: Energy decay - {old_energy} -> {self.energy} (hours: {hours_since_slept:.2f}, rate: {energy_decay_rate})")
		
		# Check if pet should wake up from sleep
		self.check_wake_up()
	
	def check_wake_up(self):
		"""Check if pet should wake up from sleep"""
		if not self.is_sleeping or not self.sleep_start_time:
			return
		
		now = datetime.utcnow()
		sleep_duration_hours = (now - self.sleep_start_time).total_seconds() / 3600
		
		# Wake up after reasonable duration: 
		# Nap: 2-4 hours
		# Sleep: 6-8 hours  
		# For faster testing, let's use shorter durations: nap=10 minutes, sleep=30 minutes
		max_sleep_duration = 0.5  # 30 minutes for sleep
		max_nap_duration = 0.17   # 10 minutes for nap
		
		# Determine if it was nap or sleep based on duration or energy level
		# If we've been sleeping for more than nap duration, wake up
		if sleep_duration_hours >= max_sleep_duration:
			self.wake_up()
			print(f"SLEEP DEBUG: Pet woke up after {sleep_duration_hours:.2f} hours of sleep")
		elif sleep_duration_hours >= max_nap_duration:
			# Could be a nap that should end
			self.wake_up()
			print(f"SLEEP DEBUG: Pet woke up after {sleep_duration_hours:.2f} hours of nap")
	
	def wake_up(self):
		"""Wake up the pet from sleep"""
		self.is_sleeping = False
		self.sleep_start_time = None
		print("SLEEP DEBUG: Pet has woken up")


@login_manager.user_loader
def load_user(user_id: str) -> Optional[User]:
	return db.session.get(User, int(user_id))


