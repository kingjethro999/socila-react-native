const express = require('express');
const router = express.Router();
const Chat = require('../models/Chat');
const Message = require('../models/Message');
const auth = require('../middleware/auth');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: function(req, file, cb) {
        cb(null, uploadsDir);
    },
    filename: function(req, file, cb) {
        cb(null, uuidv4() + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only images and videos are allowed.'));
        }
    }
});

// Error handling middleware
const handleError = (err, req, res) => {
    console.error('Chat routes error:', err);
    if (err instanceof multer.MulterError) {
        return res.status(400).json({ 
            message: 'File upload error',
            error: err.message
        });
    }
    if (err.name === 'ValidationError') {
        return res.status(400).json({ 
            message: 'Validation error',
            error: err.message
        });
    }
    res.status(500).json({ 
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
};

// Get all chats for current user
router.get('/', auth, async (req, res) => {
    try {
        console.log('Getting chats for user:', req.user._id);
        const chats = await Chat.find({
            participants: req.user._id
        })
        .populate('participants', 'username profilePicture')
        .populate('lastMessage')
        .sort('-updatedAt');

        console.log('Found chats:', chats.length);

        // Add unread count for each chat
        const chatsWithUnread = chats.map(chat => {
            const unreadInfo = chat.unreadCounts.find(
                uc => uc.user.toString() === req.user._id.toString()
            );
            return {
                ...chat.toObject(),
                unreadCount: unreadInfo ? unreadInfo.count : 0
            };
        });

        res.json({ chats: chatsWithUnread });
    } catch (error) {
        handleError(error, req, res);
    }
});

// Search chats
router.get('/search', auth, async (req, res) => {
    try {
        const query = req.query.q;
        console.log('Searching chats with query:', query);
        
        const chats = await Chat.find({
            participants: req.user._id
        })
        .populate({
            path: 'participants',
            match: {
                $or: [
                    { username: new RegExp(query, 'i') },
                    { email: new RegExp(query, 'i') }
                ]
            },
            select: 'username profilePicture'
        })
        .populate('lastMessage')
        .sort('-updatedAt');

        // Filter out chats where no participants matched the search
        const filteredChats = chats.filter(chat => 
            chat.participants.some(p => p !== null)
        );

        console.log('Found matching chats:', filteredChats.length);
        res.json({ chats: filteredChats });
    } catch (error) {
        handleError(error, req, res);
    }
});

// Get single chat
router.get('/:id', auth, async (req, res) => {
    try {
        console.log('Getting chat:', req.params.id);
        const chat = await Chat.findById(req.params.id)
            .populate('participants', 'username profilePicture')
            .populate('lastMessage');

        if (!chat) {
            return res.status(404).json({ message: 'Chat not found' });
        }

        if (!chat.participants.some(p => p._id.toString() === req.user._id.toString())) {
            return res.status(403).json({ message: 'Not authorized to view this chat' });
        }

        res.json({ chat });
    } catch (error) {
        handleError(error, req, res);
    }
});

// Get chat messages
router.get('/:id/messages', auth, async (req, res) => {
    try {
        console.log('Getting messages for chat:', req.params.id);
        const chat = await Chat.findById(req.params.id);
        if (!chat) {
            return res.status(404).json({ message: 'Chat not found' });
        }

        if (!chat.participants.includes(req.user._id)) {
            return res.status(403).json({ message: 'Not authorized to view these messages' });
        }

        const messages = await Message.find({ chat: req.params.id })
            .populate('sender', 'username profilePicture')
            .sort('-createdAt')
            .limit(50);

        console.log('Found messages:', messages.length);

        // Mark messages as read
        await Message.updateMany(
            {
                chat: req.params.id,
                sender: { $ne: req.user._id },
                readBy: { $ne: req.user._id }
            },
            { $addToSet: { readBy: req.user._id } }
        );

        // Update unread count
        await Chat.updateOne(
            { _id: req.params.id, 'unreadCounts.user': req.user._id },
            { $set: { 'unreadCounts.$.count': 0 } }
        );

        res.json({ messages });
    } catch (error) {
        handleError(error, req, res);
    }
});

// Send message
router.post('/:id/messages', auth, upload.single('media'), async (req, res) => {
    try {
        console.log('Sending message to chat:', req.params.id);
        const chat = await Chat.findById(req.params.id);
        if (!chat) {
            return res.status(404).json({ message: 'Chat not found' });
        }

        if (!chat.participants.includes(req.user._id)) {
            return res.status(403).json({ message: 'Not authorized to send messages in this chat' });
        }

        const messageData = {
            chat: req.params.id,
            sender: req.user._id,
            type: req.file ? (req.file.mimetype.startsWith('image/') ? 'image' : 'video') : 'text',
            readBy: [req.user._id]
        };

        if (req.file) {
            messageData.mediaUrl = `/uploads/${req.file.filename}`;
            console.log('Uploaded media:', messageData.mediaUrl);
        } else {
            if (!req.body.content) {
                return res.status(400).json({ message: 'Message content is required' });
            }
            messageData.content = req.body.content;
        }

        const message = await Message.create(messageData);
        const populatedMessage = await Message.findById(message._id)
            .populate('sender', 'username profilePicture');

        console.log('Created message:', message._id);

        // Update chat's last message and increment unread counts
        await Chat.updateOne(
            { _id: req.params.id },
            {
                lastMessage: message._id,
                $inc: {
                    'unreadCounts.$[elem].count': 1
                }
            },
            {
                arrayFilters: [{ 'elem.user': { $ne: req.user._id } }]
            }
        );

        // Emit message through socket if available
        const io = req.app.get('io');
        if (io) {
            io.to(req.params.id).emit('message', populatedMessage);
            console.log('Emitted message to room:', req.params.id);
        }

        res.status(201).json({ message: populatedMessage });
    } catch (error) {
        handleError(error, req, res);
    }
});

module.exports = router;
