import {Socket} from "socket.io";
import queue_manager from "../../queue/QueueManager";
import {get_socket_user} from "../../services/authentication";
import {QueueEvents, QueueHandler} from "../handler_utils";
import {queue_item_info_schema} from "../handler_schemas";

const get_item_info_handler = (socket: Socket, {queue_id, uids} : {queue_id: string, uids: string[]}, callback?: (data: any) => void) => {
    const queue = queue_manager.queues.get(queue_id);

    if (!queue) {
        socket.emit(QueueEvents.ERROR, {error: 'Queue not found'});
        return;
    }

    const requester = get_socket_user(socket);
    const anonymiser = queue.get_anonymiser();

    const item_infos_map = new Map<string, any>();
    const user = get_socket_user(socket);

    const is_staff = user != undefined && queue.is_user_staff(user.uniqname);

    for (const uid of uids) {
        let student = queue.get_item_by_id(uid);

        if (!student) {
            socket.emit(QueueEvents.ERROR, {error: 'Student not found'});
            return;
        }


        if (anonymiser.should_anonymise_to(student, requester, is_staff)) {
            student = anonymiser.anonymise(student);
        }

        item_infos_map.set(uid, student);
    }

    const item_infos = Object.fromEntries(item_infos_map);
    if (callback) {
        callback({item_infos});
    }
}

const handlers: QueueHandler<any, any>[] = [
    {event: QueueEvents.ITEM_INFO, handler: get_item_info_handler, validation_schema: queue_item_info_schema}
];

export default handlers;