import { Request } from "express"

export interface User {
    uniqname: string;
    full_name: string;
    email: string;
    is_staff: boolean;
}

export interface AuthenticatedRequest extends Request {
    user: User;
}