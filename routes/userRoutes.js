const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Register
router.post('/register', async (req, res) => {
    try {
        console.log('Registration request received:', req.body);

        // Validate required fields
        if (!req.body.username || !req.body.email || !req.body.password) {
            return res.status(400).json({
                message: 'All fields are required'
            });
        }

        // Check if user already exists
        const existingUser = await User.findOne({
            $or: [
                { email: req.body.email },
                { username: req.body.username }
            ]
        });

        if (existingUser) {
            return res.status(400).json({
                message: 'Username or email already exists'
            });
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(req.body.password, salt);

        // Create new user
        const newUser = new User({
            username: req.body.username,
            email: req.body.email,
            password: hashedPassword
        });

        console.log('Saving new user:', {
            username: newUser.username,
            email: newUser.email
        });

        // Save user and return response
        const savedUser = await newUser.save();
        const { password, ...userResponse } = savedUser._doc;
        
        console.log('User saved successfully:', userResponse);
        res.status(200).json({
            message: 'Registration successful',
            user: userResponse
        });
    } catch (err) {
        console.error('Registration error:', err);
        if (err.code === 11000) {
            res.status(400).json({
                message: 'Username or email already exists'
            });
        } else {
            res.status(500).json({
                message: 'Registration failed',
                error: err.message
            });
        }
    }
});

// Login
router.post('/login', async (req, res) => {
    try {
        console.log('Login request received:', {
            email: req.body.email
        });

        // Validate required fields
        if (!req.body.email || !req.body.password) {
            return res.status(400).json({
                message: 'Email and password are required'
            });
        }

        // Find user
        const user = await User.findOne({ email: req.body.email });
        if (!user) {
            return res.status(404).json({
                message: 'User not found'
            });
        }

        // Check password
        const validPassword = await bcrypt.compare(req.body.password, user.password);
        if (!validPassword) {
            return res.status(400).json({
                message: 'Invalid password'
            });
        }

        // Generate token
        const token = jwt.sign({ id: user._id }, 'your_jwt_secret', {
            expiresIn: '30d'
        });

        // Return user data and token
        const { password, ...userResponse } = user._doc;
        console.log('Login successful:', userResponse);
        
        res.status(200).json({
            message: 'Login successful',
            user: userResponse,
            token
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({
            message: 'Login failed',
            error: err.message
        });
    }
});

module.exports = router;
