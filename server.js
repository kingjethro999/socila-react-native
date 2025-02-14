const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { createServer } = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');

// Import routes
const userRoutes = require('./routes/userRoutes');
const postRoutes = require('./routes/postRoutes');
const chatRoutes = require('./routes/chatRoutes');

// Ensure required directories exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

const app = express();
const httpServer = createServer(app);

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
    credentials: true
}));

// Add request logging middleware
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

app.use(express.json({
    limit: '10mb',
    verify: (req, res, buf) => {
        try {
            JSON.parse(buf);
        } catch (e) {
            res.status(400).json({ message: 'Invalid JSON' });
            throw new Error('Invalid JSON');
        }
    }
}));

// Enhanced health check route
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
                status: dbStates[dbState],
                database: mongoose.connection.db?.databaseName,
                host: mongoose.connection.host
            },
            memory: process.memoryUsage(),
            uptime: process.uptime()
        });
    } catch (err) {
        logError(err, 'health-check');
        res.status(500).json({ status: 'unhealthy', error: err.message });
    }
});

// Routes with enhanced error handling
app.use('/api/chats', async (req, res, next) => {
    try {
        // Verify database connection before proceeding
        if (mongoose.connection.readyState !== 1) {
            throw new Error('Database connection not ready');
        }
        next();
    } catch (err) {
        logError(err, 'chat-route-middleware');
        res.status(503).json({ 
            message: 'Service temporarily unavailable',
            details: err.message
        });
    }
});

// Your existing routes here
app.use('/api/chats', chatRoutes);
app.use('/api/users', userRoutes);
app.use('/api/posts', postRoutes);

// Enhanced error handling middleware
app.use((err, req, res, next) => {
    logError(err, 'global-error-handler');
    
    // Handle specific types of errors
    if (err instanceof mongoose.Error.ValidationError) {
        return res.status(400).json({ 
            message: 'Validation Error', 
            details: err.errors 
        });
    }
    
    if (err.name === 'UnauthorizedError') {
        return res.status(401).json({ 
            message: 'Authentication Error',
            details: err.message
        });
    }

    // Default error response
    res.status(err.status || 500).json({ 
        message: err.message || 'Something went wrong!',
        error: process.env.NODE_ENV === 'development' ? {
            stack: err.stack,
            details: err.message
        } : 'Internal server error'
    });
});

// MongoDB configuration
const MONGODB_URI = "mongodb+srv://jethrojerrybj:seun2009@cluster0.cwsrk.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
const options = {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    dbName: 'social-media-app'
};

// MongoDB connection with retry logic
const connectWithRetry = async (retries = 5, delay = 5000) => {
    for (let i = 0; i < retries; i++) {
        try {
            await mongoose.connect(MONGODB_URI, {
                ...options,
                serverSelectionTimeoutMS: 5000,
                heartbeatFrequencyMS: 1000
            });
            console.log('Successfully connected to MongoDB Atlas');
            return true;
        } catch (err) {
            logError(err, 'mongodb-connection');
            console.log(`Retrying connection in ${delay/1000} seconds... (${i + 1}/${retries})`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    return false;
};

// Start server with enhanced error handling
const startServer = async () => {
    try {
        const connected = await connectWithRetry();
        if (!connected) {
            throw new Error('Failed to connect to MongoDB after multiple retries');
        }

        const PORT = process.env.PORT || 5000;
        httpServer.listen(PORT, '0.0.0.0', () => {
            console.log(`Server is running on port ${PORT}`);
            console.log(`Environment: ${process.env.NODE_ENV}`);
            console.log(`Database: ${mongoose.connection.db.databaseName}`);
        });
    } catch (err) {
        logError(err, 'server-startup');
        if (process.env.NODE_ENV !== 'production') {
            process.exit(1);
        }
    }
};

startServer();