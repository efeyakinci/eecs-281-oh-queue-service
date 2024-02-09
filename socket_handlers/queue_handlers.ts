import { Socket } from "socket.io";

import queue_manager from "../queue/QueueManager.js";
import {queue_signup_schema} from "../verification/queue_verifiers.js";
import {
    get_socket_user,
    get_user_from_token,
    socket_google_login,
    socket_logout,
    socket_token_login
} from "../services/authentication.js";
import {Student} from "../queue/OHQueue.js";
import { io } from "../services/server.js";
import moment from "moment";
import crypto from "crypto";

export const as_response = (event_type: string) => {
    return event_type + ':response';
}

const get_queue_room = (queue_id: string) => {
    return `queue:${queue_id}`;
}

const get_user_room = (uniqname: string) => {
    return `user:${uniqname}`;
}

export enum QueueEvents {
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
}

export enum AuthEvents {
    GOOGLE_LOGIN = 'auth:google_login',
    TOKEN_LOGIN = 'auth:token_login',
    LOGOUT = 'auth:logout',
}

type QueueUpdate<T> = {
    queue_id: string;
    updated_queue: {[k: string]: T}
    removable_uids: string[];
    queue_status?: {[k: string]: any}
}

const pending_heartbeat_requests = new Map<string, Set<string>>;
const users_to_queues = new Map<string, Set<string>>();

const send_queue_update = <T>(queue_id: string, updated_queue: {[k: string]: T}, removable_uids: string[] = []) => {
    const queue = queue_manager.queues.get(queue_id);
    if (!queue) {
        return;
    }

    const queue_update: QueueUpdate<T> = {
        queue_id,
        updated_queue,
        removable_uids
    };

    io.to(get_queue_room(queue_id)).emit(QueueEvents.UPDATE, queue_update);
}

const notify_items_updated = (queue_id: string, updated_uids: string[]) => {
    io.to(get_queue_room(queue_id)).emit(QueueEvents.DATA_UPDATE, {updated_uids});
}

const subscribe_handler = (socket: Socket, queue_id: string) => {
    if (!queue_manager.queues.has(queue_id)) {
        socket.emit(QueueEvents.SUBSCRIBE, {error: 'Queue not found'});
        return;
    }

    socket.join(get_queue_room(queue_id));
}

const unsubscribe_handler = (socket: Socket, queue_id: string) => {
    if (!queue_manager.queues.has(queue_id)) {
        socket.emit(QueueEvents.UNSUBSCRIBE, {error: 'Queue not found'});
        return;
    }

    socket.leave(get_queue_room(queue_id));
}

const join_queue_handler = async (socket: Socket, msg: any) => {
    let validation;
    try {
        validation = await queue_signup_schema.validateAsync(msg);
    } catch (error) {
        socket.emit(as_response(QueueEvents.JOIN), {error: error});
        return;
    }

    const user = get_socket_user(socket);

    if (!user) {
        socket.emit(as_response(QueueEvents.JOIN), {error: 'Unauthorized'});
        return;
    }

    const {queue_id, help_description, location, time_requested} = validation;

    const queue = queue_manager.queues.get(queue_id);

    if (!queue) {
        socket.emit(as_response(QueueEvents.JOIN), {error: 'Queue not found'});
        return;
    }


    const now = moment();

    // @ts-ignore
    const student = new Student({
        name: user.full_name,
        uniqname: user.uniqname,
        attributes: {
            sign_up_time: now,
            time_requested: time_requested,
            help_description,
            location
        },
        top_attributes: {
            being_helped: false,
            in_waiting_room: false
        }
    });

    if (queue.has_item_matching(s => s.uniqname === student.uniqname)) {
        //socket.emit(as_response(QueueEvents.JOIN), {error: 'Already in queue'});
        // return;
    }

    if (users_to_queues.has(user.uniqname)) {
        users_to_queues.get(user.uniqname)?.add(queue_id);
    } else {
        users_to_queues.set(user.uniqname, new Set([queue_id]));
    }

    const uid = queue.enqueue(student);
    const updated_queue = queue.get_uid_to_indices();

    send_queue_update(queue_id, updated_queue, []);
}

const leave_queue_handler = (socket: Socket, {queue_id, uid}: {queue_id: string, uid: string}) => {
    const user = get_socket_user(socket);

    if (!user) {
        socket.emit(as_response(QueueEvents.LEAVE), {error: 'Unauthorized'});
        return;
    }

    const queue = queue_manager.queues.get(queue_id);

    if (!queue) {
        socket.emit(as_response(QueueEvents.LEAVE), {error: 'Queue not found'});
        return;
    }

    const student = queue.get_item_by_id(uid);

    if (!student) {
        socket.emit(as_response(QueueEvents.LEAVE), {error: 'Student not found'});
        return;
    }

    if (student.uniqname !== user.uniqname) {
        socket.emit(as_response(QueueEvents.LEAVE), {error: 'Unauthorized'});
        return;
    }

    const removed_student = queue.remove_item_from_queue(uid);

    if (!removed_student) {
        socket.emit(as_response(QueueEvents.LEAVE), {error: 'Student not found'});
        return;
    }

    const updated_queue = queue.get_uid_to_indices();
    const removable_uids = [uid];

    if (users_to_queues.has(user.uniqname)) {
        users_to_queues.get(user.uniqname)?.delete(queue_id);
    }

    send_queue_update(queue_id, updated_queue, removable_uids);
}

