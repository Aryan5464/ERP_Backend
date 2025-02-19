
const { RequestTask, Task, TeamLeader, Employee, Client, RecurringTask } = require('../models/models');
const { addNotification } = require('./notification');
const { scheduleCronJob, cronJobs } = require('./task_cron');



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
    if (!assignedUserId || !assignedUserType) {
        throw new Error('Assigned user ID and user type are required for accepting the task.');
    }

    if (!['Employee', 'TeamLeader'].includes(assignedUserType)) {
        throw new Error('Assigned user type must be "Employee" or "TeamLeader".');
    }

    // Get client details to fetch teamLeaderId
    const client = await Client.findById(requestedTask.client);
    if (!client) {
        throw new Error('Client not found');
    }

    if (!client.teamLeader) {
        throw new Error('No team leader assigned to this client');
    }

    const teamLeaderId = client.teamLeader;

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

        await Promise.all([
            Client.findByIdAndUpdate(requestedTask.client, { $push: { tasks: newTask._id } }),
            TeamLeader.findByIdAndUpdate(teamLeaderId, { $push: { tasks: newTask._id } }),
            ...(assignedUserType === 'Employee'
                ? [Employee.findByIdAndUpdate(assignedUserId, { $push: { tasks: newTask._id } })]
                : [])
        ]);

        try {
            const formattedDueDate = new Date(requestedTask.dueDate).toLocaleDateString();
            const notificationMessage = `New task "${requestedTask.title}" has been assigned to you by Team Leader. Due date: ${formattedDueDate}`;

            await addNotification(
                assignedUserId,
                assignedUserType,
                notificationMessage
            );
        } catch (notificationError) {
            console.error('Error sending notification:', notificationError);
            // Continue with the function even if notification fails
        }

        return newTask;
    }

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
        await scheduleCronJob(savedRecurringTask, teamLeaderId); // Passing teamLeaderId to scheduleCronJob
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

        if (!title || !description || !clientId || !category || !assignedUserId || !assignedUserType) {
            return res.status(400).json({
                message: 'Title, description, client ID, category, assigned user ID, and user type are required.'
            });
        }

        // Get client details to fetch teamLeaderId
        const client = await Client.findById(clientId);
        if (!client) {
            return res.status(404).json({
                message: 'Client not found'
            });
        }

        if (!client.teamLeader) {
            return res.status(400).json({
                message: 'No team leader assigned to this client'
            });
        }

        const teamLeaderId = client.teamLeader;

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

        if (!['Employee', 'TeamLeader'].includes(assignedUserType)) {
            return res.status(400).json({
                message: 'Assigned user type must be "Employee" or "TeamLeader".'
            });
        }

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

            await newTask.save();

            await Promise.all([
                Client.findByIdAndUpdate(clientId, { $push: { tasks: newTask._id } }),
                TeamLeader.findByIdAndUpdate(teamLeaderId, { $push: { tasks: newTask._id } }),
                ...(assignedUserType === 'Employee'
                    ? [Employee.findByIdAndUpdate(assignedUserId, { $push: { tasks: newTask._id } })]
                    : [])
            ]);

            try {
                const formattedDueDate = new Date(dueDate).toLocaleDateString();
                const notificationMessage = `New task "${title}" has been assigned to you by Team Leader. Due date: ${formattedDueDate}`;

                await addNotification(
                    assignedUserId,
                    assignedUserType,
                    notificationMessage
                );
            } catch (notificationError) {
                console.error('Error sending notification:', notificationError);
                // Continue with the function even if notification fails
            }

            return res.status(201).json({
                message: 'Deadline task created successfully.',
                task: newTask
            });
        }

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
            await scheduleCronJob(savedRecurringTask);

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
            .populate('assignedTo.userId', 'name email') // Populate assigned user details
            .sort({ createdAt: -1 }); // Sort by creation date (newest first)

        if (!tasks.length) {
            return res.status(404).json({ message: 'No tasks found.' });
        }

        res.status(200).json({
            message: 'All tasks fetched successfully.',
            tasks
        });
    } catch (error) {
        console.error('Error fetching tasks:', error);
        res.status(500).json({ message: 'Server error while fetching tasks.', error: error.message });
    }
};


