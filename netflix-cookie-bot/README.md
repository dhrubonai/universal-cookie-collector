# 🎬 Netflix Cookie Bot - Professional Edition

A **production-grade** Telegram bot for distributing Netflix cookies with advanced features including channel verification, rate limiting, anti-abuse systems, and admin controls.

## ✨ Features

### 🔐 **Security & Access Control**
- ✅ Channel join requirement (users must join your channel)
- ✅ Real-time membership verification
- ✅ Automatic ban system for violators
- ✅ Screenshot verification for reports

### 📊 **Rate Limiting & Anti-Abuse**
- ⏱️ Configurable cooldown (default: 10 minutes)
- 📈 Daily limit per user (default: 5 cookies/day)
- 🚫 Auto-ban for rapid requests (3+ in 30 seconds)
- 🚫 Auto-ban for fake screenshots
- 🔄 Automatic daily counter reset

### 🎯 **Cookie Distribution**
- 📱 Device-specific cookies (Mobile/PC/TV)
- 🔗 Direct browser links for cookies
- ✅ One-time use (mark as used after claim)
- 📝 Working/Not Working status tracking

### 👨‍💼 **Admin Panel**
- 📤 JSON file upload for bulk cookie import
- 📊 Detailed statistics dashboard
- 🚫 Ban management system
- 📢 Broadcast messages to all users
- 📋 User management tools

## 🚀 Quick Start

### 1. Create Bot & Get Token
1. Open Telegram and search for **@BotFather**
2. Send `/newbot`
3. Follow instructions to create your bot
4. Copy the **Bot Token**

### 2. Setup Required Channel
1. Create a public channel (or use existing)
2. Add your bot as **admin** in the channel
3. Get channel ID using **@userinfobot**
4. Note the channel username (without @)

### 3. Deploy to Render (Free 24/7 Hosting)

#### Option A: Using Git Push (Recommended)

```bash
# Clone or navigate to project
cd netflix-cookie-bot

# Initialize git
git init
git add .
git commit -m "Initial commit"

# Create repository on GitHub and push
git remote add origin YOUR_GITHUB_REPO_URL
git push -u origin main
```

