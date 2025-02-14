const mongoose = require('mongoose');

const postSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    text: {
        type: String,
        trim: true
    },
    media: {
        type: [String],
        default: []
    },
    likes: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: []
    }],
    comments: [{
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        text: {
            type: String,
            required: true,
            trim: true
        },
        createdAt: {
            type: Date,
            default: Date.now
        }
    }]
}, {
    timestamps: true
});

// Add indexes
postSchema.index({ userId: 1, createdAt: -1 });
postSchema.index({ createdAt: -1 });

// Ensure either text or media is present
postSchema.pre('save', function(next) {
    if (!this.text && (!this.media || this.media.length === 0)) {
        next(new Error('Post must contain either text or media'));
        return;
    }
    next();
});

// Virtual for comment count
postSchema.virtual('commentCount').get(function() {
    return this.comments.length;
});

// Virtual for like count
postSchema.virtual('likeCount').get(function() {
    return this.likes.length;
});

const Post = mongoose.model('Post', postSchema);

module.exports = Post;
