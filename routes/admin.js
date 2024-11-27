const express = require('express');
const { createAdmin, editAdmin, loginAdmin, deleteAdmin, getAdminHierarchy, updateAdminPassword } = require('../controllers/admin');
const verifyAuthToken = require('../middleware/authMiddleware');
const router = express.Router();

// Route to create a new Admin (requires SuperAdmin authentication)
router.post('/create', verifyAuthToken, createAdmin);

// Route to edit an existing Admin (requires SuperAdmin authentication)
router.put('/edit', verifyAuthToken, editAdmin);

// Route to login an Admin
router.post('/login', loginAdmin);

router.delete('/delete', deleteAdmin);

router.post('/hierarchy', getAdminHierarchy);

router.post('/update-password', updateAdminPassword);

module.exports = router;