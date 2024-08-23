import jwt from "jsonwebtoken";
import {User} from "../request_types/request_types";
import {Socket} from "socket.io";
import {OAuth2Client} from "google-auth-library";
import {NextFunction, Request, Response} from "express";
import axios from "axios";


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

    res.locals.user = user;
    next();
}


export const get_uniqname_from_email = (email: string) => {
    return email.split('@')[0];
}

export const get_jwt_token = (uniqname: string, full_name: string, email: string) => {
    if (process.env.JWT_SECRET == undefined) {
        throw new Error("JWT_SECRET undefined")
    }

    return jwt.sign({ uniqname, full_name, email }, process.env.JWT_SECRET, { expiresIn: '30d' });
}

export const authenticate_with_google = async (access_token: string) => {
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

declare module "socket.io" {
    interface Socket {
        auth_user?: User;
    }
}

export const get_socket_user = (socket: Socket): User | undefined => {
    if (socket.auth_user) {
        return socket.auth_user;
    }

    return undefined;
}