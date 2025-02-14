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
            .sort({ createdAt: -1 })
            .lean();

        // Add isLiked field and convert media URLs to absolute
        const postsWithMetadata = posts.map(post => ({
            ...post,
            isLiked: post.likes.includes(req.user._id),
            media: post.media.map(mediaPath => {
                if (!mediaPath.startsWith('http')) {
                    return `${req.protocol}://${req.get('host')}/uploads/${mediaPath}`;
                }
                return mediaPath;
            })
        }));

        res.json(postsWithMetadata);
    } catch (err) {
        console.error('Error fetching posts:', err);
        res.status(500).json({ 
            message: 'Failed to fetch posts',
            error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
        });
    }
});

// Create a new post
router.post('/', auth, upload.array('media', 5), async (req, res) => {
    try {
        const { content, allowComments } = req.body;
        
        // Get uploaded file paths
        const mediaFiles = req.files ? req.files.map(file => file.filename) : [];

        // Validate that either content or media is present
        if (!content && mediaFiles.length === 0) {
            return res.status(400).json({ message: 'Post must have either content or media' });
        }

        // Create new post
        const post = new Post({
            userId: req.user._id,
            content,
            media: mediaFiles,
            allowComments: allowComments === 'true'
        });

        await post.save();

        // Populate user details and convert media URLs
        const populatedPost = await Post.findById(post._id)
            .populate('userId', 'username profilePicture')
            .lean();

        // Convert media URLs to absolute URLs
        populatedPost.media = populatedPost.media.map(mediaPath => {
            if (!mediaPath.startsWith('http')) {
                return `${req.protocol}://${req.get('host')}/uploads/${mediaPath}`;
            }
            return mediaPath;
        });

        res.status(201).json(populatedPost);
    } catch (err) {
        console.error('Error creating post:', err);
        if (req.files) {
            // Clean up uploaded files if post creation fails
            req.files.forEach(file => {
                fs.unlink(file.path, (unlinkErr) => {
                    if (unlinkErr) console.error('Error deleting file:', unlinkErr);
                });
            });
        }
        res.status(500).json({ 
            message: 'Failed to create post',
            error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
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

        const userLikedIndex = post.likes.indexOf(req.user._id);
        if (userLikedIndex === -1) {
            post.likes.push(req.user._id);
        } else {
            post.likes.splice(userLikedIndex, 1);
        }

        await post.save();
        res.json({ 
            likes: post.likes.length,
            isLiked: userLikedIndex === -1
        });
    } catch (err) {
        console.error('Error liking/unliking post:', err);
        res.status(500).json({ 
            message: 'Failed to like/unlike post',
            error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
        });
    }
});

module.exports = router;