// Function to get all tasks for a specific client
const getClientTasks = async (req, res) => {
    try {
        const { clientId } = req.body;

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

const getTasksByAssignedUser = async (req, res) => {
    try {
        const { userId } = req.body;

        // Validate if the userId is provided
        if (!userId) {
            return res.status(400).json({ message: 'User ID is required.' });
        }

        // Find tasks assigned to the specific userId
        const tasks = await Task.find({ 'assignedTo.userId': userId })
            .populate('client', 'name email companyName') // Populate client details
            .populate('assignedTo.userId', 'name email') // Populate assigned user details
            .sort({ createdAt: -1 }); // Sort tasks by creation date (newest first)

        if (!tasks.length) {
            return res.status(404).json({ message: 'No tasks found for the specified user.' });
        }

        res.status(200).json({
            message: `Tasks assigned to user: ${userId} fetched successfully.`,
            tasks
        });
    } catch (error) {
        console.error('Error fetching tasks for assigned user:', error);
        res.status(500).json({ message: 'Server error while fetching tasks.', error: error.message });
    }
};

// Recurring Task Functions -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

const getAllRecurringTasks = async (req, res) => {
    try {
       
        const recurringTasks = await RecurringTask.find()
            .populate('client', 'name email companyName')
            .populate('assignedTo.userId', 'name email')
            .sort({ createdAt: -1 });

        res.status(200).json({
            message: recurringTasks.length ? 'Recurring tasks fetched successfully.' : 'No recurring tasks found.',
            totalTasks: recurringTasks.length,
            recurringTasks
        });
    } catch (error) {
        console.error('Error fetching recurring tasks:', error);
        res.status(500).json({ 
            message: 'Server error while fetching recurring tasks.', 
            error: error.message 
        });
    }
};

const getRecurringTasksByClient = async (req, res) => {
    try {
        const { clientId } = req.body;

        // Validate input
        if (!clientId) {
            return res.status(400).json({ 
                message: 'Client ID is required.',
                required: ['clientId']
            });
        }

        // Verify client exists
        const clientExists = await Client.exists({ _id: clientId });
        if (!clientExists) {
            return res.status(404).json({ 
                message: 'Client not found.',
                clientId
            });
        }

        // Add filters
        const filter = { client: clientId };
        if (req.query.active !== undefined) {
            filter.active = req.query.active === 'true';
        }

        const recurringTasks = await RecurringTask.find(filter)
            .populate('client', 'name email companyName')
            .populate('assignedTo.userId', 'name email')
            .sort({ createdAt: -1 });

        res.status(200).json({
            message: recurringTasks.length 
                ? `Recurring tasks for client fetched successfully.`
                : 'No recurring tasks found for this client.',
            clientId,
            totalTasks: recurringTasks.length,
            recurringTasks
        });
    } catch (error) {
        console.error('Error fetching recurring tasks:', error);
        res.status(500).json({ 
            message: 'Server error while fetching recurring tasks.',
            error: error.message
        });
    }
};

const deleteOrDeactivateRecurringTask = async (req, res) => {
    try {
        const { recurringTaskId, action } = req.body;

        // Input validation
        if (!recurringTaskId || !action) {
            return res.status(400).json({ 
                message: 'Recurring Task ID and action are required.',
                required: ['recurringTaskId', 'action']
            });
        }

        if (!['delete', 'deactivate'].includes(action)) {
            return res.status(400).json({ 
                message: 'Invalid action. Use "delete" or "deactivate".',
                allowedActions: ['delete', 'deactivate']
            });
        }

        // Fetch the recurring task
        const recurringTask = await RecurringTask.findById(recurringTaskId);
        if (!recurringTask) {
            return res.status(404).json({ 
                message: 'Recurring task not found.',
                taskId: recurringTaskId
            });
        }

        // Stop the cron job if exists
        if (cronJobs[recurringTaskId]) {
            cronJobs[recurringTaskId].stop();
            delete cronJobs[recurringTaskId];
        }

        // Perform action
        if (action === 'delete') {
            await RecurringTask.findByIdAndDelete(recurringTaskId);
            return res.status(200).json({ 
                message: 'Recurring task deleted and cron job stopped successfully.',
                taskId: recurringTaskId
            });
        } else {
            recurringTask.active = false;
            await recurringTask.save();
            return res.status(200).json({ 
                message: 'Recurring task deactivated and cron job stopped successfully.',
                taskId: recurringTaskId,
                task: recurringTask
            });
        }
    } catch (error) {
        console.error('Error deleting or deactivating recurring task:', error);
        return res.status(500).json({ 
            message: 'Server error.',
            error: error.message
        });
    }
};


const getRecurringTasksByTeamLeader = async (req, res) => {
    try {
        const { teamLeaderId } = req.body;

        // Validate if teamLeaderId is provided
        if (!teamLeaderId) {
            return res.status(400).json({ message: 'Team Leader ID is required.' });
        }

        // First, find the team leader and their associated clients
        const teamLeader = await TeamLeader.findById(teamLeaderId)
            .populate('clients');

        if (!teamLeader) {
            return res.status(404).json({ message: 'Team Leader not found.' });
        }

        // Get array of client IDs associated with the team leader
        const clientIds = teamLeader.clients.map(client => client._id);

        // Fetch recurring tasks for all clients associated with the team leader
        const recurringTasks = await RecurringTask.find({
            client: { $in: clientIds }
        })
            .populate('client', 'name email companyName') // Populate client details
            .populate('assignedTo.userId', 'name email') // Populate assigned user details
            .sort({ createdAt: -1 }); // Sort by creation date (newest first)

        if (!recurringTasks.length) {
            return res.status(404).json({
                message: 'No recurring tasks found for clients associated with this team leader.'
            });
        }

        // Group tasks by client for better organization (optional)
        const tasksGroupedByClient = recurringTasks.reduce((acc, task) => {
            const clientId = task.client._id.toString();
            if (!acc[clientId]) {
                acc[clientId] = {
                    clientName: task.client.name,
                    companyName: task.client.companyName,
                    tasks: []
                };
            }
            acc[clientId].tasks.push(task);
            return acc;
        }, {});

        res.status(200).json({
            message: 'Recurring tasks fetched successfully.',
            teamLeaderName: teamLeader.name,
            totalTasks: recurringTasks.length,
            recurringTasks,
            tasksGroupedByClient // Including grouped tasks for additional organization
        });

    } catch (error) {
        console.error('Error fetching recurring tasks for team leader:', error);
        res.status(500).json({
            message: 'Server error while fetching recurring tasks.',
            error: error.message
        });
    }
};


// Function to restart cron jobs on server restart


module.exports = {
    requestTask,
    getRequestedTasksForTeamLeader,
    acceptOrRejectTask,
    deleteTask,
    updateTaskStatus,
    getAllTasks,
    createTaskByTL,
    getClientTasks,

    getTasksByAssignedUser,

    // Recurring Tasks 
    getRecurringTasksByTeamLeader,
    getAllRecurringTasks,
    deleteOrDeactivateRecurringTask,
    getRecurringTasksByClient,
};
