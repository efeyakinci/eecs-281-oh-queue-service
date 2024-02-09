import dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import { Server } from 'socket.io';
import bodyParser from 'body-parser';
import mongoose from 'mongoose';
import cors from 'cors';
import { createServer } from 'node:http';


import auth_router from './routes/auth.js';
import queue_general_router from './routes/queue_general.js'
import set_queue_handlers from "./socket_handlers/queue_handlers.js";
import {app, io, server} from './services/server.js';



app.get('/', (req, res) => {
    res.send('Hello World!');
});

io.on('connection', (socket) => {
    set_queue_handlers(socket);
});

app.use('/auth', auth_router);

app.use('/queues', queue_general_router);

const PORT = process.env.PORT;

if (!PORT) {
    console.error('PORT is not defined');
    process.exit(1);
}

server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});