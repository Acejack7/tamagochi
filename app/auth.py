from flask import Blueprint, render_template, request, redirect, url_for, flash
from flask_login import login_user, logout_user, login_required
from werkzeug.security import generate_password_hash, check_password_hash

from .extensions import db
from .models import User


bp = Blueprint("auth", __name__, template_folder="templates")


@bp.route("/register", methods=["GET", "POST"])
def register():
	if request.method == "POST":
		username = request.form.get("username", "").strip()
		password = request.form.get("password", "")
		if not username or not password:
			flash("Username and password are required", "error")
			return render_template("register.html")
		if User.query.filter_by(username=username).first():
			flash("Username already taken", "error")
			return render_template("register.html")
		user = User(username=username, password_hash=generate_password_hash(password))
		db.session.add(user)
		db.session.commit()
		flash("Account created. Please log in.", "success")
		return redirect(url_for("auth.login"))
	return render_template("register.html")


@bp.route("/login", methods=["GET", "POST"])
def login():
	if request.method == "POST":
		username = request.form.get("username", "").strip()
		password = request.form.get("password", "")
		remember = request.form.get("remember") == "on"
		user = User.query.filter_by(username=username).first()
		if not user or not check_password_hash(user.password_hash, password):
			flash("Invalid credentials", "error")
			return render_template("login.html")
		login_user(user, remember=remember)
		return redirect(url_for("main.index"))
	return render_template("login.html")


@bp.route("/logout")
@login_required
def logout():
	logout_user()
	flash("Logged out", "info")
	return redirect(url_for("main.index"))


