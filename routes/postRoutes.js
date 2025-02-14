const express = require('express');
const Post = require('../models/Post');
const jwt = require('jsonwebtoken');

const router = express.Router();

// Middleware to verify token
const verifyToken = (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            return res.status(401).json({ message: "No token provided" });
        }

        const token = authHeader.split(" ")[1];
        if (!token) {
            return res.status(401).json({ message: "Invalid token format" });
        }

        const decoded = jwt.verify(token, 'your-secret-key');
        req.user = decoded;
        next();
    } catch (err) {
        console.error('Token verification error:', err);
        return res.status(403).json({ message: "Invalid or expired token" });
    }
};

// Create a post
router.post('/', verifyToken, async (req, res) => {
    try {
        console.log('Creating post with data:', req.body);
        console.log('User from token:', req.user);

        // Validate caption
        if (!req.body.caption) {
            return res.status(400).json({ message: 'Caption is required' });
        }

        // Create post object with required fields
        const postData = {
            userId: req.user.userId,
            caption: req.body.caption
        };

        // Add image if provided
        if (req.body.image) {
            postData.image = req.body.image;
        }

        const newPost = new Post(postData);
        const savedPost = await newPost.save();
        
        console.log('Post created successfully:', savedPost);

        res.status(201).json({
            message: 'Post created successfully',
            post: savedPost
        });
    } catch (err) {
        console.error('Error creating post:', err);
        res.status(500).json({
            message: 'Failed to create post',
            error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
        });
    }
});

// Get all posts (feed)
router.get('/feed', verifyToken, async (req, res) => {
    try {
        const posts = await Post.find()
            .populate('userId', 'username profilePicture')
            .sort({ createdAt: -1 });
        res.json({
            message: 'Feed retrieved successfully',
            posts
        });
    } catch (err) {
        console.error('Error fetching feed:', err);
        res.status(500).json({
            message: 'Failed to fetch feed',
            error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
        });
    }
});

// Like / Unlike a post
router.put('/:id/like', verifyToken, async (req, res) => {
    try {
        const post = await Post.findById(req.params.id);
        if (!post) {
            return res.status(404).json({ message: "Post not found" });
        }

        const isLiked = post.likes.includes(req.user.userId);
        if (isLiked) {
            await post.updateOne({ $pull: { likes: req.user.userId } });
            res.json({ message: "Post unliked successfully" });
        } else {
            await post.updateOne({ $push: { likes: req.user.userId } });
            res.json({ message: "Post liked successfully" });
        }
    } catch (err) {
        console.error('Error liking/unliking post:', err);
        res.status(500).json({
            message: 'Failed to like/unlike post',
            error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
        });
    }
});

// Add comment
router.post('/:id/comment', verifyToken, async (req, res) => {
    try {
        const post = await Post.findById(req.params.id);
        if (!post) {
            return res.status(404).json("Post not found");
        }

        const newComment = {
            userId: req.user.userId,
            text: req.body.text
        };

        await post.updateOne({ $push: { comments: newComment } });
        res.status(200).json("Comment has been added");
    } catch (err) {
        console.error('Error adding comment:', err);
        res.status(500).json({
            message: 'Failed to add comment',
            error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
        });
    }
});

module.exports = router;
