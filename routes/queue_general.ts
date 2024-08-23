import express, { Request, Response } from "express";
import queue_manager from "../queue/QueueManager";
import { User } from "../request_types/request_types";
import { auth_middleware } from "../services/authentication";

const router = express.Router();

// extend Request
declare global {
    namespace Express {
        interface Request {
            user?: User
        }
    }
}


router.get('/', (req, res) => {
    const queue_ids = Array.from(queue_manager.queues.keys());

    const queues: {[key: string]: { queue_name: string, class_name: string }} = {};

    for (const queue_id of queue_ids) {
        const queue = queue_manager.queues.get(queue_id);
        if (!queue) {
            continue;
        }

        queues[queue_id] = {
            queue_name: queue.queue_name,
            class_name: queue.class_name
        };
    }

    res.json(queues);
});


export default router;