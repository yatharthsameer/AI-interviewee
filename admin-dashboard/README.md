# AI Interview Token Tracking & Admin Dashboard

A comprehensive token tracking system for your AI interview application that monitors usage across OpenAI and Gemini models, provides cost estimation, and includes user management capabilities.

## 🚀 Features

### Token Tracking
- **Real-time Usage Monitoring**: Track token consumption for both OpenAI and Gemini models
- **Cost Estimation**: Automatic cost calculation based on current model pricing
- **Per-User Analytics**: Individual usage statistics and limits
- **Model Breakdown**: Usage analytics per AI model and endpoint

### Admin Dashboard
- **User Management**: View all users, their usage, and block/unblock functionality
- **Visual Analytics**: Charts and graphs showing usage patterns
- **Usage Limits**: Set and monitor daily/monthly token limits per user
- **Real-time Statistics**: Live dashboard with key metrics

### Security & Management
- **JWT Authentication**: Secure admin access
- **User Blocking**: Prevent abuse by blocking excessive users
- **Usage Limits**: Configurable daily and monthly limits
- **Audit Trail**: Complete history of token usage and costs

## 📁 Project Structure

```
ai-interview-mvp/
├── electronbackend/          # Enhanced backend with token tracking
│   ├── auth.py              # User authentication & database management
│   ├── token_tracker.py     # Token tracking utilities
│   ├── server.py           # Main Flask server with tracking endpoints
│   └── users.db            # SQLite database (enhanced schema)
├── admin-dashboard/         # React admin dashboard
│   ├── src/
│   │   ├── components/     # React components
│   │   ├── context/       # Authentication context
│   │   └── index.css      # Styling
│   ├── package.json
│   └── vite.config.js
└── README.md               # This file
```

## 🛠️ Setup Instructions

### 1. Backend Setup (Enhanced)

The backend has been enhanced with token tracking capabilities. The existing backend in `electronbackend/` now includes:

**New Database Schema:**
- `token_usage` table for tracking API calls
- Enhanced `users` table with blocking functionality
- Automatic database migration on startup

**No additional setup required** - the existing backend will automatically:
- Create new database tables on first run
- Start tracking token usage for protected endpoints
- Enable admin APIs for the dashboard

### 2. Admin Dashboard Setup

Navigate to the admin dashboard directory and install dependencies:

```bash
cd admin-dashboard
npm install
```

Start the development server:

```bash
npm run dev
```

The dashboard will be available at `http://localhost:3001`

### 3. Environment Variables

Ensure your `.env` file in `electronbackend/` includes:

```env
GEMINI_API_KEY=your_gemini_api_key
CHATGPT_API_KEY=your_openai_api_key
JWT_SECRET=your_jwt_secret_key
```

## 🚦 Running the System

### Start Backend (if not already running):
```bash
cd electronbackend
python server.py
```

### Start Admin Dashboard:
```bash
cd admin-dashboard
npm run dev
```

### Access Points:
- **Main App**: `http://localhost:5002` (your existing Electron app)
- **Admin Dashboard**: `http://localhost:3001`
- **API Endpoints**: `http://localhost:5002/api/*`

## 📊 Admin Dashboard Features

### Login
- Use existing user credentials to access the admin panel
- JWT-based authentication with secure token storage

### Dashboard Overview
- **System Statistics**: Total users, active users, blocked users, costs
- **Usage Charts**: Visual representation of token usage by model
- **Cost Tracking**: Real-time cost monitoring and estimates

### User Management
- **User List**: View all registered users with usage statistics
- **User Details**: Detailed usage breakdown per user
- **Block/Unblock**: Manage user access to prevent abuse
- **Usage Limits**: Monitor daily and monthly limits

### Analytics
- **Token Usage Trends**: Historical usage patterns
- **Model Distribution**: Which AI models are used most
- **Cost Analysis**: Spending patterns and optimization opportunities

## 🔧 API Endpoints

