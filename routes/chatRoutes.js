const express = require('express');
const router = express.Router();
const Chat = require('../models/Chat');
const Message = require('../models/Message');
const auth = require('../middleware/auth');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: 'uploads/',
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
            cb(new Error('Invalid file type'));
        }
    }
});

// Get all chats for current user
router.get('/', auth, async (req, res) => {
    try {
        const chats = await Chat.find({
            participants: req.user._id
        })
        .populate('participants', 'username profilePicture')
        .populate('lastMessage')
        .sort('-updatedAt');

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
        console.error('Error getting chats:', error);
        res.status(500).json({ message: 'Error getting chats' });
    }
});

// Search chats
router.get('/search', auth, async (req, res) => {
    try {
        const query = req.query.q;
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

        res.json({ chats: filteredChats });
    } catch (error) {
        console.error('Error searching chats:', error);
        res.status(500).json({ message: 'Error searching chats' });
    }
});

// Get single chat
router.get('/:id', auth, async (req, res) => {
    try {
        const chat = await Chat.findById(req.query.id)
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
        console.error('Error getting chat:', error);
        res.status(500).json({ message: 'Error getting chat' });
    }
});

// Get chat messages
router.get('/:id/messages', auth, async (req, res) => {
    try {
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
        console.error('Error getting messages:', error);
        res.status(500).json({ message: 'Error getting messages' });
    }
});

// Send message
router.post('/:id/messages', auth, upload.single('media'), async (req, res) => {
    try {
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
        } else {
            messageData.content = req.body.content;
        }

        const message = await Message.create(messageData);
        const populatedMessage = await Message.findById(message._id)
            .populate('sender', 'username profilePicture');

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

        // Emit message through socket
        req.app.get('io').to(req.params.id).emit('message', populatedMessage);

        res.status(201).json({ message: populatedMessage });
    } catch (error) {
        console.error('Error sending message:', error);
        res.status(500).json({ message: 'Error sending message' });
    }
});

module.exports = router;
