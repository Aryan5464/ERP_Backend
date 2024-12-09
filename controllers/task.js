const mongoose = require('mongoose');
const { RequestTask, Task, TeamLeader, Employee, Client } = require('../models/models');

// Function for a client to request a task
const requestTask = async (req, res) => {
    try {
        const { title, description, clientId, dueDate, priority } = req.body;

        // Validate required fields
        if (!title || !description || !clientId) {
            return res.status(400).json({ message: 'Title, description, and client ID are required.' });
        }

        // Create new requested task
        const newRequestTask = new RequestTask({
            title,
            description,
            client: clientId,
            dueDate,
            priority
        });

        // Save to database
        await newRequestTask.save();

        res.status(201).json({
            message: 'Task requested successfully',
            requestedTask: newRequestTask
        });
    } catch (error) {
        console.error('Error requesting task:', error);
        res.status(500).json({ message: 'Server error' });
    }
};


const getRequestedTasksForTeamLeader = async (req, res) => {
    try {
        const { teamLeaderId } = req.body;

        // Ensure the team leader ID is provided
        if (!teamLeaderId) {
            return res.status(400).json({ message: 'Team Leader ID is required' });
        }

        // Find all clients connected to the Team Leader
        const clients = await Client.find({ teamLeader: teamLeaderId });
        const clientIds = clients.map(client => client._id);

        // Find all requested tasks for the clients managed by this Team Leader
        const requestedTasks = await RequestTask.find({ client: { $in: clientIds } })
            .populate('client', 'name email companyName contactNumber');  // Populate client details

        res.status(200).json({
            message: 'Requested tasks retrieved successfully',
            requestedTasks
        });
    } catch (error) {
        console.error('Error retrieving requested tasks for Team Leader:', error);
        res.status(500).json({ message: 'Server error' });
    }
};


