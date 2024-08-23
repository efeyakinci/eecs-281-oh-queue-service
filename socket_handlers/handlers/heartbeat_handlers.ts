import {OHQueue} from "../../queue/OHQueue";
import {Socket} from "socket.io";
import {requires_queue, requires_staff, requires_user, use_middleware} from "../middleware";
import moment from "moment/moment";
import crypto from "crypto";
import {io} from "../../services/server";
import {pending_heartbeat_requests, users_to_outstanding_heartbeat_requests} from "../handler_data";
import {get_user_room, MINUTE, QueueEvents, QueueHandler, send_queue_update} from "../handler_utils";
import { heartbeat_schema, request_heartbeat_schema } from "../handler_schemas";

const request_heartbeat_handler = (socket: Socket, {queue_id, time_to_respond}: {queue_id: string, time_to_respond: number}) => {
    const { queue } = use_middleware(socket, {queue_id}, requires_queue, requires_staff);

    const heartbeat_deadline = moment().add(time_to_respond, 'm').toDate();
    const users_at_risk = new Set<string>(
        queue.queue.map(s => s.item.uniqname)
    );
    const request_id = crypto.randomBytes(16).toString('hex').toString();

    for (const uniqname of users_at_risk) {
        io.to(get_user_room(uniqname)).emit(QueueEvents.REQUEST_HEARTBEAT, {request_id, heartbeat_deadline});

        if (users_to_outstanding_heartbeat_requests.has(uniqname)) {
            users_to_outstanding_heartbeat_requests.get(uniqname)?.add(request_id);
        } else {
            users_to_outstanding_heartbeat_requests.set(uniqname, new Set([request_id]));
        }
    }

    pending_heartbeat_requests.set(request_id, {
        request_id,
        users_at_risk,
        expiration: heartbeat_deadline
    });


    setTimeout(() => {
        const removed_items = queue.remove_items_matching(s => users_at_risk.has(s.uniqname));
        const updated_queue = queue.get_uid_to_indices();
        send_queue_update(queue_id, updated_queue, removed_items.map(s => s.id));
    }, time_to_respond * MINUTE);
}

const heartbeat_handler = (socket: Socket, {request_id}: {request_id: string[]}) => {
    const { user } = use_middleware(socket, {}, requires_user);

    request_id.forEach(request_id => {
        pending_heartbeat_requests.get(request_id)?.users_at_risk?.delete(user.uniqname);
        users_to_outstanding_heartbeat_requests.get(user.uniqname)?.delete(request_id);
    })
}

const handlers: QueueHandler<any>[] = [
    {event: QueueEvents.REQUEST_HEARTBEAT, handler: request_heartbeat_handler, validation_schema: request_heartbeat_schema},
    {event: QueueEvents.HEARTBEAT, handler: heartbeat_handler, validation_schema: heartbeat_schema}
]

export default handlers;