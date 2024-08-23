import {Socket} from "socket.io";
import queue_manager from "../../queue/QueueManager";
import {get_socket_user} from "../../services/authentication";
import moment from "moment";
import HelpedRecordModel from "../../schemas/HelpedRecordSchema";
import {Student} from "../../queue/QueueTypes";
import {
    get_queue_room,
    get_user_room,
    QueueEvents,
    QueueHandler,
    send_queue_update,
    update_student
} from "../handler_utils";
import {users_to_queues} from "../handler_data";
import {io} from "../../services/server";
import {
    check_if_staff_schema,
    no_data_schema,
    queue_leave_schema,
    queue_signup_schema,
    request_update_schema,
    subscribe_schema,
    unsubscribe_schema
} from "../handler_schemas";
import { requires_queue, requires_user, use_middleware } from "../middleware";

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
            helped_today: student_helped_records !== null,
            being_helped: false,
            in_waiting_room: false,
            is_online: true
        },
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

const request_queue_update_handler = (socket: Socket, {queue_id}: {queue_id: string}) => {
    const queue = queue_manager.queues.get(queue_id);

    if (!queue) {
        socket.emit(QueueEvents.ERROR, {error: 'Queue not found'});
        return;
    }

    const user = get_socket_user(socket);

    const queue_status = {
        queue_id,
        updated_queue: queue.get_uid_to_indices(),
        removable_uids: [],
        queue_status: queue.get_status(),
    };


    socket.emit(QueueEvents.UPDATE, queue_status);
}

const check_if_staff_handler = (socket: Socket, {queue_id}: {queue_id: string}, callback: (is_staff: boolean) => void) => {
    const { queue } = use_middleware(socket, {queue_id}, requires_queue);

    const user = get_socket_user(socket);

    callback(user != undefined && queue.is_user_staff(user.uniqname));
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

            student_waiter.item.attributes.is_online = false;

            update_student(queue_id, queue, student_waiter.id, student_waiter.item);
        });
    }
}



const handlers: QueueHandler<any>[] = [
    {event: QueueEvents.SUBSCRIBE, handler: subscribe_handler, validation_schema: subscribe_schema},
    {event: QueueEvents.UNSUBSCRIBE, handler: unsubscribe_handler, validation_schema: unsubscribe_schema},
    {event: QueueEvents.JOIN, handler: join_queue_handler, validation_schema: queue_signup_schema},
    {event: QueueEvents.LEAVE, handler: leave_queue_handler, validation_schema: queue_leave_schema},
    {event: QueueEvents.REQUEST_UPDATE, handler: request_queue_update_handler, validation_schema: request_update_schema},
    {event: QueueEvents.CHECK_IF_STAFF, handler: check_if_staff_handler, validation_schema: check_if_staff_schema},
    {event: QueueEvents.DISCONNECT, handler: disconnect_handler, validation_schema: no_data_schema},
]

export default handlers;