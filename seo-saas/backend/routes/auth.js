const express = require('express');
const auth = require('../middleware/auth');
const authController = require('../controllers/authController');

const router = express.Router();

router.post('/register', authController.register);
router.post('/login', authController.login);
router.get('/me', auth, authController.me);

module.exports = router;
