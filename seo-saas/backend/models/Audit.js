const mongoose = require('mongoose');

const auditSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    url: {
        type: String,
        required: true,
        trim: true
    },
    performanceScore: {
        type: Number,
        default: 0
    },
    seoScore: {
        type: Number,
        default: 0
    },
    accessibilityScore: {
        type: Number,
        default: 0
    },
    bestPracticesScore: {
        type: Number,
        default: 0
    },
    fullReport: {
        type: mongoose.Schema.Types.Mixed,
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Audit', auditSchema);
