const express = require('express');
const { createTeamLeader, editTeamLeader, loginTeamLeader, getTeamLeaderHierarchy, getTeamLeaderTasks, deleteTeamLeaderWithReassignment, deleteTeamLeaderAndPromoteEmployee, uploadTeamLeaderDP, getTeamLeaderDP, deleteTeamLeaderDP } = require('../controllers/teamLeader'); // Import the controller functions
const verifyAuthToken = require('../middleware/authMiddleware'); // Import the auth middleware

const router = express.Router();

// Route to create a new TeamLeader (requires admin authentication)
router.post('/create', verifyAuthToken, createTeamLeader);
// Route to edit an existing TeamLeader (requires admin authentication)
router.put('/edit', verifyAuthToken, editTeamLeader);
// Route to login a Team Leader
router.post('/login', loginTeamLeader);

router.delete('/deleteTeamLeaderWithReassignment', deleteTeamLeaderWithReassignment);

router.delete('/deleteTeamLeaderAndPromoteEmployee', deleteTeamLeaderAndPromoteEmployee);

router.post('/hierarchy', getTeamLeaderHierarchy);

router.get('/teamLeaderTasks', getTeamLeaderTasks);

router.post('/uploadDP', uploadTeamLeaderDP);

router.post('/dp', getTeamLeaderDP);

router.post('deleteDP', deleteTeamLeaderDP);

module.exports = router;