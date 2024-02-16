import { Socket } from "socket.io";

import queue_manager from "../queue/QueueManager.js";
import {
    broadcast_message_schema, clear_queue_schema,
    google_login_schema, heartbeat_schema,
    help_student_schema, override_queue_schedule_schema,
    queue_item_info_schema,
    queue_leave_schema,
    queue_signup_schema,
    request_heartbeat_schema,
    request_update_schema,
    send_message_schema,
    student_helped_schema,
    student_waiting_room_schema, subscribe_schema,
    token_login_schema, unsubscribe_schema, update_self_schema
} from "./handler_schemas.js";


import {
    get_socket_user,
    socket_google_login,
    socket_logout,
    socket_token_login
} from "../services/authentication.js";

import {OHQueue} from "../queue/OHQueue.js";
import { io } from "../services/server.js";
import moment from "moment";
import crypto from "crypto";
import HelpedRecordModel from "../schemas/HelpedRecordSchema.js";
import {Student} from "../queue/QueueTypes.js";

const MINUTE = 60 * 1000;

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
    ERROR = 'queue:error',
    UPDATE_SELF = 'queue:update_self',
    CLEAR_QUEUE = 'queue:clear_queue',
    OVERRIDE_QUEUE_SCHEDULE = 'queue:override_queue_schedule'
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

const subscribe_handler = (socket: Socket, {queue_id}: {queue_id: string}) => {
    if (!queue_manager.queues.has(queue_id)) {
        socket.emit(QueueEvents.ERROR, {error: 'Queue not found'});
        return;
    }

    socket.join(get_queue_room(queue_id));
}

const unsubscribe_handler = (socket: Socket, {queue_id}: {queue_id: string}) => {
    if (!queue_manager.queues.has(queue_id)) {
        socket.emit(QueueEvents.ERROR, {error: 'Queue not found'});
        return;
    }

    socket.leave(get_queue_room(queue_id));
}

