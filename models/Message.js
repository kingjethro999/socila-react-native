const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    chat: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Chat',
        required: true
    },
    sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    type: {
        type: String,
        enum: ['text', 'image', 'video'],
        required: true
    },
    content: {
        type: String,
        required: function() {
            return this.type === 'text';
        }
    },
    mediaUrl: {
        type: String,
        required: function() {
            return this.type === 'image' || this.type === 'video';
        }
    },
    readBy: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }]
}, {
    timestamps: true
});

module.exports = mongoose.model('Message', messageSchema);
