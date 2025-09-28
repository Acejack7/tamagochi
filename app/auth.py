from flask import Blueprint, render_template, request, redirect, url_for, flash
from flask_login import login_user, logout_user, login_required, current_user
from werkzeug.security import generate_password_hash, check_password_hash

from .extensions import db
from .models import User, AccessRequest


bp = Blueprint("auth", __name__, template_folder="templates")


@bp.route("/register", methods=["GET", "POST"])
def register():
	# Public registration disabled
	flash("Registration is disabled. Please request access from admin.", "error")
	return redirect(url_for("auth.login"))


@bp.route("/request-access", methods=["GET", "POST"])
def request_access():
	if request.method == "POST":
		email = request.form.get("email", "").strip()
		message = request.form.get("message", "").strip()
		if not email or "@" not in email:
			flash("Please provide a valid email address", "error")
			return render_template("request_access.html")
		# Save request
		req = AccessRequest(email=email, message=message)
		db.session.add(req)
		db.session.commit()
		flash("Your request has been recorded. We'll get back to you.", "success")
		return redirect(url_for("auth.login"))
	return render_template("request_access.html")


@bp.route("/admin/access-requests", methods=["GET", "POST"])
@login_required
def access_requests_admin():
	if not current_user.is_admin:
		flash("Unauthorized", "error")
		return redirect(url_for("main.index"))
	# Mark processed if an id is submitted
	if request.method == "POST":
		req_id = request.form.get("request_id")
		if req_id:
			req = AccessRequest.query.get(int(req_id))
			if req:
				req.processed = True
				db.session.commit()
				flash("Request marked as processed", "success")
		return redirect(url_for("auth.access_requests_admin"))
	requests = AccessRequest.query.order_by(AccessRequest.created_at.desc()).all()
	return render_template("access_requests.html", requests=requests)


@bp.route("/admin/users", methods=["GET", "POST"])
@login_required
def admin_users():
	if not current_user.is_admin:
		flash("Unauthorized", "error")
		return redirect(url_for("main.index"))

	if request.method == "POST":
		user_id = request.form.get("user_id")
		if not user_id:
			flash("Missing user id", "error")
			return redirect(url_for("auth.admin_users"))
		target = User.query.get(int(user_id))
		if not target:
			flash("User not found", "error")
			return redirect(url_for("auth.admin_users"))
		if target.is_admin:
			flash("Cannot delete admin accounts", "error")
			return redirect(url_for("auth.admin_users"))
		# Remove related data (pet, inventory) if present
		if target.pet:
			from .extensions import db as _db
			_db.session.delete(target.pet)
		if target.inventory:
			from .extensions import db as _db
			_db.session.delete(target.inventory)
		from .extensions import db as _db
		_db.session.delete(target)
		_db.session.commit()
		flash("User removed", "success")
		return redirect(url_for("auth.admin_users"))

	users = User.query.order_by(User.created_at.desc()).all()
	return render_template("admin_users.html", users=users)


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
		# Force password change if required
		if user.must_change_password:
			return redirect(url_for("auth.change_password"))
		return redirect(url_for("main.index"))
	return render_template("login.html")


@bp.route("/logout")
@login_required
def logout():
	logout_user()
	flash("Logged out", "info")
	return redirect(url_for("main.index"))


# Admin: create user with temporary password
@bp.route("/admin/create-user", methods=["POST"])
@login_required
def admin_create_user():
	if not current_user.is_admin:
		flash("Unauthorized", "error")
		return redirect(url_for("main.index"))

	username = request.form.get("username", "").strip()
	if not username:
		flash("Username is required", "error")
		return redirect(url_for("main.index"))

	if User.query.filter_by(username=username).first():
		flash("Username already exists", "error")
		return redirect(url_for("main.index"))

	import secrets
	temp_password = secrets.token_urlsafe(8)
	user = User(
		username=username,
		password_hash=generate_password_hash(temp_password),
		must_change_password=True
	)
	db.session.add(user)
	db.session.commit()

	flash(f"User '{username}' created with temporary password: {temp_password}", "success")
	return redirect(url_for("main.index"))


@bp.route("/change-password", methods=["GET", "POST"])
@login_required
def change_password():
	if request.method == "POST":
		new_password = request.form.get("new_password", "")
		confirm_password = request.form.get("confirm_password", "")
		if not new_password or len(new_password) < 6:
			flash("Password must be at least 6 characters", "error")
			return render_template("change_password.html")
		if new_password != confirm_password:
			flash("Passwords do not match", "error")
			return render_template("change_password.html")
		current_user.password_hash = generate_password_hash(new_password)
		current_user.must_change_password = False
		db.session.commit()
		flash("Password changed successfully", "success")
		return redirect(url_for("main.index"))
	return render_template("change_password.html")

