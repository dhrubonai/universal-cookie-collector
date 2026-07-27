# 🚀 Quick Deploy Guide - Universal Cookie Collector

## ✅ Code is Ready!
Your complete system is built and pushed to GitHub:

**GitHub Repository:** https://github.com/dhrubonai/universal-cookie-collector

---

## 📋 Method 1: One-Click Render Deployment (Easiest!)

### Step 1: Go to Render
1. Open **https://dashboard.render.com** in your browser
2. Login with your account (michael.tenenbaum@yahoo.fr)

### Step 2: Create New Service
1. Click **"New +"** button (top right)
2. Select **"Web Service"**

### Step 3: Connect GitHub
1. Click **"Connect GitHub repository"**
2. Find and select: **`universal-cookie-collector`**
3. Click **"Connect"**

### Step 4: Configure Settings
Fill in these settings:

| Setting | Value |
|---------|-------|
| **Name** | `cookie-collector` |
| **Region** | `Singapore (closest to you)` or `US East` |
| **Branch** | `main` |
| **Runtime** | `Python 3` |
| **Build Command** | `pip install -r requirements.txt` |
| **Start Command** | `python main.py` |

### Step 5: Add Environment Variable
1. Scroll down to **"Advanced"**
2. Click **"Add Environment Variable"**
3. Key: `PORT`
4. Value: `8000`

### Step 6: Deploy!
1. Click **"Create Web Service"** at the bottom
2. Wait 2-3 minutes for build...
3. **Your site will be LIVE!** 🔥

---

## 📱 Method 2: Manual Deploy via render.yaml

If you have the **Render CLI** installed:

```bash
# Install Render CLI (if not installed)
npm install -g render-cli

# Login
render login

# Deploy!
render deploy --env PORT=8000
```

---

## 🌐 After Deployment

Once deployed, you'll get a URL like:
```
https://cookie-collector.onrender.com
```

### Access Your Dashboard:
1. Open that URL in **any browser** (Android, iOS, Desktop)
2. You'll see the beautiful dashboard with:
   - 🎬 Netflix / 📺 Hotstar / 📦 Prime / 🍜 Crunchyroll selector
   - Quantity input field (1-500)
   - Start button
   - Live cookie display area
   - Copy buttons for each cookie!

---

## ⚠️ First Run - Telegram Login Required

**Important:** When you first access the site, it will ask for Telegram login:

1. Open the URL
2. Enter your **phone number** when prompted
3. Enter the **code** you receive on Telegram
4. This creates a session (only needed once!)

After login, the cookie collector will work automatically!

---

## 🎯 Features Available

✅ **Multi-Service Support:**
- Netflix cookies
- Jio Hotstar/Disney+ cookies  
- Amazon Prime Video cookies
- Crunchyroll cookies

✅ **Web Dashboard:**
- Beautiful dark theme UI
- Mobile-friendly (works on Android!)
- Real-time progress bar
- Live log display

✅ **Cookie Management:**
- View all collected cookies
- Copy individual cookies
- Copy ALL cookies at once
- Export to JSON file
- Clear all cookies

---

## 🔧 Troubleshooting

### "Service Not Starting"
- Check logs in Render Dashboard → Your Service → Logs
- Make sure start command is: `python main.py`

### "Telegram Connection Failed"
- First run requires phone verification
- Check if API credentials are correct in main.py

### "Free Tier Sleeps"
- Render free tier sleeps after 15 min inactivity
- Upgrade to Starter ($7/mo) for always-on

---

## 💡 Tips

1. **Bookmark your Render URL** for easy access
2. **Collection takes time** - each cookie needs 2-5 seconds
3. **Start small** - try 10 cookies first, then increase
4. **Copy immediately** - cookies may expire!

---

## 📞 Need Help?

- **GitHub Issues:** https://github.com/dhrubonai/universal-cookie-collector/issues
- **Render Docs:** https://render.com/docs

---

**Made with ❤️ for educational purposes only!**
