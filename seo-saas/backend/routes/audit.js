const express = require('express');
const auth = require('../middleware/auth');
const auditController = require('../controllers/auditController');

const router = express.Router();

router.post('/run', auth, auditController.runAudit);
router.get('/history', auth, auditController.getHistory);
router.get('/:id', auth, auditController.getAudit);

module.exports = router;
