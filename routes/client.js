const express = require('express');
const verifyAuthToken = require('../middleware/authMiddleware');
const { onboardClient, signupClient, loginClient, editClient, deleteClient, getAllClients, getClientsForTeamLeader } = require('../controllers/client');
const router = express.Router();

// Client signup route
router.post('/signup', signupClient);

// Client login route
router.post('/login', loginClient);

// Client onboarding route (Admin only)
router.post('/onboard-client', verifyAuthToken, onboardClient);

// Edit client route
router.put('/edit', verifyAuthToken, editClient);

// Delete client route
router.delete('/delete', verifyAuthToken, deleteClient);

router.get('/all', getAllClients);

router.get('/clients', getClientsForTeamLeader);

module.exports = router;