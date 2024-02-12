import dotenv from 'dotenv';
import mongoose from "./services/mongo_service.js";
dotenv.config();


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

console.log("Mongo state:", mongoose.connection.readyState);