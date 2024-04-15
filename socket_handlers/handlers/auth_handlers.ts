import {Socket} from "socket.io";
import queueManager from "../../queue/QueueManager";
import {User} from "../../request_types/request_types";
import {LoginEvent} from "../../schemas/EventRecordSchema";
import {
    authenticate_with_google,
    get_jwt_token,
    get_uniqname_from_email,
    get_user_from_token
} from "../../services/authentication";
import {as_response} from "../queue_handlers";
import {AuthEvents, get_user_room, QueueEvents, QueueHandler} from "../handler_utils";
import {google_login_schema, no_data_schema, token_login_schema} from "../handler_schemas";
import {user_online_handler} from "./student_event_handlers";
import {pending_heartbeat_requests, users_to_outstanding_heartbeat_requests} from "../handler_data";

const socket_google_login_handler = async (socket: Socket, {access_token}: {access_token: string}, callback?: (data: any) => void) => {
    try {
        const {email, full_name} = await authenticate_with_google(access_token);
        const uniqname = get_uniqname_from_email(email);

        const is_staff = queueManager.user_is_staff(uniqname);

        const token = get_jwt_token(uniqname, full_name, email, is_staff);
        const user: User = {uniqname, full_name, email, is_staff};

        socket.auth_user = user;

        const user_data = {token, ...user};

        if (socket.auth_user) {
            socket.join(get_user_room(socket.auth_user.uniqname));
            user_online_handler(socket);
        }

        if (callback) {
            callback(user_data);
        }

    } catch (error) {
        console.error(error);
        throw new Error('Failed to authenticate');
    }
}

const socket_token_login_handler = (socket: Socket, {token}: {token: string}, callback?: (data: any) => void) => {
    const user = get_user_from_token(token);

    if (user === undefined) {
        return {error: 'Failed to authenticate'};
    }

    socket.auth_user = user;

    const login_event_log = new LoginEvent({
        uniqname: user.uniqname,
        time: new Date()
    });
    login_event_log.save();

    const user_data = {token, ...user};

    if (socket.auth_user) {
        socket.join(get_user_room(socket.auth_user.uniqname));
        user_online_handler(socket);

        // TODO: This will only pop up one modal for the first heartbeat, so if the user has multiple heartbeat requests, they will only end up answering one.
        if (users_to_outstanding_heartbeat_requests.has(socket.auth_user.uniqname)) {
            for (const request_id of users_to_outstanding_heartbeat_requests.get(socket.auth_user.uniqname)!) {
                socket.emit(QueueEvents.REQUEST_HEARTBEAT, {
                    request_id,
                    heartbeat_deadline: pending_heartbeat_requests.get(request_id)!.expiration
                });
            }
        }
    }

    if (callback) {
        callback(user_data);
    }
};

const socket_logout_handler = (socket: Socket) => {
    if (socket.auth_user) {
        socket.leave(get_user_room(socket.auth_user.uniqname));
    }

    socket.auth_user = undefined;
    socket.emit(as_response(AuthEvents.LOGOUT), {message: 'Logged out'});
}

const handlers: QueueHandler<any, any>[] = [
    {event: AuthEvents.GOOGLE_LOGIN, handler: socket_google_login_handler, validation_schema: google_login_schema},
    {event: AuthEvents.TOKEN_LOGIN, handler: socket_token_login_handler, validation_schema: token_login_schema},
    {event: AuthEvents.LOGOUT, handler: socket_logout_handler, validation_schema: no_data_schema}
];

export default handlers;