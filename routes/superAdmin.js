const express = require('express');
const { loginSuperAdmin, editSuperAdmin, uploadSuperAdminDP, getSuperAdminDP, deleteSuperAdminDP } = require('../controllers/superAdmin');
const verifyAuthToken = require('../middleware/authMiddleware');
const router = express.Router();

// Route to login SuperAdmin
router.post('/login', loginSuperAdmin);

// Route to edit SuperAdmin (requires SuperAdmin authentication)
router.put('/edit', verifyAuthToken, editSuperAdmin);

router.post('/uploadDP', uploadSuperAdminDP);

router.post('/dp', getSuperAdminDP);

router.post('/deleteDP', deleteSuperAdminDP);




module.exports = router;