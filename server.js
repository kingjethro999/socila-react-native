const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { createServer } = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
require('dotenv').config();

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
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files from uploads directory
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Add request logging middleware
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

// API Routes
app.use('/api/chats', chatRoutes);
app.use('/api/users', userRoutes);
app.use('/api/posts', postRoutes);

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
    logError(err, 'global-error-handler');
    
    // Handle multer errors
    if (err.name === 'MulterError') {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ message: 'File is too large' });
        }
        return res.status(400).json({ message: 'Error uploading file' });
    }

    // Handle specific types of errors
    if (err instanceof mongoose.Error.ValidationError) {
        return res.status(400).json({ 
            message: 'Validation error',
            errors: Object.values(err.errors).map(e => e.message)
        });
    }

    // Default error response
    res.status(err.status || 500).json({
        message: err.message || 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? err : {}
    });
});

// MongoDB connection with retry logic
async function connectWithRetry(retries = 5, delay = 5000) {
    for (let i = 0; i < retries; i++) {
        try {
            await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/social-media-db', {
                useNewUrlParser: true,
                useUnifiedTopology: true
            });
            console.log('MongoDB connected successfully');
            break;
        } catch (err) {
            if (i === retries - 1) {
                console.error('Failed to connect to MongoDB:', err);
                process.exit(1);
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
        
        const port = process.env.PORT || 3000;
        httpServer.listen(port, () => {
            console.log(`Server running on port ${port}`);
        });

        httpServer.on('error', (error) => {
            logError(error, 'http-server');
            if (error.syscall !== 'listen') {
                throw error;
            }
            process.exit(1);
        });
    } catch (error) {
        logError(error, 'server-startup');
        process.exit(1);
    }
}

startServer();