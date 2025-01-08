
const { RequestTask, Task, TeamLeader, Employee, Client, RecurringTask } = require('../models/models');
const { addNotification } = require('./notification');
const cron = require('node-cron');
const cronJobs = {};

// Helper function to add appropriate suffix to dates
function getDaySuffix(day) {
    if (day >= 11 && day <= 13) {
        return 'th';
    }
    switch (day % 10) {
        case 1:
            return 'st';
        case 2:
            return 'nd';
        case 3:
            return 'rd';
        default:
            return 'th';
    }
}

// Function to get cron expression from frequency
const getCronExpressionFromFrequency = (frequency) => {
    // Days of the week
    const weeklyFrequencies = {
        'Every Monday': '0 0 * * 1',
        'Every Tuesday': '0 0 * * 2',
        'Every Wednesday': '0 0 * * 3',
        'Every Thursday': '0 0 * * 4',
        'Every Friday': '0 0 * * 5',
        'Every Saturday': '0 0 * * 6',
        'Every Sunday': '0 0 * * 0',
    };

    // Monthly dates (1-31)
    const monthlyDateFrequencies = {};
    for (let i = 1; i <= 31; i++) {
        monthlyDateFrequencies[`Every ${i}${getDaySuffix(i)} of Month`] = `0 0 ${i} * *`;
    }

    // Additional useful frequencies
    const additionalFrequencies = {
        // Daily frequencies
        'Daily at midnight': '0 0 * * *',
        'Daily at noon': '0 12 * * *',
        'Every weekday': '0 0 * * 1-5',
        'Every weekend': '0 0 * * 0,6',

        // Multiple times per day
        'Every hour': '0 * * * *',
        'Every 2 hours': '0 */2 * * *',
        'Every 4 hours': '0 */4 * * *',
        'Every 6 hours': '0 */6 * * *',
        'Every 8 hours': '0 */8 * * *',
        'Every 12 hours': '0 */12 * * *',

        // Weekly frequencies
        'Every week': '0 0 * * 1',
        'Twice a week': '0 0 * * 1,4',

        // Monthly frequencies
        'First day of month': '0 0 1 * *',
        'Last day of month': '0 0 L * *',
        'First Monday of month': '0 0 * * 1#1',
        'Last Friday of month': '0 0 * * 5L',

        // Quarterly
        'First day of quarter': '0 0 1 */3 *',

        // Business hours
        'Every weekday at 9am': '0 9 * * 1-5',
        'Every weekday at 5pm': '0 17 * * 1-5',

        // Custom frequencies
        'Every 15 minutes': '*/15 * * * *',
        'Every 30 minutes': '*/30 * * * *',
        'Twice daily (9am,5pm)': '0 9,17 * * *',
        'Three times daily (9am,1pm,5pm)': '0 9,13,17 * * *',
    };

    // Combine all frequencies
    const allFrequencies = {
        ...weeklyFrequencies,
        ...monthlyDateFrequencies,
        ...additionalFrequencies,
    };

    return allFrequencies[frequency] || null;
};

// Function to schedule a cron job
const scheduleCronJob = async (recurringTask) => {
    const cronExpression = getCronExpressionFromFrequency(recurringTask.frequency);

    if (!cronExpression) {
        console.warn(`Invalid frequency for recurring task: ${recurringTask._id}`);
        return false;
    }

    try {
        const job = cron.schedule(cronExpression, async () => {
            try {
                await createTaskInstance(recurringTask);
            } catch (error) {
                console.error('Error in cron job execution:', error);
            }
        });

        cronJobs[recurringTask._id] = job;
        console.log(`Cron job scheduled for recurring task: ${recurringTask._id}`);
        return true;
    } catch (error) {
        console.error('Error scheduling cron job:', error);
        return false;
    }
};

