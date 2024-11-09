const express = require('express');
const {
    requestTask,
    getRequestedTasksForTeamLeader,
    assignOrRejectRequestedTask,
    deleteTask
} = require('../controllers/task');

const router = express.Router();

// Route for a client to request a task
router.post('/request', requestTask);

// Route for a team leader to get all requested tasks from their clients
router.get('/requested-tasks', getRequestedTasksForTeamLeader);

// Route for a team leader to accept or reject a requested task
router.post('/assign-or-reject', assignOrRejectRequestedTask);

// Route to delete a task (now with POST method and taskId in the body)
router.post('/delete', deleteTask);

module.exports = router;
