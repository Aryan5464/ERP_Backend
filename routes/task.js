const express = require('express');
const cron = require('node-cron');
const { Task } = require('../models/models');

const {
    requestTask,
    getRequestedTasksForTeamLeader,
    deleteTask,
    updateTaskStatus,
    getAllTasks,
    getClientTasks,
    createTaskByTL,
    acceptOrRejectTask,
    deleteOrDeactivateRecurringTask,
    getAllRecurringTasks,
    getTasksByAssignedUser,
    getRecurringTasksByClient
} = require('../controllers/task');

const router = express.Router();

// Route for a client to request a task
router.post('/requestTask', requestTask); // for client

// Route for a team leader to get all requested tasks from their clients
router.post('/requested-tasks', getRequestedTasksForTeamLeader); // For Team Leader

// Route for a team leader to accept or reject a requested task
router.post('/accept-or-reject', acceptOrRejectTask); // For Team Leader

router.post('/createTaskByTL', createTaskByTL)

// Route to delete a task (now with POST method and taskId in the body)
router.post('/delete', deleteTask);

// Route to update the status of a task
router.put('/update-status', updateTaskStatus);  // Example: /task/update-status

router.get('/allTasks', getAllTasks);

router.post('/getClientTasks', getClientTasks);

router.post('/getTasksByAssignedUser', getTasksByAssignedUser);

// Recurring Task functions-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

router.get('/getAllRecurringTasks', getAllRecurringTasks);


router.post('getRecurringTasksByClient', getRecurringTasksByClient);

router.post('/deleteOrDeactivateRecurringTask', deleteOrDeactivateRecurringTask);




// Function to update overdue tasks
const updateOverdueTasks = async () => {
    try {
        const currentDate = new Date();

        // Find and update all tasks that are:
        // 1. Past their due date
        // 2. Have status either 'Active' or 'Work in Progress'
        const result = await Task.updateMany(
            {
                dueDate: { $lt: currentDate },
                status: { $in: ['Active', 'Work in Progress'] },
            },
            {
                $set: {
                    status: 'Pending',
                    updatedAt: currentDate
                }
            }
        );

        console.log(`Updated ${result.modifiedCount} overdue tasks to Pending status`);

    } catch (error) {
        console.error('Error in updateOverdueTasks cron job:', error);
    }
};

cron.schedule('*/30 * * * *', () => {
    console.log('Running task status update cron job...');
    updateOverdueTasks();
});

updateOverdueTasks();

module.exports = router;