### Admin Endpoints (Protected)
```
GET /api/admin/users                    # Get all users with usage summary
GET /api/admin/user/{id}/usage          # Get detailed user usage
POST /api/admin/user/{id}/block         # Block a user
POST /api/admin/user/{id}/unblock       # Unblock a user
GET /api/admin/stats                    # Get system statistics
```

### Enhanced Protected Endpoints
```
POST /api/chat_protected                # Chat with token tracking
POST /api/screenshot_protected          # Screenshot analysis with tracking
```

## 📈 Token Tracking Details

### Automatic Tracking
- **OpenAI Models**: Exact token counts from API responses
- **Gemini Models**: Estimated token counts based on text length and image processing
- **Cost Calculation**: Real-time cost estimation using current pricing

### Usage Limits
- **Daily Limit**: 100,000 tokens (configurable)
- **Monthly Limit**: 1,000,000 tokens (configurable)
- **Automatic Blocking**: Users exceeding limits receive 429 errors

### Data Storage
- **SQLite Database**: Lightweight, file-based storage
- **Indexed Queries**: Optimized for fast analytics
- **Historical Data**: Complete usage history preserved

## 🎛️ Configuration

### Adjust Token Limits
Edit `token_tracker.py`:
```python
def check_user_limits(self, user_id: int, daily_limit: int = 100000, 
                     monthly_limit: int = 1000000):
```

### Model Pricing Updates
Update `MODEL_PRICING` in `token_tracker.py`:
```python
MODEL_PRICING = {
    "gpt-4o": {"input": 0.005, "output": 0.015},
    "gemini-1.5-flash": {"input": 0.000075, "output": 0.0003},
    # Add new models here
}
```

## 🛡️ Security Features

### Authentication
- JWT-based authentication for admin access
- Secure token storage in localStorage
- Automatic token validation and refresh

### User Management
- Block/unblock functionality to prevent abuse
- Usage limit enforcement at API level
- Audit trail for all administrative actions

### Data Protection
- Secure database with proper indexing
- Input validation on all endpoints
- Error handling to prevent data leaks

## 📱 Mobile Responsive

The admin dashboard is fully responsive and works on:
- Desktop browsers
- Tablets
- Mobile devices

## 🔍 Monitoring & Alerts

### Built-in Monitoring
- Real-time usage statistics
- Cost tracking and alerts
- User activity monitoring

### Manual Oversight
- Admin dashboard for comprehensive overview
- Detailed user analytics
- Flexible time period analysis (7, 30, 90 days)

## 🚀 Deployment

### Production Considerations

1. **Database**: Consider upgrading to PostgreSQL for production
2. **Environment Variables**: Use proper secret management
3. **HTTPS**: Enable SSL for secure communication
4. **Monitoring**: Add additional logging and monitoring tools

### Build for Production
```bash
cd admin-dashboard
npm run build
```

## 📞 Support

### Common Issues

1. **Database Connection**: Ensure `users.db` has proper permissions
2. **API Connectivity**: Check that backend is running on port 5002
3. **Authentication**: Verify JWT_SECRET is set and consistent

### Troubleshooting

- Check browser console for frontend errors
- Monitor backend logs for API issues
- Verify database schema with SQLite browser

## 🔄 Updates & Maintenance

### Regular Tasks
- Monitor token usage and costs
- Review and adjust user limits as needed
- Update model pricing in configuration
- Regular database cleanup (if needed)

### Feature Additions
The system is designed to be extensible:
- Add new AI models to tracking
- Implement additional analytics
- Extend user management features
- Add automated alerts and notifications

---

## 🎉 Quick Start Summary

1. **Backend**: Already enhanced - just restart if running
2. **Frontend**: `cd admin-dashboard && npm install && npm run dev`
3. **Access**: Dashboard at `http://localhost:3001`
4. **Login**: Use existing user credentials
5. **Monitor**: View real-time usage and manage users

Your token tracking system is now ready! 🚀 