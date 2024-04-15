import queue_manager from "../queue/QueueManager";
import joi from "joi";
import {io} from "../services/server";
import {OHQueue} from "../queue/OHQueue";
import {Student} from "../queue/QueueTypes";
import {Socket} from "socket.io";

const MINUTE = 60 * 1000;

enum QueueEvents {
    UPDATE = 'queue:queue_update',
    DATA_UPDATE = 'queue:data_update',
    SUBSCRIBE = 'queue:subscribe',
    UNSUBSCRIBE = 'queue:unsubscribe',
    JOIN = 'queue:join',
    LEAVE = 'queue:leave',
    ITEM_INFO = 'queue:item_info',
    REQUEST_UPDATE = 'queue:request_update',
    HELP_STUDENT = 'queue:help_student',
    PIN_STUDENT = 'queue:pin_student',
    STUDENT_HELPED = 'queue:student_helped',
    BEING_HELPED = 'queue:being_helped',
    SEND_MESSAGE = 'queue:send_message',
    RECEIVE_MESSAGE = 'queue:receive_message',
    BROADCAST_MESSAGE = 'queue:broadcast_message',
    REQUEST_HEARTBEAT = 'queue:request_heartbeat',
    HEARTBEAT = 'queue:heartbeat',
    ERROR = 'queue:error',
    UPDATE_SELF = 'queue:update_self',
    CLEAR_QUEUE = 'queue:clear_queue',
    OVERRIDE_QUEUE_SCHEDULE = 'queue:override_queue_schedule',
    SYNC_CALENDAR = 'queue:sync_calendar',
    CONNECT = 'connect',
    DISCONNECT = 'disconnect',
}

enum AuthEvents {
    GOOGLE_LOGIN = 'auth:google_login',
    TOKEN_LOGIN = 'auth:token_login',
    LOGOUT = 'auth:logout',
}

const get_queue_room = (queue_id: string) => {
    return `queue:${queue_id}`;
}

const get_user_room = (uniqname: string) => {
    return `user:${uniqname}`;
}

type QueueUpdate<T> = {
    queue_id: string;
    updated_queue: {[k: string]: T}
    removable_uids: string[];
    queue_status?: {[k: string]: any}
}

const send_queue_update = <T>(queue_id: string, updated_queue: {[k: string]: T}, removable_uids: string[] = [], queue_status: any | undefined = undefined) => {
    const queue = queue_manager.queues.get(queue_id);
    if (!queue) {
        return;
    }

    const queue_update: QueueUpdate<T> = {
        queue_id,
        updated_queue,
        removable_uids,
    };

    if (queue_status) {
        queue_update.queue_status = queue_status;
    }

    io.to(get_queue_room(queue_id)).emit(QueueEvents.UPDATE, queue_update);
}

const notify_items_updated = (queue_id: string, updated_uids: string[]) => {
    io.to(get_queue_room(queue_id)).emit(QueueEvents.DATA_UPDATE, {updated_uids});
}

const update_student = (queue_id: string, queue: OHQueue<Student>, uid: string, updated_student: Student) => {
    queue.update_item(uid, updated_student);
    const updated_queue = queue.get_uid_to_indices();

    notify_items_updated(queue_id, [uid]);
    send_queue_update(queue_id, updated_queue);
}

type QueueHandler<D, T extends D> = {
    event: QueueEvents | AuthEvents,
    handler: (socket: Socket, data: D, listener?: (data: any) => void) => void,
    validation_schema: joi.Schema<T>
}

export {
    MINUTE,
    QueueEvents,
    AuthEvents,
    QueueHandler,
    get_queue_room,
    get_user_room,
    send_queue_update,
    notify_items_updated,
    update_student
}