const join_queue_handler = async (socket: Socket, {queue_id, help_description, location, time_requested} : {
    queue_id: string,
    help_description: string,
    location: string,
    time_requested?: number
}) => {

    const user = get_socket_user(socket);

    if (!user) {
        socket.emit(QueueEvents.ERROR, {error: 'Unauthorized'})
        return;
    }

    const queue = queue_manager.queues.get(queue_id);

    if (!queue) {
        socket.emit(QueueEvents.ERROR, {error: 'Queue not found'});
        return;
    }

    if (!queue.is_open()) {
        socket.emit(QueueEvents.ERROR, {error: 'Queue is closed'});
        return;
    }

    const now = moment();

    // See if the student has been helped today
    const student_helped_records = await HelpedRecordModel.findOne({
        uniqname: user.uniqname,
        helped_at: {
            $gte: now.startOf('day').toDate(),
            $lte: now.endOf('day').toDate()
        }
    });

    const student = new Student({
        name: user.full_name,
        uniqname: user.uniqname,
        attributes: {
            sign_up_time: moment(),
            time_requested: time_requested,
            help_description,
            location,
            helped_today: student_helped_records !== null
        },
        top_attributes: {
            being_helped: false,
            in_waiting_room: false,
            is_online: true
        }
    });


    if (queue.has_item_matching(s => s.uniqname === student.uniqname)) {
        socket.emit(QueueEvents.ERROR, {error: 'Already in queue'});
        return;
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
        socket.emit(QueueEvents.ERROR, {error: 'Unauthorized'});
        return;
    }

    const queue = queue_manager.queues.get(queue_id);

    if (!queue) {
        socket.emit(QueueEvents.ERROR, {error: 'Queue not found'});
        return;
    }

    const student = queue.get_item_by_id(uid);

    if (!student) {
        socket.emit(QueueEvents.ERROR, {error: 'Student not found'});
        return;
    }

    if (student.uniqname !== user.uniqname) {
        socket.emit(QueueEvents.ERROR, {error: 'Unauthorized'});
        return;
    }

    const removed_student = queue.remove_item_from_queue(uid);

    if (!removed_student) {
        socket.emit(QueueEvents.ERROR, {error: 'Student not found'});
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
        socket.emit(QueueEvents.ERROR, {error: 'Queue not found'});
        return;
    }

    const requester = get_socket_user(socket);
    const anonymiser = queue.get_anonymiser();

    const item_infos_map = new Map<string, any>();

    for (const uid of uids) {
        let student = queue.get_item_by_id(uid);

        if (!student) {
            socket.emit(QueueEvents.ERROR, {error: 'Student not found'});
            return;
        }


        if (anonymiser.should_anonymise_to(student, requester)) {
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

const request_queue_update_handler = (socket: Socket, {queue_id}: {queue_id: string}) => {
    const queue = queue_manager.queues.get(queue_id);

    if (!queue) {
        socket.emit(QueueEvents.ERROR, {error: 'Queue not found'});
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

const disconnect_handler = (socket: Socket) => {
    const user = get_socket_user(socket);

    if (!user) {
        return;
    }

    const new_user_socket_count = io.sockets.adapter.rooms.get(get_user_room(user.uniqname))?.size || 1;

    if (new_user_socket_count === 1) {
        users_to_queues.get(user.uniqname)?.forEach(queue_id => {
            const queue = queue_manager.queues.get(queue_id);
            if (!queue) {
                return;
            }

            const student_waiter = queue.get_item_matching(s => s.uniqname === user.uniqname);
            if (!student_waiter) {
                return;
            }

            student_waiter.item.top_attributes.is_online = false;

            update_student(queue_id, queue, student_waiter.id, student_waiter.item);
        });
    }
}

const user_online_handler = (socket: Socket) => {
    const user = get_socket_user(socket);

    if (!user) {
        return;
    }

    const new_user_socket_count = io.sockets.adapter.rooms.get(get_user_room(user.uniqname))?.size || 0;

    if (new_user_socket_count === 1) {
        users_to_queues.get(user.uniqname)?.forEach(queue_id => {
            const queue = queue_manager.queues.get(queue_id);
            if (!queue) {
                return;
            }

            const student_waiter = queue.get_item_matching(s => s.uniqname === user.uniqname);
            if (!student_waiter) {
                return;
            }

            student_waiter.item.top_attributes.is_online = true;

            update_student(queue_id, queue, student_waiter.id, student_waiter.item);
        });
    }

}

const help_student_handler = (socket: Socket, {queue_id, uid, is_helped}: {queue_id: string, uid: string, is_helped: boolean}) => {
    const user = get_socket_user(socket);
    if (!user || !user.is_staff) {
        socket.emit(QueueEvents.ERROR, {error: 'Unauthorized'});
        return;
    }

    const queue = queue_manager.queues.get(queue_id);
    if (!queue) {
        socket.emit(QueueEvents.ERROR, {error: 'Queue not found'});
        return;
    }

    const student = queue.get_item_by_id(uid);
    if (!student) {
        socket.emit(QueueEvents.ERROR, {error: 'Student not found'});
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
        socket.emit(QueueEvents.ERROR, {error: 'Unauthorized'});
        return;
    }

    if (is_in_waiting_room && !user.is_staff) {
        socket.emit(QueueEvents.ERROR, {error: 'You do not have permission to do that'});
        return;
    }

    const queue = queue_manager.queues.get(queue_id);
    if (!queue) {
        socket.emit(QueueEvents.ERROR, {error: 'Queue not found'});
        return;
    }

    const student = queue.get_item_by_id(uid);
    if (!student) {
        socket.emit(QueueEvents.ERROR, {error: 'Student not found'});
        return;
    }

    if (!is_in_waiting_room && !user.is_staff && user.uniqname !== student.uniqname) {
        socket.emit(QueueEvents.ERROR, {error: 'You do not have permission to do that'});
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
        socket.emit(QueueEvents.ERROR, {error: 'Queue not found'});
        return;
    }

    const student = queue.get_item_by_id(uid);
    if (!student) {
        socket.emit(QueueEvents.ERROR, {error: 'Student not found'});
        return;
    }

    const user = get_socket_user(socket);

    if (!user || !user.is_staff) {
        socket.emit(QueueEvents.ERROR, {error: 'Unauthorized'});
        return;
    }

    const helped_record = new HelpedRecordModel({
        uniqname: student.uniqname,
        queue_id: queue_id,
        helped_at: moment().toDate()
    });

    helped_record.save().then(() => {
        // TODO: Maybe do stuff? Idk.
    });

    queue.remove_item_from_queue(uid);
    const updated_queue = queue.get_uid_to_indices();
    const removable_uids = [uid];

    send_queue_update(queue_id, updated_queue, removable_uids);
}

const send_message_handler = (socket: Socket, {queue_id, message, to_uniqname}: {queue_id: string, message: string, to_uniqname: string}) => {
    const user = get_socket_user(socket);
    if (!user || !user.is_staff) {
        socket.emit(QueueEvents.ERROR, {error: 'Unauthorized'});
        return;
    }

    const queue = queue_manager.queues.get(queue_id);
    if (!queue) {
        socket.emit(QueueEvents.ERROR, {error: 'Queue not found'});
        return;
    }


    io.to(get_user_room(to_uniqname)).emit(QueueEvents.RECEIVE_MESSAGE, {queue_id, message});
}

const broadcast_message_handler = (socket: Socket, {queue_id, message}: {queue_id: string, message: string}) => {
    const user = get_socket_user(socket);
    if (!user || !user.is_staff) {
        socket.emit(QueueEvents.ERROR, {error: 'Unauthorized'});
        return;
    }

    const queue = queue_manager.queues.get(queue_id);
    if (!queue) {
        socket.emit(QueueEvents.ERROR, {error: 'Queue not found'});
        return;
    }

    io.to(get_queue_room(queue_id)).emit(QueueEvents.RECEIVE_MESSAGE, {queue_id, message});

}

const request_heartbeat_handler = (socket: Socket, {queue_id, time_to_respond}: {queue_id: string, time_to_respond: number}) => {
    const user = get_socket_user(socket);
    if (!user || !user.is_staff) {
        socket.emit(QueueEvents.ERROR, {error: 'Unauthorized'});
        return;
    }

    const queue = queue_manager.queues.get(queue_id);
    if (!queue) {
        socket.emit(QueueEvents.ERROR, {error: 'Queue not found'});
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
    }, time_to_respond * MINUTE);
}

const heartbeat_handler = (socket: Socket, {request_id}: {request_id: string}) => {
    const student = get_socket_user(socket);

    if (!student) {
        socket.emit(QueueEvents.ERROR, {error: 'Unauthorized'});
        return;
    }

    pending_heartbeat_requests.get(request_id)?.delete(student.uniqname);
}

const update_student_handler = (socket: Socket, {queue_id, uid, updated_fields}: {queue_id: string, uid: string, updated_fields: {[k: string]: string}}) => {
    const user = get_socket_user(socket);
    if (!user) {
        socket.emit(QueueEvents.ERROR, {error: 'Unauthorized'});
        return;
    }

    const queue = queue_manager.queues.get(queue_id);

    if (!queue) {
        socket.emit(QueueEvents.ERROR, {error: 'Queue not found'});
        return;
    }

    const current_student = queue.get_item_by_id(uid);

    if (!current_student) {
        socket.emit(QueueEvents.ERROR, {error: 'Student not found'});
        return;
    }

    if (updated_fields['help_description']) {
        current_student.attributes.help_description = updated_fields['help_description'];
    }

    if (updated_fields['location']) {
        current_student.attributes.location = updated_fields['location'];
    }

    update_student(queue_id, queue, uid, current_student);
};

const clear_queue_handler = (socket: Socket, {queue_id}: {queue_id: string}) => {
    const user = get_socket_user(socket);
    if (!user || !user.is_staff) {
        socket.emit(QueueEvents.ERROR, {error: 'Unauthorized'});
        return;
    }

    const queue = queue_manager.queues.get(queue_id);

    if (!queue) {
        socket.emit(QueueEvents.ERROR, {error: 'Queue not found'});
        return;
    }

    const removed_ids = queue.clear_queue();
    const updated_queue = queue.get_uid_to_indices();
    send_queue_update(queue_id, updated_queue, removed_ids);
}


type QueueScheduleOverride = {
    from_date_time: number;
    to_date_time: number;
    type: "open" | "close";
}
const override_queue_schedule_handler = (socket: Socket, {queue_id, override}: {queue_id: string, override: QueueScheduleOverride}) => {
    const user = get_socket_user(socket);

    if (!user || !user.is_staff) {
        socket.emit(QueueEvents.ERROR, {error: 'Unauthorized'});
        return;
    }

    const queue = queue_manager.queues.get(queue_id);
    if (!queue) {
        socket.emit(QueueEvents.ERROR, {error: 'Queue not found'});
        return;
    }

    queue.add_schedule_override(override);
    const updated_queue = queue.get_uid_to_indices();
    send_queue_update(queue_id, updated_queue, [], queue.get_status());
}

export default function queue_handlers(socket: Socket) {
    socket.on(QueueEvents.SUBSCRIBE, (msg: string) => {
        const valid = subscribe_schema.validate(msg);

        if (valid.error) {
            socket.emit(QueueEvents.ERROR, {error: valid.error.message});
            return;
        }

        subscribe_handler(socket, valid.value);
    });

    socket.on(QueueEvents.UNSUBSCRIBE, (msg: string) => {
        const valid = unsubscribe_schema.validate(msg);

        if (valid.error) {
            socket.emit(QueueEvents.ERROR, {error: valid.error.message});
            return;
        }

        unsubscribe_handler(socket, valid.value);
    });

    socket.on(AuthEvents.GOOGLE_LOGIN, async (msg: any, callback) => {
        const valid = google_login_schema.validate(msg);
        if (valid.error) {
            callback({error: valid.error.message});
            return;
        }

        const user_data = await socket_google_login(socket, valid.value);

        callback(user_data);
    });

    socket.on(AuthEvents.TOKEN_LOGIN, (msg: any, callback) => {
        const valid = token_login_schema.validate(msg);

        if (valid.error) {
            callback({error: valid.error.message});
            return;
        }

        const user_data = socket_token_login(socket, valid.value);

        if (socket.auth_user) {
            socket.join(get_user_room(socket.auth_user.uniqname));
            user_online_handler(socket);
        }
        callback(user_data);
    });

    socket.on(AuthEvents.LOGOUT, () => {
        if (socket.auth_user) {
            socket.leave(get_user_room(socket.auth_user.uniqname));
        }
        socket_logout(socket);
    });

    socket.on(QueueEvents.JOIN, (msg: any) => {
        const valid = queue_signup_schema.validate(msg);
        if (valid.error) {
            socket.emit(QueueEvents.ERROR, {error: valid.error.message});
            return;
        }

        join_queue_handler(socket, valid.value);
    });

    socket.on(QueueEvents.LEAVE, (msg: any) => {
        const valid = queue_leave_schema.validate(msg);

        if (valid.error) {
            socket.emit(QueueEvents.ERROR, {error: valid.error.message});
            return;
        }

        leave_queue_handler(socket, valid.value);
    });

    socket.on(QueueEvents.ITEM_INFO, (msg: any, callback) => {
        const valid = queue_item_info_schema.validate(msg);

        if (valid.error) {
            callback({error: valid.error.message});
            return;
        }

        const items = get_item_info_handler(socket, valid.value);

        callback(items);
    });

    socket.on(QueueEvents.REQUEST_UPDATE, (msg: any) => {
        const valid = request_update_schema.validate(msg);

        if (valid.error) {
            socket.emit(QueueEvents.ERROR, {error: valid.error.message});
            return;
        }
        request_queue_update_handler(socket, valid.value);
    });

    socket.on(QueueEvents.HELP_STUDENT, (msg: any) => {
        const valid = help_student_schema.validate(msg);

        if (valid.error) {
            socket.emit(QueueEvents.ERROR, {error: valid.error.message});
            return;
        }

        help_student_handler(socket, valid.value);
    });

    socket.on(QueueEvents.PIN_STUDENT, (msg: any) => {
        const valid = student_waiting_room_schema.validate(msg);

        if (valid.error) {
            socket.emit(QueueEvents.ERROR, {error: valid.error.message});
            return;
        }

        mark_student_waiting_handler(socket, valid.value);
    });

    socket.on(QueueEvents.STUDENT_HELPED, (msg: any) => {
        const valid = student_helped_schema.validate(msg);

        if (valid.error) {
            socket.emit(QueueEvents.ERROR, {error: valid.error.message});
            return;
        }

        student_helped_handler(socket, valid.value);
    });

    socket.on(QueueEvents.SEND_MESSAGE, (msg: any) => {
        const valid = send_message_schema.validate(msg);

        if (valid.error) {
            socket.emit(QueueEvents.ERROR, {error: valid.error.message});
            return;
        }

        send_message_handler(socket, valid.value);
    });

    socket.on(QueueEvents.BROADCAST_MESSAGE, (msg: any) => {
        const valid = broadcast_message_schema.validate(msg);

        if (valid.error) {
            socket.emit(QueueEvents.ERROR, {error: valid.error.message});
            return;
        }

        broadcast_message_handler(socket, valid.value);
    });

    socket.on(QueueEvents.REQUEST_HEARTBEAT, (msg: any) => {
        const valid = request_heartbeat_schema.validate(msg);

        if (valid.error) {
            socket.emit(QueueEvents.ERROR, {error: valid.error.message});
            return;
        }

        request_heartbeat_handler(socket, valid.value);
    });

    socket.on(QueueEvents.HEARTBEAT, (msg: any) => {
        const valid = heartbeat_schema.validate(msg);

        if (valid.error) {
            socket.emit(QueueEvents.ERROR, {error: valid.error.message});
            return;
        }

        heartbeat_handler(socket, valid.value);
    });

    socket.on(QueueEvents.UPDATE_SELF, (msg: any) => {
        const valid = update_self_schema.validate(msg);
        if (valid.error) {
            socket.emit(QueueEvents.ERROR, {error: valid.error.message});
            return;
        }

        update_student_handler(socket, valid.value);
    });

    socket.on(QueueEvents.CLEAR_QUEUE, (msg: any) => {
        const valid = clear_queue_schema.validate(msg);
        if (valid.error) {
            socket.emit(QueueEvents.ERROR, {error: valid.error.message});
            return;
        }

        clear_queue_handler(socket, valid.value);
    });

    socket.on(QueueEvents.OVERRIDE_QUEUE_SCHEDULE, (msg: any) => {
        const valid = override_queue_schedule_schema.validate(msg);
        if (valid.error) {
            socket.emit(QueueEvents.ERROR, {error: valid.error.message});
            return;
        }

        override_queue_schedule_handler(socket, valid.value);
    });

    socket.on('disconnect', () => {
        disconnect_handler(socket);
    });
}