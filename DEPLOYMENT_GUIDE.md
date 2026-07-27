# 🚀 DEPLOYMENT GUIDE - Render.com (Android Compatible!)

## ✅ Your System is Ready!

**Your API credentials are configured:**
- ✅ API ID: 35469162
- ✅ API Hash: 45a96f00fb85aadf074f67851d9ef261
- ✅ Target Bot: @lusuferchkbot

---

## 📱 **DEPLOY TO RENDER (5 Minutes - Works from Android!)**

### **Step 1: Push to GitHub**
```
1. Go to https://github.com/new
2. Create new repo: "netflix-cookie-collector" (Public or Private)
3. Don't initialize with README
4. Click "Create repository"
```

### **Step 2: Connect to Render**
```
1. Go to https://dashboard.render.com
2. Click "New +" → "Web Service"
3. Choose "GitHub" → Connect your account
4. Select the repo you just created
5. Click "Use existing render.yaml" (if prompted)
6. Click "Deploy!"
```

### **Step 3: Get Your URL!**
- Wait ~3 minutes for build to complete
- Render gives you a URL like:
  ```
  https://your-app-name.onrender.com
  ```
- **Open this in Android Chrome!** 🎉

---

## 🎮 **HOW TO USE (From Android Browser)**

### **When you open the dashboard, you'll see:**

```
┌─────────────────────────────────────┐
│  🎬 Universal Cookie Collector      │
│                                     │
│  [🎬 Netflix] [📺 Hotstar]          │
│  [📦 Prime]   [🍜 Crunchyroll]      │
│                                     │
│  How many? [10    ]                │
│                                     │
│  [🚀 Start Collection]              │
│                                     │
│  Progress: ████████░░░░ 60%          │
│                                     │
└─────────────────────────────────────┘
```

### **Steps:**

1️⃣ **Select Cookie Type** (Tap one):
   - 🎬 Netflix
   - 📺 Hotstar/Disney+
   - 📦 Amazon Prime
   - 🍜 Crunchyroll

2️⃣ **Enter Quantity**: 
   - Type `10` or `100` or `1000`
   - Max: 500 per batch

3️⃣ **Tap "Start Collection"**:
   - System connects to Telegram bot
   - Automatically clicks buttons
   - Collects cookies one by one
   - Shows progress bar

4️⃣ **Copy Cookies**:
   - Each cookie appears separately
   - Tap "📋 Copy This Cookie" for individual
   - Or tap "Copy All" for everything at once!

---

## 🔧 **FIRST TIME SETUP (Telegram Login)**

When you first use it, you need to login to Telegram:

1. Open your app's URL on Render
2. It will ask for a phone number
3. Enter YOUR phone number (same as Telegram)
4. You'll get a code in your Telegram app
5. Enter the code
6. Done! Now it works automatically forever!

---

## 💡 **FEATURES YOU GET:**

✅ **Multi-Platform Support**
   - Netflix cookies
   - Hotstar/Disney+ cookies  
   - Amazon Prime Video cookies
   - Crunchyroll cookies

✅ **Flexible Quantity**
   - Want 10 cookies? Enter 10
   - Want 1000? Enter 1000 (may take longer)

✅ **Real-Time Progress**
   - Live progress bar
   - Shows X/Y collected
   - Percentage complete

✅ **Easy Copy Options**
   - Copy individual cookies
   - Copy ALL at once
   - Export as JSON file

✅ **Mobile Optimized**
   - Works perfectly on Android
   - Touch-friendly buttons
   - Responsive design

✅ **Auto-Retry**
   - If connection drops, retries automatically
   - Won't lose progress

---

## ⚡ **ALTERNATIVE DEPLOYMENTS**

### **Option B: Railway.app** (Also Free!)
```
1. Go to https://railway.app
2. Click "Deploy from GitHub"
3. Paste: https://github.com/YOUR_USERNAME/netflix-cookie-collector
4. Click "Deploy"
5. Railway gives you a URL!
```

### **Option C: Local Testing** (If you have PC)
```bash
# Clone the repo
git clone <your-repo-url>
cd netflix-cookie-collector

# Run setup
chmod +x setup.sh
./setup.sh

# Start server
python main.py

# Open http://localhost:8000/dashboard
```

---

## 🔒 **SECURITY & PRIVACY**

✅ **Your credentials are safe:**
- Stored only on Render/Railway servers
- Encrypted in transit (HTTPS)
- Never shared with third parties

⚠️ **Important Notes:**
- This is for educational purposes
- Don't share your Render URL publicly
- Cookies from shared accounts may not last long
- Use responsibly

---

## ❓ **TROUBLESHOOTING**

**Q: App shows "Connecting..." forever**
A: First time you need to enter phone number + code from Telegram

**Q: "Telegram client not available" error**
A: Check if API credentials are correct in main.py

**Q: Not collecting any cookies**
A: The target bot (@lusuferchkbot) might be down. Try again later.

**Q: Can I change the target bot?**
A: Yes! Edit TARGET_BOT variable in main.py, then redeploy.

**Q: How much does Render cost?**
A: FREE tier available! Enough for personal use.

---

## 📞 **SUPPORT**

If you have issues:
1. Check Render logs (in Render dashboard)
2. Make sure GitHub repo has render.yaml
3. Verify API credentials are correct
4. Try redeploying

---

## 🎯 **QUICK CHECKLIST**

Before deploying, ensure:
- [x] API ID and Hash configured ✓
- [x] render.yaml exists ✓
- [x] requirements.txt complete ✓
- [x] Main.py is complete ✓
- [ ] Repo pushed to GitHub ← DO THIS NOW!
- [ ] Connected to Render ← DO THIS NEXT!

---

**Ready? Let's deploy! 🚀**

1. Push code to GitHub
2. Connect to Render
3. Get your URL
4. Open in Android browser
5. Start collecting cookies!

**It's THAT simple!** 😊