Then:
1. Go to [render.com](https://render.com)
2. Click **"New +"** → **"Web Service"**
3. Connect your GitHub repository
4. Configure:
   - **Runtime**: Python
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `python main.py`
5. Add environment variables (see below)
6. Click **"Deploy Web Service"**

#### Option B: Using Render CLI

```bash
# Install Render CLI
npm install -g render-cli

# Login
render login

# Deploy
render deploy --env ./render.yaml
```

### 4. Set Environment Variables

In Render dashboard, add these environment variables:

| Variable | Description | Example |
|----------|-------------|---------|
| `BOT_TOKEN` | Your bot token from BotFather | `123456789:ABCdefGHIjklMNOpqrsTUVwxyz` |
| `ADMIN_IDS` | Your Telegram ID(s), comma-separated | `123456789,987654321` |
| `REQUIRED_CHANNEL_USERNAME` | Your channel username | `MyNetflixChannel` |
| `CHANNEL_ID` | Numeric channel ID | `-1001234567890` |

### 5. Upload Cookies

Once bot is running:

1. Start a chat with your bot
2. Send `/admin`
3. Click **"📤 Upload Cookies"**
4. Send JSON file in this format:

```json
[
  {
    "data": {"cookie_string": "your_cookie_data_here"},
    "device": "mobile",
    "link": "https://netflix.com/cookie-link-1"
  },
  {
    "data": {"cookie_string": "another_cookie"},
    "device": "pc",
    "link": "https://netflix.com/cookie-link-2"
  },
  {
    "data": {"cookie_string": "tv_cookie"},
    "device": "tv",
    "link": "https://netflix.com/cookie-link-3"
  }
]
```

## 📁 Project Structure

```
netflix-cookie-bot/
├── main.py           # Main bot application
├── database.py       # SQLite database layer
├── config.py         # Configuration & constants
├── requirements.txt  # Python dependencies
├── render.yaml       # Render deployment config
├── .env.example      # Environment variables template
├── README.md         # This file
└── netflix_cookies.db # Database (auto-created)
```

## ⚙️ Configuration

Edit `config.py` to customize:

```python
# Rate Limiting
COOLDOWN_MINUTES = 10        # Time between requests
MAX_DAILY_COOKIES = 5        # Max cookies per user/day
RAPID_REQUEST_THRESHOLD = 3  # Requests before auto-ban
RAPID_REQUEST_WINDOW_SECONDS = 30  # Time window for detection

# Cookie Settings
COOKIE_EXPIRY_HOURS = 24     # How long cookies last
MARK_USED_AFTER_CLAIM = True # Mark as used after first claim

# Ban Settings
BAN_DURATION_DAYS = 7        # Default ban duration
AUTO_BAN_RAPID_REQUESTS = True
AUTO_BAN_FAKE_SCREENSHOTS = True
```

## 🎮 User Commands

| Command | Description |
|---------|-------------|
| `/start` | Start bot / Main menu |
| `/help` | Show help guide |
| `/rules` | View all rules |
| `/status` | Check your status |

## 👨‍💼 Admin Commands

| Command | Description |
|---------|-------------|
| `/admin` | Open admin panel |
| `/upload` | Upload JSON cookies |
| `/stats` | View detailed stats |
| `/bans` | Manage banned users |
| `/broadcast` | Send message to all users |
| `/unban <id>` | Unban specific user |

## 🔄 How It Works

```
User Flow:
┌─────────┐    ┌─────────────┐    ┌──────────────┐
│ /start  │ -> │ Join Channel │ -> │ Generate     │
└─────────┘    └─────────────┘    └──────────────┘
                                           │
                                    ┌──────┴──────┐
                                    ▼             ▼
                              ┌──────────┐  ┌──────────┐
                              │ Mobile   │  │ PC/TV    │
                              └──────────┘  └──────────┘
                                    │             │
                                    ▼             ▼
                              ┌──────────────────────┐
                              │ Get Cookie Link      │
                              │ Report Status        │
                              │ Submit Screenshot    │
                              └──────────────────────┘
```

## 🛡️ Security Features

### Anti-Abuse System
1. **Rate Limiting**: Prevents spam requests
2. **Cooldown System**: Forces wait time between claims
3. **Daily Limits**: Caps total claims per day
4. **Rapid Detection**: Auto-bans burst requesters
5. **Screenshot Verification**: Ensures legitimate reports

### Ban System
- **Temporary Bans**: For first offenses
- **Permanent Bans**: For repeat offenders
- **Auto-Ban**: For detected abuse patterns
- **Manual Ban**: Admin can ban/unban users
- **Ban History**: Complete audit trail

## 📊 Database Schema

### Users Table
- Telegram ID, username, name
- Admin/banned status
- Daily claim counters
- Join timestamps

### Cookies Table
- Cookie data (JSON)
- Device type (mobile/pc/tv)
- Used/not used status
- Working/not working status
- Screenshot references

### Claims Table
- User-cookie mapping
- Claim timestamp
- Status report tracking

### Rate Limits Table
- Request logging
- Abuse detection data

### Ban History
- Complete ban audit trail
- Active/inactive tracking

## 🌐 Free Hosting Options

### Render.com (Recommended) ✅
- **Free tier available**
- 750 hours/month free
- Auto-deploy from GitHub
- Easy environment variable setup
- **Limitation**: Spins down after inactivity (use cron to keep alive)

### Alternative Hosts:
- **Railway.app** - Free tier, good for small bots
- **PythonAnywhere** - Always free for one worker
- **Fly.io** - Free tier with VM resources
- **Koyeb** - Free tier available

### Keeping Bot Alive on Render:
Render free tier spins down after 15 min inactivity. Solutions:
1. Use [uptimerobot.com](https://uptimerobot.com) (free) to ping every 5 min
2. Set up a simple cron job
3. Upgrade to paid ($7/mo) for always-on

## 🔧 Troubleshooting

### Bot not responding?
- Check BOT_TOKEN is correct
- Verify bot is running (check Render logs)
- Ensure webhook/polling is active

### Channel check failing?
- Make sure bot is channel admin
- Verify CHANNEL_ID is correct (numeric, starts with -100)
- Check channel is public

### Database errors?
- Check DB_PATH is writable
- Verify SQLite is installed
- Look at logs for specific errors

### Rate limiting too strict?
- Edit COOLDOWN_MINUTES in config.py
- Adjust MAX_DAILY_COOKIES
- Redeploy after changes

## 📝 License

This project is for educational purposes. Use responsibly.

## 🤝 Support

For issues or questions:
- Create an issue on GitHub
- Contact admin via Telegram

---

**Built with ❤️ using python-telegram-bot**
