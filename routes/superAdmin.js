const express = require('express');
const { loginSuperAdmin, editSuperAdmin, uploadSuperAdminDP } = require('../controllers/superAdmin');
const verifyAuthToken = require('../middleware/authMiddleware');
const router = express.Router();

// Route to login SuperAdmin
router.post('/login', loginSuperAdmin);

// Route to edit SuperAdmin (requires SuperAdmin authentication)
router.put('/edit', verifyAuthToken, editSuperAdmin);

router.post('/uploadDP', uploadSuperAdminDP);


module.exports = router;