const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

function createToken(userId) {
    return jwt.sign(
        { userId },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
    );
}

function sanitizeUser(user) {
    return {
        id: user._id,
        name: user.name,
        email: user.email
    };
}

exports.register = async (req, res) => {
    try {
        const { name, email, password } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({
                message: 'Name, email, and password are required'
            });
        }

        if (password.length < 6) {
            return res.status(400).json({
                message: 'Password must be at least 6 characters'
            });
        }

        const existingUser = await User.findOne({
            email: email.toLowerCase()
        });

        if (existingUser) {
            return res.status(409).json({
                message: 'Email is already registered'
            });
        }

        const hashedPassword = await bcrypt.hash(password, 12);
        const user = await User.create({
            name,
            email,
            password: hashedPassword
        });

        return res.status(201).json({
            token: createToken(user._id),
            user: sanitizeUser(user)
        });
    } catch (error) {
        console.error('Register error:', error);
        return res.status(500).json({
            message: 'Failed to register user'
        });
    }
};

exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                message: 'Email and password are required'
            });
        }

        const user = await User.findOne({
            email: email.toLowerCase()
        });

        if (!user) {
            return res.status(401).json({
                message: 'Invalid email or password'
            });
        }

        const passwordMatches = await bcrypt.compare(
            password,
            user.password
        );

        if (!passwordMatches) {
            return res.status(401).json({
                message: 'Invalid email or password'
            });
        }

        return res.json({
            token: createToken(user._id),
            user: sanitizeUser(user)
        });
    } catch (error) {
        console.error('Login error:', error);
        return res.status(500).json({
            message: 'Failed to login'
        });
    }
};

exports.me = async (req, res) => {
    try {
        const user = await User.findById(req.userId).select('-password');

        if (!user) {
            return res.status(404).json({
                message: 'User not found'
            });
        }

        return res.json({ user });
    } catch (error) {
        return res.status(500).json({
            message: 'Failed to load user'
        });
    }
};
