const express = require('express');
const verifyAuthToken = require('../middleware/authMiddleware');
const { createEmployee, editEmployee, loginEmployee, deleteEmployee, getEmployeeTasks, uploadEmployeeDP, getEmployeeDP, deleteEmployeeDP } = require('../controllers/employee');
const router = express.Router();

router.post('/create', verifyAuthToken, createEmployee);

router.put('/edit', verifyAuthToken, editEmployee);

router.post('/login', loginEmployee);

router.delete('/delete', deleteEmployee);

router.get('/employeeTasks', getEmployeeTasks);

router.post('/uploadDP', uploadEmployeeDP);

router.post('/dp', getEmployeeDP);

router.post('deleteDP', deleteEmployeeDP)

module.exports = router;