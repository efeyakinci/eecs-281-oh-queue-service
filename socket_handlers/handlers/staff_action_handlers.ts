import {Socket} from "socket.io";
import {reduce_middleware, requires_queue, requires_staff, use_middleware} from "../middleware";
import {io} from "../../services/server";
import {get_socket_user} from "../../services/authentication";
import queue_manager from "../../queue/QueueManager";
// @ts-ignore
import { v4 as uuidv4 } from 'uuid';
import {get_queue_room, QueueEvents, QueueHandler, send_queue_update} from "../handler_utils";
import {
    add_announcement_schema,
    broadcast_message_schema,
    clear_queue_schema,
    override_queue_schedule_schema, remove_announcement_schema,
    sync_calendar_schema
} from "../handler_schemas";
import {Announcement} from "../../queue/QueueTypes";

const broadcast_message_handler = (socket: Socket, {queue_id, message}: {queue_id: string, message: string}) => {
    use_middleware(socket,
        {queue_id},
        reduce_middleware(socket, requires_staff, requires_queue));

    io.to(get_queue_room(queue_id)).emit(QueueEvents.RECEIVE_MESSAGE, {queue_id, message});

}

const clear_queue_handler = (socket: Socket, {queue_id}: {queue_id: string}) => {
    const { queue } = use_middleware(socket, {queue_id}, requires_queue, requires_staff);

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
    const { queue } = use_middleware(socket, {queue_id}, requires_queue, requires_staff);

    queue.add_schedule_override(override);
    const updated_queue = queue.get_uid_to_indices();
    send_queue_update(queue_id, updated_queue, [], queue.get_status());
}

const sync_calendar_handler = (socket: Socket, {queue_id}: {queue_id: string}) => {
    const {queue} = use_middleware(socket, {queue_id}, requires_queue, requires_staff);

    queue.sync_calendar().then(() => {
        const updated_queue = queue.get_uid_to_indices();
        send_queue_update(queue_id, updated_queue, [], queue.get_status());
    });

}

const add_announcement_handler = (socket: Socket, {queue_id, message, until}: {queue_id: string, message: string, until?: number}) => {
    const {queue} = use_middleware(socket, {queue_id}, requires_queue, requires_staff);

    const announcement: Announcement = {
        id: uuidv4(),
        message,
    }

    if (until) {
        announcement.until = until;
    }

    queue.add_announcement(announcement);
    const updated_queue = queue.get_uid_to_indices();
    send_queue_update(queue_id, updated_queue, [], queue.get_status());

}

const remove_announcement_handler = (socket: Socket, {queue_id, announcement_id}: {queue_id: string, announcement_id: string}) => {
    const {queue} = use_middleware(socket, {queue_id}, requires_queue, requires_staff);

    queue.remove_announcement(announcement_id);
    const updated_queue = queue.get_uid_to_indices();
    send_queue_update(queue_id, updated_queue, [], queue.get_status());
}

const handlers: QueueHandler<any, any>[] = [
    {event: QueueEvents.BROADCAST_MESSAGE, handler: broadcast_message_handler, validation_schema: broadcast_message_schema},
    {event: QueueEvents.CLEAR_QUEUE, handler: clear_queue_handler, validation_schema: clear_queue_schema},
    {event: QueueEvents.OVERRIDE_QUEUE_SCHEDULE, handler: override_queue_schedule_handler, validation_schema: override_queue_schedule_schema},
    {event: QueueEvents.SYNC_CALENDAR, handler: sync_calendar_handler, validation_schema: sync_calendar_schema},
    {event: QueueEvents.ADD_ANNOUCEMENT, handler: add_announcement_handler, validation_schema: add_announcement_schema},
    {event: QueueEvents.REMOVE_ANNOUCEMENT, handler: remove_announcement_handler, validation_schema: remove_announcement_schema},
]

export default handlers;