const assignOrRejectRequestedTask = async (req, res) => {
    try {
        const { requestedTaskId, teamLeaderId, action, assignedUserId, assignedUserType } = req.body;

        // Validate required fields
        if (!requestedTaskId || !teamLeaderId || !action) {
            return res.status(400).json({ message: 'Requested Task ID, Team Leader ID, and action are required.' });
        }

        // Find the requested task
        const requestedTask = await RequestTask.findById(requestedTaskId);
        if (!requestedTask) {
            return res.status(404).json({ message: 'Requested task not found' });
        }

        if (action === 'accept') {
            // Validate assigned user details if action is accept
            if (!assignedUserId || !assignedUserType) {
                return res.status(400).json({ message: 'Assigned user ID and user type are required for acceptance.' });
            }

            // Create a new task in the Task table
            const newTask = new Task({
                title: requestedTask.title,
                description: requestedTask.description,
                status: 'Active',
                category: requestedTask.category,
                client: requestedTask.client,
                teamLeader: teamLeaderId,
                assignedEmployees: [{
                    userType: assignedUserType,
                    userId: assignedUserId
                }],
                dueDate: requestedTask.dueDate,
                priority: requestedTask.priority
            });

            // Save the new task and update the requested task status
            await newTask.save();
            requestedTask.status = 'Accepted';
            await requestedTask.save();

            // Add the task ID to the Team Leader or Employee's tasks array
            if (assignedUserType === 'Employee') {
                await Employee.findByIdAndUpdate(
                    assignedUserId,
                    { $push: { tasks: newTask._id } }
                );
            } else if (assignedUserType === 'TeamLeader') {
                await TeamLeader.findByIdAndUpdate(
                    assignedUserId,
                    { $push: { tasks: newTask._id } }
                );
            }

            // Add the task ID to the Client's tasks array
            await Client.findByIdAndUpdate(
                requestedTask.client,
                { $push: { tasks: newTask._id } }
            );

            res.status(201).json({
                message: 'Task accepted and assigned successfully',
                task: newTask
            });

        } else if (action === 'reject') {
            // Update the status of the requested task to Rejected
            requestedTask.status = 'Rejected';
            await requestedTask.save();

            res.status(200).json({ message: 'Task rejected successfully' });
        } else {
            res.status(400).json({ message: 'Invalid action. Use "accept" or "reject".' });
        }

    } catch (error) {
        console.error('Error processing task request:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

const createTaskForEmployeeByTL = async (req, res) => {
    try {
        const { title, description, assignedEmployeeID, dueDate, priority, clientId, teamLeaderId } = req.body;

        // Validate required fields
        if (!title || !description || !assignedEmployeeID || !teamLeaderId) {
            return res.status(400).json({
                message: 'Title, description, assigned user ID, and team leader ID are required.'
            });
        }

        // Prepare the new task data
        const newTaskData = {
            title,
            description,
            status: 'Active',
            priority,
            dueDate,
            teamLeader: teamLeaderId,
            assignedEmployees: [{
                userType: 'Employee',
                userId: assignedEmployeeID
            }]
        };

        // If clientId is provided, associate the task with the client
        if (clientId) {
            const client = await Client.findById(clientId);
            if (!client) {
                return res.status(404).json({ message: 'Client not found.' });
            }
            newTaskData.client = clientId;
        }

        // Create and save the new task
        const newTask = new Task(newTaskData);
        await newTask.save();

        // Add the task to the employee's tasks array
        await Employee.findByIdAndUpdate(
            assignedEmployeeID,
            { $push: { tasks: newTask._id } }
        );

        // Add the task to the team's tasks array (for the Team Leader)
        await TeamLeader.findByIdAndUpdate(
            teamLeaderId,
            { $push: { tasks: newTask._id } }
        );

        // If the task is associated with a client, add the task to the client's tasks array
        if (clientId) {
            await Client.findByIdAndUpdate(
                clientId,
                { $push: { tasks: newTask._id } }
            );
        }

        res.status(201).json({
            message: 'Task created and assigned successfully',
            task: newTask
        });

    } catch (error) {
        console.error('Error creating task for employee:', error);
        res.status(500).json({ message: 'Server error' });
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

        // Remove the task ID from the associated team leader's tasks array
        await TeamLeader.findByIdAndUpdate(
            task.teamLeader,
            { $pull: { tasks: taskId } }
        );

        // Remove the task ID from the assigned employees' tasks arrays
        if (task.assignedEmployees && task.assignedEmployees.length > 0) {
            const employeeIds = task.assignedEmployees
                .filter(emp => emp.userType === 'Employee')
                .map(emp => emp.userId);

            await Employee.updateMany(
                { _id: { $in: employeeIds } },
                { $pull: { tasks: taskId } }
            );
        }

        // Remove the task ID from the associated client's tasks array (if a client is linked)
        if (task.client) {
            await Client.findByIdAndUpdate(
                task.client,
                { $pull: { tasks: taskId } }
            );
        }

        // Delete the task from the database
        await Task.findByIdAndDelete(taskId);

        res.status(200).json({ message: 'Task deleted successfully.' });
    } catch (error) {
        console.error('Error deleting task:', error);
        res.status(500).json({ message: 'Server error.' });
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

        // Update the task status
        const updatedTask = await Task.findByIdAndUpdate(
            taskId,
            { status },
            { new: true }  // Returns the updated document
        );

        if (!updatedTask) {
            return res.status(404).json({ message: 'Task not found' });
        }

        res.status(200).json({
            message: 'Task status updated successfully',
            task: updatedTask
        });
    } catch (error) {
        console.error('Error updating task status:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Get all tasks
const getAllTasks = async (req, res) => {
    try {
        // Fetch all tasks from the database
        const tasks = await Task.find()
            .populate('client')   // Populate client details if needed
            .populate('teamLeader')  // Populate team leader details if needed
            .populate('assignedEmployees.userId')  // Populate assigned employee details if needed
            .populate('completedBy.userId');  // Populate completedBy details if needed

        if (!tasks || tasks.length === 0) {
            return res.status(404).json({ message: 'No tasks found' });
        }

        // Return the tasks to the admin
        res.status(200).json({
            message: 'All tasks fetched successfully',
            tasks: tasks,
        });
    } catch (error) {
        console.error('Error fetching tasks:', error);
        res.status(500).json({ message: 'Server error while fetching tasks' });
    }
};

// Function to get all tasks for a specific client
const getClientTasks = async (req, res) => {
    const { clientId } = req.params;

    try {
        // Validate if the client exists
        const client = await Client.findById(clientId);
        if (!client) {
            return res.status(404).json({ message: "Client not found" });
        }

        // Fetch tasks associated with the client
        const tasks = await Task.find({ client: clientId })
            .populate('client', 'name email') // Populate client details
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
        res.status(500).json({ message: 'Error fetching client tasks', error });
    }
};


module.exports = {
    requestTask,
    getRequestedTasksForTeamLeader,
    assignOrRejectRequestedTask,
    deleteTask,
    updateTaskStatus,
    getAllTasks,
    createTaskForEmployeeByTL,
    getClientTasks
};