// Function to create a task instance
const createTaskInstance = async (recurringTask) => {
    try {
        // Get client details to fetch teamLeaderId
        const client = await Client.findById(recurringTask.client);
        if (!client || !client.teamLeader) {
            throw new Error('Client not found or no team leader assigned');
        }

        const teamLeaderId = client.teamLeader;

        // Calculate due date based on frequency
        const dueDate = calculateDueDate(recurringTask.frequency);

        const newTask = new Task({
            title: recurringTask.title,
            description: recurringTask.description,
            client: recurringTask.client,
            category: 'Frequency',
            assignedTo: recurringTask.assignedTo,
            priority: recurringTask.priority,
            parentTaskId: recurringTask._id,
            dueDate: dueDate
        });

        const savedTask = await newTask.save();

        // Update references
        await Promise.all([
            Client.findByIdAndUpdate(recurringTask.client, {
                $push: { tasks: savedTask._id }
            }),
            TeamLeader.findByIdAndUpdate(teamLeaderId, {
                $push: { tasks: savedTask._id }
            }),
            ...(recurringTask.assignedTo.userType === 'Employee'
                ? [Employee.findByIdAndUpdate(recurringTask.assignedTo.userId, {
                    $push: { tasks: savedTask._id }
                })]
                : [])
        ]);

        // Send notification
        await sendTaskNotification(recurringTask, savedTask);

        return savedTask;
    } catch (error) {
        console.error('Error creating task instance:', error);
        throw error;
    }
};

// Function to calculate due date based on frequency
const calculateDueDate = (frequency) => {
    const now = new Date();
    let dueDate = new Date();

    switch (frequency) {
        case 'Daily at midnight':
        case 'Daily at noon':
            dueDate.setDate(now.getDate() + 1);
            break;
        case 'Every week':
            dueDate.setDate(now.getDate() + 7);
            break;
        // Add more cases as needed
        default:
            dueDate.setDate(now.getDate() + 1); // Default to next day
    }

    return dueDate;
};

// Function to send notification
const sendTaskNotification = async (recurringTask, newTask) => {
    try {
        const notificationMessage = `New recurring task "${recurringTask.title}" has been automatically created and assigned to you.`;

        await addNotification(
            recurringTask.assignedTo.userId,
            recurringTask.assignedTo.userType,
            notificationMessage,
            {
                taskId: newTask._id,
                type: 'recurring_task'
            }
        );
    } catch (error) {
        console.error('Error sending notification:', error);
        // Continue execution even if notification fails
    }
};

const restartCronJobs = async () => {
    try {
        console.log('Starting to restore cron jobs after server restart...');

        // Clear existing cron jobs
        Object.keys(cronJobs).forEach(jobId => {
            if (cronJobs[jobId]) {
                cronJobs[jobId].stop();
                delete cronJobs[jobId];
            }
        });

        // Fetch all active recurring tasks
        const recurringTasks = await RecurringTask.find({ active: true });
        console.log(`Found ${recurringTasks.length} active recurring tasks`);

        // Restart each task
        for (const task of recurringTasks) {
            try {
                await scheduleCronJob(task);
                console.log(`Restored cron job for task: ${task._id}`);
            } catch (err) {
                console.error(`Failed to restore cron job for task ${task._id}:`, err.message);
            }
        }

        console.log('Cron job restoration complete');
    } catch (error) {
        console.error('Error restoring cron jobs:', error.message);
    }
};


// Function to stop a cron job
const stopCronJob = (taskId) => {
    if (cronJobs[taskId]) {
        cronJobs[taskId].stop();
        delete cronJobs[taskId];
        return true;
    }
    return false;
};

// Function to update a cron job
const updateCronJob = async (taskId, newFrequency) => {
    // Stop existing job
    stopCronJob(taskId);

    // Get task details
    const task = await RecurringTask.findById(taskId);
    if (!task) {
        throw new Error('Task not found');
    }

    // Update frequency
    task.frequency = newFrequency;
    await task.save();

    // Schedule new job
    return await scheduleCronJob(task);
};

// Function to get all active cron jobs
const getActiveCronJobs = () => {
    return Object.keys(cronJobs).map(taskId => ({
        taskId,
        isActive: cronJobs[taskId].getStatus() === 'scheduled'
    }));
};

// Function to validate cron expression
const isValidCronExpression = (cronExpression) => {
    try {
        return cron.validate(cronExpression);
    } catch (error) {
        return false;
    }
};

// Initialize all recurring tasks on server start
const initializeRecurringTasks = async () => {
    try {
        const recurringTasks = await RecurringTask.find({ active: true });
        for (const task of recurringTasks) {
            await scheduleCronJob(task);
        }
        console.log(`Initialized ${recurringTasks.length} recurring tasks`);
    } catch (error) {
        console.error('Error initializing recurring tasks:', error);
    }
};

module.exports = {
    scheduleCronJob,
    stopCronJob,
    updateCronJob,
    getActiveCronJobs,
    isValidCronExpression,
    initializeRecurringTasks,
    getCronExpressionFromFrequency,
    restartCronJobs,
};