import auth_handlers from './auth_handlers.js'
import queue_data_handlers from './queue_data_handlers.js'
import queue_event_handlers from './queue_event_handlers.js'
import staff_action_handlers from "./staff_action_handlers";
import student_event_handlers from "./student_event_handlers";
import heartbeat_handlers from "./heartbeat_handlers";
import {QueueHandler} from "../handler_utils";

const handlers: QueueHandler<any, any>[] = [
    ...auth_handlers,
    ...queue_data_handlers,
    ...queue_event_handlers,
    ...staff_action_handlers,
    ...student_event_handlers,
    ...heartbeat_handlers
]

export default handlers;