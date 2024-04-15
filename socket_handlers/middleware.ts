import {Socket} from "socket.io";
import {get_socket_user} from "../services/authentication";
import queue_manager from "../queue/QueueManager";
import {OHQueue} from "../queue/OHQueue";
import {Student} from "../queue/QueueTypes";
import {User} from "../request_types/request_types";
import {Expression} from "mongoose";

type Context = {
    [key: string]: any
}

type Error = {
    err: string
}

type Middleware<In extends Context, Out> = (socket: Socket, input: In) => (In & Out) | Error;

function combineTwoMiddleware<A extends Context, B extends Context & C, C extends Context & A, D extends Context & C>(socket: Socket, a: Middleware<A, B>, b: Middleware<C, D>): Middleware<A, D> {

    return (socket, input) => {
        const result = a(socket, input);

        if ('err' in result) {
            throw new Error(result.err);
        }

        const next_result = b(socket, result);

        if ('err' in next_result) {
            throw new Error(next_result.err);
        }

        return next_result;
    }
}

// Because template metaprogramming wasn't cursed enough... now we get to do it in TypeScript
type ChainOutput<Input, T> =
    T extends [Middleware<infer ReqInput, infer A>, ...infer Rest] ?
        Input extends ReqInput ?
            Rest extends [infer Next extends Middleware<any, any>, ...infer Rest2] ?
                A & ChainOutput<Input & A, [Next, ...Rest2]> :
                A :
            never :
        never;


function reduce_middleware<InitialInput extends Context,
    T extends Middleware<any, any>[]>(socket: Socket,
                                      initial_input: InitialInput,
                                      ...middleware: T) {
    type Output = ChainOutput<InitialInput, T>;

    type ReturnType = Output extends InitialInput ? Middleware<InitialInput, Output> : never;

    return middleware.reduce((acc, cur) => combineTwoMiddleware(socket, acc, cur)) as ReturnType;
}

function use_middleware<InitialInput extends Context, T extends Middleware<any, any>[]>(socket: Socket, input: InitialInput, ...middlewares: T) {
    const middleware = reduce_middleware(socket, input, ...middlewares);
    const context = middleware(socket, input);


    if ('err' in context) {
        throw new Error(context.err);
    }

    return context;
}

// function use_middleware<In extends Context, Out extends Context>(socket: Socket, original_request: {
//     [key: string]: any
// }, middleware: Middleware<Context, Out>) {
//     const result = middleware(socket, original_request);
//
//     if ('err' in result) {
//         throw new Error(result.err);
//     }
//
//     return result;
// }




type RequiresUserOutput = {
    user: User
} & Context
const requires_user: Middleware<Context, RequiresUserOutput> = (socket, context) => {
    const user = get_socket_user(socket);

    if (!user) {
        throw new Error('User not found');
    }

    return {
        ...context,
        user
    };

}

type RequiresStaffOutput = {
    user: User
} & Context
const requires_staff: Middleware<Context, RequiresStaffOutput> = (socket, context) => {
    const user = get_socket_user(socket);

    if (!user || !user.is_staff) {
        throw new Error('User is not staff');
    }

    return {
        ...context,
        user
    };
}


type RequiresQueueInput = {
    queue_id: string
} & Context;

type RequiresQueueOutput = {
    queue_id: string,
    queue: OHQueue<Student>
}
const requires_queue: Middleware<RequiresQueueInput, Context & RequiresQueueOutput> = (socket, context) => {
    const {queue_id} = context;

    const queue = queue_manager.queues.get(queue_id);
    if (!queue) {
        return {err: 'Queue not found'};
    }

    return {
        ...context,
        queue_id,
        queue
    };
}

type RequiresStudentInput = {
    student_uid: string,
    queue: OHQueue<Student>
} & Context;
type RequiresStudentOutput = {
    student: Student
}
const requires_student: Middleware<RequiresStudentInput, RequiresStudentOutput> = (socket: Socket, context: RequiresStudentInput)  => {
    const {student_uid, queue} = context;

    const student = queue.get_item_by_id(student_uid);
    if (!student) {
        return {err: 'Student not found'};
    }

    return {
        ...context,
        student
    };
}

export {
    requires_staff,
    requires_user,
    requires_queue,
    requires_student,

    reduce_middleware,
    use_middleware
};