const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const auth = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();

// Secret key for JWT
const JWT_SECRET = 'your-secret-key';

// Configure multer for profile picture uploads
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: function(req, file, cb) {
        cb(null, uploadsDir);
    },
    filename: function(req, file, cb) {
        const ext = path.extname(file.originalname);
        cb(null, `profile-${uuidv4()}${ext}`);
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only images are allowed.'));
        }
    }
});

// Register route
router.post('/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;

        // Check if user already exists
        let user = await User.findOne({ email });
        if (user) {
            return res.status(400).json({ message: 'User already exists' });
        }

        // Create new user
        user = new User({
            username,
            email,
            password
        });

        // Hash password
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(password, salt);

        // Save user
        await user.save();

        // Create token with userId field
        const token = jwt.sign(
            { userId: user._id },
            JWT_SECRET,
            { expiresIn: '30d' }
        );

        // Remove password from response
        const userResponse = user.toObject();
        delete userResponse.password;

        res.status(201).json({
            token,
            user: userResponse
        });
    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ message: 'Server error during registration' });
    }
});

// Login route
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // Check if user exists
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        // Validate password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        // Create token with userId field
        const token = jwt.sign(
            { userId: user._id },
            JWT_SECRET,
            { expiresIn: '30d' }
        );

        // Remove password from response
        const userResponse = user.toObject();
        delete userResponse.password;

        // Log the generated token
        console.log('Generated token:', token);
        console.log('User ID:', user._id);

        res.json({
            token,
            user: userResponse
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Server error during login' });
    }
});

// Get current user
router.get('/me', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select('-password');
        res.json(user);
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({ message: 'Server error getting user data' });
    }
});

// Update user profile
router.put('/profile', auth, async (req, res) => {
    try {
        const { username, email, bio, profilePicture } = req.body;
        const user = await User.findById(req.user._id);

        if (username) user.username = username;
        if (email) user.email = email;
        if (bio) user.bio = bio;
        if (profilePicture) user.profilePicture = profilePicture;

        await user.save();

        // Remove password from response
        const userResponse = user.toObject();
        delete userResponse.password;

        res.json(userResponse);
    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({ message: 'Server error updating profile' });
    }
});

// Test route for profile picture endpoint
router.get('/profile-picture', (req, res) => {
    res.json({
        message: 'Profile picture endpoint is working',
        method: req.method,
        path: req.path,
        headers: req.headers,
        instructions: 'This endpoint only accepts POST requests with a profile picture file',
        expectedFormat: {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer your-token-here'
            },
            body: 'FormData with profilePicture field'
        }
    });
});

// Profile picture upload route
router.post('/profile-picture', auth, upload.single('profilePicture'), async (req, res) => {
    try {
        console.log('Received profile picture update request:', {
            file: req.file,
            userId: req.user._id,
            headers: req.headers,
            body: req.body
        });

        if (!req.file) {
            return res.status(400).json({ 
                message: 'No file uploaded',
                received: {
                    headers: req.headers,
                    body: req.body
                }
            });
        }

        const user = await User.findById(req.user._id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Delete old profile picture if it exists
        if (user.profilePicture) {
            const oldPicturePath = path.join(uploadsDir, path.basename(user.profilePicture));
            if (fs.existsSync(oldPicturePath)) {
                fs.unlinkSync(oldPicturePath);
            }
        }

        // Update user's profile picture URL
        const profilePictureUrl = `/uploads/${req.file.filename}`;
        user.profilePicture = profilePictureUrl;
        await user.save();

        res.json({
            message: 'Profile picture updated successfully',
            profilePicture: profilePictureUrl
        });
    } catch (error) {
        console.error('Profile picture update error:', error);
        res.status(500).json({ 
            message: 'Error updating profile picture',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

module.exports = router;
