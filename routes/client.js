const express = require('express');
const verifyAuthToken = require('../middleware/authMiddleware');
const { onboardClient, signupClient, loginClient, editClient, deleteClient, getAllClients, getClientsForTeamLeader, uploadDocuments, getClientDocuments, getClientDetails } = require('../controllers/client');
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

router.post('/getClientDetails', getClientDetails);

router.get('/all', getAllClients);

router.post('/getClientsForTeamLeader', getClientsForTeamLeader);

// Route for uploading client documents
router.post('/upload-documents', uploadDocuments);

router.post('/getClientDocuments', getClientDocuments);

module.exports = router;