const get_item_info_handler = (socket: Socket, {queue_id, uids} : {queue_id: string, uids: string[]}) => {
    const queue = queue_manager.queues.get(queue_id);

    if (!queue) {
        socket.emit(as_response(QueueEvents.ITEM_INFO), {error: 'Queue not found'});
        return;
    }

    const requester = get_socket_user(socket);
    const anonymiser = queue.get_anonymiser();

    const item_infos_map = new Map<string, any>();

    for (const uid of uids) {
        let student = queue.get_item_by_id(uid);

        if (!student) {
            socket.emit(as_response(QueueEvents.ITEM_INFO), {error: 'Student not found'});
            return;
        }


        if (!student.is_visible_to(requester)) {
            student = anonymiser.anonymise(student);
        }

        item_infos_map.set(uid, student);
    }

    const item_infos = Object.fromEntries(item_infos_map);

    return {
        queue_id,
        item_infos
    };
}

const request_queue_update_handler = (socket: Socket, queue_id: string) => {
    const queue = queue_manager.queues.get(queue_id);

    if (!queue) {
        socket.emit(QueueEvents.UPDATE, {error: 'Queue not found'});
        return;
    }

    const queue_status = {
        queue_id,
        updated_queue: queue.get_uid_to_indices(),
        removable_uids: [],
        queue_status: queue.get_status()
    };


    socket.emit(QueueEvents.UPDATE, queue_status);
}

const help_student_handler = (socket: Socket, {queue_id, uid, is_helped}: {queue_id: string, uid: string, is_helped: boolean}) => {
    const user = get_socket_user(socket);
    if (!user || !user.is_staff) {
        return;
    }

    const queue = queue_manager.queues.get(queue_id);
    if (!queue) {
        return;
    }

    const student = queue.get_item_by_id(uid);
    if (!student) {
        return;
    }

    student.top_attributes.being_helped = is_helped;

    queue.update_item(uid, student);

    const updated_queue = queue.get_uid_to_indices();

    send_queue_update(queue_id, updated_queue);
    notify_items_updated(queue_id, [uid]);

    io.to(get_user_room(student.uniqname)).emit(QueueEvents.BEING_HELPED, {queue_id, is_helped});
}

const mark_student_waiting_handler = (socket: Socket, {queue_id, uid, is_in_waiting_room}: {queue_id: string, uid: string, is_in_waiting_room: boolean}) => {
    const user = get_socket_user(socket);
    if (!user) {
        return;
    }

    if (is_in_waiting_room && !user.is_staff) {
        return;
    }

    const queue = queue_manager.queues.get(queue_id);
    if (!queue) {
        return;
    }

    const student = queue.get_item_by_id(uid);
    if (!student) {
        return;
    }

    if (!is_in_waiting_room && !user.is_staff && user.uniqname !== student.uniqname) {
        return;
    }

    student.top_attributes.in_waiting_room = is_in_waiting_room;

    queue.update_item(uid, student);

    const updated_queue = queue.get_uid_to_indices();

    send_queue_update(queue_id, updated_queue);
    notify_items_updated(queue_id, [uid]);
}

const student_helped_handler = (socket: Socket, {queue_id, uid}: {queue_id: string, uid: string}) => {
    const queue = queue_manager.queues.get(queue_id);
    if (!queue) {
        return;
    }

    const student = queue.get_item_by_id(uid);
    if (!student) {
        return;
    }

    const user = get_socket_user(socket);

    if (!user || !user.is_staff) {
        return;
    }

    // TODO: Add logic to save that the student was helped

    queue.remove_item_from_queue(uid);
    const updated_queue = queue.get_uid_to_indices();
    const removable_uids = [uid];

    send_queue_update(queue_id, updated_queue, removable_uids);
}

const send_message_handler = (socket: Socket, {queue_id, message, to_uniqname}: {queue_id: string, message: string, to_uniqname: string}) => {
    const user = get_socket_user(socket);
    if (!user || !user.is_staff) {
        return;
    }

    const queue = queue_manager.queues.get(queue_id);
    if (!queue) {
        return;
    }


    io.to(get_user_room(to_uniqname)).emit(QueueEvents.RECEIVE_MESSAGE, {queue_id, message});
}

