const express = require('express');
const Post = require('../models/Post');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const auth = require('../middleware/auth');

const router = express.Router();

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for media uploads
const storage = multer.diskStorage({
    destination: function(req, file, cb) {
        cb(null, uploadsDir);
    },
    filename: function(req, file, cb) {
        const ext = path.extname(file.originalname);
        cb(null, `${uuidv4()}${ext}`);
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit per file
        files: 5 // Maximum 5 files
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'video/mp4', 'video/quicktime'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only images and videos are allowed.'));
        }
    }
});

// Get all posts
router.get('/', auth, async (req, res) => {
    try {
        console.log('Getting posts for user:', req.user._id);
        const posts = await Post.find()
            .populate('userId', 'username profilePicture')
            .sort({ createdAt: -1 });

        // Format posts with like status
        const formattedPosts = posts.map(post => {
            const isLiked = post.likes.includes(req.user._id);
            return {
                _id: post._id,
                text: post.text,
                media: post.media.map(filename => `${req.protocol}://${req.get('host')}/uploads/${filename}`),
                likes: post.likes,
                comments: post.comments,
                userId: post.userId,
                createdAt: post.createdAt,
                updatedAt: post.updatedAt,
                isLiked: isLiked
            };
        });

        res.json(formattedPosts);
    } catch (error) {
        console.error('Error getting posts:', error);
        res.status(500).json({ message: 'Error fetching posts' });
    }
});

// Create a new post
router.post('/', auth, upload.array('media', 5), async (req, res) => {
    try {
        console.log('Creating new post with data:', {
            text: req.body.text,
            mediaCount: req.files?.length || 0,
            userId: req.user._id
        });

        const { text } = req.body;

        if (!text && (!req.files || req.files.length === 0)) {
            return res.status(400).json({ message: 'Post must have either text or media' });
        }

        const media = req.files ? req.files.map(file => file.filename) : [];

        const post = new Post({
            text,
            media,
            userId: req.user._id
        });

        await post.save();
        await post.populate('userId', 'username profilePicture');

        console.log('Post created successfully:', post._id);

        res.status(201).json({
            _id: post._id,
            text: post.text,
            media: media.map(filename => `${req.protocol}://${req.get('host')}/uploads/${filename}`),
            likes: post.likes,
            comments: post.comments,
            userId: post.userId,
            createdAt: post.createdAt,
            updatedAt: post.updatedAt,
            isLiked: false
        });
    } catch (error) {
        console.error('Error creating post:', error);
        
        // Clean up uploaded files if post creation fails
        if (req.files) {
            req.files.forEach(file => {
                fs.unlink(path.join(uploadsDir, file.filename), err => {
                    if (err) console.error('Error deleting file:', err);
                });
            });
        }

        res.status(500).json({ 
            message: error.message || 'Error creating post',
            error: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// Like/unlike a post
router.post('/:id/like', auth, async (req, res) => {
    try {
        const post = await Post.findById(req.params.id);
        
        if (!post) {
            return res.status(404).json({ message: 'Post not found' });
        }

        const likeIndex = post.likes.indexOf(req.user._id);
        
        if (likeIndex === -1) {
            post.likes.push(req.user._id);
        } else {
            post.likes.splice(likeIndex, 1);
        }

        await post.save();
        
        res.json({
            likes: post.likes,
            isLiked: likeIndex === -1
        });
    } catch (error) {
        console.error('Error liking/unliking post:', error);
        res.status(500).json({ message: 'Error updating like status' });
    }
});

module.exports = router;
