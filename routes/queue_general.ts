import express from "express";
import { OHQueue } from "../queue/OHQueue.js";
import queue_manager from "../queue/QueueManager.js";
import { User } from "../request_types/request_types.js";
import { Request, Response } from "express";
import {auth_middleware} from "../services/authentication.js";

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
   const queue_map = Object.fromEntries(queue_ids.map((id) => [id, queue_manager.queues.get(id)?.queue_name]));
    res.json(queue_map);
});

router.get('/:id/queue', [auth_middleware], (req: Request, res: Response) => {
    const queue_id = req.params.id;
    const queue = queue_manager.queues.get(queue_id);
    if (!queue) {
        return res.status(404).json({message: 'Queue not found'});
    }

    const anonymiser = queue.get_anonymiser();

    const queue_items = queue.queue.map((item) => {
        if (req.user) {
            console.log(req.user.is_staff, req.user.uniqname, item.item.uniqname)
            if (req.user.is_staff || req.user.uniqname === item.item.uniqname) {
                return {uid: item.id, ...item.item}
            }
        }

        return {uid: item.id, ...anonymiser.anonymise(item.item)};
    });

    res.json({
        waiters: queue_items
    });
});


export default router;