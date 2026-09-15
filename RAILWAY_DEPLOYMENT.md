# Railway Deployment Guide for WhatsApp CRM

## 🚀 Quick Start - 5 Minute Deployment

### Step 1: Create Railway Account
1. Go to https://railway.app/
2. Sign up with GitHub (recommended)
3. Verify email if required

### Step 2: Connect GitHub Repository
1. Click "New Project" → "Deploy from GitHub repo"
2. Authorize Railway to access your GitHub
3. Select repository: `thegreatkudu/whatscrm`
4. Click "Import"

### Step 3: Add MySQL Database
1. In your project dashboard, click "New Service"
2. Select "Database" → "MySQL"
3. Wait for database to be provisioned (1-2 minutes)

### Step 4: Import Database Schema
1. Click on the MySQL service → "Console" tab
2. Click "Open Console"
3. Copy the content from `/home/kuduu/Downloads/import.sql/import.sql`
4. Paste into the console and execute
5. Wait for import to complete

### Step 5: Configure Environment Variables
1. Click on your main Node.js service
2. Go to "Variables" tab
3. Add these variables:

```bash
# Server Configuration
PORT=8001
NODE_ENV=production

# Database (Get these from your MySQL service variables)
DBHOST=${MYSQLHOST}
DBNAME=${MYSQLDATABASE}
DBUSER=${MYSQLUSER}
DBPASS=${MYSQLPASSWORD}
DBPORT=${MYSQLPORT}

# JWT Configuration
JWTKEY=generate-a-secure-random-jwt-secret-key-here

# Frontend/Backend URLs
FRONTENDURI=${RAILWAY_PUBLIC_DOMAIN}
BACKURI=${RAILWAY_PUBLIC_DOMAIN}

# Stripe Configuration
STRIPE_LANG=en

# Add your API keys for integrations:
# TELEGRAM_APP_ID=your-telegram-app-id
# TELEGRAM_APP_HASH=your-telegram-app-hash
# INSTAGRAM_APP_ID=your-instagram-app-id
# INSTAGRAM_APP_SECRET=your-instagram-app-secret
# MESSENGER_APP_ID=your-messenger-app-id
# MESSENGER_APP_SECRET=your-messenger-app-secret
# OPENAI_API_KEY=your-openai-api-key
# GOOGLE_API_KEY=your-google-api-key
# ELEVENLABS_API_KEY=your-elevenlabs-api-key
```

**Note**: Railway automatically provides database connection variables like `${MYSQLHOST}`, `${MYSQLDATABASE}`, etc. You can use these directly.

### Step 6: Deploy
1. Click "Deploy" or "Redeploy"
2. Wait for deployment to complete (2-5 minutes)
3. Monitor logs in the "Logs" tab

### Step 7: Access Your Application
1. Once deployed, Railway will provide a URL
2. Access at: `https://your-project-name.up.railway.app`
3. Login with:
   - Admin: `admin@admin.com` / `admin123`
   - User: `user@user.com` / `user123`

## 🔧 Railway Configuration

The project includes a `railway.json` file with optimal configuration:

```json
{
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "node server.js",
    "healthcheckPath": "/",
    "healthcheckTimeout": 300,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

## 📊 Monitoring & Management

### View Logs
- Go to your service → "Logs" tab
- Real-time application logs
- Error tracking and debugging

### Metrics
- Go to your service → "Metrics" tab
- CPU usage, memory usage
- Network traffic
- Database performance

### Scale Up
- Go to your service → "Settings"
- Adjust CPU and memory allocation
- Scale based on traffic needs

## 🌐 Custom Domain Setup

1. Go to "Settings" → "Networking"
2. Click "Add Domain"
3. Enter your custom domain (e.g., `crm.yourdomain.com`)
4. Update DNS records as instructed:
   - CNAME record pointing to Railway's domain
5. Wait for SSL certificate to be issued (usually 5-10 minutes)

## 💰 Pricing

Railway offers:
- **Free Trial**: $5 credit for new users
- **Starter Plan**: $5/month (suitable for testing)
- **Production**: Variable based on usage

MySQL database costs are included in the service pricing.

## 🔒 Security Tips

1. **Change default passwords** immediately after first login
2. **Use strong JWT key** for production
3. **Enable Railway's environment variables** for sensitive data
4. **Keep API keys secure** and rotate them regularly
5. **Use custom domain** with SSL for production

## 🐛 Troubleshooting

### Database Connection Issues
- Verify database variables are correctly set
- Check MySQL service is running
- Ensure database schema was imported successfully

### Deployment Failures
- Check build logs for errors
- Verify `package.json` has correct scripts
- Ensure all dependencies are in `package.json`

### Application Not Starting
- Check logs in the "Logs" tab
- Verify PORT is set correctly
- Ensure database connection is working

### API Errors
- Verify environment variables are set
- Check database tables exist
- Verify JWT key is set correctly

## 📈 Performance Optimization

1. **Enable Railway's caching** for static assets
2. **Use Railway's CDN** for global performance
3. **Scale database** based on traffic
4. **Monitor metrics** regularly
5. **Optimize database queries** if needed

## 🔄 Continuous Deployment

Railway automatically deploys when you push to GitHub:
1. Make changes to your code
2. Commit and push to GitHub
3. Railway automatically detects changes
4. Redeploys automatically
5. Zero-downtime deployments

## 📞 Support

- Railway Documentation: https://docs.railway.app/
- Railway Discord: https://discord.gg/railway
- GitHub Issues: https://github.com/railwayapp

## ✅ Advantages of Railway for This Project

- ✅ **Native MySQL Support** - No database migration needed
- ✅ **GitHub Integration** - Automatic deployments
- ✅ **Background Processes** - Campaign loops work properly
- ✅ **Socket.IO Support** - Real-time features work
- ✅ **File Storage** - Persistent storage available
- ✅ **Easy Setup** - 5-minute deployment
- ✅ **No Code Changes** - Works as-is
- ✅ **Cost Effective** - Pay for what you use
- ✅ **Scalable** - Scale based on needs
- ✅ **Monitoring** - Built-in metrics and logs

## 🎯 Next Steps After Deployment

1. **Test all features** thoroughly
2. **Configure integrations** (WhatsApp, Telegram, etc.)
3. **Set up custom domain**
4. **Configure payment gateways**
5. **Set up monitoring alerts**
6. **Test with real users**
7. **Scale based on traffic**

Your WhatsApp CRM will be fully functional on Railway with all features working as designed!