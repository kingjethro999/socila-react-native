const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
require('dotenv').config();

// Ensure required directories exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

const app = express();
const httpServer = http.createServer(app);

// Initialize Socket.IO with enhanced error handling
const io = new Server(httpServer, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST'],
        credentials: true
    }
});

// Enhanced error logging
const logError = (err, context) => {
    console.error(`Error in ${context}:`, {
        message: err.message,
        stack: err.stack,
        time: new Date().toISOString()
    });
};

// Socket.IO middleware for authentication
io.use((socket, next) => {
    try {
        const token = socket.handshake.auth.token;
        if (!token) {
            throw new Error('No token provided');
        }

        const decoded = jwt.verify(token, 'your-secret-key');
        socket.userId = decoded.userId;
        next();
    } catch (err) {
        logError(err, 'socket-auth');
        next(new Error('Authentication failed'));
    }
});

// Socket.IO connection handling with error handling
io.on('connection', (socket) => {
    console.log('User connected:', socket.userId);

    socket.on('join-chat', (chatId) => {
        try {
            socket.join(chatId);
            console.log(`User ${socket.userId} joined chat ${chatId}`);
        } catch (err) {
            logError(err, 'socket-join-chat');
        }
    });

    socket.on('leave-chat', (chatId) => {
        try {
            socket.leave(chatId);
            console.log(`User ${socket.userId} left chat ${chatId}`);
        } catch (err) {
            logError(err, 'socket-leave-chat');
        }
    });

    socket.on('error', (error) => {
        logError(error, 'socket-error');
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.userId);
    });
});

// Make io accessible to routes
app.set('io', io);

// Middleware
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files from uploads directory with caching and proper headers
app.use('/uploads', express.static(uploadsDir, {
    maxAge: '1d',
    etag: true,
    lastModified: true,
    setHeaders: (res, path) => {
        // Set proper content type for images and videos
        if (path.endsWith('.mp4') || path.endsWith('.mov')) {
            res.setHeader('Content-Type', 'video/mp4');
        } else if (path.endsWith('.jpg') || path.endsWith('.jpeg')) {
            res.setHeader('Content-Type', 'image/jpeg');
        } else if (path.endsWith('.png')) {
            res.setHeader('Content-Type', 'image/png');
        }
        // Enable CORS for media files
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cache-Control', 'public, max-age=86400'); // 1 day
    }
}));

// Add request logging middleware
app.use((req, res, next) => {
    console.log('Incoming request:', {
        method: req.method,
        path: req.path,
        headers: req.headers,
        body: req.method === 'POST' ? req.body : undefined
    });
    next();
});

// Health check route
app.get('/', (req, res) => {
    res.json({
        status: 'ok',
        message: 'Server is running',
        time: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development',
        routes: {
            profilePicture: '/api/users/profile-picture',
            uploads: '/uploads'
        }
    });
});

// Import routes
const userRoutes = require('./routes/userRoutes');
const postRoutes = require('./routes/postRoutes');
const chatRoutes = require('./routes/chatRoutes');

// Mount routes
app.use('/api/users', userRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/chats', chatRoutes);

// Health check endpoint
app.get('/health', async (req, res) => {
    try {
        const dbState = mongoose.connection.readyState;
        const dbStates = {
            0: 'disconnected',
            1: 'connected',
            2: 'connecting',
            3: 'disconnecting'
        };
        
        res.json({ 
            status: 'healthy',
            timestamp: new Date().toISOString(),
            mongodb: {
                status: dbStates[dbState]
            }
        });
    } catch (error) {
        logError(error, 'health-check');
        res.status(500).json({ status: 'error', message: 'Health check failed' });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Global error handler:', err);
    res.status(500).json({
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// MongoDB connection with retry logic
async function connectWithRetry(retries = 5, delay = 5000) {
    const MONGODB_URI = 'mongodb+srv://jethrojerrybj:jethro123@cluster0.cwsrk.mongodb.net/social-media-app?retryWrites=true&w=majority&appName=Cluster0';
    
    for (let i = 0; i < retries; i++) {
        try {
            console.log('Attempting to connect to MongoDB Atlas...');
            await mongoose.connect(MONGODB_URI, {
                serverSelectionTimeoutMS: 30000,
                socketTimeoutMS: 45000,
                connectTimeoutMS: 30000,
                heartbeatFrequencyMS: 5000
            });
            
            // Test the connection
            await mongoose.connection.db.admin().ping();
            console.log('MongoDB Atlas connected successfully');
            return;
        } catch (err) {
            console.error(`Failed to connect to MongoDB (attempt ${i + 1}/${retries}):`, {
                message: err.message,
                code: err.code,
                name: err.name
            });
            
            if (i === retries - 1) {
                console.error('All connection attempts failed. Exiting...');
                throw err;
            }
            
            console.log(`Retrying MongoDB connection in ${delay/1000} seconds...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

// Start server with enhanced error handling
async function startServer() {
    try {
        await connectWithRetry();
        
        const port = process.env.PORT || 10000;
        httpServer.listen(port, '0.0.0.0', () => {
            console.log(`Server running on port ${port}`);
            console.log(`Server URL: ${process.env.NODE_ENV === 'production' ? 'https://' : 'http://'}${process.env.RENDER_EXTERNAL_URL || `localhost:${port}`}`);
        });

        // Handle server errors
        httpServer.on('error', (error) => {
            console.error('Server error:', {
                message: error.message,
                code: error.code,
                syscall: error.syscall
            });
            
            if (error.syscall !== 'listen') {
                throw error;
            }

            // Handle specific listen errors
            switch (error.code) {
                case 'EACCES':
                    console.error(`Port ${port} requires elevated privileges`);
                    process.exit(1);
                    break;
                case 'EADDRINUSE':
                    console.error(`Port ${port} is already in use`);
                    process.exit(1);
                    break;
                default:
                    throw error;
            }
        });

        // Handle MongoDB disconnection
        mongoose.connection.on('disconnected', () => {
            console.error('MongoDB disconnected. Attempting to reconnect...');
            connectWithRetry();
        });

    } catch (error) {
        console.error('Failed to start server:', {
            message: error.message,
            code: error.code,
            name: error.name
        });
        process.exit(1);
    }
}

startServer();