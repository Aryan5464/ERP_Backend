const express = require('express');
const verifyAuthToken = require('../middleware/authMiddleware');
const { createEmployee, editEmployee, loginEmployee, deleteEmployee, promoteEmployeeToTeamLeader } = require('../controllers/employee');
const router = express.Router();

router.post('/create', verifyAuthToken, createEmployee);

router.put('/edit', verifyAuthToken, editEmployee);

router.post('/login', loginEmployee);

router.delete('/delete', deleteEmployee);

router.post('/promote', verifyAuthToken, promoteEmployeeToTeamLeader);
                                                
module.exports = router;