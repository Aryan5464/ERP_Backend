const mongoose = require('mongoose');
const cron = require('node-cron');
const { RequestTask, Task, TeamLeader, Employee, Client, RecurringTask } = require('../models/models');

const cronJobs = {}; // This stores active cron jobs by their task ID.

const getCronExpressionFromFrequency = (frequency) => {
    switch (frequency) {
        case 'Every Monday':
            return '0 0 * * 1'; // Every Monday at midnight
        case 'Every Tuesday':
            return '0 0 * * 2'; // Every Tuesday at midnight
        case 'Every 15th Day of Month':
            return '0 0 15 * *'; // 15th of each month at midnight
        case 'Every Saturday':
            return '0 0 * * 6'; // Every Saturday at midnight
        default:
            return null;
    }
};


// Function for a client to request a task
const requestTask = async (req, res) => {
    try {
        const { title, description, clientId, category, frequency, dueDate, priority } = req.body;

        // Validate required fields
        if (!title || !description || !clientId || !category) {
            return res.status(400).json({
                message: 'Title, description, client ID, and category are required.',
            });
        }

        // Validate category-specific fields
        if (category === 'Frequency') {
            if (!frequency) {
                return res.status(400).json({
                    message: 'Frequency is required for Frequency-based tasks.',
                });
            }

            // Validate frequency value
            const validFrequencies = [
                'Every Monday',
                'Every Tuesday',
                'Every 15th Day of Month',
                'Every Saturday',
            ];
            if (!validFrequencies.includes(frequency)) {
                return res.status(400).json({
                    message: `Invalid frequency. Allowed values: ${validFrequencies.join(', ')}`,
                });
            }
        } else if (category === 'Deadline') {
            if (!dueDate) {
                return res.status(400).json({
                    message: 'Due date is required for Deadline-based tasks.',
                });
            }

            // Validate dueDate value
            const parsedDueDate = new Date(dueDate);
            if (isNaN(parsedDueDate)) {
                return res.status(400).json({
                    message: 'Invalid due date format.',
                });
            }
        } else {
            return res.status(400).json({
                message: 'Invalid category. Allowed values: Frequency, Deadline.',
            });
        }

        // Create the requested task
        const newRequestTask = new RequestTask({
            title,
            description,
            client: clientId,
            category,
            frequency: category === 'Frequency' ? frequency : null, // Set frequency only for Frequency tasks
            dueDate: category === 'Deadline' ? new Date(dueDate) : null, // Set dueDate only for Deadline tasks
            priority,
        });

        // Save the task to the database
        await newRequestTask.save();

        res.status(201).json({
            message: 'Task requested successfully.',
            requestedTask: newRequestTask,
        });
    } catch (error) {
        console.error('Error requesting task:', error);
        res.status(500).json({
            message: 'Server error. Unable to request task.',
            error: error.message,
        });
    }
};

const getRequestedTasksForTeamLeader = async (req, res) => {
    try {
        const { teamLeaderId } = req.body;

        // Ensure the team leader ID is provided
        if (!teamLeaderId) {
            return res.status(400).json({ message: 'Team Leader ID is required.' });
        }

        // Find all clients connected to the Team Leader
        const clients = await Client.find({ teamLeader: teamLeaderId });

        // If no clients are found, return an appropriate message
        if (!clients.length) {
            return res.status(404).json({ message: 'No clients found for this Team Leader.' });
        }

        // Extract client IDs
        const clientIds = clients.map(client => client._id);

        // Find all requested tasks for the clients managed by this Team Leader
        const requestedTasks = await RequestTask.find({ client: { $in: clientIds } })
            .populate('client', 'name email companyName contactNumber') // Populate client details
            .sort({ createdAt: -1 }); // Optional: Sort by creation date, most recent first

        // Check if there are any requested tasks
        if (!requestedTasks.length) {
            return res.status(404).json({ message: 'No requested tasks found for this Team Leader.' });
        }

        // Return the requested tasks
        res.status(200).json({
            message: 'Requested tasks retrieved successfully.',
            requestedTasks,
        });
    } catch (error) {
        console.error('Error retrieving requested tasks for Team Leader:', error);
        res.status(500).json({
            message: 'Server error. Unable to retrieve requested tasks.',
            error: error.message,
        });
    }
};

