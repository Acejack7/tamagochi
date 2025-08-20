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

	# Create tables if not present (dev convenience)
	with app.app_context():
		from . import models  # noqa: F401
		db.create_all()

	return app


