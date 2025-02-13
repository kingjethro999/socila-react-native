const router = require('express').Router();
const Post = require('../models/Post');
const jwt = require('jsonwebtoken');

// Middleware to verify token
const verifyToken = (req, res, next) => {
    const token = req.headers.authorization;
    if (!token) return res.status(401).json("You are not authenticated!");

    try {
        const decoded = jwt.verify(token.split(" ")[1], 'your_jwt_secret');
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(403).json("Token is not valid!");
    }
};

// Create a post
router.post('/', verifyToken, async (req, res) => {
    try {
        const newPost = new Post({
            userId: req.user.id,
            caption: req.body.caption,
            image: req.body.image
        });
        const savedPost = await newPost.save();
        res.status(200).json(savedPost);
    } catch (err) {
        res.status(500).json(err);
    }
});

// Get all posts (feed)
router.get('/feed', verifyToken, async (req, res) => {
    try {
        const posts = await Post.find()
            .populate('userId', 'username profilePicture')
            .sort({ createdAt: -1 });
        res.status(200).json(posts);
    } catch (err) {
        res.status(500).json(err);
    }
});

// Like / Unlike a post
router.put('/:id/like', verifyToken, async (req, res) => {
    try {
        const post = await Post.findById(req.params.id);
        if (!post) {
            return res.status(404).json("Post not found");
        }

        if (post.likes.includes(req.user.id)) {
            await post.updateOne({ $pull: { likes: req.user.id } });
            res.status(200).json("Post has been unliked");
        } else {
            await post.updateOne({ $push: { likes: req.user.id } });
            res.status(200).json("Post has been liked");
        }
    } catch (err) {
        res.status(500).json(err);
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
            userId: req.user.id,
            text: req.body.text
        };

        await post.updateOne({ $push: { comments: newComment } });
        res.status(200).json("Comment has been added");
    } catch (err) {
        res.status(500).json(err);
    }
});

module.exports = router;
