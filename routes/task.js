const express = require('express');
const {
    requestTask,
    getRequestedTasksForTeamLeader,
    assignOrRejectRequestedTask,
    deleteTask,
    updateTaskStatus,
    getAllTasks
} = require('../controllers/task');

const router = express.Router();

// Route for a client to request a task
router.post('/requestTask', requestTask); // for client

// Route for a team leader to get all requested tasks from their clients
router.get('/requested-tasks', getRequestedTasksForTeamLeader); // For Team Leader

// Route for a team leader to accept or reject a requested task
router.post('/assign-or-reject', assignOrRejectRequestedTask); // For Team Leader

// Route to delete a task (now with POST method and taskId in the body)
router.delete('/delete', deleteTask); 

// Route to update the status of a task
router.put('/update-status', updateTaskStatus);  // Example: /task/update-status

router.get('/allTasks', getAllTasks);

module.exports = router;