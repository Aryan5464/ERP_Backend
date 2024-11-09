const mongoose = require('mongoose');
const { RequestedTask, Task, TeamLeader, Employee } = require('../models/models');


// Function for a client to request a task
const requestTask = async (req, res) => {
    try {
        const { title, description, clientId, dueDate, priority } = req.body;

        // Validate required fields
        if (!title || !description || !clientId) {
            return res.status(400).json({ message: 'Title, description, and client ID are required.' });
        }

        // Create new requested task
        const newRequestTask = new RequestedTask({
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
        const requestedTasks = await RequestedTask.find({ client: { $in: clientIds } })
            .populate('client', 'name email companyName contactNumber')  // Populate client details
            .exec();

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
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { requestedTaskId, teamLeaderId, action, assignedUserId, assignedUserType } = req.body;

        // Validate required fields
        if (!requestedTaskId || !teamLeaderId || !action) {
            return res.status(400).json({ message: 'Requested Task ID, Team Leader ID, and action are required.' });
        }

        // Find the requested task
        const requestedTask = await RequestedTask.findById(requestedTaskId);
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

            // Save the new task and get its ID
            const savedTask = await newTask.save({ session });

            // Update the status of the requested task to Accepted
            requestedTask.status = 'Accepted';
            await requestedTask.save({ session });

            // Add the task ID to the Team Leader or Employee's tasks array
            if (assignedUserType === 'Employee') {
                await Employee.findByIdAndUpdate(
                    assignedUserId,
                    { $push: { tasks: savedTask._id } },
                    { session }
                );
            } else if (assignedUserType === 'TeamLeader') {
                await TeamLeader.findByIdAndUpdate(
                    assignedUserId,
                    { $push: { tasks: savedTask._id } },
                    { session }
                );
            }

            // Commit the transaction
            await session.commitTransaction();
            session.endSession();

            res.status(201).json({
                message: 'Task accepted and assigned successfully',
                task: savedTask
            });

        } else if (action === 'reject') {
            // Update the status of the requested task to Rejected
            requestedTask.status = 'Rejected';
            await requestedTask.save({ session });

            // Commit the transaction for reject action
            await session.commitTransaction();
            session.endSession();

            res.status(200).json({ message: 'Task rejected successfully' });
        } else {
            await session.abortTransaction();
            session.endSession();
            res.status(400).json({ message: 'Invalid action. Use "accept" or "reject".' });
        }

    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        console.error('Error processing task request:', error);
        res.status(500).json({ message: 'Server error' });
    }
};



const deleteTask = async (req, res) => {
    const session = await mongoose.startSession();
    try {
        const { taskId } = req.body;  // Get taskId from request body

        if (!taskId) {
            return res.status(400).json({ message: 'Task ID is required' });
        }

        session.startTransaction();

        // Find the task to delete
        const task = await Task.findById(taskId).session(session);
        if (!task) {
            return res.status(404).json({ message: 'Task not found' });
        }

        // Remove the task from the Task collection
        await Task.findByIdAndDelete(taskId).session(session);

        // Update the Team Leader's task array by removing the task reference
        await TeamLeader.updateOne(
            { _id: task.teamLeader },
            { $pull: { tasks: taskId } }
        ).session(session);

        // Update each Employee's task array by removing the task reference
        const assignedEmployees = task.assignedEmployees.map(employee => employee.userId);
        await Employee.updateMany(
            { _id: { $in: assignedEmployees } },
            { $pull: { tasks: taskId } }
        ).session(session);

        // Commit the transaction
        await session.commitTransaction();
        session.endSession();

        res.status(200).json({ message: 'Task deleted successfully' });
    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        console.error('Error deleting task:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

module.exports = {
    requestTask,
    getRequestedTasksForTeamLeader,
    assignOrRejectRequestedTask,
    deleteTask
};