const broadcast_message_handler = (socket: Socket, {queue_id, message}: {queue_id: string, message: string}) => {
    const user = get_socket_user(socket);
    if (!user || !user.is_staff) {
        return;
    }

    const queue = queue_manager.queues.get(queue_id);
    if (!queue) {
        return;
    }

    io.to(get_queue_room(queue_id)).emit(QueueEvents.RECEIVE_MESSAGE, {queue_id, message});

}

const request_heartbeat_handler = (socket: Socket, {queue_id, time_to_respond}: {queue_id: string, time_to_respond: number}) => {
    const user = get_socket_user(socket);
    if (!user || !user.is_staff) {
        return;
    }

    const queue = queue_manager.queues.get(queue_id);
    if (!queue) {
        return;
    }

    const heartbeat_deadline = moment().add(time_to_respond, 'm').toDate();
    const users_at_risk = new Set<string>(
        queue.queue.map(s => s.item.uniqname)
    );
    const request_id = crypto.randomBytes(16).toString('hex').toString();

    for (const uniqname of users_at_risk) {
        io.to(get_user_room(uniqname)).emit(QueueEvents.REQUEST_HEARTBEAT, {queue_id, request_id, heartbeat_deadline});
    }

    pending_heartbeat_requests.set(request_id, users_at_risk);


    setTimeout(() => {
        const removed_items = queue.remove_items_matching(s => users_at_risk.has(s.uniqname));
        const updated_queue = queue.get_uid_to_indices();
        send_queue_update(queue_id, updated_queue, removed_items.map(s => s.id));
    }, time_to_respond * 1000);
}

const heartbeat_handler = (socket: Socket, {request_id}: {request_id: string}) => {
    const student = get_socket_user(socket);

    if (!student) {
        return;
    }

    pending_heartbeat_requests.get(request_id)?.delete(student.uniqname);
}

export default function queue_handlers(socket: Socket) {
    socket.on(QueueEvents.SUBSCRIBE, (queue_id: string) => {
        subscribe_handler(socket, queue_id);
    });

    socket.on(QueueEvents.UNSUBSCRIBE, (queue_id: string) => {
        unsubscribe_handler(socket, queue_id);
    });

    socket.on(AuthEvents.GOOGLE_LOGIN, async (msg: any, callback) => {
        const { access_token } = msg;
        const user_data = await socket_google_login(socket, access_token);

        callback(user_data);
    });

    socket.on(AuthEvents.TOKEN_LOGIN, (msg: any, callback) => {
        const { token } = msg;

        const user_data = socket_token_login(socket, token);

        if (socket.auth_user) {
            socket.join(get_user_room(socket.auth_user.uniqname));
        }
        callback(user_data);
    });

    socket.on(AuthEvents.LOGOUT, () => {
        if (socket.auth_user) {
            socket.leave(get_user_room(socket.auth_user.uniqname));
        }
        socket_logout(socket);
    });

    socket.on(QueueEvents.JOIN, async (msg: any) => {
        await join_queue_handler(socket, msg);
    });

    socket.on(QueueEvents.LEAVE, (msg: any) => {
        const { queue_id, uid } = msg;
        leave_queue_handler(socket, {queue_id, uid});
    });

    socket.on(QueueEvents.ITEM_INFO, (msg: any, callback) => {
        const { queue_id, uids } = msg;
        const items = get_item_info_handler(socket, {queue_id, uids});

        callback(items);
    });

    socket.on(QueueEvents.REQUEST_UPDATE, (msg: any) => {
        const { queue_id } = msg;
        request_queue_update_handler(socket, queue_id);
    });

    socket.on(QueueEvents.HELP_STUDENT, (msg: any) => {
        const { queue_id, uid, is_helped } = msg;

        help_student_handler(socket, {queue_id, uid, is_helped});
    });

    socket.on(QueueEvents.PIN_STUDENT, (msg: any) => {
        const { queue_id, uid, is_in_waiting_room } = msg;

        mark_student_waiting_handler(socket, {queue_id, uid, is_in_waiting_room});
    });

    socket.on(QueueEvents.STUDENT_HELPED, (msg: any) => {
        const { queue_id, uid } = msg;

        student_helped_handler(socket, {queue_id, uid});
    });

    socket.on(QueueEvents.SEND_MESSAGE, (msg: any) => {
        const { queue_id, message, to_uniqname } = msg;
        send_message_handler(socket, {queue_id, message, to_uniqname});
    });

    socket.on(QueueEvents.BROADCAST_MESSAGE, (msg: any) => {
        const { queue_id, message } = msg;
        broadcast_message_handler(socket, {queue_id, message});
    });

    socket.on(QueueEvents.REQUEST_HEARTBEAT, (msg: any) => {
        const { queue_id, time_to_respond } = msg;
        request_heartbeat_handler(socket, {queue_id, time_to_respond});
    });

    socket.on(QueueEvents.HEARTBEAT, (msg: any) => {
        const { queue_id, request_id } = msg;
        heartbeat_handler(socket, { request_id });
    });
}