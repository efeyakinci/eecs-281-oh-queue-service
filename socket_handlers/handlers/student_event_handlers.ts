import {Socket} from "socket.io";
import {requires_queue, requires_staff, requires_student, requires_user, use_middleware} from "../middleware";
import {io} from "../../services/server";
import queue_manager from "../../queue/QueueManager";
import HelpedRecordModel from "../../schemas/HelpedRecordSchema";
import moment from "moment";
import {get_socket_user} from "../../services/authentication";
import {
    get_user_room,
    notify_items_updated,
    QueueEvents,
    QueueHandler,
    send_queue_update,
    update_student
} from "../handler_utils";
import {users_to_queues} from "../handler_data";
import {
    help_student_schema,
    no_data_schema, send_message_schema,
    student_helped_schema,
    student_waiting_room_schema, update_self_schema
} from "../handler_schemas";

export const user_online_handler = (socket: Socket) => {
    const { user } = use_middleware(socket, {}, requires_user)

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

            student_waiter.item.attributes.is_online = true;

            update_student(queue_id, queue, student_waiter.id, student_waiter.item);
        });
    }

}

const help_student_handler = (socket: Socket, {queue_id, uid, is_helped}: {queue_id: string, uid: string, is_helped: boolean}) => {
    const {queue, student} = use_middleware(socket, {queue_id, student_uid: uid}, requires_queue, requires_staff, requires_student);

    student.attributes.being_helped = is_helped;

    queue.update_item(uid, student);

    const updated_queue = queue.get_uid_to_indices();

    send_queue_update(queue_id, updated_queue);
    notify_items_updated(queue_id, [uid]);

    io.to(get_user_room(student.uniqname)).emit(QueueEvents.BEING_HELPED, {queue_id, is_helped});
}

const mark_student_waiting_handler = (socket: Socket, {queue_id, uid, is_in_waiting_room}: {queue_id: string, uid: string, is_in_waiting_room: boolean}) => {
    const {queue, user} = use_middleware(socket, {queue_id, student_uid: uid}, requires_user, requires_queue);

    const student = queue.get_item_by_id(uid);

    if (!student) {
        socket.emit(QueueEvents.ERROR, {error: 'Student not found'});
        return;
    }

    if (is_in_waiting_room && !queue.is_user_staff(user.uniqname)) {
        socket.emit(QueueEvents.ERROR, {error: 'You do not have permission to do that'});
        return;
    }

    if (!is_in_waiting_room && !queue.is_user_staff(user.uniqname) && user.uniqname !== student.uniqname) {
        socket.emit(QueueEvents.ERROR, {error: 'You do not have permission to do that'});
        return;
    }

    student.attributes.in_waiting_room = is_in_waiting_room;

    queue.update_item(uid, student);

    const updated_queue = queue.get_uid_to_indices();

    send_queue_update(queue_id, updated_queue);
    notify_items_updated(queue_id, [uid]);
}

const student_helped_handler = (socket: Socket, {queue_id, uid}: {queue_id: string, uid: string}) => {
    const {queue, student} = use_middleware(socket, {queue_id, student_uid: uid}, requires_queue, requires_staff, requires_student);

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
    use_middleware(socket, {queue_id}, requires_user, requires_queue, requires_staff);

    io.to(get_user_room(to_uniqname)).emit(QueueEvents.RECEIVE_MESSAGE, {queue_id, message});
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


const handlers: QueueHandler<any>[] = [
    {event: QueueEvents.CONNECT, handler: user_online_handler, validation_schema: no_data_schema},
    {event: QueueEvents.HELP_STUDENT, handler: help_student_handler, validation_schema: help_student_schema},
    {event: QueueEvents.PIN_STUDENT, handler: mark_student_waiting_handler, validation_schema: student_waiting_room_schema},
    {event: QueueEvents.STUDENT_HELPED, handler: student_helped_handler, validation_schema: student_helped_schema},
    {event: QueueEvents.SEND_MESSAGE, handler: send_message_handler, validation_schema: send_message_schema},
    {event: QueueEvents.UPDATE_SELF, handler: update_student_handler, validation_schema: update_self_schema}
]

export default handlers;