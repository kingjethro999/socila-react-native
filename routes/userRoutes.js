const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const router = express.Router();

// Register route
router.post('/register', async (req, res) => {
    try {
        // Validate required fields
        if (!req.body.username || !req.body.email || !req.body.password) {
            return res.status(400).json({ message: 'All fields are required' });
        }

        // Check if user already exists
        const existingUser = await User.findOne({ email: req.body.email });
        if (existingUser) {
            return res.status(400).json({ message: 'User already exists' });
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(req.body.password, salt);

        // Create new user
        const newUser = new User({
            username: req.body.username,
            email: req.body.email,
            password: hashedPassword,
            profilePicture: req.body.profilePicture || '',
        });

        // Save user
        const savedUser = await newUser.save();

        // Generate token
        const token = jwt.sign(
            { userId: savedUser._id },
            'your-secret-key',
            { expiresIn: '30d' }
        );

        // Return user data (excluding password) and token
        const { password, ...userData } = savedUser._doc;
        res.status(201).json({
            message: 'User registered successfully',
            token,
            user: userData
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ message: 'Error creating user' });
    }
});

// Login route
router.post('/login', async (req, res) => {
    try {
        // Validate required fields
        if (!req.body.email || !req.body.password) {
            return res.status(400).json({ message: 'All fields are required' });
        }

        // Find user
        const user = await User.findOne({ email: req.body.email });
        if (!user) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        // Verify password
        const validPassword = await bcrypt.compare(req.body.password, user.password);
        if (!validPassword) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        // Generate token
        const token = jwt.sign(
            { userId: user._id },
            'your-secret-key',
            { expiresIn: '30d' }
        );

        // Return user data (excluding password) and token
        const { password, ...userData } = user._doc;
        res.json({
            message: 'Login successful',
            token,
            user: userData
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Error during login' });
    }
});

// Get current user
router.get('/me', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ message: 'No token provided' });
        }

        const decoded = jwt.verify(token, 'your-secret-key');
        const user = await User.findById(decoded.userId).select('-password');
        
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.json({ user });
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({ message: 'Error fetching user data' });
    }
});

module.exports = router;
