const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const userRoutes = require('./routes/userRoutes');
const postRoutes = require('./routes/postRoutes');

const app = express();

// Middleware
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// MongoDB connection
const MONGODB_URI = "mongodb+srv://jethrojerrybj:seun2009@cluster0.cwsrk.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";

// MongoDB connection options
const options = {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    dbName: 'social-media-app'
};

// Connect to MongoDB
console.log('Connecting to MongoDB...');
mongoose.connect(MONGODB_URI, options)
    .then(() => {
        console.log('Successfully connected to MongoDB Atlas');
        console.log('Database:', mongoose.connection.db.databaseName);
    })
    .catch(err => {
        console.error('MongoDB connection error:', err);
        process.exit(1);
    });

// Basic routes
app.get('/', (req, res) => {
    res.json({ message: 'Welcome to Social Media API' });
});

app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy',
        mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
    });
});

// API routes
app.use('/api/users', userRoutes);
app.use('/api/posts', postRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ 
        message: 'Something went wrong!',
        error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on port ${PORT}`);
});