const acceptTask = async (requestedTask, assignedUserId, assignedUserType) => {
    // Validate assigned user details
    if (!assignedUserId || !assignedUserType) {
        throw new Error('Assigned user ID and user type are required for accepting the task.');
    }

    if (!['Employee', 'TeamLeader'].includes(assignedUserType)) {
        throw new Error('Assigned user type must be "Employee" or "TeamLeader".');
    }

    // Handle Deadline tasks
    if (requestedTask.category === 'Deadline') {
        const newTask = new Task({
            title: requestedTask.title,
            description: requestedTask.description,
            status: 'Active',
            category: 'Deadline',
            client: requestedTask.client,
            assignedTo: {
                userType: assignedUserType,
                userId: assignedUserId
            },
            dueDate: requestedTask.dueDate,
            priority: requestedTask.priority,
            parentTaskId: requestedTask._id
        });

        await newTask.save();

        // Update related entities
        await Promise.all([
            Client.findByIdAndUpdate(requestedTask.client, { $push: { tasks: newTask._id } }),
            assignedUserType === 'Employee'
                ? Employee.findByIdAndUpdate(assignedUserId, { $push: { tasks: newTask._id } })
                : TeamLeader.findByIdAndUpdate(assignedUserId, { $push: { tasks: newTask._id } })
        ]);

        return newTask;
    }

    // Handle Frequency tasks
    if (requestedTask.category === 'Frequency') {
        const newRecurringTask = new RecurringTask({
            title: requestedTask.title,
            description: requestedTask.description,
            client: requestedTask.client,
            frequency: requestedTask.frequency,
            assignedTo: {
                userType: assignedUserType,
                userId: assignedUserId
            },
            priority: requestedTask.priority,
            active: true
        });

        const savedRecurringTask = await newRecurringTask.save();

        // Schedule the cron job
        const cronExpression = getCronExpressionFromFrequency(savedRecurringTask.frequency);
        if (cronExpression) {
            const job = cron.schedule(cronExpression, async () => {
                try {
                    const newTask = new Task({
                        title: savedRecurringTask.title,
                        description: savedRecurringTask.description,
                        client: savedRecurringTask.client,
                        category: 'Frequency',
                        assignedTo: savedRecurringTask.assignedTo,
                        priority: savedRecurringTask.priority,
                        parentTaskId: savedRecurringTask._id,
                        dueDate: new Date() // Optional: Calculate meaningful due date if needed
                    });

                    const savedTask = await newTask.save();

                    // Update related entities with the new task ID
                    await Promise.all([
                        Client.findByIdAndUpdate(savedRecurringTask.client, { $push: { tasks: savedTask._id } }),
                        savedRecurringTask.assignedTo.userType === 'Employee'
                            ? Employee.findByIdAndUpdate(savedRecurringTask.assignedTo.userId, { $push: { tasks: savedTask._id } })
                            : TeamLeader.findByIdAndUpdate(savedRecurringTask.assignedTo.userId, { $push: { tasks: savedTask._id } })
                    ]);

                    console.log(`Task created and references updated via cron job: ${savedTask._id}`);
                } catch (error) {
                    console.error('Error creating task via cron job:', error);
                }
            });

            cronJobs[savedRecurringTask._id] = job;
        }

        return savedRecurringTask;
    }

    throw new Error('Invalid category. Only "Deadline" and "Frequency" tasks are supported.');
};


const rejectTask = async (requestedTask, rejectionReason) => {
    if (!rejectionReason) {
        throw new Error('Rejection reason is required.');
    }

    requestedTask.status = 'Rejected';
    requestedTask.rejectionReason = rejectionReason;
    await requestedTask.save();

    return requestedTask;
};


