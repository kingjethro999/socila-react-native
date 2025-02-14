const mongoose = require('mongoose');

const mediaSchema = new mongoose.Schema({
    url: {
        type: String,
        required: true,
        trim: true
    },
    type: {
        type: String,
        enum: ['image', 'video'],
        required: true
    }
});

const postSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    content: {
        type: String,
        trim: true
    },
    media: [mediaSchema],
    allowComments: {
        type: Boolean,
        default: true
    },
    likes: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    comments: [{
        user: {
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

// Ensure either content or media is present
postSchema.pre('save', function(next) {
    if (!this.content && (!this.media || this.media.length === 0)) {
        next(new Error('Post must contain either text or media'));
    }
    if (this.media && this.media.length > 5) {
        next(new Error('Maximum of 5 media items allowed'));
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

module.exports = mongoose.model('Post', postSchema);
