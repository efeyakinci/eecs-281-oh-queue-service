import { Request } from "express"

export interface User {
    uniqname: string;
    full_name: string;
    email: string;
}

export interface AuthenticatedRequest extends Request {
    user: User;
}