const acceptOrRejectTask = async (req, res) => {
    try {
        const { requestedTaskId, action, assignedUserId, assignedUserType, rejectionReason } = req.body;

        // Validate input
        if (!requestedTaskId || !action) {
            return res.status(400).json({ message: 'Requested Task ID and action are required.' });
        }

        // Find the requested task
        const requestedTask = await RequestTask.findById(requestedTaskId);
        if (!requestedTask) {
            return res.status(404).json({ message: 'Requested task not found.' });
        }

        // Check if the task is already processed
        if (requestedTask.status !== 'Requested') {
            return res.status(400).json({ message: 'Task has already been processed.' });
        }

        if (action === 'accept') {
            const result = await acceptTask(requestedTask, assignedUserId, assignedUserType);
            requestedTask.status = 'Accepted';
            await requestedTask.save();

            return res.status(201).json({
                message: 'Task accepted successfully.',
                task: result
            });
        }

        if (action === 'reject') {
            const result = await rejectTask(requestedTask, rejectionReason);
            return res.status(200).json({
                message: 'Task rejected successfully.',
                task: result
            });
        }

        return res.status(400).json({ message: 'Invalid action. Use "accept" or "reject".' });
    } catch (error) {
        console.error('Error processing task:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

const createTaskByTL = async (req, res) => {
    try {
        const {
            title,
            description,
            clientId,
            category,
            frequency,
            dueDate,
            priority,
            assignedUserId,
            assignedUserType
        } = req.body;

        // Validate required fields
        if (!title || !description || !clientId || !category || !assignedUserId || !assignedUserType) {
            return res.status(400).json({
                message: 'Title, description, client ID, category, assigned user ID, and user type are required.'
            });
        }

        // Validate category and related fields
        if (category === 'Frequency' && !frequency) {
            return res.status(400).json({
                message: 'Frequency is required for frequency-based tasks.'
            });
        }

        if (category === 'Deadline' && !dueDate) {
            return res.status(400).json({
                message: 'Due date is required for deadline-based tasks.'
            });
        }

        // Validate assigned user type
        if (!['Employee', 'TeamLeader'].includes(assignedUserType)) {
            return res.status(400).json({
                message: 'Assigned user type must be "Employee" or "TeamLeader".'
            });
        }

        // Handle Deadline tasks
        if (category === 'Deadline') {
            const newTask = new Task({
                title,
                description,
                category,
                client: clientId,
                assignedTo: {
                    userType: assignedUserType,
                    userId: assignedUserId
                },
                dueDate,
                priority,
                status: 'Active'
            });

            // Save the task
            await newTask.save();

            // Update related entities
            await Promise.all([
                Client.findByIdAndUpdate(clientId, { $push: { tasks: newTask._id } }),
                assignedUserType === 'Employee'
                    ? Employee.findByIdAndUpdate(assignedUserId, { $push: { tasks: newTask._id } })
                    : TeamLeader.findByIdAndUpdate(assignedUserId, { $push: { tasks: newTask._id } })
            ]);

            return res.status(201).json({
                message: 'Deadline task created successfully.',
                task: newTask
            });
        }

        // Handle Frequency tasks
        if (category === 'Frequency') {
            const newRecurringTask = new RecurringTask({
                title,
                description,
                client: clientId,
                frequency,
                assignedTo: {
                    userType: assignedUserType,
                    userId: assignedUserId
                },
                priority,
                active: true
            });

            const savedRecurringTask = await newRecurringTask.save();

            // Schedule the cron job
            const cronExpression = getCronExpressionFromFrequency(frequency);
            if (cronExpression) {
                const job = cron.schedule(cronExpression, async () => {
                    try {
                        const newTask = new Task({
                            title: savedRecurringTask.title,
                            description: savedRecurringTask.description,
                            client: savedRecurringTask.client,
                            category: 'Frequency',
                            assignedTo: savedRecurringTask.assignedTo,
                            priority: savedRecurringTask.priority,
                            parentTaskId: savedRecurringTask._id,
                            dueDate: new Date() // Optional: Set a meaningful due date if needed
                        });

                        // Save the new task
                        const savedTask = await newTask.save();

                        // Update related entities with the new task ID
                        await Promise.all([
                            Client.findByIdAndUpdate(savedRecurringTask.client, { $push: { tasks: savedTask._id } }),
                            savedRecurringTask.assignedTo.userType === 'Employee'
                                ? Employee.findByIdAndUpdate(savedRecurringTask.assignedTo.userId, { $push: { tasks: savedTask._id } })
                                : TeamLeader.findByIdAndUpdate(savedRecurringTask.assignedTo.userId, { $push: { tasks: savedTask._id } })
                        ]);

                        console.log(`Task created and references updated: ${savedTask._id}`);
                    } catch (error) {
                        console.error('Error creating task via cron job:', error);
                    }
                });

                // Save the cron job reference
                cronJobs[savedRecurringTask._id] = job;
            }


            return res.status(201).json({
                message: 'Frequency task created successfully and scheduled.',
                recurringTask: savedRecurringTask
            });
        }

        return res.status(400).json({
            message: 'Invalid category. Use "Deadline" or "Frequency".'
        });
    } catch (error) {
        console.error('Error creating task:', error);
        res.status(500).json({
            message: 'Server error.',
            error: error.message
        });
    }
};


const deleteTask = async (req, res) => {
    try {
        const { taskId } = req.body;

        // Validate the task ID
        if (!taskId) {
            return res.status(400).json({ message: 'Task ID is required.' });
        }

        // Find the task by ID
        const task = await Task.findById(taskId);
        if (!task) {
            return res.status(404).json({ message: 'Task not found.' });
        }

        const updatePromises = [];

        // Remove the task ID from the associated team leader's tasks array
        if (task.teamLeader) {
            updatePromises.push(
                TeamLeader.findByIdAndUpdate(task.teamLeader, { $pull: { tasks: taskId } })
            );
        }

        // Remove the task ID from the assigned employees' tasks arrays
        if (task.assignedEmployees && Array.isArray(task.assignedEmployees)) {
            const employeeIds = task.assignedEmployees
                .filter(emp => emp.userType === 'Employee')
                .map(emp => emp.userId);

            if (employeeIds.length > 0) {
                updatePromises.push(
                    Employee.updateMany({ _id: { $in: employeeIds } }, { $pull: { tasks: taskId } })
                );
            }
        }

        // Remove the task ID from the associated client's tasks array (if a client is linked)
        if (task.client) {
            updatePromises.push(
                Client.findByIdAndUpdate(task.client, { $pull: { tasks: taskId } })
            );
        }

        // Wait for all updates to complete
        await Promise.all(updatePromises);

        // Delete the task from the database
        await Task.findByIdAndDelete(taskId);

        res.status(200).json({ message: 'Task deleted successfully.' });
    } catch (error) {
        console.error('Error deleting task:', error);
        res.status(500).json({ message: 'Server error.', error: error.message });
    }
};


// Function to update the status of a task
const updateTaskStatus = async (req, res) => {
    try {
        const { taskId, status } = req.body;

        // Validate required fields
        if (!taskId || !status) {
            return res.status(400).json({ message: 'Task ID and status are required.' });
        }

        // Validate status value
        const validStatuses = ['Active', 'Work in Progress', 'Review', 'Pending', 'Resolved'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ message: 'Invalid task status provided.' });
        }

        // Update the task status and return the updated document
        const updatedTask = await Task.findByIdAndUpdate(
            taskId,
            { status, updatedAt: new Date() }, // Update status and timestamp
            { new: true } // Returns the updated document
        )
            .populate('client', 'name email')
            .populate('teamLeader', 'name email')
            .populate('assignedEmployees.userId', 'name email')
            .populate('completedBy.userId', 'name email');

        if (!updatedTask) {
            return res.status(404).json({ message: 'Task not found.' });
        }

        res.status(200).json({
            message: 'Task status updated successfully.',
            task: updatedTask
        });
    } catch (error) {
        console.error('Error updating task status:', error);
        res.status(500).json({ message: 'Server error while updating task status.' });
    }
};


// Get all tasks
const getAllTasks = async (req, res) => {
    try {
        // Fetch all tasks from the database
        const tasks = await Task.find()
            .populate('client', 'name email companyName') // Populate client details
            .populate('teamLeader', 'name email') // Populate team leader details
            .populate('assignedEmployees.userId', 'name email') // Populate assigned employees/teams
            .populate('completedBy.userId', 'name email') // Populate completedBy details
            .sort({ createdAt: -1 }); // Sort by creation date (newest first)

        if (!tasks.length) {
            return res.status(404).json({ message: 'No tasks found.' });
        }

        // Return the tasks to the admin
        res.status(200).json({
            message: 'All tasks fetched successfully.',
            tasks
        });
    } catch (error) {
        console.error('Error fetching tasks:', error);
        res.status(500).json({ message: 'Server error while fetching tasks.', error });
    }
};

// Function to get all tasks for a specific client
const getClientTasks = async (req, res) => {
    try {
        const { clientId } = req.params;

        // Validate clientId parameter
        if (!clientId) {
            return res.status(400).json({ message: 'Client ID is required.' });
        }

        // Validate if the client exists
        const client = await Client.findById(clientId);
        if (!client) {
            return res.status(404).json({ message: 'Client not found.' });
        }

        // Fetch tasks associated with the client
        const tasks = await Task.find({ client: clientId })
            .populate('client', 'name email companyName') // Populate client details
            .populate('teamLeader', 'name email') // Populate team leader details
            .populate('assignedEmployees.userId', 'name email') // Populate assigned employees/teams
            .sort({ createdAt: -1 }); // Sort tasks by creation date (newest first)

        // Respond with the tasks
        res.status(200).json({
            message: `Tasks for client: ${client.name}`,
            tasks
        });
    } catch (error) {
        console.error('Error fetching client tasks:', error);
        res.status(500).json({ message: 'Error fetching client tasks.', error });
    }
};

const deleteOrDeactivateRecurringTask = async (req, res) => {
    try {
        const { recurringTaskId, action } = req.body;

        // Validate input
        if (!recurringTaskId || !action) {
            return res.status(400).json({ message: 'Recurring Task ID and action are required.' });
        }

        // Fetch the recurring task
        const recurringTask = await RecurringTask.findById(recurringTaskId);
        if (!recurringTask) {
            return res.status(404).json({ message: 'Recurring task not found.' });
        }

        // Stop the cron job
        if (cronJobs[recurringTaskId]) {
            cronJobs[recurringTaskId].stop();
            delete cronJobs[recurringTaskId];
        }

        if (action === 'delete') {
            // Delete the recurring task
            await RecurringTask.findByIdAndDelete(recurringTaskId);

            return res.status(200).json({ message: 'Recurring task deleted and cron job stopped successfully.' });
        } else if (action === 'deactivate') {
            // Deactivate the recurring task
            recurringTask.active = false;
            await recurringTask.save();

            return res.status(200).json({ message: 'Recurring task deactivated and cron job stopped successfully.' });
        } else {
            return res.status(400).json({ message: 'Invalid action. Use "delete" or "deactivate".' });
        }
    } catch (error) {
        console.error('Error deleting or deactivating recurring task:', error);
        return res.status(500).json({ message: 'Server error.' });
    }
};











// Function to restart cron jobs on server restart
const restartCronJobs = async () => {
    try {
        console.log('Restarting cron jobs...');

        // Fetch all active recurring tasks
        const recurringTasks = await RecurringTask.find({ active: true });

        // Loop through each task and restart its cron job
        for (const recurringTask of recurringTasks) {
            const cronExpression = getCronExpressionFromFrequency(recurringTask.frequency);

            if (cronExpression) {
                // Schedule the cron job
                const job = cron.schedule(cronExpression, async () => {
                    try {
                        // Create a new task based on the recurring task details
                        const newTask = new Task({
                            title: recurringTask.title,
                            description: recurringTask.description,
                            client: recurringTask.client,
                            category: 'Frequency',
                            assignedTo: recurringTask.assignedTo,
                            priority: recurringTask.priority,
                            parentTaskId: recurringTask._id,
                            dueDate: new Date(), // Set the due date to now or based on your logic
                        });

                        await newTask.save();

                        // Update related entities (client, user)
                        const { userType, userId } = recurringTask.assignedTo;
                        await Promise.all([
                            Client.findByIdAndUpdate(recurringTask.client, { $push: { tasks: newTask._id } }),
                            userType === 'Employee'
                                ? Employee.findByIdAndUpdate(userId, { $push: { tasks: newTask._id } })
                                : TeamLeader.findByIdAndUpdate(userId, { $push: { tasks: newTask._id } }),
                        ]);

                        console.log(`Task created from recurring task: ${recurringTask._id}`);
                    } catch (error) {
                        console.error(`Error creating task for recurring task ${recurringTask._id}:`, error);
                    }
                });

                // Store the job in the cronJobs object
                cronJobs[recurringTask._id] = job;
                console.log(`Cron job restarted for recurring task: ${recurringTask._id}`);
            } else {
                console.warn(`Invalid frequency for recurring task: ${recurringTask._id}`);
            }
        }

        console.log('All cron jobs restarted successfully.');
    } catch (error) {
        console.error('Error restarting cron jobs:', error);
    }
};

module.exports = {
    requestTask,
    getRequestedTasksForTeamLeader,
    acceptOrRejectTask,
    deleteTask,
    updateTaskStatus,
    getAllTasks,
    createTaskByTL,
    getClientTasks,
    deleteOrDeactivateRecurringTask,


    restartCronJobs
};
