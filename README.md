# WhatsApp CRM - Multi-Channel Communication Platform

A comprehensive Customer Relationship Management (CRM) platform for WhatsApp, Instagram, Telegram, and Facebook Messenger with intelligent automation, campaign management, and team collaboration features.

## Features

### Multi-Channel Messaging
- **WhatsApp Business API** - Official messaging with template support
- **WhatsApp QR (Baileys)** - Alternative WhatsApp connection via QR code
- **Instagram Business** - Instagram messaging and comment management
- **Telegram** - Telegram bot integration
- **Facebook Messenger** - Facebook Page messaging

### Automation & Chatbots
- Visual flow-based chatbot builder
- AI integration (OpenAI, Google Gemini, DeepSeek)
- Multi-platform chatbot deployment
- Interactive message support (buttons, lists)
- Session management for conversation state

### Campaign Management
- Template-based broadcast campaigns
- Phonebook-based contact segmentation
- Campaign scheduling with timezone support
- Real-time delivery tracking
- QR-based campaigns
- Campaign performance analytics

### Team Collaboration
- Agent account management
- Chat assignment and routing
- Activity tracking and performance analytics
- Quick reply templates
- Task management
- Permission controls

### Contact Management
- Centralized contact database
- Phonebook organization
- CSV import/export
- Custom field support
- Contact synchronization from platforms

### Analytics & Reporting
- Campaign performance reports
- Agent productivity tracking
- API usage monitoring
- Chat statistics and kanban board
- Export functionality

### Additional Features
- WhatsApp Forms builder
- WhatsApp Call AI with ElevenLabs integration
- API v2 for external integration
- Theme customization (13 themes available)
- Multi-language support (13 languages)
- Plan-based subscription model
- Multiple payment gateways (Stripe, PayPal, Razorpay, Paystack, MercadoPago)

## Technology Stack

- **Backend**: Node.js + Express.js
- **Database**: MySQL
- **Real-time**: Socket.IO
- **Authentication**: JWT + bcrypt
- **Media Processing**: FFmpeg + sharp
- **WhatsApp Library**: Baileys v7.0.0-rc14

## Installation

1. **Install dependencies**
```bash
npm install
```

2. **Configure environment variables**
```bash
cp .env.example .env
# Edit .env with your database credentials and API keys
```

3. **Set up database**
```bash
# Import the database schema from your SQL file
mysql -u root -p whatsapp_crm_db < import.sql
```

4. **Start the server**
```bash
npm start
```

The server will start on port 8001 (configurable via .env file).

## Default Credentials

After database import:
- **Admin**: admin@admin.com / admin123
- **User**: user@user.com / user123

**Important**: Change these passwords immediately after first login.

## User Roles

- **Admin**: Full system access, plan management, user oversight
- **User**: Workspace management, team configuration, campaign execution
- **Agent**: Assigned chat access, permission-based controls

## Documentation

For detailed system documentation, API information, and business proposals, see the project documentation.

## License

This is a commercial WhatsApp CRM platform. Please ensure you have the appropriate licenses and permissions for commercial use.

## Support

For technical support, contact the development team or refer to the documentation provided with your license.