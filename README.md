# 🐾 Tamagochi Web Game

A modern web-based Tamagochi game built with Flask, Phaser.js, and SQLAlchemy. Take care of your virtual pet with feeding, playing, bathing, and sleeping activities!

## ✨ Features

- **User Authentication**: Secure login/register system with "remember me" functionality
- **Pet Selection**: Choose from 3 adorable pets: Hedgehog, Hamster, or Squirrel
- **Real-time Pet Care**: Feed, play, bathe, and put your pet to sleep
- **Dynamic Stats**: Pet stats (hunger, happiness, cleanliness, energy) decay over time
- **Live Updates**: Stats update automatically every minute without page refresh
- **Beautiful Animations**: Unique Phaser.js animations for each pet action
- **Responsive Design**: Clean, modern UI that works on desktop and mobile

## 🛠️ Tech Stack

- **Backend**: Flask (Python)
- **Database**: SQLite (local development) / PostgreSQL (production ready)
- **Frontend**: HTML5, CSS3, JavaScript
- **Game Engine**: Phaser.js 3
- **Authentication**: Flask-Login
- **ORM**: SQLAlchemy

## 🚀 Quick Start

### Prerequisites
- Python 3.8+
- pip

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/Acejack7/tamagochi.git
   cd tamagochi
   ```

2. **Create virtual environment**
   ```bash
   python -m venv .venv
   ```

3. **Activate virtual environment**
   ```bash
   # Windows
   .\.venv\Scripts\Activate.ps1
   
   # macOS/Linux
   source .venv/bin/activate
   ```

4. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

5. **Run the application**
   ```bash
   python run.py
   ```

6. **Open your browser**
   Navigate to `http://127.0.0.1:5000`

## 🎮 How to Play

1. **Register/Login**: Create an account or sign in
2. **Choose Your Pet**: Select from Hedgehog, Hamster, or Squirrel and give it a name
3. **Take Care**: Use the action buttons to maintain your pet's stats:
   - **Feed** → Increases Hunger
   - **Play** → Increases Happiness
   - **Bath** → Increases Cleanliness
   - **Sleep** → Increases Energy
4. **Monitor Stats**: Watch your pet's stats decay over time (0-100 in 12 hours)
5. **Keep Alive**: Maintain your pet's well-being by regularly performing actions

## 📁 Project Structure

```
tamagochi/
├── app/
│   ├── __init__.py          # Flask app factory
│   ├── extensions.py        # Database and login manager
│   ├── models.py           # User and Pet models
│   ├── views.py            # Main routes and API endpoints
│   ├── auth.py             # Authentication routes
│   ├── templates/          # HTML templates
│   └── static/             # CSS, JS, and assets
├── instance/               # Database files (auto-created)
├── requirements.txt        # Python dependencies
├── run.py                 # Application entry point
└── README.md              # This file
```

## 🔧 Configuration

### Environment Variables
- `SECRET_KEY`: Flask secret key (default: "dev")
- `DATABASE_URL`: Database connection string (default: SQLite)

### Database
- **Development**: SQLite database in `instance/tamagochi.sqlite`
- **Production**: Set `DATABASE_URL` environment variable for PostgreSQL

## 🚀 Deployment

### Local Development
The app is ready to run locally with SQLite. For production deployment:

1. Set environment variables
2. Use PostgreSQL database
3. Configure HTTPS
4. Use production WSGI server (Gunicorn)

### AWS Deployment (Future)
- **EC2**: Host the Flask application
- **RDS**: PostgreSQL database
- **Load Balancer**: For scalability

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **Phaser.js** for the game engine
- **Flask** for the web framework
- **SQLAlchemy** for database management
- **Flask-Login** for authentication

## 📞 Contact

- **GitHub**: [@Acejack7](https://github.com/Acejack7)
- **Project Link**: [https://github.com/Acejack7/tamagochi](https://github.com/Acejack7/tamagochi)

---

Made with ❤️ by Cursor, led by [Acejack7](https://github.com/Acejack7)
