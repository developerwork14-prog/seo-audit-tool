require('dotenv').config();

const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');
const authRoutes = require('./routes/auth');
const auditRoutes = require('./routes/audit');

const app = express();

if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is required');
}

const localOrigins = [
    'http://localhost:5173',
    'http://127.0.0.1:5173'
];

const allowedOrigins = [
    ...localOrigins,
    ...(process.env.FRONTEND_URL || '').split(',')
]
    .map((origin) => origin.trim())
    .filter(Boolean);

app.use(cors({
    origin(origin, callback) {
        if (
            !origin ||
            allowedOrigins.length === 0 ||
            allowedOrigins.includes(origin)
        ) {
            return callback(null, true);
        }

        return callback(new Error('Not allowed by CORS'));
    },
    credentials: true
}));

app.use(express.json({
    limit: '2mb'
}));

app.get('/', (req, res) => {
    res.json({
        name: 'SEO Audit SaaS API',
        status: 'ok'
    });
});

app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString()
    });
});

app.use('/api/auth', authRoutes);
app.use('/api/audit', auditRoutes);

app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({
        message: 'Server error'
    });
});

connectDB()
    .then(() => {
        app.listen(process.env.PORT || 5000, () => {
            console.log(
                `Server running on port ${process.env.PORT || 5000}`
            );
        });
    })
    .catch((error) => {
        console.error('Failed to start server:', error);
        process.exit(1);
    });
