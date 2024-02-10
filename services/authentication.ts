import jwt from "jsonwebtoken";
import { User } from "../request_types/request_types.js";
import {Socket} from "socket.io";
import {OAuth2Client} from "google-auth-library";
import {NextFunction, Request, Response} from "express";
import axios from "axios";
import {as_response, AuthEvents} from "../socket_handlers/queue_handlers.js";
import queueManager from "../queue/QueueManager.js";


const oauth2Client = new OAuth2Client(process.env.GOOGLE_OAUTH_CLIENT_ID);
const PROFILE_ENDPOINT = "https://www.googleapis.com/userinfo/v2/me";

export const auth_middleware = (req: Request, res: Response, next: NextFunction) => {
    const auth_header = req.headers.authorization;

    if (!auth_header) {
        return next();
    }

    const token = auth_header.split(' ');

    if (token.length !== 2) {
        return next();
    }

    const user = get_user_from_token(token[1]);

    if (user === undefined) {
        return next();
    }

    req.user = user;

    next();
}


const get_uniqname_from_email = (email: string) => {
    return email.split('@')[0];
}

const get_jwt_token = (uniqname: string, full_name: string, email: string, is_staff: boolean ) => {
    if (process.env.JWT_SECRET == undefined) {
        throw new Error("JWT_SECRET undefined")
    }

    return jwt.sign({ uniqname, full_name, email, is_staff }, process.env.JWT_SECRET, { expiresIn: '1d' });
}

const authenticate_with_google = async (access_token: string) => {
    const user_info = await axios.get(PROFILE_ENDPOINT, {
        headers: {
            Authorization: `Bearer ${access_token}`
        }
    });

    const { email, name } = user_info.data;

    return {email, full_name: name};
}

export const get_user_from_token = (token: string): User | undefined => {
    if (process.env.JWT_SECRET === undefined) {
        throw new Error("JWT Token Undefined")
    }

    let user: User | undefined = undefined;

    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) {
            console.error(err);
            return;
        }

        try {
            user = decoded as User;
        } catch (error) {
            console.error(error);
            return;
        }
    });

    return user;
}

export const socket_google_login = async (socket: Socket, {access_token}: {access_token: string}) => {
    try {
        const {email, full_name} = await authenticate_with_google(access_token);
        const uniqname = get_uniqname_from_email(email);

        const is_staff = queueManager.user_is_staff(uniqname);

        const token = get_jwt_token(uniqname, full_name, email, is_staff);
        const user: User = {uniqname, full_name, email, is_staff};

        socket.auth_user = user;

        return {token, ...user};

    } catch (error) {
        console.error(error);
        return{error: 'Failed to authenticate'};
    }
}

export const socket_token_login = (socket: Socket, {token}: {token: string}) => {
    const user = get_user_from_token(token);

    if (user === undefined) {
        return {error: 'Failed to authenticate'};
    }

    socket.auth_user = user;
    return {token, ...user};
};

export const socket_logout = (socket: Socket) => {
    socket.auth_user = undefined;
    socket.emit(as_response(AuthEvents.LOGOUT), {message: 'Logged out'});
}

declare module "socket.io" {
    interface  Socket {
        auth_user?: User;
    }
}

export const get_socket_user = (socket: Socket): User | undefined => {
    if (socket.auth_user) {
        return socket.auth_user;
    }

    return undefined;
}