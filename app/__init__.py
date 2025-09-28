from flask import Flask
import os
from .extensions import db, login_manager


def create_app() -> Flask:
	app = Flask(__name__, static_folder="static", template_folder="templates", instance_relative_config=True)

	# Security & session config
	app.config["SECRET_KEY"] = os.getenv("SECRET_KEY", "dev")
	app.config["SESSION_COOKIE_HTTPONLY"] = True
	app.config["REMEMBER_COOKIE_HTTPONLY"] = True
	app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
	app.config["REMEMBER_COOKIE_SAMESITE"] = "Lax"
	# Set to True behind HTTPS later
	app.config["SESSION_COOKIE_SECURE"] = False
	app.config["REMEMBER_COOKIE_SECURE"] = False

	# Database (SQLite for local dev; swap to Postgres via DATABASE_URL later)
	database_url = os.getenv("DATABASE_URL")
	if database_url:
		app.config["SQLALCHEMY_DATABASE_URI"] = database_url
	else:
		# instance/tamagochi.sqlite
		os.makedirs(app.instance_path, exist_ok=True)
		app.config["SQLALCHEMY_DATABASE_URI"] = f"sqlite:///{os.path.join(app.instance_path, 'tamagochi.sqlite')}"
	app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

	# Init extensions
	db.init_app(app)
	login_manager.init_app(app)

	# Blueprints
	from .views import bp as main_bp
	app.register_blueprint(main_bp)
	from .auth import bp as auth_bp
	app.register_blueprint(auth_bp, url_prefix="/auth")

	# Create tables and run lightweight migrations
	with app.app_context():
		from . import models  # noqa: F401
		db.create_all()

		# Lightweight migration for SQLite: add missing columns if needed
		from sqlalchemy import inspect, text
		insp = inspect(db.engine)
		cols = {c['name'] for c in insp.get_columns('users')}
		if 'is_admin' not in cols:
			# Add with default 0
			db.session.execute(text("ALTER TABLE users ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT 0"))
			db.session.commit()
			cols.add('is_admin')
		if 'must_change_password' not in cols:
			db.session.execute(text("ALTER TABLE users ADD COLUMN must_change_password BOOLEAN NOT NULL DEFAULT 0"))
			db.session.commit()

		# Seed admin: mark 'test' user as admin if present
		from .models import User
		test_user = User.query.filter_by(username='test').first()
		if test_user and not getattr(test_user, 'is_admin', False):
			test_user.is_admin = True
			db.session.commit()

	return app


