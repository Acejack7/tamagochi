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
	sleep_type = db.Column(db.String(10), nullable=True)  # 'nap' or 'sleep'
	sleep_end_time = db.Column(db.DateTime, nullable=True)

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
		if not self.is_sleeping or not self.sleep_end_time:
			print("SLEEP DEBUG: check_wake_up called but pet not sleeping or no end time")
			return
		
		now = datetime.utcnow()
		print(f"SLEEP DEBUG: Checking wake up - now: {now}, sleep_end_time: {self.sleep_end_time}")
		
		# Check if sleep end time has passed
		if now >= self.sleep_end_time:
			sleep_duration = (now - self.sleep_start_time).total_seconds()
			print(f"SLEEP DEBUG: Pet woke up after {sleep_duration:.0f} seconds of {self.sleep_type}")
			self.wake_up()
		else:
			remaining = (self.sleep_end_time - now).total_seconds()
			print(f"SLEEP DEBUG: Pet still sleeping, {remaining:.0f} seconds remaining")
	
	def wake_up(self):
		"""Wake up the pet from sleep"""
		self.is_sleeping = False
		self.sleep_start_time = None
		self.sleep_type = None
		self.sleep_end_time = None
		print("SLEEP DEBUG: Pet has woken up")


@login_manager.user_loader
def load_user(user_id: str) -> Optional[User]:
	return db.session.get(User, int(user_id))


