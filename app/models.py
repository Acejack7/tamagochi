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

	# Relationships
	owner = db.relationship("User", back_populates="pet")

	def update_stats(self):
		"""Update stats based on time passed since last actions"""
		now = datetime.utcnow()
		
		# Decay rates: 0-100 in 12 hours = ~8.33 points per hour
		hours_since_fed = (now - self.last_fed).total_seconds() / 3600
		hours_since_played = (now - self.last_played).total_seconds() / 3600
		hours_since_bathed = (now - self.last_bathed).total_seconds() / 3600
		hours_since_slept = (now - self.last_slept).total_seconds() / 3600
		
		# Apply decay (8.33 points per hour)
		decay_rate = 8.33
		self.hunger = round(max(0, self.hunger - (hours_since_fed * decay_rate)), 1)
		self.happiness = round(max(0, self.happiness - (hours_since_played * decay_rate)), 1)
		self.cleanliness = round(max(0, self.cleanliness - (hours_since_bathed * decay_rate)), 1)
		self.energy = round(max(0, self.energy - (hours_since_slept * decay_rate)), 1)
		
		# Update timestamps
		self.last_fed = now
		self.last_played = now
		self.last_bathed = now
		self.last_slept = now


@login_manager.user_loader
def load_user(user_id: str) -> Optional[User]:
	return db.session.get(User, int(user_id))


